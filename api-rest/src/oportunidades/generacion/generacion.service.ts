import Anthropic from '@anthropic-ai/sdk';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { mensajeDe } from 'src/logging/mensaje-de-error';
import { sanitize } from 'src/storage/storage.service';
import {
  type Adjunto,
  AdjuntosRepository,
  type Origen,
} from '../adjuntos/adjuntos.repository';
import {
  extensionDe,
  nombreLimpio,
  sello,
  TIPOS_POR_EXTENSION,
} from '../adjuntos/adjuntos.service';
import { AnalisisRepository } from '../analisis/analisis.repository';
import {
  costoDelUso,
  ENCENDIDO,
  errorDeIA,
  hoyEnChile,
  MODELO_HAIKU,
  MODELO_OPUS,
  type NoLeido,
} from '../analisis/comun';
import { EventiaRepository } from '../eventia/eventia.repository';
import { OferenteRepository } from '../oferente/oferente.repository';
import { OportunidadesRepository } from '../oportunidades.repository';
import {
  claseDeFormulario,
  concretarSalidas,
  formulariosParaElTaller,
  habilidadesParaFormularios,
  MAX_BYTES_DE_PDF_EN_FORMULARIOS,
  modeloParaFormularios,
  salidasDeFormularios,
  sinExtension,
} from './formularios';
import {
  type FilaDeGeneracion,
  GeneracionRepository,
  type TipoDeGeneracion,
  TIPOS_DE_GENERACION,
} from './generacion.repository';
import {
  type ContextoDeGeneracion,
  desgloseDeOferta,
  fechaLarga,
  instruccionesDeAnexos,
  instruccionesDeFirma,
  instruccionesDePropuesta,
  leerInforme,
  loQuePidenLasBases,
} from './instrucciones';
import { problemaDelDocumento } from './revision';
import {
  type ArchivoParaElTaller,
  type Habilidad,
  trabajarEnElTaller,
} from './taller';

// ANEXOS LLENOS CON IA, FIRMA Y PROPUESTA TÉCNICA (doc 17, sprint 3, paso
// 4; migración 129). Felipe, 17-10: "1.- si 2.- si 3.- si, pero primero
// dejemos todo listo y luego testeamos con estas licitaciones".
//
// Tres botones, el mismo camino: el motor arma el pedido, responde al tiro
// con el trabajo "procesando" y sigue por detrás. Claude trabaja en el
// taller (./taller: ejecución de código y la habilidad de Word; la de PDF
// cuando hay que reescribir un formulario en PDF, ./formularios); lo que
// entrega se revisa ANTES de guardarse en "Mi postulación" (./revision).
// Lo generado queda marcado 'generado' (sin firma) o 'firmado', con el
// archivo del que salió. Nada se sube a Mercado Público: eso lo hace la
// empresa.

const TIPO_WORD = TIPOS_POR_EXTENSION.docx;

/** Un pedido razonable; más que esto no es una postulación. */
export const MAX_DOCUMENTOS = 10;

/** Lo que se le pasa al taller en una propuesta: las bases (para el
 *  detalle técnico), hasta este peso. */
export const MAX_BYTES_DE_BASES_PARA_PROPUESTA = 40 * 1024 * 1024;

/** El logo pesa poco; uno de más de esto no es un logo. */
const MAX_BYTES_LOGO = 3 * 1024 * 1024;

const TIPOS_DE_IMAGEN: Readonly<Record<string, string>> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
};

/** Lo que el taller recibe: un archivo del balde o el logo (URL pública). */
type Entrada = {
  enElTaller: string;
  tipo: string;
  ruta?: string;
  url?: string;
  /** El logo es opcional: si no se puede bajar, se sigue sin él. */
  opcional?: boolean;
  /** Un formulario en PDF: además, la IA lo mira (taller.ts). */
  verComoDocumento?: boolean;
};

