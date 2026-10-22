import { Injectable } from '@nestjs/common';
import { AdjuntosRepository } from '../adjuntos/adjuntos.repository';
import {
  AnalisisRepository,
  type EstadoDeAnalisis,
  type TrabajoLiviano,
  ValidacionRepository,
} from '../analisis/analisis.repository';
import { GeneracionRepository } from '../generacion/generacion.repository';
import {
  type FilaDeLista,
  OportunidadesRepository,
} from '../oportunidades.repository';

// "MIS LICITACIONES" (Felipe, 17-10: "¿dónde van a quedar compiladas las
// que sí me interesan para luego trabajarlas?"). Las que la empresa marcó
// —en estudio, postuladas, ganadas o perdidas— con el avance de cada una:
// bases subidas, análisis, anexos, firma y validación. Todo de la empresa
// de la sesión; nada de esto llama a la IA.

export type Avance = {
  /** Archivos en «Bases y anexos». */
  bases: number;
  analisis: EstadoDeAnalisis | null;
  /** El último "Generar anexos" y la última propuesta técnica. */
  anexos: EstadoDeAnalisis | null;
  propuesta: EstadoDeAnalisis | null;
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

export type MiLicitacion = FilaDeLista & { avance: Avance };

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
  ) {}

  /** De la que cierra antes a la que cierra después. */
  async mias(companyId: number): Promise<MiLicitacion[]> {
    const filas = await this.oportunidades.mias(companyId);
    if (filas.length === 0) return [];
    const ids = filas.map((f) => f.id);
    const [archivos, analisis, validaciones, generaciones] = await Promise.all([
      this.adjuntos.origenesDe(companyId, ids),
      this.analisis.ultimosDe(companyId, ids),
      this.validacion.ultimosDe(companyId, ids),
      this.generacion.ultimosDe(companyId, ids),
    ]);
    const ultimoAnalisis = elUltimo(analisis);
    const ultimaValidacion = elUltimo(validaciones);
    const ultimosAnexos = elUltimo(generaciones, 'anexos');
    const ultimaPropuesta = elUltimo(generaciones, 'propuesta');

    return filas
      .map((f) => {
        const suyos = archivos.filter((a) => a.oportunidad_id === f.id);
        const enLaPostulacion = suyos.filter(
          (a) => a.seccion === 'postulacion',
        );
        const v = ultimaValidacion.get(f.id);
        return {
          ...f,
          avance: {
            bases: suyos.filter((a) => a.seccion === 'bases').length,
            analisis: ultimoAnalisis.get(f.id)?.estado ?? null,
            anexos: ultimosAnexos.get(f.id)?.estado ?? null,
            propuesta: ultimaPropuesta.get(f.id)?.estado ?? null,
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
