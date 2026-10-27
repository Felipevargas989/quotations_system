import Anthropic from '@anthropic-ai/sdk';
import { jsonSchemaOutputFormat } from '@anthropic-ai/sdk/helpers/json-schema';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { mensajeDe } from 'src/logging/mensaje-de-error';
import { AdjuntosRepository } from '../adjuntos/adjuntos.repository';
import { NOMBRES_DE_DOCUMENTO } from '../oferente/nombres-de-documento';
import {
  type CampoDelOferente,
  type Oferente,
  OferenteRepository,
} from '../oferente/oferente.repository';
import { OportunidadesRepository } from '../oportunidades.repository';
import { ElSetService } from '../postulacion/el-set.service';
import {
  type Aclaracion,
  memoriaDeLaLicitacion,
  textoDeLoAclarado,
} from '../preguntas/lo-aclarado';
import { PreguntasRepository } from '../preguntas/preguntas.repository';
import {
  AnalisisRepository,
  type FilaDeAnalisis,
  ValidacionRepository,
} from './analisis.repository';
import {
  armarContenido,
  costoEnDolares,
  ENCENDIDO,
  errorDeIA,
  hoyEnChile,
  MODELO_OPUS,
  type NoLeido,
} from './comun';
import {
  type ArchivoParaValidar,
  loQueCabe,
  loQueVaEnElZip,
} from './el-zip-para-validar';

// VALIDAR DOCUMENTOS (doc 17, sprint 3, paso 3; migración 127). Felipe,
// 17-10: "y lo más importante validar documentos".
//
// Toma el checklist del último análisis de las bases (paso 1) y revisa,
// requisito por requisito, si lo cumple lo que la empresa va a presentar,
// su carpeta de documentos (con el vencimiento contra la fecha de cierre)
// y sus datos (que los anexos digan el mismo RUT y la misma razón social).
// Con Opus 5.5, por detrás, como el análisis. Desde la decisión 83 (26-10)
// lee TODO lo que va en el ZIP para Mercado Público, cada archivo con su
// carpeta: también lo de «Mi empresa» y los respaldos de la experiencia.

export const ESQUEMA_DE_VALIDACION = {
  type: 'object',
  properties: {
    resumen: { type: 'string' },
    listo: { type: 'string', enum: ['si', 'casi', 'no'] },
    requisitos: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          que: { type: 'string' },
          estado: {
            type: 'string',
            enum: ['cumple', 'falta', 'vencido', 'revisar'],
          },
          donde: { type: 'string' },
          observacion: { type: 'string' },
          gravedad: { type: 'string', enum: ['grave', 'menor'] },
        },
        required: ['que', 'estado', 'donde', 'observacion', 'gravedad'],
        additionalProperties: false,
      },
    },
    otros_graves: { type: 'array', items: { type: 'string' } },
    otros_problemas: { type: 'array', items: { type: 'string' } },
  },
  required: [
    'resumen',
    'listo',
    'requisitos',
    'otros_graves',
    'otros_problemas',
  ],
  additionalProperties: false,
} as const;

type Requisito = {
  que: string;
  tipo: string;
  obligatorio: boolean;
  documento: string;
  pagina: number;
};
type Criterio = { nombre: string; peso: string; como_se_evalua: string };

/** Un documento de la sección 4 del análisis, «Lo que tienes que
 *  presentar» (decisión 89): cuándo y la vigencia que exigen las bases. */
type DocumentoPedido = {
  nombre: string;
  cuando: string;
  obligatorio: boolean;
  condicion: string;
};

export type ContextoDeValidacion = {
  codigo: string;
  nombre: string;
  organismo: string | null;
  fecha_cierre: string | null;
  /** AAAA-MM-DD, en Chile. */
  hoy: string;
  oferente: Oferente | null;
  carpeta: Array<{ tipo: string; nombre: string; vence: string | null }>;
  /** Lo que va en el ZIP, con su carpeta y si la IA lo puede leer
   *  (decisión 83). */
  zip?: Array<{ donde: string; nombre: string; leido: boolean }>;
  /** La sección 4 del análisis: lo que piden las bases, con cuándo y la
   *  vigencia que exigen (decisiones 89 y 90). */
  documentos?: DocumentoPedido[];
  requisitos: Requisito[];
  criterios: Criterio[];
  /** La memoria de la licitación (decisión 68): lo aclarado manda. */
  aclarado?: Aclaracion[];
  /** Una compra ágil (decisión 91): el precio y el plazo de entrega se
   *  declaran en el formulario de Mercado Público. */
  compra_agil?: boolean;
};

