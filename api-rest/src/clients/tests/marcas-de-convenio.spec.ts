import { mockPinoLogger } from '../../testing/mocks';
import { ConveniosRepository } from '../convenios/convenios.repository';
import { MarcasDeConvenio } from '../convenios/marcas-de-convenio';

/**
 * EL EDIFICIO DE COLOR (doc 24 §7). Una base de mentira con dos empresas:
 * la 1 con plantilla y convenios, la 2 con un convenio pero SIN plantilla,
 * y la 3 con plantilla y un convenio propio.
 */
type Fila = Record<string, unknown>;
const TABLAS: Record<string, Fila[]> = {
  convenio_plantillas: [
    { id: 1, company_id: 1, activa: true },
    { id: 3, company_id: 3, activa: true },
    { id: 4, company_id: 2, activa: false },
  ],
  convenios: [
    {
      client_id: 'c-firmado',
      company_id: 1,
      estado: 'firmado',
      enviado_at: '2026-11-01T12:00:00Z',
      firmado_at: '2026-11-02T12:00:00Z',
      vence_at: '2029-11-02',
    },
    {
      client_id: 'c-enviado',
      company_id: 1,
      estado: 'enviado',
      enviado_at: '2026-11-18T12:00:00Z',
      firmado_at: null,
      vence_at: null,
    },
    {
      client_id: 'c-anulado',
      company_id: 1,
      estado: 'anulado',
      enviado_at: '2026-10-01T12:00:00Z',
      firmado_at: null,
      vence_at: null,
    },
    {
      client_id: 'c-de-la-2',
      company_id: 2,
      estado: 'firmado',
      enviado_at: null,
      firmado_at: '2026-11-02T12:00:00Z',
      vence_at: '2029-11-02',
    },
    {
      client_id: 'c-de-la-3',
      company_id: 3,
      estado: 'enviado',
      enviado_at: '2026-11-18T12:00:00Z',
      firmado_at: null,
      vence_at: null,
    },
  ],
};

let consultas: string[] = [];

function fakeSupabase() {
  const from = (tabla: string) => {
    consultas.push(tabla);
    let filas = [...(TABLAS[tabla] ?? [])];
    let head = false;
    const q = {
      select: (_c: string, opts?: { head?: boolean }) => {
        head = !!opts?.head;
        return q;
      },
      eq: (col: string, val: unknown) => {
        filas = filas.filter((f) => f[col] === val);
        return q;
      },
      in: (col: string, vals: unknown[]) => {
        filas = filas.filter((f) => vals.includes(f[col]));
        return q;
      },
      then: (
        ok: (r: { data: Fila[] | null; count: number; error: null }) => void,
      ) =>
        ok({
          data: head ? null : filas,
          count: filas.length,
          error: null,
        }),
    };
    return q;
  };
  return { client: { from } };
}

describe('MarcasDeConvenio (el edificio de color, doc 24 §7)', () => {
  let marcas: MarcasDeConvenio;

  beforeEach(() => {
    consultas = [];
    const repo = new ConveniosRepository(
      fakeSupabase() as never,
      mockPinoLogger() as never,
    );
    marcas = new MarcasDeConvenio(repo);
  });

  it('firmado y enviado traen su marca; anulado y sin convenio, nada', async () => {
    const clientes = [
      { id: 'c-firmado', name: 'A' },
      { id: 'c-enviado', name: 'B' },
      { id: 'c-anulado', name: 'C' },
      { id: 'c-sin', name: 'D' },
    ];
    const r = (await marcas.enClientes(1, clientes)) as Array<
      Fila & { convenio?: Fila }
    >;
    expect(r[0].convenio).toEqual({
      estado: 'firmado',
      enviado_at: '2026-11-01T12:00:00Z',
      firmado_at: '2026-11-02T12:00:00Z',
      vence_at: '2029-11-02',
    });
    expect(r[1].convenio?.estado).toBe('enviado');
    expect('convenio' in r[2]).toBe(false);
    expect('convenio' in r[3]).toBe(false);
  });

  it('una sola consulta de convenios por empresa, no una por cliente', async () => {
    const clientes = Array.from({ length: 50 }, (_, i) => ({ id: `x${i}` }));
    await marcas.enClientes(1, clientes);
    expect(consultas.filter((t) => t === 'convenios')).toHaveLength(1);
    expect(consultas.filter((t) => t === 'convenio_plantillas')).toHaveLength(
      1,
    );
  });

  it('otra empresa no ve los estados ajenos', async () => {
    // La 3 pide la lista con ids de clientes de la 1 (no debería pasar,
    // pero aunque pase): no reciben marca.
    const r = (await marcas.enClientes(3, [
      { id: 'c-firmado' },
      { id: 'c-enviado' },
      { id: 'c-de-la-3' },
    ])) as Array<Fila & { convenio?: Fila }>;
    expect('convenio' in r[0]).toBe(false);
    expect('convenio' in r[1]).toBe(false);
    expect(r[2].convenio?.estado).toBe('enviado');
  });

  it('empresa sin plantilla: la lista sale igual que hoy', async () => {
    const clientes = [{ id: 'c-de-la-2', name: 'E' }];
    const r = await marcas.enClientes(2, clientes);
    expect(r).toBe(clientes);
    expect(r).toEqual([{ id: 'c-de-la-2', name: 'E' }]);
    const filas = [
      { id: 'q1', client_id: 'c-de-la-2', clients: { name: 'E' } },
    ];
    expect(await marcas.enCotizaciones(2, filas)).toBe(filas);
  });

  it('en las cotizaciones la marca va dentro del cliente de la fila', async () => {
    const filas = [
      { id: 'q1', client_id: 'c-firmado', clients: { name: 'A' } },
      { id: 'q2', client_id: 'c-sin', clients: { name: 'D' } },
      { id: 'q3', client_id: null, clients: null },
    ];
    const r = (await marcas.enCotizaciones(1, filas)) as Array<{
      clients: (Fila & { convenio?: Fila }) | null;
    }>;
    expect(r[0].clients?.convenio?.estado).toBe('firmado');
    expect(r[0].clients?.name).toBe('A');
    expect(r[1]).toBe(filas[1]);
    expect(r[2]).toBe(filas[2]);
    // No toca la fila original.
    expect('convenio' in (filas[0].clients as object)).toBe(false);
  });
});