/** Lo que se espera que entregue, y cómo se guarda. */
type Salida = {
  enElTaller: string;
  nombre: string;
  origen: Exclude<Origen, 'subido'>;
  viene_de: number | null;
  /** El firmado se compara con el documento que se firmó. */
  comparaCon?: string;
  /** De un PDF, un Word por formulario: `concretarSalidas`. */
  prefijo?: true;
};

export type Plan = {
  tipo: TipoDeGeneracion;
  /** El modelo por tarea (Felipe, 17-10): Sonnet llena los anexos, Haiku
   *  firma y Opus escribe la propuesta técnica. */
  modelo: string;
  oportunidadId: number;
  perfil: string | null;
  sistema: string;
  texto: string;
  entradas: Entrada[];
  salidas: Salida[];
  esfuerzo: 'medium' | 'high';
  maxTokens: number;
  /** Sin decirlo, la de Word; con un PDF, también la de PDF. */
  habilidades?: readonly Habilidad[];
};

@Injectable()
export class GeneracionService {
  private clienteAnthropic: Anthropic | null = null;

  constructor(
    private readonly repo: GeneracionRepository,
    private readonly analisis: AnalisisRepository,
    private readonly adjuntos: AdjuntosRepository,
    private readonly oferente: OferenteRepository,
    private readonly oportunidades: OportunidadesRepository,
    private readonly eventia: EventiaRepository,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(GeneracionService.name);
  }

  /** El cliente se crea al primer uso; lee ANTHROPIC_API_KEY. Un trabajo
   *  en el taller tarda varios minutos: 20 por pedido como tope. */
  protected cliente(): Anthropic {
    if (!this.clienteAnthropic) {
      this.clienteAnthropic = new Anthropic({
        maxRetries: 2,
        timeout: 20 * 60 * 1000,
      });
    }
    return this.clienteAnthropic;
  }

  /** El último trabajo de cada tipo; lo cortado por un despliegue queda
   *  como error. */
  async ultimas(
    companyId: number,
    oportunidadId: number,
  ): Promise<Record<TipoDeGeneracion, FilaDeGeneracion | null>> {
    await this.repo.abandonarAntesDe(companyId, oportunidadId, ENCENDIDO);
    const [anexos, firma, propuesta] = await Promise.all(
      TIPOS_DE_GENERACION.map((tipo) =>
        this.repo.ultimoDeTipo(companyId, oportunidadId, tipo),
      ),
    );
    return { anexos, firma, propuesta };
  }

