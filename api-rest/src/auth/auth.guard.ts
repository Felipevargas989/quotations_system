import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { UsersRepository } from 'src/users/users.repository';
import { AuthService } from './auth.service';
import { UserAuth } from './interfaces/auth.interfaces';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly authService: AuthService,
    private readonly usersRepository: UsersRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractTokenFromHeader(request);

    if (!token) {
      throw new UnauthorizedException('No token provided');
    }

    try {
      const user: UserAuth = await this.authService.validateToken(token);

      // Fetch the full user data including company_id from the database
      const fullUser = await this.usersRepository.findOne(user.id);

      // Attach the full user with company_id to request object
      (request as Request & { user: UserAuth & { company_id: number } }).user =
        {
          ...user,
          company_id: fullUser.company_id,
        };

      return true;
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new UnauthorizedException('Invalid token');
    }
  }

  private extractTokenFromHeader(request: Request): string | undefined {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }
}
