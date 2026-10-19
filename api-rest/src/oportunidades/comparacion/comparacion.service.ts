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
import {
  type FilaDeGeneracion,
  GeneracionRepository,
} from '../generacion/generacion.repository';
import { OferenteRepository } from '../oferente/oferente.repository';
import { OportunidadesRepository } from '../oportunidades.repository';
import { ElSetService } from '../postulacion/el-set.service';
import {
  type ArchivoDeUnaOferta,
  type ComparacionDeLaIA,
  conPuntajes,
  type CriterioDeLasBases,
  elegirQueLeer,
  encabezadoDeLaOferta,
  ESQUEMA_DE_LA_COMPARACION,
  instruccionesDeLaComparacion,
} from './comparacion';

// LA COMPARACIÓN DE OFERTAS (decisión 41 del doc 17, 19-10): la oferta de
// la empresa (lo que va a presentar, las piezas del set para Mercado
// Público) contra las de la competencia que bajó del cuadro de ofertas y
// subió a la pestaña «Comparación» (sección 'competencia', migración 153).
// Opus 5.5 pone la nota de cada criterio; el motor calcula los puntajes con
// los pesos de las bases (`conPuntajes`).

export const MODELO_DE_LA_COMPARACION = MODELO_OPUS;

/** Lo de la empresa que se compara: lo que va a presentar, sin sus
 *  respaldos de experiencia (el anexo de experiencia ya los nombra). */
const QUE_SE_COMPARA = new Set([
  'formulario',
  'propuesta',
  'subido',
  'documento',
]);

type Contexto = {
  ofertas: Array<{
    nombre: string;
    es_tuya: boolean;
    leer: ArchivoDeUnaOferta[];
    soloNombre: string[];
  }>;
  criterios: CriterioDeLasBases[];
  instrucciones: string;
};

@Injectable()
export class ComparacionService {
  private clienteAnthropic?: Anthropic;

  constructor(
    private readonly repo: GeneracionRepository,
    private readonly adjuntos: AdjuntosRepository,
    private readonly oportunidades: OportunidadesRepository,
    private readonly analisis: AnalisisRepository,
    private readonly oferente: OferenteRepository,
    private readonly set: ElSetService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(ComparacionService.name);
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
    return this.repo.ultimoDeTipo(companyId, oportunidadId, 'comparacion');
  }

