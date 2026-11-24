/**
 * LA BODEGA SIMPLE (doc 25 §4, 23-11-2026).
 *
 * Felipe: *"con el tengo ya se soluciona gran parte"*. La cuenta, por
 * insumo:
 *   bodega = último «Tengo»
 *          + compras aplicadas después
 *          − «Saqué» después
 *          − lo que pidió la receta de cada evento realizado cuyo último día
 *            es POSTERIOR al día del conteo.
 * Sin ningún «Tengo», la bodega no se conoce (null) y Compras pide todo.
 * Lo de los eventos no se guarda: se calcula, así desmarcar un evento
 * realizado corrige la bodega sola.
 *
 * Puro, sin base: lo prueba bodega.spec.ts.
 */

export interface Movimiento {
  id: number;
  supply_id: number;
  tipo: 'tengo' | 'compra' | 'saque';
  cantidad_base: number;
  created_at: string;
  nota?: string | null;
}

export interface ConsumoDeEvento {
  quotation_id: string;
  numero: number;
  /** Último día del evento (AAAA-MM-DD). */
  dia: string;
  /** Insumo → cantidad neta que pidió la receta. */
  consumo: Map<number, number>;
}

export interface LineaDeBodega {
  tipo: 'tengo' | 'compra' | 'saque' | 'evento';
  cantidad: number;
  cuando: string;
  detalle: string | null;
}

export interface BodegaDeInsumo {
  supply_id: number;
  /** null = nunca se contó. */
  stock: number | null;
  contado_el: string | null;
  /** Lo que movió la bodega desde el último conteo, del más nuevo al más viejo. */
  historia: LineaDeBodega[];
}

/** El día en Chile de un instante (AAAA-MM-DD). */
export const diaEnChile = (iso: string): string =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Santiago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(iso));

const redondo = (n: number) => Math.round(n * 1000) / 1000;

export const calcularBodega = (
  movimientos: Movimiento[],
  eventos: ConsumoDeEvento[],
): Map<number, BodegaDeInsumo> => {
  const porInsumo = new Map<number, Movimiento[]>();
  for (const m of movimientos) {
    const l = porInsumo.get(m.supply_id) ?? [];
    l.push(m);
    porInsumo.set(m.supply_id, l);
  }
  const resultado = new Map<number, BodegaDeInsumo>();
  for (const [sid, lista] of porInsumo) {
    const orden = [...lista].sort((a, b) =>
      a.created_at < b.created_at
        ? -1
        : a.created_at > b.created_at
          ? 1
          : a.id - b.id,
    );
    let ultimo = -1;
    orden.forEach((m, i) => {
      if (m.tipo === 'tengo') ultimo = i;
    });
    if (ultimo < 0) {
      resultado.set(sid, {
        supply_id: sid,
        stock: null,
        contado_el: null,
        historia: orden
          .slice()
          .reverse()
          .map((m) => ({
            tipo: m.tipo,
            cantidad: Number(m.cantidad_base),
            cuando: m.created_at,
            detalle: m.nota ?? null,
          })),
      });
      continue;
    }
    const conteo = orden[ultimo];
    const diaConteo = diaEnChile(conteo.created_at);
    let stock = Number(conteo.cantidad_base);
    const historia: LineaDeBodega[] = [
      {
        tipo: 'tengo',
        cantidad: stock,
        cuando: conteo.created_at,
        detalle: conteo.nota ?? null,
      },
    ];
    for (const m of orden.slice(ultimo + 1)) {
      const c = Number(m.cantidad_base);
      stock += m.tipo === 'compra' ? c : m.tipo === 'saque' ? -c : 0;
      historia.push({
        tipo: m.tipo,
        cantidad: c,
        cuando: m.created_at,
        detalle: m.nota ?? null,
      });
    }
    for (const e of eventos) {
      if (!(e.dia > diaConteo)) continue;
      const c = e.consumo.get(sid);
      if (!c) continue;
      stock -= c;
      historia.push({
        tipo: 'evento',
        cantidad: redondo(c),
        cuando: `${e.dia}T23:59:00-03:00`,
        detalle: `N° ${e.numero}`,
      });
    }
    historia.sort((a, b) =>
      a.cuando < b.cuando ? 1 : a.cuando > b.cuando ? -1 : 0,
    );
    resultado.set(sid, {
      supply_id: sid,
      stock: redondo(stock),
      contado_el: conteo.created_at,
      historia,
    });
  }
  return resultado;
};

/** El día más antiguo de un conteo vigente: desde ahí se buscan eventos. */
export const primerConteo = (movimientos: Movimiento[]): string | null => {
  const ultimos = new Map<number, string>();
  for (const m of movimientos) {
    if (m.tipo !== 'tengo') continue;
    const prev = ultimos.get(m.supply_id);
    if (!prev || m.created_at > prev) ultimos.set(m.supply_id, m.created_at);
  }
  let min: string | null = null;
  for (const v of ultimos.values()) {
    const d = diaEnChile(v);
    if (!min || d < min) min = d;
  }
  return min;
};

/** Lo que hay que comprar: lo que se necesita menos la bodega (nunca < 0). */
export const porComprar = (necesito: number, stock: number | null): number =>
  stock === null
    ? necesito
    : Math.max(0, redondo(necesito - Math.max(0, stock)));