const DATOS_DEL_OFERENTE: ReadonlyArray<[CampoDelOferente, string]> = [
  ['razon_social', 'Razón social'],
  ['rut', 'RUT'],
  ['giro', 'Giro'],
  ['direccion', 'Dirección'],
  ['comuna', 'Comuna'],
  ['representante_nombre', 'Representante legal'],
  ['representante_rut', 'RUT del representante'],
];

export const instruccionesDeValidacion = (c: ContextoDeValidacion): string => {
  const conLaOferta = (c.documentos ?? []).filter(
    (d) => d.cuando === 'con_la_oferta',
  );
  const datos = DATOS_DEL_OFERENTE.map(([campo, etiqueta]) =>
    c.oferente?.[campo] ? `- ${etiqueta}: ${c.oferente[campo]}` : null,
  ).filter(Boolean);
  return [
    'Revisas si una postulación a una licitación pública de Chile (Mercado Público) está completa antes de subirla.',
    `La licitación es ${c.codigo}, "${c.nombre}"${c.organismo ? `, de ${c.organismo}` : ''}. Cierra: ${c.fecha_cierre ?? '(no informado)'}. Hoy es ${c.hoy}.`,
    '',
    'LO QUE PIDEN LAS BASES (el checklist que salió de leerlas):',
    ...c.requisitos.map(
      (r, i) =>
        `${i + 1}. [${r.tipo}${r.obligatorio ? ', obligatorio' : ', opcional'}] ${r.que} (${r.documento}${r.pagina > 0 ? `, pág. ${r.pagina}` : ''})`,
    ),
    '',
    ...(conLaOferta.length > 0
      ? [
          'LO QUE PIDEN LAS BASES CON LA OFERTA, con la vigencia o antigüedad que exigen (la sección 4 del análisis):',
          ...conLaOferta.map(
            (d) =>
              `- ${d.nombre}${d.obligatorio ? ' (obligatorio)' : ''}${d.condicion ? `: ${d.condicion}` : ''}`,
          ),
          '',
        ]
      : []),
    'CÓMO SE EVALÚA:',
    ...(c.criterios.length > 0
      ? c.criterios.map(
          (k) =>
            `- ${k.nombre}${k.peso ? ` (${k.peso})` : ''}: ${k.como_se_evalua}`,
        )
      : ['(no informado)']),
    '',
    // La memoria de la licitación (decisión 68): lo aclarado manda, y la
    // validación no vuelve a dudar de algo ya resuelto (las colaciones del
    // catamarán, 22-10).
    ...textoDeLoAclarado(c.aclarado ?? []),
    ...(c.aclarado?.length
      ? [
          'Lo aclarado manda: si un documento coincide con algo aclarado (cantidades, días, lugares), cuenta como correcto aunque las bases se puedan leer de otra forma; avisa solo cuando lo contradiga.',
          '',
        ]
      : []),
    'LOS DATOS DE LA EMPRESA (los anexos tienen que decir lo mismo):',
    ...(datos.length > 0 ? datos : ['(la empresa no los ha llenado)']),
    '',
    'LO QUE VA EN EL ZIP PARA MERCADO PÚBLICO (cada archivo te lo paso con su carpeta en el título):',
    ...((c.zip ?? []).length > 0
      ? (c.zip ?? []).map(
          (a) =>
            `- ${a.donde}: ${a.nombre}${a.leido ? '' : ' (no se pudo leer: revísalo solo por su nombre)'}`,
        )
      : ['(todavía nada)']),
    '',
    'LA CARPETA DE DOCUMENTOS DE LA EMPRESA, con la fecha de vencimiento que anotó la empresa (es solo una referencia: la vigencia la fijan las bases; lo que va en el ZIP te lo paso entero):',
    ...(c.carpeta.length > 0
      ? c.carpeta.map(
          (d) =>
            `- ${NOMBRES_DE_DOCUMENTO[d.tipo] ?? d.tipo}: ${d.nombre} (${d.vence ? `vence ${d.vence}` : 'no vence'})`,
        )
      : ['(vacía)']),
    '',
    'Te paso todo lo que va en el ZIP. Lee cada documento por dentro, no basta con que exista: que diga lo que piden las bases, que esté vigente, firmado y con los datos de la empresa. Para CADA requisito del checklist, en el mismo orden y con el mismo texto en "que", decide:',
    '- "cumple": está en el ZIP y al leerlo se ve correcto (o en la carpeta, si es un certificado que las bases no piden con la oferta);',
    '- "falta": no está en ningún lado;',
    '- "vencido": está, pero no cumple al cierre la vigencia que piden las bases (si fijan un plazo desde la emisión, por la fecha de emisión que dice el documento; si no, porque vence antes del cierre);',
    '- "revisar": está pero incompleto, sin firma, con datos que no calzan con los de la empresa, o no se puede saber (también si no se pudo leer).',
    // Felipe, 19-10: "déjalo como que siempre estará habilitado... es
    // difícil no tener eso".
    'Estar inscrito o hábil en el Registro de Proveedores (ChileProveedores) es siempre "cumple": la empresa está hábil, se da por hecho y no hay un documento que mirar.',
    'En "donde", el nombre del documento que lo cumple (vacío si falta). En "observacion", una frase: qué está bien o qué hay que hacer.',
    // Decisión 85 (26-10): Felipe, con todo en amarillo: "no distingue una
    // falta menor en amarillo de una grave en rojo; que falte un
    // formulario es grave".
    'En "gravedad", para cada requisito que no cumple: "grave" si puede dejar la oferta fuera de bases, anularla o costarle puntaje (un formulario o documento que falta, una firma que falta, un dato obligatorio en blanco, algo que no cubre lo que piden las bases, un documento vencido o que no acredita lo pedido); "menor" si es de forma y no cambia el resultado (redacción, ortografía, sugerencias). A los que cumplen, "menor".',
    'Lo que no es de un requisito va en "otros_graves" si es grave, con la misma regla (un RUT o una razón social de otra empresa, no otra forma de escribir la misma; montos que no calzan con la oferta, fechas que no son las de las bases, anexos de otra licitación, un documento en una carpeta del ZIP que no es la que piden las bases), y en "otros_problemas" si es menor.',
    // Decisión 87 (27-10): Felipe quedó fuera del Día del Funcionario de
    // Quillón (1532886-5-LE26) porque el Anexo N°5 iba con la columna de
    // precio neto por ítem vacía, y la validación de ese día dijo «cumple».
    'LOS PRECIOS, SIEMPRE: en la oferta económica revisa uno por uno los precios que pide el formulario: cada ítem o línea con su precio (neto, unitario o total, según sus columnas), el neto, el IVA y el total. Una celda de precio en blanco, un precio que no está en neto cuando el formulario o las bases lo piden en neto, sumas que no cuadran, decimales cuando los piden sin decimales o un total sobre el presupuesto son "grave": la oferta económica no se corrige después del cierre. Dilo en el requisito de la oferta económica, nombrando la línea o la columna; si el checklist no lo trae, va en "otros_graves". Las líneas a las que la empresa no postula no llevan precio.',
    // Decisión 91 (27-10). Felipe, con la 1030177-85-COT26 en rojo por el
    // plazo: "el plazo de entrega es de compra ágil".
    ...(c.compra_agil
      ? [
          'ES UNA COMPRA ÁGIL: el precio y el plazo de entrega se declaran en el formulario de Mercado Público al ofertar, no en los documentos. Que un documento no los traiga no es una falta: si las bases los evalúan, recuérdalo como "menor" («decláralo en el formulario de Mercado Público»). Si un documento trae el precio, revísalo como siempre.',
        ]
      : []),
    // Decisión 88 (27-10). Felipe: "tiene que ser nuestro contralorito
    // interno... mis resoluciones sanitarias no me permiten tener un
    // restaurante". Y va con lo demás, pero nunca hacia el comprador: "no
    // nos vamos a autodelatar... no quería que se informara al cliente".
    // Decisión 89: "que revise toda la documentación... y advierta
    // cualquier inconsistencia técnica más que de forma". Y la 90: "debe
    // leer solo el zip... los documentos vencen en función de lo que dicen
    // las bases y no necesariamente lo que tenemos nosotros definido".
    'TODO LO QUE VA EN EL ZIP, el fondo y no la forma:',
    '- Vigente según las bases: la vigencia la fijan las bases y no la fecha de vencimiento que anotó la empresa. Si piden, por ejemplo, el certificado emitido hace no más de 30 días, compara la fecha de emisión que dice el documento con el cierre; si solo piden que esté vigente, que lo esté al cierre.',
    '- Sin problemas por dentro: deudas en el certificado de la TGR, morosidades o protestos en el DICOM, deudas o multas laborales y previsionales en el F30 o el F30-1, una quiebra o un procedimiento concursal, una sociedad que no aparece vigente.',
    '- Los mismos datos: el RUT, la razón social y el representante calzan entre los documentos y con los datos de la empresa.',
    '- Habilitada para lo que ofrece: si van resoluciones sanitarias, la patente y sus respaldos o el giro del SII, que autoricen cada servicio que se ofrece. Preparar o servir alimentos exige una autorización sanitaria de la SEREMI de Salud para eso (Reglamento Sanitario de los Alimentos); una piscina de uso público, su autorización; el alojamiento, la suya; los guardias, el OS10. Mira a nombre de quién están y si la capacidad autorizada alcanza para lo que se ofrece (personas, usuarios, bañistas, huéspedes).',
    'Lo que falla es "grave" si puede dejar fuera la oferta, anularla o costarle puntaje; si no, "menor". Va en el requisito que corresponda, o en "otros_graves" u "otros_problemas", diciendo qué documento es y qué hacer. Es un aviso para la empresa, no para el comprador: di qué tiene que hacer, sin sugerir explicarlo en la postulación ni subir documentos que muestren lo que falta.',
    // Decisión 78 (24-10): la empresa edita los documentos en Eventia y
    // vuelve a validar. Felipe: "un botón de volver a validar si lo edito
    // para revisar coherencia con las bases y ortografía".
    'Revisa también lo que escribió la empresa en los Word (.docx), que todavía edita en Eventia: las faltas de ortografía y las frases que no se entienden (cita la frase y cómo queda bien), no sugerencias de estilo, van en "otros_problemas". En cualquier documento, lo que quedó por completar o sin leer ([COMPLETAR: ...] o [ILEGIBLE]) va en "otros_graves", diciendo en qué documento.',
    // Decisión 87 (27-10), para postular a muchas. Felipe: "hay
    // validaciones que son de escritura... cuáles de esas en realidad está
    // de más que estén". En la 5040-14-LE26, de 12 avisos quedaban 4.
    'NO AVISES lo que no se puede o no vale la pena corregir:',
    '- Cómo se escribe un nombre o una razón social (con o sin tilde, en mayúsculas, SpA o SPA): va como en el documento de donde sale.',
    '- La ortografía, las tildes, las mayúsculas o el género de una palabra en los PDF y en los documentos de terceros: ya están firmados o no son de la empresa. Sí avisa, en cualquier documento, lo que cambia el sentido o un dato: una frase cortada, un RUT, un monto, una fecha o un lugar distintos.',
    '- La redacción o el formato de los documentos de terceros (certificados, comodatos, dictámenes, órdenes de compra, facturas, patentes): de ellos solo importa si sirven para lo que piden las bases, si están vigentes, a nombre de quién están y qué acreditan.',
    '- Lo que viene escrito en el formulario del comprador: solo cuenta lo que escribió la empresa.',
    '- Los nombres de los archivos.',
    '- Consejos que no son de los documentos, como la operación del día del evento. Una pregunta al foro, solo si puede cambiar la admisión o el puntaje.',
    // En la prueba de la 89 avisó que la vigencia y la quiebra «están en
    // orden»: eso no es algo que hacer.
    '- Lo que está en orden: avisa solo lo que hay que hacer o revisar.',
    'En "listo": "si" si se puede subir así; "casi" si faltan detalles menores; "no" si falta algo obligatorio.',
    'En "resumen", 1 a 3 frases. Responde en español de Chile, claro y sin jerga. No inventes.',
  ].join('\n');
};

