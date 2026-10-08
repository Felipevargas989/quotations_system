/**
 * CUOTAS QUE SE LLENAN — "el plan mantiene su forma"
 * (docs/arquitectura/14_CUOTAS_QUE_SE_LLENAN.md; Felipe, 07-10-2026).
 *
 * Tres frases:
 *  1. Lo pagado llena las cuotas desde la primera. Qué cuotas están
 *     pagadas depende SOLO de cuánto se ha pagado en total.
 *  2. Si cambia el total, las cuotas cambian en proporción a su MONTO:
 *     el plan mantiene su forma (si eran iguales, siguen iguales).
 *     - Baja: todas las cuotas, también las pagadas ("forma completa").
 *       Lo que una pagada deja de necesitar pasa a la siguiente.
 *     - Sube: solo las cuotas por pagar que no han vencido (opción B:
 *       lo nuevo nunca nace vencido). Sin ninguna, cuota nueva.
 *  3. Después de cualquier cambio, lo pagado se vuelve a repartir
 *     desde la primera (`planDeLlenado`).
 *
 * Por qué así (Linde, lab 07-10): 4 cuotas de $1.590.750, abono de
 * $1.000.000 y el total baja a $3.801.000. Felipe esperaba "todas
 * 950.250, pagada la primera y parcialmente la segunda" — y eso da.
 *
 * Todo acá es PURO: decide qué hacer, el servicio lo ejecuta. Y como se
 * recalcula desde cero, se corrige solo: si algo quedó a medias (dos
 * personas a la vez, un corte), el siguiente cambio lo deja cuadrado.
 *
 * Las cuotas "pagadas por fuera" (marcadas pagadas con un paid_date que
 * escribió una carga de datos y SIN ningún pago registrado — 40 el
 * 08-10-2026, todas de la empresa 52, ninguna de Valle del Sol) no se
 * tocan nunca: no se escalan, no reciben pagos y su monto no cuenta en
 * el plan que se reparte.
 */

export interface CuotaDelPlan {
  id: string;
  payment_number: number;
  /** Supabase entrega numeric como texto: siempre pasa por `pesos`. */
  amount: number | string;
  due_date: string | Date | null;
  /** Pagada en el sistema viejo, sin pagos registrados: intocable. */
  pagadaPorFuera?: boolean;
}

export interface PiezaDePago {
  id: number;
  payment_id: string | null;
  amount: number | string;
  /** Las piezas de un mismo pago comparten grupo (migración 118). */
  pago_grupo: string;
  transaction_date: string | null;
  created_at?: string | null;
}

export const pesos = (n: number | string | null | undefined) =>
  Math.round(Number(n) || 0);

const suma = (xs: number[]) => xs.reduce((s, x) => s + x, 0);

/** Hoy en Chile como YYYY-MM-DD: "vence hoy" es hasta la medianoche de
 *  Chile, no de Greenwich (el error del 07-10: a las 21:00 de Chile ya
 *  es mañana en UTC y la cuota de hoy salía vencida). */
export const hoyEnChile = (ahora: Date = new Date()) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Santiago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(ahora);

/** La fecha de la cuota como YYYY-MM-DD (las cuotas son `date`). */
export const diaDe = (d: string | Date | null) =>
  d ? (d instanceof Date ? d.toISOString() : String(d)).slice(0, 10) : '';

/** Vencida = su día ya pasó en Chile. La que vence hoy NO está vencida. */
export const estaVencida = (d: string | Date | null, hoy: string) => {
  const dia = diaDe(d);
  return dia !== '' && dia < hoy;
};

/**
 * Escala montos en proporción hasta sumar `objetivo`, al peso. Lo que
 * sobra del redondeo va a la PRIMERA cuota — la misma regla del editor
 * del plan (`repartirEnCuotas`, 06-10: "el resto va al abono").
 */
export const escalarEnProporcion = (
  montos: number[],
  objetivo: number,
): number[] => {
  const total = suma(montos);
  if (montos.length === 0) return [];
  if (objetivo <= 0) return montos.map(() => 0);
  if (total <= 0) {
    // Sin forma de la cual partir: parejo.
    const base = Math.floor(objetivo / montos.length);
    const partes = montos.map(() => base);
    partes[0] += objetivo - base * montos.length;
    return partes;
  }
  const partes = montos.map((m) => Math.floor((m * objetivo) / total));
  partes[0] += objetivo - suma(partes);
  return partes;
};

