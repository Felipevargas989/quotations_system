import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { AuthService } from 'src/auth/auth.service';
import { CompaniesRepository } from 'src/companies/companies.repository';
import { Company } from 'src/companies/entities/company.entity';
import { mensajeDe } from 'src/logging/mensaje-de-error';
import { UserRole } from 'src/users/entities/user.entity';
import { CreateUser } from 'src/users/types';
import { UsersRepository } from 'src/users/users.repository';
import { AltaLicitaDto } from './dto/alta-licita.dto';
import { LicitaRepository, PersonaDeAuth } from './licita.repository';

// EL ALTA DE LICITA (25-11). La persona ya entró con Google: su cuenta de
// Auth existe, pero sin fila en `user_profiles` el motor le responde 401 a
// todo (`AuthGuard`). Esta alta crea las dos piezas que faltan:
//  - la empresa: en prueba por 14 días, con la etiqueta de plan `crece` y
//    el módulo propio `oportunidades` (no lo da ningún plan);
//  - la persona: administradora de esa empresa (el administrador trae de
//    fábrica el permiso `oportunidades`).
// No siembra nada de eventos ni manda correos (los de Eventia llevan su
// marca). No crea la fila de `oportunidades_config`: el módulo la lee con
// `maybeSingle` y aguanta que no exista, y la crea `guardarConfig` (upsert)
// la primera vez que la empresa guarda su configuración.
//
// Idempotente: si la persona ya tiene fila, devuelve su empresa sin crear
// otra. Si la persona falla después de crear la empresa, la empresa se
// borra (la compensación del alta de Eventia, `createSuscription`); si falló
// porque otra alta de la misma persona ganó la carrera (`user_id` es
// UNIQUE), se devuelve la de esa otra.

export const DIAS_DE_PRUEBA_LICITA = 14;
export const PLAN_DE_LICITA = 'crece' as const;
export const MODULOS_DE_LICITA = ['oportunidades'];
/** La moneda de la empresa (columna obligatoria). Licita es para Chile. */
export const MONEDA_DE_LICITA = 'CLP';

type EmpresaDeLaRespuesta = Pick<Company, 'id' | 'name'> & {
  plan: Company['plan'] | null;
  estado_plan: Company['estado_plan'] | null;
  prueba_vence: string | null;
  modulos_propios: string[];
};

export type RespuestaDelAlta = {
  /** false si la persona ya tenía empresa (no se creó nada). */
  creada: boolean;
  empresa: EmpresaDeLaRespuesta;
  persona: {
    user_id: string;
    email: string;
    full_name: string | null;
    role: string;
  };
};

type Perfil = NonNullable<
  Awaited<ReturnType<UsersRepository['findOne']>>['data']
>;

/** El pase de `Authorization: Bearer <pase>`, o null. */
const paseDe = (authorization?: string): string | null => {
  const [tipo, pase] = authorization?.trim().split(/\s+/) ?? [];
  return tipo === 'Bearer' && pase ? pase : null;
};

const texto = (v: unknown): string | null =>
  typeof v === 'string' && v.trim() ? v.trim() : null;

/** El nombre que Google deja en Auth; si no hay, lo de antes de la @. */
export const nombreDe = (persona: PersonaDeAuth, email: string): string =>
  (
    texto(persona.metadata.full_name) ??
    texto(persona.metadata.name) ??
    email.split('@')[0]
  ).slice(0, 120);

@Injectable()
export class LicitaService {
  constructor(
    private readonly authService: AuthService,
    private readonly licitaRepository: LicitaRepository,
    private readonly companiesRepository: CompaniesRepository,
    private readonly usersRepository: UsersRepository,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(LicitaService.name);
  }

