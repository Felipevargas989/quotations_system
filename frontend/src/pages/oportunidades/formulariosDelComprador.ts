// LOS FORMULARIOS DEL COMPRADOR, DOS CAMINOS (Felipe, 18-10: "si bien en
// Word se rellena, si bien escaneado en PDF se reconvierte"). El Word del
// comprador se llena en el mismo archivo (el .doc antiguo, el taller lo
// convierte antes); un PDF —separado, escaneado o al final de las bases—
// se reescribe en Word, con el texto oficial al pie de la letra y el logo.
// Aparte de oportunidades.utils.ts, que está en el tope de 800 líneas.

export type CaminoDelFormulario = "llenar" | "convertir" | "reescribir";

export const caminoDelFormulario = (
  nombre: string,
): CaminoDelFormulario | null => {
  const ext = /\.([^.]+)$/.exec(nombre)?.[1]?.toLowerCase();
  if (ext === "docx") return "llenar";
  if (ext === "doc") return "convertir";
  if (ext === "pdf") return "reescribir";
  return null;
};

/** Mismo archivo aunque el análisis lo escriba distinto: sin tildes,
 *  mayúsculas, extensión ni signos (la misma vara del motor). */
export const mismoNombre = (a: string, b: string): boolean => {
  const n = (s: string) =>
    s
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/\.[a-z0-9]{2,4}$/, "")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  return n(a) !== "" && n(a) === n(b);
};

/** Lo que llena el motor sin que nadie elija: la misma regla de
 *  `elegirArchivos` en el motor. Van los Word; un PDF, solo si el análisis
 *  de las bases encontró ahí un formulario que aplica (18-10: "que cuando
 *  la IA analice los documentos identifique dónde están los formularios").
 *  Sin casillas desde el 19-10 (Felipe: "que me traiga los PDF y me los
 *  marque, creo que eso es lo innecesario"). */
export const seLlena = (
  nombre: string,
  delAnalisis: ReadonlyArray<{ archivo: string; aplica: boolean }> = [],
): boolean =>
  caminoDelFormulario(nombre) !== "reescribir" ||
  delAnalisis.some(
    (f) => f.aplica && f.archivo && mismoNombre(nombre, f.archivo),
  );

/** La línea bajo «Anexos del comprador»: qué se va a llenar, o qué falta
 *  para que la IA encuentre los formularios. `delAnalisis` sin definir =
 *  sin análisis, o uno de antes del 18-10, que no buscaba los formularios. */
export const queSeLlena = ({
  hayAnalisis,
  delAnalisis,
  seLlenan,
}: {
  readonly hayAnalisis: boolean;
  readonly delAnalisis?: ReadonlyArray<{ aplica: boolean }>;
  readonly seLlenan: number;
}): string => {
  const analizar = hayAnalisis ? "vuelve a analizar" : "analiza";
  if (!delAnalisis) {
    return seLlenan > 0
      ? `Se llenan los Word de «Bases y anexos». Si hay formularios en PDF, ${analizar} las bases para que la IA los encuentre.`
      : `${hayAnalisis ? "Vuelve a analizar" : "Analiza"} las bases para que la IA encuentre los formularios.`;
  }
  if (!delAnalisis.some((f) => f.aplica)) {
    return seLlenan > 0
      ? "El análisis no encontró formularios para llenar; igual se llenan los Word de «Bases y anexos»."
      : "Las bases no traen formularios para llenar.";
  }
  return seLlenan > 0
    ? "Los Word se llenan en el mismo archivo; los que vienen en PDF se reescriben en Word, iguales al original."
    : "Ninguno vino en lo que subiste: súbelos a «Bases y anexos» y vuelve a analizar.";
};

export const PARTE_DE_LA_OFERTA: Record<string, string> = {
  administrativa: "parte administrativa",
  tecnica: "parte técnica",
  economica: "parte económica",
};

/** Sin razón social ni RUT en «Mi empresa», la IA no puede llenar nada (el
 *  motor responde 400): se dice antes de apretar. null = está bien, o
 *  todavía no se sabe. */
export const faltaEnMiEmpresa = (
  oferente?: { razon_social: string | null; rut: string | null } | null,
): string | null =>
  oferente && (!oferente.razon_social?.trim() || !oferente.rut?.trim())
    ? "Primero llena «Mi empresa»: al menos la razón social y el RUT."
    : null;
