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
import { sanitize } from 'src/storage/storage.service';
import {
  type Adjunto,
  AdjuntosRepository,
} from '../adjuntos/adjuntos.repository';
import {
  extensionDe,
  MAX_BYTES_ADJUNTO,
  nombreLimpio,
  sello,
  TIPOS_POR_EXTENSION,
} from '../adjuntos/adjuntos.service';
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
import { ResultadosRepository } from '../competencia/resultados.repository';
import {
  type FilaDeGeneracion,
  GeneracionRepository,
} from '../generacion/generacion.repository';
import { ENLACE_DEL_ACTA } from '../historia/acta';
import { bajarAnexosDelActa } from '../historia/anexos-del-acta';
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
//
// EL ACTA LLEGA SOLA (decisión 128, 11-11). Felipe: "subir el acta de
// evaluación debería también ser automático (¿se puede?)". En una
// licitación adjudicada, Mercado Público la publica entre los «Anexos a la
// Adjudicación» de su acta (`historia/anexos-del-acta.ts`):
//  - cuando la empresa gana o pierde, el reloj de los resultados la trae a
//    la sección 'acta' y la manda a leer (`revisar`), una vez;
//  - y el botón de la pantalla hace lo mismo a pedido: si no hay acta, la
//    trae y después la lee.
// Subirla a mano queda para cuando el comprador no la adjuntó.

export const MODELO_DEL_APRENDIZAJE = MODELO_OPUS;

const LEIBLES = new Set(['pdf', 'docx', 'txt']);

/** Cuántas actas se mandan a leer solas en cada pasada del reloj. */
const POR_PASADA = 2;

/** Lo más que se espera a otra vuelta que ya está trayendo la misma acta. */
const ESPERA_POR_EL_ACTA_MS = 90_000;

export const SIN_ACTA_PUBLICADA =
  'Mercado Público no trae el acta de evaluación entre los anexos de esta adjudicación. Si la tienes, súbela con «Subir el acta».';

type Contexto = {
  codigo: string;
  organismo: string | null;
  leer: Adjunto[];
  /** La página del acta en Mercado Público, si hay que traerla (decisión
   *  128); null si ya estaba subida. */
  enlace: string | null;
  instrucciones: string;
};

/** El acta pública de una licitación adjudicada; null en una compra ágil,
 *  en una sin adjudicar o si el enlace no es de Mercado Público. */
export const enlaceDelActaDe = (proceso: {
  tipo?: string | null;
  adjudicacion?: unknown;
}): string | null => {
  const enlace = (proceso.adjudicacion as { url_acta?: unknown } | null)
    ?.url_acta;
  return proceso.tipo !== 'compra_agil' &&
    typeof enlace === 'string' &&
    ENLACE_DEL_ACTA.test(enlace.trim())
    ? enlace.trim()
    : null;
};

/** De lo que hay en la sección 'acta', lo que la IA lee (PDF, Word y texto,
 *  hasta 22 MB de PDF, lo más nuevo primero) y lo que no. */
