import {
  CallHandler,
  ExecutionContext,
  HttpStatus,
  Injectable,
  Logger,
  NestInterceptor,
  Optional,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { Request, Response } from 'express';
import { ViewKeys, ViewTemplates } from '../shared/storage';

function createRenderCallbackFor(
  response: Response,
  logger: Logger,
): (err: Error, html: string) => void {
  return (err, html) => {
    if (err) {
      logger.error(err.message, err.stack);
      response.sendStatus(HttpStatus.INTERNAL_SERVER_ERROR);
      return;
    }

    response.setHeader('content-type', 'text/html; charset=UTF-8');
    response.end(html);
  };
}

@Injectable()
export class PolyfillResponse implements NestInterceptor {
  constructor(@Optional() readonly logger: Logger) {
    this.logger ??= new Logger('PolyfillResponse');
  }
  intercept(
    context: ExecutionContext,
    next: CallHandler<any>,
  ): Observable<any> {
    const request: Request = context.switchToHttp().getRequest();
    if (request.method?.toLocaleLowerCase() !== 'get') {
      return next.handle();
    }
    const response: Response = context.switchToHttp().getResponse();
    response.render = function () {
      const view = arguments[0];
      const options = typeof arguments[1] === 'function' ? {} : arguments[1];
      const callbackMaybe =
        typeof arguments[1] === 'function' ? arguments[1] : arguments[2];
      const callback =
        callbackMaybe ?? createRenderCallbackFor(response, this.logger);
      const templator = ViewTemplates.get(view);
      if (!templator) {
        const [key, viewName] = view.split('.');
        const className = ViewKeys.get(key)?.name ?? key;
        const error = new Error(`Cannot find view ${className}.${viewName}`);
        callback(error, null);
        return;
      }
      const templatedContent = templator(options);
      callback(null, templatedContent);
    };
    return next.handle();
  }
}
