import { describe, expect, it } from "vitest";
import { queSeLlena, seLlena } from "./formulariosDelComprador";

// QUÉ SE LLENA, SIN CASILLAS (Felipe, 19-10: "que me traiga los PDF y me
// los marque, creo que eso es lo innecesario"). La misma regla del motor
// (`elegirArchivos`): los Word van siempre; un PDF, solo si el análisis
// encontró ahí un formulario que aplica.

const DEL_PROFESOR = [
  {
    archivo: "Decreto_N°_4.777_aprueba_bases_dia_del_profesor.pdf",
    aplica: true,
  },
  {
    archivo: "Decreto_N°_4.777_aprueba_bases_dia_del_profesor.pdf",
    aplica: false,
  },
];

describe("Qué llena el motor", () => {
  it("los Word siempre; el PDF solo donde el análisis encontró un formulario que aplica", () => {
    expect(seLlena("Formularios_Anexos.docx")).toBe(true);
    expect(seLlena("Anexos antiguos.doc")).toBe(true);
    expect(seLlena("bases tecnicas - dia del profesor.pdf", DEL_PROFESOR)).toBe(
      false,
    );
    // El nombre calza aunque el análisis lo escriba con espacios y tildes.
    expect(
      seLlena(
        "Decreto N° 4.777 aprueba bases día del profesor.pdf",
        DEL_PROFESOR,
      ),
    ).toBe(true);
    expect(
      seLlena("D.A._N°4.770_Aprueba_llamado.pdf", [
        { archivo: "D.A._N°4.770_Aprueba_llamado.pdf", aplica: false },
      ]),
    ).toBe(false);
  });
});

describe("La línea bajo «Anexos del comprador»", () => {
  it("sin análisis, o con uno anterior al 18-10: los Word se llenan y se pide analizar por los PDF", () => {
    expect(queSeLlena({ hayAnalisis: false, seLlenan: 2 })).toBe(
      "Se llenan los Word de «Bases y anexos». Si hay formularios en PDF, analiza las bases para que la IA los encuentre.",
    );
    expect(queSeLlena({ hayAnalisis: true, seLlenan: 0 })).toBe(
      "Vuelve a analizar las bases para que la IA encuentre los formularios.",
    );
    expect(queSeLlena({ hayAnalisis: false, seLlenan: 0 })).toBe(
      "Analiza las bases para que la IA encuentre los formularios.",
    );
  });

  it("el análisis no encontró formularios que apliquen", () => {
    expect(
      queSeLlena({ hayAnalisis: true, delAnalisis: [], seLlenan: 0 }),
    ).toBe("Las bases no traen formularios para llenar.");
    expect(
      queSeLlena({
        hayAnalisis: true,
        delAnalisis: [{ aplica: false }],
        seLlenan: 1,
      }),
    ).toBe(
      "El análisis no encontró formularios para llenar; igual se llenan los Word de «Bases y anexos».",
    );
  });

  it("con formularios encontrados: cómo se llenan, o que hay que subirlos", () => {
    expect(
      queSeLlena({
        hayAnalisis: true,
        delAnalisis: [{ aplica: true }],
        seLlenan: 1,
      }),
    ).toBe(
      "Los Word se llenan en el mismo archivo; los que vienen en PDF se reescriben en Word, iguales al original.",
    );
    expect(
      queSeLlena({
        hayAnalisis: true,
        delAnalisis: [{ aplica: true }],
        seLlenan: 0,
      }),
    ).toBe(
      "Ninguno vino en lo que subiste: súbelos a «Bases y anexos» y vuelve a analizar.",
    );
  });
});
