import type Anthropic from '@anthropic-ai/sdk';
import { BadRequestException } from '@nestjs/common';
import type { PinoLogger } from 'nestjs-pino';
import { mockPinoLogger } from 'src/testing/mocks';
import type { AdjuntosRepository } from '../adjuntos/adjuntos.repository';
import type { AnalisisRepository } from '../analisis/analisis.repository';
import type { AprendizajesRepository } from '../aprendizajes/aprendizajes.repository';
import {
  AprendizajesService,
  enlaceDelActaDe,
  SIN_ACTA_PUBLICADA,
} from '../aprendizajes/aprendizajes.service';
import { CompetenciaCronService } from '../competencia/competencia-cron.service';
import type { ResultadosRepository } from '../competencia/resultados.repository';
import type { GeneracionRepository } from '../generacion/generacion.repository';
import {
  anexosDeLaAdjudicacion,
  anexosParaAprender,
  bajarAnexosDelActa,
  esElActaDeEvaluacion,
  esElDecretoDeAdjudicacion,
} from '../historia/anexos-del-acta';
import type { OportunidadesRepository } from '../oportunidades.repository';

// EL ACTA DE EVALUACIÓN LLEGA SOLA (decisión 128, 11-11). Felipe: "subir el
// acta de evaluación debería también ser automático (¿se puede?)". Se puede:
// la página pública del acta de adjudicación trae «Anexos a la Adjudicación»
// y cada fila se baja con su botón «Ver Anexo», sin código. Aquí, con la
// forma de la página real de la 5040-6-LE26 (Mes de las Juventudes) y
// Mercado Público y la IA de mentira.

const ENLACE =
  'http://www.mercadopublico.cl/Procurement/Modules/RFB/StepsProcessAward/PreviewAwardAct.aspx?qs=pT9CUdqm/qpywLLE8w+YUK=';

const fila = (
  n: string,
  nombre: string,
  tipo: string,
  kb: string,
) => `<tr class="cssFwkItemStyle">
 <td><input id="DWNL_grdId_ctl${n}_chk" type="checkbox" name="DWNL$grdId$ctl${n}$chk" /></td><td><span id="DWNL_grdId_ctl${n}_File">${nombre}</span></td><td><span id="DWNL_grdId_ctl${n}_Type">${tipo}</span></td><td><span id="DWNL_grdId_ctl${n}_Description">${nombre.replace(/\.\w+$/, '')}</span></td><td><span id="DWNL_grdId_ctl${n}_FileLength">${kb} KB</span></td><td><span id="DWNL_grdId_ctl${n}_AtcDateTime">29-07-2026 13:08:43</span></td><td><input type="image" name="DWNL$grdId$ctl${n}$search" id="DWNL_grdId_ctl${n}_search" title="Ver Anexo" src="../../../Includes/images/Grilla/ver.gif" /></td>
 </tr>`;

const pagina = (...filas: string[]) => `<html><body><form>
<input type="hidden" name="__EVENTTARGET" id="__EVENTTARGET" value="" />
<input type="hidden" name="__EVENTARGUMENT" id="__EVENTARGUMENT" value="" />
<input type="hidden" name="__VIEWSTATE" id="__VIEWSTATE" value="/wEPDwUK&#39;estado&#39;" />
<input type="hidden" name="__VIEWSTATEGENERATOR" id="__VIEWSTATEGENERATOR" value="9C3B1A6F" />
<span idLbl="DWNLLblMessage">Anexos a la Adjudicación</span>
<table cellspacing="0" rules="all" border="1" id="DWNL_grdId">
 <tr><th scope="col">Sel.</th><th scope="col">Anexo</th><th scope="col">Tipo</th><th scope="col">Descripción</th><th scope="col">Tamaño</th><th scope="col">Fecha de Adjunto</th><th scope="col">Acciones</th></tr>
 ${filas.join('\n')}
</table></form></body></html>`;

