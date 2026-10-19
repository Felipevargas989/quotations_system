import Anthropic from '@anthropic-ai/sdk';
import type { PinoLogger } from 'nestjs-pino';
import { mockPinoLogger } from 'src/testing/mocks';
import {
  descripcionDe,
  instruccionesPara,
  LECTURA_ACTUAL,
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

  it('lo que contesta se revisa: «Rojo.» es rojo, «Sí» es si, las etiquetas inventadas se botan; un color que no existe queda en amarillo para revisar a mano (18-10)', async () => {
    // La pasada de las 23:07 del 18-10 se cayó entera porque la base
    // rechazó un color fuera de verde, amarillo y rojo.
    const limpia = await new LecturaDePrueba(
      jest.fn().mockResolvedValue(
        respuesta({
          semaforo: ' Rojo.',
          etiquetas: ['Evento', 'banqueteria', 'evento'],
          se_hace_en_el_complejo: 'Sí',
          razon: '  Show público en la plaza. ',
        }),
      ),
    ).leer(PROCESO, EMPRESA);
    expect(limpia).toEqual({
      semaforo: 'rojo',
      etiquetas: ['evento'],
      se_hace_en_el_complejo: 'si',
      razon: 'Show público en la plaza.',
    });

    const rara = await new LecturaDePrueba(
      jest.fn().mockResolvedValue(
        respuesta({
          semaforo: 'naranjo',
          etiquetas: ['evento'],
          se_hace_en_el_complejo: 'no',
          razon: 'x',
        }),
      ),
    ).leer(PROCESO, EMPRESA);
    expect(rara).toMatchObject({
      semaforo: 'amarillo',
      se_hace_en_el_complejo: 'dudoso',
      razon: 'La lectura automática no resultó: conviene revisarla a mano.',
    });
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

describe('LecturaService — el filtro de la historia', () => {
  const filas = [
    { codigo: 'A', nombre: 'Día del profesor' },
    { codigo: 'B', nombre: 'Insumos dentales' },
    { codigo: 'C', nombre: 'Cena aniversario' },
  ];

  it('devuelve los códigos de los números que eligió la IA', async () => {
    const parse = jest
      .fn()
      .mockResolvedValue(respuesta({ candidatas: [1, 3, 99] }));
    const r = await new LecturaDePrueba(parse).candidatasPorNombre(filas);
    expect(r).toEqual(new Set(['A', 'C']));
    const [[pedido]] = parse.mock.calls as Array<
      [{ messages: Array<{ content: string }> }]
    >;
    expect(pedido.messages[0].content).toBe(
      '1. Día del profesor\n2. Insumos dentales\n3. Cena aniversario',
    );
  });

  it('sin lista no llama a la IA; si no responde legible, null (el día queda pendiente)', async () => {
    const parse = jest.fn().mockResolvedValue(respuesta(null, 'max_tokens'));
    const servicio = new LecturaDePrueba(parse);
    await expect(servicio.candidatasPorNombre([])).resolves.toEqual(new Set());
    expect(parse).not.toHaveBeenCalled();
    await expect(servicio.candidatasPorNombre(filas)).resolves.toBeNull();
  });

  it('si falla la cuenta, se detiene', async () => {
    const parse = jest
      .fn()
      .mockRejectedValue(
        new Anthropic.RateLimitError(429, {}, 'rate limited', new Headers()),
      );
    await expect(
      new LecturaDePrueba(parse).candidatasPorNombre(filas),
    ).rejects.toBeInstanceOf(LecturaDetenida);
  });
});

describe('lo que lee la IA', () => {
  it('las instrucciones llevan el perfil y el catálogo de la empresa', () => {
    const texto = instruccionesPara(EMPRESA);
    expect(texto).toContain('Complejo turístico en Quillón');
    expect(texto).toContain('Evento: matrimonio; Salones: día completo');
    expect(texto).toContain('Garzón');
  });

  it('las celebraciones sin lugar se hacen en el recinto del oferente; las capacitaciones sin lugar, no (Felipe, 17-10)', () => {
    const texto = instruccionesPara(EMPRESA);
    expect(texto).toContain('un comprador público no tiene salón de banquetes');
    expect(texto).toContain(
      'días del funcionario, del profesor o del dirigente',
    );
    expect(texto).toContain(
      'la celebración no dice dónde, es "si". Las capacitaciones, jornadas de trabajo y talleres que no dicen dónde siguen "dudoso"',
    );
    // El verde sale de "se hace en el complejo".
    expect(texto).toContain(
      '"verde" si es del rubro de la empresa y se_hace_en_el_complejo es "si"',
    );
  });

  it('lo que la empresa marca POR EVALUAR va amarillo aunque sea fuera (Felipe, 18-10: el catering)', () => {
    const texto = instruccionesPara(EMPRESA);
    expect(texto).toContain(
      'Lo que la descripción de la empresa marca POR EVALUAR va "amarillo", aunque se haga fuera de la empresa',
    );
    // El lugar no se maquilla: dice dónde es de verdad.
    expect(texto).toContain('("no" si es donde el comprador)');
  });

  it('el filtro afinado del 18-10 en la noche: el curso no es el lugar, el evento público es en la comuna, lo POR EVALUAR con monto mínimo y ejemplos reales', () => {
    // Felipe, con 87 amarillas: "quiero afinar el ojo del filtro... corramos
    // a, b, c y d y dejemos mejor entrenado a ese agente".
    const texto = instruccionesPara(EMPRESA);
    expect(texto).toContain(
      'en que se compra el curso, el relator, el monitor o el contenido NO es del rubro',
    );
    expect(texto).toContain(
      'Un evento público del comprador (feria, festival, show',
    );
    expect(texto).toContain('jornadas recreativas o de autocuidado');
    expect(texto).toContain(
      'Si lo POR EVALUAR pide un monto mínimo y el proceso informa un monto menor, no está por evaluar',
    );
    expect(texto).toContain('EJEMPLOS (casos reales de Mercado Público)');
    expect(texto).toContain(
      '«Curso de capacitación manejo avanzado de heridas»',
    );
  });

  it('la lectura queda marcada con el modelo y la versión de las reglas', () => {
    expect(LECTURA_ACTUAL).toBe('claude-haiku-5-5, reglas del 18-10, noche');
    expect(LECTURA_ACTUAL.startsWith(MODELO_LECTURA)).toBe(true);
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
