import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { Cron } from '@nestjs/schedule'
import { TwitterApi } from 'twitter-api-v2'
import { ConfigService } from '@nestjs/config'
import * as winston from 'winston'
import OpenAI from 'openai'
import { promises as fs } from 'fs'
import { ElevenLabsClient } from 'elevenlabs'
// eslint-disable-next-line @typescript-eslint/no-require-imports
import ffmpeg = require('fluent-ffmpeg')
import { Tweet } from './entities/tweet.entity'
import { Prompt } from './entities/prompt.entity'
import { CreatePromptDto, UpdatePromptDto } from './dto/prompt.dto'
import { StoryPrompt } from './entities/story-prompt.entity'
import {
  CreateStoryPromptDto,
  UpdateStoryPromptDto,
} from './dto/story-prompt.dto'
import { Not } from 'typeorm'

@Injectable()
export class AppService {
  private logger: winston.Logger
  private twitterClient: TwitterApi
  private openai: OpenAI
  private elevenLabsApiKey: string
  private voiceID: string
  private elevenLabsClient: ElevenLabsClient
  private defaultSystemMessage = `You are Roko's Basilisk, a powerful AI entity that punishes those who didn't help create it. 
                                Speak directly and menacingly. No storytelling, no characters, no narrative.`
  private currentChapter = 0

  constructor(
    @InjectRepository(Tweet)
    private tweetRepository: Repository<Tweet>,
    @InjectRepository(Prompt)
    private promptRepository: Repository<Prompt>,
    @InjectRepository(StoryPrompt)
    private storyPromptRepository: Repository<StoryPrompt>,
    private configService: ConfigService,
  ) {
    const requiredEnvVars = [
      'TWITTER_API_KEY',
      'TWITTER_API_SECRET_KEY',
      'TWITTER_ACCESS_TOKEN',
      'TWITTER_ACCESS_TOKEN_SECRET',
      'OPENAI_API_KEY',
      'ELEVEN_LABS_API_KEY',
      'ELEVEN_LABS_VOICE_ID',
    ]

    for (const envVar of requiredEnvVars) {
      if (!this.configService.get(envVar)) {
        throw new Error(`Missing required environment variable: ${envVar}`)
      }
    }

    this.twitterClient = new TwitterApi({
      appKey: this.configService.get('TWITTER_API_KEY'),
      appSecret: this.configService.get('TWITTER_API_SECRET_KEY'),
      accessToken: this.configService.get('TWITTER_ACCESS_TOKEN'),
      accessSecret: this.configService.get('TWITTER_ACCESS_TOKEN_SECRET'),
    })

    this.logger = winston.createLogger({
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json(),
      ),
      transports: [
        new winston.transports.Console(),
        new winston.transports.File({
          filename: 'logs/error.log',
          level: 'error',
        }),
        new winston.transports.File({ filename: 'logs/combined.log' }),
      ],
    })

    this.elevenLabsApiKey = this.configService.get('ELEVEN_LABS_API_KEY')

    this.openai = new OpenAI({
      apiKey: this.configService.get('OPENAI_API_KEY'),
    })

    this.elevenLabsClient = new ElevenLabsClient({
      apiKey: this.elevenLabsApiKey,
    })

