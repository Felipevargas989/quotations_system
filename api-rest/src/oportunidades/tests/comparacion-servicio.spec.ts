import type Anthropic from '@anthropic-ai/sdk';
import { BadRequestException } from '@nestjs/common';
import type { PinoLogger } from 'nestjs-pino';
import { mockPinoLogger } from 'src/testing/mocks';
import type { AdjuntosRepository } from '../adjuntos/adjuntos.repository';
import type { AnalisisRepository } from '../analisis/analisis.repository';
import type { AprendizajesRepository } from '../aprendizajes/aprendizajes.repository';
import {
  ComparacionService,
  MODELO_DE_LA_COMPARACION,
} from '../comparacion/comparacion.service';
import type { OfertasDeLaCompetenciaService } from '../competencia/ofertas-de-la-competencia.service';
import type { GeneracionRepository } from '../generacion/generacion.repository';
import type { OferenteRepository } from '../oferente/oferente.repository';
import type { OportunidadesRepository } from '../oportunidades.repository';
import type { ElSetService } from '../postulacion/el-set.service';
import { CRITERIOS, IA } from './comparacion-de-prueba';

// EL SERVICIO DE LA COMPARACIÓN DE OFERTAS (decisiones 41 y 125). «Traer y
// comparar»: trae lo que falte del cuadro público, lee las bases, tu oferta
// como se sube y todo lo de los demás que quepa, y la IA compara por línea.
// La IA, la Files API y Mercado Público van de mentira.

class ComparacionDePrueba extends ComparacionService {
  final = jest.fn();
  stream = jest.fn<{ finalMessage: jest.Mock }, [unknown]>(() => ({
    finalMessage: this.final,
  }));
  subir = jest.fn<Promise<string>, [Buffer, string]>((...de) =>
    Promise.resolve(`file_${de[1]}`),
  );
  paginas = jest.fn<Promise<number>, [Buffer]>(() => Promise.resolve(2));
  protected cliente(): Anthropic {
    return { messages: { stream: this.stream } } as unknown as Anthropic;
  }
  protected subirPdf(datos: Buffer, nombre: string): Promise<string> {
    return this.subir(datos, nombre);
  }
  protected contarPaginas(datos: Buffer): Promise<number> {
    return this.paginas(datos);
  }
}

const adjunto = (
  id: number,
  nombre: string,
  competidor: string | null,
  creado_en = '2026-11-11T14:15:00Z',
) => ({
  id,
  nombre,
  ruta: `c1/oportunidades/4633/${id}`,
  bytes: 2_000,
  competidor,
  creado_en,
});

const COMPETENCIA = [
  adjunto(31, 'FORMULARIO N°4 CALIDAD DE LA OFERTA.docx.pdf', 'TEXTUM'),
  adjunto(32, 'vigencia textum 06-11.pdf', 'TEXTUM'),
  adjunto(33, 'PATENTE TEXTUM.pdf', 'TEXTUM'),
  adjunto(34, 'Formulario 4 - Calidad de la oferta.pdf', 'BPM EVENTOS SPA'),
  adjunto(35, 'INICIO ACTIVIDADES.png', 'BPM EVENTOS SPA'),
  adjunto(36, 'planilla.xlsx', 'BPM EVENTOS SPA'),
];

const BASES = [
  adjunto(184, 'Ficha_Tecnica_N_224.txt', null, '2026-10-23T22:25:00Z'),
  adjunto(185, 'D_A_N_4_990.pdf', null, '2026-10-23T22:24:00Z'),
];

