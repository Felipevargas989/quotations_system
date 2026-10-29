import type { SupabaseService } from 'src/supabase/supabase.service';
import type { FilaDeLaZona } from '../datos-abiertos/mercado-de-la-zona';
import { MercadoDeLaZonaRepository } from '../datos-abiertos/mercado-de-la-zona.repository';

// LO QUE «SE VIENE» Y LOS COMPETIDORES LEEN DEL MERCADO (decisión 109,
// migración 172): la capa resumida `mercado_compras`, una región a la vez y
// por su código oficial; si todavía está vacía, la vista de la 169.

type Consulta = { tabla: string; pasos: unknown[][] };

const METODOS = [
  'select',
  'eq',
  'in',
  'gte',
  'gt',
  'order',
  'limit',
  'overlaps',
  'not',
];

const fila = (codigo: string, region: string): FilaDeLaZona => ({
  codigo,
  nombre: 'CENA DÍA DEL FUNCIONARIO',
  organismo: 'ILUSTRE MUNICIPALIDAD DE QUILLON',
  organismo_codigo: '135562',
  unidad: null,
  comuna: 'Quillón',
  region,
  fecha_publicacion: '2025-10-02',
  fecha_cierre: '2025-10-13',
  monto_estimado: 17_000_000,
  oferentes: 2,
  rubros: ['RESTAURANTES Y CATERING'],
  ganadores: [
    {
      rut: '76111111-1',
      nombre: 'VALLE DEL SOL SPA',
      cantidad: 1,
      monto_unitario: 13_949_580,
    },
  ],
});

/** Una base falsa: cada tabla tiene sus filas y la consulta filtra por
 *  región (código o nombre) y por código, como lo haría PostgREST. */
function armar(
  tablas: Record<string, Array<FilaDeLaZona & { region_codigo?: number }>>,
) {
  const consultas: Consulta[] = [];
  const from = jest.fn((tabla: string) => {
    const consulta: Consulta = { tabla, pasos: [] };
    consultas.push(consulta);
    const cadena: Record<string, unknown> = {};
    for (const m of METODOS) {
      cadena[m] = (...args: unknown[]) => {
        consulta.pasos.push([m, ...args]);
        return cadena;
      };
    }
    cadena.then = (bien: (v: unknown) => unknown) => {
      let filas = tablas[tabla] ?? [];
      for (const [m, campo, valor] of consulta.pasos) {
        if (m === 'eq' && campo === 'region_codigo')
          filas = filas.filter((f) => f.region_codigo === valor);
        if (m === 'in' && campo === 'region')
          filas = filas.filter((f) => (valor as string[]).includes(f.region!));
        if (m === 'in' && campo === 'codigo')
          filas = filas.filter((f) => (valor as string[]).includes(f.codigo));
        if (m === 'in' && campo === 'organismo_codigo')
          filas = filas.filter((f) =>
            (valor as string[]).includes(f.organismo_codigo ?? ''),
          );
        if (m === 'overlaps' && campo === 'rubros')
          filas = filas.filter((f) =>
            (f.rubros ?? []).some((r) => (valor as string[]).includes(r)),
          );
      }
      return Promise.resolve({ data: filas, error: null }).then(bien);
    };
    return cadena;
  });
  const repo = new MercadoDeLaZonaRepository({
    client: { from },
  } as unknown as SupabaseService);
  return { repo, consultas };
}

const filtro = (c: Consulta, campo: string) =>
  c.pasos.find(([m, f]) => m === 'eq' && f === campo)?.[2];

