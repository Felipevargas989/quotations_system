import { Injectable, Optional } from '@nestjs/common';
import { AdjuntosRepository } from '../adjuntos/adjuntos.repository';
import { LicifyService } from '../adjuntos/licify.service';
import {
  AnalisisRepository,
  type EstadoDeAnalisis,
  type TrabajoLiviano,
  ValidacionRepository,
} from '../analisis/analisis.repository';
import {
  type ResultadoDeLaEmpresa,
  type ResultadoPublico,
  resultadoParaLaEmpresa,
} from '../competencia/resultado-compra-agil';
import { ResultadosRepository } from '../competencia/resultados.repository';
import { GeneracionRepository } from '../generacion/generacion.repository';
import { OferenteRepository } from '../oferente/oferente.repository';
import {
  type FilaDeLista,
  OportunidadesRepository,
} from '../oportunidades.repository';
import { type ServicioDeLaGanada, servicioDe } from './servicio-de-la-ganada';

// "MIS LICITACIONES" (Felipe, 17-10: "¿dónde van a quedar compiladas las
// que sí me interesan para luego trabajarlas?"). Las que la empresa marcó
// —en estudio, postuladas, ganadas o perdidas— con el avance de cada una:
// bases subidas, análisis, anexos, firma y validación. Todo de la empresa
// de la sesión; nada de esto llama a la IA.

export type Avance = {
  /** Archivos en «Bases y anexos». */
  bases: number;
  /** «Traer los documentos» corriendo en el motor (23-10): la etapa Bases
   *  gira hasta que termine. */
  trayendo: boolean;
  analisis: EstadoDeAnalisis | null;
  /** El último "Generar anexos" y la última propuesta técnica. */
  anexos: EstadoDeAnalisis | null;
  propuesta: EstadoDeAnalisis | null;
  /** «1. Qué ofreces» de «Armar postulación» (23-10): la etapa Anexos gira
   *  también mientras la IA arma la oferta, que va antes que los anexos. */
  oferta: EstadoDeAnalisis | null;
  /** En «Mi postulación»: todo, lo hecho por la IA sin firma (un Word que
   *  ya tiene su firmado no cuenta: desde la decisión 58 se borra al
   *  firmar) y lo firmado. */
  postulacion: number;
  generados: number;
  firmados: number;
  validacion: {
    estado: EstadoDeAnalisis;
    listo: 'si' | 'casi' | 'no' | null;
  } | null;
};

export type MiLicitacion = FilaDeLista & {
  avance: Avance;
  /** Ganada o perdida (decisión 92): a quién eligieron, por cuánto y cómo
   *  quedó la empresa por precio. */
  resultado: ResultadoDeLaEmpresa | null;
  /** Ganada (decisión 100): cuándo es el servicio, para la pestaña
   *  «Ganadas». null en las demás. */
  servicio: ServicioDeLaGanada | null;
};

const instante = (iso: string | null) =>
  iso ? new Date(iso).getTime() : Number.MAX_SAFE_INTEGER;

/** El más nuevo de cada oportunidad (y tipo): llegan del más nuevo al más
 *  viejo. */
const elUltimo = (trabajos: TrabajoLiviano[], tipo?: string) => {
  const porOportunidad = new Map<number, TrabajoLiviano>();
  for (const t of trabajos) {
    if (tipo && t.tipo !== tipo) continue;
    if (!porOportunidad.has(t.oportunidad_id)) {
      porOportunidad.set(t.oportunidad_id, t);
    }
  }
  return porOportunidad;
};

const LISTOS = new Set(['si', 'casi', 'no']);

@Injectable()
export class MisLicitacionesService {
  constructor(
    private readonly oportunidades: OportunidadesRepository,
    private readonly adjuntos: AdjuntosRepository,
    private readonly analisis: AnalisisRepository,
    private readonly validacion: ValidacionRepository,
    private readonly generacion: GeneracionRepository,
    private readonly licify: LicifyService,
    /** El resultado de las compras ágiles (decisión 92), con el RUT de la
     *  empresa. Opcionales: las pruebas de antes no los traen. */
    @Optional() private readonly resultados?: ResultadosRepository,
    @Optional() private readonly oferente?: OferenteRepository,
  ) {}

