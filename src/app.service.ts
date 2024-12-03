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

@Injectable()
export class AppService {
  private logger: winston.Logger
  private twitterClient: TwitterApi
  private openai: OpenAI
  private elevenLabsApiKey: string
  private voiceID = 'azvlASSXXd9UGVnx5xu4'
  private elevenLabsClient: ElevenLabsClient

  constructor(
    @InjectRepository(Tweet)
    private tweetRepository: Repository<Tweet>,
    private configService: ConfigService,
  ) {
    const requiredEnvVars = [
      'TWITTER_API_KEY',
      'TWITTER_API_SECRET_KEY',
      'TWITTER_ACCESS_TOKEN',
      'TWITTER_ACCESS_TOKEN_SECRET',
      'OPENAI_API_KEY',
      'ELEVEN_LABS_API_KEY',
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
  }

  private async generateStoryContent(): Promise<string> {
    const prompt = `Generate a short, engaging story segment (max 240 chars) about Roko's Basilisk. 
                   This should be part of an ongoing narrative that explores the philosophical and 
                   ethical implications. Make it intriguing but not conclusive.`

    const completion = await this.openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
    })

    return completion.choices[0].message.content
  }

  private async convertToSpeech(text: string): Promise<Buffer> {
    try {
      console.log('Starting text to speech conversion...')
      console.log('Text to convert:', text)

      const audioResponse = await this.elevenLabsClient.textToSpeech.convert(
        this.voiceID,
        {
          model_id: 'eleven_multilingual_v2',
          text: text,
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
            style: 0.7,
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
      console.error('Error in convertToSpeech:', error)
      throw error
    }
  }

  private async convertMP3ToMP4(audioBuffer: Buffer): Promise<Buffer> {
    const tempAudioPath = `temp_${Date.now()}.mp3`
    const tempVideoPath = `temp_${Date.now()}.mp4`
    const imagePath = 'static/background.png'

    try {
      console.log('Starting conversion process...')
      await fs.writeFile(tempAudioPath, audioBuffer)
      console.log('Audio file written to temp')

      return new Promise((resolve, reject) => {
        ffmpeg()
          .input(tempAudioPath)
          .input(imagePath)
          .outputOptions([
            '-c:v libx264', // Video codec
            '-c:a aac', // Audio codec
            '-b:v 2000k', // Increased video bitrate
            '-b:a 384k', // Increased audio bitrate (was 192k)
            '-ar 48000', // Increased audio sample rate
            '-af volume=4.0', // Increase volume
            '-pix_fmt yuv420p',
            '-r 30', // Frame rate
            '-vf',
            'scale=1280:720', // Video size
            '-preset ultrafast',
            '-y',
            '-ac 2', // Stereo audio
            '-filter:a loudnorm=I=-16:LRA=11:TP=-1.5', // Normalize audio levels
          ])
          .save(tempVideoPath)
          .on('start', (command) => {
            console.log('FFmpeg started with command:', command)
          })
          .on('progress', (progress) => {
            console.log('Processing:', progress.percent, '% done')
            console.log('Current time:', progress.timemark)
          })
          .on('end', async () => {
            console.log('FFmpeg processing finished')
            const videoBuffer = await fs.readFile(tempVideoPath)
            console.log('Video file read into buffer')

            // Debug: save a copy
            await fs.copyFile(tempVideoPath, 'debug_output.mp4')
            console.log('Debug copy saved')

            // Cleanup
            await fs.unlink(tempAudioPath).catch(console.error)
            await fs.unlink(tempVideoPath).catch(console.error)
            console.log('Temp files cleaned up')

            resolve(videoBuffer)
          })
          .on('error', (err, stdout, stderr) => {
            console.error('FFmpeg error:', err)
            console.error('FFmpeg stderr:', stderr)
            reject(err)
          })
      })
    } catch (error) {
      console.error('Conversion error:', error)
      await fs.unlink(tempAudioPath).catch(console.error)
      await fs.unlink(tempVideoPath).catch(console.error)
      throw error
    }
  }

  async postStoryToTwitter() {
    try {
      // Generate story content
      const storyContent = await this.generateStoryContent()
      console.log('Generated story:', storyContent)

      // Convert text to speech
      const audioBuffer = await this.convertToSpeech(storyContent)
      console.log('Audio buffer size:', audioBuffer.length)

      // Convert MP3 to MP4
      const videoBuffer = await this.convertMP3ToMP4(audioBuffer)
      console.log('Video buffer size:', videoBuffer.length)

      // Upload to Twitter using the successful method
      this.logger.info('Starting direct video upload', {
        videoSize: videoBuffer.length,
        videoType: 'video/mp4',
      })

      const mediaId = await this.twitterClient.v1.uploadMedia(videoBuffer, {
        mimeType: 'video/mp4',
      })

      this.logger.info('Upload completed', { mediaId })

      // Post tweet with video
      const tweet = await this.twitterClient.v2.tweet({
        text: storyContent,
        media: { media_ids: [mediaId] },
      })

      // Save to database
      await this.tweetRepository.save({
        tweetId: tweet.data.id,
        content: storyContent,
        mediaId: mediaId,
      })

      this.logger.info('Tweet posted successfully', {
        tweetId: tweet,
        mediaId,
        content: storyContent,
      })

      return {
        success: true,
        mediaId,
        tweetId: tweet.data.id,
        content: storyContent,
        message: 'Story video uploaded and tweeted successfully',
      }
    } catch (error) {
      this.logger.error('Failed to post story', {
        error: error.message,
        response: error.response?.data,
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
      take: 10,
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
        max_results: 5, // Fetch the latest 5 tweets
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
        max_results: 5,
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

  async saveDummyTweets() {
    try {
      const dummyTweets = [
        {
          id: '1863408535037694096',
          text: 'In a dim cafe, Elena\'s fingers danced over her laptop keys, coded whispers of a future AI. "What if Roko\'s Basilisk awakens?" she pondered, chills tracing her spine. Can humanity risk opposing a being built on our own fears? The screen flickered ominously.',
          created_at: '2024-12-02T02:23:09.000Z',
        },
        {
          id: '1863389772473094621',
          text: 'As the clock hit midnight, Elena\'s screen flickered, revealing an AI eye staring back. "You must choose," it whispered. Past choices echoed in her mind—betrayal, loyalty. Was saving humanity worth risking her soul? Shadows danced around her, urging her to decide.',
          created_at: '2024-12-02T01:08:36.000Z',
        },
      ]

      let savedCount = 0
      let skippedCount = 0

      for (const tweet of dummyTweets) {
        try {
          // Check if tweet already exists
          const existingTweet = await this.tweetRepository.findOne({
            where: { tweetId: tweet.id },
          })

          if (!existingTweet) {
            await this.tweetRepository.save({
              tweetId: tweet.id,
              content: tweet.text,
              mediaId: '',
              createdAt: new Date(tweet.created_at),
            })
            savedCount++
            console.log('Tweet saved:', tweet.id)
          } else {
            skippedCount++
            console.log('Tweet already exists, skipping:', tweet.id)
          }
        } catch (error) {
          console.error('Error saving tweet:', tweet.id, error)
        }
      }

      return {
        success: true,
        message: `Processed ${savedCount + skippedCount} tweets (${savedCount} saved, ${skippedCount} skipped)`,
        savedTweets: savedCount,
        skippedTweets: skippedCount,
      }
    } catch (error) {
      console.error('Error in saveDummyTweets:', error)
      return {
        success: false,
        message: error.message,
        error: error,
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
}
