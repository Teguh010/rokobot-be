import { DataSource } from 'typeorm'
import { Tweet } from './entities/tweet.entity'
import { UpdateTweetContentColumn } from './migrations/UpdateTweetContentColumn'

export const AppDataSource = new DataSource({
  type: 'mysql',
  host: 'localhost',
  port: 3306,
  username: 'rokobot_user1',
  password: 'BisMillah22x#',
  database: 'rokobot',
  entities: [Tweet],
  migrations: [UpdateTweetContentColumn],
  synchronize: false,
})