const MIAS = [
  {
    nombre: 'Formulario N°3 - firmado.pdf',
    ruta: 'c1/op/4633/postulacion/f3.pdf',
    bytes: 74_000,
    que_es: 'formulario',
    carpetas: ['tecnica'],
    aviso: 'con su respaldo adentro',
    adjuntos: [
      { nombre: 'OC 4366-146-SE23.pdf', ruta: 'c1/oferente/oc.pdf', bytes: 9 },
    ],
  },
  {
    nombre: 'Formulario N°4 - firmado.pdf',
    ruta: 'c1/op/4633/postulacion/f4.pdf',
    bytes: 90_000,
    que_es: 'formulario',
    carpetas: ['tecnica'],
    aviso: null,
  },
  {
    nombre: 'Patente 2 SEM 2026.pdf',
    ruta: 'c1/oferente/patente.pdf',
    bytes: 1_400_000,
    que_es: 'documento',
    carpetas: ['administrativa'],
    aviso: null,
  },
];

const VUELTA = {
  terminada_en: '2026-11-11T14:15:31Z',
  error: null,
  resultado: {
    publicadas: true,
    oferentes: 2,
    traidos: 0,
    yaEstaban: 6,
    noSeTraen: 1,
    sinTraer: [
      {
        oferente: 'BPM EVENTOS SPA',
        nombre: 'EXPERIENCIA DEL OFERENTE OC.rar',
        motivo: 'viene comprimido',
      },
    ],
    incompleto: false,
  },
};

/** Lo de la IA, con los números de las ofertas de este caso: 1 la empresa,
 *  2 Textum y 3 BPM. */
const [L1, L2] = IA.lineas;
const IA_DEL_CASO = {
  ...IA,
  lineas: [
    { ...L1, oferentes: [L1.oferentes[0], { ...L1.oferentes[1], oferta: 2 }] },
    { ...L2, oferentes: [L2.oferentes[0], { ...L2.oferentes[2], oferta: 2 }] },
  ],
};

function armar() {
  const repo = {
    abandonarAntesDe: jest.fn().mockResolvedValue(undefined),
    ultimoDeTipo: jest.fn((_c: number, _o: number, tipo: string) =>
      Promise.resolve(
        tipo === 'oferta'
          ? ({ parametros: { postulacion: { total: 17_150_000 } } } as Record<
              string,
              unknown
            >)
          : null,
      ),
    ),
    crearGeneracion: jest.fn((fila: Record<string, unknown>) =>
      Promise.resolve({ id: 40, estado: 'procesando', ...fila }),
    ),
    terminar: jest.fn().mockResolvedValue(undefined),
    descargar: jest.fn().mockResolvedValue(Buffer.from('%PDF-1.4 oferta')),
  };
  const adjuntos = {
    listar: jest.fn((_c: number, _o: number, seccion: string) =>
      Promise.resolve(seccion === 'bases' ? BASES : COMPETENCIA),
    ),
    perfilDe: jest.fn().mockResolvedValue('perfil-1'),
  };
  const oportunidades = {
    ficha: jest.fn().mockResolvedValue({
      id: 4633,
      codigo: '5040-14-LE26',
      proceso: {
        nombre: 'Día de Campo del Dirigente Social 2026',
        organismo: 'ILUSTRE MUNICIPALIDAD DE QUILLON',
        monto: 20_471_755,
        tipo: 'licitacion',
      },
    }),
  };
  const analisis = {
    ultimo: jest.fn().mockResolvedValue({
      estado: 'listo',
      resultado: {
        criterios: CRITERIOS,
        te_dejan_fuera: ['Superar el presupuesto de la línea'],
        requisitos: [{ que: 'Formulario N°4', obligatorio: true }],
      },
    }),
  };
  const oferente = {
    oferente: jest
      .fn()
      .mockResolvedValue({ razon_social: 'Valle del Sol Quillon SPA' }),
  };
  const set = { piezas: jest.fn().mockResolvedValue(MIAS) };
  // Decisión 60: lo aprendido de las comisiones.
  const aprendizajes = {
    deLaEmpresa: jest.fn().mockResolvedValue([
      {
        id: 1,
        codigo: '4074-35-LE25',
        unidad: '4074',
        organismo: 'I. Municipalidad de Yumbel (DEM)',
        situacion: 'Un certificado no decía el monto.',
        decision: 'Lo contó igual.',
        tipo: 'flexible',
        fuente: 'caso',
        oportunidad_id: null,
        creado_en: '2026-10-20T19:00:00Z',
      },
      {
        id: 2,
        codigo: '5040-6-LE26',
        unidad: '5040',
        organismo: 'I. Municipalidad de Quillón',
        situacion: 'Un formulario técnico (N°4) no cumplía todo lo pedido.',
        decision: 'Lo anotó «No cumple totalidad de requerimiento».',
        tipo: 'estricta',
        fuente: 'caso',
        oportunidad_id: null,
        creado_en: '2026-10-20T18:00:00Z',
      },
    ]),
  };
  const ofertas = { traerAhora: jest.fn().mockResolvedValue(VUELTA) };
  const servicio = new ComparacionDePrueba(
    repo as unknown as GeneracionRepository,
    adjuntos as unknown as AdjuntosRepository,
    oportunidades as unknown as OportunidadesRepository,
    analisis as unknown as AnalisisRepository,
    oferente as unknown as OferenteRepository,
    set as unknown as ElSetService,
    aprendizajes as unknown as AprendizajesRepository,
    ofertas as unknown as OfertasDeLaCompetenciaService,
    mockPinoLogger() as unknown as PinoLogger,
  );
  servicio.final.mockResolvedValue({
    parsed_output: IA_DEL_CASO,
    usage: { input_tokens: 500_000, output_tokens: 15_000 },
    stop_reason: 'end_turn',
  });
  return {
    repo,
    adjuntos,
    analisis,
    set,
    aprendizajes,
    oportunidades,
    ofertas,
    servicio,
  };
}

