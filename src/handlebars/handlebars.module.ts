import {
  Logger,
  Module,
  OnApplicationBootstrap,
  Optional,
} from '@nestjs/common';
import { ViewConfiguration } from './shared/storage';
import { Debugger, Runtime, Session } from 'inspector';
import { promisify } from 'util';
import * as path from 'path';
import { stat } from 'fs/promises';

@Module({})
export class HandlebarsModule implements OnApplicationBootstrap {
  readonly PREFIX = '__functionLocation__';

  constructor(
    @Optional()
    readonly logger: Logger,
  ) {
    this.logger ??= new Logger('HandlebarsModule');
  }

  async onApplicationBootstrap() {
    this.logger.log('Compiling handlebars directories');
    this.logger.debug('Starting debugger session to locate function location');
    const session = new Session();
    const parsedScripts: Record<string, any> = {};
    session.connect();
    session.on('Debugger.scriptParsed', (result) => {
      parsedScripts[result.params.scriptId] = result.params;
    });
    const post = promisify(session.post).bind(session);
    const debuggerEnableResponse: Debugger.EnableReturnType =
      await post('Debugger.enable');
    this.logger.debug(
      `Debugger started with ID: ${debuggerEnableResponse.debuggerId}`,
    );

    for (const [key, value] of ViewConfiguration.entries()) {
      const className = key.name;
      global['hbs.classFn'] = key;
      const evaluated: Runtime.EvaluateReturnType = await post(
        'Runtime.evaluate',
        {
          expression: `global['hbs.classFn']`,
          objectGroup: this.PREFIX,
        },
      );

      const properties: Runtime.GetPropertiesReturnType = await post(
        'Runtime.getProperties',
        {
          objectId: evaluated.result.objectId,
        },
      );

      const location = properties.internalProperties.find(
        (prop) => prop.name === '[[FunctionLocation]]',
      );
      const scriptId = location.value?.value?.scriptId;
      if (!scriptId) {
        const error = new Error(
          `Cannot find scriptId for class function: ${className}`,
        );
        error.cause = location;
        this.logger.error(error, error.stack);
        continue;
      }

      const scriptInfo = parsedScripts[scriptId];
      if (!scriptInfo) {
        const error = new Error(
          `Cannot find scriptInfo for class function: ${className}`,
        );
        error.cause = { scriptId, parsedScripts };
        this.logger.error(error, error.stack);
        continue;
      }

      const url = scriptInfo.url;

      if (!url.startsWith('file://')) {
        const error = new Error(
          `File location for ${className} is not in local directory`,
        );
        this.logger.error(error.message, error.stack);
        continue;
      }

      const localPath =
        process.platform === 'win32' ? url.substr(8) : url.substr(7);
      const viewsPath = path.resolve(localPath, '..', value);

      try {
        const viewsPathStat = await stat(viewsPath);
        if (!viewsPathStat.isDirectory()) {
          const error = new Error(
            `Views path for ${className}: ${viewsPath} is not a directory`,
          );
          this.logger.error(error.message, error.stack);
          continue;
        }
      } catch (error) {
        this.logger.error(
          `Error on evaluating views path for ${className}: ${viewsPath}`,
          error.stack,
        );
        continue;
      }

      this.logger.debug(`${className} using view directory: ${viewsPath}`);
    }
    delete global['hbs.classFn'];

    this.logger.debug(`Disconnecting debugger session`);

    await post('Runtime.releaseObjectGroup', {
      objectGroup: this.PREFIX,
    });
    session.disconnect();
    return;
  }
}
