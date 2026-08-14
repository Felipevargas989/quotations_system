/**
 * EL DICCIONARIO DEL ESTADO DE UNA PERSONA
 *
 * Cómo se llama cada estado y de qué color es. UNA sola vez, para todo el
 * sistema. Mismo modelo que `utils/estadoCotizacion.ts`.
 *
 * Se escribe ANTES de que exista la primera copia. En el estado de las
 * cotizaciones llegamos tarde: lo mismo estaba escrito seis veces y las
 * copias no coincidían —"Realizada" era cinco verdes distintos—. Acá el
 * candado se pone al derecho.
 *
 * LOS TRES ESTADOS SON COSAS DISTINTAS y no se pueden mezclar:
 *   · bloqueada     — una decisión: no llamar más. Exige motivo escrito.
 *   · no disponible — NO es una mala nota. Alguien puede ser excelente y
 *                     haberse ido a estudiar a Concepción.
 *
 * Si se confunden, en un año no se sabe a quién se puede volver a llamar.
 */

export type EstadoPersona = "activa" | "no_disponible" | "bloqueada";

interface Definicion {
  readonly etiqueta: string;
  /** Píldora clara: fondo suave y letra oscura. */
  readonly chip: string;
  /** Punto de color sólido. */
  readonly punto: string;
  /** Una línea que explica qué significa, para el desplegable. */
  readonly explicacion: string;
}

/** En el orden en que se muestran: de lo normal a lo excepcional. */
export const ESTADOS_PERSONA: readonly EstadoPersona[] = [
  "activa",
  "no_disponible",
  "bloqueada",
];

const DEF: Record<EstadoPersona, Definicion> = {
  activa: {
    etiqueta: "Activa",
    chip: "bg-green-100 text-green-800",
    punto: "bg-green-500",
    explicacion: "Se puede llamar",
  },
  no_disponible: {
    etiqueta: "No disponible",
    chip: "bg-amber-100 text-amber-800",
    punto: "bg-amber-500",
    explicacion: "No está por ahora — no es una mala nota",
  },
  bloqueada: {
    etiqueta: "Bloqueada",
    chip: "bg-red-100 text-red-800",
    punto: "bg-red-500",
    explicacion: "No llamar más. Igual se le paga lo trabajado",
  },
};

/** Gris de reserva para un estado que no exista en el diccionario. */
const DESCONOCIDO: Definicion = {
  etiqueta: "",
  chip: "bg-gray-100 text-gray-800",
  punto: "bg-gray-400",
  explicacion: "",
};

const defDe = (estado: string): Definicion =>
  DEF[estado as EstadoPersona] ?? DESCONOCIDO;

/** Cómo se llama en pantalla. Si no existe, muestra el valor crudo en vez
 *  de dejar una casilla vacía. */
export const etiquetaEstadoPersona = (estado: string): string =>
  defDe(estado).etiqueta || estado;

export const chipEstadoPersona = (estado: string): string => defDe(estado).chip;

export const puntoEstadoPersona = (estado: string): string =>
  defDe(estado).punto;

export const explicacionEstadoPersona = (estado: string): string =>
  defDe(estado).explicacion;

/* ------------------------------------------------------------------ *
 * PLANTA O FREELANCE
 *
 * Es un valor POR DEFECTO, no una propiedad fija: se cambia en cada día
 * trabajado. En los datos del Excel, Soledad Molina pasó de freelance a
 * planta a mitad de agosto, y Camila Carvajal, siendo cajera de planta,
 * cobró jornada dos días porque trabajó en su día libre.
 * ------------------------------------------------------------------ */

export type TipoPersona = "planta" | "freelance";

export const TIPOS_PERSONA: readonly TipoPersona[] = ["freelance", "planta"];

const DEF_TIPO: Record<TipoPersona, { etiqueta: string; chip: string; explicacion: string }> = {
  freelance: {
    etiqueta: "Freelance",
    chip: "bg-blue-100 text-blue-800",
    explicacion: "Cobra por jornada trabajada",
  },
  planta: {
    etiqueta: "Planta",
    chip: "bg-purple-100 text-purple-800",
    explicacion: "Tiene sueldo aparte — acá solo recibe propina",
  },
};

export const etiquetaTipoPersona = (tipo: string): string =>
  DEF_TIPO[tipo as TipoPersona]?.etiqueta || tipo;

export const chipTipoPersona = (tipo: string): string =>
  DEF_TIPO[tipo as TipoPersona]?.chip || "bg-gray-100 text-gray-800";

export const explicacionTipoPersona = (tipo: string): string =>
  DEF_TIPO[tipo as TipoPersona]?.explicacion || "";