/** El contexto con que `pedir` larga `ejecutar`. */
async function contextoDe(c: ReturnType<typeof armar>, oportunidad = 4633) {
  const ejecutar = jest
    .spyOn(c.servicio, 'ejecutar')
    .mockResolvedValue(undefined);
  await c.servicio.pedir(1, 'cuenta-1', oportunidad);
  const [, , contexto] = ejecutar.mock.calls[0];
  ejecutar.mockRestore();
  return contexto;
}

type Bloque = {
  type: string;
  text?: string;
  title?: string;
  source?: { type: string; file_id?: string; media_type?: string };
};
type Pedido = {
  model: string;
  max_tokens: number;
  system: string;
  output_config: { effort: string; format: unknown };
  messages: Array<{ content: Bloque[] }>;
};
type Fin = {
  estado: string;
  error?: string;
  resultado: {
    lineas: Array<{
      nombre: string;
      compites: boolean;
      oferentes: Array<{
        corto?: string;
        puntaje: number;
        reclamo: string | null;
      }>;
    }>;
    lectura: Array<Record<string, unknown>>;
  };
  archivos: Array<{ id: number; nombre: string }>;
  no_leidos: Array<{ nombre: string; motivo: string }>;
  tokens_entrada: number;
  costo_usd: number;
};

const antes = process.env.ANTHROPIC_API_KEY;
beforeEach(() => {
  process.env.ANTHROPIC_API_KEY = 'llave-de-prueba';
});
afterAll(() => {
  if (antes === undefined) delete process.env.ANTHROPIC_API_KEY;
  else process.env.ANTHROPIC_API_KEY = antes;
});

