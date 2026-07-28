import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { createHash } from 'crypto';
import { PinoLogger } from 'nestjs-pino';
import { cacheTokens, HORA_MS } from 'src/cache/memoria';
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
    // FASE VELOCIDAD (28-07): un pase YA verificado se recuerda hasta
    // que expira solo (Supabase los emite con 1 hora de vida). Antes,
    // CADA petición viajaba a Supabase a preguntar por el mismo pase —
    // era el mayor costo fijo de todas las pantallas. Solo se recuerdan
    // pases que Supabase aprobó; uno alterado jamás entra a la memoria.
    const huella = createHash('sha256').update(token).digest('hex');
    const recordado = cacheTokens.get(huella);
    if (recordado) return recordado;
    try {
      const {
        data: { user },
        error,
      } = await this.supabase.auth.getUser(token);

      if (error || !user) {
        throw new UnauthorizedException('Invalid token');
      }

      const identidad = {
        id: user.id,
        ...user.user_metadata,
      };
      cacheTokens.set(huella, identidad, this.vidaRestante(token));
      return identidad;
    } catch (error) {
      this.logger.error({ err: error }, 'Token validation failed');
      throw new UnauthorizedException('Token validation failed');
    }
  }

  // Cuánta vida le queda al pase según su propio vencimiento (campo
  // exp del JWT), con tope de 1 hora. Si no se puede leer, 5 minutos.
  private vidaRestante(token: string): number {
    try {
      const cuerpo = JSON.parse(
        Buffer.from(token.split('.')[1], 'base64url').toString(),
      ) as { exp?: number };
      if (!cuerpo.exp) return 5 * 60 * 1000;
      return Math.max(0, Math.min(cuerpo.exp * 1000 - Date.now(), HORA_MS));
    } catch {
      return 5 * 60 * 1000;
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
