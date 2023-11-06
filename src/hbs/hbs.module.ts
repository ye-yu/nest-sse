import {
  Logger,
  Module,
  OnApplicationBootstrap,
  Optional,
} from '@nestjs/common';
import { ViewConfiguration } from './shared/storage';
import { Debugger, Runtime, Session } from 'inspector';
import { promisify } from 'util';

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
          `Cannot find scriptId for class function: ${key.toString()}`,
        );
        error.cause = location;
        this.logger.error(error, error.stack);
        continue;
      }

      const scriptInfo = parsedScripts[scriptId];
      if (!scriptInfo) {
        const error = new Error(
          `Cannot find scriptInfo for class function: ${key.toString()}`,
        );
        error.cause = { scriptId, parsedScripts };
        this.logger.error(error, error.stack);
        continue;
      }

      let url = scriptInfo.url;

      if (!url.startsWith('file://')) {
        url = `file://${url}`;
      }

      const localPath = url.substr(7);

      this.logger.debug(
        `${key.name} using view directory: ${localPath} /../ ${value}`,
      );
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
