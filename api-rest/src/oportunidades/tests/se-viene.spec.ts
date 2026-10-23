import { NotFoundException } from '@nestjs/common';
import type { PinoLogger } from 'nestjs-pino';
import type { SupabaseService } from 'src/supabase/supabase.service';
import { mockPinoLogger } from 'src/testing/mocks';
import type { ProcesoDeLaZona, SeViene } from '../historia/mercado';
import {
  aniosConEdiciones,
  candidatasDe,
  preguntaDeRepeticion,
  repeticionValida,
} from '../historia/repeticion';
import {
  type LecturaDeSerie,
  SeVieneRepository,
} from '../historia/se-viene.repository';
import { SeVieneService } from '../historia/se-viene.service';
import {
  LECTURA_ACTUAL,
  LecturaDetenida,
  type LecturaService,
  type ProcesoParaLeer,
} from '../lectura/lectura.service';
import type { Lectura } from '../lectura/reglas';
import type { OportunidadesRepository } from '../oportunidades.repository';

// «SE VIENE» CON EL SEMÁFORO DE LA BANDEJA (decisión 62, 20-10) Y SI SE
// REPITE, SEGÚN LA IA (decisión 63). Felipe: "deberíamos filtrar con el
// mismo semáforo, no tiene sentido analizar 400 opciones"; "dos
// licitaciones con nombres similares, con montos similares, debería ser
// considerado una repetición; por eso es que usamos IA y no un bot"; y el
// botón descartar, "si es que yo siento que no se va a repetir". La IA va de
// mentira.

const zona = (
  codigo: string,
  nombre: string,
  fecha: string,
  extra: Partial<ProcesoDeLaZona> = {},
): ProcesoDeLaZona => ({
  codigo,
  nombre,
  organismo: 'ILUSTRE MUNICIPALIDAD DE QUILLON',
  organismo_codigo: '5040',
  unidad: null,
  comuna: 'Quillón',
  region: 'Región del Ñuble',
  fecha_publicacion: fecha,
  monto: 17_000_000,
  adjudicacion: null,
  ...extra,
});

const CAMPO_2025 = zona(
  '5040-25-LE25',
  'PROD. EVENTOS DÍA DE CAMPO DIRIGENTE SOCIAL 2025',
  '2025-11-10T12:00:00.000Z',
);
const CAMPO_2024 = zona(
  '5040-30-LE24',
  'PRODUCCION DIA DE CAMPO DIRIGENTES 2024',
  '2024-11-05T12:00:00.000Z',
  { monto: 16_000_000 },
);
const INSUMOS = zona(
  '2410-147-L125',
  'Adquisición de insumos asistenciales',
  '2025-09-22T12:00:00.000Z',
  { organismo_codigo: '2410', monto: 208_350 },
);

const serie = (p: ProcesoDeLaZona): SeViene => ({
  nombre: p.nombre,
  organismo: p.organismo,
  comuna: p.comuna,
  region: p.region,
  esperada: '2026-11-10T00:00:00.000Z',
  atrasada: false,
  anios: [new Date(p.fecha_publicacion as string).getUTCFullYear()],
  comuna_cercana: true,
  alto_valor: true,
  ultima: {
    codigo: p.codigo,
    fecha_publicacion: p.fecha_publicacion as string,
    monto: p.monto,
    oferentes: 1,
    ganadores: [],
  },
});

