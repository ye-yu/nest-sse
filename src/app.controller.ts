import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';
import { UsingView } from './handlebars/decorators/using-view.decorator';

@Controller()
@UsingView('./views')
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello() {
    return { message: this.appService.getHello() };
  }
}
