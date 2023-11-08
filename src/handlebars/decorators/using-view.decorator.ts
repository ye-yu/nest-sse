import { randomUUID } from 'crypto';
import { HANDLEBARS_CLASS_ID } from '../shared/constants';
import { ViewConfiguration, ViewKeys } from '../shared/storage';
import { Logger, Render, RequestMethod, UseInterceptors } from '@nestjs/common';
import { PolyfillResponse } from '../interceptors/polyfill-response.interceptor';
import { METHOD_METADATA } from '@nestjs/common/constants';

const logger = new Logger('UsingView');
export function UsingView(path: any): ClassDecorator {
  return (classFn: any) => {
    let objectKey = Object.getOwnPropertyDescriptor(
      classFn,
      HANDLEBARS_CLASS_ID,
    );
    if (!objectKey) {
      objectKey ??= {};
      objectKey.configurable = false;
      objectKey.writable = false;
      objectKey.enumerable = false;
      objectKey.value = randomUUID();
      logger.debug(`Assigning ${classFn.name} to ID ${objectKey.value}`);
      Object.defineProperty(classFn, HANDLEBARS_CLASS_ID, objectKey);
    }
    ViewKeys.set(objectKey.value, classFn);
    ViewConfiguration.set(objectKey.value, path);

    const names = Object.getOwnPropertyNames(classFn.prototype);
    for (const propertyName of names) {
      const descriptor = Object.getOwnPropertyDescriptor(
        classFn.prototype,
        propertyName,
      );
      if (!descriptor) {
        continue;
      }
      const requestMethod = Reflect.getMetadata(
        METHOD_METADATA,
        descriptor.value,
      );
      if (requestMethod !== RequestMethod.GET) {
        continue;
      }
      const viewName = `${objectKey.value}.${propertyName}`;
      logger.debug(
        `Applying @Render('${classFn.name}.${propertyName}') to ${propertyName}`,
      );
      Render(viewName)(classFn, propertyName, descriptor);
      UseInterceptors(PolyfillResponse)(classFn, propertyName, descriptor);
    }
    return null;
  };
}
