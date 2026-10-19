import { describe, expect, it } from "vitest";
import type { AdjuntoDeOportunidad } from "../../services/oportunidades.service";
import {
  avanceDeLaFicha,
  claseDeArchivo,
  eventoEnCorto,
  nombreLegible,
  siguientePaso,
} from "./fichaEnCorto";
import { pasosDelAvance } from "./oportunidades.utils";

// LA FICHA, MÁS CLARA (Felipe, 17-10: "vamos con todas").

const archivo = (
  origen: AdjuntoDeOportunidad["origen"],
): AdjuntoDeOportunidad => ({
  id: 1,
  nombre: "x.docx",
  ruta: "c1/oportunidades/40/x.docx",
  tipo: "application/msword",
  bytes: 10,
  origen,
  viene_de: null,
  creado_en: "2026-10-17T21:00:00.000Z",
  subido_por: null,
  quien: null,
});

describe("el camino de la postulación", () => {
  it("sin nada: el primer paso es subir las bases, en la pestaña de bases", () => {
    const pasos = pasosDelAvance({
      estado: "en_estudio",
      avance: avanceDeLaFicha({}),
    });
    expect(siguientePaso(pasos)).toMatchObject({
      paso: "Bases",
      boton: { texto: "Subir las bases", pestana: "bases" },
    });
  });

  it("con bases y análisis listo: sigue generar anexos, en «Mi postulación»", () => {
    const pasos = pasosDelAvance({
      estado: "en_estudio",
      avance: avanceDeLaFicha({
        bases: [archivo("subido")],
        analisis: { estado: "listo" } as never,
      }),
    });
    expect(siguientePaso(pasos)).toMatchObject({
      paso: "Anexos",
      boton: { texto: "Armar postulación", pestana: "postulacion" },
    });
  });

  it("mientras la IA trabaja no hay botón; postulada, tampoco", () => {
    const enCurso = pasosDelAvance({
      estado: "en_estudio",
      avance: avanceDeLaFicha({
        bases: [archivo("subido")],
        analisis: { estado: "procesando" } as never,
      }),
    });
    expect(siguientePaso(enCurso)).toMatchObject({
      paso: "Análisis",
      boton: null,
    });
    const todo = pasosDelAvance({
      estado: "postulada",
      avance: avanceDeLaFicha({
        bases: [archivo("subido")],
        postulacion: [archivo("firmado")],
        analisis: { estado: "listo" } as never,
        validacion: { estado: "listo", resultado: { listo: "si" } } as never,
      }),
    });
    expect(siguientePaso(todo)).toMatchObject({ paso: null, boton: null });
    // Postulada con la validación en aviso: ni «Ir a firmar» ni «Validar».
    const conAviso = pasosDelAvance({
      estado: "postulada",
      avance: avanceDeLaFicha({
        bases: [archivo("subido")],
        postulacion: [archivo("subido"), archivo("subido")],
        analisis: { estado: "listo" } as never,
        validacion: { estado: "listo", resultado: { listo: "casi" } } as never,
      }),
    });
    expect(siguientePaso(conAviso)).toEqual({
      paso: null,
      texto: "Postulada. Ahora a esperar.",
      boton: null,
    });
  });

  it("cuenta lo hecho por la IA y lo firmado en «Mi postulación»", () => {
    expect(
      avanceDeLaFicha({
        postulacion: [
          archivo("generado"),
          archivo("firmado"),
          archivo("subido"),
        ],
      }),
    ).toMatchObject({ postulacion: 3, generados: 1, firmados: 1 });
  });
});

describe("el evento en corto", () => {
  it("«vie 30 oct» y «18:00 a 02:00 · 160 personas», con el texto entero aparte", () => {
    const e = eventoEnCorto({
      fecha_del_servicio:
        "viernes 30 de octubre, desde las 18:00 hrs hasta las 02:00 horas del 31 de octubre",
      fecha_del_servicio_iso: "2026-10-30",
      personas: 160,
      fechas: [],
    });
    expect(e.principal).toMatch(/^vie\.? 30 oct/);
    expect(e.detalle).toBe("18:00 a 02:00 · 160 personas");
    expect(e.completo).toContain("viernes 30 de octubre");
  });

  it("sin fecha ISO, queda el texto de las bases; sin análisis, nada", () => {
    expect(
      eventoEnCorto({
        fecha_del_servicio: "a fines de octubre",
        personas: undefined,
        fechas: [],
      }).principal,
    ).toBe("a fines de octubre");
    expect(eventoEnCorto(null)).toEqual({
      principal: "",
      detalle: "",
      completo: "",
    });
  });
});

describe("los archivos", () => {
  it("el nombre sin guiones bajos y el tipo por la extensión", () => {
    expect(nombreLegible("Ficha_Técnica__N°03.pdf")).toBe(
      "Ficha Técnica N°03.pdf",
    );
    expect(claseDeArchivo("Bases.PDF")).toBe("pdf");
    expect(claseDeArchivo("Anexos.docx")).toBe("word");
    expect(claseDeArchivo("Oferta.xlsx")).toBe("excel");
    expect(claseDeArchivo("firma.png")).toBe("imagen");
    expect(claseDeArchivo("Planos.zip")).toBe("otro");
  });
});
