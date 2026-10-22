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
import { AnalisisRepository } from '../analisis/analisis.repository';
import {
  armarContenido,
  type ContextoDeBases,
  costoDelUso,
  DURACION_DE_LA_CACHE,
  ENCENDIDO,
  errorDeIA,
  instruccionesComunes,
  MAX_BYTES_DE_PDF,
  MODELO_OPUS,
  pesoDePdf,
  prefijoDeDocumentos,
  separar,
  sistemaConCache,
  usoDeLaRespuesta,
} from '../analisis/comun';
import { OportunidadesRepository } from '../oportunidades.repository';
import {
  type CitaDeLaIA,
  type FilaDePregunta,
  PreguntasRepository,
  type SeguridadDeRespuesta,
} from './preguntas.repository';

// PREGÚNTALE A LA IA SOBRE ESTAS BASES (doc 17, decisión 67, 22-10).
// Felipe: "no tengo cómo preguntar ni interactuar... la idea es poder
// precisar cosas y que no vuelva a releer todo... propón algo eficiente o
// como lo hace la industria".
//
// Cómo no releer todo: caché de contexto de la API, con el MISMO prefijo
// que el análisis de las bases (`sistemaConCache` y `prefijoDeDocumentos`,
// en comun.ts): las instrucciones comunes y los documentos primero, con la
// marca de caché de 1 hora. El análisis deja las bases guardadas y cada
// pregunta de esa hora las lee de la caché (el 5 % del precio de entrada).
// Después de la marca van las reglas de las preguntas, lo que la IA ya dijo
// en el análisis, el hilo (las preguntas y respuestas anteriores de esta
// oportunidad) y la pregunta nueva. Responde Opus 5.5, el mismo modelo que
// hizo el análisis: en bases legales, precisar es lo que importa.
// Igual que el análisis: la pregunta queda "procesando" y corre por
// detrás; la pantalla pregunta cada pocos segundos.

export const MODELO_PREGUNTAS = MODELO_OPUS;
export const MIN_LARGO_DE_PREGUNTA = 3;
export const MAX_LARGO_DE_PREGUNTA = 600;
/** Cuántas preguntas anteriores (con respuesta) recuerda la nueva. */
export const PREGUNTAS_EN_EL_HILO = 8;
export const MAX_CITAS = 4;

export const ESQUEMA_DE_RESPUESTA = {
  type: 'object',
  properties: {
    respuesta: { type: 'string' },
    citas: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          documento: { type: 'string' },
          pagina: { type: 'integer' },
          texto: { type: 'string' },
        },
        required: ['documento', 'pagina', 'texto'],
        additionalProperties: false,
      },
    },
    seguridad: { type: 'string', enum: ['alta', 'media', 'baja'] },
  },
  required: ['respuesta', 'citas', 'seguridad'],
  additionalProperties: false,
} as const;

/** Las reglas de las preguntas, DESPUÉS de la marca de caché (así el
 *  prefijo es el mismo del análisis). */
export const REGLAS_DE_PREGUNTAS: string = [
  'Ahora te voy a hacer preguntas sobre estos documentos.',
  'Responde SOLO con lo que dicen los documentos. Si no lo dicen, dilo así y sugiere cómo salir de la duda (una consulta en el foro del proceso, o llamar a la unidad compradora). Si los documentos se contradicen, dilo y manda la aclaratoria más nueva.',
  'Puedes razonar con los números de los documentos (presupuesto, cantidades, días) para proponer la lectura más consistente, diciendo que es una deducción.',
  'Máximo 120 palabras. Sin rodeos y sin repetir la pregunta.',
  '',
  'RESPONDE',
  '- respuesta: la respuesta, directa.',
  `- citas: hasta ${MAX_CITAS}, cada una con el documento (el título tal como te lo pasé), la página (0 si no se sabe o es un Word) y el texto citado, corto.`,
  '- seguridad: "alta" si los documentos lo dicen directo; "media" si es una deducción; "baja" si no está en los documentos.',
].join('\n');

/** Las instrucciones completas, como se leen de corrido (pruebas y
 *  documentos): lo común y después las reglas. */