const elegirActas = (
  actas: Adjunto[],
): { leer: Adjunto[]; noLeidos: NoLeido[] } => {
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
  return { leer, noLeidos };
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
  /** Las actas que se están trayendo ahora, por empresa y oportunidad: el
   *  reloj y el botón no la traen dos veces a la vez. */
  private readonly trayendo = new Set<string>();

  constructor(
    private readonly repo: AprendizajesRepository,
    private readonly generacion: GeneracionRepository,
    private readonly adjuntos: AdjuntosRepository,
    private readonly oportunidades: OportunidadesRepository,
    private readonly analisis: AnalisisRepository,
    private readonly logger: PinoLogger,
    /** Las licitaciones resueltas con acta (decisión 128). Opcional: las
     *  pruebas de antes no lo traen. */
    @Optional() private readonly resultados?: ResultadosRepository,
  ) {
    this.logger.setContext(AprendizajesService.name);
  }

  /** Lo que Mercado Público publica con la adjudicación. Aparte, para las
   *  pruebas. */
  protected bajarDelActa(
    enlace: string,
  ): Promise<Array<{ nombre: string; contenido: Buffer }>> {
    return bajarAnexosDelActa(enlace);
  }

  /** Aparte, para que las pruebas no esperen de verdad. */
  protected pausa(ms: number): Promise<void> {
    return new Promise((listo) => setTimeout(listo, ms));
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

  /** Lo pide: responde al tiro con la fila "procesando" y lo demás sigue
   *  por detrás (traer el acta si no está, y leerla). `cuentaId` null: lo
   *  pide el reloj. */
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
    const [actas, analisis, comparacion] = await Promise.all([
      this.adjuntos.listar(companyId, oportunidadId, 'acta'),
      this.analisis.ultimo(companyId, oportunidadId),
      this.generacion.ultimoDeTipo(companyId, oportunidadId, 'comparacion'),
    ]);
    const { leer, noLeidos } = elegirActas(actas);
    // Decisión 128: en una licitación adjudicada el acta se trae sola.
    const enlace = leer.length === 0 ? enlaceDelActaDe(ficha.proceso) : null;
    if (leer.length === 0 && !enlace) {
      throw new BadRequestException(
        ficha.proceso.tipo === 'compra_agil'
          ? 'Sube primero el acta o el informe de evaluación en PDF o Word: una compra ágil no la publica.'
          : 'Mercado Público todavía no publica la adjudicación de esta licitación. Cuando la publique, Eventia trae el acta de evaluación; si ya la tienes, súbela en PDF o Word.',
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
      parametros: {
        actas: leer.length,
        ...(enlace ? { trae_el_acta: true } : {}),
      },
      modelo: MODELO_DEL_APRENDIZAJE,
      archivos: leer.map((a) => ({ id: a.id, nombre: a.nombre })),
      no_leidos: noLeidos,
      pedido_por: cuentaId
        ? await this.adjuntos.perfilDe(companyId, cuentaId)
        : null,
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
      enlace,
      instrucciones: instruccionesDelAprendizaje({
        codigo: ficha.codigo,
        nombre: typeof p.nombre === 'string' ? p.nombre : '',
        organismo,
        // Decisión 95: los mismos criterios del análisis; en una compra
        // ágil sin criterios, el de la ley.
        criterios: criteriosDeEvaluacion(
          resultado?.criterios,
          p.tipo as string | null | undefined,
        ),
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
      // 1. Traer el acta desde Mercado Público, si no estaba (decisión 128).
      let leer = c.leer;
      let sinLeer = noLeidos;
      if (leer.length === 0 && c.enlace) {
        const error = await this.traerElActa(
          companyId,
          oportunidadId,
          c.codigo,
          c.enlace,
        ).then(
          () => null,
          (e: unknown) => e,
        );
        const elegidas = elegirActas(
          await this.adjuntos.listar(companyId, oportunidadId, 'acta'),
        );
        leer = elegidas.leer;
        sinLeer = elegidas.noLeidos;
        if (leer.length === 0) {
          if (error) {
            this.logger.warn(
              `aprendizaje ${id}: el acta de ${c.codigo} no llegó: ${mensajeDe(error)}`,
            );
          }
          await this.generacion.terminar(companyId, id, {
            estado: 'error',
            error: error
              ? 'No se pudo traer el acta desde Mercado Público. Inténtalo en un rato, o súbela con «Subir el acta».'
              : SIN_ACTA_PUBLICADA,
            no_leidos: sinLeer,
          });
          return;
        }
      }

      // 2. Leerla.
      const { bloques, sinAbrir } = await armarContenido(leer, (ruta) =>
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
        archivos: leer.map((a) => ({ id: a.id, nombre: a.nombre })),
        no_leidos: [...sinLeer, ...sinAbrir],
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

  /** Trae a la sección 'acta' lo que Mercado Público publica con la
   *  adjudicación (decisión 128): el acta de evaluación, o el decreto si el
   *  comprador no la subió como tal. No repite un archivo que ya está (mismo
   *  nombre y peso). Si otra vuelta ya la está trayendo (el reloj y el botón
   *  a la vez), espera a que termine y no trae nada. Devuelve cuántos guardó;
   *  lanza si Mercado Público no responde. */
  async traerElActa(
    companyId: number,
    oportunidadId: number,
    codigo: string,
    enlace: string,
  ): Promise<number> {
    const clave = `${companyId}:${oportunidadId}`;
    if (this.trayendo.has(clave)) {
      const hasta = Date.now() + ESPERA_POR_EL_ACTA_MS;
      while (this.trayendo.has(clave) && Date.now() < hasta) {
        await this.pausa(1000);
      }
      return 0;
    }
    this.trayendo.add(clave);
    try {
      const archivos = await this.bajarDelActa(enlace);
      const yaEstan = new Set(
        (await this.adjuntos.listar(companyId, oportunidadId, 'acta')).map(
          (a) => `${a.nombre}|${a.bytes}`,
        ),
      );
      let guardados = 0;
      for (const a of archivos) {
        const nombre = nombreLimpio(a.nombre);
        const tipo = TIPOS_POR_EXTENSION[extensionDe(nombre)];
        const peso = a.contenido.length;
        if (!tipo || peso === 0 || peso > MAX_BYTES_ADJUNTO) continue;
        if (yaEstan.has(`${nombre}|${peso}`)) continue;
        const ruta = `c${companyId}/oportunidades/${oportunidadId}/acta/${sello()}_${sanitize(nombre)}`;
        await this.adjuntos.subirArchivo(ruta, a.contenido, tipo);
        try {
          await this.adjuntos.guardar({
            company_id: companyId,
            oportunidad_id: oportunidadId,
            nombre,
            ruta,
            tipo,
            bytes: peso,
            seccion: 'acta',
            subido_por: null,
          });
        } catch (error) {
          // Sin su fila nadie lo vería: que no quede un archivo huérfano.
          await this.adjuntos.borrarArchivo(ruta);
          throw error;
        }
        yaEstan.add(`${nombre}|${peso}`);
        guardados += 1;
      }
      this.logger.info(
        `acta de ${codigo}: ${guardados} de ${archivos.length} archivos traídos de Mercado Público`,
      );
      return guardados;
    } finally {
      this.trayendo.delete(clave);
    }
  }

  /** El reloj de los resultados (decisión 128): a cada licitación ganada o
   *  perdida de los últimos días, con su adjudicación publicada y sin
   *  ninguna lectura del acta todavía, le trae el acta de evaluación y la
   *  manda a leer. Si el comprador aún no la adjunta, no deja nada escrito
   *  y la pasada siguiente lo intenta de nuevo. Devuelve cuántas mandó a
   *  leer. */
  async revisar(companyId: number, hasta: number): Promise<number> {
    if (!this.resultados || !process.env.ANTHROPIC_API_KEY?.trim()) return 0;
    let pedidas = 0;
    for (const p of await this.resultados.resueltasConActa(companyId)) {
      if (pedidas >= POR_PASADA || Date.now() > hasta) break;
      if (!ENLACE_DEL_ACTA.test(p.url_acta)) continue;
      if (await this.generacion.ultimoDeTipo(companyId, p.id, 'aprendizaje')) {
        continue;
      }
      try {
        const hay =
          (await this.adjuntos.listar(companyId, p.id, 'acta')).length > 0 ||
          (await this.traerElActa(companyId, p.id, p.codigo, p.url_acta)) > 0;
        if (!hay) continue;
        await this.pedir(companyId, null, p.id);
        pedidas += 1;
      } catch (error) {
        if (error instanceof BadRequestException) continue;
        this.logger.warn(`acta de ${p.codigo}: ${mensajeDe(error)}`);
      }
    }
    return pedidas;
  }
}
