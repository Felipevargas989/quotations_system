import {
  FurnitureItem,
  RecipeItem,
  Supply,
  toBaseQty,
} from "../types/logistics.types";

// Consolidación de insumos/mobiliario de eventos a partir de las recetas del
// catálogo. Lo usan la pestaña Gestión del evento y Compras multi-evento.

export interface SnapshotItem {
  codigo: string;
  nombre: string;
  quantity?: number;
}

export interface EventItemsSnapshot {
  variable_services?: { items?: SnapshotItem[] }[];
  fixed_services?: SnapshotItem[];
}

export interface ConsolidatedSupply {
  supply: Supply;
  totalBase: number; // en unidad base (kg / L / u)
  services: string[]; // de qué servicios proviene
}

export interface ConsolidatedFurniture {
  item: FurnitureItem;
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

export interface ConsolidationContext {
  byService: Map<string, RecipeItem[]>;
  supplyById: Map<number, Supply>;
  furnById: Map<number, FurnitureItem>;
  nameIds: NameIds;
  fixedCosts: FixedCostsById;
}

export const buildConsolidationContext = (
  recipes: RecipeItem[],
  supplies: Supply[],
  furniture: FurnitureItem[],
  nameIds: NameIds,
  fixedCosts: FixedCostsById,
): ConsolidationContext => {
  const byService = new Map<string, RecipeItem[]>();
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

export interface ConsolidationAccumulator {
  supplyTotals: Map<number, ConsolidatedSupply>;
  furnTotals: Map<number, ConsolidatedFurniture>;
  noRecipe: string[];
}

export const newAccumulator = (): ConsolidationAccumulator => ({
  supplyTotals: new Map(),
  furnTotals: new Map(),
  noRecipe: [],
});

// Resuelve el id del servicio: por codigo (cotizaciones nuevas: codigo = id)
// o por nombre en el catálogo (cotizaciones antiguas con códigos tipo "P001").
const resolveId = (
  ctx: ConsolidationContext,
  serviceType: "variable" | "fixed",
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
  const idByName = ctx.nameIds[serviceType][nombre.trim().toLowerCase()];
  if (idByName !== undefined) return idByName;
  return Number.isFinite(numericId) ? numericId : undefined;
};

// Consolida UN evento dentro del acumulador (compartido entre varios eventos)
// y devuelve el costo estimado de ese evento en particular.
export const consolidateEvent = (
  items: EventItemsSnapshot | null | undefined,
  personas: number,
  ctx: ConsolidationContext,
  acc: ConsolidationAccumulator,
): {
  costoInsumos: number;
  costoFijos: number;
  supplyUse: Map<number, number>; // supply_id → cantidad base usada por ESTE evento
} => {
  let costoInsumos = 0;
  let costoFijos = 0;
  const supplyUse = new Map<number, number>();

  const addRecipeLines = (
    serviceType: "variable" | "fixed",
    serviceId: number | undefined,
    nombre: string,
    qty: number,
  ) => {
    const lines =
      serviceId !== undefined
        ? ctx.byService.get(`${serviceType}-${serviceId}`)
        : undefined;
    if (!lines || lines.length === 0) {
      acc.noRecipe.push(nombre);
      return;
    }
    lines.forEach((line) => {
      // cantidad total = por persona × personas × cantidad del servicio
      const factor = personas * (qty || 1);
      if (line.item_kind === "insumo" && line.supply_id) {
        const supply = ctx.supplyById.get(line.supply_id);
        if (!supply) return;
        const base = toBaseQty(line.qty_per_person, line.unit) * factor;
        costoInsumos += base * (supply.price || 0);
        supplyUse.set(supply.id, (supplyUse.get(supply.id) || 0) + base);
        const cur = acc.supplyTotals.get(supply.id);
        if (cur) {
          cur.totalBase += base;
          if (!cur.services.includes(nombre)) cur.services.push(nombre);
        } else {
          acc.supplyTotals.set(supply.id, {
            supply,
            totalBase: base,
            services: [nombre],
          });
        }
      } else if (line.item_kind === "mobiliario" && line.furniture_id) {
        const item = ctx.furnById.get(line.furniture_id);
        if (!item) return;
        const total = line.qty_per_person * factor;
        const cur = acc.furnTotals.get(item.id);
        if (cur) cur.total += total;
        else acc.furnTotals.set(item.id, { item, total });
      }
    });
  };

  (items?.variable_services || []).forEach((group) => {
    (group.items || []).forEach((it) => {
      const id = resolveId(ctx, "variable", it.codigo, it.nombre);
      addRecipeLines("variable", id, it.nombre, it.quantity || 1);
    });
  });
  (items?.fixed_services || []).forEach((it) => {
    const id = resolveId(ctx, "fixed", it.codigo, it.nombre);
    addRecipeLines("fixed", id, it.nombre, it.quantity || 1);
    // Costo del servicio fijo (tercerización): fijo + por persona × N.
    const costs = id !== undefined ? ctx.fixedCosts[id] : undefined;
    const fijo = costs?.cost_fixed || 0;
    const porPersona = costs?.cost_per_person || 0;
    costoFijos += (fijo + porPersona * personas) * (it.quantity || 1);
  });

  return { costoInsumos, costoFijos, supplyUse };
};
