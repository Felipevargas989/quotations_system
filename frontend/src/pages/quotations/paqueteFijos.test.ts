import { describe, expect, it } from "vitest";
import { fijosDelPaquete } from "./paqueteFijos";
import type { ServiceGroupCollection } from "../../types/serviceGroupCollections.types";

const paquete = (fijos: { id: number; quantity: number }[]) =>
  ({
    id: 1,
    name: "Graduación",
    fixed_services: fijos.map((f) => ({
      quantity: f.quantity,
      service: { id: f.id, name: "x" },
    })),
  }) as unknown as ServiceGroupCollection;

const catalogo = [
  {
    codigo: "40",
    nombre: "Salón cúpula día completo",
    categoria: "General",
    tipo_calculo: "fijo",
    precio: 400000,
  },
];

describe("fijosDelPaquete (el salón ES parte del paquete)", () => {
  it("traduce el fijo del paquete al formato del formulario, con el precio de HOY", () => {
    const r = fijosDelPaquete(paquete([{ id: 40, quantity: 2 }]), catalogo, () => 400000);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({
      codigo: "40",
      nombre: "Salón cúpula día completo",
      precio_calculado: 400000,
      quantity: 2,
      tipo_calculo: "fijo",
    });
  });

  it("un fijo que salió del catálogo se salta: jamás se inventa un precio", () => {
    const r = fijosDelPaquete(paquete([{ id: 999, quantity: 1 }]), catalogo, () => 0);
    expect(r).toHaveLength(0);
  });

  it("un paquete viejo sin fijos no molesta", () => {
    const r = fijosDelPaquete({ id: 1, name: "viejo" } as unknown as ServiceGroupCollection, catalogo, () => 0);
    expect(r).toHaveLength(0);
  });
});
