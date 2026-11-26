import type Anthropic from '@anthropic-ai/sdk';
import type { PinoLogger } from 'nestjs-pino';
import { mockPinoLogger } from 'src/testing/mocks';
import type { CompetenciaRepository } from '../competencia/competencia.repository';
import { etiquetaDelRubro, instruccionesDelRubro } from '../competencia/rubro';
import { RubroService } from '../competencia/rubro.service';
import {
  esquemaDeLectura,
  instruccionesPara,
  LECTURA_ACTUAL,
  lecturaActual,
  LecturaService,
  type PerfilDeEmpresa,
  type ProcesoParaLeer,
} from '../lectura/lectura.service';
import { esDelRubro, lecturaValida } from '../lectura/reglas';
import type { OportunidadesRepository } from '../oportunidades.repository';
import {
  etiquetasDe,
  instruccionesDeCandidatas,
  rubroDeLaInstalacion,
} from '../rubro/rubro-de-la-instalacion';
import { abierto, armar } from './radar-de-prueba';

// EL RUBRO COMO DATO DE LA INSTALACIÓN (rebanada 1a de Licita, 25-11). El
// mismo motor va a otro servidor para empresas que no son de eventos: ahí
// OPORTUNIDADES_RUBRO=general y la IA se guía solo por el perfil de cada
// empresa. Lo de eventos lo amarra `el-rubro-de-eventos-no-cambia.spec.ts`.

const ASEO: PerfilDeEmpresa = {
  nombre: 'Limpiezas del Sur',
  perfil:
    'Aseo industrial y de oficinas en Concepción y Talcahuano. No hacemos jardinería ni control de plagas. POR EVALUAR: aseo de hospitales.',
  paquetes: [],
  fijos: [],
};

/** Sin el nombre del campo, que se conserva en el esquema y en la base. */
const sinElCampo = (t: string) =>
  t.replace(/se_hace_en_el_complejo/g, '').toLowerCase();

const PALABRAS_DE_EVENTOS = /evento|complejo|sal[oó]n|cat[aá]logo|eventia/;

const antes = process.env.OPORTUNIDADES_RUBRO;
const llaveDeAntes = process.env.ANTHROPIC_API_KEY;
afterEach(() => {
  if (antes === undefined) delete process.env.OPORTUNIDADES_RUBRO;
  else process.env.OPORTUNIDADES_RUBRO = antes;
  if (llaveDeAntes === undefined) delete process.env.ANTHROPIC_API_KEY;
  else process.env.ANTHROPIC_API_KEY = llaveDeAntes;
  jest.restoreAllMocks();
});

describe('cuál rubro rige', () => {
  it('lo dice OPORTUNIDADES_RUBRO; sin ella o con otra cosa, eventos', () => {
    // Sin argumento se lee la variable: se quita para que la prueba valga
    // igual en una instalación que corre en «general».
    delete process.env.OPORTUNIDADES_RUBRO;
    expect(rubroDeLaInstalacion(undefined)).toBe('eventos');
    expect(rubroDeLaInstalacion('')).toBe('eventos');
    expect(rubroDeLaInstalacion('eventos')).toBe('eventos');
    expect(rubroDeLaInstalacion('aseo')).toBe('eventos');
    expect(rubroDeLaInstalacion('generales')).toBe('eventos');
    expect(rubroDeLaInstalacion('general')).toBe('general');
    expect(rubroDeLaInstalacion(' General ')).toBe('general');
  });

  it('se lee de la variable en cada llamada, no al importar', () => {
    delete process.env.OPORTUNIDADES_RUBRO;
    expect(rubroDeLaInstalacion()).toBe('eventos');
    process.env.OPORTUNIDADES_RUBRO = 'general';
    expect(rubroDeLaInstalacion()).toBe('general');
    process.env.OPORTUNIDADES_RUBRO = 'cualquier-cosa';
    expect(rubroDeLaInstalacion()).toBe('eventos');
  });
});

