import type Anthropic from '@anthropic-ai/sdk';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { PinoLogger } from 'nestjs-pino';
import { mockPinoLogger } from 'src/testing/mocks';
import type { AdjuntosRepository } from '../adjuntos/adjuntos.repository';
import type { AnalisisRepository } from '../analisis/analisis.repository';
import { MODELO_HAIKU, MODELO_SONNET } from '../analisis/comun';
import {
  instruccionesDeLaLecturaCorta,
  lecturaCortaValida,
  VERSION_DE_LAS_INSTRUCCIONES,
} from '../lectura-corta/lectura-corta';
import type { LecturaCortaRepository } from '../lectura-corta/lectura-corta.repository';
import { LecturaCortaService } from '../lectura-corta/lectura-corta.service';
import type { OportunidadesRepository } from '../oportunidades.repository';

// LA LECTURA CORTA DE LAS BASES (decisión 132, 12-11): Haiku contesta «¿es
// para la empresa?» con la regla de Felipe (no es para ti solo si las bases
// lo dejan claro; ante la duda, deja pasar). La prueba escribe SOLO en su
// tabla. La IA va de mentira.

const PERFIL =
  'Valle del Sol es un complejo de eventos en Quillón. Qué no vende. Catering servido fuera del complejo.';

class ServicioDePrueba extends LecturaCortaService {
  constructor(
    deps: ConstructorParameters<typeof LecturaCortaService>,
    private readonly ia: { messages: { parse: jest.Mock } },
  ) {
    super(...deps);
  }
  protected cliente(): Anthropic {
    return this.ia as unknown as Anthropic;
  }
}

const respuesta = (salida: unknown) => ({
  parsed_output: salida,
  stop_reason: 'end_turn',
  usage: { input_tokens: 10_000, output_tokens: 200 },
});

const NO_ES = {
  veredicto: 'no_es_para_ti',
  porque: 'Piden el coffee en el gimnasio municipal.',
  cita: {
    texto: 'El servicio se prestará en el Gimnasio Municipal.',
    documento: 'Bases.pdf',
    pagina: '3',
  },
  lugar: 'Gimnasio Municipal de Bulnes',
};

function armar() {
  const repo = {
    crear: jest.fn().mockResolvedValue(77),
    terminar: jest.fn().mockResolvedValue(undefined),
    ultimoLote: jest.fn().mockResolvedValue('lote-1'),
    delLote: jest.fn().mockResolvedValue([
      { estado: 'listo', veredicto: 'no_es_para_ti', costo_usd: 0.0042 },
      { estado: 'listo', veredicto: 'dudoso', costo_usd: 0.0051 },
      { estado: 'error', veredicto: null, costo_usd: null },
      { estado: 'procesando', veredicto: null, costo_usd: null },
    ]),
  };
  const adjuntos = {
    listar: jest.fn().mockResolvedValue([
      {
        id: 5,
        nombre: 'Bases.pdf',
        ruta: 'c1/oportunidades/40/bases.pdf',
        bytes: 1000,
        creado_en: '2026-11-11T12:00:00Z',
      },
    ]),
  };
  const oportunidades = {
    ficha: jest.fn((_empresa: number, id: number) =>
      Promise.resolve({
        id,
        codigo: `C-${id}`,
        proceso: {
          nombre: 'Coffee para el aniversario',
          organismo: 'Municipalidad de Bulnes',
          comuna: 'Bulnes',
          monto: 900000,
        },
      }),
    ),
    configDe: jest.fn().mockResolvedValue({ perfil: PERFIL }),
  };
  const archivos = {
    descargar: jest.fn().mockResolvedValue(Buffer.from('%PDF-1.4 bases')),
  };
  const ia = {
    messages: { parse: jest.fn().mockResolvedValue(respuesta(NO_ES)) },
  };
  const servicio = new ServicioDePrueba(
    [
      repo as unknown as LecturaCortaRepository,
      adjuntos as unknown as AdjuntosRepository,
      oportunidades as unknown as OportunidadesRepository,
      archivos as unknown as AnalisisRepository,
      mockPinoLogger() as unknown as PinoLogger,
    ],
    ia,
  );
  return { repo, adjuntos, oportunidades, archivos, ia, servicio };
}

/** Deja correr lo que la prueba hace de fondo. */
const hastaQue = async (listo: () => boolean) => {
  for (let i = 0; i < 100 && !listo(); i++) {
    await new Promise((r) => setTimeout(r, 0));
  }
};

