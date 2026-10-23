import { describe, expect, it } from "vitest";
import type { Oportunidad } from "../../services/oportunidades.service";
import {
  colorDeLaOportunidad,
  contarPorSemaforo,
  cuandoCierra,
  esPrioridad,
  FILTROS_DE_PARTIDA,
  VISTAS,
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
  pasosDelAvance,
  separarMias,
  alertasDelAnalisis,
  fechaDelEvento,
} from "./oportunidades.utils";
import { preguntarDeNuevo, SELLO_DEL_TIPO } from "./tipoDeProceso";

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

describe("compras ágiles y licitaciones (Felipe, 17-10)", () => {
  it("cada tipo tiene su sello, de colores distintos", () => {
    expect(SELLO_DEL_TIPO.licitacion).toContain("indigo");
    expect(SELLO_DEL_TIPO.compra_agil).toContain("violet");
  });

  it("la ficha vuelve a preguntar solo mientras el motor trae el detalle", () => {
    expect(preguntarDeNuevo("trayendo")).toBe(4000);
    expect(preguntarDeNuevo("no_disponible")).toBe(false);
    expect(preguntarDeNuevo(null)).toBe(false);
    expect(preguntarDeNuevo(undefined)).toBe(false);
  });
});

describe("la bandeja: qué se ve de partida", () => {
  const lista = [
    op({ id: 1, semaforo: "verde" }),
    op({ id: 2, semaforo: "amarillo", estado: "en_estudio" }),
    op({ id: 3, semaforo: "rojo" }),
    op({ id: 4, semaforo: "verde", estado: "descartada" }),
    op({ id: 5, semaforo: "verde", estado: "ganada" }),
    // Roja de tu zona y tu rubro: el reciclaje (decisión 72).
    op({ id: 6, semaforo: "rojo", alertas: ["comuna_cercana"] }),
  ];

  it("abre en «Por revisar»: verdes, amarillas y reciclaje, sin la basura ni lo ya marcado (Felipe, 17-10 y 23-10)", () => {
    expect(FILTROS_DE_PARTIDA.vista).toBe("nueva");
    expect(VISTAS[0]).toMatchObject({ value: "nueva", label: "Por revisar" });
    expect(filtrar(lista, FILTROS_DE_PARTIDA).map((o) => o.id)).toEqual([1, 6]);
  });

  it("cuatro montones: lo en estudio vive en «Mis licitaciones», no en la bandeja (18-10); «En seguimiento», lo que se sigue sin postular (19-10)", () => {
    expect(VISTAS.map((v) => v.label)).toEqual([
      "Por revisar",
      "Descartadas",
      "En seguimiento",
      "Historial",
    ]);
    const enEstudio = (vista: (typeof VISTAS)[number]["value"]) =>
      filtrar(lista, { ...FILTROS_DE_PARTIDA, vista }).some((o) => o.id === 2);
    expect(enEstudio("nueva")).toBe(false);
    expect(enEstudio("descartada")).toBe(false);
    expect(enEstudio("seguida")).toBe(false);
    expect(enEstudio("historial")).toBe(true);
    const seguida = { ...lista[0], id: 9, estado: "seguida" as const };
    expect(
      filtrar([seguida], { ...FILTROS_DE_PARTIDA, vista: "seguida" }).map(
        (o) => o.id,
      ),
    ).toEqual([9]);
  });

  it("los contadores de los chips cuentan con los demás filtros, sin el semáforo", () => {
    const cuenta = contarPorSemaforo(
      filtrarSinSemaforo(lista, FILTROS_DE_PARTIDA),
    );
    expect(cuenta).toEqual({ verde: 1, amarillo: 0, rojo: 1, basura: 1 });
  });

  it("el rojo se parte en dos: el reciclaje se ve como el verde y el amarillo, y la basura solo al buscar (decisión 72)", () => {
    expect(colorDeLaOportunidad(lista[2])).toBe("basura");
    expect(colorDeLaOportunidad(lista[5])).toBe("rojo");
    expect(colorDeLaOportunidad(lista[0])).toBe("verde");
    // Lo que la IA no aprueba nunca es prioridad, aunque sea de tu zona.
    expect(esPrioridad(lista[5])).toBe(false);
    const sinReciclaje = {
      ...FILTROS_DE_PARTIDA,
      semaforos: ["verde", "amarillo"] as const,
    };
    expect(filtrar(lista, sinReciclaje).map((o) => o.id)).toEqual([1]);
    // Felipe, 23-10: "gris lo eliminaría". Lo guardado se encuentra
    // buscando: la basura aparece solo con algo escrito en el buscador.
    const buscando = { ...FILTROS_DE_PARTIDA, busca: "Proceso 3" };
    expect(filtrar(lista, buscando).map((o) => o.id)).toEqual([3]);
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
  it("de tu rubro (verde o amarillo) y de una comuna cercana, va arriba", () => {
    expect(
      esPrioridad({ semaforo: "amarillo", alertas: ["comuna_cercana"] }),
    ).toBe(true);
    expect(
      esPrioridad({
        semaforo: "verde",
        alertas: ["comuna_cercana", "alto_valor"],
      }),
    ).toBe(true);
  });

  it("el monto solo no es prioridad (decisión 64: «algo puede tener 60 millones, pero si es de Concepción...»)", () => {
    expect(esPrioridad({ semaforo: "verde", alertas: ["alto_valor"] })).toBe(
      false,
    );
  });

  it("sin marcas, o en rojo, no", () => {
    expect(esPrioridad({ semaforo: "verde", alertas: [] })).toBe(false);
    expect(esPrioridad({ semaforo: "rojo", alertas: ["comuna_cercana"] })).toBe(
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
    // El Word se lee en Eventia desde el 19-10 (decisión 46); el .doc
    // antiguo, no.
    expect(seVeEnElVisor("c1/oportunidades/9/x_Anexos.docx")).toBe(true);
    expect(seVeEnElVisor("c1/oportunidades/9/x_Anexo antiguo.doc")).toBe(false);
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

describe("Mis licitaciones: el avance", () => {
  const avance = {
    bases: 0,
    analisis: null,
    anexos: null,
    propuesta: null,
    postulacion: 0,
    generados: 0,
    firmados: 0,
    validacion: null,
  };
  const estados = (m: Parameters<typeof pasosDelAvance>[0]) =>
    Object.fromEntries(pasosDelAvance(m).map((p) => [p.paso, p.estado]));

  it("mientras la IA arma «1. Qué ofreces», Anexos gira: es lo primero de «Armar postulación» (23-10)", () => {
    // Felipe: "por qué anexos ahí no se queda pensando? ahí tampoco".
    expect(
      estados({
        estado: "en_estudio",
        avance: {
          ...avance,
          bases: 3,
          analisis: "listo",
          oferta: "procesando",
        },
      }).Anexos,
    ).toBe("en_curso");
  });

  it("mientras el motor trae los documentos, Bases gira aunque ya haya llegado alguno, y queda lista recién al terminar (23-10)", () => {
    // Felipe: "mientras está trayendo, las etapas de bases aparecen
    // pensando".
    const trayendo = { ...avance, bases: 2, trayendo: true };
    expect(estados({ estado: "en_estudio", avance: trayendo }).Bases).toBe(
      "en_curso",
    );
    expect(
      estados({
        estado: "en_estudio",
        avance: { ...trayendo, trayendo: false },
      }).Bases,
    ).toBe("hecho");
    expect(estados({ estado: "postulada", avance: trayendo }).Bases).toBe(
      "hecho",
    );
  });

  it("recién marcada: faltan las bases y lo demás está por hacer", () => {
    expect(estados({ estado: "en_estudio", avance })).toEqual({
      Bases: "falta",
      Análisis: "pendiente",
      Anexos: "pendiente",
      Firma: "pendiente",
      Validación: "pendiente",
      Postulada: "pendiente",
    });
  });

  it("a medio camino: bases, análisis y anexos hechos; la IA validando", () => {
    expect(
      estados({
        estado: "en_estudio",
        avance: {
          ...avance,
          bases: 3,
          analisis: "listo",
          generados: 1,
          validacion: { estado: "procesando", listo: null },
        },
      }),
    ).toMatchObject({
      Bases: "hecho",
      Análisis: "hecho",
      Anexos: "hecho",
      Firma: "pendiente",
      Validación: "en_curso",
    });
  });

  it("la IA armando otra vez (anexos o la propuesta) se ve girando aunque ya hubiera anexos (23-10)", () => {
    const base = { ...avance, bases: 2, analisis: "listo" as const };
    expect(
      estados({
        estado: "en_estudio",
        avance: { ...base, generados: 2, anexos: "procesando" },
      }).Anexos,
    ).toBe("en_curso");
    expect(
      estados({
        estado: "en_estudio",
        avance: { ...base, propuesta: "procesando" },
      }).Anexos,
    ).toBe("en_curso");
    expect(
      estados({ estado: "en_estudio", avance: { ...base, generados: 2 } })
        .Anexos,
    ).toBe("hecho");
    expect(
      estados({
        estado: "postulada",
        avance: { ...base, anexos: "procesando" },
      }).Anexos,
    ).toBe("hecho");
  });

  it("la validación: lista, casi o falta algo obligatorio; postulada cuenta como hecha", () => {
    const con = (listo: "si" | "casi" | "no") =>
      estados({
        estado: "postulada",
        avance: { ...avance, validacion: { estado: "listo", listo } },
      });
    expect(con("si").Validación).toBe("hecho");
    expect(con("casi").Validación).toBe("aviso");
    expect(con("no").Validación).toBe("falta");
    expect(con("si").Postulada).toBe("hecho");
  });

  it("la firma: hecha cuando no queda nada de la IA sin firmar; lo subido a mano cuenta como firmado", () => {
    const firma = (generados: number, firmados: number, postulacion: number) =>
      estados({
        estado: "en_estudio",
        avance: { ...avance, generados, firmados, postulacion },
      }).Firma;
    // Cinco formularios de la IA, dos firmados: quedan tres sin firmar.
    expect(firma(3, 2, 7)).toBe("pendiente");
    // Todo firmado: los Word se borraron al firmar (decisión 58).
    expect(firma(0, 5, 5)).toBe("hecho");
    // Los anexos firmados por fuera y subidos en PDF (Felipe, 19-10).
    expect(firma(0, 0, 17)).toBe("hecho");
    expect(firma(0, 0, 0)).toBe("pendiente");
  });

  it("postulada: todo hecho, salvo la validación, que muestra lo que dijo (el Funcionario, 19-10)", () => {
    expect(
      estados({
        estado: "postulada",
        avance: {
          ...avance,
          bases: 3,
          analisis: "listo",
          anexos: "listo",
          postulacion: 17,
          validacion: { estado: "listo", listo: "casi" },
        },
      }),
    ).toEqual({
      Bases: "hecho",
      Análisis: "hecho",
      Anexos: "hecho",
      Firma: "hecho",
      Validación: "aviso",
      Postulada: "hecho",
    });
  });

  it("en curso: en estudio y postuladas; terminadas: ganadas y perdidas", () => {
    const { enCurso, terminadas } = separarMias([
      { estado: "en_estudio" },
      { estado: "postulada" },
      { estado: "ganada" },
      { estado: "perdida" },
    ]);
    expect(enCurso.map((m) => m.estado)).toEqual(["en_estudio", "postulada"]);
    expect(terminadas.map((m) => m.estado)).toEqual(["ganada", "perdida"]);
  });

  it("por postular, por vencimiento y las ya cerradas al final; las postuladas aparte (19-10)", () => {
    const cierra = (id: number, estado: string, fecha: string | null) => ({
      id,
      estado,
      proceso: { fecha_cierre: fecha },
    });
    const ahora = Date.parse("2026-10-19T22:00:00.000Z");
    const { porPostular, postuladas, enCurso } = separarMias(
      [
        cierra(1, "en_estudio", "2026-10-30T15:00:00.000Z"),
        cierra(2, "postulada", "2026-10-19T19:00:00.000Z"),
        cierra(3, "en_estudio", "2026-10-22T15:00:00.000Z"),
        cierra(4, "en_estudio", "2026-10-15T15:00:00.000Z"),
        cierra(5, "en_estudio", null),
        cierra(6, "en_estudio", "2026-10-18T15:00:00.000Z"),
        cierra(7, "postulada", "2026-10-19T18:01:00.000Z"),
      ],
      ahora,
    );
    // Abiertas de la que vence antes a la que vence después (sin fecha, al
    // final de ellas); las que ya cerraron sin postular, después.
    expect(porPostular.map((m) => m.id)).toEqual([3, 1, 5, 6, 4]);
    expect(postuladas.map((m) => m.id)).toEqual([7, 2]);
    expect(enCurso.map((m) => m.id)).toEqual([3, 1, 5, 6, 4, 7, 2]);
  });
});

describe("la ficha ordenada", () => {
  it("arriba solo lo que deja fuera (máximo 5); lo demás, a las condiciones", () => {
    const siete = ["1", "2", "3", "4", "5", "6", "7"];
    expect(
      alertasDelAnalisis({ te_dejan_fuera: siete, condiciones: ["multa"] }),
    ).toEqual({
      dejanFuera: ["1", "2", "3", "4", "5"],
      condiciones: ["6", "7", "multa"],
      separadas: true,
    });
    // Un análisis anterior al 17-10: todo junto y sin separar.
    expect(alertasDelAnalisis({ alertas: ["a", "b"] })).toEqual({
      dejanFuera: [],
      condiciones: ["a", "b"],
      separadas: false,
    });
  });

  it("cuándo es el evento: el campo del análisis, o la fecha del servicio de un análisis antiguo", () => {
    expect(
      fechaDelEvento({ fecha_del_servicio: "vie 30 oct, 18:00", fechas: [] }),
    ).toBe("vie 30 oct, 18:00");
    expect(
      fechaDelEvento({
        fechas: [
          { que: "Cierre de ofertas", cuando: "19-10" },
          // La trampa del Día del Funcionario: dice "evento", pero no es
          // la fecha del servicio.
          {
            que: "Entrega del cronograma del evento por el municipio",
            cuando: "Con un mínimo de 5 días de antelación",
          },
          { que: "Fecha del servicio", cuando: "30-10, 18:00 a 02:00" },
        ],
      }),
    ).toBe("30-10, 18:00 a 02:00");
    expect(fechaDelEvento({ fechas: [] })).toBe("");
  });
});
