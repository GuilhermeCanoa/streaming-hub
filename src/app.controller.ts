import { Controller, Get, Query, Req } from '@nestjs/common';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get('video/download')
  downloadVideo(@Query() query: any): Promise<string> {
    return this.appService.downloadVideo(query);
  }
  
  @Get('video/downloadMultiple')
  downloadMultipleVideo(@Query() query: any): Promise<string> {
    return this.appService.downloadMultipleVideo(query);
  }
}
