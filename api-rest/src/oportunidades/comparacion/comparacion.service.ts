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
  costoEnDolares,
  ENCENDIDO,
  errorDeIA,
  MODELO_OPUS,
  type NoLeido,
  textoDelArchivo,
} from '../analisis/comun';
import { criteriosDeEvaluacion } from '../analisis/criterios-de-evaluacion';
import { idDelPdf } from '../analisis/pdf-subidos';
import { paraLaComparacion } from '../aprendizajes/aprendizajes';
import { AprendizajesRepository } from '../aprendizajes/aprendizajes.repository';
import {
  OfertasDeLaCompetenciaService,
  type UltimaVuelta,
} from '../competencia/ofertas-de-la-competencia.service';
import {
  type FilaDeGeneracion,
  GeneracionRepository,
} from '../generacion/generacion.repository';
import { OferenteRepository } from '../oferente/oferente.repository';
import { OportunidadesRepository } from '../oportunidades.repository';
import { ElSetService } from '../postulacion/el-set.service';
import {
  type ComparacionDeLaIA,
  conLineas,
  conPuntajes,
  type CriterioDeLasBases,
  encabezadoDeLaOferta,
  ESQUEMA_DE_LA_COMPARACION,
  instruccionesDeLaComparacion,
  type LecturaDeUnaOferta,
} from './comparacion';
import {
  comoSeLee,
  laOfertaPropia,
  MAX_BYTES_DE_IMAGEN,
  MAX_BYTES_DE_LAS_IMAGENES,
  MAX_IMAGENES_DE_LA_COMPARACION,
  MAX_PAGINAS_DE_LA_COMPARACION,
  MAX_PAGINAS_DE_LAS_BASES,
  nivelDe,
  ordenDeLectura,
  paginasDelPdf,
  paginasDeTexto,
  type ParaLeer,
  porQueNoSeLee,
} from './que-leer';
import { conReclamos, type DatosDelReclamo } from './reclamo';

// LA COMPARACIÓN DE OFERTAS (decisión 41 del doc 17, 19-10): la oferta de
// la empresa contra las de la competencia (sección 'competencia', migración
// 153). Opus 5.5 pone la nota de cada criterio; el motor calcula los
// puntajes con los pesos de las bases (`conPuntajes`). Desde la decisión 59,
// la IA marca también los incumplimientos graves de cada oferta y el motor
// arma el texto del reclamo (`conReclamos`). Desde la decisión 60, lee lo
// aprendido de las comisiones, solo para predecir (las notas y la
// probabilidad); lo que cumple las bases y lo grave van por las bases.
//
// DESDE LA DECISIÓN 125 (11-11), «Traer y comparar» en un solo paso:
//  1. En una licitación, primero trae del cuadro público lo que falte de los
//     demás oferentes (decisión 123) y anota lo que no se pudo traer.
//  2. Lee las bases, la oferta de la empresa como se sube a Mercado Público
//     (con los respaldos que van dentro de cada formulario) y todo lo de cada
//     competidor que quepa, contado en páginas (`que-leer.ts`). Los PDF van
//     por la Files API, como las bases (decisión 103).
//  3. La IA compara por línea y cita las bases; de lo que no vio no afirma
//     nada. El motor pone los puntajes y los dos desenlaces de cada línea.

export const MODELO_DE_LA_COMPARACION = MODELO_OPUS;

/** Lo de la empresa que lee «Por qué perdimos» (decisión 97): lo que
 *  presentó, sin sus respaldos de experiencia. La comparación lee todo
 *  (`laOfertaPropia`, decisión 125). */
export const QUE_SE_COMPARA = new Set([
  'formulario',
  'propuesta',
  'subido',
  'documento',
]);

const NO_CUPO = `no cupo: la comparación lee hasta ${MAX_PAGINAS_DE_LA_COMPARACION} páginas`;
const NO_CUPO_EN_LAS_BASES = `no cupo: de las bases se leen hasta ${MAX_PAGINAS_DE_LAS_BASES} páginas`;
const NO_CUPO_DE_IMAGENES = `no cupo: la comparación lee hasta ${MAX_IMAGENES_DE_LA_COMPARACION} imágenes, ${MAX_BYTES_DE_LAS_IMAGENES / 1024 / 1024} MB entre todas`;