describe('Lo que «Se viene» y los competidores leen del mercado (decisión 109)', () => {
  it('lee la capa resumida, una región a la vez, por su código oficial y solo licitaciones del rubro', async () => {
    const { repo, consultas } = armar({
      mercado_compras: [
        { ...fila('1-1-LE25', 'Región del Ñuble'), region_codigo: 16 },
        { ...fila('2-2-LE25', 'Región del Biobío'), region_codigo: 8 },
        { ...fila('3-3-LE25', 'Región del Maule'), region_codigo: 7 },
      ],
    });
    const procesos = await repo.procesosDeLaZona(['Ñuble', 'Biobío']);
    expect(procesos.map((p) => p.codigo).sort()).toEqual([
      '1-1-LE25',
      '2-2-LE25',
    ]);
    expect(consultas.map((c) => c.tabla)).toEqual([
      'mercado_compras',
      'mercado_compras',
    ]);
    expect(consultas.map((c) => filtro(c, 'region_codigo'))).toEqual([8, 16]);
    expect(filtro(consultas[0], 'tipo')).toBe('licitacion');
    expect(filtro(consultas[0], 'del_rubro')).toBe(true);
    // Los ganadores llegan armados, con el RUT limpio.
    expect(procesos[0].adjudicacion?.ganadores?.[0]).toMatchObject({
      rut: '76111111-1',
      monto_unitario: 13_949_580,
    });
  });

  it('con la capa resumida vacía, lee la vista de la 169 como antes', async () => {
    const { repo, consultas } = armar({
      mercado_compras: [],
      mercado_licitaciones_con_ganadores: [
        fila('1-1-LE25', 'Región del Ñuble'),
      ],
    });
    const procesos = await repo.procesosDeLaZona(['Ñuble']);
    expect(procesos.map((p) => p.codigo)).toEqual(['1-1-LE25']);
    expect(consultas.map((c) => c.tabla)).toEqual([
      'mercado_compras',
      'mercado_licitaciones_con_ganadores',
    ]);
  });

  it('para la IA de «Se viene», busca en la capa resumida y en la vista solo lo que falta', async () => {
    const { repo, consultas } = armar({
      mercado_compras: [fila('1-1-LE25', 'Región del Ñuble')],
      mercado_licitaciones_con_ganadores: [
        fila('9-9-LE23', 'Región del Ñuble'),
      ],
    });
    const leidas = await repo.paraLeer(['1-1-LE25', '9-9-LE23']);
    expect(leidas.map((l) => l.codigo)).toEqual(['1-1-LE25', '9-9-LE23']);
    expect(consultas.map((c) => c.tabla)).toEqual([
      'mercado_compras',
      'mercado_licitaciones_con_ganadores',
    ]);
    expect(consultas[1].pasos).toContainEqual(['in', 'codigo', ['9-9-LE23']]);
  });

  it('sin regiones conocidas no consulta nada', async () => {
    const { repo, consultas } = armar({});
    expect(await repo.procesosDeLaZona(['Marte'])).toEqual([]);
    expect(consultas).toEqual([]);
  });
});

describe('«Quién ganó el año anterior» desde el mercado (decisión 109)', () => {
  it('lo adjudicado de esos compradores, solo licitaciones del rubro con ganador', async () => {
    const { repo, consultas } = armar({
      mercado_compras: [
        fila('4364-5-LE25', 'Región del Ñuble'),
        { ...fila('9-9-LE25', 'Región del Ñuble'), organismo_codigo: 'otro' },
      ],
    });
    const pasados = await repo.historialDeOrganismos(['135562', '135562']);
    expect(pasados?.map((p) => p.codigo)).toEqual(['4364-5-LE25']);
    const lectura = consultas[consultas.length - 1];
    expect(lectura.pasos).toContainEqual([
      'in',
      'organismo_codigo',
      ['135562'],
    ]);
    expect(lectura.pasos).toContainEqual(['not', 'ganadores', 'is', null]);
    expect(filtro(lectura, 'del_rubro')).toBe(true);
  });

  it('con la capa vacía responde null: el que llama usa la historia del radar', async () => {
    const { repo } = armar({ mercado_compras: [] });
    expect(await repo.historialDeOrganismos(['135562'])).toBeNull();
  });
});

describe('Lo que ya salió este año, para «Se viene» (decisión 110)', () => {
  it('lo del radar de esas regiones, por su nombre exacto, y las compras ágiles del rubro de los archivos, por su código', async () => {
    const { repo, consultas } = armar({
      mp_procesos: [
        {
          ...fila('3706-382-COT26', 'Región del Ñuble'),
          organismo_codigo: null,
        },
        { ...fila('1-1-COT26', 'Región del Maule'), organismo_codigo: null },
      ],
      mercado_compras: [
        { ...fila('2-2-COT26', 'Región del Ñuble'), region_codigo: 16 },
      ],
    });
    const recientes = await repo.recientesDeLaZona(['Ñuble']);
    expect(recientes.map((r) => r.codigo).sort()).toEqual([
      '2-2-COT26',
      '3706-382-COT26',
    ]);
    expect(consultas[0].tabla).toBe('mp_procesos');
    expect(consultas[0].pasos).toContainEqual([
      'in',
      'region',
      ['Región del Ñuble'],
    ]);
    expect(filtro(consultas[1], 'tipo')).toBe('compra_agil');
    expect(filtro(consultas[1], 'region_codigo')).toBe(16);
    // Diez minutos en memoria: la segunda vez no pregunta.
    await repo.recientesDeLaZona(['Ñuble']);
    expect(consultas).toHaveLength(2);
  });
});