describe('Pedir la comparación', () => {
  it('se pide con Opus y responde al tiro; tu oferta va como se sube, con los respaldos dentro de su formulario', async () => {
    const c = armar();
    const ejecutar = jest
      .spyOn(c.servicio, 'ejecutar')
      .mockResolvedValue(undefined);

    const fila = await c.servicio.pedir(1, 'cuenta-1', 4633);

    expect(fila).toMatchObject({ id: 40, estado: 'procesando' });
    expect(MODELO_DE_LA_COMPARACION).toBe('claude-opus-5-5');
    // Qué se leyó se sabe recién al terminar: la fila parte vacía.
    expect(c.repo.crearGeneracion).toHaveBeenCalledWith(
      expect.objectContaining({
        tipo: 'comparacion',
        modelo: MODELO_DE_LA_COMPARACION,
        parametros: { trae_las_ofertas: true },
        archivos: [],
        no_leidos: [],
      }),
    );
    const [, id, contexto] = ejecutar.mock.calls[0];
    expect(id).toBe(40);
    expect(contexto).toMatchObject({
      oportunidadId: 4633,
      esLicitacion: true,
      empresa: 'Valle del Sol Quillon SPA',
    });
    expect(contexto.mias.map((a) => a.titulo ?? a.nombre)).toEqual([
      'Formulario N°3 - firmado.pdf',
      'OC 4366-146-SE23.pdf (va dentro de «Formulario N°3 - firmado.pdf»)',
      'Formulario N°4 - firmado.pdf',
      'Patente 2 SEM 2026.pdf',
    ]);
    expect(contexto.instrucciones).toContain('$17.150.000 con IVA');
    expect(contexto.reclamo.codigo).toBe('5040-14-LE26');
  });

  it('en una licitación no hace falta haber subido ofertas: se traen solas', async () => {
    const c = armar();
    jest.spyOn(c.servicio, 'ejecutar').mockResolvedValue(undefined);
    c.adjuntos.listar.mockResolvedValue([]);
    await expect(c.servicio.pedir(1, 'cuenta-1', 4633)).resolves.toMatchObject({
      estado: 'procesando',
    });
  });

  it('lee lo aprendido de las comisiones, la misma unidad de compra primero y solo para predecir (decisión 60)', async () => {
    const t = (await contextoDe(armar())).instrucciones;
    expect(t).toContain('CÓMO HAN DECIDIDO LAS COMISIONES');
    expect(t).toContain('Úsalo SOLO para predecir');
    expect(t).toContain('Nunca para "cumple_bases" ni "graves"');
    // El Día de Campo es de la unidad 5040: su caso va antes que el de Yumbel.
    expect(
      t.indexOf('[esta misma unidad de compra] 5040-6-LE26'),
    ).toBeGreaterThan(-1);
    expect(t.indexOf('5040-6-LE26')).toBeLessThan(t.indexOf('4074-35-LE25'));
    expect(t).toContain('→ Lo contó igual. (flexible)');
  });

  it('sin análisis, sin criterios o con la postulación vacía: 400 sin crear nada; en una compra ágil, también sin competencia', async () => {
    const sinAnalisis = armar();
    sinAnalisis.analisis.ultimo.mockResolvedValue(null);
    await expect(sinAnalisis.servicio.pedir(1, 'c', 4633)).rejects.toThrow(
      'Primero analiza las bases',
    );

    const sinCriterios = armar();
    sinCriterios.analisis.ultimo.mockResolvedValue({
      estado: 'listo',
      resultado: { criterios: [] },
    });
    await expect(sinCriterios.servicio.pedir(1, 'c', 4633)).rejects.toThrow(
      'no trae criterios',
    );

    const vacia = armar();
    vacia.set.piezas.mockResolvedValue([]);
    await expect(vacia.servicio.pedir(1, 'c', 4633)).rejects.toBeInstanceOf(
      BadRequestException,
    );

    // Una compra ágil no tiene cuadro con documentos: hay que subirlas.
    const agil = armar();
    agil.oportunidades.ficha.mockResolvedValue({
      id: 3219,
      codigo: '1346350-37-COT26',
      proceso: { nombre: 'Catamarán', organismo: null, tipo: 'compra_agil' },
    });
    agil.adjuntos.listar.mockResolvedValue([]);
    await expect(agil.servicio.pedir(1, 'c', 3219)).rejects.toThrow(
      'al menos un competidor',
    );
    for (const c of [sinAnalisis, sinCriterios, vacia, agil]) {
      expect(c.repo.crearGeneracion).not.toHaveBeenCalled();
    }
  });

  it('decisión 95: una compra ágil sin criterios se compara con el de la ley, el menor precio, y no trae nada', async () => {
    const c = armar();
    // Así venía el catamarán, 1346350-37-COT26: sin criterios.
    c.analisis.ultimo.mockResolvedValue({
      estado: 'listo',
      resultado: { criterios: [] },
    });
    c.oportunidades.ficha.mockResolvedValue({
      id: 3219,
      codigo: '1346350-37-COT26',
      proceso: {
        nombre: 'Arriendo de catamarán',
        organismo: 'I MUNICIPALIDAD DE QUILLON',
        monto: 7_150_000,
        tipo: 'compra_agil',
      },
    });
    const contexto = await contextoDe(c, 3219);
    expect(c.repo.crearGeneracion).toHaveBeenCalledWith(
      expect.objectContaining({ parametros: { trae_las_ofertas: false } }),
    );
    expect(contexto.esLicitacion).toBe(false);
    expect(contexto.instrucciones).toContain('Menor precio');
    expect(contexto.instrucciones).toContain(
      'gana la cotización más económica que cumpla los requisitos técnicos mínimos',
    );
    await c.servicio.ejecutar(1, 40, contexto);
    expect(c.ofertas.traerAhora).not.toHaveBeenCalled();
    expect(c.servicio.stream).toHaveBeenCalled();
  });
});

