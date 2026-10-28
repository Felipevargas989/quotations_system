import type { ProcesoDeLaZona } from '../historia/mercado';
import type { ProcesoParaLeer } from '../lectura/lectura.service';

// EL MERCADO DE LA ZONA (decisión 106 del doc 17). Felipe: «se viene y el
// competidor es en quién ganó. Deberían actualizarse». Las licitaciones del
// mercado de ChileCompra (decisión 101) con la forma que ya usan «Se viene»
// y los competidores: así sus funciones no cambian. Funciones puras.

/** Una fila de la vista `mercado_licitaciones_con_ganadores` (migración 169). */
export type FilaDeLaZona = {
  codigo: string;
  nombre: string | null;
  organismo: string | null;
  organismo_codigo: string | null;
  unidad: string | null;
  comuna: string | null;
  region: string | null;
  fecha_publicacion: string | null;
  fecha_cierre: string | null;
  monto_estimado: number | string | null;
  oferentes: number | null;
  rubros: string[] | null;
  ganadores: Array<{
    rut: string | null;
    nombre: string | null;
    cantidad: number | null;
    monto_unitario: number | string | null;
  }> | null;
};

const numeroONulo = (n: number | string | null | undefined): number | null => {
  if (n === null || n === undefined || n === '') return null;
  const v = Number(n);
  return Number.isFinite(v) ? v : null;
};

/** Como un proceso de la historia del radar: el monto estimado y, si hubo
 *  ganadores, la adjudicación con lo que se llevó cada uno. */
export const procesoDeLaZona = (f: FilaDeLaZona): ProcesoDeLaZona => ({
  codigo: f.codigo,
  nombre: f.nombre ?? '',
  organismo: f.organismo,
  organismo_codigo: f.organismo_codigo,
  unidad: f.unidad,
  comuna: f.comuna,
  region: f.region,
  fecha_publicacion: f.fecha_publicacion,
  monto: numeroONulo(f.monto_estimado),
  adjudicacion:
    (f.ganadores?.length ?? 0) > 0 || f.oferentes !== null
      ? {
          oferentes: f.oferentes,
          url_acta: null,
          ganadores: (f.ganadores ?? []).map((g) => ({
            rut: g.rut,
            nombre: g.nombre,
            cantidad: g.cantidad ?? 1,
            monto_unitario: numeroONulo(g.monto_unitario),
          })),
        }
      : null,
});

/** Lo que la IA de «Se viene» lee de una licitación que el radar no
 *  guardó: sin descripción, con los rubros de lo que se compró. */
export const procesoParaLeer = (f: FilaDeLaZona): ProcesoParaLeer => ({
  codigo: f.codigo,
  tipo: 'licitacion',
  nombre: f.nombre ?? '',
  descripcion: null,
  organismo: f.organismo,
  unidad: f.unidad,
  comuna: f.comuna,
  region: f.region,
  monto: numeroONulo(f.monto_estimado),
  fecha_cierre: f.fecha_cierre,
  productos: (f.rubros ?? []).map((nombre) => ({ nombre })),
});
