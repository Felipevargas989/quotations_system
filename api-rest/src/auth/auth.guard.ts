import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { UserAuth } from 'src/users/entities/user.entity';
import { UsersRepository } from 'src/users/users.repository';
import { AuthService } from './auth.service';

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
      const user: Pick<UserAuth, 'id'> =
        await this.authService.validateToken(token);

      // Fetch the full user data including company_id from the database
      const { data: fullUser } = await this.usersRepository.findOne(user.id);

      // Attach the full user with company_id to request object
      (
        request as Request & {
          user: Pick<UserAuth, 'id'> & { company_id: number };
        }
      ).user = {
        id: user.id,
        company_id: fullUser!.company_id,
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
