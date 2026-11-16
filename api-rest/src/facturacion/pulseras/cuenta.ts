/**
 * LA CUENTA DE LAS PULSERAS (doc 19 §9.49). Pura: no lee la base.
 *
 * Felipe, 16-11-2026: *"llevar un control de stock para saber que lo que se
 * ha vendido es lo que se ha cobrado"*.
 *
 * - Entregadas: lo que se le pasó a recepción (`entregas_de_pulseras`).
 * - Vendidas: una pulsera por cada unidad de un ítem con «Usa pulsera» en
 *   cada solicitud de recepción, en cualquier estado: la rechazada también
 *   (la venta no depende del documento, §9.45 y §9.46). Se cuenta la
 *   solicitud y no su documento, así nada se cuenta dos veces.
 * - Lo emitido directo por operaciones o el administrador en «Nuevo DTE»
 *   (sin solicitud: no tiene turno) también descuenta (Felipe, 16-11: *"si
 *   que se descuente"*), una vez, y entra al turno que cierra después de
 *   su emisión. Lo decide UNA función: `descuentaDeRecepcion`.
 * - El control parte con la primera entrega: lo vendido antes no cuenta.
 * - En cada cierre con conteo: deberían quedar = lo contado en el cierre
 *   anterior + lo entregado desde entonces − lo vendido desde entonces. La
 *   diferencia es contadas − deberían (negativa: faltan). Un cierre sin
 *   conteo (nulo, no cero) no corta: lo suyo pasa al siguiente.
 * - Arriba: entregadas − vendidas = deberían quedar ahora; contadas es el
 *   último conteo, y su diferencia la de ese cierre contra todo lo de antes
 *   (la suma de las diferencias de cada cierre).
 */

export interface EntregaDePulseras {
  id: number;
  cantidad: number;
  created_at: string;
  entregada_por_nombre: string;
}

export interface TurnoConPulseras {
  id: number;
  abierta_en: string;
  cerrada_en: string | null;
  abierta_por_nombre: string;
  cerrada_por_nombre: string | null;
  pulseras_contadas: number | null;
}

export interface VentaConPulseras {
  /** Una solicitud de recepción, o un documento emitido directo. */
  origen: 'solicitud' | 'directa';
  turno_de_caja_id: number | null;
  created_at: string;
  pulseras: number;
}

export interface CierreConPulseras {
  id: number;
  abierta_en: string;
  cerrada_en: string | null;
  abierta_por_nombre: string;
  cerrada_por_nombre: string | null;
  entregadas: number;
  vendidas: number;
  deberian: number | null;
  contadas: number | null;
  diferencia: number | null;
}

export interface CuentaDePulseras {
  entregadas: number;
  vendidas: number;
  deberian_quedar: number;
  contadas: number | null;
  contadas_en: string | null;
  diferencia: number | null;
  /** Las ventas directas (sin solicitud), para el movimiento. */
  ventas_directas: { created_at: string; pulseras: number }[];
  turnos: CierreConPulseras[];
}

/** LA función que decide si una venta descuenta del stock de recepción.
 *  Felipe, 16-11: la solicitud y lo emitido directo, las dos. */
export const descuentaDeRecepcion = (v: Pick<VentaConPulseras, 'origen'>) =>
  v.origen === 'solicitud' || v.origen === 'directa';

/** Las pulseras de un documento o solicitud: la cantidad de cada línea de
 *  un ítem con «Usa pulsera». Una unidad = una pulsera. */
export const pulserasDe = (
  detalle: { cantidad?: number | null; tarifario_id?: number | null }[] | null,
  conPulsera: Set<number>,
) =>
  (detalle ?? []).reduce(
    (s, l) =>
      l.tarifario_id != null && conPulsera.has(Number(l.tarifario_id))
        ? s + Math.max(0, Number(l.cantidad ?? 0))
        : s,
    0,
  );

const ms = (iso: string) => Date.parse(iso);

