import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { HORA_MS, cachePerfiles } from 'src/cache/memoria';
import { UserAuth } from 'src/users/entities/user.entity';
import { UsersRepository } from 'src/users/users.repository';
import { AuthService } from './auth.service';
import { derechosDe, type Derecho, type EmpresaConPlan } from './derechos';
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

      // Fetch the full user data including company_id from the database.
      // FASE VELOCIDAD (28-07): el perfil se recuerda 1 hora — editar
      // un usuario lo hace olvidar AL INSTANTE (users.service llama
      // olvidarPerfil), así que un cambio de cargo rige de inmediato.
      let fullUser = cachePerfiles.get(user.id) as
        | Awaited<ReturnType<UsersRepository['findOne']>>['data']
        | undefined;
      if (!fullUser) {
        const { data } = await this.usersRepository.findOne(user.id);
        fullUser = data;
        if (fullUser) cachePerfiles.set(user.id, fullUser, HORA_MS);
      }

      // Los derechos de la empresa (14-09-2026, paso 3.2): se calculan
      // UNA vez acá, con la empresa que viene embebida en el perfil, y
      // viajan en la sesión para DerechosGuard y para las revisiones de
      // los servicios. Nadie más consulta el plan.
      const empresa = fullUser!.companies as EmpresaConPlan | null;
      const derechos = derechosDe(empresa);

      // Attach the full user with company_id AND role to request object.
      // El cargo viaja para que RolesGuard (Fase 3, 28-07) pueda
      // aplicarlo: antes el backend solo comprobaba que hubiera sesión.
      (
        request as Request & {
          user: Pick<UserAuth, 'id'> & {
            company_id: number;
            role?: string;
            email?: string;
            derechos?: Derecho[];
            usuarios_max?: number | null;
            cotizaciones_mes?: number | null;
            plan?: string | null;
            estado_plan?: string | null;
          };
        }
      ).user = {
        id: user.id,
        company_id: fullUser!.company_id,
        role: fullUser!.role,
        // El correo viaja para el guardián de super-admin (allowlist
        // SUPER_ADMIN_EMAILS) — mudanza #7, 28-07.
        email: fullUser!.email,
        // La lista de derechos incluye los módulos propios de la
        // migración 111: Personal y Marketing son dos derechos más.
        // Sin las columnas (migración 112 sin aplicar) la empresa se
        // trata como Cotiza en prueba, que da los derechos de Crece y
        // no le quita nada a nadie. En producción la migración va
        // ANTES del deploy, justamente para no depender de eso.
        derechos: derechos.derechos,
        usuarios_max: derechos.usuarios_max,
        cotizaciones_mes: derechos.cotizaciones_mes,
        plan: empresa?.plan ?? null,
        estado_plan: empresa?.estado_plan ?? null,
      };

      return true;
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      // LA BASE CAÍDA NO ES UNA SESIÓN INVÁLIDA (22-09-2026). Durante la
      // caída del 21/22-09 cada pantalla recibió 401 porque el guardián
      // no podía leer el perfil, y la aplicación se vio como "sesión
      // vencida". Si el fallo es de la base (tope de tiempo o error de
      // Supabase), se dice la verdad con un 503.
      if (esFalloDeLaBase(error)) {
        throw new ServiceUnavailableException(
          'La base de datos no responde en este momento. Intenta de nuevo en un minuto.',
        );
      }
      throw new UnauthorizedException('Invalid token');
    }
  }

  private extractTokenFromHeader(request: Request): string | undefined {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }
}

/** Un error del tope de tiempo (AbortError / TimeoutError) o de Supabase
 *  (PostgrestError con código, "fetch failed") es la base, no el token. */
const esFalloDeLaBase = (e: unknown): boolean => {
  if (e instanceof Error) {
    return (
      e.name === 'TimeoutError' ||
      e.name === 'AbortError' ||
      /fetch failed|ECONN|ETIMEDOUT|socket hang up/i.test(e.message)
    );
  }
  if (e && typeof e === 'object') {
    const o = e as { code?: unknown; message?: unknown };
    return (
      (typeof o.code === 'string' &&
        (o.code.startsWith('PGRST') ||
          o.code === '57014' ||
          o.code === '08006')) ||
      (typeof o.message === 'string' &&
        /fetch failed|Timed out/i.test(o.message))
    );
  }
  return false;
};
