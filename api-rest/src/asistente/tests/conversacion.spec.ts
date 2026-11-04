import { ValidationPipe } from '@nestjs/common';
import type { PinoLogger } from 'nestjs-pino';
import { UserRole, type User } from 'src/users/entities/user.entity';
import { mockPinoLogger } from '../../testing/mocks';
import type {
  ConversacionRepository,
  TurnoGuardado,
} from '../conversacion/conversacion.repository';
import {
  ConversacionService,
  MAX_CARACTERES,
  MAX_TURNOS_GUARDADOS,
  recortar,
} from '../conversacion/conversacion.service';
import { GuardarConversacionDto } from '../dto/conversacion.dto';

// LA CONVERSACIÓN DE CADA PERSONA (doc 20 §13, migración 182). Lo que
// importa: es la de la sesión, parte de cero si cambió el cargo y vence a
// los 90 días sin uso.

const persona = (role: UserRole = UserRole.VENDEDOR): User =>
  ({ id: 'perfil-1', company_id: 1, role }) as unknown as User;

const hace = (dias: number) =>
  new Date(Date.now() - dias * 86_400_000).toISOString();

const armar = (fila: unknown = null) => {
  const repositorio = {
    leer: jest.fn().mockResolvedValue(fila),
    guardar: jest.fn().mockResolvedValue(undefined),
    borrar: jest.fn().mockResolvedValue(undefined),
    borrarSinUso: jest.fn().mockResolvedValue(undefined),
  };
  const servicio = new ConversacionService(
    repositorio as unknown as ConversacionRepository,
    mockPinoLogger() as unknown as PinoLogger,
  );
  return { servicio, repositorio };
};

const turnos: TurnoGuardado[] = [
  { rol: 'persona', texto: '¿Qué tiene Rudel?' },
  { rol: 'belia', texto: 'La N° 500.' },
];

describe('leer la conversación', () => {
  it('la de la sesión, con la empresa y la persona de la sesión', async () => {
    const { servicio, repositorio } = armar({
      cargo: UserRole.VENDEDOR,
      turnos,
      updated_at: hace(1),
    });
    expect(await servicio.leer(persona())).toEqual(turnos);
    expect(repositorio.leer).toHaveBeenCalledWith(1, 'perfil-1');
    expect(repositorio.borrar).not.toHaveBeenCalled();
  });

  it('sin conversación guardada, vacía', async () => {
    const { servicio } = armar(null);
    expect(await servicio.leer(persona())).toEqual([]);
  });

  it('si se conversó con otro cargo, parte de cero y la borra', async () => {
    const { servicio, repositorio } = armar({
      cargo: UserRole.ADMINISTRADOR,
      turnos,
      updated_at: hace(1),
    });
    expect(await servicio.leer(persona(UserRole.RECEPCION))).toEqual([]);
    expect(repositorio.borrar).toHaveBeenCalledWith(1, 'perfil-1');
  });

  it('a los 90 días sin uso ya no vale y se borra', async () => {
    const { servicio, repositorio } = armar({
      cargo: UserRole.VENDEDOR,
      turnos,
      updated_at: hace(91),
    });
    expect(await servicio.leer(persona())).toEqual([]);
    expect(repositorio.borrar).toHaveBeenCalled();
  });
});

