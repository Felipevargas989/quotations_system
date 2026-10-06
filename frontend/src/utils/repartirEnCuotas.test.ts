import { describe, expect, it } from "vitest";
import { repartirEnCuotas } from "./repartirEnCuotas";

describe("repartir el total en cuotas iguales", () => {
  it("divide parejo cuando se puede", () => {
    expect(repartirEnCuotas(1_200_000, 2)).toEqual([600_000, 600_000]);
    expect(repartirEnCuotas(1_200_000, 3)).toEqual([400_000, 400_000, 400_000]);
  });

  it("el resto va a la primera cuota y la suma cuadra al peso", () => {
    const cuotas = repartirEnCuotas(1_000_001, 3);
    expect(cuotas).toEqual([333_335, 333_333, 333_333]);
    expect(cuotas.reduce((a, b) => a + b, 0)).toBe(1_000_001);
  });

  it("una cuota es el total", () => {
    expect(repartirEnCuotas(9_464_000, 1)).toEqual([9_464_000]);
  });
});
