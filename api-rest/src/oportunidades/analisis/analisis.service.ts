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
import { extensionDe } from '../adjuntos/adjuntos.service';
import { OportunidadesRepository } from '../oportunidades.repository';
import { AnalisisRepository, type FilaDeAnalisis } from './analisis.repository';
import { textoDeDocx } from './docx';

// LA IA LEE LAS BASES (doc 17, sprint 3, paso 1; migración 125). Felipe,
// 17-10: "vamos". Con Opus 5.5, lo decidido para documentos (decisión 6).
//
// El botón "Analizar bases" de la ficha manda las bases y anexos que subió
// la empresa. Opus los lee completos (también las aclaratorias) y devuelve
// el resumen, el checklist de lo que piden con su página, los criterios con
// su peso, las fechas, las garantías y las alertas. Tarda uno a tres
// minutos: corre por detrás y la pantalla pregunta cada pocos segundos.

export const MODELO_BASES = 'claude-opus-5-5';

/** Precio de Opus 5.5 en US$ por token: 4 por millón de entrada, 20 de
 *  salida. */
const US_POR_TOKEN_ENTRADA = 4 / 1_000_000;
const US_POR_TOKEN_SALIDA = 20 / 1_000_000;

/** Los PDF van dentro del pedido, en base64, que los agranda un tercio. El
 *  pedido no puede pasar de 32 MB. */
export const MAX_BYTES_DE_PDF = 22 * 1024 * 1024;

/** Lo que la IA puede leer: PDF directo; Word y texto, como texto. */
const LEIBLES = new Set(['pdf', 'docx', 'txt', 'csv']);

/** Cuándo encendió este motor: un análisis "procesando" de antes murió con
 *  el proceso anterior (un despliegue a la mitad). */
const ENCENDIDO = new Date().toISOString();

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
    alertas: { type: 'array', items: { type: 'string' } },
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
    'alertas',
  ],
  additionalProperties: false,
} as const;

/** Lo que se sabe de la licitación y de la empresa, para leer con
 *  contexto. */
export type ContextoDeBases = {
  codigo: string;
  nombre: string;
  organismo: string | null;
  comuna: string | null;
  perfil: string | null;
};

export const instruccionesDeBases = (c: ContextoDeBases): string =>
  [
    'Lees las bases de una licitación pública de Chile (Mercado Público) para una empresa que evalúa postular.',
    `La licitación es ${c.codigo}, "${c.nombre}"${c.organismo ? `, de ${c.organismo}` : ''}${c.comuna ? ` (${c.comuna})` : ''}.`,
    `La empresa: ${c.perfil?.trim() || '(sin descripción)'}`,
    '',
    'Lee COMPLETOS todos los documentos que te paso (bases, anexos, aclaratorias, decretos). Si una aclaratoria cambia algo, manda la aclaratoria.',
    'Responde en español de Chile, claro y sin jerga. No inventes: si algo no está en los documentos, déjalo vacío.',
    '',
    'RESPONDE',
    '- resumen: 2 a 4 frases: qué se contrata, para cuántas personas, cuándo y dónde.',
    '- lugar: dónde se presta el servicio según las bases, o "lo propone el oferente".',
    '- se_puede_en_el_complejo: "si" si el servicio se puede prestar en las instalaciones de la empresa o el lugar lo propone el oferente; "no" si exige otro lugar; "dudoso" si no queda claro.',
    '- monto: el presupuesto disponible en pesos, como número entero sin puntos; 0 si las bases no lo dicen. monto_detalle: cómo lo dicen (con o sin IVA, "hasta", por persona); vacío si no lo dicen.',
    '- fechas: las fechas clave (preguntas, respuestas, visita a terreno, cierre de ofertas, apertura, adjudicación, fecha del servicio), cada una tal como la dicen.',
    '- criterios: cada criterio de evaluación con su peso tal como lo dicen ("30%"; vacío si no lo dicen) y cómo se evalúa, en una frase.',
    '- requisitos: TODO lo que hay que presentar o cumplir para no quedar fuera: anexos, formularios, certificados, declaraciones juradas, garantías, experiencia, requisitos técnicos y del servicio. Uno por fila, con su tipo, si es obligatorio, el título del documento donde está y la página (0 si no tiene página, como en un Word).',
    '- garantias: las boletas o pólizas que piden (seriedad de la oferta, fiel cumplimiento), con monto y plazo.',
    '- alertas: lo que podría dejar fuera a la empresa o costarle caro: causales de inadmisibilidad, multas, plazos muy cortos, exigencias raras, contradicciones entre documentos, cambios de una aclaratoria.',
  ].join('\n');