/** El checklist, los criterios y los documentos que piden las bases (con
 *  la forma que dejó el esquema del análisis). */
const delAnalisis = (
  a: FilaDeAnalisis,
): {
  requisitos: Requisito[];
  criterios: Criterio[];
  documentos: DocumentoPedido[];
} => {
  const r = (a.resultado ?? {}) as {
    requisitos?: Requisito[];
    criterios?: Criterio[];
    documentos?: DocumentoPedido[];
  };
  return {
    requisitos: r.requisitos ?? [],
    criterios: r.criterios ?? [],
    documentos: r.documentos ?? [],
  };
};

@Injectable()
export class ValidacionService {
  private clienteAnthropic: Anthropic | null = null;

  constructor(
    private readonly repo: ValidacionRepository,
    private readonly analisis: AnalisisRepository,
    private readonly adjuntos: AdjuntosRepository,
    private readonly oferente: OferenteRepository,
    private readonly oportunidades: OportunidadesRepository,
    /** Lo que va en el ZIP (decisión 83): es lo que se valida. */
    private readonly elSet: ElSetService,
    private readonly logger: PinoLogger,
    /** La memoria de la licitación (decisión 68). Opcional: las pruebas de
     *  antes no la traen y sin ella no hay nada aclarado. */
    @Optional() private readonly preguntas?: PreguntasRepository,
  ) {
    this.logger.setContext(ValidacionService.name);
  }

