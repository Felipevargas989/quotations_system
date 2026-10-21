import type { PinoLogger } from 'nestjs-pino';
import type { SupabaseService } from 'src/supabase/supabase.service';
import { mockPinoLogger } from 'src/testing/mocks';
import type { SeViene } from '../historia/mercado';
import { SeVieneRepository } from '../historia/se-viene.repository';
import { SeVieneService } from '../historia/se-viene.service';
import {
  LECTURA_ACTUAL,
  LecturaDetenida,
  type LecturaService,
  type ProcesoParaLeer,
} from '../lectura/lectura.service';
import type { Lectura } from '../lectura/reglas';
import type { OportunidadesRepository } from '../oportunidades.repository';

// «SE VIENE» CON EL SEMÁFORO DE LA BANDEJA (decisión 62, 20-10). Felipe:
// "deberíamos filtrar con el mismo semáforo, no tiene sentido analizar 400
// opciones". Cada serie se lee una vez, por su última vez, con la lectura
// del radar y sus reglas fijas; lo que falta se lee por detrás. La IA va de
// mentira.

const serie = (codigo: string, nombre: string): SeViene => ({
  nombre,
  organismo: 'ILUSTRE MUNICIPALIDAD DE QUILLON',
  comuna: 'Quillón',
  esperada: '2026-11-10T00:00:00.000Z',
  atrasada: false,
  anios: [2024, 2025],
  comuna_cercana: true,
  alto_valor: true,
  ultima: {
    codigo,
    fecha_publicacion: '2025-11-10T00:00:00.000Z',
    monto: 17_000_000,
    oferentes: 1,
    ganadores: [],
  },
});

const proceso = (codigo: string, nombre: string): ProcesoParaLeer => ({
  codigo,
  tipo: 'licitacion',
  nombre,
  descripcion: null,
  organismo: 'ILUSTRE MUNICIPALIDAD DE QUILLON',
  unidad: null,
  comuna: 'Quillón',
  region: 'Región del Ñuble',
  monto: 17_000_000,
  fecha_cierre: null,
  productos: [],
});

const lectura = (extra: Partial<Lectura> = {}): Lectura => ({
  semaforo: 'verde',
  etiquetas: ['evento'],
  se_hace_en_el_complejo: 'si',
  razon: 'Celebración para un grupo: se hace en el complejo.',
  ...extra,
});

const OPCIONES = {
  comunasCercanas: ['Quillón'],
  umbralAltoValor: 3_000_000,
  perfil: 'Centro de eventos en Quillón',
};

function armar() {
  const repo = {
    lecturas: jest.fn().mockResolvedValue(new Map()),
    procesosParaLeer: jest.fn().mockResolvedValue([]),
    nombreDeLaEmpresa: jest.fn().mockResolvedValue('Valle del Sol'),
    guardar: jest.fn().mockResolvedValue(undefined),
  };
  const oportunidades = {
    catalogoResumido: jest
      .fn()
      .mockResolvedValue({ paquetes: ['Día de campo'], fijos: [] }),
  };
  const lector = {
    configurado: true,
    leer: jest.fn().mockResolvedValue(lectura()),
  };
  const servicio = new SeVieneService(
    repo as unknown as SeVieneRepository,
    oportunidades as unknown as OportunidadesRepository,
    lector as unknown as LecturaService,
    mockPinoLogger() as unknown as PinoLogger,
  );
  return { repo, oportunidades, lector, servicio };
}

/** Deja correr lo que quedó por detrás. */
const esperar = () => new Promise((r) => setTimeout(r, 0));

