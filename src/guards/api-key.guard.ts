import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest()
    const authHeader = request.headers.authorization

    if (!authHeader) {
      throw new UnauthorizedException('No API key provided')
    }

    const [type, apiKey] = authHeader.split(' ')

    if (type !== 'Bearer') {
      throw new UnauthorizedException('Invalid authorization type')
    }

    const validApiKey = this.configService.get<string>('API_KEY')

    if (apiKey !== validApiKey) {
      throw new UnauthorizedException('Invalid API key')
    }

    return true
  }
}
