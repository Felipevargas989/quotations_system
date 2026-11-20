import { describe, expect, it } from "vitest";
import {
  repartirPaquetePorDia,
  type CajaDePaquete,
} from "./repartirPaquetePorDia";

// AL CARGAR UN PAQUETE, CADA CASILLA CAE EN SU DÍA (Felipe, 20-11-2026).
// El modelo es la cotización 711 de Joker (Sernatur, 22 al 27-11, 6 días):
// día 1 = almuerzo + cena + alojamiento; días 2 a 5 = desayuno + almuerzo
// + cena + alojamiento, con la fiesta el día 5; día 6 = desayuno.

let n = 0;
const menu = (
  nombre: string,
  categoria: string,
  servicios = ["Plato"],
): CajaDePaquete => ({
  id: `m${++n}`,
  groupName: nombre,
  selectedCategory: categoria,
  services: servicios.map((s) => ({ nombre: s, quantity: 1 })),
});
const suelto = (
  categoria: string,
  servicios: [string, number][],
): CajaDePaquete => ({
  id: `s${++n}`,
  selectedCategory: categoria,
  services: servicios.map(([s, q]) => ({ nombre: s, quantity: q })),
});

// Lo que tiene cada día, en el orden del arreglo: «A» almuerzo, «C» cena,
// «D» desayuno, «H» alojamiento (hotel), «F» fiesta, «X» otra cosa.
const letra = (c: CajaDePaquete): string => {
  const servicios = c.services.map((s) => s.nombre).join(" ");
  const de = (t: string) => {
    t = t.toLowerCase();
    if (t.includes("fiesta")) return "F";
    if (t.includes("desayuno")) return "D";
    if (t.includes("ingreso") || t.includes("alojamiento")) return "H";
    if (t.includes("almuerzo")) return "A";
    if (t.includes("cena")) return "C";
    return "";
  };
  return (
    de(servicios).replace(/[^F]/, "") ||
    de(c.groupName || "") ||
    de(c.selectedCategory) ||
    "X"
  );
};
const porDia = (cajas: CajaDePaquete[], dias: number) => {
  const r: Record<number, string> = {};
  for (const c of cajas) r[c.day!] = (r[c.day!] || "") + letra(c);
  return Array.from({ length: dias }, (_, i) =>
    [...(r[i + 1] || "")].sort().join(""),
  );
};

const sernatur = () => [
  ...[1, 2, 3, 4, 5].map((k) =>
    menu(`Sernatur Desayuno Día ${k}`, "Sernatur - desayuno"),
  ),
  ...[1, 2, 3, 4, 5].map((k) =>
    menu(`Sernatur Almuerzo Día ${k}`, "Sernatur - almuerzo"),
  ),
  ...[1, 2, 3, 4, 5].map((k) =>
    menu(`Sernatur Cena Día ${k}`, "Sernatur - cena"),
  ),
  // Los sueltos van después de los menús, agrupados por categoría.
  suelto("Sernatur - cena", [["Fiesta despedida", 1]]),
  suelto("Servicios de Ingreso", [["Alojamiento - Sernatur", 5]]),
];

