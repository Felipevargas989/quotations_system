// ---------- LO QUE LLEVA CADA EVENTO, EN UN SOLO LUGAR (03-11-2026) ----------
// Insumos, mobiliario y costo estimado de un evento, a partir de las recetas
// del catálogo. Hasta el 03-11 vivía solo en la app
// (frontend/src/utils/eventConsolidation.ts) y el motor no podía hacer la
// cuenta: BelIA mandaba a Compras para no tener una copia que diera otra
// cifra (mapa 25, riesgo 5). Ahora vive acá y la app la importa TAL CUAL con
// el alias @consolidacion, igual que la del dinero (@dinero, money.ts). UNA
// cuenta para Compras, Gestión, Cocina, Servicios, el cotizador, el
// Dashboard, el radar de Inventario y BelIA.
//
// Se movió sin cambiar una coma de la cuenta (mapa 06, riesgo 1: siete
// pantallas la usan). Las pruebas que la fijan están en
// logistics/tests/consolidacion.spec.ts.
//
// Sin imports a propósito: la compilan el motor y la app, cada uno con su
// configuración (la app en modo estricto).

// ---------- Unidades y merma ----------

/** Unidades concretas permitidas en recetas, por familia del insumo. */
export type RecipeUnit = 'kg' | 'gr' | 'L' | 'ml' | 'u';

/** Convierte una cantidad de receta a la unidad base del insumo (kg/L/u). */
export const toBaseQty = (qty: number, unit: RecipeUnit): number =>
  unit === 'gr' || unit === 'ml' ? qty / 1000 : qty;

/** Cantidad BRUTA a comprar: lo servido (neto) más la merma del insumo. */
export const grossQty = (
  netBase: number,
  supply: { waste_pct: number },
): number => {
  const w = supply.waste_pct || 0;
  return w > 0 && w < 100 ? netBase / (1 - w / 100) : netBase;
};

// ---------- Nombres canónicos ----------

/** Nombre CANÓNICO de un servicio del catálogo, para emparejar los items
 *  guardados en cotizaciones (fotos con nombres antiguos) contra el
 *  catálogo vigente: sin tildes ni mayúsculas, sin el prefijo de orden
 *  ("02 - "), espacios colapsados y "1pp" ≡ "1 pp". Definido el 22-07
 *  tras la limpieza de nombres del catálogo que dejó recetas sin
 *  reconocer en Gestión y la ficha de cocina. La app lo reexporta desde
 *  utils/searchMatch.ts. */
export const canonicalServiceName = (name: string): string =>
  name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/^\s*\d+\s*-\s*/, '')
    .replace(/(\d)\s*pp\b/g, '$1 pp')
    .replace(/\s+/g, ' ')
    .trim();

// ---------- Lo que la cuenta lee ----------

/** Lo que la cuenta necesita de un insumo (la app pasa su `Supply`). */
export interface InsumoBase {
  id: number;
  price: number;
  waste_pct: number;
}

/** Lo que la cuenta necesita de un mobiliario (la app pasa su
 *  `FurnitureItem`). */
export interface MuebleBase {
  id: number;
  preassembled: boolean;
}

/** Una línea de receta (`service_recipe_items`). */
export interface LineaDeReceta {
  service_type: 'variable' | 'fixed';
  service_id: number;
  item_kind: 'insumo' | 'mobiliario';
  supply_id: number | null;
  furniture_id: number | null;
  qty_per_person: number;
  unit: RecipeUnit;
}

export interface SnapshotItem {
  codigo: string;
  nombre: string;
  quantity?: number;
}

export interface EventItemsSnapshot {
  variable_services?: {
    items?: SnapshotItem[];
    // Cotizador 2.0: cada servicio multiplica por SUS personas (su
    // audiencia adultos/niños o un ajuste manual). Ausente = el total
    // del evento (cotizaciones antiguas).
    people?: number;
    audience?: 'adultos' | 'ninos';
    day?: number;
  }[];
  fixed_services?: SnapshotItem[];
}

