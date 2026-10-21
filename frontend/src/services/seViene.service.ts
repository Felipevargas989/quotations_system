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