/** Cuánto cubre lo pagado de cada cuota, llenando desde la primera. */
export const cobertura = (montos: number[], pagado: number): number[] => {
  let resto = Math.max(0, pagado);
  return montos.map((m) => {
    const cubre = Math.min(m, resto);
    resto -= cubre;
    return cubre;
  });
};

export interface CambioDelPlan {
  /** Cuotas que cambian de monto. */
  cambios: { id: string; amount: number }[];
  /** Cuotas que quedaron en $0 (solo por redondeo): se borran. */
  borrar: string[];
  /** BAJA: lo que no cupo en el saldo → reembolso. */
  reembolso: number;
  /** SUBE: lo que no tuvo cuota vigente donde ir → cuota nueva. */
  cuotaNueva: number;
}

const ordenar = (cuotas: CuotaDelPlan[]) =>
  cuotas
    .filter((c) => !c.pagadaPorFuera)
    .sort((a, b) => a.payment_number - b.payment_number);

const diferencias = (
  cuotas: CuotaDelPlan[],
  nuevos: number[],
): Pick<CambioDelPlan, 'cambios' | 'borrar'> => {
  const cambios: CambioDelPlan['cambios'] = [];
  const borrar: string[] = [];
  cuotas.forEach((c, i) => {
    if (nuevos[i] <= 0) borrar.push(c.id);
    else if (nuevos[i] !== pesos(c.amount))
      cambios.push({ id: c.id, amount: nuevos[i] });
  });
  return { cambios, borrar };
};

/**
 * BAJA el total en `rebaja` pesos. `pagado` = todo lo registrado en
 * pagos de la cotización. "Forma completa": TODAS las cuotas bajan en
 * proporción a su monto, también las pagadas; lo que les sobra lo
 * reparte después `planDeLlenado` hacia la siguiente. Solo se rebaja lo
 * que cabe en el saldo; el resto es reembolso. Nunca quedan cuotas que
 * sumen menos que lo pagado.
 */
export const repartirRebaja = (
  todas: CuotaDelPlan[],
  pagado: number,
  rebaja: number,
): CambioDelPlan => {
  const cuotas = ordenar(todas);
  const montos = cuotas.map((c) => pesos(c.amount));
  const saldo = Math.max(0, suma(montos) - pesos(pagado));
  const cabe = Math.min(pesos(rebaja), saldo);
  const reembolso = pesos(rebaja) - cabe;
  if (cabe <= 0) return { cambios: [], borrar: [], reembolso, cuotaNueva: 0 };
  const nuevos = escalarEnProporcion(montos, suma(montos) - cabe);
  return { ...diferencias(cuotas, nuevos), reembolso, cuotaNueva: 0 };
};

/**
 * SUBE el total en `alza` pesos (ya descontados los reembolsos
 * pendientes). Opción B: crecen, en proporción a su monto, solo las
 * cuotas que todavía no están cubiertas y que no han vencido a `hoy`.
 * Una cuota pagada nunca vuelve a deber.
 */
export const repartirAlza = (
  todas: CuotaDelPlan[],
  pagado: number,
  alza: number,
  hoy: string,
): CambioDelPlan => {
  const cuotas = ordenar(todas);
  const montos = cuotas.map((c) => pesos(c.amount));
  const cubre = cobertura(montos, pesos(pagado));
  const crecen = cuotas
    .map((_, i) => i)
    .filter(
      (i) => cubre[i] < montos[i] && !estaVencida(cuotas[i].due_date, hoy),
    );
  if (crecen.length === 0) {
    return { cambios: [], borrar: [], reembolso: 0, cuotaNueva: pesos(alza) };
  }
  const base = crecen.map((i) => montos[i]);
  const escalados = escalarEnProporcion(base, suma(base) + pesos(alza));
  const nuevos = [...montos];
  crecen.forEach((i, k) => (nuevos[i] = escalados[k]));
  return { ...diferencias(cuotas, nuevos), reembolso: 0, cuotaNueva: 0 };
};

export interface PlanDeLlenado {
  /** Piezas que cambian de cuota o de monto. */
  actualizar: { id: number; payment_id: string; amount: number }[];
  /** Piezas nuevas de un pago que ahora cae en más cuotas. `copiaDe` es
   *  la pieza del mismo pago de la que se copian fecha, medio, nota y
   *  comprobante. */
  insertar: { copiaDe: number; payment_id: string; amount: number }[];
  /** Piezas que sobran (el pago ahora cabe en menos cuotas). */
  borrar: number[];
  /** Estado de cada cuota del plan después de llenar. */
  estados: {
    id: string;
    status: 'pagado' | 'pendiente' | 'vencido';
    cubierto: number;
  }[];
}