export interface ConsolidatedSupply<S extends InsumoBase = InsumoBase> {
  supply: S;
  // REGLA DE MERMA (Felipe, 22-07): la cantidad es SIEMPRE la neta de la
  // receta (lo que se cocina, retira y compra); la merma —caducidad,
  // robo, pérdida— solo infla el COSTO. Por eso van separados.
  totalBase: number; // cantidad NETA en unidad base (kg / L / u)
  costTotal: number; // costo BRUTO (incluye merma) en pesos
  services: string[]; // de qué servicios proviene
}

export interface ConsolidatedFurniture<F extends MuebleBase = MuebleBase> {
  item: F;
  total: number; // sin redondear (Math.ceil al presentar)
}

export interface FixedCostsById {
  [id: number]: {
    cost_fixed: number | null;
    cost_per_person: number | null;
  };
}

export interface NameIds {
  variable: Record<string, number>;
  fixed: Record<string, number>;
}

export interface ConsolidationContext<
  S extends InsumoBase = InsumoBase,
  F extends MuebleBase = MuebleBase,
> {
  byService: Map<string, LineaDeReceta[]>;
  supplyById: Map<number, S>;
  furnById: Map<number, F>;
  nameIds: NameIds;
  fixedCosts: FixedCostsById;
}

export const buildConsolidationContext = <
  S extends InsumoBase,
  F extends MuebleBase,
>(
  recipes: LineaDeReceta[],
  supplies: S[],
  furniture: F[],
  nameIds: NameIds,
  fixedCosts: FixedCostsById,
): ConsolidationContext<S, F> => {
  const byService = new Map<string, LineaDeReceta[]>();
  recipes.forEach((r) => {
    const key = `${r.service_type}-${r.service_id}`;
    const arr = byService.get(key) || [];
    arr.push(r);
    byService.set(key, arr);
  });
  return {
    byService,
    supplyById: new Map(supplies.map((s) => [s.id, s])),
    furnById: new Map(furniture.map((f) => [f.id, f])),
    nameIds,
    fixedCosts,
  };
};

export interface ConsolidationAccumulator<
  S extends InsumoBase = InsumoBase,
  F extends MuebleBase = MuebleBase,
> {
  supplyTotals: Map<number, ConsolidatedSupply<S>>;
  furnTotals: Map<number, ConsolidatedFurniture<F>>;
  noRecipe: string[];
}

export const newAccumulator = <
  S extends InsumoBase = InsumoBase,
  F extends MuebleBase = MuebleBase,
>(): ConsolidationAccumulator<S, F> => ({
  supplyTotals: new Map(),
  furnTotals: new Map(),
  noRecipe: [],
});

// Firma de los servicios de una cotización (nombre + cantidad, ordenada),
// para la foto de provisión y la detección de cambios posteriores.
export const servicesSignature = (
  items: EventItemsSnapshot | null | undefined,
): { nombre: string; quantity: number }[] => {
  const list: { nombre: string; quantity: number }[] = [];
  (items?.variable_services || []).forEach((g) => {
    (g.items || []).forEach((it) =>
      list.push({ nombre: it.nombre, quantity: it.quantity || 1 }),
    );
  });
  (items?.fixed_services || []).forEach((it) =>
    list.push({ nombre: it.nombre, quantity: it.quantity || 1 }),
  );
  return list.sort((a, b) => a.nombre.localeCompare(b.nombre));
};

// Resuelve el id del servicio: por codigo (cotizaciones nuevas: codigo = id)
// o por nombre en el catálogo (cotizaciones antiguas con códigos tipo "P001").
const resolveId = (
  ctx: ConsolidationContext<InsumoBase, MuebleBase>,
  serviceType: 'variable' | 'fixed',
  codigo: string,
  nombre: string,
): number | undefined => {
  const numericId = Number(codigo);
  if (
    Number.isFinite(numericId) &&
    ctx.byService.get(`${serviceType}-${numericId}`)
  ) {
    return numericId;
  }
  const idByName = ctx.nameIds[serviceType][canonicalServiceName(nombre)];
  if (idByName !== undefined) return idByName;
  return Number.isFinite(numericId) ? numericId : undefined;
};

