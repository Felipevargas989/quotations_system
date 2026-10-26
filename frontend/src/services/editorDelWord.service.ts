import { API_ROUTES } from "../constants/api.routes";
import { apiRequest } from "./api";
import type { AdjuntoDeOportunidad } from "./oportunidades.service";

// EL WORD SE EDITA EN EVENTIA (decisión 78 del doc 17, 24-10). Felipe: "un
// documento editable que pueda escribir y/o modificar en línea (lo básico:
// escribir, borrar, negrita, cursiva)". El motor lee el MISMO Word del
// comprador párrafo por párrafo y guarda de vuelta solo lo que cambió, sin
// tocar su diseño. Aparte de oportunidades.service, que está en el tope de
// 800 líneas.

/** Un pedazo de un párrafo con su formato. `r`: la corrida del Word de la
 *  que salió (para conservar su letra y su color al guardar). */
export interface TramoDelWord {
  r?: number;
  t: string;
  b: boolean;
  i: boolean;
  u: boolean;
  /** Tamaño de la letra, en puntos. */
  pt?: number;
  /** La letra («Calibri»). */
  f?: string;
  /** El color, RRGGBB. */
  c?: string;
}

/** Una imagen del documento (el logo), para verla. */
export interface ImagenDelWord {
  src: string;
  /** En puntos. */
  ancho?: number;
  alto?: number;
}

export interface ParrafoDelWord {
  tipo: "parrafo";
  id: number;
  editable: boolean;
  /** Cómo se ve lo que se escribe fuera de sus pedazos. */
  formato: Omit<TramoDelWord, "r" | "t">;
  /** Por qué no se edita aquí («tiene un vínculo»). */
  motivo?: string;
  tramos: TramoDelWord[];
  imagenes?: ImagenDelWord[];
  alineacion?: "centro" | "derecha" | "justificado";
  /** Sangría izquierda, en puntos. */
  sangria?: number;
  vineta?: boolean;
}

export interface CeldaDelWord {
  bloques: BloqueDelWord[];
  columnas?: number;
  filas?: number;
  /** Ancho, en % de la tabla. */
  ancho?: number;
  /** Color de fondo, RRGGBB. */
  fondo?: string;
}

export interface TablaDelWord {
  tipo: "tabla";
  filas: CeldaDelWord[][];
}

export type BloqueDelWord = ParrafoDelWord | TablaDelWord;

export interface WordParaEditar {
  /** La huella con que se abrió: si el Word cambia entremedio, no se
   *  guarda encima. */
  version: string;
  bloques: BloqueDelWord[];
  /** Se ven, no se editan aquí. */
  encabezado?: BloqueDelWord[];
  pie?: BloqueDelWord[];
}

/** Lo que se manda de un pedazo: sin tamaño, letra ni color (no se
 *  editan aquí). */
export type TramoEditado = Omit<TramoDelWord, "pt" | "r" | "f" | "c"> & {
  r?: number;
};

/** Cómo va alineado un párrafo; sin decirlo en un párrafo, a la
 *  izquierda. */
export type AlineacionDelWord =
  | "izquierda"
  | "centro"
  | "derecha"
  | "justificado";

export interface ParrafoEditado {
  id: number;
  tramos: TramoEditado[];
  /** Solo si se cambió con los botones de alinear. */
  alineacion?: AlineacionDelWord;
}

const ruta = (oportunidadId: number, adjuntoId: number) =>
  `${API_ROUTES.OPORTUNIDADES}/${oportunidadId}/adjuntos/${adjuntoId}/editor`;

export const abrirElWord = async (oportunidadId: number, adjuntoId: number) =>
  (await apiRequest(ruta(oportunidadId, adjuntoId), "GET")) as WordParaEditar;

/** Solo los párrafos que cambiaron. Devuelve la fila del archivo, que pasa
 *  al Word nuevo. */
export const guardarElWord = async (
  oportunidadId: number,
  adjuntoId: number,
  version: string,
  parrafos: ParrafoEditado[],
) =>
  (await apiRequest(ruta(oportunidadId, adjuntoId), "PUT", {
    version,
    parrafos,
  })) as AdjuntoDeOportunidad;