  /** "Generar anexos": los formularios del comprador, llenos y SIN firma.
   *  Dos caminos (formularios.ts): un Word se llena en el mismo archivo; un
   *  PDF se reescribe en Word, con el texto oficial al pie de la letra. Sin
   *  elegir van los Word: un PDF se elige a mano (casi siempre son las
   *  bases). `monto_total` (con IVA) lo pone la empresa; sin él, la oferta
   *  económica queda en blanco. */
  async generarAnexos(
    companyId: number,
    cuentaId: string,
    oportunidadId: number,
    pedido: { monto_total?: number | null; adjuntos?: number[] },
  ): Promise<FilaDeGeneracion> {
    const ficha = await this.comprobar(companyId, oportunidadId);
    const bases = await this.adjuntos.listar(companyId, oportunidadId, 'bases');
    const pedidos = new Set(pedido.adjuntos ?? []);
    const elegidos =
      pedidos.size > 0
        ? bases.filter((a) => pedidos.has(a.id))
        : bases.filter((a) =>
            ['word', 'doc'].includes(claseDeFormulario(a.nombre) ?? ''),
          );
    if (
      pedidos.size > 0 &&
      (elegidos.length !== pedidos.size ||
        elegidos.some((a) => !claseDeFormulario(a.nombre)))
    ) {
      throw new BadRequestException(
        'Solo se llenan los formularios en Word o PDF de «Bases y anexos».',
      );
    }
    if (elegidos.length === 0) {
      throw new BadRequestException(
        'En «Bases y anexos» no hay formularios en Word. Si vienen en PDF (también escaneados o al final de las bases), márcalos.',
      );
    }
    if (elegidos.length > MAX_DOCUMENTOS) {
      throw new BadRequestException(
        `Elige hasta ${MAX_DOCUMENTOS} anexos por vez.`,
      );
    }
    const pesoDePdf = elegidos
      .filter((a) => claseDeFormulario(a.nombre) === 'pdf')
      .reduce((suma, a) => suma + a.bytes, 0);
    if (pesoDePdf > MAX_BYTES_DE_PDF_EN_FORMULARIOS) {
      throw new BadRequestException(
        'Los PDF elegidos pesan más de 40 MB juntos: elige solo los que traen los formularios.',
      );
    }
    const contexto = await this.contexto(companyId, oportunidadId, ficha, true);
    if (!contexto.oferente.razon_social || !contexto.oferente.rut) {
      throw new BadRequestException(
        'Primero llena los datos de la empresa en «Mi empresa» (al menos la razón social y el RUT).',
      );
    }
    const oferta = pedido.monto_total
      ? desgloseDeOferta(pedido.monto_total)
      : null;
    const formularios = formulariosParaElTaller(elegidos);

    return this.encargar(companyId, cuentaId, contexto.analisisId, {
      tipo: 'anexos',
      oportunidadId,
      parametros: {
        monto_total: oferta?.total ?? null,
        adjuntos: elegidos.map((a) => a.id),
      },
      archivos: elegidos,
      noLeidos: [],
      plan: {
        sistema: instruccionesDeAnexos(
          contexto.datos,
          formularios.map((f) => ({
            enElTaller: f.enElTaller,
            original: f.adjunto.nombre,
            clase: f.clase,
          })),
          oferta,
        ),
        texto: 'Llena los anexos.',
        modelo: modeloParaFormularios(formularios),
        habilidades: habilidadesParaFormularios(formularios),
        entradas: formularios.map((f) => ({
          enElTaller: f.enElTaller,
          tipo: f.tipo,
          ruta: f.adjunto.ruta,
          ...(f.clase === 'pdf' ? { verComoDocumento: true } : {}),
        })),
        salidas: salidasDeFormularios(formularios),
        esfuerzo: 'medium',
        // Reescribir un PDF son varios Word nuevos: más espacio.
        maxTokens: pesoDePdf > 0 ? 64_000 : 32_000,
      },
    });
  }

  /** "Firmar": pone la foto de la firma en Word de «Mi postulación» que la
   *  empresa ya revisó (la firma en dos tiempos, decidida el 17-10). */
  async firmar(
    companyId: number,
    cuentaId: string,
    oportunidadId: number,
    ids: number[],
  ): Promise<FilaDeGeneracion> {
    const ficha = await this.comprobar(companyId, oportunidadId);
    const pedidos = new Set(ids);
    if (pedidos.size === 0 || pedidos.size > MAX_DOCUMENTOS) {
      throw new BadRequestException(
        `Elige entre 1 y ${MAX_DOCUMENTOS} documentos para firmar.`,
      );
    }
    const contexto = await this.contexto(companyId, oportunidadId, ficha);
    const firma = contexto.oferente.firma_ruta;
    if (!firma) {
      throw new BadRequestException(
        'Primero sube la foto de la firma en «Mi empresa».',
      );
    }
    const postulacion = await this.adjuntos.listar(
      companyId,
      oportunidadId,
      'postulacion',
    );
    const elegidos = postulacion.filter((a) => pedidos.has(a.id));
    if (elegidos.length !== pedidos.size) {
      throw new NotFoundException(
        'No encontramos ese documento en «Mi postulación».',
      );
    }
    const noWord = elegidos.find((a) => extensionDe(a.nombre) !== 'docx');
    if (noWord) {
      throw new BadRequestException(
        `«${noWord.nombre}» no es un Word (.docx): la firma se pone en los Word.`,
      );
    }
    const yaFirmado = elegidos.find((a) => a.origen === 'firmado');
    if (yaFirmado) {
      throw new BadRequestException(`«${yaFirmado.nombre}» ya está firmado.`);
    }
    const extFirma = extensionDe(firma);
    const enElTallerFirma = `firma.${extFirma}`;
    const documentos = elegidos.map((a) => ({
      adjunto: a,
      enElTaller: `documento_${a.id}.docx`,
    }));

    return this.encargar(companyId, cuentaId, contexto.analisisId, {
      tipo: 'firma',
      oportunidadId,
      parametros: { adjuntos: elegidos.map((a) => a.id) },
      archivos: elegidos,
      noLeidos: [],
      plan: {
        sistema: instruccionesDeFirma(
          contexto.datos,
          documentos.map((d) => ({
            enElTaller: d.enElTaller,
            original: d.adjunto.nombre,
          })),
          enElTallerFirma,
        ),
        texto: 'Firma los documentos.',
        // Solo pega una imagen, y el motor descarta si cambió una letra:
        // Haiku, 40 veces más barato que Opus.
        modelo: MODELO_HAIKU,
        entradas: [
          ...documentos.map((d) => ({
            enElTaller: d.enElTaller,
            tipo: TIPO_WORD,
            ruta: d.adjunto.ruta,
          })),
          {
            enElTaller: enElTallerFirma,
            tipo: TIPOS_DE_IMAGEN[extFirma] ?? 'image/png',
            ruta: firma,
          },
        ],
        salidas: documentos.map((d) => ({
          enElTaller: `firmado_${d.adjunto.id}.docx`,
          nombre: `${sinExtension(d.adjunto.nombre).replace(/ - lleno$/i, '')} - firmado.docx`,
          origen: 'firmado',
          viene_de: d.adjunto.id,
          comparaCon: d.enElTaller,
        })),
        esfuerzo: 'medium',
        maxTokens: 32_000,
      },
    });
  }

