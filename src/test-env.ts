import * as dotenv from 'dotenv'
dotenv.config()

console.log('Environment Variables Test:')
console.log('---------------------------')
console.log('DB_HOST:', process.env.DB_HOST)
console.log('DB_PORT:', process.env.DB_PORT)
console.log('DB_USER:', process.env.DB_USER)
console.log(
  'DB_PASSWORD:',
  process.env.DB_PASSWORD ? process.env.DB_PASSWORD : 'NOT SET',
)
console.log('DB_NAME:', process.env.DB_NAME)
console.log('---------------------------')

// Test koneksi database
import { AppDataSource } from './data-source'

async function testConnection() {
  try {
    await AppDataSource.initialize()
    console.log('✅ Database connection successful')
    await AppDataSource.destroy()
  } catch (error) {
    console.error('❌ Database connection failed:', error.message)
  }
}

testConnection()
