import type { PinoLogger } from 'nestjs-pino';
import type { SupabaseService } from 'src/supabase/supabase.service';
import { mockPinoLogger } from 'src/testing/mocks';
import { FichaRepository } from '../ficha/ficha.repository';
import {
  LEIDA_SEGUN_LA_LECTURA_CORTA,
  LEIDA_SEGUN_LAS_BASES,
} from '../lectura/reglas';

/** Lo que la ficha muestra y decide (decisión 21), contra una base falsa
 *  que anota cada consulta. Lo que fija: el color según las bases solo con
 *  "si" o "no", siempre de UNA empresa, y el perfil por user_id. */
type Consulta = { tabla: string; pasos: unknown[][] };

const METODOS = ['select', 'update', 'eq', 'is', 'maybeSingle'];

function armar(datos: unknown = null, count: number | null = null) {
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
    cadena.then = (
      bien: (v: unknown) => unknown,
      mal?: (e: unknown) => unknown,
    ) => Promise.resolve({ data: datos, count, error: null }).then(bien, mal);
    return cadena;
  });
  const repo = new FichaRepository(
    { client: { from } } as unknown as SupabaseService,
    mockPinoLogger() as unknown as PinoLogger,
  );
  return { repo, consultas };
}

const paso = (c: Consulta, metodo: string) =>
  c.pasos.find(([m]) => m === metodo);

describe('FichaRepository — el color según las bases y el responsable (decisión 21)', () => {
  it('"se puede en el complejo" pinta verde y la marca como leída según las bases', async () => {
    const { repo, consultas } = armar();
    await expect(
      repo.colorSegunLasBases(1, 40, 'si', 'Según las bases, se puede.'),
    ).resolves.toBe(true);
    const [c] = consultas;
    expect(c.tabla).toBe('oportunidades');
    const [, cambios] = paso(c, 'update') as [string, Record<string, unknown>];
    expect(cambios).toMatchObject({
      semaforo: 'verde',
      se_hace_en_el_complejo: 'si',
      razon: 'Según las bases, se puede.',
      leida_con: LEIDA_SEGUN_LAS_BASES,
    });
    expect(c.pasos).toEqual(
      expect.arrayContaining([
        ['eq', 'company_id', 1],
        ['eq', 'id', 40],
      ]),
    );
  });

  it('"exigen otro lugar" pinta rojo; "no queda claro" no toca nada', async () => {
    const { repo, consultas } = armar();
    await repo.colorSegunLasBases(1, 40, 'no', null);
    const [, cambios] = paso(consultas[0], 'update') as [
      string,
      Record<string, unknown>,
    ];
    expect(cambios).toMatchObject({ semaforo: 'rojo' });
    expect(cambios).not.toHaveProperty('razon');
    await expect(repo.colorSegunLasBases(1, 40, 'dudoso', 'x')).resolves.toBe(
      false,
    );
    expect(consultas).toHaveLength(1);
  });

  it('el perfil de quien tiene la sesión se busca por user_id y empresa', async () => {
    const { repo, consultas } = armar({ id: 'perfil-1' });
    await expect(repo.perfilDe(1, 'sesion-1')).resolves.toBe('perfil-1');
    expect(consultas[0].tabla).toBe('user_profiles');
    expect(consultas[0].pasos).toEqual(
      expect.arrayContaining([
        ['eq', 'company_id', 1],
        ['eq', 'user_id', 'sesion-1'],
      ]),
    );
  });

  it('el responsable de hoy: null si no tiene, undefined si no es de la empresa', async () => {
    await expect(
      armar({ responsable_id: null }).repo.responsableDe(1, 9),
    ).resolves.toBeNull();
    await expect(armar(null).repo.responsableDe(1, 9)).resolves.toBeUndefined();
  });

  it('la historia pendiente se cuenta sin traer filas', async () => {
    const { repo, consultas } = armar(null, 734);
    await expect(repo.diasDeHistoriaPendientes()).resolves.toBe(734);
    expect(consultas[0].tabla).toBe('mp_historia');
    expect(consultas[0].pasos).toContainEqual(['eq', 'estado', 'pendiente']);
  });
});

