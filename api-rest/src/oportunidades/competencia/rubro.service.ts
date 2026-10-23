import Anthropic from '@anthropic-ai/sdk';
import { jsonSchemaOutputFormat } from '@anthropic-ai/sdk/helpers/json-schema';
import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { mensajeDe } from 'src/logging/mensaje-de-error';
import { costoEnDolares, MODELO_HAIKU } from '../analisis/comun';
import { regionCalza } from '../mercado-publico/mapeo';
import { OportunidadesRepository } from '../oportunidades.repository';
import { desdeTresAnios } from './actas.service';
import { CompetenciaRepository } from './competencia.repository';
import {
  ESQUEMA_DEL_RUBRO,
  ganadoresDeLasLineas,
  instruccionesDelRubro,
  lineasDelProceso,
  rubroValido,
  textoParaLaIA,
} from './rubro';

// LA IA DEL RUBRO (decisión 71 del doc 17, 23-10): lee UNA vez cada
// licitación adjudicada de la zona (3 años) y dice qué líneas son de lo que
// la empresa hace; con eso, «Quién gana en tu zona» cuenta solo quién ganó
// esas líneas. Haiku 5.5, de a 25 licitaciones por pedido, con las
// instrucciones en caché: unas 6.000 licitaciones cuestan cerca de US$2 la
// primera vez y centavos después. Corre de noche y, al abrir la pestaña si
// falta, 15 minutos por detrás.

const MINUTO = 60_000;
export const POR_PEDIDO_AL_RUBRO = 25;
export const CLASIFICAR_AL_ABRIR_MS = 15 * MINUTO;

export type EstadoDelRubro = {
  revisadas: number;
  total: number;
  revisando: boolean;
};

@Injectable()
export class RubroService {
  private clienteAnthropic: Anthropic | null = null;
  private readonly enCurso = new Set<number>();

  constructor(
    private readonly repo: CompetenciaRepository,
    private readonly oportunidades: OportunidadesRepository,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(RubroService.name);
  }

  protected cliente(): Anthropic {
    if (!this.clienteAnthropic) {
      this.clienteAnthropic = new Anthropic({ maxRetries: 4 });
    }
    return this.clienteAnthropic;
  }

  /** Las adjudicadas de la zona que la IA todavía no revisó, lo más nuevo
   *  primero; y cuántas hay en total. */
  private async deLaZona(companyId: number) {
    const [config, clasificadas] = await Promise.all([
      this.oportunidades.configDe(companyId),
      this.repo.clasificadas(companyId),
    ]);
    const regiones = config?.regiones ?? [];
    const adjudicadas = (await this.repo.zonaLigera(desdeTresAnios())).filter(
      (p) => p.con_ganadores && regionCalza(p.region, regiones),
    );
    const pendientes = adjudicadas
      .filter((p) => !clasificadas.has(p.codigo))
      .sort((a, b) =>
        (b.fecha_publicacion ?? '').localeCompare(a.fecha_publicacion ?? ''),
      )
      .map((p) => p.codigo);
    return { total: adjudicadas.length, pendientes, perfil: config?.perfil };
  }

  async estado(companyId: number): Promise<EstadoDelRubro> {
    const { total, pendientes } = await this.deLaZona(companyId);
    return {
      revisadas: total - pendientes.length,
      total,
      revisando: this.enCurso.has(companyId),
    };
  }

  estaRevisando(companyId: number): boolean {
    return this.enCurso.has(companyId);
  }

  /** Al abrir la pestaña: si falta revisar y nadie revisa, 15 minutos. */
  clasificarSiHaceFalta(companyId: number, estado: EstadoDelRubro): void {
    if (estado.revisadas >= estado.total || this.enCurso.has(companyId)) {
      return;
    }
    void this.clasificar(companyId, Date.now() + CLASIFICAR_AL_ABRIR_MS).catch(
      (e) => this.logger.warn(`rubro ${companyId}: ${mensajeDe(e)}`),
    );
  }

  /** Revisa lo que falta hasta la hora dada. Devuelve cuántas revisó. */
  async clasificar(companyId: number, hasta: number): Promise<number> {
    if (!process.env.ANTHROPIC_API_KEY?.trim()) return 0;
    if (this.enCurso.has(companyId)) return 0;
    this.enCurso.add(companyId);
    let hechas = 0;
    try {
      const { pendientes, perfil } = await this.deLaZona(companyId);
      for (let i = 0; i < pendientes.length; i += POR_PEDIDO_AL_RUBRO) {
        if (Date.now() > hasta) break;
        const procesos = await this.repo.procesosParaElRubro(
          pendientes.slice(i, i + POR_PEDIDO_AL_RUBRO),
        );
        const lineas = new Map(
          procesos.map((p) => [p.codigo, lineasDelProceso(p.items)]),
        );
        const conLineas = procesos.filter(
          (p) => (lineas.get(p.codigo)?.length ?? 0) > 0,
        );
        if (conLineas.length === 0) continue;
        const respuesta = await this.cliente().messages.parse({
          model: MODELO_HAIKU,
          max_tokens: 6000,
          output_config: {
            effort: 'low',
            format: jsonSchemaOutputFormat(ESQUEMA_DEL_RUBRO),
          },
          system: [
            {
              type: 'text',
              text: instruccionesDelRubro(perfil ?? null),
              cache_control: { type: 'ephemeral' },
            },
          ],
          messages: [
            {
              role: 'user',
              content: conLineas
                .map((p) => textoParaLaIA(p, lineas.get(p.codigo) ?? []))
                .join('\n\n'),
            },
          ],
        });
        const validos = rubroValido(
          respuesta.parsed_output,
          new Map(
            conLineas.map((p) => [p.codigo, lineas.get(p.codigo)!.length]),
          ),
        );
        const porCodigo = new Map(conLineas.map((p) => [p.codigo, p]));
        await this.repo.guardarRubro(
          companyId,
          validos.map((v) => {
            const p = porCodigo.get(v.codigo)!;
            return {
              ...v,
              ganadores: ganadoresDeLasLineas(
                lineas.get(v.codigo) ?? [],
                v.lineas,
              ),
              nombre: p.nombre,
              organismo: p.organismo,
              comuna: p.comuna,
              region: p.region,
              fecha: p.fecha_publicacion?.slice(0, 10) ?? null,
            };
          }),
          MODELO_HAIKU,
        );
        hechas += validos.length;
        this.logger.info(
          `rubro ${companyId}: ${validos.length} revisadas, US$${costoEnDolares(respuesta.usage.input_tokens ?? 0, respuesta.usage.output_tokens ?? 0, MODELO_HAIKU)}`,
        );
      }
      return hechas;
    } catch (error) {
      this.logger.warn(
        `rubro ${companyId}: se cortó la revisión: ${mensajeDe(error)}`,
      );
      return hechas;
    } finally {
      this.enCurso.delete(companyId);
      if (hechas > 0) this.repo.olvidarLaZona();
    }
  }
}
