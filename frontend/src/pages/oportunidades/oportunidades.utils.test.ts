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
  agruparPorMes,
  contarPorEstadoDeValidacion,
  criteriosPorPeso,
  estadoDeVencimiento,
  etiquetaDeDocumento,
  pesoComoNumero,
  requisitosPorTipo,
  textoDeCosto,
  mesDe,
  problemaDelAdjunto,
  textoDeAnios,
  urlCompetidor,
  seVeEnElVisor,
  tamanoLegible,
  urlMercadoPublico,
  algunaEnCurso,
  desgloseDeOferta,
  esWordModerno,
  ORIGENES,
  sePuedeFirmar,
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

describe("Se viene y competidores", () => {
  it("el mes en hora de Chile, con mayúscula", () => {
    expect(mesDe("2026-11-10T15:00:00.000Z")).toBe("Noviembre de 2026");
    // 1 de diciembre a las 01:00 UTC todavía es noviembre en Chile.
    expect(mesDe("2026-12-01T01:00:00.000Z")).toBe("Noviembre de 2026");
  });

  it("agrupa por mes en el orden en que llega", () => {
    const g = agruparPorMes([
      { esperada: "2026-10-20T15:00:00.000Z", n: 1 },
      { esperada: "2026-11-10T15:00:00.000Z", n: 2 },
      { esperada: "2026-11-25T15:00:00.000Z", n: 3 },
    ]);
    expect(g.map(([mes, items]) => [mes, items.map((i) => i.n)])).toEqual([
      ["Octubre de 2026", [1]],
      ["Noviembre de 2026", [2, 3]],
    ]);
  });

  it("los años, en castellano", () => {
    expect(textoDeAnios([2025])).toBe("Salió en 2025");
    expect(textoDeAnios([2023, 2024, 2025])).toBe("Salió en 2023, 2024 y 2025");
    expect(textoDeAnios([])).toBe("");
  });

  it("la ficha del competidor, con el RUT en la dirección", () => {
    expect(urlCompetidor("76154667-8")).toBe(
      "/oportunidades/competidores/76154667-8",
    );
  });
});

describe("lo que piden las bases", () => {
  it("los criterios de más peso a menos; sin peso, al final", () => {
    const c = criteriosPorPeso([
      { nombre: "Experiencia", peso: "20%" },
      { nombre: "Sin peso", peso: "" },
      { nombre: "Oferta económica", peso: "45 %" },
      { nombre: "Integridad", peso: "5,5%" },
    ]);
    expect(c.map((x) => x.nombre)).toEqual([
      "Oferta económica",
      "Experiencia",
      "Integridad",
      "Sin peso",
    ]);
    expect(pesoComoNumero("30 puntos")).toBe(30);
    expect(pesoComoNumero("no dice")).toBe(-1);
  });

  it("el checklist por tipo, en el orden de la casa y sin grupos vacíos", () => {
    const g = requisitosPorTipo([
      { tipo: "garantia", que: "Boleta" },
      { tipo: "administrativo", que: "Anexo 1" },
      { tipo: "administrativo", que: "Anexo 2" },
    ]);
    expect(g.map(([t, l]) => [t, l.length])).toEqual([
      ["Administrativos", 2],
      ["Garantías", 1],
    ]);
  });

  it("el costo en dólares, con coma", () => {
    expect(textoDeCosto(0.4213)).toBe("US$0,42");
    expect(textoDeCosto(null)).toBe("");
  });
});

describe("la carpeta de documentos de la empresa", () => {
  const HOY = "2026-10-17";

  it("vigente, por vencer (30 días o menos), vence hoy, vencido y sin vencimiento", () => {
    expect(estadoDeVencimiento("2027-03-01", HOY)).toEqual({
      texto: "Vigente hasta el 01/03/2027",
      tono: "ok",
    });
    expect(estadoDeVencimiento("2026-11-16", HOY)).toEqual({
      texto: "Vence en 30 días",
      tono: "pronto",
    });
    expect(estadoDeVencimiento("2026-10-18", HOY).texto).toBe("Vence en 1 día");
    expect(estadoDeVencimiento("2026-10-17", HOY)).toEqual({
      texto: "Vence hoy",
      tono: "pronto",
    });
    expect(estadoDeVencimiento("2026-10-16", HOY)).toEqual({
      texto: "Venció hace 1 día",
      tono: "vencido",
    });
    expect(estadoDeVencimiento(null, HOY)).toEqual({
      texto: "No vence",
      tono: "sin",
    });
  });

  it("el nombre de cada tipo; uno desconocido se muestra tal cual", () => {
    expect(etiquetaDeDocumento("f30")).toBe(
      "Certificado F30 (antecedentes laborales)",
    );
    expect(etiquetaDeDocumento("raro")).toBe("raro");
  });
});

describe("validar documentos", () => {
  it("cuenta cuántos cumplen, faltan, están vencidos o por revisar", () => {
    expect(
      contarPorEstadoDeValidacion([
        { estado: "cumple" },
        { estado: "cumple" },
        { estado: "falta" },
        { estado: "revisar" },
        { estado: "raro" },
      ]),
    ).toEqual({ cumple: 2, falta: 1, vencido: 0, revisar: 1 });
  });
});

describe("documentos con IA", () => {
  it("el total con IVA lo pone la empresa; neto e IVA se calculan igual que en el motor", () => {
    expect(desgloseDeOferta(11_900_000)).toEqual({
      total: 11_900_000,
      neto: 10_000_000,
      iva: 1_900_000,
    });
    // Sin decimales: el neto se redondea y el IVA es la diferencia exacta.
    const { neto, iva } = desgloseDeOferta(1_000_000);
    expect(neto).toBe(840_336);
    expect(neto + iva).toBe(1_000_000);
  });

  it("se llena y se firma un Word moderno; lo firmado no se vuelve a firmar", () => {
    expect(esWordModerno("Formularios_Anexos.DOCX")).toBe(true);
    expect(esWordModerno("Anexo antiguo.doc")).toBe(false);
    expect(
      sePuedeFirmar({ nombre: "Anexos - lleno.docx", origen: "generado" }),
    ).toBe(true);
    expect(sePuedeFirmar({ nombre: "Mi anexo.docx", origen: "subido" })).toBe(
      true,
    );
    expect(
      sePuedeFirmar({ nombre: "Anexos - firmado.docx", origen: "firmado" }),
    ).toBe(false);
    expect(sePuedeFirmar({ nombre: "Patente.pdf", origen: "subido" })).toBe(
      false,
    );
  });

  it("el sello dice si lo hizo la IA (sin firma) o si está firmado; lo subido no lleva", () => {
    expect(ORIGENES.subido).toBeNull();
    expect(ORIGENES.generado?.label).toBe("Hecho con IA · sin firma");
    expect(ORIGENES.firmado?.label).toBe("Firmado");
  });

  it("se pregunta seguido solo mientras algún trabajo está en curso", () => {
    expect(algunaEnCurso(null)).toBe(false);
    expect(algunaEnCurso({ anexos: null, firma: null, propuesta: null })).toBe(
      false,
    );
    expect(
      algunaEnCurso({
        anexos: { estado: "listo" } as never,
        propuesta: { estado: "procesando" } as never,
      }),
    ).toBe(true);
  });
});