export const instruccionesDePreguntas = (c: ContextoDeBases): string =>
  `${instruccionesComunes(c)}\n\n${REGLAS_DE_PREGUNTAS}`;

/** La falla, en palabras de la casa. */
export const errorDePregunta = (error: unknown): string =>
  errorDeIA(error, 'No se pudo responder');

type ResultadoDeAnalisis = {
  resumen?: unknown;
  lugar?: unknown;
  monto?: unknown;
  monto_detalle?: unknown;
  fechas?: unknown;
  requisitos?: unknown;
  te_dejan_fuera?: unknown;
  condiciones?: unknown;
};

/** Un campo del análisis como texto: solo texto o número; lo demás, nada. */
const texto = (v: unknown): string =>
  typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '';

/** Lo que la IA ya dijo de estas bases, en texto corto: para que no se
 *  contradiga sin razón y para que la respuesta hable del mismo checklist
 *  que ve la persona. null si no hay análisis listo. */
export const analisisComoTexto = (
  resultado: Record<string, unknown> | null,
): string | null => {
  if (!resultado) return null;
  const r = resultado as ResultadoDeAnalisis;
  const partes: string[] = [];
  if (typeof r.resumen === 'string' && r.resumen.trim()) {
    partes.push(`Resumen: ${r.resumen.trim()}`);
  }
  if (typeof r.lugar === 'string' && r.lugar.trim()) {
    partes.push(`Lugar: ${r.lugar.trim()}`);
  }
  if (typeof r.monto === 'number' && r.monto > 0) {
    const detalle =
      typeof r.monto_detalle === 'string' && r.monto_detalle.trim()
        ? ` (${r.monto_detalle.trim()})`
        : '';
    partes.push(`Monto: ${r.monto}${detalle}`);
  }
  const lista = (
    titulo: string,
    valor: unknown,
    linea: (x: Record<string, unknown>) => string,
  ) => {
    if (!Array.isArray(valor) || valor.length === 0) return;
    const lineas = valor
      .slice(0, 40)
      .map((x) =>
        typeof x === 'string' ? x : linea((x ?? {}) as Record<string, unknown>),
      )
      .filter((l) => l.trim())
      .map((l) => `- ${l}`);
    if (lineas.length) partes.push(`${titulo}:\n${lineas.join('\n')}`);
  };
  lista('Fechas', r.fechas, (x) => `${texto(x.que)}: ${texto(x.cuando)}`);
  lista(
    'Requisitos',
    r.requisitos,
    (x) =>
      `${texto(x.que)} (${texto(x.documento)}, pág. ${texto(x.pagina) || '0'})`,
  );
  lista('Lo que deja fuera', r.te_dejan_fuera, (x) => texto(x.que));
  lista('Condiciones', r.condiciones, (x) => texto(x.que));
  return partes.length ? partes.join('\n\n').slice(0, 12_000) : null;
};

/** Las citas como las guarda la casa: solo con documento, hasta MAX_CITAS,
 *  página 0 si no se sabe, texto corto. */
export const citasValidas = (citas: unknown): CitaDeLaIA[] => {
  if (!Array.isArray(citas)) return [];
  const validas: CitaDeLaIA[] = [];
  for (const c of citas) {
    if (!c || typeof c !== 'object') continue;
    const cita = c as Record<string, unknown>;
    const documento =
      typeof cita.documento === 'string' ? cita.documento.trim() : '';
    if (!documento) continue;
    const pagina =
      typeof cita.pagina === 'number' &&
      Number.isInteger(cita.pagina) &&
      cita.pagina > 0
        ? cita.pagina
        : 0;
    const texto = typeof cita.texto === 'string' ? cita.texto.trim() : '';
    validas.push({
      documento: documento.slice(0, 200),
      pagina,
      texto: texto.slice(0, 300),
    });
    if (validas.length === MAX_CITAS) break;
  }
  return validas;
};

/** Los mensajes del pedido: el prefijo compartido con el análisis
 *  (documentos + marca de caché), después las reglas con lo que la IA ya
 *  dijo, el hilo y la pregunta nueva. Lo de antes de la marca es lo que la
 *  API guarda una hora. */
