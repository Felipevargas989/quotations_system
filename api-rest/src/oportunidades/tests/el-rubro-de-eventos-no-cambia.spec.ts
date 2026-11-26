import type Anthropic from '@anthropic-ai/sdk';
import { readFileSync, writeFileSync } from 'fs';
import type { PinoLogger } from 'nestjs-pino';
import { join } from 'path';
import { mockPinoLogger } from 'src/testing/mocks';
import { etiquetaDelRubro, instruccionesDelRubro } from '../competencia/rubro';
import {
  instruccionesPara,
  LECTURA_ACTUAL,
  LecturaService,
  type PerfilDeEmpresa,
  type ProcesoParaLeer,
} from '../lectura/lectura.service';

// LA HUELLA DEL RUBRO DE EVENTOS (rebanada 1a de Licita, 25-11). El rubro
// pasó a ser un dato de la instalación (OPORTUNIDADES_RUBRO); con «eventos»,
// o sin la variable, todo lo que lee la IA tiene que quedar idéntico byte a
// byte: si cambia, producción relee todo y gasta plata. La huella se grabó
// con el código de antes de mover nada (GRABAR_HUELLA=1) y no se toca.

const HUELLA = join(__dirname, 'huellas', 'rubro-eventos.json');

const EMPRESA: PerfilDeEmpresa = {
  nombre: 'Valle del Sol',
  perfil:
    'Complejo turístico en Quillón: eventos, alojamiento y salones. POR EVALUAR: catering desde $1.000.000.',
  paquetes: ['Evento: matrimonio', 'Salones: día completo'],
  fijos: ['Garzón'],
};

const PROCESO: ProcesoParaLeer = {
  codigo: '4364-13-LE26',
  tipo: 'licitacion',
  nombre: 'Producción de Evento día del Profesor',
  descripcion: null,
  organismo: 'I MUNICIPALIDAD DE QUILLON',
  unidad: null,
  comuna: 'Quillón',
  region: null,
  monto: 15960000,
  fecha_cierre: null,
  productos: [],
};

class LecturaDePrueba extends LecturaService {
  constructor(readonly parse: jest.Mock) {
    super(mockPinoLogger() as unknown as PinoLogger);
  }
  protected cliente(): Anthropic {
    return { messages: { parse: this.parse } } as unknown as Anthropic;
  }
}

type Pedido = {
  system: Array<{ text: string }>;
  output_config: { format: unknown };
};

/** Lo que de verdad le llega a la IA, pedido por pedido. */
async function laHuellaDeHoy() {
  const parse = jest.fn().mockResolvedValue({
    stop_reason: 'end_turn',
    usage: { input_tokens: 1, output_tokens: 1 },
    parsed_output: null,
  });
  const servicio = new LecturaDePrueba(parse);
  await servicio.leer(PROCESO, EMPRESA);
  await servicio.candidatasPorNombre([
    { codigo: 'A', nombre: 'Día del profesor' },
  ]);
  const [[lectura], [candidatas]] = parse.mock.calls as Array<[Pedido]>;
  return {
    instruccionesPara: instruccionesPara(EMPRESA),
    instruccionesPara_sin_perfil: instruccionesPara({
      nombre: 'X',
      perfil: null,
      paquetes: [],
      fijos: [],
    }),
    lectura_system: lectura.system[0].text,
    lectura_esquema: JSON.parse(JSON.stringify(lectura.output_config.format)),
    candidatas_system: candidatas.system[0].text,
    candidatas_esquema: JSON.parse(
      JSON.stringify(candidatas.output_config.format),
    ),
    instruccionesDelRubro_con_perfil: instruccionesDelRubro(
      'Complejo turístico en Quillón',
    ),
    instruccionesDelRubro_sin_perfil: instruccionesDelRubro(null),
    etiquetaDelRubro: etiquetaDelRubro('claude-haiku-5-5'),
    LECTURA_ACTUAL,
  };
}

describe('el rubro de eventos no cambia ni una letra', () => {
  const antes = process.env.OPORTUNIDADES_RUBRO;
  afterEach(() => {
    if (antes === undefined) delete process.env.OPORTUNIDADES_RUBRO;
    else process.env.OPORTUNIDADES_RUBRO = antes;
  });

  if (process.env.GRABAR_HUELLA === '1') {
    it('graba la huella (solo con el código de antes)', async () => {
      delete process.env.OPORTUNIDADES_RUBRO;
      writeFileSync(
        HUELLA,
        `${JSON.stringify(await laHuellaDeHoy(), null, 2)}\n`,
      );
    });
    return;
  }

  for (const valor of [undefined, 'eventos', 'cualquier-cosa']) {
    it(`OPORTUNIDADES_RUBRO=${String(valor)}: idéntico a la huella`, async () => {
      if (valor === undefined) delete process.env.OPORTUNIDADES_RUBRO;
      else process.env.OPORTUNIDADES_RUBRO = valor;
      const huella: unknown = JSON.parse(readFileSync(HUELLA, 'utf8'));
      expect(await laHuellaDeHoy()).toEqual(huella);
    });
  }
});
