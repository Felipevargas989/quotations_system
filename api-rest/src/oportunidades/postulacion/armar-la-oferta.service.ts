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
import { GenerarRepository } from 'src/quotations/generar/generar.repository';
import type { Adjunto } from '../adjuntos/adjuntos.repository';
import { AdjuntosRepository } from '../adjuntos/adjuntos.repository';
import { AnalisisRepository } from '../analisis/analisis.repository';
import {
  armarContenido,
  costoEnDolares,
  ENCENDIDO,
  errorDeIA,
  MAX_BYTES_DE_PDF,
  MODELO_OPUS,
  type NoLeido,
  separar,
} from '../analisis/comun';
import {
  type FilaDeGeneracion,
  GeneracionRepository,
} from '../generacion/generacion.repository';
import { loQuePidenLasBases } from '../generacion/instrucciones';
import { catalogoParaLaOferta } from '../generacion/oferta-de-la-propuesta';
import { OferenteRepository } from '../oferente/oferente.repository';
import { OportunidadesRepository } from '../oportunidades.repository';
import { memoriaDeLaLicitacion } from '../preguntas/lo-aclarado';
import { PreguntasRepository } from '../preguntas/preguntas.repository';
import {
  ESQUEMA_DE_LA_OFERTA,
  instruccionesDeLaOferta,
  leerArmado,
} from './armar-la-oferta';
import { esGanadaSinCotizacion, noSiEstaCongelada } from './congelada';

// ARMAR LA OFERTA (decisión 33 del doc 17, sprint G, 19-10): un trabajo de
// la IA como los demás (oportunidad_generacion, tipo 'oferta', migración
// 151). Opus decide UNA vez qué se ofrece; la cotización, la propuesta y
// los anexos salen de ahí. Sin taller: no escribe un Word, devuelve la
// oferta con estructura fija, como el análisis de las bases.

export const MODELO_DE_LA_OFERTA = MODELO_OPUS;

@Injectable()
export class ArmarLaOfertaService {
  private clienteAnthropic?: Anthropic;

