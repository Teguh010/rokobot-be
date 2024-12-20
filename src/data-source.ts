import { DataSource } from 'typeorm'
import { Tweet } from './entities/tweet.entity'
import { Prompt } from './entities/prompt.entity'
import { StoryPrompt } from './entities/story-prompt.entity'
import { Chapter } from './entities/chapter.entity'
import * as dotenv from 'dotenv'

dotenv.config()

export const AppDataSource = new DataSource({
  type: 'mysql',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT) || 3306,
  username: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'root',
  database: process.env.DB_NAME || 'rokobot',
  entities: [Tweet, Prompt, StoryPrompt, Chapter],
  migrations: ['src/migrations/*.ts'],
  synchronize: false,
  extra: {
    authPlugin: 'mysql_native_password',
  },
})
