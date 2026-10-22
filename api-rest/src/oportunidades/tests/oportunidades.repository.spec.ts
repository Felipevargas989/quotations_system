import type { PinoLogger } from 'nestjs-pino';
import type { SupabaseService } from 'src/supabase/supabase.service';
import { mockPinoLogger } from 'src/testing/mocks';
import { LEIDA_SEGUN_LAS_BASES } from '../lectura/reglas';
import { OportunidadesRepository } from '../oportunidades.repository';

/**
 * El repositorio contra una base falsa que anota cada consulta: tabla y
 * pasos (select, eq, upsert…). La respuesta la decide `responder` mirando
 * la consulta completa.
 */
type Consulta = { tabla: string; pasos: unknown[][] };
type Respuesta = { data?: unknown; error?: unknown };

const METODOS = [
  'select',
  'insert',
  'update',
  'upsert',
  'eq',
  'lt',
  'gt',
  'gte',
  'lte',
  'is',
  'not',
  'in',
  'or',
  'contains',
  'order',
  'limit',
  'range',
];

function armar(responder: (c: Consulta) => Respuesta = () => ({})) {
  const consultas: Consulta[] = [];
  const from = jest.fn((tabla: string) => {
    const consulta: Consulta = { tabla, pasos: [] };
    consultas.push(consulta);
    const resolver = () =>
      Promise.resolve({ data: null, error: null, ...responder(consulta) });
    const cadena: Record<string, unknown> = {};
    for (const m of METODOS) {
      cadena[m] = (...args: unknown[]) => {
        consulta.pasos.push([m, ...args]);
        return cadena;
      };
    }
    cadena.single = () => {
      consulta.pasos.push(['single']);
      return resolver();
    };
    cadena.maybeSingle = () => {
      consulta.pasos.push(['maybeSingle']);
      return resolver();
    };
    cadena.then = (
      bien: (v: unknown) => unknown,
      mal?: (e: unknown) => unknown,
    ) => resolver().then(bien, mal);
    return cadena;
  });
  const repo = new OportunidadesRepository(
    { client: { from } } as unknown as SupabaseService,
    mockPinoLogger() as unknown as PinoLogger,
  );
  return { repo, consultas };
}

const tiene = (c: Consulta, metodo: string) =>
  c.pasos.some(([m]) => m === metodo);
const paso = (c: Consulta, metodo: string) =>
  c.pasos.find(([m]) => m === metodo);

describe('OportunidadesRepository — el candado de la corrida', () => {
  it('primero da por muertas las que llevan más de 3 horas "corriendo"', async () => {
    const { repo, consultas } = armar((c) =>
      tiene(c, 'insert') ? { data: { id: 5 } } : {},
    );
    await expect(repo.tomarCorrida('manual')).resolves.toBe(5);

    const [limpieza, insercion] = consultas;
    expect(limpieza.tabla).toBe('mp_radar_corridas');
    expect(paso(limpieza, 'update')?.[1]).toMatchObject({
      estado: 'abandonada',
    });
    expect(paso(limpieza, 'eq')).toEqual(['eq', 'estado', 'corriendo']);
    const limite = new Date(paso(limpieza, 'lt')?.[2] as string).getTime();
    expect(Date.now() - limite).toBeGreaterThanOrEqual(
      3 * 60 * 60 * 1000 - 1000,
    );
    expect(paso(insercion, 'insert')).toEqual(['insert', { origen: 'manual' }]);
  });

  it('si el índice único dice que ya hay una corriendo (23505), devuelve null', async () => {
    const { repo } = armar((c) =>
      tiene(c, 'insert')
        ? { error: { code: '23505', message: 'duplicate key value' } }
        : {},
    );
    await expect(repo.tomarCorrida('reloj')).resolves.toBeNull();
  });

  it('al encender, suelta el candado de lo que quedó corriendo de antes', async () => {
    const { repo, consultas } = armar((c) =>
      tiene(c, 'update') ? { data: [{ id: 3 }] } : {},
    );
    await expect(
      repo.abandonarCorridasDeAntes('2026-10-17T03:27:10.000Z'),
    ).resolves.toBe(1);
    const [c] = consultas;
    expect(paso(c, 'update')?.[1]).toMatchObject({ estado: 'abandonada' });
    expect(paso(c, 'eq')).toEqual(['eq', 'estado', 'corriendo']);
    expect(paso(c, 'lt')).toEqual([
      'lt',
      'empezo_en',
      '2026-10-17T03:27:10.000Z',
    ]);
  });

  it('cualquier otro error de la base se lanza', async () => {
    const { repo } = armar((c) =>
      tiene(c, 'insert')
        ? { error: { code: '42501', message: 'permission denied' } }
        : {},
    );
    await expect(repo.tomarCorrida('reloj')).rejects.toMatchObject({
      code: '42501',
    });
  });
});

