import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common'

@Injectable()
export class ApiKeyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest()

    // Debug logging
    console.log('=== Debug API Key Guard ===')
    console.log('All Headers:', request.headers)
    console.log('Authorization Header:', request.headers.authorization)

    const authHeader = request.headers.authorization

    if (!authHeader) {
      console.log('No authorization header found')
      throw new UnauthorizedException('No API key provided')
    }

    const [type, apiKey] = authHeader.split(' ')
    console.log('Auth Type:', type)
    console.log('API Key:', apiKey)

    if (type !== 'Bearer') {
      console.log('Invalid auth type:', type)
      throw new UnauthorizedException('Invalid authorization type')
    }

    const validApiKey = 'rokobot-22x-BisMillah22x@-api-key-2024'
    if (apiKey !== validApiKey) {
      console.log('Invalid API key provided:', apiKey)
      throw new UnauthorizedException('Invalid API key')
    }

    console.log('Authorization successful')
    return true
  }
}
