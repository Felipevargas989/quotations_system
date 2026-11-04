import type { Leccion } from 'src/cerebro/lecciones';
import type { LeccionesService } from 'src/cerebro/lecciones.service';
import { UserRole, type User } from 'src/users/entities/user.entity';
import { herramientasPara } from '../herramientas';
import type { ContextoDeHerramienta } from '../herramientas/comun';
import { ErrorDeHerramienta } from '../herramientas/comun';
import { mostrar } from '../herramientas/proponer';
import { LeccionesDesdeElChat } from '../propuestas/lecciones-desde-el-chat';
import type {
  Propuesta,
  PropuestasRepository,
} from '../propuestas/propuestas.repository';
import { armarServicio, camila, cotizacion } from './datos-de-prueba';

// LO QUE APRENDE BELIA DE LAS CORRECCIONES (doc 20 §17, mejora 5): la
// lección de administración queda aprobada al tiro, la de otro cargo espera,
// y aprobarla, descartarla u olvidarla es solo de administración.

const ID = '6f1c2b3a-4d5e-4f60-8a7b-9c0d1e2f3a4b';

const leccion = (c: Partial<Leccion> = {}): Leccion => ({
  id: ID,
  company_id: 1,
  tarea: 'armar',
  texto: 'Los paseos de curso no llevan cena.',
  motivo: null,
  estado: 'pendiente',
  propuesta_por_nombre: 'Camila',
  decidida_por_nombre: null,
  decidida_at: null,
  created_at: '2026-11-04T23:00:00Z',
  ...c,
});

const armar = (vivas: Leccion[] = []) => {
  const guardadas = {
    crearPropuesta: jest.fn().mockImplementation((fila: object) =>
      Promise.resolve({
        ...fila,
        id: 'p-lec',
        vence_at: '2026-11-05T02:00:00Z',
      }),
    ),
  };
  const lecciones = {
    vivas: jest.fn().mockResolvedValue(vivas),
    una: jest.fn().mockResolvedValue(vivas[0] ?? null),
    crear: jest.fn().mockImplementation((f: object) => Promise.resolve(f)),
    mover: jest.fn().mockResolvedValue(leccion({ estado: 'aprobada' })),
  };
  const chat = new LeccionesDesdeElChat(
    guardadas as unknown as PropuestasRepository,
    lecciones as unknown as LeccionesService,
  );
  return { chat, guardadas, lecciones };
};

const pedida = {
  texto: 'Los paseos de curso no llevan cena.',
  tarea: 'armar' as const,
  motivo: 'Felipe dijo «No» a la cena de la 484.',
};

describe('Anotar una lección', () => {
  it('la tarjeta lleva el texto, para qué vale y que la de administración queda aprobada', async () => {
    const { chat, guardadas } = armar();
    const t = await chat.proponer(camila(UserRole.ADMINISTRADOR), pedida);
    expect(t).toMatchObject({
      tipo: 'leccion',
      numero: null,
      cotizacion_id: null,
      leccion: { texto: pedida.texto, para: 'armar cotizaciones' },
    });
    expect(t.avisos[0]).toMatch(/queda aprobada/);
    const [fila] = guardadas.crearPropuesta.mock.calls[0] as [
      Record<string, unknown>,
    ];
    expect(fila).toMatchObject({
      company_id: 1,
      quotation_id: null,
      tipo: 'leccion',
      despues: { leccion: pedida },
    });
  });

  it('a otro cargo le avisa que espera a administración', async () => {
    const { chat } = armar();
    const t = await chat.proponer(camila(), pedida);
    expect(t.avisos[0]).toMatch(/esperando a administración/);
  });

  it('la que ya está anotada no se repite, aunque cambien tildes y mayúsculas', async () => {
    const { chat, guardadas } = armar([leccion({ estado: 'aprobada' })]);
    await expect(
      chat.proponer(camila(), {
        ...pedida,
        texto: 'los paseos de curso no llevan cená.',
      }),
    ).rejects.toThrow(ErrorDeHerramienta);
    expect(guardadas.crearPropuesta).not.toHaveBeenCalled();
  });

  it('el «Sí, anotar» de administración la deja aprobada; el de ventas, esperando', async () => {
    const { chat, lecciones } = armar();
    const p = {
      usuario_nombre: 'Camila',
      despues: { leccion: pedida },
    } as unknown as Propuesta;
    await chat.anotar(camila(UserRole.ADMINISTRADOR), p);
    expect(lecciones.crear).toHaveBeenLastCalledWith(
      expect.objectContaining({
        company_id: 1,
        estado: 'aprobada',
        tarea: 'armar',
        decidida_por: 'perfil-1',
      }),
    );
    const r = await chat.anotar(camila(), p);
    expect(lecciones.crear).toHaveBeenLastCalledWith(
      expect.objectContaining({ estado: 'pendiente' }),
    );
    expect(r.aviso).toMatch(/administración/);
  });
});