// Consolida UN evento dentro del acumulador (compartido entre varios eventos)
// y devuelve el costo estimado de ese evento en particular.
export interface FurniturePeak {
  // Necesidad del evento. Reutilizable (default): MÁXIMO simultáneo entre
  // servicios (se lava y vuelve al circuito). Preparación anticipada
  // (item.preassembled): SUMA entre servicios — ya está montado, no vuelve.
  total: number;
  peakService: string; // servicio del peak ("" si es suma entre servicios)
  preassembled: boolean;
}

export const consolidateEvent = <S extends InsumoBase, F extends MuebleBase>(
  items: EventItemsSnapshot | null | undefined,
  personas: number,
  ctx: ConsolidationContext<S, F>,
  acc: ConsolidationAccumulator<S, F>,
): {
  costoInsumos: number;
  costoFijos: number;
  supplyUse: Map<number, number>; // supply_id → cantidad base usada por ESTE evento
  // Mobiliario: se lava y reutiliza entre servicios → peak, no suma.
  furnPeak: Map<number, FurniturePeak>;
  fixedServices: { id: number | undefined; nombre: string; qty: number }[];
} => {
  let costoInsumos = 0;
  let costoFijos = 0;
  const supplyUse = new Map<number, number>();
  // uso de mobiliario por servicio: item_id → (servicio → cantidad)
  const furnByService = new Map<number, Map<string, number>>();
  const fixedList: {
    id: number | undefined;
    nombre: string;
    qty: number;
  }[] = [];

  const addRecipeLines = (
    serviceType: 'variable' | 'fixed',
    serviceId: number | undefined,
    nombre: string,
    qty: number,
    // Personas de ESTE servicio (audiencia niños/adultos o ajuste
    // manual); los fijos y las cotizaciones antiguas usan el total.
    servicePeople: number = personas,
  ) => {
    const lines =
      serviceId !== undefined
        ? ctx.byService.get(`${serviceType}-${serviceId}`)
        : undefined;
    if (!lines || lines.length === 0) {
      // "Sin receta" solo aplica a VARIABLES: su costo nace de la receta.
      // Los fijos son arriendos/tercerizados costeados por RECURSOS — su
      // advertencia correcta vive en el bloque Recursos del evento
      // (acordado con Felipe el 22-07: la marca a fijos era puro ruido).
      if (serviceType === 'variable') acc.noRecipe.push(nombre);
      return;
    }
    lines.forEach((line) => {
      // cantidad total = por persona × personas del servicio × cantidad
      const factor = servicePeople * (qty || 1);
      if (line.item_kind === 'insumo' && line.supply_id) {
        const supply = ctx.supplyById.get(line.supply_id);
        if (!supply) return;
        // REGLA DE MERMA (22-07): la CANTIDAD queda en NETO (los gramajes
        // de la receta ya traen su holgura de cocina); la merma —siempre
        // caducidad/robo/pérdida— solo infla el COSTO.
        const neta = toBaseQty(line.qty_per_person, line.unit) * factor;
        const costo = grossQty(neta, supply) * (supply.price || 0);
        costoInsumos += costo;
        supplyUse.set(supply.id, (supplyUse.get(supply.id) || 0) + neta);
        const cur = acc.supplyTotals.get(supply.id);
        if (cur) {
          cur.totalBase += neta;
          cur.costTotal += costo;
          if (!cur.services.includes(nombre)) cur.services.push(nombre);
        } else {
          acc.supplyTotals.set(supply.id, {
            supply,
            totalBase: neta,
            costTotal: costo,
            services: [nombre],
          });
        }
      } else if (line.item_kind === 'mobiliario' && line.furniture_id) {
        const item = ctx.furnById.get(line.furniture_id);
        if (!item) return;
        const total = line.qty_per_person * factor;
        // dentro de un servicio se suma; entre servicios se toma el máximo
        const perService = furnByService.get(item.id) || new Map();
        perService.set(nombre, (perService.get(nombre) || 0) + total);
        furnByService.set(item.id, perService);
      }
    });
  };

  (items?.variable_services || []).forEach((group) => {
    const groupPeople = group.people ?? personas;
    (group.items || []).forEach((it) => {
      const id = resolveId(ctx, 'variable', it.codigo, it.nombre);
      addRecipeLines('variable', id, it.nombre, it.quantity || 1, groupPeople);
    });
  });
  (items?.fixed_services || []).forEach((it) => {
    const id = resolveId(ctx, 'fixed', it.codigo, it.nombre);
    addRecipeLines('fixed', id, it.nombre, it.quantity || 1);
    fixedList.push({ id, nombre: it.nombre, qty: it.quantity || 1 });
    // Costo del servicio fijo (tercerización): fijo + por persona × N.
    const costs = id !== undefined ? ctx.fixedCosts[id] : undefined;
    const fijo = costs?.cost_fixed || 0;
    const porPersona = costs?.cost_per_person || 0;
    costoFijos += (fijo + porPersona * personas) * (it.quantity || 1);
  });

  // Necesidad de mobiliario del evento y acumulación en el consolidado
  // compartido. Reutilizable → peak entre servicios; anticipado → suma.
  const furnPeak = new Map<number, FurniturePeak>();
  furnByService.forEach((perService, itemId) => {
    const item = ctx.furnById.get(itemId);
    const preassembled = !!item?.preassembled;
    let total = 0;
    let peakService = '';
    if (preassembled) {
      perService.forEach((qty) => {
        total += qty;
      });
    } else {
      perService.forEach((qty, service) => {
        if (qty > total) {
          total = qty;
          peakService = service;
        }
      });
    }
    furnPeak.set(itemId, { total, peakService, preassembled });
    if (item) {
      const cur = acc.furnTotals.get(itemId);
      if (cur) cur.total += total;
      else acc.furnTotals.set(itemId, { item, total });
    }
  });

  return {
    costoInsumos,
    costoFijos,
    supplyUse,
    furnPeak,
    fixedServices: fixedList,
  };
};