describe('guardar la conversación', () => {
  it('guarda con el cargo de la sesión y limpia las viejas de la empresa', async () => {
    const { servicio, repositorio } = armar(null);
    expect(
      await servicio.guardar(persona(), UserRole.VENDEDOR, turnos),
    ).toEqual({ reiniciada: false });
    expect(repositorio.guardar).toHaveBeenCalledWith(
      1,
      'perfil-1',
      UserRole.VENDEDOR,
      turnos,
    );
    expect(repositorio.borrarSinUso).toHaveBeenCalledWith(
      1,
      expect.any(String),
    );
  });

  it('si la pantalla cree tener otro cargo, no guarda: parte de cero', async () => {
    const { servicio, repositorio } = armar(null);
    expect(
      await servicio.guardar(
        persona(UserRole.RECEPCION),
        UserRole.ADMINISTRADOR,
        turnos,
      ),
    ).toEqual({ reiniciada: true });
    expect(repositorio.guardar).not.toHaveBeenCalled();
    expect(repositorio.borrar).toHaveBeenCalledWith(1, 'perfil-1');
  });

  it('si la guardada era de otro cargo, tampoco: parte de cero', async () => {
    const { servicio, repositorio } = armar({
      cargo: UserRole.ADMINISTRADOR,
      turnos,
      updated_at: hace(1),
    });
    expect(
      await servicio.guardar(
        persona(UserRole.VENDEDOR),
        UserRole.VENDEDOR,
        turnos,
      ),
    ).toEqual({ reiniciada: true });
    expect(repositorio.guardar).not.toHaveBeenCalled();
  });

  it('si la limpieza de las viejas falla, la conversación igual queda', async () => {
    const { servicio, repositorio } = armar(null);
    repositorio.borrarSinUso.mockRejectedValue(new Error('base lenta'));
    await expect(
      servicio.guardar(persona(), UserRole.VENDEDOR, turnos),
    ).resolves.toEqual({ reiniciada: false });
    expect(repositorio.guardar).toHaveBeenCalled();
  });

  it('«Nueva conversación» borra la de la sesión', async () => {
    const { servicio, repositorio } = armar(null);
    await servicio.borrar(persona());
    expect(repositorio.borrar).toHaveBeenCalledWith(1, 'perfil-1');
  });
});

describe('lo que se guarda', () => {
  it('los 30 más nuevos', () => {
    const muchos = Array.from({ length: 40 }, (_, i) => ({
      rol: 'persona' as const,
      texto: `pregunta ${i}`,
    }));
    const r = recortar(muchos);
    expect(r).toHaveLength(MAX_TURNOS_GUARDADOS);
    expect(r[0].texto).toBe('pregunta 10');
  });

  it('si pesan demasiado salen los más viejos, y el último queda', () => {
    const largo = 'a'.repeat(40_000);
    const r = recortar([
      { rol: 'persona', texto: largo },
      { rol: 'belia', texto: largo },
      { rol: 'persona', texto: largo },
    ]);
    expect(JSON.stringify(r).length).toBeLessThanOrEqual(MAX_CARACTERES);
    expect(r[r.length - 1].rol).toBe('persona');
  });
});

describe('lo que acepta PUT /asistente/conversacion', () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  });
  const validar = (body: unknown) =>
    pipe.transform(body, { type: 'body', metatype: GuardarConversacionDto });

  it('las tarjetas pasan tal cual, sin mirar adentro', async () => {
    const tarjeta = {
      id: 'p1',
      tipo: 'servicios',
      estado: 'aplicada',
      lineas: [{ dia: 'Día 1', que: 'Almuerzo', quita: [], agrega: ['x'] }],
    };
    const r = (await validar({
      cargo: 'vendedor',
      turnos: [{ rol: 'belia', texto: 'Listo', propuestas: [tarjeta] }],
    })) as GuardarConversacionDto;
    expect(r.turnos[0].propuestas).toEqual([tarjeta]);
  });

  it('rechaza un cargo que no existe y lo que BelIA está escribiendo', async () => {
    await expect(
      validar({ cargo: 'superadmin', turnos: [] }),
    ).rejects.toBeDefined();
    await expect(
      validar({
        cargo: 'vendedor',
        turnos: [{ rol: 'belia', texto: 'a medias', escribiendo: true }],
      }),
    ).rejects.toBeDefined();
  });

  it('rechaza más de 30 turnos', async () => {
    await expect(
      validar({
        cargo: 'vendedor',
        turnos: Array.from({ length: 31 }, () => ({
          rol: 'persona',
          texto: 'x',
        })),
      }),
    ).rejects.toBeDefined();
  });
});