describe('Aprobar, descartar u olvidar una lección', () => {
  it('es solo de administración', async () => {
    const { chat } = armar([leccion()]);
    await expect(
      chat.proponerDecision(camila(), { id: ID, decision: 'aprobar' }),
    ).rejects.toThrow('administración');
  });

  it('se aprueba la que espera; no se olvida la que todavía no se aprueba', async () => {
    const { chat } = armar([leccion()]);
    const t = await chat.proponerDecision(camila(UserRole.ADMINISTRADOR), {
      id: ID,
      decision: 'aprobar',
    });
    expect(t).toMatchObject({
      tipo: 'leccion_estado',
      leccion: { decision: 'aprobar', propuesta_por: 'Camila' },
    });
    await expect(
      chat.proponerDecision(camila(UserRole.ADMINISTRADOR), {
        id: ID,
        decision: 'olvidar',
      }),
    ).rejects.toThrow('esperando a administración');
  });

  it('el «Sí» la mueve solo si sigue como estaba', async () => {
    const { chat, lecciones } = armar([leccion()]);
    const p = {
      despues: { id: ID, decision: 'aprobar' },
    } as unknown as Propuesta;
    await chat.decidir(camila(UserRole.ADMINISTRADOR), p);
    expect(lecciones.mover).toHaveBeenCalledWith(1, ID, 'pendiente', {
      estado: 'aprobada',
      decidida_por: 'perfil-1',
      decidida_por_nombre: 'Camila',
    });
    // Sin el nombre en la sesión, el de la tarjeta.
    await chat.decidir(
      { ...camila(UserRole.ADMINISTRADOR), full_name: undefined } as User,
      { ...p, usuario_nombre: 'Felipe Vargas' } as Propuesta,
    );
    expect(lecciones.mover).toHaveBeenLastCalledWith(
      1,
      ID,
      'pendiente',
      expect.objectContaining({ decidida_por_nombre: 'Felipe Vargas' }),
    );
    lecciones.mover.mockResolvedValue(null);
    await expect(
      chat.decidir(camila(UserRole.ADMINISTRADOR), p),
    ).rejects.toThrow('cambió entre medio');
  });
});

describe('Por la puerta de las propuestas', () => {
  it('el «Sí, anotar» llega a las lecciones y la propuesta queda aplicada', async () => {
    const { servicio, repositorio, leccionesDelChat } = armarServicio(
      cotizacion(),
      { tipo: 'leccion', quotation_id: null, despues: { leccion: pedida } },
    );
    const r = await servicio.aplicar(camila(UserRole.ADMINISTRADOR), 'p1');
    expect(leccionesDelChat.anotar).toHaveBeenCalled();
    expect(r.aviso).toMatch(/Anotada/);
    expect(repositorio.moverPropuesta).toHaveBeenLastCalledWith(
      1,
      'p1',
      'aplicando',
      expect.objectContaining({ estado: 'aplicada' }),
    );
  });

  it('una lección no se deshace: se olvida', async () => {
    const { servicio } = armarServicio(cotizacion(), {
      tipo: 'leccion',
      estado: 'aplicada',
    });
    await expect(servicio.deshacer(camila(), 'p1')).rejects.toThrow('olvide');
  });
});

describe('Las herramientas', () => {
  const nombres = (role: UserRole) =>
    herramientasPara({ role, derechos: ['base'] } as unknown as User).map(
      (h) => h.nombre,
    );
  it('anotar y leer, quien vende para arriba; decidir, solo administración', () => {
    expect(nombres(UserRole.VENDEDOR)).toEqual(
      expect.arrayContaining(['lecciones', 'proponer_leccion']),
    );
    expect(nombres(UserRole.VENDEDOR)).not.toContain(
      'proponer_decision_de_leccion',
    );
    expect(nombres(UserRole.ADMINISTRADOR)).toContain(
      'proponer_decision_de_leccion',
    );
    expect(nombres(UserRole.RECEPCION)).not.toContain('proponer_leccion');
  });

  it('una lección no reemplaza la tarjeta de un evento nuevo, ni otra lección', () => {
    const ctx = { tarjetas: [] } as unknown as ContextoDeHerramienta;
    const tarjeta = (tipo: string, id: string) =>
      ({ id, tipo, cotizacion_id: null }) as unknown as Parameters<
        typeof mostrar
      >[1];
    mostrar(ctx, tarjeta('cotizacion_nueva', 'a'));
    mostrar(ctx, tarjeta('leccion', 'b'));
    mostrar(ctx, tarjeta('leccion', 'c'));
    expect(ctx.tarjetas.map((t) => t.id)).toEqual(['a', 'b', 'c']);
  });
});
