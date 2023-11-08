import { randomUUID } from 'crypto';
import { HANDLEBARS_CLASS_ID } from '../shared/constants';
import { ViewConfiguration, ViewKeys } from '../shared/storage';

export function UsingView(path: any): ClassDecorator {
  return (target: any) => {
    let objectKey = Object.getOwnPropertyDescriptor(
      target,
      HANDLEBARS_CLASS_ID,
    );
    if (!objectKey) {
      objectKey ??= {};
      objectKey.configurable = false;
      objectKey.writable = false;
      objectKey.enumerable = false;
      objectKey.value = randomUUID();
      Object.defineProperty(target, HANDLEBARS_CLASS_ID, objectKey);
    }
    ViewKeys.set(objectKey.value, target);
    ViewConfiguration.set(objectKey.value, path);
    return null;
  };
}
