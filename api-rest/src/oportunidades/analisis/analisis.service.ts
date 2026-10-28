import Anthropic from '@anthropic-ai/sdk';
import { jsonSchemaOutputFormat } from '@anthropic-ai/sdk/helpers/json-schema';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { mensajeDe } from 'src/logging/mensaje-de-error';
import {
  type Adjunto,
  AdjuntosRepository,
} from '../adjuntos/adjuntos.repository';
import { EventiaRepository } from '../eventia/eventia.repository';
import { FichaRepository } from '../ficha/ficha.repository';
import { OferenteRepository } from '../oferente/oferente.repository';
import { OportunidadesRepository } from '../oportunidades.repository';
import { AnalisisRepository, type FilaDeAnalisis } from './analisis.repository';
import {
  armarContenido,
  type ContextoDeBases,
  costoDelUso,
  costoEnDolares,
  DURACION_DE_LA_CACHE,
  ENCENDIDO,
  errorDeIA,
  instruccionesComunes,
  MAX_BYTES_DE_BASES,
  MAX_BYTES_DE_PDF,
  MODELO_OPUS,
  MODELO_SONNET,
  type NoLeido,
  pesoDePdf,
  prefijoDeDocumentos,
  separar,
  sistemaConCache,
  usoDeLaRespuesta,
} from './comun';
import {
  type CriterioDeEvaluacion,
  criteriosDeEvaluacion,
} from './criterios-de-evaluacion';
import {
  armarCumplimiento,
  type Cumplimiento,
  ESQUEMA_DE_CUMPLIMIENTO,
  instruccionesDeCumplimiento,
} from './cumplimiento';
import { idDelPdf } from './pdf-subidos';

// LA IA LEE LAS BASES (doc 17, sprint 3, paso 1; migración 125). Felipe,
// 17-10: "vamos". Con Opus 5.5, lo decidido para documentos (decisión 6).
//
// El botón "Analizar bases" de la ficha manda las bases y anexos que subió
// la empresa. Opus los lee completos (también las aclaratorias) y devuelve
// el resumen, el checklist de lo que piden con su página, los criterios con
// su peso, las fechas, las garantías, lo que deja fuera y las demás
// condiciones. Tarda uno a tres minutos: corre por detrás y la pantalla
// pregunta cada pocos segundos.
// Lo común con Validar documentos vive en ./comun.

export const MODELO_BASES = MODELO_OPUS;
export { MAX_BYTES_DE_BASES, MAX_BYTES_DE_PDF, separar };
/** La falla, en palabras de la casa. */
export const errorDeAnalisis = errorDeIA;

