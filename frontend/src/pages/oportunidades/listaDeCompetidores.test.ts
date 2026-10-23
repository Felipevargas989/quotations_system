import { describe, expect, it } from "vitest";
import type { CompetidorReal } from "../../services/competencia.service";
import {
  conMarca,
  conteos,
  deLaVista,
  textoDeCompradores,
  textoDeEncuentros,
  textoDelPrecio,
} from "./listaDeCompetidores";

// «TUS COMPETIDORES» (decisión 70, 22-10): los textos y filtros de la lista.

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
  en_tus_compradores: 0,
  triunfos_en_tus_compradores: 0,
  monto_ganado: 0,
  ultima: null,
  similar_razon: null,
  seguido: false,
  descartado: false,
  ...extra,
});

const LISTA = [
  competidor("1-9"),
  competidor("2-7", { etiquetas: ["similar"], nombre: "Centro Las Rosas" }),
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
    expect(deLaVista(LISTA, "compitio", false, "").map((c) => c.rut)).toEqual([
      "1-9",
      "3-5",
    ]);
    expect(deLaVista(LISTA, "similar", false, "").map((c) => c.rut)).toEqual([
      "2-7",
    ]);
    expect(deLaVista(LISTA, "seguido", false, "").map((c) => c.rut)).toEqual([
      "3-5",
    ]);
    expect(deLaVista(LISTA, "similar", true, "").map((c) => c.rut)).toEqual([
      "4-3",
    ]);
    expect(deLaVista(LISTA, "todos", false, "rosas").map((c) => c.rut)).toEqual(
      ["2-7"],
    );
    expect(conteos(LISTA)).toEqual({
      todos: 3,
      compitio: 2,
      similar: 1,
      seguido: 1,
      descartados: 1,
    });
  });

  it("los textos: encuentros, precio y compradores", () => {
    expect(
      textoDeEncuentros(
        competidor("1-9", { encuentros: 3, te_gano: 1, ganaste: 2 }),
      ),
    ).toBe("Se cruzaron 3 veces · ganó él 1 · ganaste tú 2");
    expect(textoDelPrecio(-8)).toBe("Su precio: 8 % más barato que el tuyo");
    expect(textoDelPrecio(12.5)).toBe("Su precio: 12,5 % más caro que el tuyo");
    expect(textoDelPrecio(0.01)).toBe("Su precio: igual al tuyo");
    expect(textoDelPrecio(null)).toBeNull();
    expect(
      textoDeCompradores(
        competidor("1-9", {
          en_tus_compradores: 5,
          triunfos_en_tus_compradores: 2,
          monto_ganado: 12_300_000,
        }),
      ),
    ).toMatch(/^En tus compradores: 5 ofertas, ganó 2 \(\$\s?12\.300\.000\)$/);
    expect(
      textoDeCompradores(competidor("1-9", { en_tus_compradores: 1 })),
    ).toBe("En tus compradores: 1 oferta, ganó 0");
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
    const soloSeguido = [
      competidor("9-9", { etiquetas: ["seguido"], seguido: true }),
    ];
    expect(
      conMarca(soloSeguido, {
        rut: "9-9",
        nombre: null,
        seguido: false,
        descartado: false,
      }),
    ).toEqual([]);
    const descartado = conMarca(LISTA, {
      rut: "2-7",
      nombre: null,
      seguido: false,
      descartado: true,
    });
    expect(descartado[1]).toMatchObject({
      etiquetas: ["similar"],
      descartado: true,
    });
  });
});
