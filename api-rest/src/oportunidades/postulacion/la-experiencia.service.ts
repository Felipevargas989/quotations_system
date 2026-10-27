import Anthropic from '@anthropic-ai/sdk';
import { jsonSchemaOutputFormat } from '@anthropic-ai/sdk/helpers/json-schema';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { mensajeDe } from 'src/logging/mensaje-de-error';
import type { User } from 'src/users/entities/user.entity';
import { AdjuntosRepository } from '../adjuntos/adjuntos.repository';
import { AnalisisRepository } from '../analisis/analisis.repository';
import {
  costoEnDolares,
  ENCENDIDO,
  errorDeIA,
  hoyEnChile,
  MODELO_SONNET,
} from '../analisis/comun';
import { EventiaRepository } from '../eventia/eventia.repository';
import {
  type FilaDeGeneracion,
  GeneracionRepository,
} from '../generacion/generacion.repository';
import { OferenteRepository } from '../oferente/oferente.repository';
import { RespaldosDePostVentaService } from '../oferente/respaldos-de-post-venta.service';
import { OportunidadesRepository } from '../oportunidades.repository';
import { noSiEstaCongelada } from './congelada';
import {
  type Candidata,
  candidatasDeEventia,
  candidatasDeMiEmpresa,
  confirmadaDelTrabajo,
  type EleccionDeExperiencia,
  ESQUEMA_DE_LA_EXPERIENCIA,
  type ExperienciaConfirmada,
  instruccionesDeLaExperiencia,
  leerEleccion,
  pidenExperiencia,
  sePuedeMostrar,
  textoDeLaCandidata,
  textoDeLasBases,
} from './la-experiencia';

// LA EXPERIENCIA QUE SE PRESENTA (decisión 76 del doc 17, 24-10): antes de
// armar, la IA propone la experiencia según las bases, de las dos fuentes
// (primero las órdenes de compra de Mercado Público de «Mi empresa»,
// después los eventos de Eventia que se pueden mostrar), y la empresa
// confirma cuáles van o pide otras. Desde la decisión 86 (27-10) ya no se
// confirma a mano: «Armar postulación» la pide y la confirma sola
// (`paraArmar`) cuando las bases piden experiencia. Las reglas, en
// la-experiencia.ts. Sonnet 5.5: elige entre lo que hay, no decide la
// postulación.

export const MODELO_DE_LA_EXPERIENCIA = MODELO_SONNET;

/** Cuánto se espera una propuesta en curso al armar: cada 5 segundos,
 *  hasta 5 minutos. */
const ESPERA_MS = 5_000;
const ESPERAS = 60;

/** Lo que ve la ficha: si las bases piden experiencia y el último trabajo
 *  (la propuesta y, si la hay, la confirmación). */
export type EstadoDeLaExperiencia = {
  piden: boolean;
  trabajo: FilaDeGeneracion | null;
};

@Injectable()
export class LaExperienciaService {
  private clienteAnthropic?: Anthropic;

