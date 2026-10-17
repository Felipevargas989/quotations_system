import type { PinoLogger } from 'nestjs-pino';
import { BUCKET_PRIVADO } from 'src/storage/storage.service';
import type { SupabaseService } from 'src/supabase/supabase.service';
import { mockPinoLogger } from 'src/testing/mocks';
import { AnalisisRepository } from '../analisis/analisis.repository';

/** El repositorio de análisis contra una base falsa que anota cada
 *  consulta. Lo que fija: toda consulta es de UNA empresa, el índice único
 *  decide "uno a la vez", y los archivos salen del balde privado. */
type Consulta = { tabla: string; pasos: unknown[][] };

const METODOS = [
  'select',
  'insert',
  'update',
  'eq',
  'in',
  'lt',
  'order',
  'limit',
];

function armar(respuesta: { data?: unknown; error?: unknown } = {}) {
  const consultas: Consulta[] = [];
  const from = jest.fn((tabla: string) => {
    const consulta: Consulta = { tabla, pasos: [] };
    consultas.push(consulta);
    const resolver = () =>
      Promise.resolve({ data: null, error: null, ...respuesta });
    const cadena: Record<string, unknown> = {};
    for (const m of METODOS) {
      cadena[m] = (...args: unknown[]) => {
        consulta.pasos.push([m, ...args]);
        return cadena;
      };
    }
    cadena.single = () => resolver();
    cadena.maybeSingle = () => resolver();
    cadena.then = (
      bien: (v: unknown) => unknown,
      mal?: (e: unknown) => unknown,
    ) => resolver().then(bien, mal);
    return cadena;
  });
  const balde = {
    download: jest.fn().mockResolvedValue({
      data: new Blob([Buffer.from('%PDF')]),
      error: null,
    }),
  };
  const storage = { from: jest.fn(() => balde) };
  const repo = new AnalisisRepository(
    { client: { from, storage } } as unknown as SupabaseService,
    mockPinoLogger() as unknown as PinoLogger,
  );
  return { repo, consultas, storage };
}

const filtros = (c: Consulta) =>
  c.pasos.filter(([m]) => m === 'eq').map(([, campo, valor]) => [campo, valor]);

describe('AnalisisRepository', () => {
  it('el último: de la empresa y la oportunidad, el más nuevo', async () => {
    const { repo, consultas } = armar({ data: { id: 3 } });
    await expect(repo.ultimo(1, 40)).resolves.toEqual({ id: 3 });
    expect(consultas[0].tabla).toBe('oportunidad_analisis');
    expect(filtros(consultas[0])).toEqual([
      ['company_id', 1],
      ['oportunidad_id', 40],
    ]);
    expect(consultas[0].pasos).toContainEqual([
      'order',
      'creado_en',
      { ascending: false },
    ]);
  });

  it('crear: si el índice único dice que ya hay uno en curso, null', async () => {
    const { repo } = armar({ error: { code: '23505', message: 'duplicate' } });
    await expect(
      repo.crear({
        company_id: 1,
        oportunidad_id: 40,
        modelo: 'claude-opus-5-5',
        archivos: [],
        no_leidos: [],
        pedido_por: null,
      }),
    ).resolves.toBeNull();
  });

  it('terminar y dar por cortados exigen la empresa', async () => {
    const { repo, consultas } = armar();
    await repo.terminar(1, 5, { estado: 'listo' });
    expect(filtros(consultas[0])).toEqual([
      ['company_id', 1],
      ['id', 5],
    ]);
    await repo.abandonarAntesDe(1, 40, '2026-10-17T13:00:00.000Z');
    expect(filtros(consultas[1])).toEqual([
      ['company_id', 1],
      ['oportunidad_id', 40],
      ['estado', 'procesando'],
    ]);
    expect(consultas[1].pasos).toContainEqual([
      'lt',
      'creado_en',
      '2026-10-17T13:00:00.000Z',
    ]);
  });

  it('los archivos salen del balde privado', async () => {
    const { repo, storage } = armar();
    const datos = await repo.descargar('c1/oportunidades/40/x_Bases.pdf');
    expect(storage.from).toHaveBeenCalledWith(BUCKET_PRIVADO);
    expect(datos.toString()).toBe('%PDF');
  });
});

describe('El avance de "Mis licitaciones"', () => {
  it('los trabajos de varias oportunidades: de la empresa, livianos y lo más nuevo primero', async () => {
    const { repo, consultas } = armar({ data: [] });
    await repo.ultimosDe(1, [40, 87]);
    expect(consultas[0].tabla).toBe('oportunidad_analisis');
    expect(filtros(consultas[0])).toEqual([['company_id', 1]]);
    expect(consultas[0].pasos).toContainEqual([
      'in',
      'oportunidad_id',
      [40, 87],
    ]);
    expect(consultas[0].pasos).toContainEqual([
      'select',
      'oportunidad_id, estado, creado_en',
    ]);
    expect(consultas[0].pasos).toContainEqual([
      'order',
      'creado_en',
      { ascending: false },
    ]);
  });

  it('sin oportunidades no pregunta', async () => {
    const { repo, consultas } = armar();
    await expect(repo.ultimosDe(1, [])).resolves.toEqual([]);
    expect(consultas).toHaveLength(0);
  });
});
