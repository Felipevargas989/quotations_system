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
import { AnalisisRepository } from '../analisis/analisis.repository';
import {
  armarContenido,
  costoEnDolares,
  ENCENDIDO,
  errorDeIA,
  MAX_BYTES_DE_PDF,
  MODELO_OPUS,
  type NoLeido,
} from '../analisis/comun';
import {
  type FilaDeGeneracion,
  GeneracionRepository,
} from '../generacion/generacion.repository';
import { OportunidadesRepository } from '../oportunidades.repository';
import {
  type Aprendizaje,
  ESQUEMA_DE_LO_APRENDIDO,
  instruccionesDelAprendizaje,
  type LoAprendido,
  prediccionEnPalabras,
  TIPOS_DE_DECISION,
  unidadDe,
} from './aprendizajes';
import { AprendizajesRepository } from './aprendizajes.repository';

// «APRENDER DEL ACTA» (decisión 60 del doc 17, 20-10). Felipe: "las que
// vayamos licitando, vamos a ver si ganamos o perdemos, ir revisando las
// actas de adjudicación e ir entrenando la IA para que vaya afinando el
// ojo". La empresa sube el acta de evaluación (sección 'acta', migración
// 155) y Opus 5.5 anota cómo decidió la comisión ante cada falta, omisión o
// duda, y si la comparación de ofertas acertó. Lo aprendido va a la base
// (oportunidades_aprendizajes) que lee la comparación para predecir.

export const MODELO_DEL_APRENDIZAJE = MODELO_OPUS;

const LEIBLES = new Set(['pdf', 'docx', 'txt']);

type Contexto = {
  codigo: string;
  organismo: string | null;
  leer: Adjunto[];
  instrucciones: string;
};

/** Lo que muestra la pestaña: lo que se sabe de esta comisión (su unidad
 *  de compra), cuánto hay en total y el último «Aprender del acta». */
export type EstadoDeLoAprendido = {
  comision: Aprendizaje[];
  total: number;
  trabajo: FilaDeGeneracion | null;
};

@Injectable()
export class AprendizajesService {
  private clienteAnthropic?: Anthropic;

  constructor(
    private readonly repo: AprendizajesRepository,
    private readonly generacion: GeneracionRepository,
    private readonly adjuntos: AdjuntosRepository,
    private readonly oportunidades: OportunidadesRepository,
    private readonly analisis: AnalisisRepository,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(AprendizajesService.name);
  }

  protected cliente(): Anthropic {
    if (!this.clienteAnthropic) {
      this.clienteAnthropic = new Anthropic({
        maxRetries: 3,
        timeout: 10 * 60 * 1000,
      });
    }
    return this.clienteAnthropic;
  }

  async estado(
    companyId: number,
    oportunidadId: number,
  ): Promise<EstadoDeLoAprendido> {
    const ficha = await this.oportunidades.ficha(companyId, oportunidadId);
    if (!ficha) throw new NotFoundException('No encontramos esa oportunidad.');
    await this.generacion.abandonarAntesDe(companyId, oportunidadId, ENCENDIDO);
    const unidad = unidadDe(ficha.codigo);
    const [todo, trabajo] = await Promise.all([
      this.repo.deLaEmpresa(companyId),
      this.generacion.ultimoDeTipo(companyId, oportunidadId, 'aprendizaje'),
    ]);
    return {
      comision: unidad ? todo.filter((a) => a.unidad === unidad) : [],
      total: todo.length,
      trabajo,
    };
  }