describe('el rubro general: las instrucciones', () => {
  it('la lectura del radar se apoya solo en el perfil: sin eventos, complejo, salón ni catálogo', () => {
    const t = instruccionesPara(ASEO, 'general');
    expect(t).toContain('"Limpiezas del Sur"');
    expect(t).toContain('Aseo industrial y de oficinas en Concepción');
    expect(sinElCampo(t)).not.toMatch(PALABRAS_DE_EVENTOS);
    expect(t).not.toContain('EJEMPLOS');
    expect(t).not.toContain('Paquetes:');
  });

  it('dice qué significa se_hace_en_el_complejo aquí, las etiquetas y el semáforo', () => {
    const t = instruccionesPara(ASEO, 'general');
    expect(t).toContain(
      'se_hace_en_el_complejo: aquí quiere decir si la empresa lo puede prestar',
    );
    expect(t).toContain('"del_rubro"');
    expect(t).toContain('"otro" si no pide nada de eso');
    expect(t).toContain(
      '"verde" si es del rubro y se_hace_en_el_complejo es "si"',
    );
    expect(t).toContain(
      'Lo que la descripción de la empresa marca POR EVALUAR va "amarillo"',
    );
    expect(t).toContain('"rojo" si no es del rubro');
  });

  it('si la empresa tiene servicios cargados, los muestra sin hablar de catálogo', () => {
    const t = instruccionesPara(
      { ...ASEO, paquetes: ['Aseo mensual'], fijos: [] },
      'general',
    );
    expect(t).toContain('SERVICIOS QUE TIENE CARGADOS\nPaquetes: Aseo mensual');
    expect(t).not.toContain('Servicios fijos');
    expect(sinElCampo(t)).not.toMatch(PALABRAS_DE_EVENTOS);
  });

  it('sin perfil no adivina', () => {
    const t = instruccionesPara({ ...ASEO, perfil: '  ' }, 'general');
    expect(t).toContain('LA EMPRESA\n(sin descripción)');
    expect(t).toContain('Sin descripción de la empresa no adivines');
  });

  it('el filtro de candidatas lleva el perfil; sin perfil no descarta', () => {
    const t = instruccionesDeCandidatas('general', ASEO.perfil);
    expect(t).toContain('Aseo industrial y de oficinas');
    expect(t).toContain('Ante la duda, inclúyela.');
    expect(t.toLowerCase()).not.toMatch(PALABRAS_DE_EVENTOS);
    expect(instruccionesDeCandidatas('general', null)).toContain(
      'devuélvelas todas',
    );
    // El de eventos no lee el perfil: es el de siempre.
    expect(instruccionesDeCandidatas('eventos', 'lo que sea')).toBe(
      instruccionesDeCandidatas(),
    );
  });

  it('Competidores: del rubro es lo que el proveedor da de lo que la empresa vende; ante la duda, no', () => {
    const t = instruccionesDelRubro(ASEO.perfil, 'general');
    expect(t).toContain('Aseo industrial y de oficinas');
    expect(t).toContain('Ante la duda, "no".');
    expect(t.toLowerCase()).not.toMatch(PALABRAS_DE_EVENTOS);
    // La forma de la respuesta es la misma que en eventos.
    const ultima = (x: string) => x.split('\n').at(-1);
    expect(ultima(t)).toBe(ultima(instruccionesDelRubro(null)));
    expect(instruccionesDelRubro(null, 'general')).toContain(
      'responde "no" en todas',
    );
  });
});

describe('el rubro general: lo que vale y con qué se leyó', () => {
  it('etiquetas del_rubro y otro; del rubro = alguna distinta de otro', () => {
    expect(etiquetasDe('general')).toEqual(['del_rubro', 'otro']);
    expect(esquemaDeLectura('general').properties.etiquetas.items.enum).toEqual(
      ['del_rubro', 'otro'],
    );
    expect(
      lecturaValida(
        {
          semaforo: 'Verde',
          etiquetas: ['Del_Rubro', 'evento', 'del_rubro'],
          se_hace_en_el_complejo: 'sí',
          razon: ' Aseo de oficinas en Concepción. ',
        },
        'general',
      ),
    ).toEqual({
      semaforo: 'verde',
      etiquetas: ['del_rubro'],
      se_hace_en_el_complejo: 'si',
      razon: 'Aseo de oficinas en Concepción.',
    });
    const deEventos = lecturaValida(
      { semaforo: 'rojo', etiquetas: ['evento'], se_hace_en_el_complejo: 'no' },
      'general',
    );
    expect(deEventos?.etiquetas).toEqual(['otro']);
    expect(esDelRubro(['del_rubro'])).toBe(true);
    expect(esDelRubro(['otro'])).toBe(false);
    // Y en eventos, del_rubro no existe.
    expect(
      lecturaValida({
        semaforo: 'verde',
        etiquetas: ['del_rubro'],
        se_hace_en_el_complejo: 'si',
      })?.etiquetas,
    ).toEqual(['otro']);
  });

  it('se anota con etiquetas propias que nunca se confunden con las de eventos', () => {
    expect(lecturaActual('general')).toBe(
      'claude-haiku-5-5, reglas generales v1',
    );
    expect(lecturaActual('general')).not.toBe(LECTURA_ACTUAL);
    expect(lecturaActual()).toBe(LECTURA_ACTUAL);
    expect(etiquetaDelRubro('claude-haiku-5-5', 'general')).toBe(
      'claude-haiku-5-5#general-v1',
    );
    expect(etiquetaDelRubro('claude-haiku-5-5')).toBe('claude-haiku-5-5#v2');
  });
});

// ─── de punta a punta, con la variable puesta ─────────────────────────────

class LecturaDePrueba extends LecturaService {
  constructor(readonly parse: jest.Mock) {
    super(mockPinoLogger() as unknown as PinoLogger);
  }
  protected cliente(): Anthropic {
    return { messages: { parse: this.parse } } as unknown as Anthropic;
  }
}

const PROCESO: ProcesoParaLeer = {
  codigo: '1-1-LE26',
  tipo: 'licitacion',
  nombre: 'Servicio de aseo de oficinas municipales',
  descripcion: null,
  organismo: 'I. Municipalidad de Concepción',
  unidad: null,
  comuna: 'Concepción',
  region: null,
  monto: 12_000_000,
  fecha_cierre: null,
  productos: [],
};

