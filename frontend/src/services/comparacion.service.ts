import { API_ROUTES } from "../constants/api.routes";
import { api, apiRequest } from "./api";
import type {
  AdjuntoDeOportunidad,
  AnalisisDeBases,
} from "./oportunidades.service";

// LA COMPARACIÓN DE OFERTAS (decisión 41 del doc 17, 19-10). Felipe:
// "cargamos ambas ofertas, la mía va a salir de acá, la otra la descargo y
// la sumo, y que la IA analice porcentualmente quién cumple mejor según
// cada parámetro y cada nota según los criterios de evaluación". Aparte de
// oportunidades.service, que está cerca del tope de 800 líneas.

export interface NotaDeCriterio {
  /** El número del criterio, desde 1, en el orden de `criterios`. */
  criterio: number;
  /** De 0 a 100. */
  nota: number;
  fundamento: string;
}

/** Lo que, según las bases o la ley, deja fuera una oferta (decisión 59). */
export interface IncumplimientoGrave {
  que: string;
  /** El archivo y la página, o «no está entre lo que presentó». */
  prueba: string;
  /** El punto de las bases o la norma que la deja fuera. */
  regla: string;
  /** Es porque algo no está entre lo que se subió de esa oferta. */
  por_ausencia: boolean;
}

export interface OferenteComparado {
  nombre: string;
  es_tuya: boolean;
  precio: string;
  cumple_bases: "si" | "no" | "dudoso";
  por_que: string;
  /** Desde la decisión 59 (20-10); las comparaciones de antes no lo traen. */
  graves?: IncumplimientoGrave[];
  /** El texto para el Centro de Ayuda, que arma el motor: solo en la de un
   *  competidor con incumplimientos graves (decisión 59). */
  reclamo?: string | null;
  notas: NotaDeCriterio[];
  /** De 0 a 100. */
  probabilidad: number;
  fortalezas: string[];
  debilidades: string[];
  /** Ponderado con los pesos de las bases (0 a 100): lo calcula el motor. */
  puntaje: number;
}

export interface ComparacionDeOfertas {
  resumen: string;
  ganador_probable: string;
  criterios: Array<{ nombre: string; peso: number }>;
  oferentes: OferenteComparado[];
  para_la_proxima: string[];
}

export interface TrabajoDeComparacion
  extends Omit<AnalisisDeBases, "resultado"> {
  tipo: "comparacion";
  resultado: ComparacionDeOfertas | null;
}

export const getComparacion = async (id: number) =>
  ((await apiRequest(
    `${API_ROUTES.OPORTUNIDADES}/${id}/comparacion`,
    "GET",
  )) as TrabajoDeComparacion | "" | null) || null;

export const pedirComparacion = async (id: number) =>
  (await apiRequest(
    `${API_ROUTES.OPORTUNIDADES}/${id}/comparacion`,
    "POST",
  )) as TrabajoDeComparacion;

/** Por qué perdimos (decisión 97, 27-10): cuando una postulada queda
 *  perdida, la IA explica por qué y si era razonable, con los criterios de
 *  «Cómo te evalúan». */
export interface PorQuePerdimos {
  resumen: string;
  razonable: "si" | "no" | "dudoso";
  fundamento: string;
  en_que_se_perdio: Array<{ criterio: string; que_paso: string }>;
  para_la_proxima: string[];
}

export interface TrabajoDePorQue extends Omit<AnalisisDeBases, "resultado"> {
  tipo: "por_que";
  resultado: PorQuePerdimos | null;
}

export const getPorQue = async (id: number) =>
  ((await apiRequest(`${API_ROUTES.OPORTUNIDADES}/${id}/por-que`, "GET")) as
    | TrabajoDePorQue
    | ""
    | null) || null;

export const pedirPorQue = async (id: number) =>
  (await apiRequest(
    `${API_ROUTES.OPORTUNIDADES}/${id}/por-que`,
    "POST",
  )) as TrabajoDePorQue;

/** La oferta de un competidor, un archivo por pedido, con su nombre. */
export const subirOfertaDeCompetidor = async (
  id: number,
  archivo: File,
  competidor: string,
) => {
  const form = new FormData();
  form.append("file", archivo);
  form.append("seccion", "competencia");
  form.append("competidor", competidor);
  const { data } = await api.request({
    url: `${API_ROUTES.OPORTUNIDADES}/${id}/adjuntos`,
    method: "POST",
    data: form,
    headers: { "Content-Type": undefined },
  });
  return data as AdjuntoDeOportunidad;
};