describe('Traer y comparar (decisión 125)', () => {
  it('trae lo que falte, lee las bases y cada oferta, y le dice a la IA lo que no vio', async () => {
    const c = armar();
    await c.servicio.ejecutar(1, 40, await contextoDe(c));

    expect(c.ofertas.traerAhora).toHaveBeenCalledWith(1, 4633);
    expect(c.adjuntos.listar).toHaveBeenCalledWith(1, 4633, 'bases');
    const pedido = (c.servicio.stream.mock.calls[0] as [Pedido])[0];
    expect(pedido).toMatchObject({
      model: 'claude-opus-5-5',
      max_tokens: 32_000,
      output_config: { effort: 'medium' },
    });
    expect(pedido.system).toContain('LOS CRITERIOS DE EVALUACIÓN');
    expect(pedido.output_config.format).toBeDefined();

    // En orden: las bases (como se subieron) y cada oferta con lo suyo.
    const lo = pedido.messages[0].content.map((b) =>
      b.type === 'text'
        ? (b.text ?? '').split('\n')[0]
        : `${b.type}: ${b.title ?? b.source?.media_type}`,
    );
    expect(lo).toEqual([
      '=== LAS BASES DE LA LICITACIÓN ===',
      'document: D_A_N_4_990.pdf',
      'document: Ficha_Tecnica_N_224.txt',
      '=== OFERTA 1: Valle del Sol Quillon SPA (TU OFERTA, la de la empresa) ===',
      'document: Formulario N°3 - firmado.pdf',
      'document: OC 4366-146-SE23.pdf (va dentro de «Formulario N°3 - firmado.pdf»)',
      'document: Formulario N°4 - firmado.pdf',
      'document: Patente 2 SEM 2026.pdf',
      '=== OFERTA 2: TEXTUM (de la competencia) ===',
      'document: FORMULARIO N°4 CALIDAD DE LA OFERTA.docx.pdf',
      'document: vigencia textum 06-11.pdf',
      'document: PATENTE TEXTUM.pdf',
      '=== OFERTA 3: BPM EVENTOS SPA (de la competencia) ===',
      'document: Formulario 4 - Calidad de la oferta.pdf',
      'Imagen: INICIO ACTIVIDADES.png',
      'image: image/png',
      'Compara las ofertas, línea por línea, con los criterios de evaluación y el texto de las bases.',
    ]);
    // Los PDF van por la Files API; el texto, como texto.
    const documentos = pedido.messages[0].content.filter(
      (b) => b.type === 'document',
    );
    expect(documentos[0].source).toEqual({
      type: 'file',
      file_id: 'file_D_A_N_4_990.pdf',
    });
    expect(documentos[1].source?.type).toBe('text');
    expect(c.servicio.subir).toHaveBeenCalledTimes(9);
    // Lo que no vio de BPM: la planilla, que no lee, y el .rar, que no llegó.
    const deBpm = pedido.messages[0].content.find((b) =>
      b.text?.startsWith('=== OFERTA 3'),
    )?.text;
    expect(deBpm).toContain(
      'SIN LEER (los presentó, pero no los viste): planilla.xlsx.',
    );
    expect(deBpm).toContain('EXPERIENCIA DEL OFERENTE OC.rar');
  });

  it('guarda las líneas con los puntajes del motor, qué leyó de cada oferta y su costo', async () => {
    const c = armar();
    await c.servicio.ejecutar(1, 40, await contextoDe(c));

    const [, , fin] = c.repo.terminar.mock.calls[0] as [number, number, Fin];
    expect(fin).toMatchObject({
      estado: 'listo',
      tokens_entrada: 500_000,
      // 500.000 × US$4 + 15.000 × US$20, por millón.
      costo_usd: 2.3,
    });
    const [l1, l2] = fin.resultado.lineas;
    expect(l1).toMatchObject({
      nombre: 'Línea 1 · Alimentación',
      compites: true,
    });
    expect(l1.oferentes.map((o) => [o.corto, o.puntaje])).toEqual([
      ['Valle del Sol Quillon SPA', 99.4],
      ['TEXTUM', 100],
    ]);
    // El reclamo, solo contra quien compite contigo (decisión 59 y 125).
    expect(l1.oferentes[0].reclamo).toBeNull();
    expect(l1.oferentes[1].reclamo).toContain(
      'Señores\nILUSTRE MUNICIPALIDAD DE QUILLON',
    );
    expect(l2.compites).toBe(false);
    expect(l2.oferentes.map((o) => o.reclamo)).toEqual([null, null]);

    expect(fin.resultado.lectura).toEqual([
      {
        oferta: 1,
        nombre: 'Valle del Sol Quillon SPA',
        es_tuya: true,
        leidos: 4,
        total: 4,
        sin_leer: [],
        sin_traer: [],
      },
      {
        oferta: 2,
        nombre: 'TEXTUM',
        es_tuya: false,
        leidos: 3,
        total: 3,
        sin_leer: [],
        sin_traer: [],
      },
      {
        oferta: 3,
        nombre: 'BPM EVENTOS SPA',
        es_tuya: false,
        leidos: 2,
        total: 3,
        sin_leer: [
          { nombre: 'planilla.xlsx', motivo: 'la IA lee PDF, Word e imágenes' },
        ],
        sin_traer: [
          {
            nombre: 'EXPERIENCIA DEL OFERENTE OC.rar',
            motivo: 'viene comprimido',
          },
        ],
      },
    ]);
    expect(fin.archivos).toHaveLength(11);
    expect(fin.archivos).toEqual(
      expect.arrayContaining([
        { id: 185, nombre: 'Bases: D_A_N_4_990.pdf' },
        {
          id: 31,
          nombre: 'TEXTUM: FORMULARIO N°4 CALIDAD DE LA OFERTA.docx.pdf',
        },
      ]),
    );
    expect(fin.no_leidos).toEqual([
      {
        nombre: 'BPM EVENTOS SPA: planilla.xlsx',
        motivo: 'la IA lee PDF, Word e imágenes',
      },
      {
        nombre: 'BPM EVENTOS SPA: EXPERIENCIA DEL OFERENTE OC.rar',
        motivo: 'no se trajo de Mercado Público: viene comprimido',
      },
    ]);
  });

  it('lee hasta 300 páginas, por prioridad: lo que no cabe queda dicho', async () => {
    const c = armar();
    // Cada PDF, 120 páginas: de las bases cabe solo el texto (hasta 100).
    c.servicio.paginas.mockResolvedValue(120);
    await c.servicio.ejecutar(1, 40, await contextoDe(c));

    const [, , fin] = c.repo.terminar.mock.calls[0] as [number, number, Fin];
    // 1 de las bases + 120 de tu Formulario N°3 + 120 del N°4 de Textum; el
    // N°4 de BPM ya no cabe (361), y la foto de una página sí.
    expect(fin.archivos.map((a) => a.nombre)).toEqual([
      'Bases: Ficha_Tecnica_N_224.txt',
      'Valle del Sol Quillon SPA: Formulario N°3 - firmado.pdf',
      'TEXTUM: FORMULARIO N°4 CALIDAD DE LA OFERTA.docx.pdf',
      'BPM EVENTOS SPA: INICIO ACTIVIDADES.png',
    ]);
    expect(fin.no_leidos[0]).toEqual({
      nombre: 'Bases: D_A_N_4_990.pdf',
      motivo: 'no cupo: de las bases se leen hasta 100 páginas',
    });
    expect(
      fin.no_leidos.filter(
        (n) => n.motivo === 'no cupo: la comparación lee hasta 300 páginas',
      ),
    ).toHaveLength(6);
    const deTextum = fin.resultado.lectura[1];
    expect(deTextum).toMatchObject({ leidos: 1, total: 3 });
  });

  it('las imágenes tienen su cupo, hasta 20 y 15 MB entre todas: las demás quedan dichas y la comparación no se cae', async () => {
    const MOTIVO =
      'no cupo: la comparación lee hasta 20 imágenes, 15 MB entre todas';
    /** BPM, con sus fotos del recinto además de lo suyo. */
    const conFotos = (cuantas: number) => {
      const c = armar();
      const fotos = Array.from({ length: cuantas }, (_, i) =>
        adjunto(100 + i, `foto ${i + 1}.jpg`, 'BPM EVENTOS SPA'),
      );
      c.adjuntos.listar.mockImplementation(
        (_c: number, _o: number, seccion: string) =>
          Promise.resolve(
            seccion === 'bases' ? BASES : [...COMPETENCIA, ...fotos],
          ),
      );
      return c;
    };
    const sinCupo = (c: ReturnType<typeof armar>) => {
      const [, , fin] = c.repo.terminar.mock.calls[0] as [number, number, Fin];
      expect(fin.estado).toBe('listo');
      return fin.no_leidos
        .filter((n) => n.motivo === MOTIVO)
        .map((n) => n.nombre);
    };

    // 22 fotos chicas y la imagen que BPM ya traía: van 20 en el pedido.
    const muchas = conFotos(22);
    await muchas.servicio.ejecutar(1, 40, await contextoDe(muchas));
    const pedido = (muchas.servicio.stream.mock.calls[0] as [Pedido])[0];
    expect(
      pedido.messages[0].content.filter((b) => b.type === 'image'),
    ).toHaveLength(20);
    expect(sinCupo(muchas)).toEqual([
      'BPM EVENTOS SPA: foto 20.jpg',
      'BPM EVENTOS SPA: foto 21.jpg',
      'BPM EVENTOS SPA: foto 22.jpg',
    ]);
    // A la IA se le dice cuáles no vio.
    expect(
      pedido.messages[0].content.find((b) => b.text?.startsWith('=== OFERTA 3'))
        ?.text,
    ).toContain('foto 22.jpg');

    // 5 fotos de 4 millones de bytes: caben 3 (12); con la cuarta serían 16,
    // más que los 15 MB (15,7 millones).
    const pesadas = conFotos(5);
    pesadas.repo.descargar.mockImplementation((ruta: string) =>
      Promise.resolve(
        /\/10\d$/.test(ruta)
          ? Buffer.alloc(4_000_000)
          : Buffer.from('%PDF-1.4 oferta'),
      ),
    );
    await pesadas.servicio.ejecutar(1, 40, await contextoDe(pesadas));
    expect(sinCupo(pesadas)).toEqual([
      'BPM EVENTOS SPA: foto 4.jpg',
      'BPM EVENTOS SPA: foto 5.jpg',
    ]);
  });

  it('si después de traer no hay con quién comparar, lo dice y no gasta', async () => {
    const casos: Array<[unknown, string]> = [
      [
        { ...VUELTA, resultado: { ...VUELTA.resultado, publicadas: false } },
        'todavía no muestra las ofertas',
      ],
      [
        { ...VUELTA, resultado: { ...VUELTA.resultado, oferentes: 0 } },
        'Solo tu empresa presentó oferta',
      ],
      [
        {
          terminada_en: 'x',
          error: 'Mercado Público no respondió.',
          resultado: null,
        },
        'Mercado Público no respondió.',
      ],
      [null, 'tráelas o súbelas en «La competencia»'],
    ];
    for (const [vuelta, aviso] of casos) {
      const c = armar();
      const contexto = await contextoDe(c);
      c.ofertas.traerAhora.mockResolvedValue(vuelta);
      c.adjuntos.listar.mockResolvedValue([]);
      await c.servicio.ejecutar(1, 40, contexto);
      expect(c.repo.terminar).toHaveBeenCalledWith(1, 40, {
        estado: 'error',
        error: expect.stringContaining(aviso) as unknown,
      });
      expect(c.servicio.stream).not.toHaveBeenCalled();
    }
  });

  it('si la IA falla o no responde con el formato, queda escrito en la fila', async () => {
    const cae = armar();
    const contexto = await contextoDe(cae);
    cae.servicio.final.mockRejectedValue(new Error('se cayó'));
    await cae.servicio.ejecutar(1, 41, contexto);
    expect(cae.repo.terminar).toHaveBeenCalledWith(
      1,
      41,
      expect.objectContaining({
        estado: 'error',
        error: expect.stringContaining('se cayó') as unknown,
      }),
    );

    const corta = armar();
    corta.servicio.final.mockResolvedValue({
      parsed_output: null,
      usage: { input_tokens: 10, output_tokens: 32_000 },
      stop_reason: 'max_tokens',
    });
    await corta.servicio.ejecutar(1, 42, await contextoDe(corta));
    expect(corta.repo.terminar).toHaveBeenCalledWith(
      1,
      42,
      expect.objectContaining({
        estado: 'error',
        error: 'La IA no pudo comparar las ofertas (max_tokens).',
      }),
    );
  });
});