  constructor(
    private readonly repo: GeneracionRepository,
    private readonly adjuntos: AdjuntosRepository,
    private readonly analisis: AnalisisRepository,
    private readonly oferente: OferenteRepository,
    private readonly oportunidades: OportunidadesRepository,
    private readonly catalogos: GenerarRepository,
    private readonly logger: PinoLogger,
    /** La memoria de la licitación (decisión 68). Opcional: las pruebas de
     *  antes no la traen y sin ella no hay nada aclarado. */
    @Optional() private readonly preguntas?: PreguntasRepository,
  ) {
    this.logger.setContext(ArmarLaOfertaService.name);
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

  async ultimo(
    companyId: number,
    oportunidadId: number,
  ): Promise<FilaDeGeneracion | null> {
    await this.repo.abandonarAntesDe(companyId, oportunidadId, ENCENDIDO);
    return this.repo.ultimoDeTipo(companyId, oportunidadId, 'oferta');
  }

  /** La pide: responde al tiro con la fila "procesando" y la oferta sigue
   *  por detrás. «Armar postulación» (decisión 35) le pasa sus parámetros
   *  y lo que sigue cuando la oferta queda lista (`despues`). */
  async pedir(
    companyId: number,
    cuentaId: string,
    oportunidadId: number,
    encadenar: {
      parametros?: Record<string, unknown>;
      despues?: (ofertaId: number) => Promise<void>;
      /** Para crear la cotización de una ganada que se postuló sin «Armar
       *  postulación» (decisión 104): lo postulado no se toca. */
      paraLaGanada?: boolean;
    } = {},
  ): Promise<FilaDeGeneracion> {
    if (!process.env.ANTHROPIC_API_KEY?.trim()) {
      throw new BadRequestException('Falta la llave de Anthropic en el motor.');
    }
    const ficha = await this.oportunidades.ficha(companyId, oportunidadId);
    if (!ficha) throw new NotFoundException('No encontramos esa oportunidad.');
    if (
      !(
        encadenar.paraLaGanada &&
        esGanadaSinCotizacion(ficha.estado, ficha.quotation_id)
      )
    ) {
      noSiEstaCongelada(ficha.estado);
    }
    const analisis = await this.analisis.ultimo(companyId, oportunidadId);
    const bases =
      analisis?.estado === 'listo'
        ? loQuePidenLasBases(analisis.resultado ?? null)
        : null;
    if (!bases) {
      throw new BadRequestException(
        'Primero analiza las bases: la oferta sale de lo que piden.',
      );
    }

    const { leibles, noLeidos } = separar(
      await this.adjuntos.listar(companyId, oportunidadId, 'bases'),
    );
    const caben: Adjunto[] = [];
    const fuera: NoLeido[] = [...noLeidos];
    let peso = 0;
    for (const a of leibles) {
      if (a.nombre.toLowerCase().endsWith('.pdf')) {
        if (peso + a.bytes > MAX_BYTES_DE_PDF) {
          fuera.push({
            nombre: a.nombre,
            motivo: 'no cupo: pesan más de 22 MB juntos',
          });
          continue;
        }
        peso += a.bytes;
      }
      caben.push(a);
    }
    const [catalogo, oferente, config, aclarado] = await Promise.all([
      catalogoParaLaOferta(this.catalogos, companyId),
      this.oferente.oferente(companyId),
      this.oportunidades.configDe(companyId),
      memoriaDeLaLicitacion(this.preguntas, companyId, oportunidadId, (m) =>
        this.logger.warn(m),
      ),
    ]);

    await this.repo.abandonarAntesDe(companyId, oportunidadId, ENCENDIDO);
    const fila = await this.repo.crearGeneracion({
      company_id: companyId,
      oportunidad_id: oportunidadId,
      tipo: 'oferta',
      parametros: encadenar.parametros ?? {},
      modelo: MODELO_DE_LA_OFERTA,
      archivos: caben.map((a) => ({ id: a.id, nombre: a.nombre })),
      no_leidos: fuera,
      pedido_por: await this.adjuntos.perfilDe(companyId, cuentaId),
    });
    if (!fila) {
      const enCurso = await this.ultimo(companyId, oportunidadId);
      if (enCurso) return enCurso;
      throw new BadRequestException('Ya se está armando la oferta.');
    }
    void this.ejecutar(
      companyId,
      fila.id,
      caben,
      fuera,
      instruccionesDeLaOferta({
        codigo: ficha.codigo,
        nombre: ficha.proceso.nombre,
        organismo: ficha.proceso.organismo,
        // La memoria de la licitación (decisión 68): lo aclarado manda.
        bases: { ...bases, aclarado },
        instalaciones: oferente?.instalaciones ?? null,
        loQueVende: config?.perfil ?? null,
        catalogo,
      }),
    )
      .then((lista) =>
        lista && encadenar.despues ? encadenar.despues(fila.id) : undefined,
      )
      .catch((error) =>
        this.logger.error(
          `oferta ${fila.id}: no se pudo seguir con la postulación: ${mensajeDe(error)}`,
        ),
      );
    return fila;
  }

  /** Por detrás. Nunca lanza: lo que falle queda escrito en la fila.
   *  true = la oferta quedó lista. */
  async ejecutar(
    companyId: number,
    id: number,
    archivos: Adjunto[],
    noLeidos: NoLeido[],
    sistema: string,
  ): Promise<boolean> {
    try {
      const { bloques, sinAbrir } = await armarContenido(archivos, (ruta) =>
        this.repo.descargar(ruta),
      );
      const respuesta = await this.cliente().messages.parse({
        model: MODELO_DE_LA_OFERTA,
        // Opus piensa antes de responder; el tope deja espacio para eso y
        // para una matriz larga.
        max_tokens: 16000,
        output_config: {
          effort: 'medium',
          format: jsonSchemaOutputFormat(ESQUEMA_DE_LA_OFERTA),
        },
        system: sistema,
        messages: [
          {
            role: 'user',
            content: [...bloques, { type: 'text', text: 'Arma la oferta.' }],
          },
        ],
      });
      const entrada = respuesta.usage.input_tokens ?? 0;
      const salida = respuesta.usage.output_tokens ?? 0;
      const costo = costoEnDolares(entrada, salida, MODELO_DE_LA_OFERTA);
      const armado = leerArmado(respuesta.parsed_output);
      await this.repo.terminar(companyId, id, {
        estado: armado ? 'listo' : 'error',
        ...(armado
          ? { resultado: armado as unknown as Record<string, unknown> }
          : {}),
        no_leidos: [...noLeidos, ...sinAbrir],
        tokens_entrada: entrada,
        tokens_salida: salida,
        costo_usd: costo,
        ...(armado
          ? {}
          : {
              error: `La IA no pudo armar la oferta (${respuesta.stop_reason ?? 'sin respuesta'}).`,
            }),
      });
      this.logger.info(
        `oferta ${id}: ${entrada} tokens de entrada, ${salida} de salida, US$${costo}`,
      );
      return Boolean(armado);
    } catch (error) {
      this.logger.warn(`oferta ${id}: ${mensajeDe(error)}`);
      await this.repo
        .terminar(companyId, id, {
          estado: 'error',
          error: errorDeIA(error, 'No se pudo armar la oferta'),
        })
        .catch((e) =>
          this.logger.error(
            `no pude anotar el error de la oferta ${id}: ${mensajeDe(e)}`,
          ),
        );
      return false;
    }
  }
}
