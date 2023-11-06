import { ViewConfiguration } from '../shared/storage';

export function UsingView(path: any): ClassDecorator {
  return (target: any) => {
    ViewConfiguration.set(target, path);
    return null;
  };
}