export const contarPulseras = (
  entregas: EntregaDePulseras[],
  turnos: TurnoConPulseras[],
  ventas: VentaConPulseras[],
): CuentaDePulseras => {
  const vacia: CuentaDePulseras = {
    entregadas: 0,
    vendidas: 0,
    deberian_quedar: 0,
    contadas: null,
    contadas_en: null,
    diferencia: null,
    ventas_directas: [],
    turnos: [],
  };
  if (!entregas.length) return vacia;
  const ordenadas = [...entregas].sort(
    (a, b) => ms(a.created_at) - ms(b.created_at) || a.id - b.id,
  );
  const inicio = ms(ordenadas[0].created_at);
  const cerradosAntes = (t: TurnoConPulseras) =>
    t.cerrada_en != null && ms(t.cerrada_en) < inicio;
  const enOrden = [...turnos]
    .filter((t) => !cerradosAntes(t))
    .sort((a, b) => ms(a.abierta_en) - ms(b.abierta_en) || a.id - b.id);

  const delControl = ventas.filter((v) => ms(v.created_at) >= inicio);
  const descontadas = delControl.filter(descuentaDeRecepcion);

  // A qué turno va cada venta: la de recepción, al suyo; la directa (sin
  // turno), al primero que cierra después de su emisión (o al abierto).
  const turnoDe = (v: VentaConPulseras): number | null => {
    if (v.turno_de_caja_id != null) return v.turno_de_caja_id;
    const t = enOrden.find(
      (x) => x.cerrada_en == null || ms(x.cerrada_en) >= ms(v.created_at),
    );
    return t?.id ?? null;
  };
  const porTurno = new Map<number, number>();
  for (const v of descontadas) {
    const id = turnoDe(v);
    if (id != null) porTurno.set(id, (porTurno.get(id) ?? 0) + v.pulseras);
  }

  let base = 0;
  let entregadasDesde = 0;
  let vendidasDesde = 0;
  let acumE = 0;
  let acumV = 0;
  let anterior = -Infinity;
  let ultimo: {
    contadas: number;
    en: string;
    diferencia: number;
  } | null = null;
  const filas: CierreConPulseras[] = [];
  for (const t of enOrden) {
    const hasta = t.cerrada_en == null ? Infinity : ms(t.cerrada_en);
    const entregadas = ordenadas
      .filter((e) => ms(e.created_at) > anterior && ms(e.created_at) <= hasta)
      .reduce((s, e) => s + e.cantidad, 0);
    const vendidas = porTurno.get(t.id) ?? 0;
    entregadasDesde += entregadas;
    vendidasDesde += vendidas;
    acumE += entregadas;
    acumV += vendidas;
    let deberian: number | null = null;
    let diferencia: number | null = null;
    if (t.cerrada_en != null && t.pulseras_contadas != null) {
      deberian = base + entregadasDesde - vendidasDesde;
      diferencia = t.pulseras_contadas - deberian;
      base = t.pulseras_contadas;
      entregadasDesde = 0;
      vendidasDesde = 0;
      ultimo = {
        contadas: t.pulseras_contadas,
        en: t.cerrada_en,
        diferencia: t.pulseras_contadas - (acumE - acumV),
      };
    }
    filas.push({
      id: t.id,
      abierta_en: t.abierta_en,
      cerrada_en: t.cerrada_en,
      abierta_por_nombre: t.abierta_por_nombre,
      cerrada_por_nombre: t.cerrada_por_nombre,
      entregadas,
      vendidas,
      deberian,
      contadas: t.pulseras_contadas,
      diferencia,
    });
    anterior = hasta;
  }

  const entregadas = ordenadas.reduce((s, e) => s + e.cantidad, 0);
  const vendidas = descontadas.reduce((s, v) => s + v.pulseras, 0);
  return {
    entregadas,
    vendidas,
    deberian_quedar: entregadas - vendidas,
    contadas: ultimo?.contadas ?? null,
    contadas_en: ultimo?.en ?? null,
    diferencia: ultimo?.diferencia ?? null,
    ventas_directas: delControl
      .filter((v) => v.origen === 'directa')
      .map((v) => ({ created_at: v.created_at, pulseras: v.pulseras })),
    turnos: filas.reverse(),
  };
};
