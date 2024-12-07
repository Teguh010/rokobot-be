import { DataSource } from 'typeorm'
import { Tweet } from './entities/tweet.entity'
import { UpdateTweetContentColumn1701648000000 } from './migrations/1701648000000-UpdateTweetContentColumn'
import { CreateTweetTable1701647000000 } from './migrations/1701647000000-CreateTweetTable'

import * as dotenv from 'dotenv'
dotenv.config()

export const AppDataSource = new DataSource({
  type: 'mysql',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT) || 3306,
  username: process.env.DB_USER || 'rokobot_user1',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'rokobot',
  entities: [Tweet],
  migrations: [
    CreateTweetTable1701647000000,
    UpdateTweetContentColumn1701648000000,
  ],
  synchronize: false,
  extra: {
    authPlugin: 'mysql_native_password',
  },
})
