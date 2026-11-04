import type Anthropic from '@anthropic-ai/sdk';
import type { PinoLogger } from 'nestjs-pino';
import { mockPinoLogger } from 'src/testing/mocks';
import type { AdjuntosRepository } from '../adjuntos/adjuntos.repository';
import type { AnalisisRepository } from '../analisis/analisis.repository';
import {
  AnalisisService,
  FORMATO_DE_LAS_BASES,
} from '../analisis/analisis.service';
import type { EventiaRepository } from '../eventia/eventia.repository';
import type { FichaRepository } from '../ficha/ficha.repository';
import type { OferenteRepository } from '../oferente/oferente.repository';
import type { OportunidadesRepository } from '../oportunidades.repository';
import type { PreguntasRepository } from '../preguntas/preguntas.repository';
import { PreguntasService } from '../preguntas/preguntas.service';

// LA PRIMERA PREGUNTA LEE LO QUE DEJÓ EL ANÁLISIS (decisión 115, 04-11).
// La caché de la API solo sirve si el comienzo del pedido es idéntico, y el
// formato de la respuesta es parte de ese comienzo: la API pone sus
// instrucciones en el sistema. Lo que fija: hasta la marca de caché de los
// documentos, «Analizar bases» y «Pregúntale a la IA» mandan lo mismo
// (modelo, esfuerzo, formato, sistema y documentos), cada uno dice después
// de la marca qué parte llena y lee solo la suya.

const CONTEXTO = {
  codigo: '1346350-37-COT26',
  nombre: 'Catamarán, alojamiento y colaciones',
  organismo: 'Municipalidad de Quillón',
  comuna: 'Quillón',
  perfil: 'complejo turístico con salones',
};

const adjunto = (id: number, nombre: string) => ({
  id,
  nombre,
  ruta: `c1/oportunidades/40/x_${nombre}`,
  tipo: 'application/pdf',
  bytes: 1000,
  creado_en: `2026-11-04T13:11:3${id}.000Z`,
  subido_por: 'perfil-1',
  quien: { full_name: 'Felipe Vargas' },
  seccion: 'bases' as const,
  origen: 'subido' as const,
  viene_de: null,
  competidor: null,
});

const BASES = [adjunto(1, 'Bases.pdf'), adjunto(2, 'Aclaratoria.txt')];

const descargar = (ruta: string) =>
  Promise.resolve(
    Buffer.from(
      ruta.endsWith('.txt')
        ? 'Aclaratoria N°1: el cierre se mueve al 30-10.'
        : '%PDF-1.7 bases',
    ),
  );

type Pedido = {
  model: string;
  thinking?: unknown;
  tools?: unknown;
  output_config: { effort: string; format: unknown };
  system: unknown;
  messages: Array<{
    role: string;
    content: string | Array<Record<string, unknown>>;
  }>;
};

const conLa = (parsed_output: unknown) => ({
  stop_reason: 'end_turn',
  usage: { input_tokens: 1, output_tokens: 1 },
  parsed_output,
});

const cliente = (parse: jest.Mock) =>
  ({
    messages: { parse },
    files: { upload: jest.fn() },
  }) as unknown as Anthropic;

class AnalisisDePrueba extends AnalisisService {
  constructor(
    readonly parse: jest.Mock,
    repo: unknown,
  ) {
    super(
      repo as AnalisisRepository,
      {} as AdjuntosRepository,
      {} as OportunidadesRepository,
      {} as EventiaRepository,
      {} as OferenteRepository,
      mockPinoLogger() as unknown as PinoLogger,
      {} as FichaRepository,
    );
  }

  protected cliente(): Anthropic {
    return cliente(this.parse);
  }
}

class PreguntasDePrueba extends PreguntasService {
  constructor(
    readonly parse: jest.Mock,
    repo: unknown,
    analisis: unknown,
  ) {
    super(
      repo as PreguntasRepository,
      analisis as AnalisisRepository,
      {} as AdjuntosRepository,
      {} as OportunidadesRepository,
      mockPinoLogger() as unknown as PinoLogger,
    );
  }

