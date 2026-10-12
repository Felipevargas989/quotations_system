import { describe, expect, it } from "vitest";
import {
  grupoDePaquete,
  mismoGrupo,
  nombreSinGrupo,
  porGrupoY,
} from "./grupoDePaquete";

describe("grupo de un paquete", () => {
  it("el grupo es lo que va antes de los dos puntos", () => {
    expect(grupoDePaquete("Full day: adulto mayor")).toBe("Full day");
    expect(grupoDePaquete("Jornada de trabajo: 1 día")).toBe(
      "Jornada de trabajo",
    );
  });

  it("sin dos puntos, o con los dos puntos al principio, no hay grupo", () => {
    expect(grupoDePaquete("Paquete de siempre")).toBe("");
    expect(grupoDePaquete(": raro")).toBe("");
  });

  it("bajo el título, la fila muestra lo que incluye con mayúscula", () => {
    expect(nombreSinGrupo("Full day: adulto mayor")).toBe("Adulto mayor");
    expect(nombreSinGrupo("Paquete de siempre")).toBe("Paquete de siempre");
  });

  it("mismo grupo sin importar mayúsculas ni tildes", () => {
    expect(mismoGrupo("Graduación: cóctel", "graduacion: cena")).toBe(true);
    expect(mismoGrupo("Full day: niños", "Matrimonio: de día")).toBe(false);
  });

  it("ordena por grupo, dentro por precio, y los sin grupo al final", () => {
    const precio: Record<string, number> = {
      "Matrimonio: de noche": 64100,
      "Full day: empresa": 57000,
      "Sin grupo": 1000,
      "Full day: adulto mayor": 34300,
    };
    const paquetes = Object.keys(precio).map((name) => ({ name }));
    const orden = [...paquetes]
      .sort(
        porGrupoY<{ name: string }>((a, b) => precio[a.name] - precio[b.name]),
      )
      .map((p) => p.name);
    expect(orden).toEqual([
      "Full day: adulto mayor",
      "Full day: empresa",
      "Matrimonio: de noche",
      "Sin grupo",
    ]);
  });
});
