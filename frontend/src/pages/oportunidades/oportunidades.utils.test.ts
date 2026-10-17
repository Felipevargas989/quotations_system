import { describe, expect, it } from "vitest";
import type { Oportunidad } from "../../services/oportunidades.service";
import {
  contarPorSemaforo,
  cuandoCierra,
  FILTROS_DE_PARTIDA,
  filtrar,
  filtrarSinSemaforo,
  urlMercadoPublico,
} from "./oportunidades.utils";

const op = (parcial: Partial<Oportunidad> & { id: number }): Oportunidad => ({
  codigo: `C-${parcial.id}`,
  semaforo: "verde",
  etiquetas: ["evento"],
  se_hace_en_el_complejo: "si",
  razon: "prueba",
  alertas: [],
  estado: "nueva",
  responsable_id: null,
  leida_en: null,
  ...parcial,
  proceso: {
    tipo: "licitacion",
    nombre: `Proceso ${parcial.id}`,
    organismo: "I. Municipalidad de Quillón",
    unidad: null,
    comuna: "Quillón",
    region: "Región del Ñuble",
    monto: null,
    fecha_publicacion: null,
    fecha_cierre: null,
    estado: "Publicada",
    ...parcial.proceso,
  },
});

describe("la bandeja: qué se ve de partida", () => {
  const lista = [
    op({ id: 1, semaforo: "verde" }),
    op({ id: 2, semaforo: "amarillo", estado: "en_estudio" }),
    op({ id: 3, semaforo: "rojo" }),
    op({ id: 4, semaforo: "verde", estado: "descartada" }),
    op({ id: 5, semaforo: "verde", estado: "ganada" }),
  ];

  it("las rojas y lo descartado o resuelto quedan fuera", () => {
    expect(filtrar(lista, FILTROS_DE_PARTIDA).map((o) => o.id)).toEqual([1, 2]);
  });

  it("los contadores de los chips cuentan con los demás filtros, sin el semáforo", () => {
    const cuenta = contarPorSemaforo(
      filtrarSinSemaforo(lista, FILTROS_DE_PARTIDA),
    );
    expect(cuenta).toEqual({ verde: 1, amarillo: 1, rojo: 1 });
  });

  it("con las rojas encendidas, se ven", () => {
    const f = {
      ...FILTROS_DE_PARTIDA,
      semaforos: ["verde", "amarillo", "rojo"] as const,
    };
    expect(filtrar(lista, f).map((o) => o.id)).toEqual([1, 2, 3]);
  });

  it("la vista Descartadas muestra solo esas", () => {
    const f = { ...FILTROS_DE_PARTIDA, vista: "descartada" as const };
    expect(filtrar(lista, f).map((o) => o.id)).toEqual([4]);
  });

  it("el buscador mira nombre, organismo, comuna y código, sin tildes", () => {
    const conNombre = [
      op({
        id: 7,
        proceso: { nombre: "Día del Profesor" } as Oportunidad["proceso"],
      }),
      op({
        id: 8,
        proceso: { nombre: "Coffee break" } as Oportunidad["proceso"],
      }),
    ];
    const f = { ...FILTROS_DE_PARTIDA, busca: "dia profesor" };
    expect(filtrar(conNombre, f).map((o) => o.id)).toEqual([7]);
    expect(
      filtrar(conNombre, { ...FILTROS_DE_PARTIDA, busca: "C-8" }).map(
        (o) => o.id,
      ),
    ).toEqual([8]);
  });
});

describe("cuandoCierra", () => {
  const ahora = new Date("2026-10-17T12:00:00Z").getTime();

  it("en días, en horas, o cerrada", () => {
    expect(cuandoCierra("2026-10-19T19:00:00Z", ahora)).toEqual({
      texto: "cierra en 2 días",
      urgente: true,
      cerrada: false,
    });
    expect(cuandoCierra("2026-10-17T17:00:00Z", ahora).texto).toBe(
      "cierra en 5 h",
    );
    expect(cuandoCierra("2026-10-30T19:00:00Z", ahora).urgente).toBe(false);
    expect(cuandoCierra("2026-10-16T19:00:00Z", ahora).cerrada).toBe(true);
    expect(cuandoCierra(null, ahora).texto).toBe("sin cierre informado");
  });
});

describe("urlMercadoPublico", () => {
  it("licitaciones a su ficha clásica, compras ágiles al buscador", () => {
    expect(urlMercadoPublico("4364-13-LE26", "licitacion")).toBe(
      "https://www.mercadopublico.cl/Procurement/Modules/RFB/DetailsAcquisition.aspx?idlicitacion=4364-13-LE26",
    );
    expect(urlMercadoPublico("5040-209-COT26", "compra_agil")).toBe(
      "https://buscador.mercadopublico.cl/ficha?code=5040-209-COT26",
    );
  });
});
