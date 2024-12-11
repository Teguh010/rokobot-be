import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module'

async function bootstrap() {
  const app = await NestFactory.create(AppModule)

  // Tambahkan konfigurasi CORS
  // app.enableCors({
  //   origin: [
  //     'http://localhost:3000', // Frontend local
  //     'http://localhost:5173', // Vite default port
  //     'http://127.0.0.1:5173',
  //     'http://127.0.0.1:3000',
  //     'http://46.202.162.179', // VPS IP
  //     'https://rokobot.netlify.app', // Jika ada domain
  //     '*', // Atau izinkan semua origin untuk development
  //   ],
  //   methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  //   allowedHeaders: ['Content-Type', 'Authorization', 'X-API-KEY'],
  //   credentials: true,
  // })

  await app.listen(process.env.PORT ?? 3000)
}
bootstrap()