export const armarMensajes = (
  bloques: Anthropic.DocumentBlockParam[],
  analisisPrevio: string | null,
  anteriores: Array<{ pregunta: string; respuesta: string | null }>,
  pregunta: string,
): Anthropic.MessageParam[] => {
  const reglas = analisisPrevio
    ? `${REGLAS_DE_PREGUNTAS}\n\nANÁLISIS PREVIO DE LA IA sobre estos documentos (puede tener errores; mandan los documentos):\n${analisisPrevio}`
    : REGLAS_DE_PREGUNTAS;
  const mensajes: Anthropic.MessageParam[] = [
    { role: 'user', content: prefijoDeDocumentos(bloques) },
    { role: 'assistant', content: 'Leídos.' },
    { role: 'user', content: reglas },
    { role: 'assistant', content: 'Entendido. Pregunta cuando quieras.' },
  ];
  for (const a of anteriores) {
    if (!a.respuesta?.trim()) continue;
    mensajes.push(
      { role: 'user', content: a.pregunta },
      { role: 'assistant', content: a.respuesta },
    );
  }
  mensajes.push({ role: 'user', content: pregunta });
  return mensajes;
};

@Injectable()
export class PreguntasService {
  private clienteAnthropic: Anthropic | null = null;

  constructor(
    private readonly repo: PreguntasRepository,
    /** Los archivos del balde y el último análisis, por su repositorio. */
    private readonly analisis: AnalisisRepository,
    private readonly adjuntos: AdjuntosRepository,
    private readonly oportunidades: OportunidadesRepository,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(PreguntasService.name);
  }

  /** El cliente se crea al primer uso; lee ANTHROPIC_API_KEY. Una
   *  pregunta con las bases en caché tarda segundos; sin caché, lo que
   *  tarde leerlas. */
  protected cliente(): Anthropic {
    if (!this.clienteAnthropic) {
      this.clienteAnthropic = new Anthropic({
        maxRetries: 3,
        timeout: 5 * 60 * 1000,
      });
    }
    return this.clienteAnthropic;
  }

  async listar(
    companyId: number,
    oportunidadId: number,
  ): Promise<FilaDePregunta[]> {
    await this.repo.abandonarAntesDe(companyId, oportunidadId, ENCENDIDO);
    return this.repo.listar(companyId, oportunidadId);
  }

  /** Una pregunta nueva: responde al tiro con la fila "procesando" y la
   *  respuesta sigue por detrás. Una a la vez por oportunidad. */
  async preguntar(
    companyId: number,
    cuentaId: string,
    oportunidadId: number,
    preguntaCruda: string,
  ): Promise<FilaDePregunta> {
    if (!process.env.ANTHROPIC_API_KEY?.trim()) {
      throw new BadRequestException('Falta la llave de Anthropic en el motor.');
    }
    const pregunta = preguntaCruda.trim().replace(/\s+/g, ' ');
    if (pregunta.length < MIN_LARGO_DE_PREGUNTA) {
      throw new BadRequestException('Escribe la pregunta primero.');
    }
    if (pregunta.length > MAX_LARGO_DE_PREGUNTA) {
      throw new BadRequestException(
        `La pregunta no puede pasar de ${MAX_LARGO_DE_PREGUNTA} letras.`,
      );
    }
    const ficha = await this.oportunidades.ficha(companyId, oportunidadId);
    if (!ficha) throw new NotFoundException('No encontramos esa oportunidad.');

    const archivos = await this.adjuntos.listar(
      companyId,
      oportunidadId,
      'bases',
    );
    const { leibles } = separar(archivos);
    if (leibles.length === 0) {
      throw new BadRequestException(
        archivos.length === 0
          ? 'Sube primero las bases (PDF o Word).'
          : 'Ninguno de los archivos se puede leer: sube las bases en PDF o Word.',
      );
    }
    if (pesoDePdf(leibles) > MAX_BYTES_DE_PDF) {
      throw new BadRequestException(
        'Los PDF pesan más de 22 MB juntos: deja solo las bases y los anexos principales.',
      );
    }

    await this.repo.abandonarAntesDe(companyId, oportunidadId, ENCENDIDO);
    const fila = await this.repo.crear({
      company_id: companyId,
      oportunidad_id: oportunidadId,
      pregunta,
      modelo: MODELO_PREGUNTAS,
      preguntado_por: await this.adjuntos.perfilDe(companyId, cuentaId),
    });
    if (!fila) {
      throw new BadRequestException(
        'Espera la respuesta anterior antes de preguntar de nuevo.',
      );
    }

    const config = await this.oportunidades.configDe(companyId);
    void this.ejecutar(
      companyId,
      fila.id,
      oportunidadId,
      leibles,
      {
        codigo: ficha.codigo,
        nombre: ficha.proceso.nombre,
        organismo: ficha.proceso.organismo,
        comuna: ficha.proceso.comuna,
        perfil: config?.perfil ?? null,
      },
      pregunta,
    );
    return fila;
  }

