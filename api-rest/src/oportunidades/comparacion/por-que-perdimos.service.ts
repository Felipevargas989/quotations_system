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
  costoEnDolares,
  ENCENDIDO,
  errorDeIA,
  MAX_BYTES_DE_PDF,
  MODELO_OPUS,
  type NoLeido,
} from '../analisis/comun';
import { criteriosDeEvaluacion } from '../analisis/criterios-de-evaluacion';
import { resultadoParaLaEmpresa } from '../competencia/resultado-compra-agil';
import { ResultadosRepository } from '../competencia/resultados.repository';
import {
  type FilaDeGeneracion,
  GeneracionRepository,
} from '../generacion/generacion.repository';
import { OferenteRepository } from '../oferente/oferente.repository';
import { OportunidadesRepository } from '../oportunidades.repository';
import { ElSetService } from '../postulacion/el-set.service';
import {
  type ArchivoDeUnaOferta,
  elegirQueLeer,
  encabezadoDeLaOferta,
} from './comparacion';
import { QUE_SE_COMPARA } from './comparacion.service';
import {
  actaEnTexto,
  cotizacionesEnTexto,
  ESQUEMA_DEL_POR_QUE,
  instruccionesDelPorQue,
  type PorQuePerdimos,
} from './por-que-perdimos';

// POR QUÉ PERDIMOS (decisión 97 del doc 17, 27-10). Cuando una postulada
// queda perdida y ya se sabe a quién eligieron (decisión 92), Opus 5.5 lee
// la oferta de la empresa y las de la competencia (subidas o traídas solas,
// decisión 96), con las cotizaciones de una compra ágil o el acta de una
// licitación, y explica por qué se perdió y si era razonable, con los
// criterios de «Cómo te evalúan» (`criteriosDeEvaluacion`, decisión 95). Se
// pide solo en la vuelta de los resultados (dos por pasada) o con el botón.

export const MODELO_DEL_POR_QUE = MODELO_OPUS;
/** Por pasada de la vuelta de los resultados: cuidar lo que se gasta. */
const POR_PASADA = 2;

type Contexto = {
  ofertas: Array<{
    nombre: string;
    es_tuya: boolean;
    leer: ArchivoDeUnaOferta[];
    soloNombre: string[];
  }>;
  instrucciones: string;
};

@Injectable()
export class PorQuePerdimosService {
  private clienteAnthropic?: Anthropic;

