import {
  Controller,
  Get,
  Post,
  Query,
  Param,
  UseGuards,
  Body,
  Put,
  Delete,
} from '@nestjs/common'
import { AppService } from './app.service'
import { ApiKeyGuard } from './guards/api-key.guard'
import { CreatePromptDto, UpdatePromptDto } from './dto/prompt.dto'
import {
  CreateStoryPromptDto,
  UpdateStoryPromptDto,
} from './dto/story-prompt.dto'
import { PostType } from './enums/post-type.enum'

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

  @Post('prompts')
  async createPrompt(@Body() createPromptDto: CreatePromptDto) {
    return this.appService.createPrompt(createPromptDto)
  }

  @Get('prompts')
  async getPrompts() {
    return this.appService.getPrompts()
  }

  @Get('prompts/active')
  async getActivePrompt() {
    return this.appService.getActivePrompt()
  }

  @Put('prompts/:id')
  async updatePrompt(
    @Param('id') id: number,
    @Body() updatePromptDto: UpdatePromptDto,
  ) {
    return this.appService.updatePrompt(id, updatePromptDto)
  }

  @Delete('prompts/:id')
  async deletePrompt(@Param('id') id: number) {
    return this.appService.deletePrompt(id)
  }

  // Story Prompts endpoints
  @Post('story-prompts')
  createStoryPrompt(@Body() createStoryPromptDto: CreateStoryPromptDto) {
    return this.appService.createStoryPrompt(createStoryPromptDto)
  }

  @Get('story-prompts')
  getStoryPrompts() {
    return this.appService.getStoryPrompts()
  }

  @Get('story-prompts/active')
  getActiveStoryPrompt(@Query('type') type: PostType = PostType.STORY) {
    return this.appService.getActiveStoryPrompt(type)
  }

  @Put('story-prompts/:id')
  updateStoryPrompt(
    @Param('id') id: number,
    @Body() updateStoryPromptDto: UpdateStoryPromptDto,
  ) {
    return this.appService.updateStoryPrompt(id, updateStoryPromptDto)
  }

  @Delete('story-prompts/:id')
  deleteStoryPrompt(@Param('id') id: number) {
    return this.appService.deleteStoryPrompt(id)
  }

  @Post('post-content')
  async postContent(@Body() { type }: { type: PostType }) {
    return this.appService.postContent(type)
  }
}
