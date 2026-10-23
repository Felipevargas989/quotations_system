import type { MiLicitacion } from "../../services/oportunidades.service";

// EL AVANCE DE CADA LICITACIÓN, PASO A PASO: lo usan «Mis licitaciones» y
// el camino de la ficha. Aparte de oportunidades.utils.ts desde el 23-10,
// cuando ese archivo pasó las 800 líneas del portero al sumar la etapa
// Bases que gira mientras el motor trae los documentos.

/** "MIS LICITACIONES" (Felipe, 17-10): el avance de cada una, paso a paso.
 *  Cómo va cada paso: hecho, en curso, con aviso (validación "casi"),
 *  falta (sin bases, o la validación dice que falta algo obligatorio),
 *  error, o todavía no. */
export type EstadoDelPaso =
  | "hecho"
  | "en_curso"
  | "aviso"
  | "falta"
  | "error"
  | "pendiente";

export type PasoDelAvance = { paso: string; estado: EstadoDelPaso };

const trabajo = (e: "procesando" | "listo" | "error" | null): EstadoDelPaso =>
  e === "listo"
    ? "hecho"
    : e === "procesando"
      ? "en_curso"
      : e === "error"
        ? "error"
        : "pendiente";

export const pasosDelAvance = (
  m: Pick<MiLicitacion, "avance" | "estado">,
): PasoDelAvance[] => {
  const a = m.avance;
  const v = a.validacion;
  // Postulada (o ya resuelta), lo de antes está hecho; solo la validación
  // muestra lo que dijo (Felipe, 19-10: "está todo firmado, solo debería
  // estar con alerta la validación").
  const postulada = ["postulada", "ganada", "perdida"].includes(m.estado);
  // Firmado = no queda nada de la IA sin firmar (`generados` ya es lo sin
  // firmar: decisión 58). Lo subido a mano cuenta como firmado: muchas
  // veces se firma por fuera y se sube el PDF.
  const sinFirmar = a.generados;
  const firmado = sinFirmar === 0 && (a.firmados > 0 || a.postulacion > 0);
  return [
    {
      paso: "Bases",
      // Mientras el motor trae los documentos gira, y queda lista recién al
      // terminar (Felipe, 23-10: "mientras está trayendo, las etapas de
      // bases aparecen pensando"): el primer archivo chico no la cierra.
      estado: postulada
        ? "hecho"
        : a.trayendo
          ? "en_curso"
          : a.bases > 0
            ? "hecho"
            : "falta",
    },
    { paso: "Análisis", estado: postulada ? "hecho" : trabajo(a.analisis) },
    {
      paso: "Anexos",
      // La IA armando anexos o la propuesta («Armar postulación», «Volver a
      // armar») se ve girando aunque ya hubiera anexos (23-10).
      estado: postulada
        ? "hecho"
        : a.anexos === "procesando" || a.propuesta === "procesando"
          ? "en_curso"
          : a.generados > 0 || a.firmados > 0
            ? "hecho"
            : trabajo(a.anexos),
    },
    { paso: "Firma", estado: postulada || firmado ? "hecho" : "pendiente" },
    {
      paso: "Validación",
      estado: !v
        ? "pendiente"
        : v.estado !== "listo"
          ? trabajo(v.estado)
          : v.listo === "si"
            ? "hecho"
            : v.listo === "casi"
              ? "aviso"
              : "falta",
    },
    {
      paso: "Postulada",
      estado: ["postulada", "ganada", "perdida"].includes(m.estado)
        ? "hecho"
        : "pendiente",
    },
  ];
};

export const ESTILO_DEL_PASO: Record<EstadoDelPaso, string> = {
  hecho: "bg-green-100 text-green-800",
  en_curso: "bg-blue-100 text-blue-800",
  aviso: "bg-amber-100 text-amber-800",
  falta: "bg-red-100 text-red-800",
  error: "bg-red-100 text-red-800",
  pendiente: "bg-gray-100 text-gray-500",
};
