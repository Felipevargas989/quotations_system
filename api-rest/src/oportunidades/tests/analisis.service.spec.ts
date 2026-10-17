import Anthropic from '@anthropic-ai/sdk';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { PinoLogger } from 'nestjs-pino';
import { deflateRawSync } from 'node:zlib';
import { mockPinoLogger } from 'src/testing/mocks';
import type { AdjuntosRepository } from '../adjuntos/adjuntos.repository';
import type { AnalisisRepository } from '../analisis/analisis.repository';
import {
  AnalisisService,
  errorDeAnalisis,
  instruccionesDeBases,
  MAX_BYTES_DE_PDF,
  MODELO_BASES,
} from '../analisis/analisis.service';
import type { OportunidadesRepository } from '../oportunidades.repository';

const CUENTA = 'cuenta-1';
const PERFIL = 'perfil-1';

const adjunto = (id: number, nombre: string, bytes = 1000) => ({
  id,
  nombre,
  ruta: `c1/oportunidades/40/x_${nombre}`,
  tipo: 'application/pdf',
  bytes,
  creado_en: `2026-10-17T13:11:3${id}.000Z`,
  subido_por: PERFIL,
  quien: { full_name: 'Felipe Vargas' },
});

/** Un Word mínimo (un ZIP con word/document.xml). */
const wordCon = (texto: string): Buffer => {
  const xml = Buffer.from(
    `<w:document><w:body><w:p><w:r><w:t>${texto}</w:t></w:r></w:p></w:body></w:document>`,
  );
  const cuerpo = deflateRawSync(xml);
  const n = Buffer.from('word/document.xml');
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(8, 8);
  local.writeUInt32LE(cuerpo.length, 18);
  local.writeUInt16LE(n.length, 26);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(8, 10);
  central.writeUInt32LE(cuerpo.length, 20);
  central.writeUInt16LE(n.length, 28);
  const fin = Buffer.alloc(22);
  fin.writeUInt32LE(0x06054b50, 0);
  fin.writeUInt16LE(1, 10);
  fin.writeUInt32LE(central.length + n.length, 12);
  fin.writeUInt32LE(local.length + n.length + cuerpo.length, 16);
  return Buffer.concat([local, n, cuerpo, central, n, fin]);
};

const RESULTADO = {
  resumen: 'Ceremonia y cena del Día del Funcionario para 160 personas.',
  lugar: 'lo propone el oferente',
  se_puede_en_el_complejo: 'si',
  monto: 12_000_000,
  monto_detalle: 'IVA incluido',
  fechas: [{ que: 'Cierre de ofertas', cuando: '19-10-2026 16:00' }],
  criterios: [
    {
      nombre: 'Oferta económica',
      peso: '45%',
      como_se_evalua: 'precio mínimo',
    },
  ],
  requisitos: [
    {
      que: 'Anexo N°1 firmado',
      tipo: 'administrativo',
      obligatorio: true,
      documento: 'Formularios_Anexos.docx',
      pagina: 0,
    },
  ],
  garantias: [],
  alertas: [],
};

