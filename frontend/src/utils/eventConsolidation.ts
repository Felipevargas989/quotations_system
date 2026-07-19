import {
  FurnitureItem,
  RecipeItem,
  Supply,
  grossQty,
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
  variable_services?: {
    items?: SnapshotItem[];
    // Cotizador 2.0: cada servicio multiplica por SUS personas (su
    // audiencia adultos/niños o un ajuste manual). Ausente = el total
    // del evento (cotizaciones antiguas).
    people?: number;
    audience?: "adultos" | "ninos";
    day?: number;
  }[];
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
export interface FurniturePeak {
  total: number; // necesidad del evento = MÁXIMO simultáneo entre servicios
  peakService: string; // servicio donde ocurre el peak
}

export const consolidateEvent = (
  items: EventItemsSnapshot | null | undefined,
  personas: number,
  ctx: ConsolidationContext,
  acc: ConsolidationAccumulator,
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
    serviceType: "variable" | "fixed",
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
      acc.noRecipe.push(nombre);
      return;
    }
    lines.forEach((line) => {
      // cantidad total = por persona × personas del servicio × cantidad
      const factor = servicePeople * (qty || 1);
      if (line.item_kind === "insumo" && line.supply_id) {
        const supply = ctx.supplyById.get(line.supply_id);
        if (!supply) return;
        // La receta viene en NETO (lo servido); se compra y cuesta la BRUTA
        // (neta + merma del insumo). Costo lineal por unidad base.
        const base = grossQty(
          toBaseQty(line.qty_per_person, line.unit) * factor,
          supply,
        );
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
      const id = resolveId(ctx, "variable", it.codigo, it.nombre);
      addRecipeLines("variable", id, it.nombre, it.quantity || 1, groupPeople);
    });
  });
  (items?.fixed_services || []).forEach((it) => {
    const id = resolveId(ctx, "fixed", it.codigo, it.nombre);
    addRecipeLines("fixed", id, it.nombre, it.quantity || 1);
    fixedList.push({ id, nombre: it.nombre, qty: it.quantity || 1 });
    // Costo del servicio fijo (tercerización): fijo + por persona × N.
    const costs = id !== undefined ? ctx.fixedCosts[id] : undefined;
    const fijo = costs?.cost_fixed || 0;
    const porPersona = costs?.cost_per_person || 0;
    costoFijos += (fijo + porPersona * personas) * (it.quantity || 1);
  });

  // Peak de mobiliario del evento (máximo simultáneo entre servicios) y
  // acumulación en el consolidado compartido.
  const furnPeak = new Map<number, FurniturePeak>();
  furnByService.forEach((perService, itemId) => {
    let peak = 0;
    let peakService = "";
    perService.forEach((qty, service) => {
      if (qty > peak) {
        peak = qty;
        peakService = service;
      }
    });
    furnPeak.set(itemId, { total: peak, peakService });
    const item = ctx.furnById.get(itemId);
    if (item) {
      const cur = acc.furnTotals.get(itemId);
      if (cur) cur.total += peak;
      else acc.furnTotals.set(itemId, { item, total: peak });
    }
  });

  return { costoInsumos, costoFijos, supplyUse, furnPeak, fixedServices: fixedList };
};
