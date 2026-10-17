import { describe, expect, it } from "vitest";
import type { Oportunidad } from "../../services/oportunidades.service";
import {
  contarPorSemaforo,
  cuandoCierra,
  esPrioridad,
  FILTROS_DE_PARTIDA,
  textoDelAnterior,
  filtrar,
  filtrarSinSemaforo,
  problemaDelAdjunto,
  seVeEnElVisor,
  tamanoLegible,
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
    organismo_codigo: null,
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

describe("esPrioridad", () => {
  it("comuna cercana o alto valor, en verde o amarillo, va arriba", () => {
    expect(
      esPrioridad({ semaforo: "amarillo", alertas: ["comuna_cercana"] }),
    ).toBe(true);
    expect(esPrioridad({ semaforo: "verde", alertas: ["alto_valor"] })).toBe(
      true,
    );
  });

  it("sin marcas, o en rojo, no", () => {
    expect(esPrioridad({ semaforo: "verde", alertas: [] })).toBe(false);
    expect(esPrioridad({ semaforo: "rojo", alertas: ["alto_valor"] })).toBe(
      false,
    );
  });
});

describe("textoDelAnterior", () => {
  it("quién ganó, por cuánto y cuántos ofertaron", () => {
    const t = textoDelAnterior({
      codigo: "4364-5-LE25",
      nombre: "Día del profesor",
      anio: 2025,
      oferentes: 1,
      url_acta: null,
      ganadores: [{ nombre: "SOL DE QUILLON SPA", monto: 12_000_000 }],
    });
    expect(t).toMatch(
      /^2025: ganó SOL DE QUILLON SPA por \$\s?12\.000\.000 · 1 oferta$/,
    );
  });

  it("sin monto ni oferentes, lo que haya", () => {
    expect(
      textoDelAnterior({
        codigo: "X",
        nombre: "x",
        anio: null,
        oferentes: null,
        url_acta: null,
        ganadores: [{ nombre: "A", monto: null }],
      }),
    ).toBe("Antes: ganó A");
  });
});

describe("bases y anexos", () => {
  const MB = 1024 * 1024;

  it("sirven las bases de siempre: PDF, Word, Excel, ZIP (sin mirar mayúsculas)", () => {
    for (const name of [
      "Bases.pdf",
      "Anexos.DOCX",
      "Oferta.xlsx",
      "Todo.zip",
    ]) {
      expect(problemaDelAdjunto({ name, size: MB })).toBeNull();
    }
  });

  it("no sirven HTML, ejecutables ni archivos sin extensión", () => {
    for (const name of ["pagina.html", "instalar.exe", "bases"]) {
      expect(problemaDelAdjunto({ name, size: MB })).toContain(
        "no se puede subir",
      );
    }
  });

  it("vacío o de más de 30 MB, lo dice antes de subirlo", () => {
    expect(problemaDelAdjunto({ name: "a.pdf", size: 0 })).toContain("vacío");
    expect(problemaDelAdjunto({ name: "a.pdf", size: 30 * MB + 1 })).toContain(
      "30 MB",
    );
    expect(problemaDelAdjunto({ name: "a.pdf", size: 30 * MB })).toBeNull();
  });

  it("el tamaño, legible", () => {
    expect(tamanoLegible(800)).toBe("800 B");
    expect(tamanoLegible(2048)).toBe("2 KB");
    expect(tamanoLegible(1.25 * MB)).toBe("1,3 MB");
  });

  it("PDF e imágenes se ven en el visor; Word, Excel y ZIP se descargan", () => {
    expect(seVeEnElVisor("c1/oportunidades/9/x_Bases.PDF")).toBe(true);
    expect(seVeEnElVisor("c1/oportunidades/9/x_plano.jpg")).toBe(true);
    expect(seVeEnElVisor("c1/oportunidades/9/x_Anexos.docx")).toBe(false);
    expect(seVeEnElVisor("c1/oportunidades/9/x_Todo.zip")).toBe(false);
  });
});
