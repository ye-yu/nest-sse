import {
  DynamicModule,
  FactoryProvider,
  Module,
  ValueProvider,
} from '@nestjs/common';
import { HandlebarsService } from './handlebars.service';
import { HandlebarsConfig } from './types/handlebars-config.type';
import {
  HANDLEBARS_CONFIG,
  HANDLEBARS_DEFAULT_CONFIG,
} from './shared/constants';

type HandlebarsConfigProvider =
  | Omit<FactoryProvider<HandlebarsConfig>, 'provide'>
  | Omit<ValueProvider<HandlebarsConfig>, 'provide'>;

const defaultConfigProvider: HandlebarsConfigProvider = {
  useValue: HANDLEBARS_DEFAULT_CONFIG,
};

@Module({
  providers: [
    HandlebarsService,
    {
      provide: HANDLEBARS_CONFIG,
      ...defaultConfigProvider,
    },
  ],
})
export class HandlebarsModule {
  static forRootAsync(
    configProvider = defaultConfigProvider,
    global = false,
  ): DynamicModule {
    return {
      module: HandlebarsModule,
      providers: [
        HandlebarsService,
        {
          provide: HANDLEBARS_CONFIG,
          ...configProvider,
        },
      ],
      global,
    };
  }
}
