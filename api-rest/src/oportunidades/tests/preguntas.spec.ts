import Anthropic from '@anthropic-ai/sdk';
import { BadRequestException } from '@nestjs/common';
import type { PinoLogger } from 'nestjs-pino';
import { mockPinoLogger } from 'src/testing/mocks';
import type { AdjuntosRepository } from '../adjuntos/adjuntos.repository';
import type { AnalisisRepository } from '../analisis/analisis.repository';
import { costoDelUso } from '../analisis/comun';
import type { OportunidadesRepository } from '../oportunidades.repository';
import type { PreguntasRepository } from '../preguntas/preguntas.repository';
import {
  analisisComoTexto,
  armarMensajes,
  citasValidas,
  instruccionesDePreguntas,
  MAX_CITAS,
  MODELO_PREGUNTAS,
  PreguntasService,
} from '../preguntas/preguntas.service';

// PREGÚNTALE A LA IA SOBRE ESTAS BASES (decisión 67, 22-10). Lo que fija:
// no se pregunta sin bases ni con dos palabras; la pregunta queda
// "procesando" y se responde por detrás; los documentos y el análisis
// previo van primero, con la marca de caché al final de ese bloque; el
// hilo anterior entra en orden y la que está procesando no; la respuesta
// queda con citas limpias y el costo cuenta la caché; una falla queda en
// palabras de la casa y nunca lanza.

const CONTEXTO = {
  codigo: '1346350-37-COT26',
  nombre: 'Catamarán, alojamiento y colaciones',
  organismo: 'Municipalidad de Quillón',
  comuna: 'Quillón',
  perfil: 'complejo turístico con salones',
};

const adjunto = (id: number, nombre: string, bytes = 1000) => ({
  id,
  nombre,
  ruta: `c1/oportunidades/40/x_${nombre}`,
  tipo: 'application/pdf',
  bytes,
  creado_en: `2026-10-22T13:11:3${id}.000Z`,
  subido_por: 'perfil-1',
  quien: { full_name: 'Felipe Vargas' },
  seccion: 'bases' as const,
  origen: 'subido' as const,
  viene_de: null,
  competidor: null,
});

const fila = (
  id: number,
  pregunta: string,
  estado: 'procesando' | 'listo' | 'error',
  respuesta: string | null = null,
) => ({
  id,
  oportunidad_id: 40,
  pregunta,
  estado,
  respuesta,
  citas: [],
  seguridad: null,
  error: null,
  modelo: MODELO_PREGUNTAS,
  tokens_entrada: null,
  tokens_salida: null,
  tokens_cache_escrita: null,
  tokens_cache_leida: null,
  costo_usd: null,
  preguntado_por: 'perfil-1',
  quien: { full_name: 'Felipe Vargas' },
  creado_en: `2026-10-22T18:0${id}:00.000Z`,
  terminado_en: null,
});

type Pedido = {
  model: string;
  system: Array<{ text: string; cache_control?: unknown }>;
  messages: Array<{
    role: string;
    content: string | Array<Record<string, unknown>>;
  }>;
};

class PreguntasDePrueba extends PreguntasService {
  constructor(
    repo: unknown,
    analisis: unknown,
    adjuntos: unknown,
    oportunidades: unknown,
    readonly parse: jest.Mock,
  ) {
    super(
      repo as PreguntasRepository,
      analisis as AnalisisRepository,
      adjuntos as AdjuntosRepository,
      oportunidades as OportunidadesRepository,
      mockPinoLogger() as unknown as PinoLogger,
    );
  }

  protected cliente(): Anthropic {
    return { messages: { parse: this.parse } } as unknown as Anthropic;
  }
}

function armar() {
  const repo = {
    listar: jest.fn().mockResolvedValue([]),
    crear: jest.fn((f: Record<string, unknown>) =>
      Promise.resolve({ id: 7, estado: 'procesando', ...f }),
    ),
    terminar: jest.fn().mockResolvedValue(undefined),
    abandonarAntesDe: jest.fn().mockResolvedValue(undefined),
  };
  const analisis = {
    descargar: jest.fn().mockResolvedValue(Buffer.from('%PDF-1.7 bases')),
    ultimo: jest.fn().mockResolvedValue(null),
  };
  const adjuntos = {
    listar: jest.fn().mockResolvedValue([adjunto(1, 'Bases.pdf')]),
    perfilDe: jest.fn().mockResolvedValue('perfil-1'),
  };
  const oportunidades = {
    ficha: jest.fn().mockResolvedValue({
      codigo: CONTEXTO.codigo,
      proceso: {
        nombre: CONTEXTO.nombre,
        organismo: CONTEXTO.organismo,
        comuna: CONTEXTO.comuna,
      },
    }),
    configDe: jest.fn().mockResolvedValue({ perfil: CONTEXTO.perfil }),
  };
  const parse = jest.fn();
  const servicio = new PreguntasDePrueba(
    repo,
    analisis,
    adjuntos,
    oportunidades,
    parse,
  );
  return { servicio, repo, analisis, adjuntos, oportunidades, parse };
}