  constructor(
    private readonly repo: GeneracionRepository,
    private readonly adjuntos: AdjuntosRepository,
    private readonly oportunidades: OportunidadesRepository,
    private readonly analisis: AnalisisRepository,
    private readonly oferente: OferenteRepository,
    private readonly set: ElSetService,
    private readonly resultados: ResultadosRepository,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(PorQuePerdimosService.name);
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

  async ultima(
    companyId: number,
    oportunidadId: number,
  ): Promise<FilaDeGeneracion | null> {
    await this.repo.abandonarAntesDe(companyId, oportunidadId, ENCENDIDO);
    return this.repo.ultimoDeTipo(companyId, oportunidadId, 'por_que');
  }

  /** La pide: responde al tiro con la fila "procesando" y sigue por
   *  detrás. `cuentaId` null: la pidió la vuelta de los resultados. */
  async pedir(
    companyId: number,
    cuentaId: string | null,
    oportunidadId: number,
  ): Promise<FilaDeGeneracion> {
    if (!process.env.ANTHROPIC_API_KEY?.trim()) {
      throw new BadRequestException('Falta la llave de Anthropic en el motor.');
    }
    const ficha = await this.oportunidades.ficha(companyId, oportunidadId);
    if (!ficha) throw new NotFoundException('No encontramos esa oportunidad.');
    if (ficha.estado !== 'perdida') {
      throw new BadRequestException(
        'El por qué se explica cuando la licitación quedó perdida.',
      );
    }
    const tipo =
      ficha.proceso.tipo === 'compra_agil' ? 'compra_agil' : 'licitacion';
    const [publicos, empresa, analisis, competencia, proceso, comparacion] =
      await Promise.all([
        this.resultados.resultadosDe([ficha.codigo]),
        this.oferente.oferente(companyId),
        this.analisis.ultimo(companyId, oportunidadId),
        this.adjuntos.listar(companyId, oportunidadId, 'competencia'),
        this.resultados.delProceso(ficha.codigo),
        this.repo.ultimoDeTipo(companyId, oportunidadId, 'comparacion'),
      ]);
    const criteriosDelAnalisis = (
      analisis?.estado === 'listo'
        ? (analisis.resultado as { criterios?: unknown } | null)?.criterios
        : null
    ) as Array<{ nombre: string; peso: string; como_se_evalua: string }> | null;
    const criterios = criteriosDeEvaluacion(criteriosDelAnalisis, tipo);
    const resultado = resultadoParaLaEmpresa(
      publicos.get(ficha.codigo),
      empresa?.rut,
      criteriosDelAnalisis,
    );
    if (!resultado || resultado.estado !== 'perdida') {
      throw new BadRequestException(
        'Todavía no se sabe a quién eligieron: el por qué se explica cuando Mercado Público lo publica.',
      );
    }
    if (criterios.length === 0) {
      throw new BadRequestException(
        'Primero analiza las bases: el por qué se explica con sus criterios de evaluación.',
      );
    }
    const cotizaciones = cotizacionesEnTexto(
      (proceso.cotizantes as { proveedores_cotizando?: unknown } | null)
        ?.proveedores_cotizando,
    );
    if (competencia.length === 0 && cotizaciones.length === 0) {
      throw new BadRequestException(
        'Falta la oferta de quien ganó: súbela en «Comparación de ofertas» o espera a que Eventia la traiga.',
      );
    }
    const mias = (await this.set.piezas(companyId, oportunidadId)).filter((p) =>
      QUE_SE_COMPARA.has(p.que_es),
    );
    const porCompetidor = new Map<string, Adjunto[]>();
    for (const a of competencia) {
      const quien = a.competidor?.trim() || 'Sin nombre';
      porCompetidor.set(quien, [...(porCompetidor.get(quien) ?? []), a]);
    }
    const empresaNombre = empresa?.razon_social?.trim() || 'La empresa';
    const elegidas = elegirQueLeer<ArchivoDeUnaOferta & { id?: number }>(
      [
        { nombre: empresaNombre, es_tuya: true, archivos: mias },
        ...[...porCompetidor].map(([nombre, archivos]) => ({
          nombre,
          es_tuya: false,
          archivos,
        })),
      ],
      MAX_BYTES_DE_PDF,
    );
    const noLeidos: NoLeido[] = elegidas.flatMap((o) =>
      o.soloNombre.map((a) => ({
        nombre: `${o.nombre}: ${a.nombre}`,
        motivo: /\.(pdf|docx|txt)$/i.test(a.nombre)
          ? 'no cupo: los PDF pesan más de 22 MB juntos'
          : 'la IA lee PDF y Word',
      })),
    );

    await this.repo.abandonarAntesDe(companyId, oportunidadId, ENCENDIDO);
    const fila = await this.repo.crearGeneracion({
      company_id: companyId,
      oportunidad_id: oportunidadId,
      tipo: 'por_que',
      parametros: {
        ganador: resultado.proveedor,
        monto: resultado.monto,
        mi_monto: resultado.mi_monto,
      },
      modelo: MODELO_DEL_POR_QUE,
      archivos: elegidas.flatMap((o) =>
        o.leer.map((a) => ({
          id: a.id ?? 0,
          nombre: `${o.nombre}: ${a.nombre}`,
        })),
      ),
      no_leidos: noLeidos,
      pedido_por: cuentaId
        ? await this.adjuntos.perfilDe(companyId, cuentaId)
        : null,
    });
    if (!fila) {
      const enCurso = await this.ultima(companyId, oportunidadId);
      if (enCurso) return enCurso;
      throw new BadRequestException('Ya se está explicando por qué perdimos.');
    }
    const p = ficha.proceso as unknown as Record<string, unknown>;
    const prediccion =
      comparacion?.estado === 'listo'
        ? (comparacion.resultado as { resumen?: unknown } | null)?.resumen
        : null;
    void this.ejecutar(companyId, fila.id, noLeidos, {
      ofertas: elegidas.map((o) => ({
        nombre: o.nombre,
        es_tuya: o.es_tuya,
        leer: o.leer,
        soloNombre: o.soloNombre.map((a) => a.nombre),
      })),
      instrucciones: instruccionesDelPorQue({
        codigo: ficha.codigo,
        nombre: typeof p.nombre === 'string' ? p.nombre : '',
        organismo: (p.organismo as string | null) ?? null,
        tipo,
        empresa: empresaNombre,
        criterios,
        resultado,
        cotizaciones,
        acta: actaEnTexto(proceso.acta),
        prediccion: typeof prediccion === 'string' ? prediccion : null,
      }),
    });
    return fila;
  }

  /** Por detrás. Nunca lanza: lo que falle queda escrito en la fila. */
  async ejecutar(
    companyId: number,
    id: number,
    noLeidos: NoLeido[],
    c: Contexto,
  ): Promise<void> {
    try {
      const contenido: Array<
        Anthropic.TextBlockParam | Anthropic.DocumentBlockParam
      > = [];
      const sinAbrir: NoLeido[] = [];
      for (const [i, o] of c.ofertas.entries()) {
        const { bloques, sinAbrir: estos } = await armarContenido(
          o.leer as unknown as Adjunto[],
          (ruta) => this.repo.descargar(ruta),
        );
        contenido.push(
          { type: 'text', text: encabezadoDeLaOferta(i + 1, o, o.soloNombre) },
          ...bloques,
        );
        sinAbrir.push(
          ...estos.map((x) => ({ ...x, nombre: `${o.nombre}: ${x.nombre}` })),
        );
      }
      const respuesta = await this.cliente().messages.parse({
        model: MODELO_DEL_POR_QUE,
        max_tokens: 8000,
        output_config: {
          effort: 'medium',
          format: jsonSchemaOutputFormat(ESQUEMA_DEL_POR_QUE),
        },
        system: c.instrucciones,
        messages: [
          {
            role: 'user',
            content: [
              ...contenido,
              {
                type: 'text',
                text: 'Explica por qué la empresa perdió y si era razonable.',
              },
            ],
          },
        ],
      });
      const entrada = respuesta.usage.input_tokens ?? 0;
      const salida = respuesta.usage.output_tokens ?? 0;
      const costo = costoEnDolares(entrada, salida, MODELO_DEL_POR_QUE);
      const ia = respuesta.parsed_output as unknown as PorQuePerdimos | null;
      await this.repo.terminar(companyId, id, {
        estado: ia ? 'listo' : 'error',
        ...(ia ? { resultado: ia as unknown as Record<string, unknown> } : {}),
        no_leidos: [...noLeidos, ...sinAbrir],
        tokens_entrada: entrada,
        tokens_salida: salida,
        costo_usd: costo,
        ...(ia
          ? {}
          : {
              error: `La IA no pudo explicar por qué se perdió (${respuesta.stop_reason ?? 'sin respuesta'}).`,
            }),
      });
      this.logger.info(
        `por qué ${id}: ${entrada} tokens de entrada, ${salida} de salida, US$${costo}`,
      );
    } catch (error) {
      this.logger.warn(`por qué ${id}: ${mensajeDe(error)}`);
      await this.repo
        .terminar(companyId, id, {
          estado: 'error',
          error: errorDeIA(error, 'No se pudo explicar por qué se perdió'),
        })
        .catch((e) =>
          this.logger.error(
            `no pude anotar el error del por qué ${id}: ${mensajeDe(e)}`,
          ),
        );
    }
  }

  /** La vuelta de los resultados: a las perdidas de los últimos 7 días sin
   *  su por qué, se les pide (dos por pasada). Lo que todavía no se puede
   *  explicar (sin resultado, sin análisis o sin la oferta de quien ganó)
   *  se intenta en la próxima. Devuelve cuántos se pidieron. */
  async revisar(companyId: number, hasta: number): Promise<number> {
    let pedidos = 0;
    for (const p of await this.resultados.perdidasRecientes(companyId)) {
      if (pedidos >= POR_PASADA || Date.now() > hasta) break;
      if (await this.repo.ultimoDeTipo(companyId, p.id, 'por_que')) continue;
      try {
        await this.pedir(companyId, null, p.id);
        pedidos += 1;
      } catch (error) {
        if (!(error instanceof BadRequestException)) throw error;
      }
    }
    return pedidos;
  }
}
