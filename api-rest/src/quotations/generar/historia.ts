// LA HISTORIA, LA DEL MOMENTO DE APRETAR EL BOTÓN (Felipe, 17-10:
// "ocupemos la historia (…) tiene que ser al momento de pinchar el botón,
// porque la historia se va moviendo").
//
// Con las cotizaciones vendidas (aceptadas y realizadas) se arman tres
// cosas para la IA: la última del mismo cliente, las más parecidas del
// mismo tipo de evento y lo más vendido de cada comida. Nada de esto queda
// guardado: se calcula cada vez.

import type { Catalogo, MenuDelCatalogo } from './catalogo';

type ItemDeFoto = {
  codigo?: string | number | null;
  nombre?: string | null;
  quantity?: number | null;
};
type CajaDeFoto = {
  day?: number | null;
  category?: string | null;
  audience?: string | null;
  people?: number | null;
  items?: ItemDeFoto[] | null;
};
type FijoDeFoto = {
  day?: number | null;
  codigo?: string | number | null;
  nombre?: string | null;
  quantity?: number | null;
};

export type CotizacionVendida = {
  numero: number;
  tipo: string;
  /** AAAA-MM-DD */
  fecha: string;
  fin: string | null;
  personas: number;
  ninos: number;
  total: number;
  items: {
    variable_services?: CajaDeFoto[] | null;
    fixed_services?: FijoDeFoto[] | null;
  } | null;
};

/** Mínimo de ítems en común para decir que una caja "es" un menú. */
const MINIMO_EN_COMUN = 2;

const codigosDe = (caja: CajaDeFoto): string[] =>
  (caja.items ?? [])
    .map((i) => (i.codigo == null ? '' : String(i.codigo)))
    .filter(Boolean);

/** El menú guardado de hoy más parecido a una caja vendida (o null). */
export function menuParecido(
  caja: CajaDeFoto,
  menus: MenuDelCatalogo[],
): MenuDelCatalogo | null {
  const codigos = codigosDe(caja);
  let mejor: { menu: MenuDelCatalogo; comunes: number } | null = null;
  for (const m of menus) {
    if (m.categoria !== caja.category) continue;
    const comunes = m.items.filter((i) =>
      codigos.includes(String(i.id)),
    ).length;
    if (
      comunes >= MINIMO_EN_COMUN &&
      (!mejor ||
        comunes > mejor.comunes ||
        (comunes === mejor.comunes && m.items.length < mejor.menu.items.length))
    ) {
      mejor = { menu: m, comunes };
    }
  }
  return mejor?.menu ?? null;
}

export type LoMasVendido = {
  categoria: string;
  nivel: string;
  cotizaciones: number;
  de: number;
};

/**
 * Por comida, el nivel que más se vendió, contado por cotización y no por
 * caja: una estadía de 20 cenas no pesa más que 20 eventos (doc 16 §6).
 */
export function loMasVendido(
  vendidas: CotizacionVendida[],
  menus: MenuDelCatalogo[],
): LoMasVendido[] {
  const porCategoria = new Map<string, Map<string, Set<number>>>();
  const conLaComida = new Map<string, Set<number>>();
  for (const v of vendidas) {
    for (const caja of v.items?.variable_services ?? []) {
      const categoria = caja.category ?? '';
      const menu = menuParecido(caja, menus);
      if (!categoria || !menu) continue;
      if (!conLaComida.has(categoria))
        conLaComida.set(categoria, new Set<number>());
      conLaComida.get(categoria)!.add(v.numero);
      const niveles =
        porCategoria.get(categoria) ?? new Map<string, Set<number>>();
      if (!niveles.has(menu.nivel)) niveles.set(menu.nivel, new Set<number>());
      niveles.get(menu.nivel)!.add(v.numero);
      porCategoria.set(categoria, niveles);
    }
  }
  const resultado: LoMasVendido[] = [];
  for (const [categoria, niveles] of porCategoria) {
    const [nivel, cotizaciones] = [...niveles.entries()].sort(
      (a, b) => b[1].size - a[1].size || a[0].localeCompare(b[0]),
    )[0];
    resultado.push({
      categoria,
      nivel,
      cotizaciones: cotizaciones.size,
      de: conLaComida.get(categoria)?.size ?? cotizaciones.size,
    });
  }
  return resultado.sort((a, b) => a.categoria.localeCompare(b.categoria));
}

/** Las más parecidas en tamaño, y entre iguales, las más recientes. */
export function masParecidas(
  vendidas: CotizacionVendida[],
  personas: number,
  cuantas = 5,
): CotizacionVendida[] {
  return [...vendidas]
    .sort(
      (a, b) =>
        Math.abs(a.personas - personas) - Math.abs(b.personas - personas) ||
        b.fecha.localeCompare(a.fecha),
    )
    .slice(0, cuantas);
}

/** Una cotización vendida en pocas líneas: día, comida, menú o platos y
 *  personas; y sus fijos. Sin precios: los de entonces ya no valen. */
export function resumenDeVendida(
  v: CotizacionVendida,
  catalogo: Catalogo,
): string {
  const dias = v.fin ? ` · hasta ${v.fin}` : '';
  const lineas = [
    `N° ${v.numero} · ${v.tipo} · ${v.fecha}${dias} · ${v.personas} personas${v.ninos ? ` (${v.ninos} niños)` : ''}`,
  ];
  const cajas = [...(v.items?.variable_services ?? [])].sort(
    (a, b) => (a.day ?? 1) - (b.day ?? 1),
  );
  for (const caja of cajas) {
    const menu = menuParecido(caja, catalogo.menus);
    const que = menu
      ? `como el menú ${menu.id} «${menu.nombre}» (${menu.nivel})`
      : (caja.items ?? [])
          .map((i) => i.nombre)
          .filter(Boolean)
          .join(', ');
    const audiencia = caja.audience === 'ninos' ? ' niños' : '';
    lineas.push(
      `  Día ${caja.day ?? 1} · ${caja.category ?? '?'}: ${que} · ${caja.people ?? v.personas}${audiencia}`,
    );
  }
  const fijos = (v.items?.fixed_services ?? [])
    .map((f) => f.nombre)
    .filter(Boolean);
  if (fijos.length > 0) lineas.push(`  Fijos: ${fijos.join(', ')}`);
  return lineas.join('\n');
}
