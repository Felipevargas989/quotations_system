import Anthropic from '@anthropic-ai/sdk';
import type { PinoLogger } from 'nestjs-pino';
import { mockPinoLogger } from 'src/testing/mocks';
import {
  descripcionDe,
  instruccionesPara,
  LecturaDetenida,
  LecturaService,
  MODELO_LECTURA,
  type PerfilDeEmpresa,
  type ProcesoParaLeer,
  type Uso,
} from '../lectura/lectura.service';

const PROCESO: ProcesoParaLeer = {
  codigo: '4364-13-LE26',
  tipo: 'licitacion',
  nombre: 'Producción de Evento día del Profesor',
  descripcion: 'Conmemorar a los docentes de la comuna',
  organismo: 'I MUNICIPALIDAD DE QUILLON',
  unidad: 'Educación',
  comuna: 'Quillón',
  region: 'Región del Ñuble',
  monto: 15960000,
  fecha_cierre: '2026-10-19T19:00:00.000Z',
  productos: [
    { nombre: 'Producción de eventos', descripcion: 'para 300 personas' },
  ],
};

const EMPRESA: PerfilDeEmpresa = {
  nombre: 'Valle del Sol',
  perfil: 'Complejo turístico en Quillón: eventos, alojamiento y salones.',
  paquetes: ['Evento: matrimonio', 'Salones: día completo'],
  fijos: ['Garzón'],
};

// El servicio con el cliente de Anthropic cambiado por uno falso.
class LecturaDePrueba extends LecturaService {
  constructor(readonly parse: jest.Mock) {
    super(mockPinoLogger() as unknown as PinoLogger);
  }

  protected cliente(): Anthropic {
    return { messages: { parse: this.parse } } as unknown as Anthropic;
  }
}

const respuesta = (salida: unknown, stop_reason = 'end_turn') => ({
  stop_reason,
  usage: { input_tokens: 900, output_tokens: 60 },
  parsed_output: salida,
});