  protected cliente(): Anthropic {
    return cliente(this.parse);
  }
}

function armar(delAnalisis: unknown, deLaPregunta: unknown) {
  const repoDelAnalisis = {
    descargar: jest.fn(descargar),
    terminar: jest.fn().mockResolvedValue(undefined),
  };
  const repoDeLasPreguntas = {
    listar: jest.fn().mockResolvedValue([]),
    terminar: jest.fn().mockResolvedValue(undefined),
  };
  const analisis = new AnalisisDePrueba(
    jest.fn().mockResolvedValue(conLa(delAnalisis)),
    repoDelAnalisis,
  );
  const preguntas = new PreguntasDePrueba(
    jest.fn().mockResolvedValue(conLa(deLaPregunta)),
    repoDeLasPreguntas,
    {
      descargar: jest.fn(descargar),
      ultimo: jest.fn().mockResolvedValue(null),
    },
  );
  return { analisis, preguntas, repoDelAnalisis, repoDeLasPreguntas };
}

/** Lo que la API lee antes de la marca de caché de los documentos. */
const comienzo = (p: Pedido): string => {
  const primero = p.messages[0].content as Array<Record<string, unknown>>;
  const marca = primero.findIndex((b) => b.cache_control);
  expect(marca).toBeGreaterThan(0);
  return JSON.stringify({
    model: p.model,
    thinking: p.thinking,
    tools: p.tools,
    output_config: p.output_config,
    system: p.system,
    documentos: primero.slice(0, marca + 1),
  });
};

describe('El mismo comienzo en el análisis y en las preguntas (decisión 115)', () => {
  it('hasta la marca de caché de los documentos, los dos pedidos mandan lo mismo', async () => {
    const { analisis, preguntas } = armar(null, null);
    await analisis.ejecutar(
      1,
      5,
      BASES as never,
      [],
      { ...CONTEXTO, tipo: 'licitacion' },
      40,
    );
    await preguntas.ejecutar(
      1,
      7,
      40,
      BASES as never,
      CONTEXTO,
      '¿Son por día?',
    );

    const [[delAnalisis]] = analisis.parse.mock.calls as Array<[Pedido]>;
    const [[deLaPregunta]] = preguntas.parse.mock.calls as Array<[Pedido]>;
    expect(delAnalisis.output_config.format).toBe(FORMATO_DE_LAS_BASES);
    expect(deLaPregunta.output_config.format).toBe(FORMATO_DE_LAS_BASES);
    expect(comienzo(deLaPregunta)).toBe(comienzo(delAnalisis));

    // Lo que cambia va después de la marca y dice qué parte se llena.
    expect(JSON.stringify(delAnalisis.messages[0].content)).toContain(
      'RESPONDE en «analisis_de_las_bases»',
    );
    expect(deLaPregunta.messages[2].content).toContain(
      'RESPONDE en «respuesta_a_la_pregunta»',
    );
  });

  it('cada uno lee solo su parte: con la del otro, queda en error', async () => {
    const { analisis, preguntas, repoDelAnalisis, repoDeLasPreguntas } = armar(
      {
        respuesta_a_la_pregunta: {
          respuesta: 'Sí',
          citas: [],
          seguridad: 'alta',
        },
      },
      { analisis_de_las_bases: { resumen: 'Cena para 160 personas.' } },
    );
    await analisis.ejecutar(1, 5, BASES as never, [], CONTEXTO);
    await preguntas.ejecutar(
      1,
      7,
      40,
      BASES as never,
      CONTEXTO,
      '¿Son por día?',
    );

    expect(repoDelAnalisis.terminar).toHaveBeenCalledWith(
      1,
      5,
      expect.objectContaining({
        estado: 'error',
        error: 'La IA no pudo leer las bases (end_turn).',
      }),
    );
    expect(repoDeLasPreguntas.terminar).toHaveBeenCalledWith(
      1,
      7,
      expect.objectContaining({
        estado: 'error',
        error: 'La IA no respondió (end_turn).',
      }),
    );
  });
});