type Pedido = {
  system: Array<{ text: string }>;
  output_config: { format: { schema: unknown } };
};

describe('con OPORTUNIDADES_RUBRO=general', () => {
  beforeEach(() => {
    process.env.OPORTUNIDADES_RUBRO = 'general';
  });

  it('la lectura del radar pide con las instrucciones y las etiquetas generales, y acepta del_rubro', async () => {
    const parse = jest.fn().mockResolvedValue({
      stop_reason: 'end_turn',
      usage: { input_tokens: 1, output_tokens: 1 },
      parsed_output: {
        semaforo: 'verde',
        etiquetas: ['del_rubro'],
        se_hace_en_el_complejo: 'si',
        razon: 'Aseo de oficinas en su zona.',
      },
    });
    const lectura = await new LecturaDePrueba(parse).leer(PROCESO, ASEO);
    expect(lectura?.etiquetas).toEqual(['del_rubro']);
    const [[pedido]] = parse.mock.calls as Array<[Pedido]>;
    expect(pedido.system[0].text).toBe(instruccionesPara(ASEO, 'general'));
    expect(JSON.stringify(pedido.output_config.format.schema)).toContain(
      'del_rubro',
    );
    expect(JSON.stringify(pedido.output_config.format.schema)).not.toContain(
      'capacitacion_con_salon',
    );
  });

  it('el filtro de la historia usa el perfil que le pasan', async () => {
    const parse = jest.fn().mockResolvedValue({
      usage: { input_tokens: 1, output_tokens: 1 },
      parsed_output: { candidatas: [1] },
    });
    await new LecturaDePrueba(parse).candidatasPorNombre(
      [{ codigo: 'A', nombre: 'Aseo' }],
      undefined,
      ASEO.perfil,
    );
    const [[pedido]] = parse.mock.calls as Array<[Pedido]>;
    expect(pedido.system[0].text).toBe(
      instruccionesDeCandidatas('general', ASEO.perfil),
    );
  });

  it('el radar busca y guarda con la etiqueta general', async () => {
    const { radar, repo, lectura } = armar();
    repo.procesosAbiertos.mockResolvedValue([abierto('NUEVA')]);
    lectura.leer.mockResolvedValue({
      semaforo: 'verde',
      etiquetas: ['del_rubro'],
      se_hace_en_el_complejo: 'si',
      razon: 'x',
    });
    await radar.correr('reloj');
    expect(repo.lecturasDe).toHaveBeenCalledWith(
      1,
      'claude-haiku-5-5, reglas generales v1',
    );
    expect(repo.guardarLectura).toHaveBeenCalledWith(
      1,
      'NUEVA',
      expect.any(Object),
      'claude-haiku-5-5, reglas generales v1',
      false,
    );
  });

  it('Competidores revisa con las instrucciones generales y anota #general-v1', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-prueba';
    const repo = {
      clasificadas: jest.fn().mockResolvedValue(new Set<string>()),
      zonaLigera: jest.fn().mockResolvedValue([
        {
          codigo: 'A',
          region: 'Región del Biobío',
          con_ganadores: true,
          fecha_publicacion: '2025-10-01T00:00:00Z',
        },
      ]),
      procesosParaElRubro: jest.fn().mockResolvedValue([
        {
          codigo: 'A',
          nombre: 'Aseo',
          organismo: 'Municipalidad',
          comuna: 'Concepción',
          region: 'Biobío',
          fecha_publicacion: '2025-10-01T00:00:00Z',
          items: [{ NombreProducto: 'Aseo', Descripcion: '', Cantidad: 1 }],
        },
      ]),
      guardarRubro: jest.fn().mockResolvedValue(undefined),
      olvidarLaZona: jest.fn(),
    };
    const oportunidades = {
      configDe: jest
        .fn()
        .mockResolvedValue({ regiones: ['Biobío'], perfil: ASEO.perfil }),
    };
    const parse = jest.fn().mockResolvedValue({
      parsed_output: {
        licitaciones: [
          { codigo: 'A', del_rubro: 'si', lineas: [], razon: 'aseo' },
        ],
      },
      usage: { input_tokens: 1, output_tokens: 1 },
    });
    class RubroDePrueba extends RubroService {
      protected cliente(): Anthropic {
        return { messages: { parse } } as unknown as Anthropic;
      }
    }
    const servicio = new RubroDePrueba(
      repo as unknown as CompetenciaRepository,
      oportunidades as unknown as OportunidadesRepository,
      mockPinoLogger() as unknown as PinoLogger,
    );
    expect(await servicio.clasificar(1, Date.now() + 60_000)).toBe(1);
    const [[pedido]] = parse.mock.calls as Array<[Pedido]>;
    expect(pedido.system[0].text).toBe(
      instruccionesDelRubro(ASEO.perfil, 'general'),
    );
    expect(repo.clasificadas).toHaveBeenCalledWith(
      1,
      'claude-haiku-5-5#general-v1',
    );
    expect(repo.guardarRubro).toHaveBeenCalledWith(
      1,
      expect.any(Array),
      'claude-haiku-5-5#general-v1',
    );
  });
});
