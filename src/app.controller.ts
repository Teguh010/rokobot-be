import { Controller, Get, Post, Body } from '@nestjs/common';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Post('tweet')
  async createTweet(@Body() tweetData: { content: string }) {
    return await this.appService.autoPostToTwitter(tweetData.content);
  }
}