export const ESQUEMA_DE_BASES = {
  type: 'object',
  properties: {
    resumen: { type: 'string' },
    lugar: { type: 'string' },
    se_puede_en_el_complejo: { type: 'string', enum: ['si', 'no', 'dudoso'] },
    monto: { type: 'integer' },
    monto_detalle: { type: 'string' },
    fechas: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          que: { type: 'string' },
          cuando: { type: 'string' },
        },
        required: ['que', 'cuando'],
        additionalProperties: false,
      },
    },
    criterios: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          nombre: { type: 'string' },
          peso: { type: 'string' },
          como_se_evalua: { type: 'string' },
        },
        required: ['nombre', 'peso', 'como_se_evalua'],
        additionalProperties: false,
      },
    },
    requisitos: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          que: { type: 'string' },
          tipo: {
            type: 'string',
            enum: [
              'administrativo',
              'tecnico',
              'economico',
              'garantia',
              'otro',
            ],
          },
          obligatorio: { type: 'boolean' },
          documento: { type: 'string' },
          pagina: { type: 'integer' },
        },
        required: ['que', 'tipo', 'obligatorio', 'documento', 'pagina'],
        additionalProperties: false,
      },
    },
    garantias: { type: 'array', items: { type: 'string' } },
    // La ficha ordenada (Felipe, 17-10: "quedó muy desordenado... difícil
    // de leer"): arriba solo lo que deja fuera; lo demás, plegado.
    te_dejan_fuera: { type: 'array', items: { type: 'string' } },
    condiciones: { type: 'array', items: { type: 'string' } },
    // Para "en una mirada": cuándo es y para cuántos.
    fecha_del_servicio: { type: 'string' },
    // Para mirar la agenda de ese día en "¿Puedo cumplir?".
    fecha_del_servicio_iso: { type: 'string' },
    personas: { type: 'integer' },
    // Los formularios que llena el oferente y DÓNDE viene su formato en
    // blanco (Felipe, 18-10: "que cuando la IA analice los documentos
    // identifique dónde están los formularios a rellenar... y deje listo el
    // proceso de generación"). De aquí parte «Generar anexos».
    formularios: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          nombre: { type: 'string' },
          archivo: { type: 'string' },
          paginas: { type: 'string' },
          aplica: { type: 'boolean' },
          por_que_no_aplica: { type: 'string' },
          se_entrega_en: {
            type: 'string',
            enum: ['administrativa', 'tecnica', 'economica', 'otra'],
          },
        },
        required: [
          'nombre',
          'archivo',
          'paginas',
          'aplica',
          'por_que_no_aplica',
          'se_entrega_en',
        ],
        additionalProperties: false,
      },
    },
    // El checklist de documentos (Felipe, 19-10: "me falta el checklist de
    // los documentos... un certificado de DICOM sacado con dos semanas: en
    // ninguna parte sale que tengo que tener ese documento"). Solo
    // documentos, también los de adjudicar y pagar.
    documentos: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          nombre: { type: 'string' },
          parte: {
            type: 'string',
            enum: ['administrativa', 'tecnica', 'economica', 'otra'],
          },
          cuando: {
            type: 'string',
            enum: ['con_la_oferta', 'al_adjudicar', 'al_pagar'],
          },
          obligatorio: { type: 'boolean' },
          condicion: { type: 'string' },
          carpeta: {
            type: 'string',
            enum: [
              'formulario',
              'patente',
              'inicio_actividades',
              'programa_integridad',
              'dj_trabajadores',
              'f30',
              'f30_1',
              'vigencia',
              'resolucion_sanitaria',
              'erut',
              'no_quiebra',
              'tgr',
              'dicom',
              'estatutos',
              'respaldo_experiencia',
              'otro',
            ],
          },
          pagina: { type: 'integer' },
        },
        required: [
          'nombre',
          'parte',
          'cuando',
          'obligatorio',
          'condicion',
          'carpeta',
          'pagina',
        ],
        additionalProperties: false,
      },
    },
  },
  required: [
    'resumen',
    'lugar',
    'se_puede_en_el_complejo',
    'monto',
    'monto_detalle',
    'fechas',
    'criterios',
    'requisitos',
    'garantias',
    'te_dejan_fuera',
    'condiciones',
    'fecha_del_servicio',
    'fecha_del_servicio_iso',
    'personas',
    'formularios',
    'documentos',
  ],
  additionalProperties: false,
} as const;

/** Lo que se sabe de la licitación y de la empresa, para leer con
 *  contexto. */
export type { ContextoDeBases };

/** La razón que queda en la bandeja cuando el color lo pone el análisis
 *  de las bases (decisión 21). null = no cambia la razón. */
export const razonSegunLasBases = (
  lugar: unknown,
  donde: unknown,
): string | null => {
  const texto = typeof donde === 'string' ? donde.trim().slice(0, 300) : '';
  if (lugar === 'si') {
    return texto
      ? `Según las bases, se puede hacer en el complejo: ${texto}`
      : 'Según las bases, se puede hacer en el complejo.';
  }
  if (lugar === 'no') {
    return texto
      ? `Según las bases, exigen otro lugar: ${texto}`
      : 'Según las bases, exigen otro lugar.';
  }
  return null;
};

/** Lo que se le pide al análisis, DESPUÉS de la marca de caché (así no
 *  cambia el prefijo que comparte con «Pregúntale a la IA»). */