describe('OportunidadesRepository — las empresas del radar', () => {
  it('solo las que tienen el módulo, y una bloqueada no entra aunque lo tenga', async () => {
    const { repo, consultas } = armar(() => ({
      data: [
        {
          id: 1,
          name: 'Valle del Sol',
          plan: 'crece',
          estado_plan: 'gratis',
          modulos_propios: ['personal', 'marketing', 'oportunidades'],
          high_value_threshold: 3_000_000,
        },
        {
          id: 52,
          name: 'Bloqueada',
          plan: 'crece',
          estado_plan: 'bloqueado',
          modulos_propios: ['oportunidades'],
          high_value_threshold: null,
        },
      ],
    }));

    await expect(repo.empresasConModulo()).resolves.toEqual([
      { id: 1, name: 'Valle del Sol', high_value_threshold: 3_000_000 },
    ]);
    expect(paso(consultas[0], 'contains')).toEqual([
      'contains',
      'modulos_propios',
      ['oportunidades'],
    ]);
  });
});

describe('OportunidadesRepository — lo de cada empresa filtra por company_id', () => {
  const filtraPorEmpresa = (c: Consulta, id: number) =>
    c.pasos.some(
      ([m, col, v]) => m === 'eq' && col === 'company_id' && v === id,
    );

  it('config, catálogo, leídos, la lista, la ficha, decidir y el responsable', async () => {
    const { repo, consultas } = armar();
    await repo.configDe(52);
    await repo.catalogoResumido(52);
    await repo.lecturasDe(52, 'claude-haiku-5-5, reglas del 17-10');
    await repo.listar(52, { vigentes: true, limite: 3000 });
    await repo.ficha(52, 9);
    await repo.actualizar(52, 9, { estado: 'en_estudio' });
    await repo.esUsuarioDeLaEmpresa(52, 'b3c1e0f2-0000-4000-8000-000000000000');
    await repo.mias(52);

    expect(consultas.map((c) => c.tabla)).toEqual([
      'oportunidades_config',
      'service_group_collections',
      'fixed_services',
      'oportunidades',
      'oportunidades',
      'oportunidades',
      'oportunidades',
      'user_profiles',
      'oportunidades',
    ]);
    for (const c of consultas) expect(filtraPorEmpresa(c, 52)).toBe(true);
    // "Mis licitaciones": las marcadas, abiertas o cerradas.
    expect(consultas[8].pasos).toContainEqual([
      'in',
      'estado',
      ['en_estudio', 'postulada', 'ganada', 'perdida'],
    ]);
  });

  it('guardar la configuración lleva la empresa en la fila (upsert por empresa)', async () => {
    const { repo, consultas } = armar();
    await repo.guardarConfig(52, { regiones: ['Ñuble'] });
    const [, fila, opciones] = paso(consultas[0], 'upsert') as [
      string,
      Record<string, unknown>,
      Record<string, unknown>,
    ];
    expect(consultas[0].tabla).toBe('oportunidades_config');
    expect(fila).toMatchObject({ company_id: 52, regiones: ['Ñuble'] });
    expect(opciones).toEqual({ onConflict: 'company_id' });
  });

  it('la lista trae el proceso con !inner y filtra lo vigente en el proceso', async () => {
    const { repo, consultas } = armar();
    await repo.listar(1, {
      vigentes: true,
      semaforo: 'verde',
      tipo: 'licitacion',
      limite: 5000,
    });
    const c = consultas[0];
    const [, columnas] = paso(c, 'select') as [string, string];
    expect(columnas).toContain('proceso:mp_procesos!inner(');
    const [, filtro, opciones] = paso(c, 'or') as [
      string,
      string,
      Record<string, unknown>,
    ];
    expect(filtro).toMatch(
      /^fecha_cierre\.gt\."[^"]+",fecha_cierre\.is\.null$/,
    );
    expect(opciones).toEqual({ referencedTable: 'proceso' });
    expect(c.pasos).toContainEqual(['eq', 'proceso.tipo', 'licitacion']);
    expect(c.pasos).toContainEqual(['eq', 'semaforo', 'verde']);
    // Supabase entrega hasta 1000 por consulta: se pagina.
    expect(paso(c, 'range')).toEqual(['range', 0, 999]);
  });

  it('el historial (vigentes: false) no filtra por cierre', async () => {
    const { repo, consultas } = armar();
    await repo.listar(1, { vigentes: false, limite: 500 });
    expect(tiene(consultas[0], 'or')).toBe(false);
    expect(paso(consultas[0], 'range')).toEqual(['range', 0, 499]);
  });

  it('guardar una lectura nunca pisa la que ya existía (la decisión es de la empresa)', async () => {
    const { repo, consultas } = armar();
    await repo.guardarLectura(
      1,
      '4364-13-LE26',
      {
        semaforo: 'verde',
        etiquetas: ['evento'],
        se_hace_en_el_complejo: 'si',
        razon: 'Evento',
        alertas: ['comuna_cercana'],
      },
      'claude-haiku-5-5',
    );
    const [, fila, opciones] = paso(consultas[0], 'upsert') as [
      string,
      Record<string, unknown>,
      Record<string, unknown>,
    ];
    expect(fila).toMatchObject({ company_id: 1, codigo: '4364-13-LE26' });
    expect(fila).not.toHaveProperty('estado');
    expect(opciones).toEqual({
      onConflict: 'company_id,codigo',
      ignoreDuplicates: true,
    });
  });
});

