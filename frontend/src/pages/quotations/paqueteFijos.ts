import type { ServiceGroupCollection } from "../../types/serviceGroupCollections.types";

/**
 * LOS FIJOS DEL PAQUETE (Felipe 28-08: "el salón y la decoración SON
 * parte del paquete"). Pieza PURA fuera del gigante congelado: traduce
 * los fijos guardados en un paquete a la forma que el formulario usa
 * para un fijo elegido, buscándolos en el catálogo vivo (precio y
 * categoría de HOY, no la foto del paquete).
 */

/** La forma del catálogo de fijos que ya usa el formulario. */
export interface FijoDeCatalogo {
  codigo: string;
  nombre: string;
  categoria?: string;
  tipo_calculo?: string;
  min_precio?: number;
  max_precio?: number;
  precio_por_persona?: number;
  precio?: number;
  is_active?: boolean;
}

/** La forma de un fijo ELEGIDO en el formulario (espejo local del
 *  SelectedFixedService del cotizador; tipado estructural). */
export interface FijoElegidoDelPaquete {
  codigo: string;
  nombre: string;
  precio_calculado: number;
  categoria: string;
  quantity: number;
  tipo_calculo: string;
  min_precio: number;
  max_precio: number;
  precio_por_persona: number;
}

export const fijosDelPaquete = <T extends FijoDeCatalogo>(
  collection: ServiceGroupCollection,
  catalogo: readonly T[],
  calcular: (s: T) => number,
): FijoElegidoDelPaquete[] =>
  (collection.fixed_services ?? []).flatMap((f) => {
    if (!f.service) return [];
    const svc = catalogo.find((s) => s.codigo === String(f.service?.id));
    // Si el fijo salió del catálogo desde que se armó el paquete, se
    // salta: nunca se inventa un precio.
    if (!svc) return [];
    return [
      {
        codigo: svc.codigo,
        nombre: svc.nombre,
        precio_calculado: calcular(svc),
        categoria: svc.categoria || "General",
        quantity: f.quantity || 1,
        tipo_calculo: svc.tipo_calculo || "fijo",
        min_precio: svc.min_precio || 0,
        max_precio: svc.max_precio || 0,
        precio_por_persona: svc.precio_por_persona || 0,
      },
    ];
  });