  /** "Crear propuesta técnica": un Word nuevo que responde punto por punto
   *  a las especificaciones técnicas, con el logo y lo que vende la
   *  empresa. Sin precios. Necesita el análisis de las bases. */
  async crearPropuesta(
    companyId: number,
    cuentaId: string,
    oportunidadId: number,
  ): Promise<FilaDeGeneracion> {
    const ficha = await this.comprobar(companyId, oportunidadId);
    const contexto = await this.contexto(companyId, oportunidadId, ficha, true);
    if (!contexto.datos.bases || contexto.analisisId === null) {
      throw new BadRequestException(
        'Primero analiza las bases: la propuesta responde a lo que piden.',
      );
    }
    if (!contexto.oferente.razon_social) {
      throw new BadRequestException(
        'Primero llena los datos de la empresa en «Mi empresa».',
      );
    }
    const bases = await this.adjuntos.listar(companyId, oportunidadId, 'bases');
    const paraLeer: Adjunto[] = [];
    const noLeidos: NoLeido[] = [];
    let peso = 0;
    for (const a of [...bases].sort((x, y) =>
      x.creado_en.localeCompare(y.creado_en),
    )) {
      const ext = extensionDe(a.nombre);
      if (ext !== 'pdf' && ext !== 'docx') continue;
      if (peso + a.bytes > MAX_BYTES_DE_BASES_PARA_PROPUESTA) {
        noLeidos.push({
          nombre: a.nombre,
          motivo: 'no cupo: pesan más de 40 MB juntos',
        });
        continue;
      }
      peso += a.bytes;
      paraLeer.push(a);
    }
    const logo = this.urlDelLogo(contexto.logoUrl);
    const extLogo = logo ? extensionDe(new URL(logo).pathname) : '';
    const enElTallerLogo =
      logo && TIPOS_DE_IMAGEN[extLogo] ? `logo.${extLogo}` : null;
    const enElTaller = (a: Adjunto) => `bases_${a.id}.${extensionDe(a.nombre)}`;

    return this.encargar(companyId, cuentaId, contexto.analisisId, {
      tipo: 'propuesta',
      oportunidadId,
      parametros: {},
      archivos: paraLeer,
      noLeidos,
      plan: {
        sistema: instruccionesDePropuesta(
          contexto.datos,
          paraLeer.map((a) => ({
            enElTaller: enElTaller(a),
            original: a.nombre,
          })),
          enElTallerLogo,
        ),
        texto: 'Escribe la propuesta técnica.',
        // Es nota (30% en el Día del Funcionario): Opus.
        modelo: MODELO_OPUS,
        entradas: [
          ...(enElTallerLogo && logo
            ? [
                {
                  enElTaller: enElTallerLogo,
                  tipo: TIPOS_DE_IMAGEN[extLogo],
                  url: logo,
                  opcional: true,
                },
              ]
            : []),
          ...paraLeer.map((a) => ({
            enElTaller: enElTaller(a),
            tipo: a.tipo,
            ruta: a.ruta,
          })),
        ],
        salidas: [
          {
            enElTaller: 'propuesta.docx',
            nombre: `Propuesta técnica ${ficha.codigo}.docx`,
            origen: 'generado',
            viene_de: null,
          },
        ],
        esfuerzo: 'high',
        maxTokens: 64_000,
      },
    });
  }