  /** De la que cierra antes a la que cierra después. */
  async mias(companyId: number): Promise<MiLicitacion[]> {
    const filas = await this.oportunidades.mias(companyId);
    if (filas.length === 0) return [];
    const ids = filas.map((f) => f.id);
    const conResultado = filas.filter(
      (f) => f.estado === 'ganada' || f.estado === 'perdida',
    );
    const terminadas = conResultado.map((f) => f.codigo);
    const ganadas = filas.filter((f) => f.estado === 'ganada');
    const [
      archivos,
      analisis,
      validaciones,
      generaciones,
      resultados,
      rut,
      criterios,
      servicios,
    ] = await Promise.all([
      this.adjuntos.origenesDe(companyId, ids),
      this.analisis.ultimosDe(companyId, ids),
      this.validacion.ultimosDe(companyId, ids),
      this.generacion.ultimosDe(companyId, ids),
      this.resultados?.resultadosDe(terminadas) ??
        new Map<string, ResultadoPublico>(),
      terminadas.length > 0
        ? this.oferente?.oferente(companyId).then((o) => o?.rut ?? null)
        : null,
      // Decisión 97: en una compra ágil, el lugar por precio solo con el
      // criterio de la ley.
      this.analisis.criteriosDe(
        companyId,
        conResultado.map((f) => f.id),
      ),
      // Decisión 100: cuándo es el servicio de cada ganada.
      this.analisis.serviciosDe(
        companyId,
        ganadas.map((f) => f.id),
      ),
    ]);
    const ultimoAnalisis = elUltimo(analisis);
    const ultimaValidacion = elUltimo(validaciones);
    const ultimosAnexos = elUltimo(generaciones, 'anexos');
    const ultimaPropuesta = elUltimo(generaciones, 'propuesta');
    const ultimaOferta = elUltimo(generaciones, 'oferta');

    return filas
      .map((f) => {
        const suyos = archivos.filter((a) => a.oportunidad_id === f.id);
        const enLaPostulacion = suyos.filter(
          (a) => a.seccion === 'postulacion',
        );
        const v = ultimaValidacion.get(f.id);
        return {
          ...f,
          resultado: resultadoParaLaEmpresa(
            resultados.get(f.codigo),
            rut,
            criterios.get(f.id),
          ),
          servicio:
            f.estado === 'ganada'
              ? servicioDe(servicios.get(f.id), f.proceso.fecha_cierre)
              : null,
          avance: {
            bases: suyos.filter((a) => a.seccion === 'bases').length,
            trayendo: this.licify.estaTrayendo(companyId, f.id),
            analisis: ultimoAnalisis.get(f.id)?.estado ?? null,
            anexos: ultimosAnexos.get(f.id)?.estado ?? null,
            propuesta: ultimaPropuesta.get(f.id)?.estado ?? null,
            oferta: ultimaOferta.get(f.id)?.estado ?? null,
            postulacion: enLaPostulacion.length,
            generados: enLaPostulacion.filter(
              (a) =>
                a.origen === 'generado' &&
                !enLaPostulacion.some(
                  (f) => f.origen === 'firmado' && f.viene_de === a.id,
                ),
            ).length,
            firmados: enLaPostulacion.filter((a) => a.origen === 'firmado')
              .length,
            validacion: v
              ? {
                  estado: v.estado,
                  listo:
                    v.listo && LISTOS.has(v.listo)
                      ? (v.listo as 'si' | 'casi' | 'no')
                      : null,
                }
              : null,
          },
        };
      })
      .sort(
        (a, b) =>
          instante(a.proceso.fecha_cierre) - instante(b.proceso.fecha_cierre),
      );
  }
}
