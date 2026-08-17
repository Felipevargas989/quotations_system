/**
 * EL COSTO DE LOS RECURSOS DE UN EVENTO — UNA SOLA CUENTA.
 *
 * La regla está escrita en docs/arquitectura/10_MODULO_DE_PERSONAS.md
 * (cap. "El costo se calcula por EVENTO, no por día"):
 *
 * | Tipo                | Fórmula                                    |
 * |---------------------|--------------------------------------------|
 * | Solo fijo (toldo)   | fijo × unidades-día                        |
 * | Solo variable       | variable × personas × unidades-día         |
 * | Mixto (catering)    | fijo UNA VEZ + variable × personas × días  |
 *
 * El "fijo una vez" es lo que se olvidaba: un catering con $50.000 de
 * instalación y $1.000 por persona no cobra la instalación de nuevo
 * cada día. Repartir ese recurso en dos días cobraba $100.000 de
 * instalación.
 *
 * Vivía copiada en tres pantallas y en la revisión del 16-08 se
 * encontró que solo una estaba al día: Gestión cobraba el fijo una vez
 * y Servicios y el Dashboard seguían cobrándolo por línea, así que el
 * mismo evento mostraba dos costos distintos en dos pestañas de la
 * misma ventana. Por eso ahora vive acá y no allá.
 */
export interface LineaDeRecurso {
  resource_id: number;
  price_fixed?: number | string | null;
  price_per_person?: number | string | null;
  quantity?: number | string | null;
}

const num = (v: number | string | null | undefined) => Number(v) || 0;

export const costoDeRecursos = (
  lineas: readonly LineaDeRecurso[],
  personas: number,
): number => {
  const grupos = new Map<
    number,
    { pp: number; fijo: number; unidades: number; sumaFijoPorLinea: number }
  >();

  for (const l of lineas) {
    const g = grupos.get(l.resource_id) ?? {
      pp: 0,
      fijo: 0,
      unidades: 0,
      sumaFijoPorLinea: 0,
    };
    g.pp = Math.max(g.pp, num(l.price_per_person));
    if (!g.fijo) g.fijo = num(l.price_fixed);
    g.unidades += num(l.quantity);
    g.sumaFijoPorLinea += num(l.price_fixed) * num(l.quantity);
    grupos.set(l.resource_id, g);
  }

  let total = 0;
  for (const g of grupos.values()) {
    if (g.pp > 0) total += g.fijo + g.pp * personas * g.unidades;
    // Sin parte variable, cada línea con su propio valor × cantidad:
    // así el personal, que va a valores distintos por día y por persona,
    // suma exacto en vez de promediarse.
    else total += g.sumaFijoPorLinea;
  }
  return total;
};
