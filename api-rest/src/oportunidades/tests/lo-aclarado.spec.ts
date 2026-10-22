import type { PinoLogger } from 'nestjs-pino';
import type { SupabaseService } from 'src/supabase/supabase.service';
import { mockPinoLogger } from 'src/testing/mocks';
import { instruccionesDeValidacion } from '../analisis/validacion.service';
import { lasBases } from '../generacion/instrucciones';
import { instruccionesDeLaOferta } from '../postulacion/armar-la-oferta';
import {
  loAclarado,
  MAX_ACLARACIONES,
  memoriaDeLaLicitacion,
  textoDeLoAclarado,
} from '../preguntas/lo-aclarado';
import { PreguntasRepository } from '../preguntas/preguntas.repository';

// LO ACLARADO MANDA (decisión 68, 22-10). Felipe: "una sola memoria por
// licitación". Lo que fija: lo que dicen los documentos (alta) entra solo;
// una deducción o lo que no está (media, baja) entra solo con lo que
// confirmó el comprador, que manda también sobre una alta; la oferta, los
// documentos y la validación leen la misma lista; y leerla nunca rompe el
// trabajo de la IA.

const fila = (
  pregunta: string,
  seguridad: 'alta' | 'media' | 'baja',
  respuesta: string,
  confirmado: string | null = null,
  estado: 'procesando' | 'listo' | 'error' = 'listo',
) => ({ pregunta, seguridad, respuesta, confirmado, estado });

describe('La memoria de la licitación', () => {
  it('alta entra sola; media y baja solo con lo que confirmó el comprador, que manda también sobre una alta', () => {
    expect(
      loAclarado([
        fila('¿Hay garantía?', 'alta', 'No piden garantías.'),
        fila('¿Colaciones por día?', 'media', 'Por día, por el presupuesto.'),
        fila('¿Hay estacionamiento?', 'baja', 'No lo dicen.'),
        fila(
          '¿Las colaciones son 100 en total?',
          'media',
          'Por día.',
          'Son 100 AM y 100 PM por día (Rodrigo Pérez, 22-10).',
        ),
        fila(
          '¿Lugar del alojamiento?',
          'alta',
          'En el complejo.',
          'En Quillón urbano.',
        ),
        fila('¿Se puede subcontratar?', 'alta', 'Sí.', null, 'procesando'),
      ]),
    ).toEqual([
      {
        pregunta: '¿Hay garantía?',
        respuesta: 'No piden garantías.',
        fuente: 'documentos',
      },
      {
        pregunta: '¿Las colaciones son 100 en total?',
        respuesta: 'Son 100 AM y 100 PM por día (Rodrigo Pérez, 22-10).',
        fuente: 'comprador',
      },
      {
        pregunta: '¿Lugar del alojamiento?',
        respuesta: 'En Quillón urbano.',
        fuente: 'comprador',
      },
    ]);
  });

  it('entran las más nuevas hasta el tope', () => {
    const muchas = Array.from({ length: MAX_ACLARACIONES + 5 }, (_, i) =>
      fila(`P${i}`, 'alta', `R${i}`),
    );
    const lista = loAclarado(muchas);
    expect(lista).toHaveLength(MAX_ACLARACIONES);
    expect(lista[0].pregunta).toBe('P5');
  });

  it('en texto: nada si no hay; si hay, dice que manda y de dónde viene cada una', () => {
    expect(textoDeLoAclarado([])).toEqual([]);
    const t = textoDeLoAclarado([
      { pregunta: '¿Por día?', respuesta: 'Sí.', fuente: 'comprador' },
      { pregunta: '¿Garantía?', respuesta: 'No.', fuente: 'documentos' },
    ]).join('\n');
    expect(t).toContain('LO ACLARADO DE ESTA LICITACIÓN (manda');
    expect(t).toContain('- ¿Por día? → Sí. (lo confirmó el comprador)');
    expect(t).toContain('- ¿Garantía? → No. (lo dicen los documentos)');
  });

  it('leerla nunca rompe: sin repositorio, nada; si falla, nada y avisa', async () => {
    const avisar = jest.fn();
    expect(await memoriaDeLaLicitacion(undefined, 1, 40, avisar)).toEqual([]);
    expect(
      await memoriaDeLaLicitacion(
        { aclarado: jest.fn().mockRejectedValue(new Error('caída')) },
        1,
        40,
        avisar,
      ),
    ).toEqual([]);
    expect(avisar).toHaveBeenCalledWith(
      'no pude leer lo aclarado de la oportunidad 40: caída',
    );
  });
});

