import { ConveniosRepository } from '../../clients/convenios/convenios.repository';
import { MarcasDeConvenio } from '../../clients/convenios/marcas-de-convenio';
import { mockPinoLogger } from '../../testing/mocks';
import { AudienciasService } from '../audiencias.service';
import { resolverSegmento } from '../segmento';

/**
 * LAS AUDIENCIAS DE CONVENIO (doc 24 §9, Felipe 19-11-2026: «yo
 * distinguiría dos, con y sin convenio… para mí son dos estados»).
 * «Con convenio» = firmado; «Sin convenio» = los demás que no son
 * particulares, también los enviados sin firmar.
 */

const HOY = '2026-11-19';
const CLIENTES = [
  {
    id: 'c-firmado',
    name: 'Firmada SpA',
    email: 'f@f.cl',
    client_type: 'Empresas',
  },
  {
    id: 'c-enviado',
    name: 'Enviada SpA',
    email: 'e@e.cl',
    client_type: 'Empresas',
  },
  {
    id: 'c-sin',
    name: 'Sin Nada SpA',
    email: 's@s.cl',
    client_type: 'Colegios',
  },
  {
    id: 'c-part',
    name: 'Juana Pérez',
    email: 'j@j.cl',
    client_type: 'Particular',
  },
  { id: 'c-otro-tipo', name: 'Sin tipo', email: 't@t.cl', client_type: null },
];
const CONVENIOS = {
  firmados: new Set(['c-firmado']),
  particulares: new Set(['particular']),
};
const correos = (filtro: Parameters<typeof resolverSegmento>[3]) =>
  resolverSegmento(CLIENTES, [], [], filtro, HOY, CONVENIOS).map(
    (d) => d.email,
  );

describe('resolverSegmento con el filtro «Convenio»', () => {
  it('sin elegir nada, todo queda como hoy (particulares incluidos)', () => {
    expect(correos({})).toEqual([
      'f@f.cl',
      'e@e.cl',
      's@s.cl',
      'j@j.cl',
      't@t.cl',
    ]);
  });

  it('«Con convenio» son solo los firmados', () => {
    expect(correos({ convenio: 'con' })).toEqual(['f@f.cl']);
  });

  it('«Sin convenio»: el enviado sin firmar cae acá y los particulares quedan fuera', () => {
    expect(correos({ convenio: 'sin' })).toEqual([
      'e@e.cl',
      's@s.cl',
      't@t.cl',
    ]);
  });

  it('el particular se reconoce sin mayúsculas ni espacios de diferencia', () => {
    const conEspacios = [{ ...CLIENTES[3], client_type: '  PARTICULAR ' }];
    expect(
      resolverSegmento(
        conEspacios,
        [],
        [],
        { convenio: 'sin' },
        HOY,
        CONVENIOS,
      ),
    ).toEqual([]);
  });

  it('se combina con los demás filtros (tipo de cliente y qué pasó con ellos)', () => {
    expect(correos({ convenio: 'sin', tipos_cliente: ['Colegios'] })).toEqual([
      's@s.cl',
    ]);
    const cotizaciones = [
      {
        client_id: 'c-enviado',
        quotation_status: 'realizada',
        event_date: '2026-10-01',
        total_amount: 1,
        event_type: 'Paseo',
        created_at: '2026-09-01',
      },
    ];
    expect(
      resolverSegmento(
        CLIENTES,
        cotizaciones,
        [],
        { convenio: 'sin', con_estados: ['realizada'] },
        HOY,
        CONVENIOS,
      ).map((d) => d.email),
    ).toEqual(['e@e.cl']);
  });

  it('sin datos de convenio (empresa sin plantilla), «Con convenio» queda vacía', () => {
    expect(
      resolverSegmento(CLIENTES, [], [], { convenio: 'con' }, HOY),
    ).toEqual([]);
  });
});

// ---- El servicio, con una base de mentira de dos empresas ----
type Fila = Record<string, unknown>;
const TABLAS: Record<string, Fila[]> = {
  convenio_plantillas: [
    { id: 1, company_id: 1, activa: true },
    { id: 2, company_id: 2, activa: false },
  ],
  convenios: [
    { client_id: 'c-firmado', company_id: 1, estado: 'firmado' },
    { client_id: 'c-enviado', company_id: 1, estado: 'enviado' },
    // De OTRA empresa, con el id de un cliente de la 1: no debe contar.
    { client_id: 'c-sin', company_id: 2, estado: 'firmado' },
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
      ) => ok({ data: head ? null : filas, count: filas.length, error: null }),
    };
    return q;
  };
  return { client: { from } };
}

describe('AudienciasService con el filtro «Convenio»', () => {
  let servicio: AudienciasService;

  beforeEach(() => {
    consultas = [];
    const marcas = new MarcasDeConvenio(
      new ConveniosRepository(
        fakeSupabase() as never,
        mockPinoLogger() as never,
      ),
    );
    const repo = {
      clientesSegmentables: jest.fn().mockResolvedValue(CLIENTES),
      cotizacionesSegmentables: jest.fn().mockResolvedValue([]),
      contactosDeClientes: jest.fn().mockResolvedValue([]),
      suprimidos: jest.fn().mockResolvedValue(new Set(['s@s.cl'])),
      audienciasGuardadas: jest.fn().mockResolvedValue([
        { id: 1, nombre: 'Con convenio', filtro: { convenio: 'con' } },
        { id: 2, nombre: 'Sin convenio', filtro: { convenio: 'sin' } },
        { id: 3, nombre: 'Todos', filtro: {} },
      ]),
    };
    const alcance = {
      particulares: jest.fn().mockResolvedValue(new Set(['particular'])),
    };
    servicio = new AudienciasService(
      repo as never,
      mockPinoLogger() as never,
      marcas,
      alcance as never,
    );
  });

  it('la previa descuenta las bajas y respeta el filtro', async () => {
    const r = await servicio.previaSegmento({ filtro: { convenio: 'sin' } }, 1);
    // s@s.cl está dado de baja: no aparece.
    expect(r.muestra.map((m) => m.email)).toEqual(['e@e.cl', 't@t.cl']);
    expect(r.total).toBe(2);
  });

  it('la estantería recalcula cada guardada con UNA sola lectura de convenios', async () => {
    const r = await servicio.listarAudiencias(1);
    expect(r.guardadas.map((g) => [g.nombre, g.total])).toEqual([
      ['Con convenio', 1],
      ['Sin convenio', 2],
      ['Todos', 4],
    ]);
    expect(consultas.filter((t) => t === 'convenios')).toHaveLength(1);
  });

  it('otra empresa no ve lo ajeno: el firmado de la 2 no entra a «Con convenio» de la 1', async () => {
    const lista = await servicio.resolverSegmentoDe(1, { convenio: 'con' });
    expect(lista.map((d) => d.email)).toEqual(['f@f.cl']);
  });

  it('sin plantilla activa no hay filtro', async () => {
    await expect(servicio.hayConvenio(1)).resolves.toBe(true);
    await expect(servicio.hayConvenio(2)).resolves.toBe(false);
    await expect(servicio.hayConvenio(3)).resolves.toBe(false);
  });

  it('sin el filtro, no se lee la tabla de convenios', async () => {
    await servicio.resolverSegmentoDe(1, { tipos_cliente: ['Empresas'] });
    expect(consultas).not.toContain('convenios');
  });
});
