/**
 * CUOTAS QUE SE LLENAN — el reparto de un cambio de total
 * (docs/arquitectura/14_CUOTAS_QUE_SE_LLENAN.md, reglas 4 a 7;
 * Felipe, 07-10-2026).
 *
 * Cuando una cotización aceptada cambia de total (suben o bajan las
 * personas, se agrega o quita un servicio), la diferencia se reparte
 * entre las cuotas que todavía no se pagan, EN PROPORCIÓN A SU SALDO
 * (lo que les falta). Lo abonado nunca se toca.
 *
 * - BAJA: participan todas las cuotas con saldo, vencidas incluidas
 *   (favorece al cliente). Lo que no cabe es reembolso.
 * - SUBE: participan solo las que NO han vencido (opción B de Felipe:
 *   "una cuota vencida no amanece debiendo más"). Sin ninguna, el
 *   llamador crea una cuota nueva.
 * - Nunca una cuota en $0: la que se queda sin saldo y sin abonos se
 *   borra; la que tenía abonos queda pagada por lo abonado.
 * - Al peso: lo que sobra del reparto se asigna de a un peso desde la
 *   última cuota que participa hacia atrás, sin pasar nunca su saldo.
 *
 * Es PURA a propósito: decide qué hacer y el servicio lo ejecuta. Así
 * cada caso borde se prueba sin base de datos.
 *
 * Antes (regla 16 del mapa 03): la rebaja se descontaba desde la
 * ÚLTIMA cuota hacia atrás y el alza se cargaba entera en la última;
 * una cuota sin abonos que se vaciaba quedaba en $0 (cotización 506,
 * 07-10-2026).
 */

export interface CuotaParaRepartir {
  id: string;
  payment_number: number;
  /** Monto de la cuota. Supabase lo entrega como texto: se convierte. */
  amount: number | string;
  /** Lo ya abonado a esta cuota. */
  abonado: number;
  /** YYYY-MM-DD o fecha ISO. */
  due_date: string | Date | null;
}

export interface CambioDeCuota {
  id: string;
  amount: number;
  /** El saldo quedó en cero y tenía abonos: pasa a pagada. */
  pagada: boolean;
}

export interface RepartoDelCambio {
  /** Cuotas que cambian de monto (y quizás quedan pagadas). */
  cambios: CambioDeCuota[];
  /** Cuotas sin abonos que se quedaron sin saldo: se borran. */
  borrar: string[];
  /** BAJA: lo que no cupo en las cuotas → reembolso. */
  reembolso: number;
  /** SUBE: lo que no tuvo dónde ir → cuota nueva. */
  cuotaNueva: number;
}

/** Hoy en Chile como YYYY-MM-DD: la cuota "vence hoy" según el reloj
 *  de quien cobra, no según UTC (a las 21:30 de Chile ya es mañana). */
export const hoyEnChile = (ahora: Date = new Date()) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Santiago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(ahora);

const pesos = (n: number | string) => Math.round(Number(n) || 0);

const saldoDe = (c: CuotaParaRepartir) =>
  Math.max(0, pesos(c.amount) - pesos(c.abonado));

/** La fecha de la cuota como YYYY-MM-DD (las cuotas viven en UTC). */
const diaDe = (d: CuotaParaRepartir['due_date']) =>
  d ? new Date(d).toISOString().slice(0, 10) : '';

/**
 * Reparte `total` en proporción a cada tope (el saldo de cada cuota) sin
 * pasar nunca ese tope. Exige `total <= suma de topes`, y entonces lo
 * repartido suma exactamente `total`.
 */
const repartirEnProporcion = (topes: number[], total: number): number[] => {
  const suma = topes.reduce((s, t) => s + t, 0);
  if (suma <= 0 || total <= 0) return topes.map(() => 0);
  const partes = topes.map((t) => Math.floor((total * t) / suma));
  let resto = total - partes.reduce((s, p) => s + p, 0);
  // El resto (menos de un peso por cuota) va de a un peso desde la
  // última hacia atrás, solo a las que todavía tienen espacio. Termina
  // porque total <= suma de topes.
  let i = topes.length - 1;
  while (resto > 0) {
    if (partes[i] < topes[i]) {
      partes[i] += 1;
      resto -= 1;
    }
    i = i === 0 ? topes.length - 1 : i - 1;
  }
  return partes;
};

/**
 * BAJA el total en `rebaja` pesos. `cuotas` = las no pagadas
 * (pendiente o vencido), en cualquier orden.
 */
export const repartirRebaja = (
  cuotas: CuotaParaRepartir[],
  rebaja: number,
): RepartoDelCambio => {
  const ordenadas = [...cuotas]
    .filter((c) => saldoDe(c) > 0)
    .sort((a, b) => a.payment_number - b.payment_number);
  const saldos = ordenadas.map(saldoDe);
  const saldoTotal = saldos.reduce((s, x) => s + x, 0);
  const aRepartir = Math.min(pesos(rebaja), saldoTotal);
  const partes = repartirEnProporcion(saldos, aRepartir);

  const reparto: RepartoDelCambio = {
    cambios: [],
    borrar: [],
    reembolso: Math.max(0, pesos(rebaja) - saldoTotal),
    cuotaNueva: 0,
  };
  ordenadas.forEach((c, i) => {
    if (partes[i] === 0) return;
    const nuevo = pesos(c.amount) - partes[i];
    const abonado = pesos(c.abonado);
    if (nuevo <= 0 && abonado <= 0) {
      reparto.borrar.push(c.id);
    } else {
      reparto.cambios.push({
        id: c.id,
        amount: nuevo,
        pagada: nuevo <= abonado,
      });
    }
  });
  // Cuotas no pagadas que ya venían en $0 sin abonos (la regla vieja
  // las dejaba así): se limpian en la misma pasada.
  cuotas
    .filter((c) => pesos(c.amount) <= 0 && pesos(c.abonado) <= 0)
    .forEach((c) => reparto.borrar.push(c.id));
  return reparto;
};

/**
 * SUBE el total en `alza` pesos (ya descontados los reembolsos
 * pendientes, regla 15). Solo participan las cuotas con saldo que no han
 * vencido a `hoy` (YYYY-MM-DD).
 */
export const repartirAlza = (
  cuotas: CuotaParaRepartir[],
  alza: number,
  hoy: string,
): RepartoDelCambio => {
  const participan = [...cuotas]
    .filter((c) => saldoDe(c) > 0 && diaDe(c.due_date) >= hoy)
    .sort((a, b) => a.payment_number - b.payment_number);
  const total = pesos(alza);
  if (participan.length === 0) {
    return { cambios: [], borrar: [], reembolso: 0, cuotaNueva: total };
  }
  // Al subir no hay tope: el resto del redondeo va entero a la última.
  const saldos = participan.map(saldoDe);
  const suma = saldos.reduce((s, x) => s + x, 0);
  const partes = saldos.map((s) => Math.floor((total * s) / suma));
  partes[partes.length - 1] += total - partes.reduce((s, p) => s + p, 0);
  return {
    cambios: participan.map((c, i) => ({
      id: c.id,
      amount: pesos(c.amount) + partes[i],
      pagada: false,
    })),
    borrar: [],
    reembolso: 0,
    cuotaNueva: 0,
  };
};