/**
 * Vuelve a repartir TODOS los pagos de la cotización desde la primera
 * cuota (regla 3). Los pagos van en el orden en que entraron (fecha del
 * pago y luego de registro); cada pago llena la cuota en curso y lo que
 * sobra pasa a la siguiente, partiéndose en piezas si hace falta. Las
 * piezas que ya existen se reutilizan (se mueven o cambian de monto) en
 * vez de borrarse y crearse de nuevo.
 *
 * Si lo pagado supera lo que suman las cuotas (datos viejos), el
 * sobrante queda en la última cuota: la plata nunca se pierde.
 */
export const planDeLlenado = (
  todas: CuotaDelPlan[],
  piezas: PiezaDePago[],
  hoy: string,
): PlanDeLlenado => {
  const cuotas = ordenar(todas);
  const montos = cuotas.map((c) => pesos(c.amount));
  const plan: PlanDeLlenado = {
    actualizar: [],
    insertar: [],
    borrar: [],
    estados: [],
  };
  // Sin cuotas donde repartir no se toca ningún pago: la plata nunca se
  // borra por falta de destino.
  if (cuotas.length === 0) return plan;

  // Los pagos (grupos de piezas), en el orden en que entraron.
  const grupos = new Map<string, PiezaDePago[]>();
  for (const p of piezas) {
    const g = grupos.get(p.pago_grupo) ?? [];
    g.push(p);
    grupos.set(p.pago_grupo, g);
  }
  const clave = (g: PiezaDePago[]) => {
    const fecha = g.map((p) => p.transaction_date ?? '').sort()[0];
    const creado = g.map((p) => p.created_at ?? '').sort()[0];
    const id = Math.min(...g.map((p) => p.id));
    return { fecha, creado, id };
  };
  const pagos = [...grupos.values()].sort((a, b) => {
    const x = clave(a);
    const y = clave(b);
    if (x.fecha !== y.fecha) return x.fecha < y.fecha ? -1 : 1;
    if (x.creado !== y.creado) return x.creado < y.creado ? -1 : 1;
    return x.id - y.id;
  });

  const numeroDe = new Map(cuotas.map((c) => [c.id, c.payment_number]));
  const cubierto = montos.map(() => 0);
  let i = 0;
  for (const pago of pagos) {
    let resto = suma(pago.map((p) => pesos(p.amount)));
    // Un registro de $0 no llena nada: se deja donde está.
    if (resto <= 0) continue;
    const destino: { payment_id: string; amount: number }[] = [];
    while (resto > 0) {
      while (i < cuotas.length - 1 && cubierto[i] >= montos[i]) i++;
      const espacio =
        i === cuotas.length - 1 ? resto : Math.max(0, montos[i] - cubierto[i]);
      const toma = Math.min(resto, espacio);
      if (toma <= 0) break;
      const ultimo = destino[destino.length - 1];
      if (ultimo && ultimo.payment_id === cuotas[i].id) ultimo.amount += toma;
      else destino.push({ payment_id: cuotas[i].id, amount: toma });
      cubierto[i] += toma;
      resto -= toma;
    }

    // Reutilizar las piezas existentes, en el orden de sus cuotas.
    const existentes = [...pago].sort(
      (a, b) =>
        (numeroDe.get(a.payment_id ?? '') ?? 0) -
          (numeroDe.get(b.payment_id ?? '') ?? 0) || a.id - b.id,
    );
    destino.forEach((d, k) => {
      const pieza = existentes[k];
      if (!pieza) {
        plan.insertar.push({ copiaDe: existentes[0].id, ...d });
      } else if (
        pieza.payment_id !== d.payment_id ||
        pesos(pieza.amount) !== d.amount
      ) {
        plan.actualizar.push({ id: pieza.id, ...d });
      }
    });
    existentes.slice(destino.length).forEach((p) => plan.borrar.push(p.id));
  }

  plan.estados = cuotas.map((c, k) => ({
    id: c.id,
    cubierto: cubierto[k],
    status:
      cubierto[k] >= montos[k]
        ? 'pagado'
        : estaVencida(c.due_date, hoy)
          ? 'vencido'
          : 'pendiente',
  }));
  return plan;
};