beforeEach(() => {
  process.env.ANTHROPIC_API_KEY = 'sk-prueba';
});

describe('Pregúntale a la IA: pedir', () => {
  it('sin bases no hay a quién preguntarle', async () => {
    const { servicio, adjuntos } = armar();
    adjuntos.listar.mockResolvedValue([]);
    await expect(
      servicio.preguntar(1, 'cuenta', 40, '¿Son por día?'),
    ).rejects.toThrow(BadRequestException);
    await expect(
      servicio.preguntar(1, 'cuenta', 40, '¿Son por día?'),
    ).rejects.toThrow('Sube primero las bases');
  });

  it('con dos letras no es una pregunta', async () => {
    const { servicio, repo } = armar();
    await expect(servicio.preguntar(1, 'cuenta', 40, ' ok ')).rejects.toThrow(
      'Escribe la pregunta primero.',
    );
    expect(repo.crear).not.toHaveBeenCalled();
  });

  it('deja la fila procesando con la pregunta limpia y responde por detrás', async () => {
    const { servicio, repo } = armar();
    const ejecutar = jest
      .spyOn(servicio, 'ejecutar')
      .mockResolvedValue(undefined);
    const r = await servicio.preguntar(
      1,
      'cuenta',
      40,
      '  ¿Las colaciones   son por día?  ',
    );
    expect(r.estado).toBe('procesando');
    expect(repo.crear).toHaveBeenCalledWith({
      company_id: 1,
      oportunidad_id: 40,
      pregunta: '¿Las colaciones son por día?',
      modelo: MODELO_PREGUNTAS,
      preguntado_por: 'perfil-1',
    });
    const [companyId, id, oportunidadId, leibles, contexto, pregunta] =
      ejecutar.mock.calls[0];
    expect([companyId, id, oportunidadId]).toEqual([1, 7, 40]);
    expect(leibles.map((a) => a.nombre)).toEqual(['Bases.pdf']);
    expect(contexto).toEqual(CONTEXTO);
    expect(pregunta).toBe('¿Las colaciones son por día?');
  });

  it('una a la vez: si hay otra en curso, avisa', async () => {
    const { servicio, repo } = armar();
    repo.crear.mockResolvedValue(null as never);
    await expect(
      servicio.preguntar(1, 'cuenta', 40, '¿Son por día?'),
    ).rejects.toThrow('Espera la respuesta anterior');
  });

  it('listar abandona lo que quedó procesando de antes del encendido', async () => {
    const { servicio, repo } = armar();
    repo.listar.mockResolvedValue([
      fila(3, '¿Cuántas personas?', 'listo', '40'),
    ]);
    const hilo = await servicio.listar(1, 40);
    expect(repo.abandonarAntesDe).toHaveBeenCalledWith(
      1,
      40,
      expect.any(String),
    );
    expect(hilo.map((p) => p.id)).toEqual([3]);
  });
});