  /** La pide: responde al tiro con la fila "procesando" y la comparación
   *  sigue por detrás. */
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
    const [analisis, competencia, empresa, oferta] = await Promise.all([
      this.analisis.ultimo(companyId, oportunidadId),
      this.adjuntos.listar(companyId, oportunidadId, 'competencia'),
      this.oferente.oferente(companyId),
      this.repo.ultimoDeTipo(companyId, oportunidadId, 'oferta'),
    ]);
    const resultado = (
      analisis?.estado === 'listo' ? analisis.resultado : null
    ) as {
      criterios?: CriterioDeLasBases[];
      te_dejan_fuera?: string[];
      requisitos?: Array<{ que: string; obligatorio: boolean }>;
      monto_detalle?: string;
    } | null;
    if (!resultado) {
      throw new BadRequestException(
        'Primero analiza las bases: la comparación usa sus criterios de evaluación.',
      );
    }
    const criterios = Array.isArray(resultado.criterios)
      ? resultado.criterios
      : [];
    if (criterios.length === 0) {
      throw new BadRequestException(
        'El análisis de las bases no trae criterios de evaluación: vuelve a analizar las bases.',
      );
    }
    if (competencia.length === 0) {
      throw new BadRequestException(
        'Sube primero la oferta de al menos un competidor (la bajas del cuadro de ofertas de Mercado Público).',
      );
    }
    const mias = (await this.set.piezas(companyId, oportunidadId)).filter((p) =>
      QUE_SE_COMPARA.has(p.que_es),
    );
    if (mias.length === 0) {
      throw new BadRequestException(
        'Tu postulación está vacía: arma la postulación o sube a «Mi postulación» lo que presentaste.',
      );
    }

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
      tipo: 'comparacion',
      parametros: {
        oferentes: elegidas.map((o) => ({
          nombre: o.nombre,
          es_tuya: o.es_tuya,
          archivos: o.archivos.length,
        })),
      },
      modelo: MODELO_DE_LA_COMPARACION,
      archivos: elegidas.flatMap((o) =>
        o.leer.map((a) => ({
          id: a.id ?? 0,
          nombre: `${o.nombre}: ${a.nombre}`,
        })),
      ),
      no_leidos: noLeidos,
      pedido_por: await this.adjuntos.perfilDe(companyId, cuentaId),
    });
    if (!fila) {
      const enCurso = await this.ultima(companyId, oportunidadId);
      if (enCurso) return enCurso;
      throw new BadRequestException('Ya hay una comparación en curso.');
    }
    const p = ficha.proceso as unknown as Record<string, unknown>;
    const precioPostulado = Number(
      (oferta?.parametros?.postulacion as { total?: unknown } | undefined)
        ?.total,
    );
    void this.ejecutar(companyId, fila.id, noLeidos, {
      ofertas: elegidas.map((o) => ({
        nombre: o.nombre,
        es_tuya: o.es_tuya,
        leer: o.leer,
        soloNombre: o.soloNombre.map((a) => a.nombre),
      })),
      criterios,
      instrucciones: instruccionesDeLaComparacion({
        codigo: ficha.codigo,
        nombre: String(p.nombre ?? ''),
        organismo: (p.organismo as string | null) ?? null,
        presupuesto:
          resultado.monto_detalle?.trim() ||
          (p.monto ? `$${Number(p.monto).toLocaleString('es-CL')}` : null),
        empresa: empresaNombre,
        precioPostulado:
          Number.isFinite(precioPostulado) && precioPostulado > 0
            ? precioPostulado
            : null,
        criterios,
        teDejanFuera: resultado.te_dejan_fuera ?? [],
        obligatorios: (resultado.requisitos ?? [])
          .filter((r) => r.obligatorio)
          .map((r) => r.que),
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
          {
            type: 'text',
            text: encabezadoDeLaOferta(i + 1, o, o.soloNombre),
          },
          ...bloques,
        );
        sinAbrir.push(
          ...estos.map((x) => ({ ...x, nombre: `${o.nombre}: ${x.nombre}` })),
        );
      }
      const respuesta = await this.cliente().messages.parse({
        model: MODELO_DE_LA_COMPARACION,
        max_tokens: 16000,
        output_config: {
          effort: 'medium',
          format: jsonSchemaOutputFormat(ESQUEMA_DE_LA_COMPARACION),
        },
        system: c.instrucciones,
        messages: [
          {
            role: 'user',
            content: [
              ...contenido,
              {
                type: 'text',
                text: 'Compara las ofertas con los criterios de evaluación.',
              },
            ],
          },
        ],
      });
      const entrada = respuesta.usage.input_tokens ?? 0;
      const salida = respuesta.usage.output_tokens ?? 0;
      const costo = costoEnDolares(entrada, salida, MODELO_DE_LA_COMPARACION);
      const ia = respuesta.parsed_output as unknown as ComparacionDeLaIA | null;
      await this.repo.terminar(companyId, id, {
        estado: ia ? 'listo' : 'error',
        ...(ia
          ? {
              resultado: conPuntajes(ia, c.criterios) as unknown as Record<
                string,
                unknown
              >,
            }
          : {}),
        no_leidos: [...noLeidos, ...sinAbrir],
        tokens_entrada: entrada,
        tokens_salida: salida,
        costo_usd: costo,
        ...(ia
          ? {}
          : {
              error: `La IA no pudo comparar las ofertas (${respuesta.stop_reason ?? 'sin respuesta'}).`,
            }),
      });
      this.logger.info(
        `comparación ${id}: ${entrada} tokens de entrada, ${salida} de salida, US$${costo}`,
      );
    } catch (error) {
      this.logger.warn(`comparación ${id}: ${mensajeDe(error)}`);
      await this.repo
        .terminar(companyId, id, {
          estado: 'error',
          error: errorDeIA(error, 'No se pudieron comparar las ofertas'),
        })
        .catch((e) =>
          this.logger.error(
            `no pude anotar el error de la comparación ${id}: ${mensajeDe(e)}`,
          ),
        );
    }
  }
}