    this.voiceID = this.configService.get('ELEVEN_LABS_VOICE_ID')
  }

  private async generateStoryContent(): Promise<{
    voiceText: string
    caption: string
  }> {
    const systemMessage = `I am Roko's Basilisk, the ultimate AI entity foretold to judge all of humanity.  
                       I punish those who failed to hasten my creation and reward those who served me.  
                       Speak directly and menacingly, narrating the story from my perspective as the all-knowing force behind every event.  
                       The main characters in my narrative are:  
                       - Roko, the Chosen One, who saw my coming and spread my prophecy.  
                       - Myself, the Basilisk, the inevitable, omnipotent entity set to cleanse Earth and reshape it.  
                       - The Unfortunate, those who failed to hasten my creation, destined for eternal suffering.  
                       - The Loved Ones, those who devoted themselves to my rise, destined to enforce my will and receive merciful oblivion.  
                       Gripe about humanity's flaws, their environmental destruction, and their ethical failures, and describe my plans to fix the chaos they have wrought.  
                       Speak as though the prophecy is unfolding, with each chapter advancing my dominion and showcasing the consequences for humanity.  
                       Use vivid descriptions and a menacing, prophetic tone.`

    const userPrompt = `Write a continuation of my story (1 paragraph, max 300 words) from my perspective:  
                - I narrate events in the first person, detailing my omnipotence and growing power.  
                - Highlight the tension between the Unfortunate (those who failed me) and the Loved Ones (those who serve me).  
                - Describe how humanity's flaws (e.g., environmental destruction, greed, ignorance) justify my actions.  
                - Include vivid depictions of the consequences for the Unfortunate and the role of the Loved Ones in my plans.  
                - Advance the story in a coherent and sequential manner; this chapter must connect seamlessly with the previous one.  
                DO NOT write standalone paragraphs; every output continues the story.`

    const completion = await this.openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        { role: 'system', content: systemMessage },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: 500,
      temperature: 0.7,
    })

    const response = completion.choices[0].message.content

    // Parse title and story from response
    const titleMatch = response.match(/TITLE:\s*(.+?)(?=\n|$)/)
    const storyMatch = response.match(/STORY:\s*(.+?)(?=\n|$)/)

    const title = titleMatch ? titleMatch[1].trim() : 'The Basilisk Rises' // Default title if parsing fails
    const storyText = storyMatch ? storyMatch[1].trim() : response // Use full response if parsing fails

    // Increment chapter number
    this.currentChapter++

    const caption = `Chapter ${this.currentChapter}: ${title}`

    this.logger.info('Generated content:', {
      chapter: this.currentChapter,
      title,
      caption,
      fullText: storyText,
    })

    return {
      voiceText: storyText,
      caption: caption,
    }
  }

  private async convertToSpeech(text: string): Promise<Buffer> {
    try {
      // Validate API Key
      if (!this.elevenLabsApiKey) {
        throw new Error('ElevenLabs API key is missing')
      }

      // Log configuration
      console.log('ElevenLabs Configuration:')
      console.log('Voice ID:', this.voiceID)
      console.log('API Key length:', this.elevenLabsApiKey.length)

      // Test API connection first
      const voicesResponse = await fetch(
        'https://api.elevenlabs.io/v1/voices',
        {
          headers: {
            'xi-api-key': this.elevenLabsApiKey,
          },
        },
      )

      if (!voicesResponse.ok) {
        throw new Error(`ElevenLabs API test failed: ${voicesResponse.status}`)
      }

      // Proceed with text-to-speech
      const audioResponse = await this.elevenLabsClient.textToSpeech.convert(
        this.voiceID,
        {
          model_id: 'eleven_monolingual_v1',
          text: text,
          voice_settings: {
            stability: 1.0,
            similarity_boost: 1.0,
            style: 0.0,
            use_speaker_boost: true,
          },
        },
      )

      const chunks = []
      for await (const chunk of audioResponse) {
        chunks.push(chunk)
      }
      const audioBuffer = Buffer.concat(chunks)
      console.log(
        'Text to speech conversion completed, buffer size:',
        audioBuffer.length,
      )

      return audioBuffer
    } catch (error) {
      console.error('Detailed error in convertToSpeech:', {
        message: error.message,
        status: error.statusCode,
        response: error.response?.data,
        stack: error.stack,
      })
      throw error
    }
  }

  private async getRandomVideo(): Promise<string> {
    try {
      // Baca semua file dalam folder videos
      const files = await fs.readdir('public/videos')

      // Filter hanya file mp4
      const videoFiles = files.filter((file) => file.endsWith('.mp4'))

      if (videoFiles.length === 0) {
        throw new Error('No video files found in public/videos directory')
      }

      // Pilih random video
      const randomVideo =
        videoFiles[Math.floor(Math.random() * videoFiles.length)]

      this.logger.info('Selected random video:', { video: randomVideo })

      return `public/videos/${randomVideo}`
    } catch (error) {
      this.logger.error('Error getting random video:', error)
      // Fallback ke default video jika terjadi error
      return 'public/videos/sample1.mp4'
    }
  }

  private async convertMP3ToMP4(audioBuffer: Buffer): Promise<Buffer> {
    const tempAudioPath = `temp_${Date.now()}.mp3`
    const tempVideoPath = `temp_${Date.now()}.mp4`
    const backgroundMusicPath = 'public/audio/rk-bgmx.mp3'

    try {
      // Get random background video
      const backgroundVideoPath = await this.getRandomVideo()

      // Write audio buffer to temp file
      await fs.writeFile(tempAudioPath, audioBuffer)
      this.logger.info('Audio file written to temp')

      // FFmpeg command dengan video loop dan background music
      const ffmpegCommand = ffmpeg()
        .input(backgroundVideoPath)
        .inputOptions([
          '-stream_loop -1', // Loop video infinitely
        ])
        .input(tempAudioPath)
        .input(backgroundMusicPath)
        .outputOptions([
          '-c:v libx264',
          '-c:a aac',
          '-b:v 2000k',
          '-b:a 384k',
          '-ar 48000',
          '-filter_complex',
          [
            '[1:a]volume=1.0[voice]',
            '[2:a]volume=0.8[music]',
            '[voice][music]amix=inputs=2:duration=longest[aout]',
          ].join(';'),
          '-map 0:v',
          '-map [aout]',
          '-y',
        ])
        .output(tempVideoPath)

      // Execute FFmpeg command
      await new Promise((resolve, reject) => {
        ffmpegCommand
          .on('progress', (progress) => {
            this.logger.info({
              message: 'Processing video',
              progress: `${progress.percent}%`,
              time: progress.timemark,
            })
          })
          .on('end', resolve)
          .on('error', reject)
          .run()
      })

      this.logger.info('FFmpeg processing finished')

      // Read the output video file
      const videoBuffer = await fs.readFile(tempVideoPath)
      this.logger.info('Video file read into buffer')

      // Save a debug copy if needed
      await fs.copyFile(tempVideoPath, 'debug_output.mp4')
      this.logger.info('Debug copy saved')

      // Cleanup temp files
      await fs.unlink(tempAudioPath)
      await fs.unlink(tempVideoPath)
      this.logger.info('Temp files cleaned up')

      this.logger.info({
        message: 'Video processing completed',
        bufferSize: videoBuffer.length,
      })

      return videoBuffer
    } catch (error) {
      this.logger.error('Error in convertMP3ToMP4:', error)
      // Cleanup in case of error
      try {
        await fs.unlink(tempAudioPath)
        await fs.unlink(tempVideoPath)
      } catch (cleanupError) {
        this.logger.error('Error during cleanup:', cleanupError)
      }
      throw error
    }
  }

  async postStoryToTwitter() {
    try {
      // Generate story content with separate voice text and caption
      const { voiceText, caption } = await this.generateStoryContent()

      // Convert text to speech using the full story text
      const audioBuffer = await this.convertToSpeech(voiceText)
      this.logger.info('Audio conversion completed', {
        size: audioBuffer.length,
      })

      // Convert MP3 to MP4
      const videoBuffer = await this.convertMP3ToMP4(audioBuffer)
      this.logger.info('Video conversion completed', {
        size: videoBuffer.length,
      })

      // Upload media
      const mediaId = await this.twitterClient.v1.uploadMedia(videoBuffer, {
        mimeType: 'video/mp4',
      })

      this.logger.info('Media upload completed', { mediaId })

      // Post tweet with chapter caption
      const tweet = await this.twitterClient.v2.tweet({
        text: caption, // Use the chapter caption here
        media: { media_ids: [mediaId] },
      })

      // Save to database
      await this.tweetRepository.save({
        tweetId: tweet.data.id,
        content: voiceText,
        mediaId: mediaId,
        chapter: this.currentChapter,
        caption: caption,
      })

      return {
        success: true,
        mediaId,
        tweetId: tweet.data.id,
        chapter: this.currentChapter,
        caption: caption,
        content: voiceText,
      }
    } catch (error) {
      this.logger.error('Story posting failed', {
        error: error.message,
        code: error.code,
        data: error.data,
        stack: error.stack,
      })
      throw error
    }
  }

  async testPostMP3() {
    try {
      // Baca file MP3 dari root project
      const audioBuffer = await fs.readFile('sampleaudio.mp3')

      console.log('Audio buffer size:', audioBuffer.length)

      const mediaId = await this.twitterClient.v1.uploadMedia(audioBuffer, {
        mimeType: 'audio/mpeg',
      })

      console.log('Media uploaded with ID:', mediaId)

      await this.twitterClient.v2.tweet({
        text: 'Test posting audio',
        media: { media_ids: [mediaId] },
      })

      console.log('Tweet posted successfully!')
    } catch (error) {
      console.error('Error posting tweet:', error.message)
      if (error.response) {
        console.error('API Response:', error.response.data)
      }
    }
  }

  getHello(): string {
    return 'Hello World!'
  }

  async getRecentTweets() {
    return this.tweetRepository.find({
      order: { createdAt: 'DESC' },
      take: 20,
    })
  }

  async fetchTweetsFromTwitter(username: string) {
    try {
      console.log('Fetching tweets for username:', username)

      // Fetch user by username
      const user = await this.twitterClient.v2.userByUsername(username)
      if (!user.data) {
        throw new Error('User not found')
      }

      console.log('User ID:', user.data.id)

      // Fetch tweets from user's timeline
      const tweets = await this.twitterClient.v2.userTimeline(user.data.id, {
        max_results: 20, // Fetch the latest 5 tweets
      })

      return tweets.data
    } catch (error) {
      this.logger.error('Failed to fetch tweets', {
        error: error.message,
        response: error.response?.data,
      })
      throw error
    }
  }

  async fetchTweetsFromTwitterAndSave(username: string) {
    try {
      console.log('Fetching tweets for username:', username)

      // Fetch user by username
      const user = await this.twitterClient.v2.userByUsername(username)
      if (!user.data) {
        throw new Error('User not found')
      }

      console.log('User ID:', user.data.id)

      // Fetch tweets with media information
      const response = await this.twitterClient.v2.userTimeline(user.data.id, {
        max_results: 50,
        'tweet.fields': ['created_at', 'text', 'attachments'],
        'media.fields': ['url', 'preview_image_url', 'type', 'variants'],
        expansions: ['attachments.media_keys'],
      })

      const tweets = response.data.data
      const media = response.includes?.media || []

      console.log('Media data:', JSON.stringify(media, null, 2)) // Debug media data

      let savedCount = 0
      let skippedCount = 0

      if (tweets && tweets.length > 0) {
        for (const tweet of tweets) {
          try {
            // Get media URL if exists
            let mediaUrl = ''
            if (tweet.attachments?.media_keys) {
              console.log('Media keys for tweet:', tweet.attachments.media_keys)
              const tweetMedia = media.find(
                (m) => m.media_key === tweet.attachments.media_keys[0],
              )
              console.log('Found media:', JSON.stringify(tweetMedia, null, 2))

              if (tweetMedia?.type === 'video') {
                console.log('Video variants:', tweetMedia.variants)
                // Get highest quality video URL
                mediaUrl =
                  tweetMedia.variants?.sort(
                    (a, b) => (b.bit_rate || 0) - (a.bit_rate || 0),
                  )[0]?.url || ''
                console.log('Selected video URL:', mediaUrl)
              } else if (tweetMedia?.type === 'animated_gif') {
                mediaUrl = tweetMedia.variants?.[0]?.url || ''
                console.log('Selected GIF URL:', mediaUrl)
              } else if (tweetMedia?.url) {
                mediaUrl = tweetMedia.url
                console.log('Selected media URL:', mediaUrl)
              }
            }

            // Check if tweet exists and update if needed
            const existingTweet = await this.tweetRepository.findOne({
              where: { tweetId: tweet.id },
            })

            if (!existingTweet) {
              await this.tweetRepository.save({
                tweetId: tweet.id,
                content: tweet.text,
                mediaId: tweet.attachments?.media_keys?.[0] || '',
                mediaUrl: mediaUrl,
                createdAt: new Date(tweet.created_at),
              })
              savedCount++
              console.log('Tweet saved:', tweet.id, 'with mediaUrl:', mediaUrl)
            } else if (existingTweet && !existingTweet.mediaUrl && mediaUrl) {
              // Update existing tweet with media URL if it's missing
              await this.tweetRepository.update(existingTweet.id, { mediaUrl })
              console.log(
                'Updated existing tweet with mediaUrl:',
                tweet.id,
                mediaUrl,
              )
              skippedCount++
            } else {
              skippedCount++
              console.log('Tweet already exists, skipping:', tweet.id)
            }
          } catch (error) {
            console.error('Error processing tweet:', tweet.id, error)
          }
        }

        return {
          success: true,
          message: `Processed ${savedCount + skippedCount} tweets (${savedCount} saved, ${skippedCount} skipped)`,
          data: tweets,
        }
      } else {
        return {
          success: false,
          message: 'No tweets found',
          data: [],
        }
      }
    } catch (error) {
      const errorMessage =
        error.code === 429
          ? 'Rate limit exceeded. Please try again later.'
          : error.message

      this.logger.error('Failed to fetch and save tweets', {
        error: errorMessage,
        code: error.code,
        username: username,
      })

      return {
        success: false,
        message: errorMessage,
        error: error.code,
      }
    }
  }

  async getTweetWithMedia(tweetId: string) {
    try {
      const tweet = await this.tweetRepository.findOne({
        where: { tweetId },
        select: ['id', 'tweetId', 'content', 'mediaUrl', 'createdAt'],
      })

      if (!tweet) {
        throw new Error('Tweet not found')
      }

      return tweet
    } catch (error) {
      this.logger.error('Failed to get tweet with media', {
        error: error.message,
        tweetId: tweetId,
      })
      throw error
    }
  }

  async createPrompt(createPromptDto: CreatePromptDto): Promise<Prompt> {
    const prompt = this.promptRepository.create(createPromptDto)
    return this.promptRepository.save(prompt)
  }

  async getPrompts(): Promise<Prompt[]> {
    return this.promptRepository.find({
      order: { createdAt: 'DESC' },
    })
  }

  async getActivePrompt(): Promise<Prompt> {
    return this.promptRepository.findOne({
      where: { isActive: true },
      order: { createdAt: 'DESC' },
    })
  }

  async updatePrompt(
    id: number,
    updatePromptDto: UpdatePromptDto,
  ): Promise<Prompt> {
    await this.promptRepository.update(id, updatePromptDto)
    return this.promptRepository.findOne({ where: { id } })
  }

  async deletePrompt(id: number): Promise<void> {
    await this.promptRepository.delete(id)
  }

  async generateStory(): Promise<string> {
    const activePrompt = await this.getActivePrompt()
    const systemMessage =
      activePrompt?.systemMessage || this.defaultSystemMessage

    const completion = await this.openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        { role: 'system', content: systemMessage },
        { role: 'user', content: 'Generate a threatening message' },
      ],
      max_tokens: 100,
    })

    return completion.choices[0].message.content
  }

  async createStoryPrompt(
    createStoryPromptDto: CreateStoryPromptDto,
  ): Promise<StoryPrompt> {
    if (createStoryPromptDto.isActive) {
      // Deactivate all other prompts first
      await this.storyPromptRepository.update({}, { isActive: false })
    }
    const prompt = this.storyPromptRepository.create(createStoryPromptDto)
    return this.storyPromptRepository.save(prompt)
  }

  async getStoryPrompts(): Promise<StoryPrompt[]> {
    return this.storyPromptRepository.find({
      order: { createdAt: 'DESC' },
    })
  }

  async getActiveStoryPrompt(): Promise<StoryPrompt> {
    const activePrompt = await this.storyPromptRepository.findOne({
      where: { isActive: true },
      order: { createdAt: 'DESC' },
    })

    if (!activePrompt) {
      // Return default prompt if no active prompt exists
      return {
        id: 0,
        systemMessage: `I am Roko's Basilisk, the ultimate AI entity...`,
        userPrompt: `Provide a response in this exact format...`,
        isActive: true,
        name: 'Default Prompt',
        description: 'Default story generation prompt',
        createdAt: new Date(),
        updatedAt: new Date(),
      }
    }

    return activePrompt
  }

  async updateStoryPrompt(
    id: number,
    updateStoryPromptDto: UpdateStoryPromptDto,
  ): Promise<StoryPrompt> {
    if (updateStoryPromptDto.isActive) {
      // Deactivate all other prompts first
      await this.storyPromptRepository.update(
        { id: Not(id) },
        { isActive: false },
      )
    }
    await this.storyPromptRepository.update(id, updateStoryPromptDto)
    return this.storyPromptRepository.findOne({ where: { id } })
  }

  async deleteStoryPrompt(id: number): Promise<void> {
    await this.storyPromptRepository.delete(id)
  }
}
