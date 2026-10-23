import { API_ROUTES } from "../constants/api.routes";
import { apiRequest } from "./api";
import type { GanadorDeProceso, Semaforo } from "./oportunidades.service";

// SE VIENE (doc 17 §5.3): el calendario de lo que se repite cada año y,
// desde la decisión 62 (20-10), el semáforo de la bandeja en cada serie y
// cómo va su lectura. Aparte de oportunidades.service.ts, que llegó a las
// 800 líneas del portero.

/** SE VIENE (doc 17 §5.3): lo que se repite cada año y todavía no sale. */
export interface SeViene {
  nombre: string;
  organismo: string | null;
  comuna: string | null;
  /** La región de la última vez (para filtrar como la bandeja). */
  region: string | null;
  /** Cuándo debería publicarse: la última vez, un año después. */
  esperada: string;
  /** Ya debió salir y todavía no aparece. */
  atrasada: boolean;
  anios: number[];
  comuna_cercana: boolean;
  alto_valor: boolean;
  ultima: {
    codigo: string;
    fecha_publicacion: string;
    monto: number | null;
    oferentes: number | null;
    ganadores: GanadorDeProceso[];
  };
  /** El semáforo de la bandeja para la última vez que salió (decisión 62);
   *  null: la IA todavía no la lee. */
  semaforo: Semaforo | null;
  razon: string | null;
  /** Según la IA (decisión 63): true si tiene ediciones anteriores, false
   *  si salió una sola vez, null si todavía no lo revisa. */
  repite: boolean | null;
  repeticion: string | null;
  /** La empresa la descartó: «no creo que se repita». */
  descartada: boolean;
  /** Roja, de una comuna cercana y del rubro: el reciclaje (decisión 72).
   *  Una roja sin esto es la basura. Un motor de antes no lo trae. */
  reciclaje?: boolean;
}

/** Cómo va la lectura de «Se viene» (decisión 62). */
export interface LecturaDelCalendario {
  leyendo: boolean;
  leidas: number;
  total: number;
}

export const getCalendario = async () =>
  (await apiRequest(
    `${API_ROUTES.OPORTUNIDADES}/calendario`,
    "GET",
  )) as SeViene[];

export const getLecturaDelCalendario = async () =>
  (await apiRequest(
    `${API_ROUTES.OPORTUNIDADES}/calendario/lectura`,
    "GET",
  )) as LecturaDelCalendario;

/** «Descartar» una serie, o recuperarla (decisión 63). El código es el de
 *  la última vez que salió. */
export const descartarSerie = async (codigo: string, descartada: boolean) =>
  (await apiRequest(
    `${API_ROUTES.OPORTUNIDADES}/calendario/${encodeURIComponent(codigo)}`,
    "PATCH",
    { descartada },
  )) as { codigo: string; descartada: boolean };
