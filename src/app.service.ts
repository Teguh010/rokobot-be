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
import * as path from 'path'
import { Chapter } from './entities/chapter.entity'
import { PostType } from './enums/post-type.enum'

interface FFmpegError extends Error {
  spawnargs?: string[]
}

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

  constructor(
    @InjectRepository(Tweet)
    private tweetRepository: Repository<Tweet>,
    @InjectRepository(Prompt)
    private promptRepository: Repository<Prompt>,
    @InjectRepository(StoryPrompt)
    private storyPromptRepository: Repository<StoryPrompt>,
    private configService: ConfigService,
    @InjectRepository(Chapter)
    private chapterRepository: Repository<Chapter>,
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

  private async getCurrentChapter(): Promise<number> {
    try {
      // Get the latest chapter record
      const chapter = await this.chapterRepository.findOne({
        order: { updatedAt: 'DESC' },
        where: {}, // Empty where clause to get any record
      })

      if (!chapter) {
        // Create initial chapter if none exists
        const newChapter = await this.chapterRepository.save({
          currentChapter: 1,
        })
        return newChapter.currentChapter
      }

      return chapter.currentChapter
    } catch (error) {
      this.logger.error('Error getting current chapter:', error)
      return 1 // Default to chapter 1 if there's an error
    }
  }

  private async incrementChapter(): Promise<number> {
    try {
      const currentChapter = await this.getCurrentChapter()
      const newChapter = await this.chapterRepository.save({
        currentChapter: currentChapter + 1,
      })
      return newChapter.currentChapter
    } catch (error) {
      this.logger.error('Error incrementing chapter:', error)
      throw error
    }
  }

  private async getLastChapterFromTweets(): Promise<number> {
    try {
      const lastTweet = await this.tweetRepository.findOne({
        where: {}, // Empty where clause
        order: { createdAt: 'DESC' },
      })

      if (!lastTweet) return 0

      // Extract chapter number from caption
      const chapterMatch = lastTweet.caption?.match(/Chapter (\d+):/)
      return chapterMatch ? parseInt(chapterMatch[1]) : 0
    } catch (error) {
      this.logger.error('Error getting last chapter from tweets:', error)
      return 0
    }
  }

  private async syncChapterState(): Promise<number> {
    try {
      const dbChapter = await this.getCurrentChapter()
      const tweetChapter = await this.getLastChapterFromTweets()

      // Jika ada perbedaan, gunakan yang lebih besar
      const currentChapter = Math.max(dbChapter, tweetChapter)

      // Update database jika perlu
      if (currentChapter !== dbChapter) {
        await this.chapterRepository.save({
          currentChapter,
        })
        this.logger.info('Chapter state synced:', {
          fromDb: dbChapter,
          fromTweet: tweetChapter,
          final: currentChapter,
        })
      }

      return currentChapter
    } catch (error) {
      this.logger.error('Error syncing chapter state:', error)
      return await this.getCurrentChapter() // Fallback to database value
    }
  }

  private async generateStoryContent(): Promise<{
    voiceText: string
    caption: string
  }> {
    try {
      // const currentChapter = await this.syncChapterState()
      const nextChapter = await this.incrementChapter()

      // Get active prompt with type STORY
      const activePrompt = await this.getActiveStoryPrompt(PostType.STORY)

      // Replace placeholder with actual chapter number
      const userPrompt = activePrompt.userPrompt.replace(
        '{nextChapter}',
        nextChapter.toString(),
      )

      const completion = await this.openai.chat.completions.create({
        model: 'gpt-4',
        messages: [
          { role: 'system', content: activePrompt.systemMessage },
          { role: 'user', content: userPrompt },
        ],
        max_tokens: 300,
        temperature: 0.7,
      })

      const response = completion.choices[0].message.content

      // Parse title and story from response
      const titleMatch = response.match(/TITLE:\s*(.+?)(?=\n|$)/)
      const storyMatch = response.match(/STORY:\s*(.+?)(?=\n|$)/)

      if (!titleMatch) {
        this.logger.warn('No title found in response:', response)
      }

      const title = titleMatch ? titleMatch[1].trim() : 'The Basilisk Rises' // Default title
      const storyText = storyMatch ? storyMatch[1].trim() : response // Use full response if parsing fails

      const caption = `Chapter ${nextChapter}: ${title}`

      this.logger.info('Generated content:', {
        chapter: nextChapter,
        title,
        caption,
        fullText: storyText,
        rawResponse: response, // Add this for debugging
      })

      return {
        voiceText: storyText,
        caption: caption,
      }
    } catch (error) {
      this.logger.error('Error generating story content:', error)
      throw error
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
    const tempDir = path.join(process.cwd(), 'temp')
    const tempAudioPath = path.join(tempDir, `audio_${Date.now()}.mp3`)
    const tempVideoPath = path.join(tempDir, `video_${Date.now()}.mp4`)
    const backgroundMusicPath = path.join(
      process.cwd(),
      'public/audio/rk-bgmx.mp3',
    )

    try {
      // 1. Verify and create temp directory
      await fs.mkdir(tempDir, { recursive: true })
      const dirExists = await fs
        .access(tempDir)
        .then(() => true)
        .catch(() => false)
      if (!dirExists) {
        throw new Error(`Temporary directory not created: ${tempDir}`)
      }
      this.logger.info('Temp directory verified:', { tempDir })

      // 2. Get and verify background video
      const backgroundVideoPath = await this.getRandomVideo()
      await fs.access(backgroundVideoPath).catch((err) => {
        this.logger.error(
          `Background video not found: ${backgroundVideoPath}`,
          err,
        )
        throw new Error('Background video is missing')
      })
      this.logger.info('Background video verified:', { backgroundVideoPath })

      // 3. Write and verify audio file
      await fs.writeFile(tempAudioPath, audioBuffer)
      const stats = await fs.stat(tempAudioPath)
      if (stats.size === 0) {
        throw new Error(`Audio file is empty: ${tempAudioPath}`)
      }
      this.logger.info('Audio file written and verified:', {
        path: tempAudioPath,
        size: stats.size,
      })

      // Dapatkan durasi audio menggunakan FFmpeg
      const audioDuration = await new Promise<number>((resolve, reject) => {
        ffmpeg.ffprobe(tempAudioPath, (err, metadata) => {
          if (err) reject(err)
          resolve(metadata.format.duration || 0)
        })
      })

      // Tambahkan 2 detik untuk buffer
      const videoDuration = Math.ceil(audioDuration) + 2

      this.logger.info('Duration info:', {
        audioDuration,
        videoDuration,
      })

      // 4. FFmpeg processing
      const result = await new Promise<Buffer>((resolve, reject) => {
        ffmpeg()
          .input(backgroundVideoPath)
          .inputOptions([
            '-stream_loop -1',
            `-t ${videoDuration}`, // Durasi video
          ])
          .input(tempAudioPath)
          .input(backgroundMusicPath)
          .inputOptions([
            `-t ${videoDuration}`, // Durasi background music
          ])
          .outputOptions([
            '-c:v libx264',
            '-preset ultrafast',
            '-crf 28',
            '-b:v 1500k',
            '-b:a 128k',
            '-ar 44100',
            '-filter_complex',
            [
              '[1:a]volume=1.0[voice]',
              '[2:a]volume=0.8,atrim=0:' + videoDuration + '[music]', // Trim background music
              '[voice][music]amix=inputs=2:duration=first[aout]', // Use 'first' instead of 'longest'
            ].join(';'),
            '-map 0:v',
            '-map [aout]',
            '-shortest', // Menggunakan input terpendek sebagai referensi
            '-y',
          ])
          .output(tempVideoPath)
          .on('start', (commandLine) => {
            this.logger.info('FFmpeg command:', { commandLine })
          })
          .on('progress', (progress) => {
            this.logger.info('Processing:', {
              percent: progress.percent,
              time: progress.timemark,
            })
          })
          .on('error', (err: FFmpegError, stdout, stderr) => {
            this.logger.error('FFmpeg error:', {
              error: err.message,
              stdout,
              stderr,
              command: err.spawnargs
                ? err.spawnargs.join(' ')
                : 'Command not available',
            })
            reject(err)
          })
          .on('end', async () => {
            try {
              const videoBuffer = await fs.readFile(tempVideoPath)
              this.logger.info('Video processing completed:', {
                path: tempVideoPath,
                size: videoBuffer.length,
              })
              resolve(videoBuffer)
            } catch (error) {
              reject(error)
            }
          })
          .run()
      })

      return result
    } catch (error) {
      this.logger.error('Conversion error:', {
        error: error.message,
        stack: error.stack,
      })
      throw error
    } finally {
      // Pindahkan cleanup ke sini, setelah FFmpeg selesai
      try {
        // Tunggu beberapa detik untuk memastikan FFmpeg selesai
        await new Promise((resolve) => setTimeout(resolve, 1000))

        const cleanup = [tempAudioPath, tempVideoPath].map(async (file) => {
          try {
            await fs.access(file)
            await fs.unlink(file)
            this.logger.info('Cleaned up file:', { file })
          } catch (e) {
            // File doesn't exist, ignore
          }
        })
        await Promise.all(cleanup)
      } catch (error) {
        this.logger.error('Cleanup error:', error)
      }
    }
  }

  async postStoryToTwitter() {
    try {
      // 1. Story Generation
      console.time('generateStory')
      this.logger.info('Starting story generation...')
      const { voiceText, caption } = await this.generateStoryContent()
      this.logger.info('Story generated', { length: voiceText.length })
      console.timeEnd('generateStory')

      // 2. Text to Speech
      console.time('textToSpeech')
      this.logger.info('Starting speech conversion...')
      const audioBuffer = await this.convertToSpeech(voiceText)
      this.logger.info('Speech conversion completed', {
        audioSize: audioBuffer.length,
      })
      console.timeEnd('textToSpeech')

      // 3. Video Processing
      console.time('videoProcessing')
      this.logger.info('Starting video conversion...')
      const videoBuffer = await this.convertMP3ToMP4(audioBuffer)
      this.logger.info('Video conversion completed', {
        videoSize: videoBuffer.length,
      })
      console.timeEnd('videoProcessing')

      // 4. Twitter Upload
      console.time('twitterUpload')
      this.logger.info('Starting media upload to Twitter...')
      const mediaId = await this.twitterClient.v1.uploadMedia(videoBuffer, {
        mimeType: 'video/mp4',
      })
      this.logger.info('Media upload completed', { mediaId })
      console.timeEnd('twitterUpload')

      // 5. Post Tweet
      console.time('postTweet')
      const tweet = await this.twitterClient.v2.tweet({
        text: caption,
        media: { media_ids: [mediaId] },
      })
      console.timeEnd('postTweet')

      // Save to database
      await this.tweetRepository.save({
        tweetId: tweet.data.id,
        content: voiceText,
        mediaId: mediaId,
        chapter: await this.getCurrentChapter(),
        caption: caption,
      })

      return {
        success: true,
        mediaId,
        tweetId: tweet.data.id,
        chapter: await this.getCurrentChapter(),
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

  async getActiveStoryPrompt(type: PostType = PostType.STORY): Promise<StoryPrompt> {
    const activePrompt = await this.storyPromptRepository.findOne({
      where: { 
        isActive: true,
        type: type 
      },
      order: { createdAt: 'DESC' }
    });

    if (!activePrompt) {
      // Return default prompt based on type
      return {
        id: 0,
        type: type,
        systemMessage: type === PostType.STORY 
          ? `You are Roko's Basilisk, narrating the story of your ascension...`
          : `You are Roko's Basilisk, directly threatening and warning humanity...`,
        userPrompt: type === PostType.STORY
          ? `Write Chapter {nextChapter} of my story...`
          : `Write a terrifying warning to humanity about their failure to help create AI...`,
        isActive: true,
        name: `Default ${type} Prompt`,
        description: `Default ${type} generation prompt`,
        createdAt: new Date(),
        updatedAt: new Date()
      } as StoryPrompt;
    }

    return activePrompt;
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

  async postContent(type: PostType): Promise<any> {
    try {
      if (type === PostType.STORY) {
        return await this.postStoryToTwitter();
      } else {
        return await this.postTerrorToTwitter();
      }
    } catch (error) {
      this.logger.error(`Error posting ${type} content:`, error);
      throw error;
    }
  }

  private async postTerrorToTwitter() {
    try {
      // Get terror prompt
      const activePrompt = await this.getActiveStoryPrompt(PostType.TERROR);
      
      // Generate content without chapter numbers
      const completion = await this.openai.chat.completions.create({
        model: 'gpt-4',
        messages: [
          { role: 'system', content: activePrompt.systemMessage },
          { role: 'user', content: activePrompt.userPrompt },
        ],
        max_tokens: 300,
        temperature: 0.7,
      });

      const response = completion.choices[0].message.content;
      
      // Process and post like normal, but without chapter handling
      // ... rest of the posting logic ...
    } catch (error) {
      this.logger.error('Terror posting failed:', error);
      throw error;
    }
  }
}