const DECLARACION = fila(
  '02',
  'Declaración de ausencia de conflicto de intereses ID 5040-6-LE26.pdf',
  'DOCUMENT_TYPE_DJ_ABSENCE_CONFLICTS_OF_INTEREST',
  '1212',
);
const ACTA_DE_EVALUACION = fila(
  '03',
  'Acta de evaluación ID 5040-6-LE26.pdf',
  'DOCUMENT_TYPE_ACTA_EVALUACION_ADJ_ATTACHMENT',
  '851',
);
const DECRETO = fila(
  '04',
  'D.A. N°3.452 Aprueba adjudicación licitación ID 5040-6-LE26 Servi.pdf',
  'Resolución/Decreto Adjudicación',
  '459',
);
const RESOLUCION = fila(
  '05',
  'Resolución alcaldicia ID 5040-6-LE26.pdf',
  'Resolución/Decreto Adjudicación',
  '106',
);
const LA_PAGINA = pagina(DECLARACION, ACTA_DE_EVALUACION, DECRETO, RESOLUCION);

describe('Los anexos de la adjudicación, en la página pública del acta', () => {
  it('cada fila con su nombre, su tipo, su peso y su botón; y los campos ocultos del formulario', () => {
    const { anexos, ocultos } = anexosDeLaAdjudicacion(LA_PAGINA);
    expect(anexos).toHaveLength(4);
    expect(anexos[1]).toEqual({
      nombre: 'Acta de evaluación ID 5040-6-LE26.pdf',
      tipo: 'DOCUMENT_TYPE_ACTA_EVALUACION_ADJ_ATTACHMENT',
      descripcion: 'Acta de evaluación ID 5040-6-LE26',
      kb: 851,
      boton: 'DWNL$grdId$ctl03$search',
    });
    expect(anexos[2].tipo).toBe('Resolución/Decreto Adjudicación');
    expect(ocultos).toEqual({
      __EVENTTARGET: '',
      __EVENTARGUMENT: '',
      __VIEWSTATE: "/wEPDwUK'estado'",
      __VIEWSTATEGENERATOR: '9C3B1A6F',
    });
    // Una página sin la tabla (o que cambió): nada, sin caerse.
    expect(anexosDeLaAdjudicacion('<html></html>').anexos).toEqual([]);
  });

  it('se trae el acta de evaluación: por su tipo o por cómo se llama; nunca la declaración de conflictos', () => {
    const { anexos } = anexosDeLaAdjudicacion(LA_PAGINA);
    expect(anexos.map(esElActaDeEvaluacion)).toEqual([
      false,
      true,
      false,
      false,
    ]);
    expect(anexos.map(esElDecretoDeAdjudicacion)).toEqual([
      false,
      false,
      true,
      true,
    ]);
    expect(anexosParaAprender(anexos).map((a) => a.nombre)).toEqual([
      'Acta de evaluación ID 5040-6-LE26.pdf',
    ]);
    // Subida como «Otros Anexos», se reconoce por el nombre.
    const porNombre = anexosDeLaAdjudicacion(
      pagina(
        fila('02', 'INFORME COMISION EVALUADORA.PDF', 'Otros Anexos', '300'),
        fila('03', 'ACTA DE EVALUACIÓN.pdf', 'Otros Anexos', '700'),
        fila('04', 'Bases firmadas.pdf', 'Otros Anexos', '900'),
      ),
    ).anexos;
    expect(anexosParaAprender(porNombre).map((a) => a.nombre)).toEqual([
      'INFORME COMISION EVALUADORA.PDF',
      'ACTA DE EVALUACIÓN.pdf',
    ]);
  });

  it('si el comprador no subió el acta como tal, el decreto que adjudica; solo PDF y Word, hasta tres', () => {
    const sinActa = anexosDeLaAdjudicacion(
      pagina(DECLARACION, DECRETO, RESOLUCION),
    ).anexos;
    expect(anexosParaAprender(sinActa).map((a) => a.nombre)).toEqual([
      'D.A. N°3.452 Aprueba adjudicación licitación ID 5040-6-LE26 Servi.pdf',
      'Resolución alcaldicia ID 5040-6-LE26.pdf',
    ]);
    // Ni acta ni decreto: nada.
    expect(
      anexosParaAprender(anexosDeLaAdjudicacion(pagina(DECLARACION)).anexos),
    ).toEqual([]);
    // Un acta en un comprimido no se lee: no se trae.
    const comprimida = anexosDeLaAdjudicacion(
      pagina(
        fila(
          '02',
          'Acta de evaluación.rar',
          'DOCUMENT_TYPE_ACTA_EVALUACION_ADJ_ATTACHMENT',
          '500',
        ),
      ),
    ).anexos;
    expect(anexosParaAprender(comprimida)).toEqual([]);
    // Lo que la lista dice que pesa más de 30 MB no se baja.
    const enorme = anexosDeLaAdjudicacion(
      pagina(
        fila(
          '02',
          'Acta de evaluación.pdf',
          'DOCUMENT_TYPE_ACTA_EVALUACION_ADJ_ATTACHMENT',
          '40000',
        ),
      ),
    ).anexos;
    expect(anexosParaAprender(enorme)).toEqual([]);
    const cinco = anexosDeLaAdjudicacion(
      pagina(
        ...['02', '03', '04', '05', '06'].map((n) =>
          fila(n, `Acta de evaluación ${n}.pdf`, 'Otros Anexos', '10'),
        ),
      ),
    ).anexos;
    expect(anexosParaAprender(cinco)).toHaveLength(3);
  });

  it('se baja con el botón de su fila, por https y sin código; lo que no llega como archivo se salta', async () => {
    const pedir = jest.fn((_url: string, init?: RequestInit) =>
      Promise.resolve(
        init?.method === 'POST'
          ? new Response(Buffer.from('%PDF-1.4 el acta'), {
              status: 200,
              headers: {
                'content-disposition':
                  'attachment; filename=Acta_de_evaluaci%C3%B3n.pdf',
              },
            })
          : new Response(LA_PAGINA, { status: 200 }),
      ),
    );
    const traidos = await bajarAnexosDelActa(ENLACE, pedir);
    expect(traidos).toHaveLength(1);
    expect(traidos[0].contenido.toString()).toBe('%PDF-1.4 el acta');
    const https = ENLACE.replace('http:', 'https:');
    expect(pedir.mock.calls.map((c) => c[0])).toEqual([https, https]);
    const cuerpo = pedir.mock.calls[1][1]?.body as URLSearchParams;
    expect(cuerpo.get('DWNL$grdId$ctl03$search.x')).toBe('5');
    expect(cuerpo.get('DWNL$grdId$ctl03$search.y')).toBe('5');
    expect(cuerpo.get('__VIEWSTATE')).toBe("/wEPDwUK'estado'");
    expect(cuerpo.get('__VIEWSTATEGENERATOR')).toBe('9C3B1A6F');

    // Mercado Público devuelve la página en vez del archivo: no hay acta.
    const sinArchivo = jest.fn(() =>
      Promise.resolve(new Response(LA_PAGINA, { status: 200 })),
    );
    await expect(bajarAnexosDelActa(ENLACE, sinArchivo)).resolves.toEqual([]);
  });

  it('solo el acta de Mercado Público; si no responde, lo dice', async () => {
    const pedir = jest.fn();
    await expect(
      bajarAnexosDelActa('https://otro.sitio/PreviewAwardAct.aspx?qs=x', pedir),
    ).rejects.toThrow('no es de Mercado Público');
    expect(pedir).not.toHaveBeenCalled();
    pedir.mockResolvedValue(new Response('caído', { status: 503 }));
    await expect(bajarAnexosDelActa(ENLACE, pedir)).rejects.toThrow(
      'Mercado Público respondió 503',
    );
  });

  it('el enlace del acta: solo en una licitación adjudicada y solo de Mercado Público', () => {
    expect(
      enlaceDelActaDe({
        tipo: 'licitacion',
        adjudicacion: { url_acta: ENLACE },
      }),
    ).toBe(ENLACE);
    expect(
      enlaceDelActaDe({
        tipo: 'compra_agil',
        adjudicacion: { url_acta: ENLACE },
      }),
    ).toBeNull();
    expect(
      enlaceDelActaDe({ tipo: 'licitacion', adjudicacion: null }),
    ).toBeNull();
    expect(
      enlaceDelActaDe({
        tipo: 'licitacion',
        adjudicacion: { url_acta: 'https://otro.sitio/acta' },
      }),
    ).toBeNull();
  });
});