/** Las imágenes que ya van en el pedido: cuántas y cuánto pesan. */
type CupoDeImagenes = { cuantas: number; bytes: number };

type Bloque =
  | Anthropic.TextBlockParam
  | Anthropic.DocumentBlockParam
  | Anthropic.ImageBlockParam;

type Contexto = {
  oportunidadId: number;
  esLicitacion: boolean;
  empresa: string;
  /** La oferta de la empresa, como se sube. */
  mias: ParaLeer[];
  criterios: CriterioDeLasBases[];
  instrucciones: string;
  /** Para el texto del reclamo (decisión 59). */
  reclamo: DatosDelReclamo;
};

/** Por qué no hay con quién comparar, después de ir a buscar las ofertas. */
const sinCompetencia = (vuelta: UltimaVuelta | null): string => {
  if (vuelta?.error) return vuelta.error;
  const r = vuelta?.resultado;
  if (r && !r.publicadas) {
    return 'Mercado Público todavía no muestra las ofertas de esta licitación: aparecen con la apertura, después del cierre.';
  }
  if (r && r.oferentes === 0) {
    return 'Solo tu empresa presentó oferta: no hay con quién comparar.';
  }
  return 'No hay ofertas de otros oferentes para comparar: tráelas o súbelas en «La competencia».';
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
    private readonly aprendizajes: AprendizajesRepository,
    private readonly ofertas: OfertasDeLaCompetenciaService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(ComparacionService.name);
  }

  protected cliente(): Anthropic {
    if (!this.clienteAnthropic) {
      this.clienteAnthropic = new Anthropic({
        maxRetries: 3,
        timeout: 20 * 60 * 1000,
      });
    }
    return this.clienteAnthropic;
  }

  /** El PDF, en la Files API (decisión 103). Aparte, para las pruebas. */
  protected subirPdf(datos: Buffer, nombre: string): Promise<string> {
    return idDelPdf(this.cliente(), datos, nombre);
  }

  /** Las páginas de un PDF. Aparte, para las pruebas. */
  protected contarPaginas(datos: Buffer): Promise<number> {
    return paginasDelPdf(datos);
  }

  /** La última, siempre con sus líneas: una de antes de la decisión 125
   *  sale como una sola línea (`conLineas`). */
  async ultima(
    companyId: number,
    oportunidadId: number,
  ): Promise<FilaDeGeneracion | null> {
    await this.repo.abandonarAntesDe(companyId, oportunidadId, ENCENDIDO);
    const fila = await this.repo.ultimoDeTipo(
      companyId,
      oportunidadId,
      'comparacion',
    );
    return fila?.resultado
      ? { ...fila, resultado: conLineas(fila.resultado) }
      : fila;
  }

  /** La pide: responde al tiro con la fila "procesando" y lo demás sigue por
   *  detrás (traer las ofertas, leerlas y comparar). */
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
    // Una licitación tiene cuadro de ofertas público; una compra ágil, no.
    const esLicitacion = ficha.proceso.tipo !== 'compra_agil';
    const [analisis, competencia, empresa, oferta, aprendido] =
      await Promise.all([
        this.analisis.ultimo(companyId, oportunidadId),
        this.adjuntos.listar(companyId, oportunidadId, 'competencia'),
        this.oferente.oferente(companyId),
        // La última que se armó de verdad: «Armar postulación» deja una
        // detenida cuando faltan respuestas (decisión 119, parte 3).
        this.repo.ultimoDeTipo(companyId, oportunidadId, 'oferta', 'listo'),
        this.aprendizajes.deLaEmpresa(companyId),
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
    // Los mismos criterios del análisis; en una compra ágil sin criterios,
    // el de la ley (decisión 95).
    const criterios = criteriosDeEvaluacion(
      resultado.criterios,
      ficha.proceso.tipo,
    );
    if (criterios.length === 0) {
      throw new BadRequestException(
        'El análisis de las bases no trae criterios de evaluación: vuelve a analizar las bases.',
      );
    }
    // En una licitación las ofertas se traen solas (paso 1 de `ejecutar`).
    if (competencia.length === 0 && !esLicitacion) {
      throw new BadRequestException(
        'Sube primero la oferta de al menos un competidor (la bajas del cuadro de ofertas de Mercado Público).',
      );
    }
    const mias = laOfertaPropia(
      await this.set.piezas(companyId, oportunidadId),
    );
    if (mias.length === 0) {
      throw new BadRequestException(
        'Tu postulación está vacía: arma la postulación o sube a «Mi postulación» lo que presentaste.',
      );
    }

    await this.repo.abandonarAntesDe(companyId, oportunidadId, ENCENDIDO);
    // Qué se leyó y qué no se sabe recién al terminar: va en `terminar`.
    const fila = await this.repo.crearGeneracion({
      company_id: companyId,
      oportunidad_id: oportunidadId,
      tipo: 'comparacion',
      parametros: { trae_las_ofertas: esLicitacion },
      modelo: MODELO_DE_LA_COMPARACION,
      archivos: [],
      no_leidos: [],
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
    const empresaNombre = empresa?.razon_social?.trim() || 'La empresa';
    void this.ejecutar(companyId, fila.id, {
      oportunidadId,
      esLicitacion,
      empresa: empresaNombre,
      mias,
      criterios,
      instrucciones: instruccionesDeLaComparacion({
        codigo: ficha.codigo,
        nombre: typeof p.nombre === 'string' ? p.nombre : '',
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
        comisiones: paraLaComparacion(
          aprendido,
          ficha.codigo,
          (p.organismo as string | null) ?? null,
        ),
      }),
      reclamo: {
        codigo: ficha.codigo,
        nombre: typeof p.nombre === 'string' ? p.nombre : '',
        organismo: (p.organismo as string | null) ?? null,
        empresa,
      },
    });
    return fila;
  }

  /** Por detrás. Nunca lanza: lo que falle queda escrito en la fila. */
  async ejecutar(companyId: number, id: number, c: Contexto): Promise<void> {
    try {
      // 1. Traer lo que falte de los demás (decisión 123). Si Mercado Público
      //    no responde, se compara con lo que ya hay.
      const vuelta = c.esLicitacion
        ? await this.ofertas.traerAhora(companyId, c.oportunidadId)
        : null;
      const [competencia, bases] = await Promise.all([
        this.adjuntos.listar(companyId, c.oportunidadId, 'competencia'),
        this.adjuntos.listar(companyId, c.oportunidadId, 'bases'),
      ]);
      if (competencia.length === 0) {
        await this.repo.terminar(companyId, id, {
          estado: 'error',
          error: sinCompetencia(vuelta),
        });
        return;
      }

      // 2. Leer: las bases, la oferta de la empresa y las de los demás.
      const sinTraer = vuelta?.resultado?.sinTraer ?? [];
      const porCompetidor = new Map<string, ParaLeer[]>();
      for (const a of competencia) {
        const quien = a.competidor?.trim() || 'Sin nombre';
        porCompetidor.set(quien, [
          ...(porCompetidor.get(quien) ?? []),
          {
            id: a.id,
            nombre: a.nombre,
            ruta: a.ruta,
            bytes: a.bytes,
            nivel: nivelDe(a.nombre),
          },
        ]);
      }
      // Quien solo subió comprimidos no tiene nada guardado, pero existe.
      for (const s of sinTraer) {
        if (!porCompetidor.has(s.oferente)) porCompetidor.set(s.oferente, []);
      }
      const ofertas = [
        { nombre: c.empresa, es_tuya: true, archivos: c.mias },
        ...[...porCompetidor].map(([nombre, archivos]) => ({
          nombre,
          es_tuya: false,
          archivos,
        })),
      ];
      const leido = await this.leer(ofertas, bases, sinTraer);

      // 3. Comparar. Con `stream`: la respuesta es larga y puede tardar.
      const respuesta = await this.cliente()
        .messages.stream({
          model: MODELO_DE_LA_COMPARACION,
          max_tokens: 32_000,
          output_config: {
            effort: 'medium',
            format: jsonSchemaOutputFormat(ESQUEMA_DE_LA_COMPARACION),
          },
          system: c.instrucciones,
          messages: [
            {
              role: 'user',
              content: [
                ...leido.contenido,
                {
                  type: 'text',
                  text: 'Compara las ofertas, línea por línea, con los criterios de evaluación y el texto de las bases.',
                },
              ],
            },
          ],
        })
        .finalMessage();
      const entrada = respuesta.usage.input_tokens ?? 0;
      const salida = respuesta.usage.output_tokens ?? 0;
      const costo = costoEnDolares(entrada, salida, MODELO_DE_LA_COMPARACION);
      const ia = respuesta.parsed_output as unknown as ComparacionDeLaIA | null;
      const completas = new Set(
        leido.lectura
          .filter((l) => l.sin_leer.length === 0 && l.sin_traer.length === 0)
          .map((l) => l.oferta),
      );
      await this.repo.terminar(companyId, id, {
        estado: ia ? 'listo' : 'error',
        ...(ia
          ? {
              resultado: {
                ...conReclamos(
                  conPuntajes(
                    ia,
                    c.criterios,
                    new Map(ofertas.map((o, i) => [i + 1, o.nombre])),
                  ),
                  c.reclamo,
                  completas,
                ),
                lectura: leido.lectura,
              } as unknown as Record<string, unknown>,
            }
          : {}),
        archivos: leido.leidos,
        no_leidos: leido.noLeidos,
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
        `comparación ${id}: ${leido.leidos.length} archivos, ${leido.paginas} páginas, ${entrada} tokens de entrada, ${salida} de salida, US$${costo}`,
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

  /** Baja y prepara un archivo para la IA, si cabe en las páginas que
   *  quedan (y, una imagen, en el cupo de imágenes); si no, dice por qué no. */
  private async unArchivo(
    a: { nombre: string; ruta: string; titulo?: string },
    quedan: number,
    noCupo: string,
    imagenes: CupoDeImagenes,
  ): Promise<{ bloques: Bloque[]; paginas: number } | { motivo: string }> {
    const como = comoSeLee(a.nombre);
    if (!como) return { motivo: porQueNoSeLee(a.nombre) };
    if (quedan <= 0) return { motivo: noCupo };
    if (
      como.tipo === 'imagen' &&
      imagenes.cuantas >= MAX_IMAGENES_DE_LA_COMPARACION
    ) {
      return { motivo: NO_CUPO_DE_IMAGENES };
    }
    let datos: Buffer;
    try {
      datos = await this.repo.descargar(a.ruta);
    } catch (error) {
      this.logger.warn(
        `comparación: no se bajó ${a.ruta}: ${mensajeDe(error)}`,
      );
      return { motivo: 'no se pudo abrir' };
    }
    const titulo = a.titulo ?? a.nombre;
    if (como.tipo === 'pdf') {
      const paginas = await this.contarPaginas(datos);
      if (paginas > quedan) return { motivo: noCupo };
      return {
        paginas,
        bloques: [
          {
            type: 'document',
            title: titulo,
            source: {
              type: 'file',
              file_id: await this.subirPdf(datos, a.nombre),
            },
          },
        ],
      };
    }
    if (como.tipo === 'imagen') {
      if (datos.length > MAX_BYTES_DE_IMAGEN) {
        return { motivo: 'la imagen pesa más de 4 MB' };
      }
      if (imagenes.bytes + datos.length > MAX_BYTES_DE_LAS_IMAGENES) {
        return { motivo: NO_CUPO_DE_IMAGENES };
      }
      imagenes.cuantas += 1;
      imagenes.bytes += datos.length;
      return {
        paginas: 1,
        bloques: [
          { type: 'text', text: `Imagen: ${titulo}` },
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: como.mime as 'image/png',
              data: datos.toString('base64'),
            },
          },
        ],
      };
    }
    const texto = textoDelArchivo(a.nombre, datos);
    if (!texto?.trim()) return { motivo: 'no se pudo abrir' };
    const paginas = paginasDeTexto(texto);
    if (paginas > quedan) return { motivo: noCupo };
    return {
      paginas,
      bloques: [
        {
          type: 'document',
          title: titulo,
          source: { type: 'text', media_type: 'text/plain', data: texto },
        },
      ],
    };
  }

  /** Lo que lee la IA, en orden: las bases y cada oferta con su encabezado.
   *  Se elige por prioridad (`ordenDeLectura`) hasta el tope de páginas; lo
   *  que no entra queda dicho en el encabezado de su oferta. */
  private async leer(
    ofertas: Array<{ nombre: string; es_tuya: boolean; archivos: ParaLeer[] }>,
    bases: Adjunto[],
    sinTraer: Array<{ oferente: string; nombre: string; motivo: string }>,
  ) {
    let paginas = 0;
    const imagenes: CupoDeImagenes = { cuantas: 0, bytes: 0 };
    const leidos: Array<{ id: number; nombre: string }> = [];
    const noLeidos: NoLeido[] = [];

    // Las bases primero: son la regla. En el orden en que se subieron.
    const deLasBases: Bloque[] = [];
    let paginasDeLasBases = 0;
    const enOrden = [...bases].sort((a, b) =>
      a.creado_en.localeCompare(b.creado_en),
    );
    for (const a of enOrden) {
      const r = await this.unArchivo(
        a,
        MAX_PAGINAS_DE_LAS_BASES - paginasDeLasBases,
        NO_CUPO_EN_LAS_BASES,
        imagenes,
      );
      if ('motivo' in r) {
        noLeidos.push({ nombre: `Bases: ${a.nombre}`, motivo: r.motivo });
        continue;
      }
      paginasDeLasBases += r.paginas;
      deLasBases.push(...r.bloques);
      leidos.push({ id: a.id, nombre: `Bases: ${a.nombre}` });
    }
    paginas += paginasDeLasBases;

    // Las ofertas, por prioridad; cada archivo queda con su oferta.
    const bloquesDe = new Map<ParaLeer, Bloque[]>();
    const motivoDe = new Map<ParaLeer, string>();
    for (const { archivo } of ordenDeLectura(ofertas.map((o) => o.archivos))) {
      const r = await this.unArchivo(
        archivo,
        MAX_PAGINAS_DE_LA_COMPARACION - paginas,
        NO_CUPO,
        imagenes,
      );
      if ('motivo' in r) {
        motivoDe.set(archivo, r.motivo);
        continue;
      }
      paginas += r.paginas;
      bloquesDe.set(archivo, r.bloques);
    }

    const contenido: Bloque[] = [];
    if (deLasBases.length > 0) {
      contenido.push(
        { type: 'text', text: '=== LAS BASES DE LA LICITACIÓN ===' },
        ...deLasBases,
      );
    }
    const lectura: LecturaDeUnaOferta[] = [];
    for (const [i, o] of ofertas.entries()) {
      const sinLeer = o.archivos
        .filter((a) => motivoDe.has(a))
        .map((a) => ({ nombre: a.nombre, motivo: motivoDe.get(a) ?? '' }));
      const noLlegaron = sinTraer
        .filter((s) => !o.es_tuya && s.oferente === o.nombre)
        .map((s) => ({ nombre: s.nombre, motivo: s.motivo }));
      const suyos = o.archivos.filter((a) => bloquesDe.has(a));
      contenido.push(
        {
          type: 'text',
          text: encabezadoDeLaOferta(
            i + 1,
            {
              nombre: o.nombre,
              es_tuya: o.es_tuya,
              leidos: suyos.length,
              conRespaldos: o.es_tuya,
            },
            sinLeer.map((x) => x.nombre),
            noLlegaron.map((x) => x.nombre),
          ),
        },
        ...suyos.flatMap((a) => bloquesDe.get(a) ?? []),
      );
      lectura.push({
        oferta: i + 1,
        nombre: o.nombre,
        es_tuya: o.es_tuya,
        leidos: suyos.length,
        total: o.archivos.length,
        sin_leer: sinLeer,
        sin_traer: noLlegaron,
      });
      leidos.push(
        ...suyos.map((a) => ({
          id: a.id ?? 0,
          nombre: `${o.nombre}: ${a.nombre}`,
        })),
      );
      noLeidos.push(
        ...sinLeer.map((x) => ({
          nombre: `${o.nombre}: ${x.nombre}`,
          motivo: x.motivo,
        })),
        ...noLlegaron.map((x) => ({
          nombre: `${o.nombre}: ${x.nombre}`,
          motivo: `no se trajo de Mercado Público: ${x.motivo}`,
        })),
      );
    }
    return { contenido, lectura, leidos, noLeidos, paginas };
  }
}