describe('FichaRepository — las exigencias que marca la empresa (migración 152)', () => {
  /** La marca va en un solo paso a la base (`marcar_exigencia`): dos
   *  marcas seguidas no se pisan (visto en el laboratorio el 19-10). */
  const conRpc = (respuesta: { data: unknown; error: unknown }) => {
    const rpc = jest.fn(() => Promise.resolve(respuesta));
    const from = jest.fn();
    const repo = new FichaRepository(
      { client: { rpc, from } } as unknown as SupabaseService,
      mockPinoLogger() as unknown as PinoLogger,
    );
    return { repo, rpc, from };
  };

  it('suma o quita la marca en un solo paso, siempre de UNA empresa', async () => {
    const todas = {
      'almuerzo: plateada al horno': 'lo_tengo',
      'exclusividad del recinto': 'no_puedo',
    };
    const { repo, rpc, from } = conRpc({ data: todas, error: null });
    await expect(
      repo.marcarExigencia(1, 40, 'exclusividad del recinto', 'no_puedo'),
    ).resolves.toEqual(todas);
    expect(rpc).toHaveBeenCalledWith('marcar_exigencia', {
      p_company_id: 1,
      p_id: 40,
      p_clave: 'exclusividad del recinto',
      p_marca: 'no_puedo',
    });
    // Nada de leer y después guardar: así se pisaban.
    expect(from).not.toHaveBeenCalled();

    const quitar = conRpc({ data: {}, error: null });
    await expect(
      quitar.repo.marcarExigencia(1, 40, 'almuerzo: plateada al horno', null),
    ).resolves.toEqual({});
    expect(quitar.rpc).toHaveBeenCalledWith(
      'marcar_exigencia',
      expect.objectContaining({ p_marca: null }),
    );
  });

  it('una oportunidad de otra empresa no se marca; un error de la base sube', async () => {
    const otra = conRpc({ data: null, error: null });
    await expect(
      otra.repo.marcarExigencia(2, 40, 'exclusividad del recinto', 'lo_tengo'),
    ).resolves.toBeNull();
    const mala = conRpc({ data: null, error: new Error('se cayó') });
    await expect(
      mala.repo.marcarExigencia(1, 40, 'exclusividad del recinto', 'lo_tengo'),
    ).rejects.toThrow('se cayó');
  });
});

describe('FichaRepository — las que se preparan solas (decisión 129)', () => {
  /** Una base falsa que contesta según la tabla y anota cada consulta. */
  function porTabla(respuestas: Record<string, unknown[]>) {
    const consultas: Consulta[] = [];
    const from = jest.fn((tabla: string) => {
      const consulta: Consulta = { tabla, pasos: [] };
      consultas.push(consulta);
      const cadena: Record<string, unknown> = {};
      for (const m of ['select', 'eq', 'in', 'gt']) {
        cadena[m] = (...args: unknown[]) => {
          consulta.pasos.push([m, ...args]);
          return cadena;
        };
      }
      cadena.then = (bien: (v: unknown) => unknown) =>
        Promise.resolve({ data: respuestas[tabla] ?? [], error: null }).then(
          bien,
        );
      return cadena;
    });
    const repo = new FichaRepository(
      { client: { from } } as unknown as SupabaseService,
      mockPinoLogger() as unknown as PinoLogger,
    );
    return { repo, consultas };
  }

  const fila = (
    id: number,
    cierre: string,
    leidaCon: string | null = null,
  ) => ({
    id,
    leida_con: leidaCon,
    proceso: { fecha_cierre: cierre },
  });

  it('nuevas, verdes o amarillas, que cierran después del margen; sin las ya leídas según las bases ni las con análisis; la que cierra antes primero', async () => {
    const { repo, consultas } = porTabla({
      oportunidades: [
        fila(41, '2026-11-20T15:00:00+00:00'),
        fila(40, '2026-11-13T15:00:00+00:00'),
        fila(42, '2026-11-14T15:00:00+00:00', LEIDA_SEGUN_LAS_BASES),
        fila(43, '2026-11-15T15:00:00+00:00'),
      ],
      oportunidad_analisis: [{ oportunidad_id: 43 }],
    });
    const antes = Date.now();
    await expect(repo.paraPrepararSolas(1, 3 * 3_600_000)).resolves.toEqual([
      40, 41,
    ]);

    const [lista, analisis] = consultas;
    expect(lista.tabla).toBe('oportunidades');
    expect(lista.pasos).toEqual(
      expect.arrayContaining([
        ['eq', 'company_id', 1],
        ['eq', 'estado', 'nueva'],
        ['in', 'semaforo', ['verde', 'amarillo']],
      ]),
    );
    const [, campo, desde] = paso(lista, 'gt') as [string, string, string];
    expect(campo).toBe('proceso.fecha_cierre');
    expect(new Date(desde).getTime()).toBeGreaterThanOrEqual(
      antes + 3 * 3_600_000,
    );
    // Los análisis se miran de la misma empresa.
    expect(analisis.tabla).toBe('oportunidad_analisis');
    expect(analisis.pasos).toEqual(
      expect.arrayContaining([
        ['eq', 'company_id', 1],
        ['in', 'oportunidad_id', [40, 43, 41]],
      ]),
    );
  });

  it('sin nada por preparar no pregunta por los análisis', async () => {
    const { repo, consultas } = porTabla({ oportunidades: [] });
    await expect(repo.paraPrepararSolas(1, 0)).resolves.toEqual([]);
    expect(consultas.map((c) => c.tabla)).toEqual(['oportunidades']);
  });
});

