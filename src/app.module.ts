import { Module } from '@nestjs/common'
import { ScheduleModule } from '@nestjs/schedule'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { TypeOrmModule } from '@nestjs/typeorm'
import { AppService } from './app.service'
import { AppController } from './app.controller'
import { Tweet } from './entities/tweet.entity'

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    ScheduleModule.forRoot(),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        type: 'mysql',
        host: configService.get('DB_HOST'),
        port: +configService.get('DB_PORT'),
        username: configService.get('DB_USERNAME'),
        password: configService.get('DB_PASSWORD'),
        database: configService.get('DB_NAME'),
        entities: [Tweet],
        synchronize: true,
        logging: true,
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        driver: require('mysql2'), // tambahkan ini
      }),
      inject: [ConfigService],
    }),
    TypeOrmModule.forFeature([Tweet]),
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