// ---------- De lo que entrega el motor a lo que lee la cuenta ----------
// GET /logistics/base-catalogo entrega los nombres y los costos crudos; la
// app (getBaseCatalogo) y BelIA los pasan por acá. Antes vivían solo en
// frontend/src/services/logistics.service.ts.

// Migración 57: además de los mapas nombre→id, viajan los marcados
// "sin costo en Eventia" para que Gestión no los regañe.
export interface NameIdsConCosto {
  variable: Record<string, number>;
  fixed: Record<string, number>;
  sinCostoVariable: string[]; // nombres canónicos
  sinCostoFijoIds: number[];
}

export const mapNameIds = (
  data: {
    variable?: { id: number; name: string; no_cost?: boolean | null }[];
    fixed?: { id: number; name: string; no_cost?: boolean | null }[];
  } | null,
): NameIdsConCosto => {
  const norm = canonicalServiceName;
  const variable: Record<string, number> = {};
  const sinCostoVariable: string[] = [];
  (data?.variable || []).forEach((s) => {
    variable[norm(s.name)] = s.id;
    if (s.no_cost) sinCostoVariable.push(norm(s.name));
  });
  const fixed: Record<string, number> = {};
  const sinCostoFijoIds: number[] = [];
  (data?.fixed || []).forEach((s) => {
    fixed[norm(s.name)] = s.id;
    if (s.no_cost) sinCostoFijoIds.push(s.id);
  });
  return { variable, fixed, sinCostoVariable, sinCostoFijoIds };
};

export const mapFixedCosts = (
  data:
    | {
        id: number;
        cost_fixed: number | null;
        cost_per_person: number | null;
      }[]
    | null,
): Record<
  number,
  { cost_fixed: number | null; cost_per_person: number | null }
> => {
  const map: Record<
    number,
    { cost_fixed: number | null; cost_per_person: number | null }
  > = {};
  (data || []).forEach((r) => {
    map[r.id] = {
      cost_fixed: r.cost_fixed,
      cost_per_person: r.cost_per_person,
    };
  });
  return map;
};