describe('La oferta, los documentos y la validación leen la misma memoria', () => {
  const BASES = {
    resumen: 'Catamarán, alojamiento y colaciones.',
    lugar: 'Laguna Avendaño',
    criterios: [],
    requisitos: [
      {
        que: '100 colaciones frías AM y 100 PM',
        tipo: 'tecnico',
        obligatorio: true,
        documento: 'Ficha',
        pagina: 3,
      },
    ],
    fechas: [],
    garantias: [],
    cumplimiento: [],
    formularios: [],
  };
  const ACLARADO = [
    {
      pregunta: '¿Las colaciones son por día?',
      respuesta: 'Sí, 100 y 100 por día.',
      fuente: 'comprador' as const,
    },
  ];

  it('los documentos (lasBases): lo aclarado va después del checklist; sin memoria, nada', () => {
    const con = lasBases({ ...BASES, aclarado: ACLARADO } as never).join('\n');
    expect(con).toContain('EL CHECKLIST:');
    expect(con.indexOf('LO ACLARADO')).toBeGreaterThan(
      con.indexOf('EL CHECKLIST:'),
    );
    expect(con).toContain(
      '- ¿Las colaciones son por día? → Sí, 100 y 100 por día. (lo confirmó el comprador)',
    );
    expect(lasBases(BASES as never).join('\n')).not.toContain('LO ACLARADO');
  });

  it('la oferta («Armar postulación») la lee con las especificaciones técnicas', () => {
    const t = instruccionesDeLaOferta({
      codigo: '1346350-37-COT26',
      nombre: 'Catamarán',
      organismo: 'Municipalidad de Quillón',
      bases: { ...BASES, aclarado: ACLARADO } as never,
      instalaciones: null,
      loQueVende: null,
      catalogo: '(catálogo)',
    });
    expect(t).toContain('LO ACLARADO DE ESTA LICITACIÓN');
    expect(t).toContain('Sí, 100 y 100 por día.');
  });

  it('la validación la lee y no vuelve a dudar de lo ya aclarado', () => {
    const base = {
      codigo: '1346350-37-COT26',
      nombre: 'Catamarán',
      organismo: null,
      fecha_cierre: null,
      hoy: '2026-10-22',
      oferente: null,
      carpeta: [],
      requisitos: BASES.requisitos as never,
      criterios: [],
    };
    const con = instruccionesDeValidacion({ ...base, aclarado: ACLARADO });
    expect(con).toContain('LO ACLARADO DE ESTA LICITACIÓN');
    expect(con).toContain('Lo aclarado manda: si un documento coincide');
    const sin = instruccionesDeValidacion(base);
    expect(sin).not.toContain('LO ACLARADO');
    expect(sin).not.toContain('Lo aclarado manda');
  });
});

describe('Confirmar una respuesta (el repositorio)', () => {
  type Paso = [string, ...unknown[]];
  const armar = (data: unknown) => {
    const pasos: Paso[] = [];
    const cadena: Record<string, unknown> = {};
    for (const m of ['update', 'eq', 'select', 'order', 'limit']) {
      cadena[m] = (...args: unknown[]) => {
        pasos.push([m, ...args]);
        return cadena;
      };
    }
    cadena.maybeSingle = () => Promise.resolve({ data, error: null });
    cadena.then = (bien: (v: unknown) => unknown) =>
      Promise.resolve({ data: [], error: null }).then(bien);
    const repo = new PreguntasRepository(
      { client: { from: jest.fn(() => cadena) } } as unknown as SupabaseService,
      mockPinoLogger() as unknown as PinoLogger,
    );
    return { repo, pasos };
  };

  it('anota lo confirmado, quién y cuándo, solo en una respuesta lista de esa empresa y oportunidad; vacío lo borra', async () => {
    const { repo, pasos } = armar({ id: 7 });
    expect(await repo.confirmar(1, 40, 7, 'Por día.', 'perfil-1')).toEqual({
      id: 7,
    });
    const [, cambios] = pasos.find(([m]) => m === 'update') as [
      string,
      Record<string, unknown>,
    ];
    expect(cambios).toMatchObject({
      confirmado: 'Por día.',
      confirmado_por: 'perfil-1',
    });
    expect(typeof cambios.confirmado_en).toBe('string');
    expect(pasos).toEqual(
      expect.arrayContaining([
        ['eq', 'company_id', 1],
        ['eq', 'oportunidad_id', 40],
        ['eq', 'id', 7],
        ['eq', 'estado', 'listo'],
      ]),
    );
    const borrar = armar({ id: 7 });
    await borrar.repo.confirmar(1, 40, 7, null, 'perfil-1');
    const [, sinNada] = borrar.pasos.find(([m]) => m === 'update') as [
      string,
      Record<string, unknown>,
    ];
    expect(sinNada).toEqual({
      confirmado: null,
      confirmado_por: null,
      confirmado_en: null,
    });
  });
});