  /** Lo pide: responde al tiro con la fila "procesando" y la lectura sigue
   *  por detrás. */
  async pedir(
    companyId: number,
    cuentaId: string,
    oportunidadId: number,
  ): Promise<FilaDeGeneracion> {
    if (!process.env.ANTHROPIC_API_KEY?.trim()) {
      throw new BadRequestException('Falta la llave de Anthropic en el motor.');
    }
    const ficha = await this.oportunidades.ficha(companyId, oportunidadId);
    if (!ficha) throw new NotFoundException('No encontramos esa oportunidad.');
    const [actas, analisis, comparacion] = await Promise.all([
      this.adjuntos.listar(companyId, oportunidadId, 'acta'),
      this.analisis.ultimo(companyId, oportunidadId),
      this.generacion.ultimoDeTipo(companyId, oportunidadId, 'comparacion'),
    ]);
    let peso = 0;
    const leer: Adjunto[] = [];
    const noLeidos: NoLeido[] = [];
    for (const a of [...actas].reverse()) {
      const ext = extensionDe(a.nombre);
      if (!LEIBLES.has(ext)) {
        noLeidos.push({ nombre: a.nombre, motivo: 'la IA lee PDF y Word' });
      } else if (ext === 'pdf' && peso + a.bytes > MAX_BYTES_DE_PDF) {
        noLeidos.push({
          nombre: a.nombre,
          motivo: 'no cupo: los PDF pesan más de 22 MB juntos',
        });
      } else {
        if (ext === 'pdf') peso += a.bytes;
        leer.push(a);
      }
    }
    if (leer.length === 0) {
      throw new BadRequestException(
        'Sube primero el acta de evaluación en PDF o Word (la bajas de Mercado Público, en la adjudicación).',
      );
    }
    const resultado = (
      analisis?.estado === 'listo' ? analisis.resultado : null
    ) as {
      criterios?: Array<{ nombre: string; peso: string }>;
      te_dejan_fuera?: string[];
    } | null;
    const p = ficha.proceso as unknown as Record<string, unknown>;
    const organismo = (p.organismo as string | null) ?? null;

    await this.generacion.abandonarAntesDe(companyId, oportunidadId, ENCENDIDO);
    const fila = await this.generacion.crearGeneracion({
      company_id: companyId,
      oportunidad_id: oportunidadId,
      tipo: 'aprendizaje',
      parametros: { actas: leer.length },
      modelo: MODELO_DEL_APRENDIZAJE,
      archivos: leer.map((a) => ({ id: a.id, nombre: a.nombre })),
      no_leidos: noLeidos,
      pedido_por: await this.adjuntos.perfilDe(companyId, cuentaId),
    });
    if (!fila) {
      const enCurso = await this.generacion.ultimoDeTipo(
        companyId,
        oportunidadId,
        'aprendizaje',
      );
      if (enCurso) return enCurso;
      throw new BadRequestException('Ya hay una lectura del acta en curso.');
    }
    void this.ejecutar(companyId, oportunidadId, fila.id, noLeidos, {
      codigo: ficha.codigo,
      organismo,
      leer,
      instrucciones: instruccionesDelAprendizaje({
        codigo: ficha.codigo,
        nombre: typeof p.nombre === 'string' ? p.nombre : '',
        organismo,
        criterios: Array.isArray(resultado?.criterios)
          ? resultado.criterios
          : [],
        teDejanFuera: resultado?.te_dejan_fuera ?? [],
        prediccion: prediccionEnPalabras(
          comparacion?.estado === 'listo'
            ? (comparacion.resultado as Parameters<
                typeof prediccionEnPalabras
              >[0])
            : null,
        ),
      }),
    });
    return fila;
  }

  /** Por detrás. Nunca lanza: lo que falle queda escrito en la fila. */
  async ejecutar(
    companyId: number,
    oportunidadId: number,
    id: number,
    noLeidos: NoLeido[],
    c: Contexto,
  ): Promise<void> {
    try {
      const { bloques, sinAbrir } = await armarContenido(c.leer, (ruta) =>
        this.generacion.descargar(ruta),
      );
      const respuesta = await this.cliente().messages.parse({
        model: MODELO_DEL_APRENDIZAJE,
        max_tokens: 8000,
        output_config: {
          effort: 'medium',
          format: jsonSchemaOutputFormat(ESQUEMA_DE_LO_APRENDIDO),
        },
        system: c.instrucciones,
        messages: [
          {
            role: 'user',
            content: [
              ...bloques,
              {
                type: 'text',
                text: 'Anota cómo decidió la comisión, según el acta.',
              },
            ],
          },
        ],
      });
      const entrada = respuesta.usage.input_tokens ?? 0;
      const salida = respuesta.usage.output_tokens ?? 0;
      const costo = costoEnDolares(entrada, salida, MODELO_DEL_APRENDIZAJE);
      const ia = respuesta.parsed_output as unknown as LoAprendido | null;
      const filas = (ia?.aprendizajes ?? [])
        .filter(
          (a) =>
            a.situacion?.trim() &&
            a.decision?.trim() &&
            TIPOS_DE_DECISION.includes(a.tipo),
        )
        .map((a) => ({
          codigo: c.codigo,
          unidad: unidadDe(c.codigo),
          organismo: c.organismo,
          situacion: a.situacion.trim(),
          decision: a.decision.trim(),
          tipo: a.tipo,
        }));
      const guardados = ia
        ? await this.repo.reemplazarLosDelActa(
            companyId,
            oportunidadId,
            id,
            filas,
          )
        : 0;
      await this.generacion.terminar(companyId, id, {
        estado: ia ? 'listo' : 'error',
        ...(ia
          ? {
              resultado: { ...ia, guardados } as unknown as Record<
                string,
                unknown
              >,
            }
          : {
              error: `La IA no pudo leer el acta (${respuesta.stop_reason ?? 'sin respuesta'}).`,
            }),
        no_leidos: [...noLeidos, ...sinAbrir],
        tokens_entrada: entrada,
        tokens_salida: salida,
        costo_usd: costo,
      });
      this.logger.info(
        `aprendizaje ${id}: ${guardados} decisiones, ${entrada} tokens de entrada, ${salida} de salida, US$${costo}`,
      );
    } catch (error) {
      this.logger.warn(`aprendizaje ${id}: ${mensajeDe(error)}`);
      await this.generacion
        .terminar(companyId, id, {
          estado: 'error',
          error: errorDeIA(error, 'No se pudo leer el acta'),
        })
        .catch((e) =>
          this.logger.error(
            `no pude anotar el error del aprendizaje ${id}: ${mensajeDe(e)}`,
          ),
        );
    }
  }
}