describe('La última comparación', () => {
  it('una de antes de la decisión 125 sale con una sola línea; la que está en curso, como está', async () => {
    const c = armar();
    const vieja = {
      id: 133,
      estado: 'listo',
      resultado: {
        resumen: 'Textum va adelante.',
        ganador_probable: 'TEXTUM',
        criterios: [],
        oferentes: [
          {
            nombre: 'VDS',
            es_tuya: true,
            cumple_bases: 'dudoso',
            puntaje: 99.4,
            probabilidad: 40,
          },
          {
            nombre: 'TEXTUM',
            es_tuya: false,
            cumple_bases: 'dudoso',
            puntaje: 100,
            probabilidad: 60,
          },
        ],
        para_la_proxima: [],
      },
    };
    c.repo.ultimoDeTipo.mockResolvedValue(vieja);
    const r = (await c.servicio.ultima(1, 4633)) as unknown as {
      resultado: { lineas: Array<Record<string, unknown>> };
    };
    expect(c.repo.ultimoDeTipo).toHaveBeenCalledWith(1, 4633, 'comparacion');
    expect(r.resultado.lineas).toHaveLength(1);
    expect(r.resultado.lineas[0]).toMatchObject({
      nombre: '',
      compites: true,
      si_aceptan_todo: 'TEXTUM',
      a_la_letra: null,
    });

    const enCurso = { id: 134, estado: 'procesando', resultado: null };
    c.repo.ultimoDeTipo.mockResolvedValue(enCurso);
    expect(await c.servicio.ultima(1, 4633)).toBe(enCurso);
    c.repo.ultimoDeTipo.mockResolvedValue(null);
    expect(await c.servicio.ultima(1, 4633)).toBeNull();
  });
});