export const PEDIDO_DE_ANALISIS: string = [
  'RESPONDE',
  '- resumen: 2 a 4 frases: qué se contrata, para cuántas personas, cuándo y dónde.',
  '- lugar: dónde se presta el servicio según las bases, o "lo propone el oferente".',
  '- se_puede_en_el_complejo: "si" si el servicio se puede prestar en las instalaciones de la empresa o el lugar lo propone el oferente; "no" si exige otro lugar; "dudoso" si no queda claro.',
  '- monto: el presupuesto disponible en pesos, como número entero sin puntos; 0 si las bases no lo dicen. monto_detalle: cómo lo dicen (con o sin IVA, "hasta", por persona); vacío si no lo dicen.',
  '- fechas: las fechas clave (preguntas, respuestas, visita a terreno, cierre de ofertas, apertura, adjudicación, fecha del servicio), cada una tal como la dicen.',
  '- criterios: cada criterio de evaluación con su peso tal como lo dicen ("30%"; vacío si no lo dicen) y cómo se evalúa, en una frase.',
  '- requisitos: TODO lo que hay que presentar o cumplir para no quedar fuera: anexos, formularios, certificados, declaraciones juradas, garantías, experiencia, requisitos técnicos y del servicio. Uno por fila, con su tipo, si es obligatorio, el título del documento donde está y la página (0 si no tiene página, como en un Word).',
  '- garantias: las boletas o pólizas que piden (seriedad de la oferta, fiel cumplimiento), con monto y plazo.',
  '- te_dejan_fuera: lo que deja la oferta fuera de bases o la descalifica, lo más grave primero. MÁXIMO 5, una frase corta cada una (menos de 20 palabras). Puede ser un requisito, si su falta deja fuera (por ejemplo, "Sin los anexos 3, 4 y 5 quedas fuera de bases").',
  '- condiciones: lo demás que conviene saber antes de postular: multas, forma y plazo de pago, subcontratación, cambios de fecha, exigencias raras, contradicciones entre documentos, cambios de una aclaratoria, plazos muy cortos. Una frase corta cada una, de lo más importante a lo menos.',
  '- fecha_del_servicio: cuándo es el evento o el servicio, como lo dicen (por ejemplo "viernes 30 de octubre, 18:00 a 02:00"); vacío si no lo dicen.',
  '- fecha_del_servicio_iso: el primer día del servicio como AAAA-MM-DD (por ejemplo "2026-10-30"); vacío si no lo dicen.',
  '- personas: para cuántas personas es; 0 si no lo dicen.',
  '- formularios: CADA formulario o anexo con formato que el oferente tiene que llenar y presentar (Formulario N°1, Anexo N°2, declaración jurada con formato, oferta económica…). nombre: como lo titula el documento (por ejemplo "Formulario N°1 - Identificación del oferente"). archivo: el nombre EXACTO del documento que te pasé donde viene el formato EN BLANCO, no donde solo se menciona; vacío si las bases lo piden pero su formato no viene en lo que te pasé. paginas: dónde está ese formato en blanco ("16" o "16-17"); vacío si es un Word. aplica: false si no corresponde a esta empresa (por ejemplo, el de Unión Temporal de Proveedores o el de persona natural), con por_que_no_aplica en una frase; si aplica, por_que_no_aplica va vacío. se_entrega_en: en qué parte de la oferta se sube según las bases (administrativa, tecnica, economica u otra).',
  '- documentos: el checklist de TODOS los DOCUMENTOS que hay que entregar, uno por fila: cada formulario o anexo (Formulario N°1, N°2…), certificados, declaraciones juradas, programas (por ejemplo, el de integridad y las declaraciones de los trabajadores), registros, copias que acreditan (órdenes de compra o facturas de la experiencia), garantías, escrituras o estatutos. Incluye también los que piden al adjudicar o para firmar el contrato (por ejemplo, certificado de antecedentes comerciales o DICOM, inscripción en el Registro de Proveedores) y para el pago (F30, certificado de la Inspección del Trabajo). Solo documentos: lo que hay que cumplir u ofrecer (comida, salón, horarios, la vigencia de la oferta, que se firme por el representante legal) NO va aquí. nombre: corto y claro, como lo llaman las bases. parte: dónde se entrega (administrativa, tecnica, economica u otra). cuando: con_la_oferta, al_adjudicar (incluye firmar el contrato) o al_pagar. obligatorio: true si su falta deja fuera de bases o impide adjudicar. condicion: la vigencia o antigüedad que piden («emitido hace menos de 15 días», «vigente»), o vacío. carpeta: formulario (un formulario o anexo de las bases), patente, inicio_actividades, programa_integridad, dj_trabajadores (las declaraciones de los trabajadores), f30 (antecedentes laborales y previsionales), f30_1 (cumplimiento de obligaciones laborales y previsionales; también el certificado de la Inspección del Trabajo de no tener reclamos laborales), vigencia (de la sociedad), resolucion_sanitaria, erut (el e-RUT del SII), no_quiebra (el certificado de no estar en quiebra), tgr (el certificado de deuda fiscal de la Tesorería), dicom (el informe comercial, DICOM o Equifax), estatutos (la escritura de constitución y los estatutos), respaldo_experiencia (órdenes de compra o facturas) u otro. pagina: dónde lo piden (0 si no tiene).',
].join('\n');

