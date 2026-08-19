/**
 * EL DICCIONARIO DEL ESTADO DE UNA COTIZACIÓN
 *
 * Cómo se llama cada estado y de qué color es. UNA sola vez, para todo
 * el sistema.
 *
 * POR QUÉ EXISTE (14-08-2026): esto estaba escrito SEIS veces —el
 * tablero de Cotizaciones, la ficha del negocio, la ficha del cliente,
 * el calendario, el Dashboard, sus tendencias y Analytics—, cada
 * pantalla con su propia copia. Y las copias no coincidían:
 *
 *   · Felipe coronó la palabra "Anulada" el 12-08 y tres pantallas
 *     siguieron diciendo "Cancelada" durante dos días.
 *   · "Realizada" era CINCO verdes distintos según dónde se mirara.
 *   · Analytics ni siquiera contemplaba el estado anulada: caía al gris
 *     por descarte.
 *
 * El modelo es `utils/clientTypeColor.ts`, que ya hace esto bien para
 * los tipos de cliente y lo leen siete pantallas.
 *
 * SI HAY QUE CAMBIAR UN NOMBRE O UN COLOR, SE CAMBIA ACÁ Y LISTO.
 */

/** El valor técnico que guarda la base. NO se toca: 'cancelada' sigue
 *  siendo 'cancelada' en la base aunque en pantalla diga "Anulada". */
export type EstadoCotizacion =
  | "solicitada"
  | "enviada"
  | "en_negociacion"
  | "aceptada"
  | "rechazada"
  | "cancelada"
  | "realizada";

interface Definicion {
  /** Cómo se llama EN PANTALLA. */
  readonly etiqueta: string;
  readonly emoji: string;
  /** Píldora clara: fondo suave y letra oscura. */
  readonly chip: string;
  /** Punto de color sólido (el puntito del calendario). */
  readonly punto: string;
  /** Hexadecimal, para las barras del calendario y los gráficos. */
  readonly hex: string;
}

/**
 * En el orden del ciclo de vida: se pide, se envía, se negocia, se gana
 * o se pierde, y termina realizada. Ese orden es el que se usa para
 * pintar listas y leyendas.
 */
export const ESTADOS_COTIZACION: readonly EstadoCotizacion[] = [
  "solicitada",
  "enviada",
  "en_negociacion",
  "aceptada",
  "realizada",
  "rechazada",
  "cancelada",
];

const DEF: Record<EstadoCotizacion, Definicion> = {
  solicitada: {
    etiqueta: "Solicitada",
    emoji: "📋",
    chip: "bg-yellow-100 text-yellow-800",
    punto: "bg-yellow-500",
    hex: "#eab308",
  },
  enviada: {
    etiqueta: "Enviada",
    emoji: "📤",
    chip: "bg-blue-100 text-blue-800",
    punto: "bg-blue-500",
    hex: "#3b82f6",
  },
  en_negociacion: {
    etiqueta: "En Negociación",
    emoji: "💬",
    chip: "bg-purple-100 text-purple-800",
    punto: "bg-purple-500",
    hex: "#a855f7",
  },
  aceptada: {
    etiqueta: "Aceptada",
    emoji: "✅",
    chip: "bg-green-100 text-green-800",
    punto: "bg-green-500",
    hex: "#22c55e",
  },
  realizada: {
    etiqueta: "Realizada",
    emoji: "🎉",
    chip: "bg-emerald-100 text-emerald-800",
    punto: "bg-emerald-500",
    hex: "#10b981",
  },
  rechazada: {
    etiqueta: "Rechazada",
    emoji: "❌",
    chip: "bg-red-100 text-red-800",
    punto: "bg-red-500",
    hex: "#ef4444",
  },
  cancelada: {
    // Palabra oficial coronada por Felipe (12-08): "Anulada" en TODA la
    // interfaz. El valor técnico 'cancelada' de la base no se toca.
    etiqueta: "Anulada",
    emoji: "🚫",
    chip: "bg-gray-200 text-gray-600",
    punto: "bg-gray-500",
    hex: "#9ca3af",
  },
};

/** Gris de reserva para un estado que no exista en el diccionario. */
const DESCONOCIDO: Definicion = {
  etiqueta: "",
  emoji: "",
  chip: "bg-gray-100 text-gray-800",
  punto: "bg-gray-400",
  hex: "#6b7280",
};

const defDe = (estado: string): Definicion =>
  DEF[estado as EstadoCotizacion] ?? DESCONOCIDO;

/** Cómo se llama en pantalla. Si el estado no existe, se muestra el
 *  valor crudo en vez de una casilla vacía. */
export const etiquetaEstado = (estado: string): string =>
  defDe(estado).etiqueta || estado;

export const emojiEstado = (estado: string): string => defDe(estado).emoji;

/** Clases de la píldora clara: `bg-…-100 text-…-800`. */
export const chipEstado = (estado: string): string => defDe(estado).chip;

/** Clase del punto de color sólido: `bg-…-500`. */
export const puntoEstado = (estado: string): string => defDe(estado).punto;

/** Hexadecimal, para gráficos y barras. */
export const hexEstado = (estado: string): string => defDe(estado).hex;

/** Etiqueta con su emoji delante: "🚫 Anulada". */
export const etiquetaConEmoji = (estado: string): string => {
  const d = defDe(estado);
  return d.emoji ? `${d.emoji} ${etiquetaEstado(estado)}` : etiquetaEstado(estado);
};

/**
 * EL ESTADO CON QUE SE GUARDA UNA COTIZACIÓN (Felipe, 18-08).
 *
 * "Cuando creo una cotización queda por defecto en enviada… debería
 * quedar en solicitada hasta que se envíe; puede estar momentáneamente
 * en trabajo y no enviada de golpe."
 *
 * Antes, la cotización armada DESDE UN REQUERIMIENTO se forzaba a
 * "enviada" al guardar — y como el servidor manda el correo al cliente
 * cuando una cotización pasa a enviada, ese guardado la enviaba de golpe
 * aunque estuviera a medias. La regla ahora es UNA, sin excepciones:
 * se guarda con el estado que tiene el formulario (nace solicitada), y
 * pasa a enviada solo cuando la persona la envía. Venga de cero o de un
 * requerimiento.
 */
export const estadoAlGuardar = (
  estadoDelFormulario: string,
  _desdeRequerimiento: boolean,
): string => estadoDelFormulario;