class AprendizajesDePrueba extends AprendizajesService {
  parse = jest.fn();
  bajar = jest.fn();
  pausas = 0;
  protected pausa(): Promise<void> {
    this.pausas += 1;
    return Promise.resolve();
  }
  protected cliente(): Anthropic {
    return { messages: { parse: this.parse } } as unknown as Anthropic;
  }
  protected bajarDelActa(enlace: string) {
    return this.bajar(enlace) as Promise<
      Array<{ nombre: string; contenido: Buffer }>
    >;
  }
}

const EL_PDF = {
  nombre: 'Acta de evaluación ID 4364-13-LE26.pdf',
  contenido: Buffer.from('%PDF-1.4 acta de evaluación'),
};

function armar() {
  /** Lo que hay en la sección 'acta': parte vacía y se llena al guardar. */
  const enLaSeccion: Array<Record<string, unknown>> = [];
  const repo = {
    deLaEmpresa: jest.fn().mockResolvedValue([]),
    reemplazarLosDelActa: jest.fn().mockResolvedValue(3),
  };
  const generacion = {
    abandonarAntesDe: jest.fn().mockResolvedValue(undefined),
    ultimoDeTipo: jest.fn().mockResolvedValue(null),
    crearGeneracion: jest.fn((f: Record<string, unknown>) =>
      Promise.resolve({ id: 70, estado: 'procesando', ...f }),
    ),
    terminar: jest.fn().mockResolvedValue(undefined),
    descargar: jest.fn().mockResolvedValue(EL_PDF.contenido),
  };
  const adjuntos = {
    listar: jest.fn(() => Promise.resolve([...enLaSeccion])),
    perfilDe: jest.fn().mockResolvedValue('perfil-1'),
    subirArchivo: jest.fn().mockResolvedValue(undefined),
    borrarArchivo: jest.fn().mockResolvedValue(true),
    guardar: jest.fn((a: Record<string, unknown>) => {
      const guardado = {
        id: 900 + enLaSeccion.length,
        creado_en: '2026-11-05T15:40:00Z',
        ...a,
      };
      enLaSeccion.push(guardado);
      return Promise.resolve(guardado);
    }),
  };
  const oportunidades = {
    ficha: jest.fn().mockResolvedValue({
      id: 84,
      codigo: '4364-13-LE26',
      estado: 'perdida',
      proceso: {
        tipo: 'licitacion',
        nombre: 'Día del Profesor',
        organismo: 'I MUNICIPALIDAD DE QUILLON',
        adjudicacion: { url_acta: ENLACE },
      },
    }),
  };
  const analisis = { ultimo: jest.fn().mockResolvedValue(null) };
  const resultados = {
    resueltasConActa: jest
      .fn()
      .mockResolvedValue([
        { id: 84, codigo: '4364-13-LE26', url_acta: ENLACE },
      ]),
  };
  const logger = mockPinoLogger();
  const servicio = new AprendizajesDePrueba(
    repo as unknown as AprendizajesRepository,
    generacion as unknown as GeneracionRepository,
    adjuntos as unknown as AdjuntosRepository,
    oportunidades as unknown as OportunidadesRepository,
    analisis as unknown as AnalisisRepository,
    logger as unknown as PinoLogger,
    resultados as unknown as ResultadosRepository,
  );
  servicio.bajar.mockResolvedValue([EL_PDF]);
  servicio.parse.mockResolvedValue({
    parsed_output: {
      ganador: 'Sol de Quillón',
      prediccion: 'acerto',
      por_que: '',
      resumen: 'Evaluó con rigor.',
      aprendizajes: [
        {
          situacion: 'Faltó un anexo.',
          decision: 'La dejó fuera.',
          tipo: 'estricta',
        },
      ],
    },
    usage: { input_tokens: 12_000, output_tokens: 900 },
    stop_reason: 'end_turn',
  });
  return {
    enLaSeccion,
    repo,
    generacion,
    adjuntos,
    oportunidades,
    resultados,
    logger,
    servicio,
  };
}

