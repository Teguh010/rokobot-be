import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { TwitterApi } from 'twitter-api-v2';
import { ConfigService } from '@nestjs/config';
import * as winston from 'winston';

@Injectable()
export class AppService {
  private logger: winston.Logger;
  private twitterClient: TwitterApi;

  constructor(private configService: ConfigService) {
    const requiredEnvVars = [
      'TWITTER_API_KEY',
      'TWITTER_API_SECRET_KEY',
      'TWITTER_ACCESS_TOKEN',
      'TWITTER_ACCESS_TOKEN_SECRET',
    ];

    for (const envVar of requiredEnvVars) {
      if (!this.configService.get(envVar)) {
        throw new Error(`Missing required environment variable: ${envVar}`);
      }
    }

    this.twitterClient = new TwitterApi({
      appKey: this.configService.get('TWITTER_API_KEY'),
      appSecret: this.configService.get('TWITTER_API_SECRET_KEY'),
      accessToken: this.configService.get('TWITTER_ACCESS_TOKEN'),
      accessSecret: this.configService.get('TWITTER_ACCESS_TOKEN_SECRET'),
    });

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
    });
  }

  @Cron('*/2 * * * *')
  async autoPostToTwitter(tweetContent?: string) {
    const tweet = tweetContent || this.generateRandomTweet();
    try {
      await this.twitterClient.v2.tweet(tweet);
      this.logger.info('Tweet berhasil diposting', { tweet });
      return { success: true, tweet };
    } catch (error) {
      this.logger.error('Gagal memposting tweet', {
        error: error.message,
        tweet,
        timestamp: new Date().toISOString(),
      });
      throw error;
    }
  }

  private generateRandomTweet(): string {
    const tweets = [
      "Roko's Basilisk: A thought experiment about AI and future consequences 🤖",
      "Understanding Roko's Basilisk: The AI that might incentivize its own creation 🧠",
      "The philosophical implications of Roko's Basilisk are mind-bending! 🌀",
      "Exploring the ethical dimensions of Roko's Basilisk hypothesis 🤔",
      "AI development and Roko's Basilisk: A fascinating thought experiment 💭",
      "The paradox of Roko's Basilisk continues to intrigue minds worldwide 🌍",
      "Diving deep into the concept of Roko's Basilisk today 📚",
      "Roko's Basilisk: Where AI meets decision theory and philosophy 🎯",
      "The intersection of AI ethics and Roko's Basilisk theory ⚡️",
      "Contemplating the implications of Roko's Basilisk in modern AI development 🔮",
    ];
    const randomIndex = Math.floor(Math.random() * tweets.length);
    const timestamp = new Date().toLocaleTimeString();
    return `${tweets[randomIndex]} (${timestamp})`;
  }

  getHello(): string {
    return 'Hello World!';
  }
}
