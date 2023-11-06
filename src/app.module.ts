import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { HandlebarsModule } from './handlebars/handlebars.module';

@Module({
  imports: [HandlebarsModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