  /** Por detrás: baja lo que va al taller, espera lo que entrega, lo revisa
   *  y lo guarda en «Mi postulación». Nunca lanza: lo que falle queda
   *  escrito en la fila, en palabras de la casa. */
  async ejecutar(
    companyId: number,
    generacionId: number,
    plan: Plan,
  ): Promise<void> {
    try {
      const archivos: ArchivoParaElTaller[] = [];
      const bajados = new Map<string, Buffer>();
      for (const e of plan.entradas) {
        const datos = e.ruta
          ? await this.repo.descargar(e.ruta)
          : await this.bajarLogo(e.url);
        if (!datos) {
          if (e.opcional) continue;
          throw new Error(`no se pudo bajar ${e.enElTaller}`);
        }
        bajados.set(e.enElTaller, datos);
        archivos.push({
          nombre: e.enElTaller,
          datos,
          tipo: e.tipo,
          verComoDocumento: e.verComoDocumento,
        });
      }

      const taller = await trabajarEnElTaller(this.cliente(), {
        modelo: plan.modelo,
        sistema: plan.sistema,
        texto: plan.texto,
        archivos,
        esfuerzo: plan.esfuerzo,
        maxTokens: plan.maxTokens,
        habilidades: plan.habilidades,
      });
      const informe = leerInforme(
        taller.archivos.find((a) => a.nombre === 'informe.json')?.datos,
      );
      const salidas = concretarSalidas(
        plan.salidas,
        taller.archivos.map((a) => a.nombre),
        new Map(informe?.documentos.map((d) => [d.archivo, d.titulo]) ?? []),
      );

      const documentos: Array<{
        adjunto_id: number;
        nombre: string;
        que_se_hizo: string;
        pendientes: string[];
      }> = [];
      const descartados: Array<{ nombre: string; motivo: string }> = [];
      const noEntregados: string[] = [];
      for (const s of salidas) {
        const hecho = taller.archivos.find((a) => a.nombre === s.enElTaller);
        if (!hecho) {
          noEntregados.push(s.nombre);
          continue;
        }
        const problema = problemaDelDocumento(
          hecho.datos,
          s.comparaCon ? bajados.get(s.comparaCon) : undefined,
        );
        if (problema) {
          descartados.push({ nombre: s.nombre, motivo: problema });
          continue;
        }
        try {
          const adjunto = await this.guardarEnLaPostulacion(
            companyId,
            generacionId,
            plan,
            s,
            hecho.datos,
          );
          const nota = informe?.documentos.find(
            (d) => d.archivo === s.enElTaller,
          );
          documentos.push({
            adjunto_id: adjunto.id,
            nombre: adjunto.nombre,
            que_se_hizo: nota?.que_se_hizo ?? '',
            pendientes: nota?.pendientes ?? [],
          });
        } catch (error) {
          this.logger.warn(
            `generación ${generacionId}: no se guardó ${s.nombre}: ${mensajeDe(error)}`,
          );
          descartados.push({ nombre: s.nombre, motivo: 'no se pudo guardar' });
        }
      }

      const costo = costoDelUso(taller.uso, plan.modelo);
      const tokens = {
        tokens_entrada:
          taller.uso.entrada + taller.uso.cacheEscrita + taller.uso.cacheLeida,
        tokens_salida: taller.uso.salida,
        costo_usd: costo,
      };
      const resultado = {
        resumen: informe?.resumen || taller.texto.slice(0, 2000),
        documentos,
        pendientes: informe?.pendientes ?? [],
        descartados,
        no_entregados: noEntregados,
      };
      if (documentos.length === 0) {
        await this.repo.terminar(companyId, generacionId, {
          estado: 'error',
          resultado,
          ...tokens,
          error: this.porQueNoEntrego(taller.motivo, descartados.length),
        });
        return;
      }
      await this.repo.terminar(companyId, generacionId, {
        estado: 'listo',
        resultado,
        ...tokens,
      });
      this.logger.info(
        `generación ${generacionId} (${plan.tipo}) lista: ${documentos.length} documentos, US$${costo}`,
      );
    } catch (error) {
      this.logger.warn(`generación ${generacionId}: ${mensajeDe(error)}`);
      await this.repo
        .terminar(companyId, generacionId, {
          estado: 'error',
          error: errorDeIA(error, 'No se pudo terminar el trabajo'),
        })
        .catch((e) =>
          this.logger.error(
            `no pude anotar el error de la generación ${generacionId}: ${mensajeDe(e)}`,
          ),
        );
    }
  }