describe('Pregúntale a la IA: responder', () => {
  const respuestaDeOpus = (parsed: unknown, stop = 'end_turn') => ({
    parsed_output: parsed,
    stop_reason: stop,
    usage: {
      input_tokens: 50,
      output_tokens: 20,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 90_000,
    },
  });

  it('los documentos y el análisis previo van primero con la marca de caché; el hilo entra en orden; la respuesta queda con citas y costo con caché', async () => {
    const { servicio, repo, analisis, parse } = armar();
    repo.listar.mockResolvedValue([
      fila(3, '¿Cuántas personas?', 'listo', '40 por día.'),
      fila(5, '¿Dónde?', 'error'),
      fila(7, '¿Son por día?', 'procesando'),
    ]);
    analisis.ultimo.mockResolvedValue({
      estado: 'listo',
      resultado: {
        resumen: 'Tres servicios para el Sudamericano.',
        requisitos: [{ que: 'Catamarán', documento: 'Ficha.pdf', pagina: 2 }],
      },
    });
    parse.mockResolvedValue(
      respuestaDeOpus({
        respuesta: ' Por día: 300 y 300 en total. ',
        citas: [
          {
            documento: 'Ficha técnica',
            pagina: 3,
            texto: '40 almuerzos diarios',
          },
          { documento: '', pagina: 1, texto: 'sin documento' },
        ],
        seguridad: 'media',
      }),
    );

    await servicio.ejecutar(
      1,
      7,
      40,
      [adjunto(1, 'Bases.pdf')],
      CONTEXTO,
      '¿Son por día?',
    );

    const [[pedido]] = parse.mock.calls as Array<[Pedido]>;
    expect(pedido.model).toBe(MODELO_PREGUNTAS);
    expect(pedido.system[0].text).toContain(CONTEXTO.codigo);
    expect(pedido.system[0].cache_control).toEqual({ type: 'ephemeral' });
    const primero = pedido.messages[0].content as Array<
      Record<string, unknown>
    >;
    expect(primero[0]).toMatchObject({ type: 'document', title: 'Bases.pdf' });
    expect(String(primero[1].text)).toContain('ANÁLISIS PREVIO');
    expect(String(primero[1].text)).toContain('Catamarán (Ficha.pdf, pág. 2)');
    expect(primero[2].cache_control).toEqual({ type: 'ephemeral' });
    expect(pedido.messages.map((m) => m.role)).toEqual([
      'user',
      'assistant',
      'user',
      'assistant',
      'user',
    ]);
    expect(pedido.messages[2].content).toBe('¿Cuántas personas?');
    expect(pedido.messages[3].content).toBe('40 por día.');
    expect(pedido.messages[4].content).toBe('¿Son por día?');

    expect(repo.terminar).toHaveBeenCalledWith(1, 7, {
      estado: 'listo',
      respuesta: 'Por día: 300 y 300 en total.',
      citas: [
        {
          documento: 'Ficha técnica',
          pagina: 3,
          texto: '40 almuerzos diarios',
        },
      ],
      seguridad: 'media',
      tokens_entrada: 50,
      tokens_salida: 20,
      tokens_cache_escrita: 0,
      tokens_cache_leida: 90_000,
      costo_usd: costoDelUso(
        { entrada: 50, salida: 20, cacheEscrita: 0, cacheLeida: 90_000 },
        MODELO_PREGUNTAS,
      ),
    });
  });

  it('sin respuesta de la IA, la fila queda en error con el motivo', async () => {
    const { servicio, repo, parse } = armar();
    parse.mockResolvedValue(respuestaDeOpus(null, 'max_tokens'));
    await servicio.ejecutar(
      1,
      7,
      40,
      [adjunto(1, 'Bases.pdf')],
      CONTEXTO,
      '¿Son por día?',
    );
    expect(repo.terminar).toHaveBeenCalledWith(
      1,
      7,
      expect.objectContaining({
        estado: 'error',
        error: 'La IA no respondió (max_tokens).',
      }),
    );
  });

  it('si la IA falla, el error queda en palabras de la casa y no lanza', async () => {
    const { servicio, repo, parse } = armar();
    parse.mockRejectedValue(new Error('boom'));
    await expect(
      servicio.ejecutar(
        1,
        7,
        40,
        [adjunto(1, 'Bases.pdf')],
        CONTEXTO,
        '¿Son por día?',
      ),
    ).resolves.toBeUndefined();
    expect(repo.terminar).toHaveBeenCalledWith(1, 7, {
      estado: 'error',
      error: 'No se pudo responder: boom',
    });
  });
});

describe('Pregúntale a la IA: las piezas', () => {
  it('armarMensajes salta las anteriores sin respuesta y termina con la pregunta nueva', () => {
    const bloque = {
      type: 'document' as const,
      title: 'Bases.pdf',
      source: {
        type: 'text' as const,
        media_type: 'text/plain' as const,
        data: 'x',
      },
    };
    const mensajes = armarMensajes(
      [bloque],
      null,
      [
        { pregunta: 'a', respuesta: 'A' },
        { pregunta: 'b', respuesta: null },
      ],
      'c',
    );
    expect(mensajes.map((m) => m.role)).toEqual([
      'user',
      'assistant',
      'user',
      'assistant',
      'user',
    ]);
    const primero = mensajes[0].content as unknown as Array<
      Record<string, unknown>
    >;
    expect(primero).toHaveLength(2);
    expect(primero[1].cache_control).toEqual({ type: 'ephemeral' });
    expect(mensajes[4].content).toBe('c');
  });

  it('citasValidas limpia, pone página 0 cuando no se sabe y para en el tope', () => {
    const muchas = Array.from({ length: 6 }, (_, i) => ({
      documento: `Doc ${i}`,
      pagina: i,
      texto: 'x',
    }));
    expect(citasValidas(muchas)).toHaveLength(MAX_CITAS);
    expect(
      citasValidas([{ documento: 'Bases', pagina: -2, texto: 42 }]),
    ).toEqual([{ documento: 'Bases', pagina: 0, texto: '' }]);
    expect(citasValidas('nada')).toEqual([]);
  });

  it('analisisComoTexto resume lo que la IA ya dijo, y nada sin análisis', () => {
    expect(analisisComoTexto(null)).toBeNull();
    expect(analisisComoTexto({})).toBeNull();
    const texto = analisisComoTexto({
      resumen: 'Tres servicios.',
      monto: 7_150_000,
      monto_detalle: 'IVA incluido',
      fechas: [{ que: 'Cierre', cuando: '23-10' }],
      te_dejan_fuera: ['Superar el presupuesto'],
    });
    expect(texto).toContain('Resumen: Tres servicios.');
    expect(texto).toContain('Monto: 7150000 (IVA incluido)');
    expect(texto).toContain('- Cierre: 23-10');
    expect(texto).toContain('- Superar el presupuesto');
  });

  it('las instrucciones traen la licitación, la empresa y el tope de citas', () => {
    const texto = instruccionesDePreguntas(CONTEXTO);
    expect(texto).toContain('1346350-37-COT26');
    expect(texto).toContain('complejo turístico con salones');
    expect(texto).toContain(`hasta ${MAX_CITAS}`);
  });
});
