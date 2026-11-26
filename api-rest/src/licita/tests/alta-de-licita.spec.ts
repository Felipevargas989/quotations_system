import type { ExecutionContext } from '@nestjs/common';
import {
  BadRequestException,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { PinoLogger } from 'nestjs-pino';
import type { AuthService } from 'src/auth/auth.service';
import { IS_PUBLIC_KEY } from 'src/auth/public.decorator';
import type { CompaniesRepository } from 'src/companies/companies.repository';
import type { UsersRepository } from 'src/users/users.repository';
import { mockPinoLogger } from '../../testing/mocks';
import { AltaLicitaDto } from '../dto/alta-licita.dto';
import { LicitaController } from '../licita.controller';
import type { LicitaRepository } from '../licita.repository';
import { LicitaService } from '../licita.service';
import { SoloEnLicitaGuard } from '../solo-en-licita.guard';

// EL ALTA DE LICITA (25-11): la persona entra con Google y el motor le crea
// su empresa (prueba de 14 días, `crece`, módulo `oportunidades`) y su fila
// de administradora. Sin eventos ni correos; idempotente; con compensación.

const PASE = 'Bearer pase-de-supabase';
const SIN_FILAS = {
  data: null,
  error: { code: 'PGRST116', message: '0 rows' },
};

const armar = (
  opciones: {
    validar?: jest.Mock;
    findOne?: jest.Mock;
    createUser?: jest.Mock;
    persona?: jest.Mock;
    crearEmpresa?: jest.Mock;
    borrar?: jest.Mock;
  } = {},
) => {
  const auth = {
    validateToken:
      opciones.validar ?? jest.fn().mockResolvedValue({ id: 'uid-1' }),
  };
  const licita = {
    personaDeAuth:
      opciones.persona ??
      jest.fn().mockResolvedValue({
        id: 'uid-1',
        email: 'ana@aseos.cl',
        metadata: { full_name: 'Ana Pérez', avatar_url: 'x' },
      }),
  };
  const companies = {
    create:
      opciones.crearEmpresa ??
      jest
        .fn()
        .mockImplementation((e: Record<string, unknown>) =>
          Promise.resolve({ data: { id: 501, ...e }, error: null }),
        ),
    deleteById: opciones.borrar ?? jest.fn().mockResolvedValue({ error: null }),
  };
  const users = {
    findOne: opciones.findOne ?? jest.fn().mockResolvedValue(SIN_FILAS),
    createUser:
      opciones.createUser ??
      jest
        .fn()
        .mockImplementation((u: Record<string, unknown>) =>
          Promise.resolve({ data: { id: 'p1', ...u }, error: null }),
        ),
  };
  const service = new LicitaService(
    auth as unknown as AuthService,
    licita as unknown as LicitaRepository,
    companies as unknown as CompaniesRepository,
    users as unknown as UsersRepository,
    mockPinoLogger() as unknown as PinoLogger,
  );
  return { service, auth, licita, companies, users };
};

const dto = { nombre_empresa: 'Aseos del Sur' } as AltaLicitaDto;

describe('el alta de Licita', () => {
  it('feliz: empresa en prueba de 14 días, crece, solo oportunidades, y la persona administradora', async () => {
    const { service, auth, licita, companies, users } = armar();
    const antes = Date.now();

    const r = await service.alta(PASE, dto);

    expect(auth.validateToken).toHaveBeenCalledWith('pase-de-supabase');
    // El correo sale de Auth con la llave de servicio, por el id del pase.
    expect(licita.personaDeAuth).toHaveBeenCalledWith('uid-1');
    const empresa = (
      companies.create.mock.calls[0] as [Record<string, unknown>]
    )[0];
    expect(empresa).toMatchObject({
      name: 'Aseos del Sur',
      plan: 'crece',
      estado_plan: 'prueba',
      modulos_propios: ['oportunidades'],
      is_active: true,
      currency: 'CLP',
    });
    // Sin la siembra de eventos ni los avisos de Eventia.
    expect(empresa).not.toHaveProperty('notifications');
    const dias =
      (new Date(empresa.prueba_vence as string).getTime() - antes) / 86_400_000;
    expect(dias).toBeGreaterThan(13.99);
    expect(dias).toBeLessThan(14.01);

    expect(users.createUser).toHaveBeenCalledWith({
      user_id: 'uid-1',
      email: 'ana@aseos.cl',
      full_name: 'Ana Pérez',
      role: 'administrador',
      company_id: 501,
    });
    expect(companies.deleteById).not.toHaveBeenCalled();
    expect(r).toEqual({
      creada: true,
      empresa: {
        id: 501,
        name: 'Aseos del Sur',
        plan: 'crece',
        estado_plan: 'prueba',
        prueba_vence: empresa.prueba_vence,
        modulos_propios: ['oportunidades'],
      },
      persona: {
        user_id: 'uid-1',
        email: 'ana@aseos.cl',
        full_name: 'Ana Pérez',
        role: 'administrador',
      },
    });
  });

  it('sin nombre en Auth, usa el de Google («name») o lo de antes de la @', async () => {
    const conName = armar({
      persona: jest.fn().mockResolvedValue({
        id: 'uid-1',
        email: 'ana@aseos.cl',
        metadata: { name: 'Ana G.' },
      }),
    });
    await conName.service.alta(PASE, dto);
    expect(conName.users.createUser).toHaveBeenCalledWith(
      expect.objectContaining({ full_name: 'Ana G.' }),
    );

    const sinNada = armar({
      persona: jest.fn().mockResolvedValue({
        id: 'uid-1',
        email: 'ana@aseos.cl',
        metadata: {},
      }),
    });
    await sinNada.service.alta(PASE, dto);
    expect(sinNada.users.createUser).toHaveBeenCalledWith(
      expect.objectContaining({ full_name: 'ana' }),
    );
  });

  it('repetida: si la persona ya tiene fila, devuelve su empresa y no crea nada', async () => {
    const findOne = jest.fn().mockResolvedValue({
      data: {
        user_id: 'uid-1',
        email: 'ana@aseos.cl',
        full_name: 'Ana Pérez',
        role: 'administrador',
        company_id: 501,
        companies: {
          id: 501,
          name: 'Aseos del Sur',
          plan: 'crece',
          estado_plan: 'prueba',
          prueba_vence: '2026-12-09T12:00:00.000Z',
          modulos_propios: ['oportunidades'],
        },
      },
      error: null,
    });
    const { service, companies, users, licita } = armar({ findOne });

    const r = await service.alta(PASE, { nombre_empresa: 'Otro nombre' });

    expect(r.creada).toBe(false);
    expect(r.empresa).toEqual({
      id: 501,
      name: 'Aseos del Sur',
      plan: 'crece',
      estado_plan: 'prueba',
      prueba_vence: '2026-12-09T12:00:00.000Z',
      modulos_propios: ['oportunidades'],
    });
    expect(companies.create).not.toHaveBeenCalled();
    expect(users.createUser).not.toHaveBeenCalled();
    expect(licita.personaDeAuth).not.toHaveBeenCalled();
  });

  it('falla a medias: la persona no se crea y la empresa recién nacida se borra', async () => {
    const createUser = jest.fn().mockResolvedValue({
      data: null,
      error: { code: '23503', message: 'violates foreign key' },
    });
    const { service, companies } = armar({ createUser });

    await expect(service.alta(PASE, dto)).rejects.toThrow(BadRequestException);
    await expect(service.alta(PASE, dto)).rejects.toThrow(
      'No pudimos crear tu cuenta: 23503: violates foreign key',
    );
    expect(companies.deleteById).toHaveBeenCalledWith(501);
  });

  it('falla a medias y el borrado también: lo dice al registro y responde igual', async () => {
    const createUser = jest.fn().mockRejectedValue(new Error('se cortó'));
    const borrar = jest
      .fn()
      .mockResolvedValue({ error: { message: 'permiso denegado' } });
    const { service } = armar({ createUser, borrar });
    await expect(service.alta(PASE, dto)).rejects.toThrow(
      'No pudimos crear tu cuenta: se cortó',
    );
    expect(borrar).toHaveBeenCalledWith(501);
  });

  it('la carrera: si otra alta de la misma persona ganó, borra la suya y devuelve la otra', async () => {
    const findOne = jest
      .fn()
      .mockResolvedValueOnce(SIN_FILAS)
      .mockResolvedValueOnce({
        data: {
          user_id: 'uid-1',
          email: 'ana@aseos.cl',
          full_name: 'Ana Pérez',
          role: 'administrador',
          company_id: 400,
          companies: { id: 400, name: 'La primera' },
        },
        error: null,
      });
    const createUser = jest.fn().mockResolvedValue({
      data: null,
      error: { code: '23505', message: 'duplicate key user_id' },
    });
    const { service, companies } = armar({ findOne, createUser });

    const r = await service.alta(PASE, dto);
    expect(companies.deleteById).toHaveBeenCalledWith(501);
    expect(r.creada).toBe(false);
    expect(r.empresa.id).toBe(400);
  });

  it('si no se puede crear la empresa, no intenta la persona', async () => {
    const crearEmpresa = jest
      .fn()
      .mockResolvedValue({ data: null, error: { message: 'caída' } });
    const { service, users, companies } = armar({ crearEmpresa });
    await expect(service.alta(PASE, dto)).rejects.toThrow(
      'No pudimos crear tu empresa: caída',
    );
    expect(users.createUser).not.toHaveBeenCalled();
    expect(companies.deleteById).not.toHaveBeenCalled();
  });

  it('sin pase, o con un pase que no es Bearer: 401 sin tocar nada', async () => {
    for (const authorization of [undefined, '', 'Bearer', 'Basic abc']) {
      const { service, auth, companies } = armar();
      await expect(service.alta(authorization, dto)).rejects.toThrow(
        UnauthorizedException,
      );
      expect(auth.validateToken).not.toHaveBeenCalled();
      expect(companies.create).not.toHaveBeenCalled();
    }
  });

  it('con un pase malo: 401 sin tocar nada', async () => {
    const validar = jest
      .fn()
      .mockRejectedValue(new UnauthorizedException('Token validation failed'));
    const { service, companies, users } = armar({ validar });
    await expect(service.alta('Bearer malo', dto)).rejects.toThrow(
      UnauthorizedException,
    );
    expect(users.findOne).not.toHaveBeenCalled();
    expect(companies.create).not.toHaveBeenCalled();
  });

  it('una cuenta de Auth sin correo no crea nada (400)', async () => {
    const persona = jest
      .fn()
      .mockResolvedValue({ id: 'uid-1', email: null, metadata: {} });
    const { service, companies } = armar({ persona });
    await expect(service.alta(PASE, dto)).rejects.toThrow(BadRequestException);
    expect(companies.create).not.toHaveBeenCalled();
  });

  it('si la base no responde al leer el perfil: 503, no 401 ni una empresa', async () => {
    const findOne = jest.fn().mockResolvedValue({
      data: null,
      error: { code: '57014', message: 'timeout' },
    });
    const { service, companies } = armar({ findOne });
    await expect(service.alta(PASE, dto)).rejects.toThrow(
      ServiceUnavailableException,
    );
    expect(companies.create).not.toHaveBeenCalled();
  });
});

describe('el cuerpo del alta', () => {
  const errores = (cuerpo: unknown) =>
    validateSync(plainToInstance(AltaLicitaDto, cuerpo), {
      whitelist: true,
      forbidNonWhitelisted: true,
    });

  it('pide el nombre de la empresa, recortado y con tope', () => {
    expect(errores({ nombre_empresa: 'Aseos del Sur' })).toHaveLength(0);
    expect(
      plainToInstance(AltaLicitaDto, { nombre_empresa: '  Aseos  ' })
        .nombre_empresa,
    ).toBe('Aseos');
    expect(errores({})).not.toHaveLength(0);
    expect(errores({ nombre_empresa: '   ' })).not.toHaveLength(0);
    expect(errores({ nombre_empresa: 'x'.repeat(121) })).not.toHaveLength(0);
    expect(errores({ nombre_empresa: 7 })).not.toHaveLength(0);
  });

  it('rechaza campos de más (el correo no viaja en el cuerpo)', () => {
    expect(
      errores({ nombre_empresa: 'Aseos', email: 'otra@persona.cl' }),
    ).not.toHaveLength(0);
  });
});

describe('la puerta /licita/alta', () => {
  const antes = process.env.INSTALACION;
  afterEach(() => {
    if (antes === undefined) delete process.env.INSTALACION;
    else process.env.INSTALACION = antes;
  });

  const contexto = {
    switchToHttp: () => ({
      getRequest: () => ({ method: 'POST', path: '/licita/alta' }),
    }),
  } as unknown as ExecutionContext;

  it('en Eventia (sin la variable o con otra cosa) responde 404 como una ruta que no existe', () => {
    const guardia = new SoloEnLicitaGuard();
    for (const valor of [undefined, 'eventia', 'otra']) {
      if (valor === undefined) delete process.env.INSTALACION;
      else process.env.INSTALACION = valor;
      expect(() => guardia.canActivate(contexto)).toThrow(NotFoundException);
      expect(() => guardia.canActivate(contexto)).toThrow(
        'Cannot POST /licita/alta',
      );
    }
  });

  it('en Licita deja pasar', () => {
    process.env.INSTALACION = 'licita';
    expect(new SoloEnLicitaGuard().canActivate(contexto)).toBe(true);
  });

  it('es pública para AuthGuard, con el guardia de Licita y el techo del alta de Eventia', () => {
    const manejador = LicitaController.prototype.alta;
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, manejador)).toBe(true);
    expect(Reflect.getMetadata('__guards__', LicitaController)).toEqual([
      SoloEnLicitaGuard,
    ]);
    // @nestjs/throttler guarda el techo como THROTTLER:LIMIT<nombre>.
    expect(Reflect.getMetadata('THROTTLER:LIMITdefault', manejador)).toBe(10);
    expect(Reflect.getMetadata('THROTTLER:TTLdefault', manejador)).toBe(60_000);
  });
});