  private porQueNoEntrego(motivo: string | null, descartados: number): string {
    if (descartados > 0) {
      return 'Lo que entregó la IA no pasó la revisión: mira el detalle.';
    }
    if (motivo === 'max_tokens' || motivo === 'pause_turn') {
      return 'El trabajo era muy largo y la IA no alcanzó a terminar: vuelve a intentar con menos documentos.';
    }
    if (motivo === 'refusal') return 'La IA no quiso hacer este trabajo.';
    return 'La IA no entregó ningún documento.';
  }

  /** Lo de siempre antes de encargar: la llave y que la oportunidad sea de
   *  la empresa. */
  private async comprobar(companyId: number, oportunidadId: number) {
    if (!process.env.ANTHROPIC_API_KEY?.trim()) {
      throw new BadRequestException('Falta la llave de Anthropic en el motor.');
    }
    const ficha = await this.oportunidades.ficha(companyId, oportunidadId);
    if (!ficha) throw new NotFoundException('No encontramos esa oportunidad.');
    return ficha;
  }

  /** Lo que lee la IA de la licitación, la empresa y el último análisis
   *  listo de las bases. `conEventia`: también la carta y los eventos
   *  realizados de los últimos 4 años (anexos y propuesta; la firma no los
   *  necesita). */
  private async contexto(
    companyId: number,
    oportunidadId: number,
    ficha: NonNullable<Awaited<ReturnType<OportunidadesRepository['ficha']>>>,
    conEventia = false,
  ) {
    const hoy = hoyEnChile();
    const haceCuatroAnios = `${Number(hoy.slice(0, 4)) - 4}${hoy.slice(4)}`;
    const [analisis, oferente, empresa, carta, eventos] = await Promise.all([
      this.analisis.ultimo(companyId, oportunidadId),
      this.oferente.oferente(companyId),
      this.oferente.empresa(companyId),
      conEventia ? this.eventia.carta(companyId) : Promise.resolve(null),
      conEventia
        ? this.eventia.eventosRealizados(companyId, haceCuatroAnios)
        : Promise.resolve([]),
    ]);
    const listo =
      analisis?.estado === 'listo' && analisis.resultado ? analisis : null;
    const datos: ContextoDeGeneracion = {
      codigo: ficha.codigo,
      nombre: ficha.proceso.nombre,
      organismo: ficha.proceso.organismo,
      fecha_cierre: ficha.proceso.fecha_cierre,
      hoy,
      hoyLargo: fechaLarga(),
      oferente: {
        razon_social: null,
        rut: null,
        giro: null,
        direccion: null,
        comuna: null,
        region: null,
        telefono: null,
        correo: null,
        representante_nombre: null,
        representante_rut: null,
        representante_cargo: null,
        experiencia: null,
        instalaciones: null,
        firma_ruta: null,
        firma_subida_en: null,
        ...(oferente ?? {}),
      },
      empresa,
      bases: loQuePidenLasBases(listo?.resultado ?? null),
      carta,
      eventos,
    };
    return {
      datos,
      oferente: datos.oferente,
      analisisId: listo?.id ?? null,
      logoUrl: empresa?.logo_url ?? null,
    };
  }

