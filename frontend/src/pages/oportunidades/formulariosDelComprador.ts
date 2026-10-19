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

export const QUE_LE_PASA: Record<CaminoDelFormulario, string> = {
  llenar: "se llena tal cual",
  convertir: "Word antiguo: se convierte y se llena",
  reescribir: "se reescribe en Word, igual al original",
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

/** De partida van marcados los Word. Un PDF va marcado solo si el análisis
 *  de las bases encontró ahí un formulario que aplica (18-10: "que cuando
 *  la IA analice los documentos identifique dónde están los formularios");
 *  si no, lo marca la persona: casi siempre son las bases. */
export const marcadoDePartida = (
  nombre: string,
  delAnalisis: ReadonlyArray<{ archivo: string; aplica: boolean }> = [],
): boolean =>
  caminoDelFormulario(nombre) !== "reescribir" ||
  delAnalisis.some(
    (f) => f.aplica && f.archivo && mismoNombre(nombre, f.archivo),
  );

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