/** Las instrucciones completas, como se leen de corrido (pruebas y
 *  documentos): lo común y después el pedido. */
export const instruccionesDeBases = (c: ContextoDeBases): string =>
  `${instruccionesComunes(c)}\n\n${PEDIDO_DE_ANALISIS}`;

@Injectable()
export class AnalisisService {
  private clienteAnthropic: Anthropic | null = null;

  constructor(
    private readonly repo: AnalisisRepository,
    private readonly adjuntos: AdjuntosRepository,
    private readonly oportunidades: OportunidadesRepository,
    private readonly eventia: EventiaRepository,
    private readonly oferente: OferenteRepository,
    private readonly logger: PinoLogger,
    /** El color que pone el análisis (decisión 21). */
    private readonly ficha: FichaRepository,
  ) {
    this.logger.setContext(AnalisisService.name);
  }

  /** El cliente se crea al primer uso; lee ANTHROPIC_API_KEY. Opus con
   *  bases largas tarda: hasta 10 minutos por pedido. */
  protected cliente(): Anthropic {
    if (!this.clienteAnthropic) {
      this.clienteAnthropic = new Anthropic({
        maxRetries: 3,
        timeout: 10 * 60 * 1000,
      });
    }
    return this.clienteAnthropic;
  }

  async ultimo(
    companyId: number,
    oportunidadId: number,
  ): Promise<FilaDeAnalisis | null> {
    await this.repo.abandonarAntesDe(companyId, oportunidadId, ENCENDIDO);
    return this.repo.ultimo(companyId, oportunidadId);
  }

  /** Pide el análisis: responde al tiro con la fila "procesando" y el
   *  análisis sigue por detrás. Si ya había uno en curso, devuelve ese. */
  async pedir(
    companyId: number,
    cuentaId: string,
    oportunidadId: number,
  ): Promise<FilaDeAnalisis> {
    if (!process.env.ANTHROPIC_API_KEY?.trim()) {
      throw new BadRequestException('Falta la llave de Anthropic en el motor.');
    }
    const ficha = await this.oportunidades.ficha(companyId, oportunidadId);
    if (!ficha) throw new NotFoundException('No encontramos esa oportunidad.');

    const archivos = await this.adjuntos.listar(
      companyId,
      oportunidadId,
      'bases',
    );
    const { leibles, noLeidos } = separar(archivos);
    if (leibles.length === 0) {
      throw new BadRequestException(
        archivos.length === 0
          ? 'Sube primero las bases (PDF o Word).'
          : 'Ninguno de los archivos se puede leer: sube las bases en PDF o Word.',
      );
    }
    if (pesoDePdf(leibles) > MAX_BYTES_DE_BASES) {
      throw new BadRequestException(
        'Los PDF pesan más de 40 MB juntos: deja solo las bases y los anexos principales y vuelve a analizar.',
      );
    }

    await this.repo.abandonarAntesDe(companyId, oportunidadId, ENCENDIDO);
    const fila = await this.repo.crear({
      company_id: companyId,
      oportunidad_id: oportunidadId,
      modelo: MODELO_BASES,
      archivos: leibles.map((a) => ({ id: a.id, nombre: a.nombre })),
      no_leidos: noLeidos,
      pedido_por: await this.adjuntos.perfilDe(companyId, cuentaId),
    });
    if (!fila) {
      const enCurso = await this.repo.ultimo(companyId, oportunidadId);
      if (enCurso) return enCurso;
      throw new BadRequestException('Ya hay un análisis en curso.');
    }

    const config = await this.oportunidades.configDe(companyId);
    void this.ejecutar(
      companyId,
      fila.id,
      leibles,
      noLeidos,
      {
        codigo: ficha.codigo,
        nombre: ficha.proceso.nombre,
        organismo: ficha.proceso.organismo,
        comuna: ficha.proceso.comuna,
        perfil: config?.perfil ?? null,
        tipo: ficha.proceso.tipo,
      },
      oportunidadId,
    );
    return fila;
  }