// El servicio con el cliente de Anthropic cambiado por uno falso.
class AnalisisDePrueba extends AnalisisService {
  constructor(
    repo: unknown,
    adjuntos: unknown,
    oportunidades: unknown,
    readonly parse: jest.Mock,
  ) {
    super(
      repo as AnalisisRepository,
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
    ultimo: jest.fn().mockResolvedValue(null),
    crear: jest.fn((fila: Record<string, unknown>) =>
      Promise.resolve({ id: 5, estado: 'procesando', ...fila }),
    ),
    terminar: jest.fn().mockResolvedValue(undefined),
    abandonarAntesDe: jest.fn().mockResolvedValue(undefined),
    descargar: jest.fn().mockResolvedValue(Buffer.from('%PDF-1.7 bases')),
  };
  const adjuntos = {
    listar: jest.fn().mockResolvedValue([]),
    perfilDe: jest.fn().mockResolvedValue(PERFIL),
  };
  const oportunidades = {
    ficha: jest.fn().mockResolvedValue({
      id: 40,
      codigo: '1532886-5-LE26',
      proceso: {
        nombre: 'Ceremonia y Cena Día del Funcionario',
        organismo: 'I MUNICIPALIDAD DE QUILLON',
        comuna: 'Quillón',
      },
    }),
    configDe: jest.fn().mockResolvedValue({ perfil: 'Complejo en Quillón' }),
  };
  const parse = jest.fn().mockResolvedValue({
    stop_reason: 'end_turn',
    usage: { input_tokens: 100_000, output_tokens: 5_000 },
    parsed_output: RESULTADO,
  });
  const servicio = new AnalisisDePrueba(repo, adjuntos, oportunidades, parse);
  return { repo, adjuntos, oportunidades, parse, servicio };
}

const conLlave = async (prueba: () => Promise<void>) => {
  const antes = process.env.ANTHROPIC_API_KEY;
  process.env.ANTHROPIC_API_KEY = 'llave-de-prueba';
  try {
    await prueba();
  } finally {
    if (antes === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = antes;
  }
};

describe('AnalisisService — pedir', () => {
  it('sin archivos, con solo un ZIP o con PDF de más de 22 MB: 400 y no crea nada', () =>
    conLlave(async () => {
      const { adjuntos, repo, servicio } = armar();
      await expect(servicio.pedir(1, CUENTA, 40)).rejects.toThrow(
        'Sube primero las bases',
      );
      adjuntos.listar.mockResolvedValue([adjunto(1, 'todo.zip')]);
      await expect(servicio.pedir(1, CUENTA, 40)).rejects.toThrow(
        'Ninguno de los archivos se puede leer',
      );
      adjuntos.listar.mockResolvedValue([
        adjunto(1, 'bases.pdf', MAX_BYTES_DE_PDF + 1),
      ]);
      await expect(servicio.pedir(1, CUENTA, 40)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(repo.crear).not.toHaveBeenCalled();
    }));

  it('una oportunidad de otra empresa es 404; sin llave de Anthropic, 400', async () => {
    const { oportunidades, servicio } = armar();
    await conLlave(async () => {
      oportunidades.ficha.mockResolvedValue(null);
      await expect(servicio.pedir(2, CUENTA, 40)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
    const antes = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    try {
      await expect(armar().servicio.pedir(1, CUENTA, 40)).rejects.toThrow(
        'Falta la llave de Anthropic',
      );
    } finally {
      if (antes !== undefined) process.env.ANTHROPIC_API_KEY = antes;
    }
  });

  it('crea la fila con lo que se lee y lo que no, firmada por el perfil, y responde al tiro', () =>
    conLlave(async () => {
      const { adjuntos, repo, servicio } = armar();
      adjuntos.listar.mockResolvedValue([
        adjunto(2, 'Formularios_Anexos.docx'),
        adjunto(1, 'Bases.pdf'),
        adjunto(3, 'Planos.zip'),
      ]);
      const ejecutar = jest
        .spyOn(servicio, 'ejecutar')
        .mockResolvedValue(undefined);

      const fila = await servicio.pedir(1, CUENTA, 40);

      expect(fila).toMatchObject({ id: 5, estado: 'procesando' });
      // Lee solo las bases (no lo que la empresa va a presentar).
      expect(adjuntos.listar).toHaveBeenCalledWith(1, 40, 'bases');
      expect(repo.crear).toHaveBeenCalledWith({
        company_id: 1,
        oportunidad_id: 40,
        modelo: MODELO_BASES,
        // En el orden en que se subieron.
        archivos: [
          { id: 1, nombre: 'Bases.pdf' },
          { id: 2, nombre: 'Formularios_Anexos.docx' },
        ],
        no_leidos: [expect.objectContaining({ nombre: 'Planos.zip' })],
        pedido_por: PERFIL,
      });
      expect(ejecutar).toHaveBeenCalledWith(
        1,
        5,
        expect.any(Array),
        expect.any(Array),
        expect.objectContaining({
          codigo: '1532886-5-LE26',
          perfil: 'Complejo en Quillón',
        }),
      );
    }));

  it('si ya hay uno en curso, devuelve ese', () =>
    conLlave(async () => {
      const { adjuntos, repo, servicio } = armar();
      adjuntos.listar.mockResolvedValue([adjunto(1, 'Bases.pdf')]);
      (repo.crear as jest.Mock).mockResolvedValue(null);
      repo.ultimo.mockResolvedValue({ id: 4, estado: 'procesando' });
      await expect(servicio.pedir(1, CUENTA, 40)).resolves.toMatchObject({
        id: 4,
      });
    }));
});

describe('AnalisisService — ejecutar (por detrás)', () => {
  const contexto = {
    codigo: '1532886-5-LE26',
    nombre: 'Ceremonia y Cena Día del Funcionario',
    organismo: 'I MUNICIPALIDAD DE QUILLON',
    comuna: 'Quillón',
    perfil: 'Complejo en Quillón',
  };

  it('manda el PDF entero y el Word como texto a Opus 5.5, y guarda el resultado con su costo', async () => {
    const { repo, parse, servicio } = armar();
    repo.descargar.mockImplementation((ruta: string) =>
      Promise.resolve(
        ruta.endsWith('.docx')
          ? wordCon('ANEXO N°1')
          : Buffer.from('%PDF-1.7 bases'),
      ),
    );

    await servicio.ejecutar(
      1,
      5,
      [adjunto(1, 'Bases.pdf'), adjunto(2, 'Formularios_Anexos.docx')] as never,
      [],
      contexto,
    );

    const [[pedido]] = parse.mock.calls as Array<
      [
        {
          model: string;
          output_config: { effort: string };
          system: string;
          messages: Array<{
            content: Array<{
              type: string;
              title?: string;
              source?: { type: string; media_type: string; data: string };
            }>;
          }>;
        },
      ]
    >;
    expect(pedido.model).toBe('claude-opus-5-5');
    expect(pedido.output_config.effort).toBe('medium');
    expect(pedido.system).toContain('1532886-5-LE26');
    const [pdf, word, texto] = pedido.messages[0].content;
    expect(pdf).toMatchObject({
      type: 'document',
      title: 'Bases.pdf',
      source: { type: 'base64', media_type: 'application/pdf' },
    });
    expect(word).toMatchObject({
      type: 'document',
      title: 'Formularios_Anexos.docx',
      source: { type: 'text', media_type: 'text/plain', data: 'ANEXO N°1' },
    });
    expect(texto.type).toBe('text');

    // 100.000 de entrada a US$4 el millón + 5.000 de salida a US$20.
    expect(repo.terminar).toHaveBeenCalledWith(1, 5, {
      estado: 'listo',
      resultado: RESULTADO,
      no_leidos: [],
      tokens_entrada: 100_000,
      tokens_salida: 5_000,
      costo_usd: 0.5,
    });
  });

  it('si la IA se niega o no termina, queda en error con el motivo (y lo que costó)', async () => {
    const { repo, parse, servicio } = armar();
    parse.mockResolvedValue({
      stop_reason: 'refusal',
      usage: { input_tokens: 10, output_tokens: 1 },
      parsed_output: null,
    });
    await servicio.ejecutar(
      1,
      5,
      [adjunto(1, 'Bases.pdf')] as never,
      [],
      contexto,
    );
    expect(repo.terminar).toHaveBeenCalledWith(
      1,
      5,
      expect.objectContaining({
        estado: 'error',
        error: expect.stringContaining('refusal') as unknown,
      }),
    );
  });

  it('un Word que no se abre queda entre los no leídos; si no queda nada, error sin llamar a la IA', async () => {
    const { repo, parse, servicio } = armar();
    repo.descargar.mockResolvedValue(Buffer.from('no es un zip'));
    await servicio.ejecutar(
      1,
      5,
      [adjunto(2, 'Roto.docx')] as never,
      [],
      contexto,
    );
    expect(parse).not.toHaveBeenCalled();
    expect(repo.terminar).toHaveBeenCalledWith(1, 5, {
      estado: 'error',
      no_leidos: [{ nombre: 'Roto.docx', motivo: 'no se pudo abrir' }],
      error: 'No se pudo abrir ninguno de los archivos.',
    });
  });

  it('nunca revienta: la falla queda escrita en palabras de la casa', async () => {
    const { repo, parse, servicio } = armar();
    parse.mockRejectedValue(
      new Anthropic.BadRequestError(
        400,
        {
          type: 'error',
          error: {
            type: 'invalid_request_error',
            message:
              'Your credit balance is too low to access the Anthropic API.',
          },
        },
        undefined,
        new Headers(),
      ),
    );
    await expect(
      servicio.ejecutar(1, 5, [adjunto(1, 'Bases.pdf')] as never, [], contexto),
    ).resolves.toBeUndefined();
    expect(repo.terminar).toHaveBeenCalledWith(1, 5, {
      estado: 'error',
      error: 'Se acabó el saldo de la cuenta de Anthropic.',
    });
  });
});

describe('AnalisisService — el último', () => {
  it('antes de responder, da por cortado lo que quedó procesando de un motor anterior', async () => {
    const { repo, servicio } = armar();
    await servicio.ultimo(1, 40);
    expect(repo.abandonarAntesDe).toHaveBeenCalledWith(
      1,
      40,
      expect.any(String),
    );
    expect(repo.ultimo).toHaveBeenCalledWith(1, 40);
  });
});

describe('lo que lee y dice la IA', () => {
  it('las instrucciones llevan la licitación y la empresa, y piden no inventar', () => {
    const t = instruccionesDeBases({
      codigo: '4364-13-LE26',
      nombre: 'Producción de Evento día del Profesor',
      organismo: 'I MUNICIPALIDAD DE QUILLON',
      comuna: 'Quillón',
      perfil: 'Complejo turístico en Quillón',
    });
    expect(t).toContain('4364-13-LE26');
    expect(t).toContain('Complejo turístico en Quillón');
    expect(t).toContain('No inventes');
    expect(t).toContain('aclaratoria');
  });

  it('las fallas, en palabras de la casa', () => {
    expect(
      errorDeAnalisis(
        new Anthropic.RateLimitError(429, {}, 'rate limited', new Headers()),
      ),
    ).toContain('sin cupo');
    expect(
      errorDeAnalisis(
        new Anthropic.AuthenticationError(401, {}, 'bad key', new Headers()),
      ),
    ).toContain('llave');
    expect(
      errorDeAnalisis(new Error('prompt is too long: 1200000 tokens')),
    ).toContain('demasiadas páginas');
  });
});
