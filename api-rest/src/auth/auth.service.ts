import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { PinoLogger } from 'nestjs-pino';
import { UserAuth } from 'src/users/entities/user.entity';

@Injectable()
export class AuthService {
  private readonly supabase: SupabaseClient;

  constructor(
    private readonly configService: ConfigService,
    private readonly logger: PinoLogger,
  ) {
    const supabaseUrl = this.configService.get<string>('SUPABASE_URL');
    const supabaseServiceKey = this.configService.get<string>(
      'SUPABASE_SERVICE_ROLE_KEY',
    );

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error(
        'Missing Supabase configuration. Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables.',
      );
    }

    this.supabase = createClient(supabaseUrl, supabaseServiceKey);
    this.logger.setContext(AuthService.name);
  }

  async validateToken(token: string): Promise<Pick<UserAuth, 'id'>> {
    try {
      const {
        data: { user },
        error,
      } = await this.supabase.auth.getUser(token);

      if (error || !user) {
        throw new UnauthorizedException('Invalid token');
      }

      return {
        id: user.id,
        ...user.user_metadata,
      };
    } catch (error) {
      this.logger.error({ err: error }, 'Token validation failed');
      throw new UnauthorizedException('Token validation failed');
    }
  }

  async requestPasswordRecovery(email: string): Promise<void> {
    const redirectTo = this.configService.get<string>(
      'SUPABASE_PASSWORD_RECOVERY_REDIRECT_URL',
    );

    const { error } = await this.supabase.auth.resetPasswordForEmail(email, {
      redirectTo: redirectTo || undefined,
    });

    if (error) {
      this.logger.error(
        { err: error },
        `Failed to send password recovery email for ${email}`,
      );
      throw new BadRequestException(error.message);
    }
  }

  async resetPasswordWithToken(
    accessToken: string,
    password: string,
  ): Promise<void> {
    const {
      data: { user },
      error: getUserError,
    } = await this.supabase.auth.getUser(accessToken);

    if (getUserError || !user) {
      this.logger.warn(
        {
          err: getUserError,
        },
        'Invalid or expired password recovery token',
      );
      throw new UnauthorizedException('Invalid or expired token');
    }

    const { error: updateError } =
      await this.supabase.auth.admin.updateUserById(user.id, {
        password,
      });

    if (updateError) {
      this.logger.error(
        { err: updateError },
        `Failed to reset password for user ${user.id}`,
      );
      throw new BadRequestException(updateError.message);
    }
  }
}
