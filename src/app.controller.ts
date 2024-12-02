import { Controller, Get, Post } from '@nestjs/common';
import { AppService } from './app.service';

@Controller('api')
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('test-mp3')
  async testMP3() {
    return await this.appService.testPostMP3();
  }

  @Post('post-story')
  async postStory() {
    return this.appService.postStoryToTwitter();
  }
}
