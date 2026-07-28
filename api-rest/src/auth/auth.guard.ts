import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { UserAuth } from 'src/users/entities/user.entity';
import { UsersRepository } from 'src/users/users.repository';
import { AuthService } from './auth.service';
import { IS_PUBLIC_KEY } from './public.decorator';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly authService: AuthService,
    private readonly usersRepository: UsersRepository,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

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

      // Attach the full user with company_id AND role to request object.
      // El cargo viaja para que RolesGuard (Fase 3, 28-07) pueda
      // aplicarlo: antes el backend solo comprobaba que hubiera sesión.
      (
        request as Request & {
          user: Pick<UserAuth, 'id'> & {
            company_id: number;
            role?: string;
            email?: string;
          };
        }
      ).user = {
        id: user.id,
        company_id: fullUser!.company_id,
        role: fullUser!.role,
        // El correo viaja para el guardián de super-admin (allowlist
        // SUPER_ADMIN_EMAILS) — mudanza #7, 28-07.
        email: fullUser!.email,
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