  /** "¿PUEDO CUMPLIR?": cruza las exigencias técnicas de las bases con lo
   *  que la empresa tiene en Eventia (carta, instalaciones y agenda de ese
   *  día), con Sonnet 5.5. Si falla, el análisis igual queda listo y la
   *  falla se anota al lado. */
  async puedoCumplir(
    companyId: number,
    contexto: ContextoDeBases,
    bases: Record<string, unknown>,
  ): Promise<{
    resultado: { cumplimiento?: Cumplimiento; cumplimiento_error?: string };
    entrada: number;
    salida: number;
    costo: number;
  }> {
    const nada = { resultado: {}, entrada: 0, salida: 0, costo: 0 };
    const requisitos = Array.isArray(bases.requisitos)
      ? (bases.requisitos as Array<{
          que: string;
          tipo: string;
          obligatorio: boolean;
        }>)
      : [];
    const tecnicos = requisitos.filter((r) => r.tipo === 'tecnico');
    if (tecnicos.length === 0) return nada;
    try {
      const iso =
        typeof bases.fecha_del_servicio_iso === 'string' &&
        /^\d{4}-\d{2}-\d{2}$/.test(bases.fecha_del_servicio_iso)
          ? bases.fecha_del_servicio_iso
          : null;
      const [carta, oferente, agenda] = await Promise.all([
        this.eventia.carta(companyId),
        this.oferente.oferente(companyId),
        iso ? this.eventia.agendaDelDia(companyId, iso) : Promise.resolve(null),
      ]);
      const respuesta = await this.cliente().messages.parse({
        model: MODELO_SONNET,
        max_tokens: 8000,
        output_config: {
          effort: 'medium',
          format: jsonSchemaOutputFormat(ESQUEMA_DE_CUMPLIMIENTO),
        },
        system: instruccionesDeCumplimiento({
          codigo: contexto.codigo,
          nombre: contexto.nombre,
          organismo: contexto.organismo,
          lugar: typeof bases.lugar === 'string' ? bases.lugar : '',
          tecnicos,
          oferente,
          carta,
          fecha: iso,
          agenda,
        }),
        messages: [
          { role: 'user', content: 'Revisa si la empresa puede cumplir.' },
        ],
      });
      const entrada = respuesta.usage.input_tokens ?? 0;
      const salida = respuesta.usage.output_tokens ?? 0;
      const costo = costoEnDolares(entrada, salida, MODELO_SONNET);
      if (!respuesta.parsed_output) {
        return {
          resultado: {
            cumplimiento_error: 'La IA no pudo revisar si puedes cumplir.',
          },
          entrada,
          salida,
          costo,
        };
      }
      return {
        resultado: {
          cumplimiento: armarCumplimiento(
            respuesta.parsed_output as Parameters<typeof armarCumplimiento>[0],
            tecnicos,
            iso,
          ),
        },
        entrada,
        salida,
        costo,
      };
    } catch (error) {
      this.logger.warn(`¿puedo cumplir?: ${mensajeDe(error)}`);
      return {
        ...nada,
        resultado: {
          cumplimiento_error: errorDeIA(
            error,
            'No se pudo revisar si puedes cumplir',
          ),
        },
      };
    }
  }

