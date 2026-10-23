import { describe, expect, it } from "vitest";
import type { CompetidorReal } from "../../services/competencia.service";
import {
  conMarca,
  conteos,
  deLaVista,
  textoDeEncuentros,
  textoDeLasActas,
  textoDelPrecio,
  textoDeMercado,
} from "./listaDeCompetidores";

// «TUS COMPETIDORES» (decisiones 70 y 71): los textos y filtros de la lista.
// Desde el 23-10 sin «Parecido a ti», con la historia de cada uno en la
// zona y el precio comparado solo en las líneas que ofertaron los dos.

const competidor = (
  rut: string,
  extra: Partial<CompetidorReal> = {},
): CompetidorReal => ({
  rut,
  nombre: `Proveedor ${rut}`,
  etiquetas: ["compitio"],
  encuentros: 1,
  te_gano: 0,
  ganaste: 1,
  diferencia_de_precio: null,
  lineas_comparadas: 0,
  participaciones: 1,
  ganadas: 0,
  monto_ganado: 0,
  ultima: null,
  comprador_principal: null,
  seguido: false,
  descartado: false,
  ...extra,
});

const LISTA = [
  competidor("1-9"),
  competidor("2-7", { nombre: "Centro Las Rosas" }),
  competidor("3-5", { etiquetas: ["compitio", "seguido"], seguido: true }),
  competidor("4-3", { descartado: true }),
];

describe("La lista de «Tus competidores»", () => {
  it("cada vista con lo suyo; los descartados, solo en su botón", () => {
    expect(deLaVista(LISTA, "todos", false, "").map((c) => c.rut)).toEqual([
      "1-9",
      "2-7",
      "3-5",
    ]);
    expect(deLaVista(LISTA, "seguido", false, "").map((c) => c.rut)).toEqual([
      "3-5",
    ]);
    expect(deLaVista(LISTA, "todos", true, "").map((c) => c.rut)).toEqual([
      "4-3",
    ]);
    expect(deLaVista(LISTA, "todos", false, "rosas").map((c) => c.rut)).toEqual(
      ["2-7"],
    );
    expect(conteos(LISTA)).toEqual({ todos: 3, seguido: 1, descartados: 1 });
  });

  it("los textos: encuentros, precio solo en líneas comparables, y su historia en la zona", () => {
    expect(
      textoDeEncuentros(
        competidor("1-9", { encuentros: 3, te_gano: 1, ganaste: 2 }),
      ),
    ).toBe("Se cruzaron 3 veces · ganó él 1 · ganaste tú 2");
    expect(textoDelPrecio(-8, 1)).toBe("Su precio: 8 % más barato que el tuyo");
    expect(textoDelPrecio(12.5, 3)).toBe(
      "Su precio: 12,5 % más caro que el tuyo en 3 líneas",
    );
    expect(textoDelPrecio(0.01, 1)).toBe("Su precio: igual al tuyo");
    // Centropan ofertó pan y tú el almuerzo: antes salía «3.984 % más caro».
    expect(textoDelPrecio(null, 0)).toBe(
      "Ofertaron líneas distintas: no se compara el precio",
    );
    expect(
      textoDeMercado(
        competidor("1-9", {
          participaciones: 12,
          ganadas: 5,
          monto_ganado: 31_115_077,
          comprador_principal: { nombre: "DAEM Quillón", veces: 7 },
        }),
      ),
    ).toMatch(
      /^En tu zona: participó 12 veces, ganó 5 \(\$\s?31\.115\.077\) · más con DAEM Quillón$/,
    );
    expect(textoDeMercado(competidor("1-9"))).toBe(
      "En tu zona: participó 1 vez, ganó 0",
    );
  });

  it("cuántas actas van leídas, sin botón", () => {
    expect(textoDeLasActas({ leidas: 89, total: 5977, leyendo: true })).toBe(
      "Actas leídas: 89 de 5.977 de tu zona · leyendo ahora.",
    );
    expect(textoDeLasActas({ leidas: 89, total: 5977, leyendo: false })).toBe(
      "Actas leídas: 89 de 5.977 de tu zona · se siguen leyendo solas cada noche.",
    );
    expect(textoDeLasActas({ leidas: 5977, total: 5977, leyendo: false })).toBe(
      "Actas leídas: las 5.977 de tu zona, al día.",
    );
  });

  it("al marcar: «Lo sigues» entra o sale, y quien se queda sin razón sale de la lista", () => {
    const seguido = conMarca(LISTA, {
      rut: "1-9",
      nombre: null,
      seguido: true,
      descartado: false,
    });
    expect(seguido[0]).toMatchObject({
      etiquetas: ["compitio", "seguido"],
      seguido: true,
    });
    expect(
      conMarca([competidor("9-9", { etiquetas: ["seguido"], seguido: true })], {
        rut: "9-9",
        nombre: null,
        seguido: false,
        descartado: false,
      }),
    ).toEqual([]);
  });
});