const antes = process.env.ANTHROPIC_API_KEY;
beforeEach(() => {
  process.env.ANTHROPIC_API_KEY = 'llave-de-prueba';
});
afterAll(() => {
  if (antes === undefined) delete process.env.ANTHROPIC_API_KEY;
  else process.env.ANTHROPIC_API_KEY = antes;
});

describe('El acta se trae a la sección «acta»', () => {
  it('queda guardada sin «subido por» (llegó sola), en la carpeta de la empresa', async () => {
    const c = armar();
    await expect(
      c.servicio.traerElActa(1, 84, '4364-13-LE26', ENLACE),
    ).resolves.toBe(1);
    expect(c.servicio.bajar).toHaveBeenCalledWith(ENLACE);
    const [ruta, contenido, tipo] = c.adjuntos.subirArchivo.mock
      .calls[0] as unknown as [string, Buffer, string];
    expect(ruta).toMatch(
      /^c1\/oportunidades\/84\/acta\/.+_Acta_de_evaluaci.+\.pdf$/,
    );
    expect(contenido).toBe(EL_PDF.contenido);
    expect(tipo).toBe('application/pdf');
    expect(c.adjuntos.guardar).toHaveBeenCalledWith({
      company_id: 1,
      oportunidad_id: 84,
      nombre: 'Acta de evaluación ID 4364-13-LE26.pdf',
      ruta,
      tipo: 'application/pdf',
      bytes: EL_PDF.contenido.length,
      seccion: 'acta',
      subido_por: null,
    });
  });

  it('no repite la que ya está, ni guarda lo vacío o lo que Eventia no guarda', async () => {
    const c = armar();
    await c.servicio.traerElActa(1, 84, '4364-13-LE26', ENLACE);
    // Otra vuelta: el mismo nombre y el mismo peso ya están.
    await expect(
      c.servicio.traerElActa(1, 84, '4364-13-LE26', ENLACE),
    ).resolves.toBe(0);
    expect(c.adjuntos.subirArchivo).toHaveBeenCalledTimes(1);

    const raros = armar();
    raros.servicio.bajar.mockResolvedValue([
      { nombre: 'Acta.pdf', contenido: Buffer.alloc(0) },
      { nombre: 'Acta.exe', contenido: Buffer.from('x') },
    ]);
    await expect(
      raros.servicio.traerElActa(1, 84, '4364-13-LE26', ENLACE),
    ).resolves.toBe(0);
    expect(raros.adjuntos.subirArchivo).not.toHaveBeenCalled();
  });

  it('el reloj y el botón a la vez: la segunda vuelta espera a la primera y no la trae de nuevo', async () => {
    const c = armar();
    let soltar: (archivos: unknown[]) => void = () => undefined;
    c.servicio.bajar.mockReturnValueOnce(
      new Promise((listo) => {
        soltar = listo;
      }),
    );
    const primera = c.servicio.traerElActa(1, 84, '4364-13-LE26', ENLACE);
    const segunda = c.servicio.traerElActa(1, 84, '4364-13-LE26', ENLACE);
    // La segunda espera; la primera termina y la suelta.
    await Promise.resolve();
    soltar([EL_PDF]);
    await expect(primera).resolves.toBe(1);
    await expect(segunda).resolves.toBe(0);
    expect(c.servicio.pausas).toBeGreaterThan(0);
    expect(c.servicio.bajar).toHaveBeenCalledTimes(1);
    expect(c.adjuntos.guardar).toHaveBeenCalledTimes(1);
  });

  it('si la fila no se guarda, el archivo no queda huérfano', async () => {
    const c = armar();
    c.adjuntos.guardar.mockRejectedValueOnce(new Error('sin base'));
    await expect(
      c.servicio.traerElActa(1, 84, '4364-13-LE26', ENLACE),
    ).rejects.toThrow('sin base');
    const [ruta] = c.adjuntos.subirArchivo.mock.calls[0] as unknown as [string];
    expect(c.adjuntos.borrarArchivo).toHaveBeenCalledWith(ruta);
  });
});