  /** El cliente se crea al primer uso; lee ANTHROPIC_API_KEY. */
  protected cliente(): Anthropic {
    if (!this.clienteAnthropic) {
      this.clienteAnthropic = new Anthropic({
        maxRetries: 3,
        timeout: 10 * 60 * 1000,
      });
    }
    return this.clienteAnthropic;
  }

  async ultima(companyId: number, oportunidadId: number) {
    await this.repo.abandonarAntesDe(companyId, oportunidadId, ENCENDIDO);
    return this.repo.ultimo(companyId, oportunidadId);
  }

  /** Pide la validación: responde al tiro con la fila "procesando" y sigue
   *  por detrás. Si ya había una en curso, devuelve esa. */
  async pedir(companyId: number, cuentaId: string, oportunidadId: number) {
    if (!process.env.ANTHROPIC_API_KEY?.trim()) {
      throw new BadRequestException('Falta la llave de Anthropic en el motor.');
    }
    const ficha = await this.oportunidades.ficha(companyId, oportunidadId);
    if (!ficha) throw new NotFoundException('No encontramos esa oportunidad.');

    const analisis = await this.analisis.ultimo(companyId, oportunidadId);
    if (analisis?.estado !== 'listo' || !analisis.resultado) {
      throw new BadRequestException(
        'Primero analiza las bases: la validación revisa su checklist.',
      );
    }
    const { requisitos, criterios, documentos } = delAnalisis(analisis);
    if (requisitos.length === 0) {
      throw new BadRequestException(
        'El análisis de las bases no trae requisitos que revisar.',
      );
    }

    const [piezas, oferente, carpeta, aclarado] = await Promise.all([
      this.elSet.piezas(companyId, oportunidadId),
      this.oferente.oferente(companyId),
      this.oferente.documentos(companyId),
      memoriaDeLaLicitacion(this.preguntas, companyId, oportunidadId, (m) =>
        this.logger.warn(m),
      ),
    ]);
    // Solo lo que va en el ZIP (decisión 90; Felipe: "debe leer solo el
    // zip y el zip se debe armar en función de lo que piden las bases").
    const enElZip = loQueVaEnElZip(piezas);
    // Lo que no cabe en un pedido ya no corta la validación: se avisa y se
    // revisa por su nombre.
    const { leibles, noLeidos } = loQueCabe(enElZip);
    if (leibles.length === 0 && carpeta.length === 0) {
      throw new BadRequestException(
        'Sube primero lo que vas a presentar (en "Mi postulación") o los documentos de la empresa (en "Mi empresa").',
      );
    }

    await this.repo.abandonarAntesDe(companyId, oportunidadId, ENCENDIDO);
    const fila = await this.repo.crear({
      company_id: companyId,
      oportunidad_id: oportunidadId,
      analisis_id: analisis.id,
      modelo: MODELO_OPUS,
      archivos: leibles.map((a) => ({ nombre: a.nombre, carpeta: a.donde })),
      no_leidos: noLeidos,
      pedido_por: await this.adjuntos.perfilDe(companyId, cuentaId),
    });
    if (!fila) {
      const enCurso = await this.repo.ultimo(companyId, oportunidadId);
      if (enCurso) return enCurso;
      throw new BadRequestException('Ya hay una validación en curso.');
    }

    void this.ejecutar(companyId, fila.id, leibles, noLeidos, {
      codigo: ficha.codigo,
      nombre: ficha.proceso.nombre,
      organismo: ficha.proceso.organismo,
      fecha_cierre: ficha.proceso.fecha_cierre,
      hoy: hoyEnChile(),
      compra_agil: ficha.proceso.tipo === 'compra_agil',
      oferente,
      carpeta: carpeta.map((d) => ({
        tipo: d.tipo,
        nombre: d.nombre,
        vence: d.vence,
      })),
      zip: enElZip.map((a) => ({
        donde: a.donde,
        nombre: a.nombre,
        leido: leibles.includes(a),
      })),
      documentos,
      requisitos,
      criterios,
      aclarado,
    });
    return fila;
  }

