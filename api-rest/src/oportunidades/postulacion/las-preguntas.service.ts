import Anthropic from '@anthropic-ai/sdk';
import { jsonSchemaOutputFormat } from '@anthropic-ai/sdk/helpers/json-schema';
import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { mensajeDe } from 'src/logging/mensaje-de-error';
import { costoEnDolares, MODELO_HAIKU } from '../analisis/comun';
import {
  FichaRepository,
  type MarcaDeExigencia,
} from '../ficha/ficha.repository';
import type { RespuestaDeLaEmpresa } from '../oferente/lo-que-sabemos';
import { LoQueSabemosService } from '../oferente/lo-que-sabemos.service';
import {
  type Candidata,
  ESQUEMA_DE_LAS_PREGUNTAS,
  instruccionesDeLasPreguntas,
  itemsDeLaRevision,
  lasCandidatas,
  lasDecisiones,
  loQueSeGuarda,
  type MarcaSola,
  MAXIMO_DE_RESPUESTAS,
  type PreguntaDeLaPostulacion,
  textoParaLaIA,
} from './las-preguntas';

// LAS PREGUNTAS ANTES DE ARMAR (decisión 119, parte 3; las reglas, en
// las-preguntas.ts). Antes de gastar en la oferta, «Armar postulación» pide
// aquí lo que la IA no sabe de la empresa: lo ya respondido en otra
// licitación se marca solo en «Bases y criterios» y lo demás vuelve como
// preguntas. Las respuestas del modal quedan en «Mi empresa» y marcadas.

/** Una respuesta del modal. */
export type RespuestaDelModal = {
  clave: string;
  pregunta: string;
  exigencia?: string | null;
  respuesta: MarcaDeExigencia;
  detalle?: string | null;
  /** La parte por la que se preguntó (decisión 121). */
  parte?: string | null;
};

@Injectable()
export class LasPreguntasService {
  private clienteAnthropic: Anthropic | null = null;

  constructor(
    private readonly fichas: FichaRepository,
    private readonly loQueSabemos: LoQueSabemosService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(LasPreguntasService.name);
  }

  protected cliente(): Anthropic {
    if (!this.clienteAnthropic) {
      this.clienteAnthropic = new Anthropic({ maxRetries: 4 });
    }
    return this.clienteAnthropic;
  }

  /** Lo que hay que preguntarle a la empresa antes de armar. Nunca lanza:
   *  si algo falla (o la migración 190 todavía no está), no pregunta y se
   *  arma como antes. */
  async queFalta(
    companyId: number,
    oportunidadId: number,
    resultado: Record<string, unknown> | null | undefined,
    marcas: Record<string, MarcaDeExigencia>,
  ): Promise<PreguntaDeLaPostulacion[]> {
    try {
      const items = itemsDeLaRevision(resultado);
      if (!items.some((i) => i.estado === 'conseguir')) return [];
      const respuestas = await this.loQueSabemos.lista(companyId);
      const { candidatas, yaRespondidas } = lasCandidatas(
        items,
        marcas,
        respuestas,
      );
      const decidido =
        candidatas.length > 0
          ? await this.decidir(companyId, candidatas, respuestas)
          : { preguntas: [], yaRespondidas: [] };
      await this.marcar(companyId, oportunidadId, [
        ...yaRespondidas,
        ...decidido.yaRespondidas,
      ]);
      return decidido.preguntas;
    } catch (error) {
      this.logger.warn(
        `las preguntas de la oportunidad ${oportunidadId}: ${mensajeDe(error)}`,
      );
      return [];
    }
  }

  /** Las respuestas del modal: a «Mi empresa» y marcadas en «Bases y
   *  criterios» de esta licitación. Un «No puedo» por una parte vale solo
   *  para ella (`loQueSeGuarda`, decisión 121). Si no se pueden guardar,
   *  lanza: la empresa tiene que saber que no quedaron. */
  async guardar(
    companyId: number,
    oportunidadId: number,
    respuestas: RespuestaDelModal[],
  ): Promise<void> {
    const filas = respuestas.map((r) => ({
      clave: r.clave.trim().slice(0, 400),
      exigencia: r.exigencia?.trim().slice(0, 1000) || null,
      ...loQueSeGuarda(r),
    }));
    await this.loQueSabemos.responder(
      companyId,
      filas.map((f) => ({
        clave: f.clave,
        pregunta: f.pregunta.trim().slice(0, 400),
        exigencia: f.exigencia,
        respuesta: f.respuesta,
        detalle: f.detalle?.slice(0, 500) || null,
        oportunidad_id: oportunidadId,
      })),
    );
    await this.marcar(
      companyId,
      oportunidadId,
      filas.map((f) => ({ clave: f.clave, respuesta: f.respuesta })),
    );
  }

  /** Haiku 5.5: qué se subcontrata, qué ya respondió con otras palabras y
   *  cómo se pregunta lo demás. */
  private async decidir(
    companyId: number,
    candidatas: Candidata[],
    todas: RespuestaDeLaEmpresa[],
  ): Promise<{
    preguntas: PreguntaDeLaPostulacion[];
    yaRespondidas: MarcaSola[];
  }> {
    if (!process.env.ANTHROPIC_API_KEY?.trim()) {
      throw new Error('falta la llave de Anthropic');
    }
    const respuestas = todas.slice(0, MAXIMO_DE_RESPUESTAS);
    const respuesta = await this.cliente().messages.parse({
      model: MODELO_HAIKU,
      max_tokens: 4000,
      output_config: {
        effort: 'low',
        format: jsonSchemaOutputFormat(ESQUEMA_DE_LAS_PREGUNTAS),
      },
      system: instruccionesDeLasPreguntas(),
      messages: [
        { role: 'user', content: textoParaLaIA(candidatas, respuestas) },
      ],
    });
    this.logger.info(
      `preguntas (empresa ${companyId}): ${candidatas.length} por revisar, US$${costoEnDolares(respuesta.usage.input_tokens ?? 0, respuesta.usage.output_tokens ?? 0, MODELO_HAIKU)}`,
    );
    return lasDecisiones(respuesta.parsed_output, candidatas, respuestas);
  }

  /** Marca en «Bases y criterios» de esta licitación. Una que falle no
   *  corta las demás: la respuesta igual quedó en «Mi empresa». */
  private async marcar(
    companyId: number,
    oportunidadId: number,
    marcas: MarcaSola[],
  ): Promise<void> {
    await Promise.all(
      marcas.map((m) =>
        this.fichas
          .marcarExigencia(companyId, oportunidadId, m.clave, m.respuesta)
          .catch((error) =>
            this.logger.warn(
              `no pude marcar «${m.clave}» en la oportunidad ${oportunidadId}: ${mensajeDe(error)}`,
            ),
          ),
      ),
    );
  }
}
