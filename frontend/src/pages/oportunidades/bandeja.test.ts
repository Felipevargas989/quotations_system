import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Oportunidad } from "../../services/oportunidades.service";
import {
  agruparPorCierre,
  contarPorVista,
  conVistaValida,
  HORAS_DEL_RADAR,
  MINUTO_DEL_RADAR,
  proximaPasada,
  queDiceLaBandejaVacia,
} from "./bandeja";
import { FILTROS_DE_PARTIDA, type Filtros } from "./oportunidades.utils";

// LA BANDEJA ORDENADA (Felipe, 18-10: "vamos con las 5").

const AHORA = Date.parse("2026-10-18T12:00:00Z");
const DIA = 86_400_000;
const cierraEn = (dias: number) => new Date(AHORA + dias * DIA).toISOString();

const op = (
  id: number,
  parcial: Partial<Omit<Oportunidad, "proceso">> & {
    readonly cierre?: string | null;
  } = {},
): Oportunidad => {
  const { cierre = null, ...resto } = parcial;
  return {
    id,
    codigo: `C-${id}`,
    semaforo: "verde",
    etiquetas: ["evento"],
    se_hace_en_el_complejo: "si",
    razon: "prueba",
    alertas: [],
    estado: "nueva",
    responsable_id: null,
    leida_en: null,
    ...resto,
    proceso: {
      tipo: "licitacion",
      nombre: `Proceso ${id}`,
      organismo: "I. Municipalidad de Quillón",
      organismo_codigo: null,
      unidad: null,
      comuna: "Quillón",
      region: "Región del Ñuble",
      monto: null,
      fecha_publicacion: null,
      fecha_cierre: cierre,
      estado: "Publicada",
    },
  } as Oportunidad;
};

describe("la próxima pasada del radar", () => {
  it("el horario es el mismo del reloj del motor (si cambia allá, esta prueba avisa)", () => {
    const cron = readFileSync(
      new URL(
        "../../../../api-rest/src/oportunidades/oportunidades-cron.service.ts",
        import.meta.url,
      ),
      "utf8",
    );
    const horario = /HORARIO_DEL_RADAR = '(\d+) ([\d,]+) \* \* \*'/.exec(cron);
    expect(horario).not.toBeNull();
    expect(Number(horario![1])).toBe(MINUTO_DEL_RADAR);
    expect(horario![2].split(",").map(Number)).toEqual([...HORAS_DEL_RADAR]);
    expect(cron).toContain("ZONA_DEL_RADAR = 'America/Santiago'");
  });

  it("en hora de Chile, la que sigue", () => {
    // Octubre: Chile está en UTC-3.
    expect(proximaPasada(new Date("2026-10-18T11:00:00Z"))).toBe("09:07"); // 08:00
    expect(proximaPasada(new Date("2026-10-18T15:30:00Z"))).toBe("15:07"); // 12:30
    expect(proximaPasada(new Date("2026-10-18T21:30:00Z"))).toBe("23:07"); // 18:30
  });

  it("de noche: después de las 23:07 viene la de las 02:07", () => {
    expect(proximaPasada(new Date("2026-10-18T02:55:00Z"))).toBe("02:07"); // 23:55
    expect(proximaPasada(new Date("2026-10-18T05:06:00Z"))).toBe("02:07"); // 02:06
    expect(proximaPasada(new Date("2026-10-18T05:07:00Z"))).toBe("05:07"); // 02:07, ya partió
  });

  it("en invierno también (Chile en UTC-4)", () => {
    expect(proximaPasada(new Date("2026-07-01T13:00:00Z"))).toBe("09:07"); // 09:00
  });
});

describe("los montones", () => {
  it("una vista que ya no existe, guardada en la sesión, vuelve a «Por revisar»", () => {
    const vieja = {
      ...FILTROS_DE_PARTIDA,
      vista: "abiertas",
    } as unknown as Filtros;
    expect(conVistaValida(vieja).vista).toBe("nueva");
    const buena: Filtros = { ...FILTROS_DE_PARTIDA, vista: "descartada" };
    expect(conVistaValida(buena)).toEqual(buena);
  });

  it("la basura guardada en la sesión se apaga: ya no tiene botón para apagarla (23-10)", () => {
    const conBasura: Filtros = {
      ...FILTROS_DE_PARTIDA,
      semaforos: ["verde", "basura", "rojo"],
    };
    expect(conVistaValida(conBasura).semaforos).toEqual(["verde", "rojo"]);
  });

  it("cada número es lo que se va a ver: con el semáforo y sin lo ya cerrado", () => {
    const lista = [
      op(1, { cierre: cierraEn(2) }),
      op(2, { cierre: cierraEn(5), semaforo: "amarillo" }),
      op(3, {
        cierre: cierraEn(5),
        semaforo: "rojo",
        alertas: ["comuna_cercana"],
      }),
      op(4, { cierre: cierraEn(-1) }),
      op(5, { cierre: cierraEn(3), estado: "descartada" }),
      op(6, { cierre: cierraEn(-3), estado: "descartada" }),
      op(7, { cierre: cierraEn(4), estado: "en_estudio" }),
      op(8, { cierre: cierraEn(6), semaforo: "rojo" }),
    ];
    // De partida cuentan verdes, amarillas y reciclaje; la basura no
    // (decisión 72, 23-10: el rojo se porta como el verde y el amarillo).
    expect(contarPorVista(lista, FILTROS_DE_PARTIDA, AHORA)).toEqual({
      nueva: 3,
      descartada: 1,
    });
    const sinReciclaje: Filtros = {
      ...FILTROS_DE_PARTIDA,
      semaforos: ["verde", "amarillo"],
    };
    expect(contarPorVista(lista, sinReciclaje, AHORA).nueva).toBe(2);
    // Al buscar, aparece también la basura.
    const buscando: Filtros = { ...FILTROS_DE_PARTIDA, busca: "Proceso 8" };
    expect(contarPorVista(lista, buscando, AHORA).nueva).toBe(1);
  });
});

