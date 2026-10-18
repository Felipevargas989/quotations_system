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

/** De partida van marcados los Word. Un PDF lo marca la persona: casi
 *  siempre son las bases, y a veces traen los formularios al final. */
export const marcadoDePartida = (nombre: string): boolean =>
  caminoDelFormulario(nombre) !== "reescribir";

/** Sin razón social ni RUT en «Mi empresa», la IA no puede llenar nada (el
 *  motor responde 400): se dice antes de apretar. null = está bien, o
 *  todavía no se sabe. */
export const faltaEnMiEmpresa = (
  oferente?: { razon_social: string | null; rut: string | null } | null,
): string | null =>
  oferente && (!oferente.razon_social?.trim() || !oferente.rut?.trim())
    ? "Primero llena «Mi empresa»: al menos la razón social y el RUT."
    : null;