describe('Se viene con el semáforo de la bandeja (decisión 62)', () => {
  it('cada serie trae su semáforo guardado, y lo que falta sale sin color y se manda a leer', async () => {
    const { repo, servicio } = armar();
    repo.lecturas.mockResolvedValue(
      new Map([
        [
          '5040-25-LE25',
          { codigo: '5040-25-LE25', semaforo: 'verde', razon: 'Celebración.' },
        ],
      ]),
    );
    const r = await servicio.conSemaforo(
      1,
      [
        serie('5040-25-LE25', 'PROD. EVENTOS DÍA DE CAMPO DIRIGENTE SOCIAL'),
        serie('2410-147-L125', 'Adquisición de insumos asistenciales'),
      ],
      OPCIONES,
    );
    expect(repo.lecturas).toHaveBeenCalledWith(1, [
      '5040-25-LE25',
      '2410-147-L125',
    ]);
    expect(r.map((s) => [s.ultima.codigo, s.semaforo, s.razon])).toEqual([
      ['5040-25-LE25', 'verde', 'Celebración.'],
      ['2410-147-L125', null, null],
    ]);
    expect(servicio.estado(1)).toEqual({ leyendo: true, leidas: 0, total: 1 });
    expect(repo.procesosParaLeer).toHaveBeenCalledWith(['2410-147-L125']);
  });

  it('lee con la lectura del radar y sus reglas: comuna cercana y del rubro nunca queda roja', async () => {
    const { repo, lector, servicio } = armar();
    repo.procesosParaLeer.mockResolvedValue([
      proceso('5040-25-LE25', 'PROD. EVENTOS DÍA DE CAMPO DIRIGENTE SOCIAL'),
    ]);
    lector.leer.mockResolvedValue(lectura({ semaforo: 'rojo' }));
    await expect(servicio.leer(1, ['5040-25-LE25'], OPCIONES)).resolves.toBe(1);
    expect(lector.leer).toHaveBeenCalledWith(
      expect.objectContaining({ codigo: '5040-25-LE25' }),
      {
        nombre: 'Valle del Sol',
        perfil: 'Centro de eventos en Quillón',
        paquetes: ['Día de campo'],
        fijos: [],
      },
      expect.anything(),
    );
    expect(repo.guardar).toHaveBeenCalledWith(
      1,
      '5040-25-LE25',
      expect.objectContaining({ semaforo: 'amarillo' }),
      LECTURA_ACTUAL,
    );
  });

  it('una lectura a la vez por empresa, y al terminar lo vuelve a decir', async () => {
    const { repo, servicio } = armar();
    repo.procesosParaLeer.mockResolvedValue([
      proceso('2410-147-L125', 'Adquisición de insumos asistenciales'),
    ]);
    const series = [serie('2410-147-L125', 'Adquisición de insumos')];
    await servicio.conSemaforo(1, series, OPCIONES);
    await servicio.conSemaforo(1, series, OPCIONES);
    expect(repo.procesosParaLeer).toHaveBeenCalledTimes(1);
    await esperar();
    await esperar();
    expect(servicio.estado(1)).toEqual({ leyendo: false, leidas: 0, total: 0 });
    expect(repo.guardar).toHaveBeenCalledTimes(1);
  });

  it('lo que no se pudo leer no se vuelve a mandar en la hora siguiente', async () => {
    const { repo, lector, servicio } = armar();
    repo.procesosParaLeer.mockResolvedValue([
      proceso('2410-147-L125', 'Adquisición de insumos asistenciales'),
    ]);
    lector.leer.mockResolvedValue(null);
    const series = [serie('2410-147-L125', 'Adquisición de insumos')];
    await servicio.conSemaforo(1, series, OPCIONES);
    await esperar();
    await esperar();
    await servicio.conSemaforo(1, series, OPCIONES);
    expect(repo.procesosParaLeer).toHaveBeenCalledTimes(1);
    expect(repo.guardar).not.toHaveBeenCalled();
  });

  it('si la cuenta falla, para: no sigue gastando en el resto', async () => {
    const { repo, lector, servicio } = armar();
    repo.procesosParaLeer.mockResolvedValue(
      Array.from({ length: 20 }, (_, i) => proceso(`1-${i}-LE25`, `Cena ${i}`)),
    );
    lector.leer.mockRejectedValue(new LecturaDetenida('sin saldo'));
    await expect(
      servicio.leer(
        1,
        Array.from({ length: 20 }, (_, i) => `1-${i}-LE25`),
        OPCIONES,
      ),
    ).resolves.toBe(0);
    // Seis lectores: cada uno intenta una y para.
    expect(lector.leer.mock.calls.length).toBeLessThanOrEqual(6);
    expect(repo.guardar).not.toHaveBeenCalled();
  });

  it('sin llave de Anthropic no manda a leer, y sin series no pregunta nada', async () => {
    const { repo, lector, servicio } = armar();
    lector.configurado = false;
    await servicio.conSemaforo(1, [serie('1-1-LE25', 'Cena')], OPCIONES);
    expect(repo.procesosParaLeer).not.toHaveBeenCalled();
    await expect(servicio.conSemaforo(1, [], OPCIONES)).resolves.toEqual([]);
    expect(repo.lecturas).toHaveBeenCalledTimes(1);
  });
});

describe('SeVieneRepository (migración 156)', () => {
  type Consulta = { tabla: string; pasos: unknown[][] };
  function armarBase(data: unknown = []) {
    const consultas: Consulta[] = [];
    const from = jest.fn((tabla: string) => {
      const consulta: Consulta = { tabla, pasos: [] };
      consultas.push(consulta);
      const cadena: Record<string, unknown> = {};
      for (const m of ['select', 'eq', 'in', 'upsert']) {
        cadena[m] = (...args: unknown[]) => {
          consulta.pasos.push([m, ...args]);
          return cadena;
        };
      }
      cadena.maybeSingle = () => Promise.resolve({ data, error: null });
      cadena.then = (bien: (v: unknown) => unknown) =>
        Promise.resolve({ data, error: null }).then(bien);
      return cadena;
    });
    const repo = new SeVieneRepository(
      { client: { from } } as unknown as SupabaseService,
      mockPinoLogger() as unknown as PinoLogger,
    );
    return { repo, consultas };
  }

  it('lo leído es de UNA empresa, y se pregunta de a 100 códigos', async () => {
    const { repo, consultas } = armarBase([
      { codigo: '1-0-LE25', semaforo: 'verde', razon: 'Cena.' },
    ]);
    const codigos = Array.from({ length: 150 }, (_, i) => `1-${i}-LE25`);
    const leidas = await repo.lecturas(7, codigos);
    expect(leidas.get('1-0-LE25')).toEqual({
      codigo: '1-0-LE25',
      semaforo: 'verde',
      razon: 'Cena.',
    });
    expect(consultas).toHaveLength(2);
    for (const c of consultas) {
      expect(c.tabla).toBe('oportunidades_se_viene');
      expect(c.pasos).toContainEqual(['eq', 'company_id', 7]);
    }
    expect(
      (consultas[0].pasos.find(([m]) => m === 'in') as unknown[])[2],
    ).toHaveLength(100);
  });

  it('guarda una lectura por empresa y serie, con el modelo', async () => {
    const { repo, consultas } = armarBase(null);
    await repo.guardar(7, '5040-25-LE25', lectura(), LECTURA_ACTUAL);
    const [, fila, opciones] = consultas[0].pasos[0] as [
      string,
      Record<string, unknown>,
      unknown,
    ];
    expect(consultas[0].tabla).toBe('oportunidades_se_viene');
    expect(fila).toMatchObject({
      company_id: 7,
      codigo: '5040-25-LE25',
      semaforo: 'verde',
      etiquetas: ['evento'],
      se_hace_en_el_complejo: 'si',
      modelo: LECTURA_ACTUAL,
    });
    expect(opciones).toEqual({ onConflict: 'company_id,codigo' });
  });
});