const paraLeer = (p: ProcesoDeLaZona): ProcesoParaLeer => ({
  codigo: p.codigo,
  tipo: 'licitacion',
  nombre: p.nombre,
  descripcion: null,
  organismo: p.organismo,
  unidad: null,
  comuna: p.comuna,
  region: p.region,
  monto: p.monto,
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

const leida = (
  codigo: string,
  extra: Partial<LecturaDeSerie> = {},
): LecturaDeSerie => ({
  codigo,
  semaforo: 'verde',
  razon: 'Celebración.',
  etiquetas: ['evento'],
  modelo: LECTURA_ACTUAL,
  ediciones: null,
  repeticion: null,
  descartada_en: null,
  ...extra,
});

const OPCIONES = {
  comunasCercanas: ['Quillón'],
  umbralAltoValor: 3_000_000,
  perfil: 'Centro de eventos en Quillón',
};

const ZONA = [CAMPO_2025, CAMPO_2024, INSUMOS];

function armar() {
  const repo = {
    lecturas: jest.fn().mockResolvedValue(new Map()),
    procesosParaLeer: jest.fn((codigos: string[]) =>
      Promise.resolve(
        ZONA.filter((p) => codigos.includes(p.codigo)).map(paraLeer),
      ),
    ),
    nombreDeLaEmpresa: jest.fn().mockResolvedValue('Valle del Sol'),
    guardar: jest.fn().mockResolvedValue(undefined),
    guardarRepeticion: jest.fn().mockResolvedValue(undefined),
    descartar: jest.fn().mockResolvedValue(true),
  };
  const oportunidades = {
    catalogoResumido: jest
      .fn()
      .mockResolvedValue({ paquetes: ['Día de campo'], fijos: [] }),
  };
  const lector = {
    configurado: true,
    leer: jest.fn().mockResolvedValue(lectura()),
    edicionesAnteriores: jest.fn().mockResolvedValue({
      anteriores: ['5040-30-LE24'],
      razon:
        'Es el mismo día de campo de los dirigentes, con un monto parecido.',
    }),
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
const esperar = async () => {
  for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));
};

describe('Si se repite: las candidatas y lo que contesta la IA (decisión 63)', () => {
  it('candidatas: del mismo comprador, de 6 a 40 meses antes, la más cercana a «un año antes» primero', () => {
    const otras = [
      zona(
        '5040-1-LE23',
        'Día de campo dirigentes 2023',
        '2023-11-02T12:00:00.000Z',
      ),
      zona(
        '5040-9-LE25',
        'Lo mismo, vuelto a publicar',
        '2025-10-28T12:00:00.000Z',
      ),
      zona('5040-2-LE21', 'Muy viejo', '2021-11-02T12:00:00.000Z'),
    ];
    const c = candidatasDe(CAMPO_2025, [...ZONA, ...otras]);
    expect(c.map((x) => x.codigo)).toEqual(['5040-30-LE24', '5040-1-LE23']);
    expect(c[0]).toEqual({
      codigo: '5040-30-LE24',
      nombre: 'PRODUCCION DIA DE CAMPO DIRIGENTES 2024',
      fecha_publicacion: '2024-11-05T12:00:00.000Z',
      monto: 16_000_000,
    });
    expect(candidatasDe(INSUMOS, ZONA)).toEqual([]);
  });

  it('la pregunta lleva nombre, fecha y monto de cada una', () => {
    const [c] = candidatasDe(CAMPO_2025, ZONA);
    const pregunta = preguntaDeRepeticion(
      {
        codigo: CAMPO_2025.codigo,
        nombre: CAMPO_2025.nombre,
        fecha_publicacion: CAMPO_2025.fecha_publicacion as string,
        monto: 17_000_000,
      },
      [c],
    );
    expect(pregunta).toContain(
      'La última vez: 5040-25-LE25 — PROD. EVENTOS DÍA DE CAMPO DIRIGENTE SOCIAL 2025 — 10-11-2025 — $17.000.000',
    );
    expect(pregunta).toContain(
      '- 5040-30-LE24 — PRODUCCION DIA DE CAMPO DIRIGENTES 2024 — 05-11-2024 — $16.000.000',
    );
  });

  it('de lo que contesta, solo los códigos de la lista y sin repetir', () => {
    const candidatas = candidatasDe(CAMPO_2025, ZONA);
    expect(
      repeticionValida(
        {
          anteriores: ['5040-30-LE24', ' 5040-30-LE24 ', 'inventado', 3],
          razon: ' Mismo evento. ',
        },
        candidatas,
      ),
    ).toEqual({ anteriores: ['5040-30-LE24'], razon: 'Mismo evento.' });
    expect(repeticionValida({ razon: 'sin lista' }, candidatas)).toBeNull();
  });

  it('los años: la última vez y sus ediciones', () => {
    const fechas = new Map(ZONA.map((p) => [p.codigo, p.fecha_publicacion]));
    expect(
      aniosConEdiciones(
        '5040-25-LE25',
        ['5040-30-LE24'],
        (c) => fechas.get(c) ?? null,
      ),
    ).toEqual([2024, 2025]);
  });
});

describe('Se viene con el semáforo (decisión 62) y si se repite (decisión 63)', () => {
  it('cada serie trae lo guardado: semáforo, si se repite (con sus años) y si está descartada', async () => {
    const { repo, servicio } = armar();
    repo.lecturas.mockResolvedValue(
      new Map([
        [
          '5040-25-LE25',
          leida('5040-25-LE25', {
            ediciones: ['5040-30-LE24'],
            repeticion: 'El mismo día de campo.',
          }),
        ],
        [
          '2410-147-L125',
          leida('2410-147-L125', {
            semaforo: 'rojo',
            ediciones: [],
            descartada_en: '2026-10-20T23:00:00.000Z',
          }),
        ],
      ]),
    );
    const r = await servicio.conSemaforo(
      1,
      [serie(CAMPO_2025), serie(INSUMOS)],
      ZONA,
      OPCIONES,
    );
    expect(r[0]).toMatchObject({
      semaforo: 'verde',
      repite: true,
      repeticion: 'El mismo día de campo.',
      anios: [2024, 2025],
      descartada: false,
    });
    expect(r[1]).toMatchObject({
      semaforo: 'rojo',
      repite: false,
      anios: [2025],
      descartada: true,
    });
    // Todo leído: no manda a leer nada.
    expect(servicio.estado(1).leyendo).toBe(false);
  });

  it('lo que falta sale sin color y se manda a leer: semáforo y repetición', async () => {
    const { repo, lector, servicio } = armar();
    const r = await servicio.conSemaforo(
      1,
      [serie(CAMPO_2025)],
      ZONA,
      OPCIONES,
    );
    expect(r[0]).toMatchObject({ semaforo: null, repite: null, anios: [2025] });
    expect(servicio.estado(1)).toEqual({ leyendo: true, leidas: 0, total: 1 });
    await esperar();
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
      expect.objectContaining({ semaforo: 'verde' }),
      LECTURA_ACTUAL,
    );
    expect(lector.edicionesAnteriores).toHaveBeenCalledWith(
      expect.stringContaining('5040-30-LE24'),
      [expect.objectContaining({ codigo: '5040-30-LE24' })],
      expect.anything(),
    );
    expect(repo.guardarRepeticion).toHaveBeenCalledWith(
      1,
      '5040-25-LE25',
      ['5040-30-LE24'],
      'Es el mismo día de campo de los dirigentes, con un monto parecido.',
    );
    expect(servicio.estado(1).leyendo).toBe(false);
  });

  it('con el semáforo ya leído, solo pregunta si se repite; sin candidatas, «una sola vez» sin IA', async () => {
    const { repo, lector, servicio } = armar();
    repo.lecturas.mockResolvedValue(
      new Map([
        ['5040-25-LE25', leida('5040-25-LE25')],
        ['2410-147-L125', leida('2410-147-L125', { semaforo: 'rojo' })],
      ]),
    );
    await servicio.conSemaforo(
      1,
      [serie(CAMPO_2025), serie(INSUMOS)],
      ZONA,
      OPCIONES,
    );
    await esperar();
    expect(lector.leer).not.toHaveBeenCalled();
    expect(lector.edicionesAnteriores).toHaveBeenCalledTimes(1);
    expect(repo.guardarRepeticion).toHaveBeenCalledWith(
      1,
      '2410-147-L125',
      [],
      'No hay otra licitación de este comprador en los años anteriores.',
    );
  });

  it('la lectura del radar y sus reglas: el rojo de la IA queda rojo, con el aviso de comuna cercana (decisión 72)', async () => {
    const { repo, lector, servicio } = armar();
    lector.leer.mockResolvedValue(lectura({ semaforo: 'rojo' }));
    await servicio.conSemaforo(1, [serie(CAMPO_2025)], ZONA, OPCIONES);
    await esperar();
    expect(repo.guardar).toHaveBeenCalledWith(
      1,
      '5040-25-LE25',
      // Roja: el alto valor no avisa.
      expect.objectContaining({
        semaforo: 'rojo',
        alertas: ['comuna_cercana'],
      }),
      LECTURA_ACTUAL,
    );
  });

  it('el reciclaje: roja, de una comuna cercana y del rubro; la roja sin eso es la basura (decisión 72)', async () => {
    const { repo, servicio } = armar();
    repo.lecturas.mockResolvedValue(
      new Map([
        [
          '5040-25-LE25',
          leida('5040-25-LE25', {
            semaforo: 'rojo',
            etiquetas: ['alimentacion'],
            ediciones: [],
          }),
        ],
        [
          '2410-147-L125',
          leida('2410-147-L125', {
            semaforo: 'rojo',
            etiquetas: ['otro'],
            ediciones: [],
          }),
        ],
      ]),
    );
    const lejos = { ...serie(CAMPO_2024), comuna_cercana: false };
    const r = await servicio.conSemaforo(
      1,
      [serie(CAMPO_2025), serie(INSUMOS), lejos],
      ZONA,
      OPCIONES,
    );
    expect(r.map((s) => s.reciclaje)).toEqual([true, false, false]);
  });

  it('leída con otras reglas: se relee solo el color, sin volver a preguntar si se repite; la descartada no', async () => {
    const { repo, lector, servicio } = armar();
    repo.lecturas.mockResolvedValue(
      new Map([
        [
          '5040-25-LE25',
          leida('5040-25-LE25', {
            semaforo: 'amarillo',
            modelo: `${LECTURA_ACTUAL} · antes del reciclaje`,
            ediciones: ['5040-30-LE24'],
          }),
        ],
        [
          '2410-147-L125',
          leida('2410-147-L125', {
            semaforo: 'amarillo',
            modelo: `${LECTURA_ACTUAL} · antes del reciclaje`,
            ediciones: [],
            descartada_en: '2026-10-20T23:00:00.000Z',
          }),
        ],
      ]),
    );
    lector.leer.mockResolvedValue(lectura({ semaforo: 'rojo' }));
    await servicio.conSemaforo(
      1,
      [serie(CAMPO_2025), serie(INSUMOS)],
      ZONA,
      OPCIONES,
    );
    await esperar();
    expect(lector.leer).toHaveBeenCalledTimes(1);
    expect(repo.guardar).toHaveBeenCalledWith(
      1,
      '5040-25-LE25',
      expect.objectContaining({ semaforo: 'rojo' }),
      LECTURA_ACTUAL,
    );
    expect(lector.edicionesAnteriores).not.toHaveBeenCalled();
    expect(repo.guardarRepeticion).not.toHaveBeenCalled();
  });

  it('una lectura a la vez por empresa', async () => {
    const { repo, servicio } = armar();
    await servicio.conSemaforo(1, [serie(CAMPO_2025)], ZONA, OPCIONES);
    await servicio.conSemaforo(1, [serie(CAMPO_2025)], ZONA, OPCIONES);
    await esperar();
    expect(repo.procesosParaLeer).toHaveBeenCalledTimes(1);
    expect(repo.guardar).toHaveBeenCalledTimes(1);
  });

  it('lo que no se pudo leer no se vuelve a mandar en la hora siguiente', async () => {
    const { repo, lector, servicio } = armar();
    lector.leer.mockResolvedValue(null);
    await servicio.conSemaforo(1, [serie(CAMPO_2025)], ZONA, OPCIONES);
    await esperar();
    await servicio.conSemaforo(1, [serie(CAMPO_2025)], ZONA, OPCIONES);
    await esperar();
    expect(lector.leer).toHaveBeenCalledTimes(1);
    expect(repo.guardar).not.toHaveBeenCalled();
    expect(lector.edicionesAnteriores).not.toHaveBeenCalled();
  });

  it('si la cuenta falla, para: no sigue gastando en el resto', async () => {
    const { lector, servicio } = armar();
    lector.leer.mockRejectedValue(new LecturaDetenida('sin saldo'));
    const muchas = Array.from({ length: 20 }, (_, i) =>
      zona(`5040-${i}-LE25`, `Cena ${i}`, '2025-11-10T12:00:00.000Z', {
        organismo_codigo: `9${i}`,
      }),
    );
    await servicio.conSemaforo(1, muchas.map(serie), muchas, OPCIONES);
    await esperar();
    expect(lector.leer.mock.calls.length).toBeLessThanOrEqual(6);
  });

  it('sin llave de Anthropic no manda a leer, y sin series no pregunta nada', async () => {
    const { repo, lector, servicio } = armar();
    lector.configurado = false;
    await servicio.conSemaforo(1, [serie(CAMPO_2025)], ZONA, OPCIONES);
    expect(repo.procesosParaLeer).not.toHaveBeenCalled();
    await expect(servicio.conSemaforo(1, [], ZONA, OPCIONES)).resolves.toEqual(
      [],
    );
    expect(repo.lecturas).toHaveBeenCalledTimes(1);
  });

  it('descartar: de la empresa; si la serie no está leída, 404', async () => {
    const { repo, servicio } = armar();
    await expect(servicio.descartar(1, '5040-25-LE25', true)).resolves.toEqual({
      codigo: '5040-25-LE25',
      descartada: true,
    });
    expect(repo.descartar).toHaveBeenCalledWith(1, '5040-25-LE25', true);
    repo.descartar.mockResolvedValue(false);
    await expect(
      servicio.descartar(1, 'no-existe', true),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('SeVieneRepository (migraciones 156 y 157)', () => {
  type Consulta = { tabla: string; pasos: unknown[][] };
  function armarBase(data: unknown = []) {
    const consultas: Consulta[] = [];
    const from = jest.fn((tabla: string) => {
      const consulta: Consulta = { tabla, pasos: [] };
      consultas.push(consulta);
      const cadena: Record<string, unknown> = {};
      for (const m of ['select', 'eq', 'in', 'upsert', 'update']) {
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
    const { repo, consultas } = armarBase([leida('1-0-LE25')]);
    const codigos = Array.from({ length: 150 }, (_, i) => `1-${i}-LE25`);
    const leidas = await repo.lecturas(7, codigos);
    expect(leidas.get('1-0-LE25')).toEqual(leida('1-0-LE25'));
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
    // La lectura del semáforo no toca lo de la repetición ni el descarte.
    expect(fila).not.toHaveProperty('ediciones');
    expect(fila).not.toHaveProperty('descartada_en');
    expect(opciones).toEqual({ onConflict: 'company_id,codigo' });
  });

  it('la repetición y el descarte, en la fila de esa empresa y serie', async () => {
    const { repo, consultas } = armarBase([{ codigo: '5040-25-LE25' }]);
    await repo.guardarRepeticion(7, '5040-25-LE25', ['5040-30-LE24'], 'Mismo.');
    await expect(repo.descartar(7, '5040-25-LE25', true)).resolves.toBe(true);
    for (const c of consultas) {
      expect(c.pasos).toContainEqual(['eq', 'company_id', 7]);
      expect(c.pasos).toContainEqual(['eq', 'codigo', '5040-25-LE25']);
    }
    expect(consultas[0].pasos[0]).toEqual([
      'update',
      { ediciones: ['5040-30-LE24'], repeticion: 'Mismo.' },
    ]);
    const [, cambio] = consultas[1].pasos[0] as [
      string,
      { descartada_en: unknown },
    ];
    expect(typeof cambio.descartada_en).toBe('string');
    const { repo: vacio } = armarBase([]);
    await expect(vacio.descartar(7, 'no-existe', false)).resolves.toBe(false);
  });
});