describe('LecturaService', () => {
  it('pide a Haiku 5.5, con esfuerzo bajo y las instrucciones en caché', async () => {
    const parse = jest.fn().mockResolvedValue(
      respuesta({
        semaforo: 'verde',
        etiquetas: ['evento', 'alimentacion'],
        se_hace_en_el_complejo: 'si',
        razon: '  Evento para profesores, el lugar lo propone el oferente.  ',
      }),
    );
    const uso: Uso = { entrada: 0, salida: 0 };
    const lectura = await new LecturaDePrueba(parse).leer(
      PROCESO,
      EMPRESA,
      uso,
    );

    expect(lectura).toEqual({
      semaforo: 'verde',
      etiquetas: ['evento', 'alimentacion'],
      se_hace_en_el_complejo: 'si',
      razon: 'Evento para profesores, el lugar lo propone el oferente.',
    });
    expect(uso).toEqual({ entrada: 900, salida: 60 });

    const [[pedido]] = parse.mock.calls as Array<
      [
        {
          model: string;
          output_config: { effort: string };
          system: Array<{ text: string; cache_control: unknown }>;
          messages: Array<{ content: string }>;
        },
      ]
    >;
    expect(pedido.model).toBe(MODELO_LECTURA);
    expect(MODELO_LECTURA).toBe('claude-haiku-5-5');
    expect(pedido.output_config.effort).toBe('low');
    expect(pedido.system[0].cache_control).toEqual({ type: 'ephemeral' });
    expect(pedido.system[0].text).toContain('Valle del Sol');
    expect(pedido.messages[0].content).toContain(
      'Producción de Evento día del Profesor',
    );
  });

  it('sin etiquetas, queda como "otro"', async () => {
    const parse = jest.fn().mockResolvedValue(
      respuesta({
        semaforo: 'rojo',
        etiquetas: [],
        se_hace_en_el_complejo: 'no',
        razon: 'Compra de hormigón.',
      }),
    );
    const lectura = await new LecturaDePrueba(parse).leer(PROCESO, EMPRESA);
    expect(lectura?.etiquetas).toEqual(['otro']);
  });

  it('si el modelo se niega o no devuelve nada legible, queda en amarillo para revisar a mano', async () => {
    for (const r of [
      respuesta(null, 'refusal'),
      respuesta(null, 'max_tokens'),
    ]) {
      const lectura = await new LecturaDePrueba(
        jest.fn().mockResolvedValue(r),
      ).leer(PROCESO, EMPRESA);
      expect(lectura).toMatchObject({
        semaforo: 'amarillo',
        se_hace_en_el_complejo: 'dudoso',
      });
    }
  });

  it('sin cupo o con la llave mala: se detiene la lectura de ESTA corrida', async () => {
    const errores = [
      new Anthropic.RateLimitError(429, {}, 'rate limited', new Headers()),
      new Anthropic.AuthenticationError(
        401,
        {},
        'invalid x-api-key',
        new Headers(),
      ),
    ];
    for (const error of errores) {
      const parse = jest.fn().mockRejectedValue(error);
      await expect(
        new LecturaDePrueba(parse).leer(PROCESO, EMPRESA),
      ).rejects.toBeInstanceOf(LecturaDetenida);
    }
  });

  it('si el modelo no existe o se acabó el saldo, también se detiene', async () => {
    const errores = [
      new Anthropic.NotFoundError(
        404,
        {},
        'model: claude-haiku-5-5',
        new Headers(),
      ),
      // Como llega de la API: el mensaje viene dentro del cuerpo.
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
    ];
    for (const error of errores) {
      const parse = jest.fn().mockRejectedValue(error);
      await expect(
        new LecturaDePrueba(parse).leer(PROCESO, EMPRESA),
      ).rejects.toBeInstanceOf(LecturaDetenida);
    }
  });

  it('un 400 por ESE proceso no detiene nada: queda sin leer', async () => {
    const parse = jest
      .fn()
      .mockRejectedValue(
        new Anthropic.BadRequestError(
          400,
          {},
          'messages: text content blocks must be non-empty',
          new Headers(),
        ),
      );
    await expect(
      new LecturaDePrueba(parse).leer(PROCESO, EMPRESA),
    ).resolves.toBeNull();
  });

  it('cualquier otra falla: ese proceso queda sin leer (null) y se reintenta después', async () => {
    const parse = jest
      .fn()
      .mockRejectedValue(
        new Anthropic.InternalServerError(529, {}, 'overloaded', new Headers()),
      );
    await expect(
      new LecturaDePrueba(parse).leer(PROCESO, EMPRESA),
    ).resolves.toBeNull();
  });

  it('configurado = hay ANTHROPIC_API_KEY', () => {
    const antes = process.env.ANTHROPIC_API_KEY;
    const servicio = new LecturaDePrueba(jest.fn());
    try {
      delete process.env.ANTHROPIC_API_KEY;
      expect(servicio.configurado).toBe(false);
      process.env.ANTHROPIC_API_KEY = 'llave-de-prueba';
      expect(servicio.configurado).toBe(true);
    } finally {
      if (antes === undefined) delete process.env.ANTHROPIC_API_KEY;
      else process.env.ANTHROPIC_API_KEY = antes;
    }
  });
});

describe('lo que lee la IA', () => {
  it('las instrucciones llevan el perfil y el catálogo de la empresa', () => {
    const texto = instruccionesPara(EMPRESA);
    expect(texto).toContain('Complejo turístico en Quillón');
    expect(texto).toContain('Evento: matrimonio; Salones: día completo');
    expect(texto).toContain('Garzón');
  });

  it('la descripción lleva comprador, monto en pesos chilenos y productos', () => {
    const texto = descripcionDe(PROCESO);
    expect(texto).toContain('I MUNICIPALIDAD DE QUILLON — Educación — Quillón');
    expect(texto).toContain('$15.960.000');
    expect(texto).toContain('- Producción de eventos: para 300 personas');
    expect(texto).toContain('(licitación)');
  });

  it('sin monto ni productos lo dice, no inventa', () => {
    const texto = descripcionDe({ ...PROCESO, monto: null, productos: [] });
    expect(texto).toContain('Monto: (no informado)');
    expect(texto).toContain('(sin detalle)');
  });
});