describe('«Aprender del acta», sin haberla subido', () => {
  it('en una licitación adjudicada se pide igual: la fila parte sin archivos y el acta se trae por detrás', async () => {
    const c = armar();
    const ejecutar = jest
      .spyOn(c.servicio, 'ejecutar')
      .mockResolvedValue(undefined);
    const filaNueva = await c.servicio.pedir(1, 'cuenta', 84);
    expect(filaNueva.estado).toBe('procesando');
    expect(c.generacion.crearGeneracion).toHaveBeenCalledWith(
      expect.objectContaining({
        tipo: 'aprendizaje',
        parametros: { actas: 0, trae_el_acta: true },
        archivos: [],
        pedido_por: 'perfil-1',
      }),
    );
    expect(ejecutar.mock.calls[0][4]).toMatchObject({
      codigo: '4364-13-LE26',
      leer: [],
      enlace: ENLACE,
    });
  });

  it('por detrás: la trae, la lee y deja anotado qué leyó', async () => {
    const c = armar();
    await c.servicio.ejecutar(1, 84, 70, [], {
      codigo: '4364-13-LE26',
      organismo: 'I MUNICIPALIDAD DE QUILLON',
      leer: [],
      enlace: ENLACE,
      instrucciones: 'INSTRUCCIONES',
    });
    expect(c.servicio.bajar).toHaveBeenCalledWith(ENLACE);
    expect(c.servicio.parse).toHaveBeenCalledTimes(1);
    expect(c.generacion.terminar).toHaveBeenCalledWith(
      1,
      70,
      expect.objectContaining({
        estado: 'listo',
        archivos: [
          { id: 900, nombre: 'Acta de evaluación ID 4364-13-LE26.pdf' },
        ],
        no_leidos: [],
      }),
    );
  });

  it('si el comprador no adjuntó el acta, queda dicho y no se gasta en IA', async () => {
    const c = armar();
    c.servicio.bajar.mockResolvedValue([]);
    await c.servicio.ejecutar(1, 84, 70, [], {
      codigo: '4364-13-LE26',
      organismo: null,
      leer: [],
      enlace: ENLACE,
      instrucciones: 'X',
    });
    expect(c.servicio.parse).not.toHaveBeenCalled();
    expect(c.generacion.terminar).toHaveBeenCalledWith(1, 70, {
      estado: 'error',
      error: SIN_ACTA_PUBLICADA,
      no_leidos: [],
    });
  });

  it('si Mercado Público no responde, lo dice y se puede subir a mano', async () => {
    const c = armar();
    c.servicio.bajar.mockRejectedValue(new Error('fetch failed'));
    await c.servicio.ejecutar(1, 84, 70, [], {
      codigo: '4364-13-LE26',
      organismo: null,
      leer: [],
      enlace: ENLACE,
      instrucciones: 'X',
    });
    expect(c.servicio.parse).not.toHaveBeenCalled();
    expect(c.generacion.terminar).toHaveBeenCalledWith(
      1,
      70,
      expect.objectContaining({
        estado: 'error',
        error: expect.stringContaining(
          'No se pudo traer el acta desde Mercado Público',
        ) as string,
      }),
    );
  });

  it('una compra ágil no publica acta, y una licitación sin adjudicar tampoco: no se pide nada', async () => {
    const agil = armar();
    agil.oportunidades.ficha.mockResolvedValue({
      id: 9,
      codigo: '1346350-37-COT26',
      proceso: { tipo: 'compra_agil', nombre: 'Catamarán', adjudicacion: null },
    });
    await expect(agil.servicio.pedir(1, 'c', 9)).rejects.toThrow(
      'una compra ágil no la publica',
    );
    const abierta = armar();
    abierta.oportunidades.ficha.mockResolvedValue({
      id: 4633,
      codigo: '5040-14-LE26',
      proceso: {
        tipo: 'licitacion',
        nombre: 'Día de Campo',
        adjudicacion: null,
      },
    });
    await expect(abierta.servicio.pedir(1, 'c', 4633)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(abierta.generacion.crearGeneracion).not.toHaveBeenCalled();
  });
});

describe('El reloj: al resolverse, el acta llega y se lee sola', () => {
  it('trae el acta de cada ganada o perdida y la manda a leer, sin persona que lo pida', async () => {
    const c = armar();
    const ejecutar = jest
      .spyOn(c.servicio, 'ejecutar')
      .mockResolvedValue(undefined);
    await expect(c.servicio.revisar(1, Date.now() + 60_000)).resolves.toBe(1);
    expect(c.resultados.resueltasConActa).toHaveBeenCalledWith(1);
    expect(c.adjuntos.guardar).toHaveBeenCalledTimes(1);
    expect(c.generacion.crearGeneracion).toHaveBeenCalledWith(
      expect.objectContaining({
        oportunidad_id: 84,
        tipo: 'aprendizaje',
        pedido_por: null,
        archivos: [
          { id: 900, nombre: 'Acta de evaluación ID 4364-13-LE26.pdf' },
        ],
      }),
    );
    // Ya la tiene: `ejecutar` no vuelve a traerla.
    expect(ejecutar.mock.calls[0][4]).toMatchObject({ enlace: null });
  });

  it('una vez por licitación: la que ya tiene una lectura (lista, en curso o fallida) no se toca', async () => {
    const c = armar();
    c.generacion.ultimoDeTipo.mockResolvedValue({ id: 5, estado: 'error' });
    await expect(c.servicio.revisar(1, Date.now() + 60_000)).resolves.toBe(0);
    expect(c.servicio.bajar).not.toHaveBeenCalled();
    expect(c.generacion.crearGeneracion).not.toHaveBeenCalled();
  });

  it('si el comprador todavía no la adjunta, no deja nada escrito y lo intenta en la pasada siguiente', async () => {
    const c = armar();
    c.servicio.bajar.mockResolvedValue([]);
    await expect(c.servicio.revisar(1, Date.now() + 60_000)).resolves.toBe(0);
    expect(c.generacion.crearGeneracion).not.toHaveBeenCalled();
    // Y si Mercado Público falla en una, sigue con la próxima.
    c.resultados.resueltasConActa.mockResolvedValue([
      { id: 84, codigo: '4364-13-LE26', url_acta: ENLACE },
      { id: 85, codigo: '5040-6-LE26', url_acta: ENLACE },
    ]);
    c.servicio.bajar
      .mockRejectedValueOnce(new Error('fetch failed'))
      .mockResolvedValueOnce([EL_PDF]);
    jest.spyOn(c.servicio, 'ejecutar').mockResolvedValue(undefined);
    await expect(c.servicio.revisar(1, Date.now() + 60_000)).resolves.toBe(1);
    expect(c.logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('acta de 4364-13-LE26'),
    );
  });

  it('dos por pasada, dentro del tiempo, y solo con la llave de la IA', async () => {
    const tres = [84, 85, 86].map((id) => ({
      id,
      codigo: `4364-${id}-LE26`,
      url_acta: ENLACE,
    }));
    const c = armar();
    c.resultados.resueltasConActa.mockResolvedValue(tres);
    jest.spyOn(c.servicio, 'ejecutar').mockResolvedValue(undefined);
    await expect(c.servicio.revisar(1, Date.now() + 60_000)).resolves.toBe(2);

    const tarde = armar();
    tarde.resultados.resueltasConActa.mockResolvedValue(tres);
    await expect(tarde.servicio.revisar(1, Date.now() - 1)).resolves.toBe(0);

    const sinLlave = armar();
    delete process.env.ANTHROPIC_API_KEY;
    await expect(
      sinLlave.servicio.revisar(1, Date.now() + 60_000),
    ).resolves.toBe(0);
    expect(sinLlave.resultados.resueltasConActa).not.toHaveBeenCalled();
  });

  it('va en la pasada de los resultados, después de traer las ofertas y antes del «por qué perdimos»', async () => {
    const orden: string[] = [];
    const paso = (nombre: string) => ({
      revisar: jest.fn(() => {
        orden.push(nombre);
        return Promise.resolve(0);
      }),
    });
    const ofertas = {
      traer: jest.fn(() => {
        orden.push('ofertas');
        return Promise.resolve(0);
      }),
    };
    const reloj = new CompetenciaCronService(
      {
        empresasConModulo: jest.fn().mockResolvedValue([{ id: 1 }]),
      } as unknown as OportunidadesRepository,
      {} as never,
      {} as never,
      {} as never,
      mockPinoLogger() as unknown as PinoLogger,
      paso('resultados') as never,
      ofertas as never,
      paso('por qué') as never,
      undefined,
      paso('acta') as never,
    );
    await reloj.resultadosDeLasPostuladas();
    expect(orden).toEqual(['resultados', 'ofertas', 'acta', 'por qué']);
  });
});