describe("repartirPaquetePorDia", () => {
  it("«Sernatur: programa 5 días» queda como la 711", () => {
    const r = repartirPaquetePorDia(sernatur(), 6);
    expect(porDia(r, 6)).toEqual([
      "ACH", // día 1
      "ACDH",
      "ACDH",
      "ACDH",
      "ACDFH", // día 5, con la fiesta
      "D", // día 6
    ]);
  });

  it("el alojamiento × 5 se parte en 5 casillas × 1, una por noche", () => {
    const r = repartirPaquetePorDia(sernatur(), 6);
    const noches = r.filter(
      (c) => c.selectedCategory === "Servicios de Ingreso",
    );
    expect(noches.map((c) => c.day)).toEqual([1, 2, 3, 4, 5]);
    expect(noches.every((c) => c.services[0].quantity === 1)).toBe(true);
    expect(new Set(noches.map((c) => c.id)).size).toBe(5);
  });

  it("el orden del paquete manda, aunque vengan mezclados", () => {
    const mezclado = [
      menu("Almuerzo A", "Sernatur - almuerzo"),
      menu("Desayuno A", "Sernatur - desayuno"),
      menu("Cena A", "Sernatur - cena"),
      menu("Almuerzo B", "Sernatur - almuerzo"),
      suelto("Servicios de Ingreso", [["Alojamiento", 2]]),
    ];
    const r = repartirPaquetePorDia(mezclado, 3);
    expect(r.map((c) => `${c.groupName || "noche"}:${c.day}`)).toEqual([
      "Almuerzo A:1",
      "Desayuno A:2",
      "Cena A:1",
      "Almuerzo B:2",
      "noche:1",
      "noche:2",
    ]);
  });

  it("«Estadía adultos mayores 2 días»", () => {
    const r = repartirPaquetePorDia(
      [
        menu("Almuerzo día 1", "Almuerzos & Cenas"),
        menu("Cena día 1", "Almuerzos & Cenas"),
        menu("Desayuno", "Desayunos & Onces"),
        menu("Almuerzo día 2", "Almuerzos & Cenas"),
        suelto("Alojamiento", [["Cabaña", 1]]),
      ],
      2,
    );
    expect(porDia(r, 2)).toEqual(["ACH", "AD"]);
  });

  it("las «Almuerzos & Cenas» sin nombre se turnan: alm 1, cena 1, alm 2…", () => {
    const amb = [1, 2, 3, 4, 5].map(() =>
      suelto("Almuerzos & Cenas", [["Plato", 1]]),
    );
    expect(repartirPaquetePorDia(amb, 3).map((c) => c.day)).toEqual([
      1, 1, 2, 2, 3,
    ]);
  });

  it("sin alojamiento: el desayuno al día 1 y la fiesta el último día", () => {
    const r = repartirPaquetePorDia(
      [
        menu("Desayuno", "Desayunos"),
        menu("Desayuno 2", "Desayunos"),
        menu("Almuerzo", "Almuerzos"),
        suelto("Extras", [["Fiesta despedida", 1]]),
        suelto("Decoración", [["Globos", 1]]),
      ],
      3,
    );
    expect(r.map((c) => c.day)).toEqual([1, 1, 1, 3, 1]);
  });

  it("todo se acota al largo del evento; con un día, todo al día 1", () => {
    expect(repartirPaquetePorDia(sernatur(), 1).every((c) => c.day === 1)).toBe(
      true,
    );
    const r = repartirPaquetePorDia(sernatur(), 3);
    expect(Math.max(...r.map((c) => c.day!))).toBe(3);
  });

  it("un alojamiento dentro de un menú guardado no se parte", () => {
    const r = repartirPaquetePorDia(
      [
        {
          ...menu("Alojamiento pack", "Alojamiento"),
          services: [{ nombre: "Noche", quantity: 3 }],
        },
      ],
      4,
    );
    expect(r).toHaveLength(1);
    expect(r[0].day).toBe(1);
  });

  describe("desde qué día parte", () => {
    it("desde el día 8 de 13, un programa de 5 noches queda en los días 8 a 13", () => {
      const r = repartirPaquetePorDia(sernatur(), 13, 8);
      expect(porDia(r, 13)).toEqual([
        ...Array(7).fill(""),
        "ACH", // día 8 = su día 1
        "ACDH",
        "ACDH",
        "ACDH",
        "ACDFH", // día 12, con la fiesta
        "D", // día 13
      ]);
    });

    it("desde el día 1 es lo de siempre", () => {
      expect(
        repartirPaquetePorDia(sernatur(), 6, 1).map((c) => c.day),
      ).toEqual(repartirPaquetePorDia(sernatur(), 6).map((c) => c.day));
    });

    it("lo que se pasa del último día queda en el último día", () => {
      const r = repartirPaquetePorDia(sernatur(), 10, 8);
      expect(r.every((c) => c.day! >= 8 && c.day! <= 10)).toBe(true);
      expect(porDia(r, 10).slice(7)).toEqual([
        "ACH",
        "ACDH",
        "AAACCCDDDDFHHH",
      ]);
    });

    it("un día fuera de rango o inválido no rompe nada", () => {
      expect(
        repartirPaquetePorDia(sernatur(), 3, 99).every((c) => c.day === 3),
      ).toBe(true);
      expect(
        repartirPaquetePorDia(sernatur(), 6, 0).map((c) => c.day),
      ).toEqual(repartirPaquetePorDia(sernatur(), 6).map((c) => c.day));
    });
  });
});
