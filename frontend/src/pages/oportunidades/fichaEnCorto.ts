import type {
  AdjuntoDeOportunidad,
  AnalisisDeBases,
  AvanceDeLicitacion,
  GeneracionesDeOportunidad,
  ResultadoDeBases,
  ValidacionDeDocumentos,
} from "../../services/oportunidades.service";
import { formatMomento } from "../../utils/dates";
import { fechaDelEvento, type PasoDelAvance } from "./oportunidades.utils";

// LA FICHA, MÁS CLARA (Felipe, 17-10: "¿podemos mejorar el front de acá,
// estéticamente y a nivel de usabilidad?" y "vamos con todas"). Lo que
// arma el camino de la postulación, el evento en corto y los archivos con
// nombre legible. Aparte de oportunidades.utils.ts, que ya pasa las 800
// líneas (portero de la casa).

export type PestanaDeFicha = "resumen" | "bases" | "postulacion" | "historial";

/** El avance de UNA oportunidad con las mismas consultas que usan sus
 *  pestañas (así se mueve solo cuando se sube, analiza, genera o valida),
 *  con la forma que ya usa «Mis licitaciones». */
export const avanceDeLaFicha = (d: {
  bases?: readonly AdjuntoDeOportunidad[];
  postulacion?: readonly AdjuntoDeOportunidad[];
  analisis?: AnalisisDeBases | null;
  generaciones?: GeneracionesDeOportunidad;
  validacion?: ValidacionDeDocumentos | null;
}): AvanceDeLicitacion => {
  const postulacion = d.postulacion ?? [];
  const v = d.validacion;
  return {
    bases: (d.bases ?? []).length,
    analisis: d.analisis?.estado ?? null,
    anexos: d.generaciones?.anexos?.estado ?? null,
    propuesta: d.generaciones?.propuesta?.estado ?? null,
    postulacion: postulacion.length,
    generados: postulacion.filter((a) => a.origen === "generado").length,
    firmados: postulacion.filter((a) => a.origen === "firmado").length,
    validacion: v
      ? { estado: v.estado, listo: v.resultado?.listo ?? null }
      : null,
  };
};

export type SiguientePaso = {
  texto: string;
  /** El botón que lleva a la pestaña donde se hace; sin botón cuando no
   *  hay nada que apretar (la IA está trabajando o ya se postuló). */
  boton: { texto: string; pestana: PestanaDeFicha } | null;
};

const QUE_HACER: Record<string, SiguientePaso> = {
  Bases: {
    texto: "Sube las bases y anexos que bajaste de Mercado Público.",
    boton: { texto: "Subir las bases", pestana: "bases" },
  },
  Análisis: {
    texto: "Que la IA lea las bases: criterios, requisitos y fechas.",
    boton: { texto: "Analizar las bases", pestana: "bases" },
  },
  Anexos: {
    texto:
      "Pon el precio y que la IA arme la postulación: la oferta, los anexos y la propuesta.",
    boton: { texto: "Armar postulación", pestana: "postulacion" },
  },
  Firma: {
    texto: "Revisa los anexos que hizo la IA y fírmalos.",
    boton: { texto: "Ir a firmar", pestana: "postulacion" },
  },
  Validación: {
    texto: "Revisa que no falte nada antes de subirla.",
    boton: { texto: "Validar documentos", pestana: "postulacion" },
  },
  Postulada: {
    texto:
      "Súbela a Mercado Público y cambia el estado a «Postulada» (arriba).",
    boton: null,
  },
};

/** El primer paso sin hacer, en palabras. */
export const siguientePaso = (
  pasos: readonly PasoDelAvance[],
): SiguientePaso & { paso: string | null } => {
  const paso = pasos.find((p) => p.estado !== "hecho");
  if (!paso) {
    return { paso: null, texto: "Postulada. Ahora a esperar.", boton: null };
  }
  if (paso.estado === "en_curso") {
    return {
      paso: paso.paso,
      texto: `La IA está trabajando en «${paso.paso}»…`,
      boton: null,
    };
  }
  return { paso: paso.paso, ...QUE_HACER[paso.paso] };
};

/** El evento en corto: «vie 30 oct» y «18:00 a 02:00 · 160 personas»; el
 *  texto completo de las bases, para leerlo al pasar el mouse. */
export const eventoEnCorto = (
  bases: Pick<
    ResultadoDeBases,
    "fecha_del_servicio" | "fecha_del_servicio_iso" | "personas" | "fechas"
  > | null,
): { principal: string; detalle: string; completo: string } => {
  if (!bases) return { principal: "", detalle: "", completo: "" };
  const completo = fechaDelEvento(bases);
  const iso = bases.fecha_del_servicio_iso?.trim();
  const dia =
    iso && /^\d{4}-\d{2}-\d{2}$/.test(iso)
      ? formatMomento(`${iso}T12:00:00Z`, "diaMes")
      : "";
  const semana =
    dia && iso
      ? new Intl.DateTimeFormat("es-CL", {
          weekday: "short",
          timeZone: "UTC",
        })
          .format(new Date(`${iso}T12:00:00Z`))
          .replace(/\.$/, "")
      : "";
  const horas = [...completo.matchAll(/\b([01]?\d|2[0-3])[:.]([0-5]\d)\b/g)]
    .slice(0, 2)
    .map((m) => `${m[1].padStart(2, "0")}:${m[2]}`);
  const detalle = [
    horas.join(" a "),
    bases.personas ? `${bases.personas} personas` : "",
  ]
    .filter(Boolean)
    .join(" · ");
  return {
    principal: dia ? `${semana} ${dia}`.trim() : completo,
    detalle,
    completo,
  };
};

/** El lugar en dos o tres palabras (el detalle va debajo). */
export const LUGAR_EN_CORTO: Record<string, string> = {
  si: "En el complejo",
  no: "Exigen otro lugar",
  dudoso: "No queda claro",
};

/** "Ficha_Técnica_N°03.pdf" → "Ficha Técnica N°03.pdf". */
export const nombreLegible = (nombre: string): string =>
  nombre
    .replace(/_+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();

export type ClaseDeArchivo = "pdf" | "word" | "excel" | "imagen" | "otro";

export const claseDeArchivo = (nombre: string): ClaseDeArchivo => {
  const ext = nombre.toLowerCase().split(".").pop() ?? "";
  if (ext === "pdf") return "pdf";
  if (["doc", "docx", "odt", "rtf"].includes(ext)) return "word";
  if (["xls", "xlsx", "ods", "csv"].includes(ext)) return "excel";
  if (["png", "jpg", "jpeg", "webp", "gif"].includes(ext)) return "imagen";
  return "otro";
};

export const COLOR_DEL_ARCHIVO: Record<ClaseDeArchivo, string> = {
  pdf: "text-red-600",
  word: "text-blue-600",
  excel: "text-green-600",
  imagen: "text-violet-600",
  otro: "text-gray-500",
};