describe("la lista agrupada por cierre", () => {
  const grupos = (lista: Oportunidad[]) =>
    agruparPorCierre(lista, AHORA).map((g) => [
      g.clave,
      g.filas.map((o) => o.id),
    ]);

  it("Prioridad arriba; después lo que cierra en 3 días o menos, esta semana y más adelante", () => {
    expect(
      grupos([
        op(1, { cierre: cierraEn(1) }),
        op(2, { cierre: cierraEn(3.5) }),
        op(3, { cierre: cierraEn(4) }),
        op(4, { cierre: cierraEn(7.5) }),
        op(5, { cierre: cierraEn(8) }),
        op(6, { cierre: cierraEn(10), alertas: ["comuna_cercana"] }),
      ]),
    ).toEqual([
      ["prioridad", [6]],
      ["pronto", [1, 2]],
      ["semana", [3, 4]],
      ["despues", [5]],
    ]);
  });

  it("sin grupos vacíos, y lo que no informa cierre va al final", () => {
    expect(
      grupos([op(1, { cierre: null }), op(2, { cierre: cierraEn(20) })]),
    ).toEqual([
      ["despues", [2]],
      ["sin_cierre", [1]],
    ]);
  });

  it("en el historial, lo ya cerrado al final y lo más reciente primero, aunque sea prioridad", () => {
    expect(
      grupos([
        op(1, { cierre: cierraEn(-10) }),
        op(2, { cierre: cierraEn(-1), alertas: ["comuna_cercana"] }),
        op(3, { cierre: cierraEn(2) }),
      ]),
    ).toEqual([
      ["pronto", [3]],
      ["cerradas", [2, 1]],
    ]);
  });

  it("una roja de comuna cercana no es prioridad (la misma regla de la ficha)", () => {
    expect(
      grupos([
        op(1, {
          cierre: cierraEn(1),
          semaforo: "rojo",
          alertas: ["comuna_cercana"],
        }),
      ]),
    ).toEqual([["pronto", [1]]]);
  });
});

describe("qué dice la bandeja vacía", () => {
  it("sin nada leído todavía", () => {
    expect(queDiceLaBandejaVacia(0, FILTROS_DE_PARTIDA)).toBe("sin_datos");
  });

  it("en «Por revisar» sin filtros: revisaste todo (lo del 17-10)", () => {
    expect(queDiceLaBandejaVacia(265, FILTROS_DE_PARTIDA)).toBe("al_dia");
  });

  it("encender las rojas no es un filtro que achique", () => {
    const f: Filtros = {
      ...FILTROS_DE_PARTIDA,
      semaforos: ["verde", "amarillo", "rojo"],
    };
    expect(queDiceLaBandejaVacia(265, f)).toBe("al_dia");
  });

  it("con tipo, región, buscador o un color apagado: se ofrece quitar los filtros", () => {
    for (const cambio of [
      { tipo: "compra_agil" },
      { region: "Región del Biobío" },
      { busca: "coffee" },
      { semaforos: ["amarillo"] },
    ] as Partial<Filtros>[]) {
      expect(
        queDiceLaBandejaVacia(265, { ...FILTROS_DE_PARTIDA, ...cambio }),
      ).toBe("con_filtros");
    }
    expect(
      queDiceLaBandejaVacia(265, { ...FILTROS_DE_PARTIDA, busca: "   " }),
    ).toBe("al_dia");
  });

  it("«Descartadas» o «Historial» vacíos", () => {
    expect(
      queDiceLaBandejaVacia(265, {
        ...FILTROS_DE_PARTIDA,
        vista: "descartada",
      }),
    ).toBe("nada");
  });
});
