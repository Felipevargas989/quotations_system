import Anthropic from '@anthropic-ai/sdk';
import { jsonSchemaOutputFormat } from '@anthropic-ai/sdk/helpers/json-schema';
import { BadRequestException, Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { mensajeDe } from 'src/logging/mensaje-de-error';
import { AdjuntosRepository } from '../adjuntos/adjuntos.repository';
import { AnalisisRepository } from '../analisis/analisis.repository';
import {
  armarContenido,
  costoDelUso,
  errorDeIA,
  MAX_BYTES_DE_BASES,
  MODELO_HAIKU,
  pesoDePdf,
  separar,
  usoDeLaRespuesta,
} from '../analisis/comun';
import { idDelPdf } from '../analisis/pdf-subidos';
import { OportunidadesRepository } from '../oportunidades.repository';
import {
  ESQUEMA_DE_LECTURA_CORTA,
  instruccionesDeLaLecturaCorta,
  lecturaCortaValida,
} from './lectura-corta';
import { LecturaCortaRepository } from './lectura-corta.repository';

// LA PRUEBA DE LA LECTURA CORTA (decisión 132, 12-11). Lee con Haiku 5.5 las
// bases de las oportunidades que se le piden y escribe SOLO en
// `oportunidades_lectura_corta`: la oportunidad, su análisis y la bandeja no
// cambian. Responde al tiro con el lote y sigue de fondo, de a una. Los
// resultados se comparan con SQL contra el análisis de Opus y lo que Felipe
// postuló.

export type InicioDeLaPrueba =
  | { iniciada: true; lote: string; total: number }
  | { iniciada: false; motivo: string };

@Injectable()
export class LecturaCortaService {
  private clienteAnthropic: Anthropic | null = null;
  /** Una prueba a la vez; vive en la memoria del motor. */
  private probando = false;

  constructor(
    private readonly repo: LecturaCortaRepository,
    private readonly adjuntos: AdjuntosRepository,
    private readonly oportunidades: OportunidadesRepository,
    /** Solo para bajar los archivos del balde. */
    private readonly archivos: AnalisisRepository,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(LecturaCortaService.name);
  }

  protected cliente(): Anthropic {
    if (!this.clienteAnthropic) {
      this.clienteAnthropic = new Anthropic({
        maxRetries: 3,
        timeout: 5 * 60 * 1000,
      });
    }
    return this.clienteAnthropic;
  }

  /** Parte la prueba con las oportunidades pedidas (sin repetidas). */
  prueba(companyId: number, ids: number[]): InicioDeLaPrueba {
    if (!process.env.ANTHROPIC_API_KEY?.trim()) {
      throw new BadRequestException('Falta la llave de Anthropic en el motor.');
    }
    if (this.probando) {
      return {
        iniciada: false,
        motivo: 'Ya hay una prueba de la lectura corta en marcha.',
      };
    }
    const pedidas = [...new Set(ids)];
    const lote = new Date().toISOString();
    this.probando = true;
    void this.correr(companyId, pedidas, lote).finally(() => {
      this.probando = false;
    });
    return { iniciada: true, lote, total: pedidas.length };
  }

  private async correr(
    companyId: number,
    ids: number[],
    lote: string,
  ): Promise<void> {
    for (const id of ids) {
      try {
        await this.leerUna(companyId, id, lote);
      } catch (error) {
        this.logger.warn(`lectura corta ${id}: ${mensajeDe(error)}`);
      }
    }
    this.logger.info(`lectura corta, lote ${lote}: ${ids.length} pedidas`);
  }

  /** Una oportunidad: anota la fila, lee sus bases y la termina. La fila
   *  nunca queda «procesando»: lo que falla queda en error con su porqué.
   *  Una oportunidad de otra empresa no se anota. */
  async leerUna(
    companyId: number,
    oportunidadId: number,
    lote: string,
  ): Promise<void> {
    const ficha = await this.oportunidades.ficha(companyId, oportunidadId);
    if (!ficha) return;
    const id = await this.repo.crear({
      company_id: companyId,
      oportunidad_id: oportunidadId,
      codigo: ficha.codigo,
      lote,
      origen: 'prueba',
      modelo: MODELO_HAIKU,
    });
    const error = (motivo: string) =>
      this.repo.terminar(companyId, id, { estado: 'error', error: motivo });
    try {
      const archivos = await this.adjuntos.listar(
        companyId,
        oportunidadId,
        'bases',
      );
      const { leibles, noLeidos } = separar(archivos);
      if (leibles.length === 0) return await error('Sin bases que leer.');
      if (pesoDePdf(leibles) > MAX_BYTES_DE_BASES) {
        return await error('Los PDF pesan más de 40 MB juntos.');
      }
      const { bloques, sinAbrir } = await armarContenido(
        leibles,
        (ruta) => this.archivos.descargar(ruta),
        (datos, nombre) => idDelPdf(this.cliente(), datos, nombre),
      );
      if (bloques.length === 0) {
        return await error('No se pudo abrir ninguno de los archivos.');
      }
      const config = await this.oportunidades.configDe(companyId);
      const p = ficha.proceso;
      const respuesta = await this.cliente().messages.parse({
        model: MODELO_HAIKU,
        // Haiku 5.5 piensa antes de responder (esfuerzo bajo): el tope deja
        // espacio para eso y para la respuesta.
        max_tokens: 4000,
        output_config: {
          effort: 'low',
          format: jsonSchemaOutputFormat(ESQUEMA_DE_LECTURA_CORTA),
        },
        system: instruccionesDeLaLecturaCorta({
          perfil: config?.perfil ?? null,
          proceso: {
            codigo: ficha.codigo,
            nombre: p.nombre,
            organismo: p.organismo,
            comuna: p.comuna,
            monto: p.monto ? Number(p.monto) : null,
          },
        }),
        messages: [
          {
            role: 'user',
            content: [
              ...bloques,
              {
                type: 'text',
                text: 'Estas son las bases. ¿Es para la empresa?',
              },
            ],
          },
        ],
      });
      const uso = usoDeLaRespuesta(respuesta.usage);
      const gasto = {
        tokens_entrada: uso.entrada + uso.cacheEscrita + uso.cacheLeida,
        tokens_salida: uso.salida,
        costo_usd: costoDelUso(uso, MODELO_HAIKU),
      };
      const lectura = lecturaCortaValida(respuesta.parsed_output);
      await this.repo.terminar(
        companyId,
        id,
        lectura
          ? {
              estado: 'listo',
              ...lectura,
              archivos: leibles.map((a) => ({ id: a.id, nombre: a.nombre })),
              no_leidos: [...noLeidos, ...sinAbrir],
              ...gasto,
            }
          : {
              estado: 'error',
              error: `Haiku no contestó con el formato (${respuesta.stop_reason ?? 'sin respuesta'}).`,
              ...gasto,
            },
      );
    } catch (e) {
      await error(errorDeIA(e, 'No se pudieron leer las bases')).catch(
        (otro: unknown) =>
          this.logger.error(
            `lectura corta ${oportunidadId}: no pude anotar la falla: ${mensajeDe(otro)}`,
          ),
      );
    }
  }
}