  /** Por detrás: baja lo que va en el ZIP, llama a Opus y guarda. Nunca
   *  lanza: lo que falle queda escrito en la fila. */
  async ejecutar(
    companyId: number,
    validacionId: number,
    leibles: ArchivoParaValidar[],
    noLeidos: NoLeido[],
    contexto: ContextoDeValidacion,
  ): Promise<void> {
    try {
      const { bloques, sinAbrir } = await armarContenido(leibles, (ruta) =>
        this.repo.descargar(ruta),
      );
      const noLeidosFinal = [...noLeidos, ...sinAbrir];
      const respuesta = await this.cliente().messages.parse({
        model: MODELO_OPUS,
        max_tokens: 16000,
        output_config: {
          effort: 'medium',
          format: jsonSchemaOutputFormat(ESQUEMA_DE_VALIDACION),
        },
        system: instruccionesDeValidacion(contexto),
        messages: [
          {
            role: 'user',
            content: [
              ...bloques,
              {
                type: 'text',
                text:
                  bloques.length > 0
                    ? 'Valida todo lo que va en el ZIP contra las bases.'
                    : 'La empresa todavía no subió documentos de la postulación: valida con la carpeta y marca lo demás como falta.',
              },
            ],
          },
        ],
      });
      const entrada = respuesta.usage.input_tokens ?? 0;
      const salida = respuesta.usage.output_tokens ?? 0;
      const costo = costoEnDolares(entrada, salida);
      if (!respuesta.parsed_output) {
        await this.repo.terminar(companyId, validacionId, {
          estado: 'error',
          no_leidos: noLeidosFinal,
          tokens_entrada: entrada,
          tokens_salida: salida,
          costo_usd: costo,
          error: `La IA no pudo validar (${respuesta.stop_reason ?? 'sin respuesta'}).`,
        });
        return;
      }
      await this.repo.terminar(companyId, validacionId, {
        estado: 'listo',
        resultado: respuesta.parsed_output as unknown as Record<
          string,
          unknown
        >,
        no_leidos: noLeidosFinal,
        tokens_entrada: entrada,
        tokens_salida: salida,
        costo_usd: costo,
      });
      this.logger.info(
        `validación ${validacionId} lista: ${entrada} tokens de entrada, ${salida} de salida, US$${costo}`,
      );
    } catch (error) {
      this.logger.warn(`validación ${validacionId}: ${mensajeDe(error)}`);
      await this.repo
        .terminar(companyId, validacionId, {
          estado: 'error',
          error: errorDeIA(error),
        })
        .catch((e) =>
          this.logger.error(
            `no pude anotar el error de la validación ${validacionId}: ${mensajeDe(e)}`,
          ),
        );
    }
  }
}