describe('OportunidadesRepository — releer con reglas nuevas (decisión 19)', () => {
  const ACTUAL = 'claude-haiku-5-5, reglas del 17-10';
  const fila = (codigo: string, cambios: Record<string, unknown> = {}) => ({
    codigo,
    estado: 'nueva',
    responsable_id: null,
    notas: null,
    quotation_id: null,
    leida_con: 'claude-haiku-5-5',
    ...cambios,
  });

  it('se relee solo lo leído con otras reglas que nadie ha tocado', async () => {
    const { repo } = armar(() => ({
      data: [
        fila('VIEJA'),
        fila('AL_DIA', { leida_con: ACTUAL }),
        fila('ME_INTERESA', { estado: 'en_estudio' }),
        fila('DESCARTADA', { estado: 'descartada' }),
        fila('ASIGNADA', {
          responsable_id: 'b3c1e0f2-0000-4000-8000-000000000000',
        }),
        fila('CON_NOTAS', { notas: 'llamar' }),
        fila('COTIZADA', {
          quotation_id: 'c0ffee00-0000-4000-8000-000000000000',
        }),
      ],
    }));
    const { hechas, releer } = await repo.lecturasDe(1, ACTUAL);
    expect([...releer]).toEqual(['VIEJA']);
    expect([...hechas].sort()).toEqual(
      [
        'AL_DIA',
        'ASIGNADA',
        'CON_NOTAS',
        'COTIZADA',
        'DESCARTADA',
        'ME_INTERESA',
      ].sort(),
    );
  });

  it('la relectura cambia solo lo que leyó la IA, y solo si sigue intacta', async () => {
    const { repo, consultas } = armar();
    await repo.guardarLectura(
      1,
      '1532886-5-LE26',
      {
        semaforo: 'verde',
        etiquetas: ['evento', 'alimentacion'],
        se_hace_en_el_complejo: 'si',
        razon: 'Ceremonia con cena: el lugar lo pone el oferente.',
        alertas: ['comuna_cercana', 'alto_valor'],
      },
      ACTUAL,
      true,
    );
    const [c] = consultas;
    expect(tiene(c, 'upsert')).toBe(false);
    const [, cambios] = paso(c, 'update') as [string, Record<string, unknown>];
    expect(cambios).toMatchObject({ semaforo: 'verde', leida_con: ACTUAL });
    for (const campo of ['estado', 'responsable_id', 'notas', 'quotation_id']) {
      expect(cambios).not.toHaveProperty(campo);
    }
    expect(c.pasos).toEqual(
      expect.arrayContaining([
        ['eq', 'company_id', 1],
        ['eq', 'codigo', '1532886-5-LE26'],
        ['eq', 'estado', 'nueva'],
        ['is', 'responsable_id', null],
        ['is', 'notas', null],
        ['is', 'quotation_id', null],
      ]),
    );
  });
});

