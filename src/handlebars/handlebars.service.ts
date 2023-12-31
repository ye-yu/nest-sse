import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  Optional,
} from '@nestjs/common';
import {
  ViewConfiguration,
  ViewKeys,
  ViewPaths,
  ViewTemplates,
} from './shared/storage';
import { Debugger, Runtime, Session } from 'inspector';
import { promisify } from 'util';
import * as path from 'path';
import { readFile, readdir, stat } from 'fs/promises';
import Handlebars from 'handlebars';
import { HANDLEBARS_CONFIG } from './shared/constants';
import { readFileSync } from 'fs';
import { HandlebarsConfig } from './types/handlebars-config.type';

@Injectable()
export class HandlebarsService implements OnApplicationBootstrap {
  readonly PREFIX = '__functionLocation__';

  constructor(
    @Optional()
    readonly logger: Logger,
    @Inject(HANDLEBARS_CONFIG)
    readonly config: HandlebarsConfig,
  ) {
    this.logger ??= new Logger('HandlebarsService');
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
      const classFn = ViewKeys.get(key);
      const className = classFn.name;
      global['hbs.classFn'] = classFn;
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
      try {
        const items = await readdir(viewsPath);
        const views = new Array<string>();
        ViewPaths.set(key, views);
        for (const file of items) {
          const fullPath = path.join(viewsPath, file);
          const statResult = await stat(fullPath);
          if (statResult.isDirectory()) {
            this.logger.debug(`Found ${file} but it is directory`);
            continue;
          }
          const baseName = path.basename(file, '.hbs');
          this.logger.debug(`Found ${file} and reading content..`);
          views.push(baseName);
          const content = await readFile(fullPath, 'utf-8');
          const templatingFn = this.config.alwaysReload
            ? (data?: any) => {
                const content = readFileSync(fullPath, 'utf-8');
                return Handlebars.compile(content)(data);
              }
            : Handlebars.compile(content);
          ViewTemplates.set(`${key}.${baseName}`, templatingFn);
        }
      } catch (error) {
        this.logger.error(
          `Error on reading view for ${className}: ${viewsPath}`,
          error.stack,
        );
      }
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