describe('La lectura corta: qué se le pide a Haiku y qué se guarda (decisión 132)', () => {
  it('las instrucciones llevan la descripción de la empresa, el proceso y la regla de Felipe', () => {
    const texto = instruccionesDeLaLecturaCorta({
      perfil: PERFIL,
      proceso: {
        codigo: '3904-1023-COT26',
        nombre: 'Cóctel certificación',
        organismo: 'Municipalidad de Bulnes',
        comuna: 'Bulnes',
        monto: 600000,
      },
    });
    expect(texto).toContain(PERFIL);
    expect(texto).toContain('3904-1023-COT26');
    expect(texto).toContain('$600.000');
    expect(texto).toContain('Ante la duda, dudoso');
  });

  it('v2: el mismo criterio del análisis; el lugar que propone el proveedor es el recinto de la empresa, lo que se subcontrata no deja fuera y varios lugares es dudoso', () => {
    const texto = instruccionesDeLaLecturaCorta({
      perfil: PERFIL,
      proceso: {
        codigo: 'X-1',
        nombre: 'Jornada',
        organismo: null,
        comuna: null,
        monto: null,
      },
      casa: '\n\nLO QUE SABE LA CASA',
    });
    expect(VERSION_DE_LAS_INSTRUCCIONES).toBe('v2');
    expect(texto).toContain('el lugar lo propone el oferente');
    expect(texto).toContain('lo propone, lo ofrece o lo pone el proveedor');
    expect(texto).toContain(
      'el lugar está FIJADO y no es el recinto de la empresa',
    );
    expect(texto).toContain('NUNCA es motivo de no_es_para_ti');
    expect(texto).toContain('si piden varios lugares');
    expect(texto.endsWith('LO QUE SABE LA CASA')).toBe(true);
  });

  it('lo que contestó se limpia; un veredicto fuera de la lista no se guarda como «dudoso»', () => {
    expect(
      lecturaCortaValida({ ...NO_ES, veredicto: ' NO_ES_PARA_TI ' }),
    ).toEqual(NO_ES);
    expect(lecturaCortaValida({ ...NO_ES, veredicto: 'quizás' })).toBeNull();
    expect(lecturaCortaValida('no es para ti')).toBeNull();
    expect(lecturaCortaValida({ veredicto: 'dudoso' })).toEqual({
      veredicto: 'dudoso',
      porque: '',
      cita: { texto: '', documento: '', pagina: '' },
      lugar: '',
    });
  });
});

describe('LecturaCortaService.leerUna (decisión 132)', () => {
  it('anota la fila, lee las bases con Haiku y la termina con el veredicto, la cita y lo que costó', async () => {
    const { repo, ia, servicio } = armar();
    await servicio.leerUna(1, 40, 'lote-1');
    expect(repo.crear).toHaveBeenCalledWith({
      company_id: 1,
      oportunidad_id: 40,
      codigo: 'C-40',
      lote: 'lote-1',
      origen: 'prueba',
      modelo: MODELO_HAIKU,
    });
    const [pedido] = ia.messages.parse.mock.calls[0] as [
      {
        model: string;
        system: string;
        messages: Array<{ content: unknown[] }>;
      },
    ];
    expect(pedido.model).toBe(MODELO_HAIKU);
    expect(pedido.system).toContain(PERFIL);
    expect(pedido.messages[0].content[0]).toMatchObject({
      type: 'document',
      title: 'Bases.pdf',
    });
    expect(repo.terminar).toHaveBeenCalledWith(1, 77, {
      estado: 'listo',
      ...NO_ES,
      archivos: [{ id: 5, nombre: 'Bases.pdf' }],
      no_leidos: [],
      tokens_entrada: 10_000,
      tokens_salida: 200,
      // 10.000 × 0,1 + 200 × 0,5, por millón.
      costo_usd: 0.0011,
    });
  });

  it('devuelve lo que dijo Haiku y anota el origen pedido (la pasada del radar, decisión 132)', async () => {
    const { repo, servicio } = armar();
    await expect(
      servicio.leerUna(1, 40, 'radar 1', { origen: 'radar' }),
    ).resolves.toEqual(NO_ES);
    expect(repo.crear).toHaveBeenCalledWith(
      expect.objectContaining({ origen: 'radar', lote: 'radar 1' }),
    );
  });

  it('sin bases que leer queda en error y no le pregunta a Haiku', async () => {
    const { repo, adjuntos, ia, servicio } = armar();
    adjuntos.listar.mockResolvedValue([]);
    await expect(servicio.leerUna(1, 40, 'lote-1')).resolves.toBeNull();
    expect(ia.messages.parse).not.toHaveBeenCalled();
    expect(repo.terminar).toHaveBeenCalledWith(1, 77, {
      estado: 'error',
      error: 'Sin bases que leer.',
    });
  });

  it('una oportunidad de otra empresa no se anota', async () => {
    const { repo, oportunidades, servicio } = armar();
    oportunidades.ficha.mockResolvedValue(null as never);
    await servicio.leerUna(2, 40, 'lote-1');
    expect(repo.crear).not.toHaveBeenCalled();
  });

  it('si Haiku contesta sin el formato, o falla, la fila queda en error con su porqué', async () => {
    const { repo, ia, servicio } = armar();
    ia.messages.parse.mockResolvedValueOnce(respuesta({ veredicto: 'quizás' }));
    await servicio.leerUna(1, 40, 'lote-1');
    expect(repo.terminar).toHaveBeenLastCalledWith(
      1,
      77,
      expect.objectContaining({
        estado: 'error',
        error: expect.stringContaining('formato'),
        costo_usd: 0.0011,
      }),
    );
    ia.messages.parse.mockRejectedValueOnce(new Error('se cortó'));
    await servicio.leerUna(1, 40, 'lote-1');
    expect(repo.terminar).toHaveBeenLastCalledWith(
      1,
      77,
      expect.objectContaining({ estado: 'error' }),
    );
  });
});