describe('FichaRepository — la lectura corta en la oportunidad y en el cuadro (decisión 132)', () => {
  /** Una base falsa que contesta según la tabla y anota cada consulta. */
  function base(respuestas: Record<string, unknown[]> = {}) {
    const consultas: Consulta[] = [];
    const from = jest.fn((tabla: string) => {
      const consulta: Consulta = { tabla, pasos: [] };
      consultas.push(consulta);
      const cadena: Record<string, unknown> = {};
      for (const m of ['select', 'update', 'eq', 'is', 'in', 'gt', 'gte']) {
        cadena[m] = (...args: unknown[]) => {
          consulta.pasos.push([m, ...args]);
          return cadena;
        };
      }
      cadena.then = (bien: (v: unknown) => unknown) =>
        Promise.resolve({ data: respuestas[tabla] ?? [], error: null }).then(
          bien,
        );
      return cadena;
    });
    const repo = new FichaRepository(
      { client: { from } } as unknown as SupabaseService,
      mockPinoLogger() as unknown as PinoLogger,
    );
    return { repo, consultas };
  }
  const lectura = (veredicto: 'es_para_ti' | 'no_es_para_ti' | 'dudoso') => ({
    veredicto,
    porque: 'Piden el servicio en el gimnasio municipal.',
    cita: {
      texto: 'En el Gimnasio Municipal.',
      documento: 'Bases.pdf',
      pagina: '3',
    },
    lugar: 'Gimnasio Municipal',
  });

  it('«no es para ti» la deja roja, «es para ti» verde y «dudoso» sin tocar el color; las tres leídas según la lectura corta y solo si siguen nuevas', async () => {
    const { repo, consultas } = base();
    await repo.marcarSegunLaLecturaCorta(1, 40, lectura('no_es_para_ti'));
    await repo.marcarSegunLaLecturaCorta(1, 41, lectura('es_para_ti'));
    await repo.marcarSegunLaLecturaCorta(1, 42, lectura('dudoso'));
    const cambios = consultas.map(
      (c) => (paso(c, 'update') as [string, Record<string, unknown>])[1],
    );
    expect(cambios[0]).toMatchObject({
      semaforo: 'rojo',
      se_hace_en_el_complejo: 'no',
      leida_con: LEIDA_SEGUN_LA_LECTURA_CORTA,
      razon:
        'Piden el servicio en el gimnasio municipal. Dicen las bases: «En el Gimnasio Municipal.» (Bases.pdf, p. 3).',
    });
    expect(cambios[1]).toMatchObject({
      semaforo: 'verde',
      se_hace_en_el_complejo: 'si',
    });
    expect(cambios[2]).not.toHaveProperty('semaforo');
    expect(cambios[2]).toMatchObject({ se_hace_en_el_complejo: 'dudoso' });
    expect(consultas[0].pasos).toEqual(
      expect.arrayContaining([
        ['eq', 'company_id', 1],
        ['eq', 'id', 40],
        ['eq', 'estado', 'nueva'],
      ]),
    );
  });

  it('lo que ya leyó la lectura corta no se vuelve a elegir para leer solo', async () => {
    const { repo } = base({
      oportunidades: [
        {
          id: 40,
          leida_con: LEIDA_SEGUN_LA_LECTURA_CORTA,
          proceso: { fecha_cierre: '2026-11-20T15:00:00+00:00' },
        },
        {
          id: 41,
          leida_con: null,
          proceso: { fecha_cierre: '2026-11-21T15:00:00+00:00' },
        },
      ],
    });
    await expect(repo.paraPrepararSolas(1, 0)).resolves.toEqual([41]);
  });

  it('el cuadro suma los análisis de Opus sin pedido_por y las lecturas cortas de cada pasada, de UNA empresa', async () => {
    const { repo, consultas } = base({
      oportunidad_analisis: [
        { estado: 'listo', costo_usd: 0.31, creado_en: '2026-11-12T04:11:47Z' },
      ],
      oportunidades_lectura_corta: [
        {
          estado: 'listo',
          costo_usd: 0.0042,
          creado_en: '2026-11-12T12:00:00Z',
        },
      ],
    });
    await expect(
      repo.lecturasSolasDesde(1, '2026-11-06T03:00:00.000Z'),
    ).resolves.toHaveLength(2);
    const [opus, haiku] = consultas;
    expect(opus.tabla).toBe('oportunidad_analisis');
    expect(opus.pasos).toEqual(
      expect.arrayContaining([
        ['eq', 'company_id', 1],
        ['is', 'pedido_por', null],
        ['gte', 'creado_en', '2026-11-06T03:00:00.000Z'],
      ]),
    );
    expect(haiku.tabla).toBe('oportunidades_lectura_corta');
    expect(haiku.pasos).toEqual(
      expect.arrayContaining([
        ['eq', 'company_id', 1],
        ['eq', 'origen', 'radar'],
      ]),
    );
  });
});