  /** Crea la fila "procesando" y deja el trabajo andando por detrás. Si ya
   *  había uno del mismo tipo en curso, devuelve ese. */
  private async encargar(
    companyId: number,
    cuentaId: string,
    analisisId: number | null,
    e: {
      tipo: TipoDeGeneracion;
      oportunidadId: number;
      parametros: Record<string, unknown>;
      archivos: Adjunto[];
      noLeidos: NoLeido[];
      plan: Omit<Plan, 'tipo' | 'oportunidadId' | 'perfil'>;
    },
  ): Promise<FilaDeGeneracion> {
    const perfil = await this.adjuntos.perfilDe(companyId, cuentaId);
    await this.repo.abandonarAntesDe(companyId, e.oportunidadId, ENCENDIDO);
    const fila = await this.repo.crearGeneracion({
      company_id: companyId,
      oportunidad_id: e.oportunidadId,
      tipo: e.tipo,
      analisis_id: analisisId,
      parametros: e.parametros,
      modelo: e.plan.modelo,
      archivos: e.archivos.map((a) => ({ id: a.id, nombre: a.nombre })),
      no_leidos: e.noLeidos,
      pedido_por: perfil,
    });
    if (!fila) {
      const enCurso = await this.repo.ultimoDeTipo(
        companyId,
        e.oportunidadId,
        e.tipo,
      );
      if (enCurso) return enCurso;
      throw new BadRequestException('Ya hay un trabajo de ese tipo en curso.');
    }
    void this.ejecutar(companyId, fila.id, {
      ...e.plan,
      tipo: e.tipo,
      oportunidadId: e.oportunidadId,
      perfil,
    });
    return fila;
  }

  private async guardarEnLaPostulacion(
    companyId: number,
    generacionId: number,
    plan: Plan,
    salida: Salida,
    datos: Buffer,
  ) {
    const nombre = nombreLimpio(salida.nombre);
    const ruta = `c${companyId}/oportunidades/${plan.oportunidadId}/postulacion/${sello()}_${sanitize(nombre)}`;
    await this.adjuntos.subirArchivo(ruta, datos, TIPO_WORD);
    try {
      return await this.adjuntos.guardar({
        company_id: companyId,
        oportunidad_id: plan.oportunidadId,
        nombre,
        ruta,
        tipo: TIPO_WORD,
        bytes: datos.length,
        seccion: 'postulacion',
        subido_por: plan.perfil,
        origen: salida.origen,
        viene_de: salida.viene_de,
        generacion_id: generacionId,
      });
    } catch (error) {
      // Sin su fila nadie lo vería: que no quede un archivo huérfano.
      await this.adjuntos.borrarArchivo(ruta);
      throw error;
    }
  }

  /** El logo solo se baja del balde público de la casa: una URL cualquiera
   *  haría que el motor le pida cosas a quien sea. */
  private urlDelLogo(url: string | null): string | null {
    const base = process.env.SUPABASE_URL?.replace(/\/+$/, '');
    if (!url || !base) return null;
    return url.startsWith(`${base}/storage/v1/object/public/`) ? url : null;
  }

  private async bajarLogo(url?: string): Promise<Buffer | null> {
    if (!url) return null;
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(10_000) });
      if (!r.ok) return null;
      const datos = Buffer.from(await r.arrayBuffer());
      return datos.length > 0 && datos.length <= MAX_BYTES_LOGO ? datos : null;
    } catch (error) {
      this.logger.warn(`no se pudo bajar el logo: ${mensajeDe(error)}`);
      return null;
    }
  }
}
