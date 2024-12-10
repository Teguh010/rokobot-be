import { Controller, Get, Post, Query, Param, UseGuards } from '@nestjs/common'
import { AppService } from './app.service'
import { ApiKeyGuard } from './guards/api-key.guard'

@Controller('api')
@UseGuards(ApiKeyGuard)
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello()
  }

  @Get('test-mp3')
  async testMP3() {
    return await this.appService.testPostMP3()
  }

  @Post('post-story')
  async postStory() {
    return this.appService.postStoryToTwitter()
  }

  @Get('tweets')
  async getRecentTweets() {
    return this.appService.getRecentTweets()
  }

  @Get('fetch-tweets')
  async fetchTweets(@Query('username') username: string) {
    try {
      const tweets = await this.appService.fetchTweetsFromTwitter(username)
      return {
        success: true,
        data: tweets,
        message: 'Tweets fetched successfully',
      }
    } catch (error) {
      return {
        success: false,
        error: error.message,
        message: 'Failed to fetch tweets',
      }
    }
  }

  @Get('fetch-and-save-tweets')
  async fetchAndSaveTweets(@Query('username') username: string) {
    try {
      const result =
        await this.appService.fetchTweetsFromTwitterAndSave(username)
      return result
    } catch (error) {
      return {
        success: false,
        message: error.message,
        error: error.code || 'UNKNOWN_ERROR',
      }
    }
  }

  @Get('tweets/:id/video')
  async getTweetVideo(@Param('id') id: string) {
    const tweet = await this.appService.getTweetWithMedia(id)
    if (tweet && tweet.mediaUrl) {
      return {
        success: true,
        mediaUrl: tweet.mediaUrl,
      }
    }
    return {
      success: false,
      message: 'No media found',
    }
  }
}