  constructor(
    private readonly repo: GeneracionRepository,
    private readonly analisis: AnalisisRepository,
    private readonly oferente: OferenteRepository,
    private readonly eventia: EventiaRepository,
    private readonly postVenta: RespaldosDePostVentaService,
    private readonly oportunidades: OportunidadesRepository,
    private readonly adjuntos: AdjuntosRepository,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(LaExperienciaService.name);
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

  private async ultimo(
    companyId: number,
    oportunidadId: number,
  ): Promise<FilaDeGeneracion | null> {
    await this.repo.abandonarAntesDe(companyId, oportunidadId, ENCENDIDO);
    return this.repo.ultimoDeTipo(companyId, oportunidadId, 'experiencia');
  }

  async estado(
    companyId: number,
    oportunidadId: number,
  ): Promise<EstadoDeLaExperiencia> {
    const [analisis, trabajo] = await Promise.all([
      this.analisis.ultimo(companyId, oportunidadId),
      this.ultimo(companyId, oportunidadId),
    ]);
    return {
      piden:
        analisis?.estado === 'listo' && pidenExperiencia(analisis.resultado),
      trabajo,
    };
  }

  /** La que confirmó la empresa, para armar (null = todavía no). */
  async confirmada(
    companyId: number,
    oportunidadId: number,
  ): Promise<ExperienciaConfirmada | null> {
    return confirmadaDelTrabajo(
      await this.repo.ultimoDeTipo(companyId, oportunidadId, 'experiencia'),
      companyId,
    );
  }

  /** «Armar postulación» ya no espera que la empresa confirme (decisión
   *  86, 27-10). Felipe: "no todas las licitaciones piden experiencia y si
   *  las piden solo mostraría abajo un aviso en caso de que la IA no
   *  encuentre en mi empresa o Eventia experiencia suficiente". La
   *  confirmada, si hay; si no, la última propuesta, confirmada tal cual y
   *  marcada automática; si no hay ninguna, la pide ahora y la espera.
   *  Nunca lanza: sin experiencia se arma igual y la pantalla avisa. */
  async paraArmar(
    user: User,
    oportunidadId: number,
  ): Promise<ExperienciaConfirmada | null> {
    const companyId = user.company_id;
    try {
      const ya = await this.confirmada(companyId, oportunidadId);
      if (ya) return ya;
      const ultima = await this.ultimo(companyId, oportunidadId);
      if (ultima?.estado !== 'listo' && ultima?.estado !== 'procesando') {
        await this.proponer(user, oportunidadId, []);
      }
      const fila = await this.esperar(companyId, oportunidadId);
      if (fila?.estado !== 'listo') return null;
      await this.confirmar(user, oportunidadId, [], true);
      return await this.confirmada(companyId, oportunidadId);
    } catch (error) {
      this.logger.warn(
        `la experiencia para armar la ${oportunidadId}: ${mensajeDe(error)}`,
      );
      return null;
    }
  }

  /** La última propuesta cuando deja de estar «procesando». */
  private async esperar(
    companyId: number,
    oportunidadId: number,
  ): Promise<FilaDeGeneracion | null> {
    for (let vez = 0; vez < ESPERAS; vez++) {
      const fila = await this.ultimo(companyId, oportunidadId);
      if (fila?.estado !== 'procesando') return fila;
      await new Promise((sigue) => setTimeout(sigue, ESPERA_MS));
    }
    return null;
  }

  private async noSiEstaPostulada(
    companyId: number,
    oportunidadId: number,
  ): Promise<void> {
    const ficha = await this.oportunidades.ficha(companyId, oportunidadId);
    if (!ficha) throw new NotFoundException('No encontramos esa oportunidad.');
    noSiEstaCongelada((ficha as { estado?: string | null }).estado);
  }

  /** Pide la propuesta: responde al tiro con la fila "procesando" y la IA
   *  sigue por detrás. `excluir`: las que la empresa ya dijo que no
   *  («Buscar otras»). */
  async proponer(
    user: User,
    oportunidadId: number,
    excluir: readonly string[],
  ): Promise<FilaDeGeneracion> {
    if (!process.env.ANTHROPIC_API_KEY?.trim()) {
      throw new BadRequestException('Falta la llave de Anthropic en el motor.');
    }
    const companyId = user.company_id;
    await this.noSiEstaPostulada(companyId, oportunidadId);
    const analisis = await this.analisis.ultimo(companyId, oportunidadId);
    if (analisis?.estado !== 'listo') {
      throw new BadRequestException(
        'Primero analiza las bases («Bases y criterios»): la experiencia sale de lo que piden.',
      );
    }
    await this.repo.abandonarAntesDe(companyId, oportunidadId, ENCENDIDO);
    const fila = await this.repo.crearGeneracion({
      company_id: companyId,
      oportunidad_id: oportunidadId,
      tipo: 'experiencia',
      parametros: excluir.length > 0 ? { excluir: [...excluir] } : {},
      modelo: MODELO_DE_LA_EXPERIENCIA,
      archivos: [],
      no_leidos: [],
      pedido_por: await this.adjuntos.perfilDe(companyId, user.id),
    });
    if (!fila) {
      const enCurso = await this.ultimo(companyId, oportunidadId);
      if (enCurso) return enCurso;
      throw new BadRequestException('Ya estoy eligiendo la experiencia.');
    }
    void this.ejecutar(companyId, fila.id, analisis.resultado, excluir);
    return fila;
  }

  /** Las candidatas de las dos fuentes, sin las que la empresa sacó. */
  async candidatas(
    companyId: number,
    excluir: readonly string[],
  ): Promise<Candidata[]> {
    const hoy = hoyEnChile();
    const [respaldos, oferente, eventos, documentos] = await Promise.all([
      this.oferente.respaldos(companyId),
      this.oferente.oferente(companyId),
      this.eventia.eventosParaLaExperiencia(companyId, hoy),
      this.eventia.documentosDeExperiencia(companyId, hoy),
    ]);
    const lista = oferente?.clientes_que_se_muestran ?? [];
    const queSeMuestran = eventos.filter((e) =>
      sePuedeMostrar({ id: e.cliente_id, tipo: e.tipo_de_cliente }, lista),
    );
    const deMiEmpresa = candidatasDeMiEmpresa(respaldos);
    const leidos =
      queSeMuestran.length > 0
        ? await this.postVenta.paraLaPostulacion(companyId, {
            soloEventos: new Set(queSeMuestran.map((e) => e.numero)),
            carpeta: deMiEmpresa.flatMap((c) =>
              c.numero ? [{ numero: c.numero }] : [],
            ),
          })
        : [];
    const fuera = new Set(excluir);
    return [
      ...deMiEmpresa,
      ...candidatasDeEventia(
        queSeMuestran,
        leidos,
        new Set(documentos.map((d) => d.numero)),
      ),
    ].filter((c) => !fuera.has(c.clave));
  }

  /** Por detrás. Nunca lanza: lo que falle queda escrito en la fila. */
  async ejecutar(
    companyId: number,
    id: number,
    bases: Record<string, unknown> | null,
    excluir: readonly string[],
  ): Promise<void> {
    try {
      const candidatas = await this.candidatas(companyId, excluir);
      if (candidatas.length === 0) {
        const vacia: EleccionDeExperiencia = {
          pide: 0,
          periodo: '',
          condiciones: '',
          elegidas: [],
          faltan: [],
          nota: 'No encontré experiencia que se pueda mostrar: sube a «Mi empresa» tus órdenes de compra de Mercado Público, o las facturas de tus eventos en Post-venta.',
        };
        await this.repo.terminar(companyId, id, {
          estado: 'listo',
          resultado: vacia as unknown as Record<string, unknown>,
        });
        return;
      }
      const respuesta = await this.cliente().messages.parse({
        model: MODELO_DE_LA_EXPERIENCIA,
        max_tokens: 8000,
        output_config: {
          effort: 'medium',
          format: jsonSchemaOutputFormat(ESQUEMA_DE_LA_EXPERIENCIA),
        },
        system: instruccionesDeLaExperiencia(),
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: [
                  textoDeLasBases(bases),
                  '',
                  'LAS EXPERIENCIAS QUE LA EMPRESA PUEDE MOSTRAR',
                  ...candidatas.map(textoDeLaCandidata),
                  '',
                  `Hoy es ${hoyEnChile()}. Elige la experiencia.`,
                ].join('\n'),
              },
            ],
          },
        ],
      });
      const entrada = respuesta.usage.input_tokens ?? 0;
      const salida = respuesta.usage.output_tokens ?? 0;
      const costo = costoEnDolares(entrada, salida, MODELO_DE_LA_EXPERIENCIA);
      const eleccion = respuesta.parsed_output
        ? leerEleccion(respuesta.parsed_output, candidatas)
        : null;
      await this.repo.terminar(companyId, id, {
        estado: eleccion ? 'listo' : 'error',
        ...(eleccion
          ? { resultado: eleccion as unknown as Record<string, unknown> }
          : {
              error: `La IA no pudo elegir la experiencia (${respuesta.stop_reason ?? 'sin respuesta'}).`,
            }),
        tokens_entrada: entrada,
        tokens_salida: salida,
        costo_usd: costo,
      });
      this.logger.info(
        `experiencia ${id}: ${candidatas.length} candidatas, ${eleccion?.elegidas.length ?? 0} elegidas, US$${costo}`,
      );
    } catch (error) {
      this.logger.warn(`experiencia ${id}: ${mensajeDe(error)}`);
      await this.repo
        .terminar(companyId, id, {
          estado: 'error',
          error: errorDeIA(error, 'No se pudo elegir la experiencia'),
        })
        .catch((e) =>
          this.logger.error(
            `no pude anotar el error de la experiencia ${id}: ${mensajeDe(e)}`,
          ),
        );
    }
  }

  /** La empresa dice cuáles van: las elegidas sin las que sacó, en el
   *  mismo orden. Desde ahí se puede armar. */
  async confirmar(
    user: User,
    oportunidadId: number,
    quitar: readonly string[],
    automatica = false,
  ): Promise<FilaDeGeneracion> {
    const companyId = user.company_id;
    await this.noSiEstaPostulada(companyId, oportunidadId);
    const fila = await this.ultimo(companyId, oportunidadId);
    if (!fila || fila.estado !== 'listo' || !fila.resultado) {
      throw new BadRequestException(
        'Primero pide la propuesta de experiencia y espera a que esté lista.',
      );
    }
    const r = fila.resultado as unknown as EleccionDeExperiencia;
    const fuera = new Set(quitar);
    const elegidas = (Array.isArray(r.elegidas) ? r.elegidas : []).filter(
      (c) => !fuera.has(c.clave),
    );
    const confirmada: EleccionDeExperiencia = {
      ...r,
      elegidas,
      quitadas: [...fuera],
      confirmada: true,
      confirmada_en: new Date().toISOString(),
      ...(automatica ? { automatica: true } : {}),
    };
    await this.repo.terminar(companyId, fila.id, {
      estado: 'listo',
      resultado: confirmada as unknown as Record<string, unknown>,
    });
    return (await this.ultimo(companyId, oportunidadId)) ?? fila;
  }
}