  /** Por detrás: arma los documentos, el análisis previo y el hilo, le
   *  pregunta a Opus y guarda. Nunca lanza: lo que falle queda escrito en
   *  la fila, en palabras de la casa. */
  async ejecutar(
    companyId: number,
    preguntaId: number,
    oportunidadId: number,
    leibles: Adjunto[],
    contexto: ContextoDeBases,
    pregunta: string,
  ): Promise<void> {
    try {
      const { bloques } = await armarContenido(leibles, (ruta) =>
        this.analisis.descargar(ruta),
      );
      if (bloques.length === 0) {
        await this.repo.terminar(companyId, preguntaId, {
          estado: 'error',
          error: 'No se pudo abrir ninguno de los archivos.',
        });
        return;
      }
      const [ultimoAnalisis, hilo] = await Promise.all([
        this.analisis.ultimo(companyId, oportunidadId),
        this.repo.listar(companyId, oportunidadId),
      ]);
      const previo = analisisComoTexto(
        ultimoAnalisis?.estado === 'listo' ? ultimoAnalisis.resultado : null,
      );
      const anteriores = hilo
        .filter((p) => p.id !== preguntaId && p.estado === 'listo')
        .slice(-PREGUNTAS_EN_EL_HILO);

      const respuesta = await this.cliente().messages.parse({
        model: MODELO_PREGUNTAS,
        max_tokens: 3000,
        output_config: {
          effort: 'medium',
          format: jsonSchemaOutputFormat(ESQUEMA_DE_RESPUESTA),
        },
        system: sistemaConCache(contexto),
        messages: armarMensajes(bloques, previo, anteriores, pregunta),
      });
      const uso = usoDeLaRespuesta(respuesta.usage);
      const costo = costoDelUso(uso, MODELO_PREGUNTAS, DURACION_DE_LA_CACHE);
      const tokens = {
        tokens_entrada: uso.entrada,
        tokens_salida: uso.salida,
        tokens_cache_escrita: uso.cacheEscrita,
        tokens_cache_leida: uso.cacheLeida,
        costo_usd: costo,
      };
      if (!respuesta.parsed_output) {
        await this.repo.terminar(companyId, preguntaId, {
          estado: 'error',
          error: `La IA no respondió (${respuesta.stop_reason ?? 'sin respuesta'}).`,
          ...tokens,
        });
        return;
      }
      const salida = respuesta.parsed_output as unknown as {
        respuesta: string;
        citas: unknown;
        seguridad: SeguridadDeRespuesta;
      };
      await this.repo.terminar(companyId, preguntaId, {
        estado: 'listo',
        respuesta: salida.respuesta.trim(),
        citas: citasValidas(salida.citas),
        seguridad: salida.seguridad,
        ...tokens,
      });
      this.logger.info(
        `pregunta ${preguntaId} lista: ${uso.entrada} tokens de entrada, ${uso.cacheLeida} leídos de la caché, ${uso.cacheEscrita} escritos, ${uso.salida} de salida, US$${costo}`,
      );
    } catch (error) {
      this.logger.warn(`pregunta ${preguntaId}: ${mensajeDe(error)}`);
      await this.repo
        .terminar(companyId, preguntaId, {
          estado: 'error',
          error: errorDePregunta(error),
        })
        .catch((e) =>
          this.logger.error(
            `no pude anotar el error de la pregunta ${preguntaId}: ${mensajeDe(e)}`,
          ),
        );
    }
  }
}