describe('OportunidadesRepository — sprint 1b', () => {
  it('por adjudicar: licitaciones cerradas sin ganador, revisadas hace más de 20 horas', async () => {
    const { repo, consultas } = armar();
    await repo.procesosPorAdjudicar(300);
    const c = consultas[0];
    expect(c.tabla).toBe('mp_procesos');
    expect(c.pasos).toContainEqual(['eq', 'tipo', 'licitacion']);
    expect(c.pasos).toContainEqual(['is', 'adjudicacion', null]);
    expect(tiene(c, 'lt')).toBe(true);
    expect(tiene(c, 'gt')).toBe(true);
    expect(paso(c, 'limit')).toEqual(['limit', 300]);
  });

  it('el próximo día de historia: primero el mes a cada lado de «hace un año» (19-10, decisión 28)', async () => {
    const { repo, consultas } = armar((c) =>
      tiene(c, 'lte') ? { data: [{ fecha: '2025-10-03' }] } : {},
    );
    await expect(repo.siguienteDiaDeHistoria()).resolves.toBe('2025-10-03');
    expect(consultas).toHaveLength(1);
    const c = consultas[0];
    expect(c.tabla).toBe('mp_historia');
    expect(c.pasos).toContainEqual(['eq', 'estado', 'pendiente']);
    expect(c.pasos).toContainEqual(['lte', 'prioridad', 31]);
    expect(paso(c, 'order')).toEqual([
      'order',
      'prioridad',
      { ascending: true },
    ]);
  });

  it('después, los últimos 60 días del más nuevo al más viejo; y al final el resto por prioridad', async () => {
    const { repo, consultas } = armar((c) =>
      tiene(c, 'gte') ? { data: [{ fecha: '2026-10-16' }] } : { data: [] },
    );
    await expect(repo.siguienteDiaDeHistoria()).resolves.toBe('2026-10-16');
    expect(consultas).toHaveLength(2);
    expect(paso(consultas[1], 'order')).toEqual([
      'order',
      'fecha',
      { ascending: false },
    ]);

    const otro = armar((c) =>
      tiene(c, 'lte') || tiene(c, 'gte')
        ? { data: [] }
        : { data: [{ fecha: '2024-03-01' }] },
    );
    await expect(otro.repo.siguienteDiaDeHistoria()).resolves.toBe(
      '2024-03-01',
    );
    expect(otro.consultas).toHaveLength(3);

    const completa = armar(() => ({ data: [] }));
    await expect(completa.repo.siguienteDiaDeHistoria()).resolves.toBeNull();
  });

  it('el historial de organismos: de a 100, solo lo adjudicado', async () => {
    const { repo, consultas } = armar();
    const codigos = Array.from({ length: 150 }, (_, i) => `O-${i}`);
    await repo.historialDeOrganismos([...codigos, 'O-1', '']);
    expect(consultas).toHaveLength(2);
    expect(consultas[0].pasos).toContainEqual([
      'not',
      'adjudicacion',
      'is',
      null,
    ]);
  });
});

describe('OportunidadesRepository — compras ágiles sin detalle (la A, 18-10)', () => {
  it('solo las amarillas intactas de ESTA empresa, compras ágiles abiertas sin descripción, de la que cierra antes a la que cierra después', async () => {
    const { repo, consultas } = armar(() => ({
      data: [
        {
          codigo: 'B',
          proceso: {
            fecha_cierre: '2026-10-25T15:00:00Z',
            item: { codigo: 'B' },
          },
        },
        {
          codigo: 'A',
          proceso: {
            fecha_cierre: '2026-10-20T15:00:00Z',
            item: { codigo: 'A' },
          },
        },
        { codigo: 'SIN_ITEM', proceso: { fecha_cierre: null, item: null } },
      ],
    }));

    const filas = await repo.comprasAgilesSinDetalle(1);

    expect(filas.map((f) => f.codigo)).toEqual(['A', 'B']);
    const c = consultas[0];
    expect(c.tabla).toBe('oportunidades');
    const eqs = c.pasos.filter(([m]) => m === 'eq').map((p) => p.slice(1));
    expect(eqs).toEqual(
      expect.arrayContaining([
        ['company_id', 1],
        ['estado', 'nueva'],
        ['semaforo', 'amarillo'],
        ['proceso.tipo', 'compra_agil'],
      ]),
    );
    const iss = c.pasos.filter(([m]) => m === 'is').map((p) => p[1]);
    expect(iss).toEqual(
      expect.arrayContaining([
        'responsable_id',
        'notas',
        'quotation_id',
        'proceso.descripcion',
      ]),
    );
  });
});

