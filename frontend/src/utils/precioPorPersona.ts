import type { ServiceGroup } from "../types/serviceGroups.types";
import type { ServiceGroupCollection } from "../types/serviceGroupCollections.types";

/** Lo que cuesta un menú guardado por persona: la suma de sus ítems,
 *  con el precio de hoy del catálogo. */
export const precioPorPersonaDeMenu = (g: Pick<ServiceGroup, "items">) =>
  (g.items ?? []).reduce(
    (s, it) => s + Number(it.service?.price ?? 0) * Number(it.quantity ?? 0),
    0,
  );

/** Orden para ELEGIR menús y paquetes (Felipe, 10-10-2026: "¿se pueden
 *  presentar en orden de precio cuando los previsualizo para elegirlos?"):
 *  de menor a mayor precio por persona y, a igual precio, por nombre. */
export const porPrecioYNombre =
  <T extends { name: string }>(precio: (x: T) => number) =>
  (a: T, b: T) =>
    precio(a) - precio(b) ||
    a.name.localeCompare(b.name, "es", { sensitivity: "base" });

/** Lo que cuesta un paquete por persona (Felipe, 06-10-2026: "al lado
 *  del nombre el valor por persona de los variables, sin sobresaturar"):
 *  sus menús + sus servicios sueltos por cantidad. Los FIJOS no entran:
 *  no son por persona. Un paquete solo de fijos da 0 y la lista no
 *  muestra valor. */
export const precioPorPersonaDePaquete = (
  p: Pick<ServiceGroupCollection, "groups" | "services">,
) =>
  (p.groups ?? []).reduce(
    (s, it) => s + (it.group ? precioPorPersonaDeMenu(it.group) : 0),
    0,
  ) +
  (p.services ?? []).reduce(
    (s, it) => s + Number(it.service?.price ?? 0) * Number(it.quantity ?? 0),
    0,
  );