  async alta(
    authorization: string | undefined,
    dto: AltaLicitaDto,
  ): Promise<RespuestaDelAlta> {
    const pase = paseDe(authorization);
    if (!pase) throw new UnauthorizedException('No token provided');
    // 401 si el pase no vale (el mismo de `AuthGuard`).
    const { id } = await this.authService.validateToken(pase);

    const yaTenia = await this.perfilDe(id);
    if (yaTenia) return this.respuesta(yaTenia, false);

    const persona = await this.licitaRepository.personaDeAuth(id);
    const email = texto(persona?.email);
    if (!persona || !email) {
      throw new BadRequestException(
        'Tu cuenta no trae un correo: entra de nuevo con Google.',
      );
    }

    const venceLaPrueba = new Date(
      Date.now() + DIAS_DE_PRUEBA_LICITA * 24 * 60 * 60 * 1000,
    ).toISOString();
    const nueva: Omit<Company, 'id'> = {
      name: dto.nombre_empresa,
      currency: MONEDA_DE_LICITA,
      is_active: true,
      plan: PLAN_DE_LICITA,
      estado_plan: 'prueba',
      prueba_vence: venceLaPrueba,
      modulos_propios: [...MODULOS_DE_LICITA],
    };
    const { data: empresa, error: errorEmpresa } =
      await this.companiesRepository.create(nueva);
    if (errorEmpresa || !empresa) {
      throw new BadRequestException(
        `No pudimos crear tu empresa: ${errorEmpresa ? mensajeDe(errorEmpresa) : 'sin respuesta de la base'}`,
      );
    }

    const perfil: CreateUser = {
      user_id: id,
      email,
      full_name: nombreDe(persona, email),
      role: UserRole.ADMINISTRADOR,
      company_id: empresa.id,
    };
    try {
      const { data, error } = await this.usersRepository.createUser(perfil);
      // El objeto de Supabase viaja tal cual al catch (allí se lee).
      if (error) throw error;
      if (!data) throw new Error('sin respuesta de la base');
    } catch (errorPersona) {
      // LA COMPENSACIÓN: la empresa nació y su administradora no. Se borra
      // para no dejar huérfanas; si el borrado falla, al registro con su
      // nombre, nunca en silencio.
      const { error: errorDelBorrado } =
        await this.companiesRepository.deleteById(empresa.id);
      if (errorDelBorrado) {
        this.logger.error(
          `alta de Licita: la compensación no pudo borrar la empresa ${empresa.id} (${empresa.name}): ${mensajeDe(errorDelBorrado)}`,
        );
      }
      // ¿Ganó otra alta de la misma persona? Entonces ya tiene empresa.
      const otra = await this.perfilDe(id).catch(() => null);
      if (otra) return this.respuesta(otra, false);
      throw new BadRequestException(
        `No pudimos crear tu cuenta: ${mensajeDe(errorPersona)}`,
      );
    }

    this.logger.info(
      `alta de Licita: empresa ${empresa.id} (${empresa.name}) con su administradora ${id}`,
    );
    return {
      creada: true,
      empresa: {
        id: empresa.id,
        name: empresa.name,
        plan: empresa.plan ?? PLAN_DE_LICITA,
        estado_plan: empresa.estado_plan ?? 'prueba',
        prueba_vence: empresa.prueba_vence ?? venceLaPrueba,
        modulos_propios: empresa.modulos_propios ?? [...MODULOS_DE_LICITA],
      },
      persona: {
        user_id: id,
        email: perfil.email,
        full_name: perfil.full_name,
        role: perfil.role,
      },
    };
  }

  /** La fila de la persona en `user_profiles`, o null si no tiene. Cero
   *  filas con `.single()` llega como el error PGRST116. */
  private async perfilDe(id: string): Promise<Perfil | null> {
    const { data, error } = await this.usersRepository.findOne(id);
    if (data) return data;
    if (error && error.code !== 'PGRST116') {
      this.logger.error(
        `alta de Licita: no pude leer el perfil ${id}: ${mensajeDe(error)}`,
      );
      throw new ServiceUnavailableException(
        'La base de datos no responde en este momento. Intenta de nuevo en un minuto.',
      );
    }
    return null;
  }

  private respuesta(perfil: Perfil, creada: boolean): RespuestaDelAlta {
    const empresa = perfil.companies as unknown as Partial<Company> & {
      id: number;
      name: string;
    };
    return {
      creada,
      empresa: {
        id: empresa?.id ?? perfil.company_id,
        name: empresa?.name ?? '',
        plan: empresa?.plan ?? null,
        estado_plan: empresa?.estado_plan ?? null,
        prueba_vence: empresa?.prueba_vence ?? null,
        modulos_propios: empresa?.modulos_propios ?? [],
      },
      persona: {
        user_id: perfil.user_id,
        email: perfil.email,
        full_name: perfil.full_name ?? null,
        role: perfil.role,
      },
    };
  }
}