/** La falla, en palabras de la casa: es lo que lee Felipe en la ficha. */
export const errorDeAnalisis = (error: unknown): string => {
  const mensaje = mensajeDe(error);
  if (
    error instanceof Anthropic.AuthenticationError ||
    error instanceof Anthropic.PermissionDeniedError
  ) {
    return 'La llave de Anthropic del motor no funciona.';
  }
  if (error instanceof Anthropic.RateLimitError) {
    return 'La cuenta de Anthropic está sin cupo en este momento: vuelve a intentar en unos minutos.';
  }
  if (/credit balance/i.test(mensaje)) {
    return 'Se acabó el saldo de la cuenta de Anthropic.';
  }
  if (/too long|too many pages|maximum.*pages|too large|413/i.test(mensaje)) {
    return 'Las bases son demasiado largas para leerlas de una vez: deja solo las bases y los anexos principales y vuelve a analizar.';
  }
  if (error instanceof Anthropic.APIConnectionTimeoutError) {
    return 'La IA tardó demasiado en responder: vuelve a intentar.';
  }
  return `No se pudieron leer las bases: ${mensaje}`;
};

/** Lo que la IA puede leer y lo que no (ZIP, Excel, imágenes). */
export const separar = (archivos: Adjunto[]) => {
  const leibles: Adjunto[] = [];
  const noLeidos: Array<{ nombre: string; motivo: string }> = [];
  for (const a of archivos) {
    if (LEIBLES.has(extensionDe(a.nombre))) leibles.push(a);
    else {
      noLeidos.push({
        nombre: a.nombre,
        motivo: 'la IA lee PDF y Word; si es un ZIP, sube lo que trae adentro',
      });
    }
  }
  // En el orden en que se subieron: así "el documento" es el que uno ve.
  leibles.sort((a, b) => a.creado_en.localeCompare(b.creado_en));
  return { leibles, noLeidos };
};

@Injectable()
export class AnalisisService {
  private clienteAnthropic: Anthropic | null = null;

  constructor(
    private readonly repo: AnalisisRepository,
    private readonly adjuntos: AdjuntosRepository,
    private readonly oportunidades: OportunidadesRepository,
    private readonly logger: PinoLogger,
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

    const archivos = await this.adjuntos.listar(companyId, oportunidadId);
    const { leibles, noLeidos } = separar(archivos);
    if (leibles.length === 0) {
      throw new BadRequestException(
        archivos.length === 0
          ? 'Sube primero las bases (PDF o Word).'
          : 'Ninguno de los archivos se puede leer: sube las bases en PDF o Word.',
      );
    }
    const pesoDePdf = leibles
      .filter((a) => extensionDe(a.nombre) === 'pdf')
      .reduce((suma, a) => suma + a.bytes, 0);
    if (pesoDePdf > MAX_BYTES_DE_PDF) {
      throw new BadRequestException(
        'Los PDF pesan más de 22 MB juntos: deja solo las bases y los anexos principales y vuelve a analizar.',
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
    void this.ejecutar(companyId, fila.id, leibles, noLeidos, {
      codigo: ficha.codigo,
      nombre: ficha.proceso.nombre,
      organismo: ficha.proceso.organismo,
      comuna: ficha.proceso.comuna,
      perfil: config?.perfil ?? null,
    });
    return fila;
  }

  /** Por detrás: baja los archivos, llama a Opus y guarda. Nunca lanza: lo
   *  que falle queda escrito en la fila, en palabras de la casa. */
  async ejecutar(
    companyId: number,
    analisisId: number,
    leibles: Adjunto[],
    noLeidos: Array<{ nombre: string; motivo: string }>,
    contexto: ContextoDeBases,
  ): Promise<void> {
    try {
      const { bloques, sinAbrir } = await this.armarContenido(leibles);
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
        system: instruccionesDeBases(contexto),
        messages: [
          {
            role: 'user',
            content: [
              ...bloques,
              { type: 'text', text: 'Analiza estas bases.' },
            ],
          },
        ],
      });
      const entrada = respuesta.usage.input_tokens ?? 0;
      const salida = respuesta.usage.output_tokens ?? 0;
      const costo =
        Math.round(
          (entrada * US_POR_TOKEN_ENTRADA + salida * US_POR_TOKEN_SALIDA) *
            10_000,
        ) / 10_000;
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
      await this.repo.terminar(companyId, analisisId, {
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
        `análisis ${analisisId} listo: ${entrada} tokens de entrada, ${salida} de salida, US$${costo}`,
      );
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

  /** Los archivos como los lee Claude: el PDF entero (texto e imagen de
   *  cada página), el Word y el texto como texto. */
  private async armarContenido(leibles: Adjunto[]) {
    const bloques: Anthropic.DocumentBlockParam[] = [];
    const sinAbrir: Array<{ nombre: string; motivo: string }> = [];
    for (const a of leibles) {
      const datos = await this.repo.descargar(a.ruta);
      const ext = extensionDe(a.nombre);
      if (ext === 'pdf') {
        bloques.push({
          type: 'document',
          title: a.nombre,
          source: {
            type: 'base64',
            media_type: 'application/pdf',
            data: datos.toString('base64'),
          },
        });
        continue;
      }
      const texto =
        ext === 'docx' ? textoDeDocx(datos) : datos.toString('utf8');
      if (!texto?.trim()) {
        sinAbrir.push({ nombre: a.nombre, motivo: 'no se pudo abrir' });
        continue;
      }
      bloques.push({
        type: 'document',
        title: a.nombre,
        source: { type: 'text', media_type: 'text/plain', data: texto },
      });
    }
    return { bloques, sinAbrir };
  }
}