  /** Por detrás: baja los archivos, llama a Opus y guarda. Nunca lanza: lo
   *  que falle queda escrito en la fila, en palabras de la casa. */
  async ejecutar(
    companyId: number,
    analisisId: number,
    leibles: Adjunto[],
    noLeidos: NoLeido[],
    contexto: ContextoDeBases,
    /** Para que el color de la oportunidad siga a las bases (decisión 21). */
    oportunidadId?: number,
  ): Promise<void> {
    try {
      // Lo que pasa de 22 MB va por la Files API (decisión 103).
      const { bloques, sinAbrir } = await armarContenido(
        leibles,
        (ruta) => this.repo.descargar(ruta),
        (datos, nombre) => idDelPdf(this.cliente(), datos, nombre),
      );
      const noLeidosFinal = [...noLeidos, ...sinAbrir];
      if (bloques.length === 0) {
        await this.repo.terminar(companyId, analisisId, {
          estado: 'error',
          no_leidos: noLeidosFinal,
          error: 'No se pudo abrir ninguno de los archivos.',
        });
        return;
      }
      const respuesta = await this.cliente().messages.parse({
        model: MODELO_BASES,
        // Opus piensa antes de responder; el tope deja espacio para eso y
        // para un checklist largo.
        max_tokens: 16000,
        output_config: {
          effort: 'medium',
          format: jsonSchemaOutputFormat(ESQUEMA_DE_BASES),
        },
        // El prefijo compartido con «Pregúntale a la IA» (decisión 67):
        // sistema y documentos idénticos, con la marca de caché de 1 hora;
        // el pedido del análisis va después de la marca.
        system: sistemaConCache(contexto),
        messages: [
          {
            role: 'user',
            content: [
              ...prefijoDeDocumentos(bloques),
              {
                type: 'text',
                text: `${PEDIDO_DE_ANALISIS}\n\nAnaliza estas bases.`,
              },
            ],
          },
        ],
      });
      const uso = usoDeLaRespuesta(respuesta.usage);
      // La entrada que se muestra es todo lo que leyó, con la caché adentro.
      const entrada = uso.entrada + uso.cacheEscrita + uso.cacheLeida;
      const salida = uso.salida;
      const costo = costoDelUso(uso, MODELO_BASES, DURACION_DE_LA_CACHE);
      if (!respuesta.parsed_output) {
        await this.repo.terminar(companyId, analisisId, {
          estado: 'error',
          no_leidos: noLeidosFinal,
          tokens_entrada: entrada,
          tokens_salida: salida,
          costo_usd: costo,
          error: `La IA no pudo leer las bases (${respuesta.stop_reason ?? 'sin respuesta'}).`,
        });
        return;
      }
      const bases = respuesta.parsed_output as unknown as Record<
        string,
        unknown
      >;
      const cumplir = await this.puedoCumplir(companyId, contexto, bases);
      await this.repo.terminar(companyId, analisisId, {
        estado: 'listo',
        // Decisión 95: en una compra ágil sin criterios, el de la ley.
        resultado: {
          ...bases,
          criterios: criteriosDeEvaluacion(
            bases.criterios as CriterioDeEvaluacion[] | undefined,
            contexto.tipo,
          ),
          ...cumplir.resultado,
        },
        no_leidos: noLeidosFinal,
        tokens_entrada: entrada + cumplir.entrada,
        tokens_salida: salida + cumplir.salida,
        costo_usd: Math.round((costo + cumplir.costo) * 10_000) / 10_000,
      });
      this.logger.info(
        `análisis ${analisisId} listo: ${entrada} tokens de entrada, ${salida} de salida, US$${costo}; ¿puedo cumplir?: US$${cumplir.costo}`,
      );
      // El color sigue a lo que dicen las bases (Felipe, 17-10: el punto
      // amarillo y "Se puede hacer en el complejo" se contradecían): verde
      // si se puede en el complejo, rojo si exigen otro lugar. Si falla, el
      // análisis igual quedó listo.
      if (oportunidadId) {
        await this.ficha
          .colorSegunLasBases(
            companyId,
            oportunidadId,
            bases.se_puede_en_el_complejo,
            razonSegunLasBases(bases.se_puede_en_el_complejo, bases.lugar),
          )
          .catch((e) =>
            this.logger.warn(
              `análisis ${analisisId}: no pude cambiar el color: ${mensajeDe(e)}`,
            ),
          );
      }
    } catch (error) {
      this.logger.warn(`análisis ${analisisId}: ${mensajeDe(error)}`);
      await this.repo
        .terminar(companyId, analisisId, {
          estado: 'error',
          error: errorDeAnalisis(error),
        })
        .catch((e) =>
          this.logger.error(
            `no pude anotar el error del análisis ${analisisId}: ${mensajeDe(e)}`,
          ),
        );
    }
  }
}