describe('OportunidadesRepository — procesos comunes', () => {
  it('pregunta por los conocidos en tramos de 300 códigos', async () => {
    const { repo, consultas } = armar((c) => {
      const codigos = (paso(c, 'in')?.[2] ?? []) as string[];
      return {
        data: codigos.slice(0, 1).map((codigo) => ({
          codigo,
          fecha_cierre: null,
          estado: 'Publicada',
        })),
      };
    });
    const codigos = Array.from({ length: 650 }, (_, i) => `C-${i}`);
    const conocidos = await repo.procesosConocidos(codigos);
    expect(consultas).toHaveLength(3);
    expect([...conocidos.keys()]).toEqual(['C-0', 'C-300', 'C-600']);
  });

  it('guarda en lotes de 100, por código', async () => {
    const { repo, consultas } = armar();
    const procesos = Array.from({ length: 250 }, (_, i) => ({
      codigo: `C-${i}`,
    }));
    await repo.guardarProcesos(procesos as never);
    expect(consultas).toHaveLength(3);
    expect(paso(consultas[0], 'upsert')?.[2]).toEqual({ onConflict: 'codigo' });
  });

  it('sin repetidos: el mismo código dos veces va una sola vez, con su última versión (18-10)', async () => {
    // La base rechaza un lote con el mismo código dos veces ("ON CONFLICT
    // DO UPDATE command cannot affect row a second time").
    const { repo, consultas } = armar();
    await repo.guardarProcesos([
      { codigo: 'A', nombre: 'primera' },
      { codigo: 'B', nombre: 'otra' },
      { codigo: 'A', nombre: 'segunda' },
    ] as never);
    const lote = paso(consultas[0], 'upsert')?.[1] as Array<{
      codigo: string;
      nombre: string;
    }>;
    expect(lote.map((p) => [p.codigo, p.nombre])).toEqual([
      ['A', 'segunda'],
      ['B', 'otra'],
    ]);
  });
});

describe('OportunidadesRepository — la zona (Se viene y competidores)', () => {
  it('licitaciones de 3 años, de a 1000, y solo las de las regiones (sin mirar tildes)', async () => {
    const fila = (codigo: string, region: string) => ({ codigo, region });
    const { repo, consultas } = armar((c) => {
      const desde = (paso(c, 'range')?.[1] ?? 0) as number;
      if (desde === 0) {
        return {
          data: [
            ...Array.from({ length: 998 }, (_, i) =>
              fila(`X-${i}`, 'Región Metropolitana de Santiago'),
            ),
            fila('NUBLE', 'Región del Ñuble'),
            fila('BIOBIO', 'Región del Biobío'),
          ],
        };
      }
      return { data: [fila('ULTIMA', 'Region del Nuble')] };
    });
    const r = await repo.procesosDeLaZona(['Ñuble', 'Biobio']);
    expect(r.map((p) => p.codigo)).toEqual(['NUBLE', 'BIOBIO', 'ULTIMA']);
    expect(consultas).toHaveLength(2);
    expect(consultas[0].pasos).toContainEqual(['eq', 'tipo', 'licitacion']);
    expect(tiene(consultas[0], 'gte')).toBe(true);
  });

  it('sin regiones configuradas no pregunta nada', async () => {
    const { repo, consultas } = armar();
    await expect(repo.procesosDeLaZona([])).resolves.toEqual([]);
    expect(consultas).toHaveLength(0);
  });
});

describe('OportunidadesRepository — lo coloreado por las bases no se relee (decisión 21)', () => {
  it('lo coloreado por el análisis de las bases no se relee con la lectura corta', async () => {
    const { repo } = armar(() => ({
      data: [
        {
          codigo: 'BASES',
          estado: 'nueva',
          responsable_id: null,
          notas: null,
          quotation_id: null,
          leida_con: LEIDA_SEGUN_LAS_BASES,
        },
      ],
    }));
    const { hechas, releer } = await repo.lecturasDe(
      1,
      'claude-haiku-5-5, reglas del 17-10',
    );
    expect([...hechas]).toEqual(['BASES']);
    expect(releer.size).toBe(0);
  });
});
