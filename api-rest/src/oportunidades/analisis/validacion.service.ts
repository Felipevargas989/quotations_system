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
import {
  type Adjunto,
  AdjuntosRepository,
} from '../adjuntos/adjuntos.repository';
import {
  type CampoDelOferente,
  type Oferente,
  OferenteRepository,
} from '../oferente/oferente.repository';
import { OportunidadesRepository } from '../oportunidades.repository';
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
  MAX_BYTES_DE_PDF,
  MODELO_OPUS,
  type NoLeido,
  pesoDePdf,
  separar,
} from './comun';

// VALIDAR DOCUMENTOS (doc 17, sprint 3, paso 3; migración 127). Felipe,
// 17-10: "y lo más importante validar documentos".
//
// Toma el checklist del último análisis de las bases (paso 1) y revisa,
// requisito por requisito, si lo cumple lo que la empresa va a presentar
// ("Mi postulación"), su carpeta de documentos (con el vencimiento contra
// la fecha de cierre) y sus datos (que los anexos digan el mismo RUT y la
// misma razón social). Con Opus 5.5, por detrás, como el análisis.

export const NOMBRES_DE_DOCUMENTO: Readonly<Record<string, string>> = {
  patente: 'Patente municipal',
  inicio_actividades: 'Inicio de actividades (SII)',
  programa_integridad: 'Programa de integridad',
  f30: 'Certificado F30',
  f30_1: 'Certificado F30-1 (cumplimiento de obligaciones laborales)',
  vigencia: 'Certificado de vigencia de la sociedad',
  resolucion_sanitaria: 'Resolución sanitaria',
  dj_trabajadores: 'Declaración jurada de trabajadores',
  erut: 'e-RUT (SII)',
  no_quiebra: 'Certificado de no quiebra',
  estatutos: 'Escritura de constitución y estatutos',
  respaldo_patente: 'Respaldo de la patente (contrato, comodato o dictamen)',
  otro: 'Otro',
};

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
        },
        required: ['que', 'estado', 'donde', 'observacion'],
        additionalProperties: false,
      },
    },
    otros_problemas: { type: 'array', items: { type: 'string' } },
  },
  required: ['resumen', 'listo', 'requisitos', 'otros_problemas'],
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

export type ContextoDeValidacion = {
  codigo: string;
  nombre: string;
  organismo: string | null;
  fecha_cierre: string | null;
  /** AAAA-MM-DD, en Chile. */
  hoy: string;
  oferente: Oferente | null;
  carpeta: Array<{ tipo: string; nombre: string; vence: string | null }>;
  requisitos: Requisito[];
  criterios: Criterio[];
  /** La memoria de la licitación (decisión 68): lo aclarado manda. */
  aclarado?: Aclaracion[];
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
    'LA CARPETA DE DOCUMENTOS DE LA EMPRESA (solo el nombre y el vencimiento, no los archivos):',
    ...(c.carpeta.length > 0
      ? c.carpeta.map(
          (d) =>
            `- ${NOMBRES_DE_DOCUMENTO[d.tipo] ?? d.tipo}: ${d.nombre} (${d.vence ? `vence ${d.vence}` : 'no vence'})`,
        )
      : ['(vacía)']),
    '',
    'Te paso los documentos que la empresa va a presentar. Para CADA requisito del checklist, en el mismo orden y con el mismo texto en "que", decide:',
    '- "cumple": está en los documentos de la postulación (o en la carpeta, si es un certificado) y se ve correcto;',
    '- "falta": no está en ningún lado;',
    '- "vencido": está, pero vence antes del cierre o ya venció;',
    '- "revisar": está pero incompleto, sin firma, con datos que no calzan con los de la empresa, o no se puede saber.',
    // Felipe, 19-10: "déjalo como que siempre estará habilitado... es
    // difícil no tener eso".
    'Estar inscrito o hábil en el Registro de Proveedores (ChileProveedores) es siempre "cumple": la empresa está hábil, se da por hecho y no hay un documento que mirar.',
    'En "donde", el nombre del documento que lo cumple (vacío si falta). En "observacion", una frase: qué está bien o qué hay que hacer.',
    'En "otros_problemas", lo que no es de un requisito: RUT o razón social distintos entre documentos, montos que no calzan con la oferta, fechas que no son las de las bases, anexos de otra licitación.',
    'En "listo": "si" si se puede subir así; "casi" si faltan detalles menores; "no" si falta algo obligatorio.',
    'En "resumen", 1 a 3 frases. Responde en español de Chile, claro y sin jerga. No inventes.',
  ].join('\n');
};

/** El checklist y los criterios del análisis (con la forma que dejó el
 *  esquema de las bases). */
const delAnalisis = (
  a: FilaDeAnalisis,
): { requisitos: Requisito[]; criterios: Criterio[] } => {
  const r = (a.resultado ?? {}) as {
    requisitos?: Requisito[];
    criterios?: Criterio[];
  };
  return { requisitos: r.requisitos ?? [], criterios: r.criterios ?? [] };
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
    const { requisitos, criterios } = delAnalisis(analisis);
    if (requisitos.length === 0) {
      throw new BadRequestException(
        'El análisis de las bases no trae requisitos que revisar.',
      );
    }

    const [archivos, oferente, carpeta, aclarado] = await Promise.all([
      this.adjuntos.listar(companyId, oportunidadId, 'postulacion'),
      this.oferente.oferente(companyId),
      this.oferente.documentos(companyId),
      memoriaDeLaLicitacion(this.preguntas, companyId, oportunidadId, (m) =>
        this.logger.warn(m),
      ),
    ]);
    const { leibles, noLeidos } = separar(archivos);
    if (leibles.length === 0 && carpeta.length === 0) {
      throw new BadRequestException(
        'Sube primero lo que vas a presentar (en "Mi postulación") o los documentos de la empresa (en "Mi empresa").',
      );
    }
    if (pesoDePdf(leibles) > MAX_BYTES_DE_PDF) {
      throw new BadRequestException(
        'Los PDF de la postulación pesan más de 22 MB juntos: deja solo lo principal y vuelve a validar.',
      );
    }

    await this.repo.abandonarAntesDe(companyId, oportunidadId, ENCENDIDO);
    const fila = await this.repo.crear({
      company_id: companyId,
      oportunidad_id: oportunidadId,
      analisis_id: analisis.id,
      modelo: MODELO_OPUS,
      archivos: leibles.map((a) => ({ id: a.id, nombre: a.nombre })),
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
      oferente,
      carpeta: carpeta.map((d) => ({
        tipo: d.tipo,
        nombre: d.nombre,
        vence: d.vence,
      })),
      requisitos,
      criterios,
      aclarado,
    });
    return fila;
  }

  /** Por detrás: baja lo de la postulación, llama a Opus y guarda. Nunca
   *  lanza: lo que falle queda escrito en la fila. */
  async ejecutar(
    companyId: number,
    validacionId: number,
    leibles: Adjunto[],
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
                    ? 'Valida la postulación.'
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