describe('LecturaCortaService.prueba (decisión 132)', () => {
  const llave = process.env.ANTHROPIC_API_KEY;
  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = 'llave-de-prueba';
  });
  afterAll(() => {
    if (llave === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = llave;
  });

  it('responde al tiro con el lote, lee las pedidas sin repetir, de a una, y escribe solo en su tabla', async () => {
    const { repo, ia, servicio } = armar();
    const inicio = servicio.prueba(1, [40, 41, 40]);
    expect(inicio).toEqual({
      iniciada: true,
      lote: expect.any(String),
      total: 2,
    });
    await hastaQue(() => repo.terminar.mock.calls.length === 2);
    expect(
      repo.crear.mock.calls.map(
        ([f]) => (f as { oportunidad_id: number }).oportunidad_id,
      ),
    ).toEqual([40, 41]);
    expect(ia.messages.parse).toHaveBeenCalledTimes(2);
  });

  it('con Sonnet si se pide: lo usa, lo anota en la fila y en el lote; de partida, Haiku', async () => {
    const { repo, ia, servicio } = armar();
    const inicio = servicio.prueba(1, [40], 'sonnet');
    expect(inicio).toMatchObject({
      iniciada: true,
      lote: expect.stringMatching(/ v2 sonnet$/),
    });
    await hastaQue(() => repo.terminar.mock.calls.length === 1);
    expect(repo.crear).toHaveBeenCalledWith(
      expect.objectContaining({ modelo: MODELO_SONNET }),
    );
    expect(ia.messages.parse).toHaveBeenCalledWith(
      expect.objectContaining({ model: MODELO_SONNET }),
    );
    await new Promise((r) => setTimeout(r, 0));
    expect(servicio.prueba(1, [41])).toMatchObject({
      lote: expect.stringMatching(/ v2 haiku$/),
    });
    await hastaQue(() => repo.terminar.mock.calls.length === 2);
  });

  it('una prueba a la vez; sin la llave de Anthropic no parte', async () => {
    const { repo, servicio } = armar();
    servicio.prueba(1, [40]);
    expect(servicio.prueba(1, [41])).toEqual({
      iniciada: false,
      motivo: 'Ya hay una prueba de la lectura corta en marcha.',
    });
    await hastaQue(() => repo.terminar.mock.calls.length === 1);
    // Terminada la primera, se puede lanzar otra.
    await new Promise((r) => setTimeout(r, 0));
    expect(servicio.prueba(1, [42]).iniciada).toBe(true);
    await hastaQue(() => repo.terminar.mock.calls.length === 2);
    delete process.env.ANTHROPIC_API_KEY;
    expect(() => servicio.prueba(1, [40])).toThrow(BadRequestException);
  });
});

describe('LecturaCortaService.avance (decisión 132)', () => {
  it('cuenta cómo va un lote y lo que costó; sin lote, el último', async () => {
    const { repo, servicio } = armar();
    await expect(servicio.avance(1)).resolves.toEqual({
      lote: 'lote-1',
      corriendo: false,
      pedidas: null,
      leidas: 4,
      estados: { procesando: 1, listo: 2, error: 1 },
      veredictos: { es_para_ti: 0, no_es_para_ti: 1, dudoso: 1 },
      costo_usd: 0.0093,
    });
    expect(repo.delLote).toHaveBeenCalledWith(1, 'lote-1');
    await servicio.avance(1, 'otro-lote');
    expect(repo.delLote).toHaveBeenLastCalledWith(1, 'otro-lote');
  });

  it('mientras corre dice cuántas se pidieron; sin pruebas, 404', async () => {
    const llave = process.env.ANTHROPIC_API_KEY;
    process.env.ANTHROPIC_API_KEY = 'llave-de-prueba';
    const { repo, servicio } = armar();
    const inicio = servicio.prueba(1, [40, 41, 42]);
    const lote = inicio.iniciada ? inicio.lote : '';
    await expect(servicio.avance(1, lote)).resolves.toMatchObject({
      corriendo: true,
      pedidas: 3,
    });
    await hastaQue(() => repo.terminar.mock.calls.length === 3);
    repo.ultimoLote.mockResolvedValue(null);
    await expect(servicio.avance(1)).rejects.toThrow(NotFoundException);
    if (llave === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = llave;
  });
});
