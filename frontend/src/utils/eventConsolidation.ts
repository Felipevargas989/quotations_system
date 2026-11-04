import * as Cuenta from "@consolidacion";
import { FurnitureItem, RecipeItem, Supply } from "../types/logistics.types";

// Consolidación de insumos/mobiliario de eventos a partir de las recetas del
// catálogo. Lo usan la pestaña Gestión del evento y Compras multi-evento.
//
// LA CUENTA VIVE EN EL MOTOR desde el 03-11-2026
// (api-rest/src/logistics/utils/consolidacion.ts, alias @consolidacion),
// como la del dinero (@dinero): la misma que usa BelIA para decir lo que
// hay que comprar. Este archivo solo la ata a los tipos de la app, para que
// las siete pantallas sigan importando lo mismo de siempre.

export type {
  EventItemsSnapshot,
  FixedCostsById,
  FurniturePeak,
  NameIds,
  SnapshotItem,
} from "@consolidacion";

export type ConsolidatedSupply = Cuenta.ConsolidatedSupply<Supply>;
export type ConsolidatedFurniture = Cuenta.ConsolidatedFurniture<FurnitureItem>;
export type ConsolidationContext = Cuenta.ConsolidationContext<
  Supply,
  FurnitureItem
>;
export type ConsolidationAccumulator = Cuenta.ConsolidationAccumulator<
  Supply,
  FurnitureItem
>;

export const buildConsolidationContext = (
  recipes: RecipeItem[],
  supplies: Supply[],
  furniture: FurnitureItem[],
  nameIds: Cuenta.NameIds,
  fixedCosts: Cuenta.FixedCostsById,
): ConsolidationContext =>
  Cuenta.buildConsolidationContext(
    recipes,
    supplies,
    furniture,
    nameIds,
    fixedCosts,
  );

export const newAccumulator = (): ConsolidationAccumulator =>
  Cuenta.newAccumulator<Supply, FurnitureItem>();

export const servicesSignature = Cuenta.servicesSignature;

export const consolidateEvent = (
  items: Cuenta.EventItemsSnapshot | null | undefined,
  personas: number,
  ctx: ConsolidationContext,
  acc: ConsolidationAccumulator,
) => Cuenta.consolidateEvent(items, personas, ctx, acc);
