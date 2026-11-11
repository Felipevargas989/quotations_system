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
  /** El número de su oferta, desde 1; la 1 es la de la empresa. Las
   *  comparaciones de antes de la decisión 125 no lo traen. */
  oferta?: number;
  /** Como aparece en su oferta (su razón social). */
  nombre: string;
  /** Como se llama en «La competencia»: el nombre corto, para mostrar. */
  corto?: string;
  es_tuya: boolean;
  /** Lo que ofertó en esa línea. */
  precio: string;
  cumple_bases: "si" | "no" | "dudoso";
  /** Su estado en pocas palabras, para debajo del chip (decisión 125). */
  en_corto?: string;
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

/** Una línea de la licitación (decisión 125, 11-11): una competencia
 *  aparte, solo con quienes postularon a ella. Felipe, con la 5040-14-LE26:
 *  "recuerda que son dos líneas que se podrían postular de forma
 *  independiente". Sin líneas, o en una comparación de antes, va una sola
 *  con el nombre vacío. */
export interface LineaComparada {
  nombre: string;
  /** El monto disponible de la línea, si las bases lo dicen. */
  tope: string;
  /** La empresa postuló a esta línea. */
  compites: boolean;
  /** De qué depende quién gana, en una frase. */
  que_lo_decide: string;
  ganador_probable: string;
  oferentes: OferenteComparado[];
  /** Quién gana si la comisión acepta todas las ofertas (el `nombre`). */
  si_aceptan_todo: string | null;
  /** Quién gana si deja fuera lo que no cumple a la letra; null si nadie. */
  a_la_letra: string | null;
}

/** Lo que el motor leyó de una oferta (decisión 125). */
export interface LecturaDeUnaOferta {
  oferta: number;
  nombre: string;
  es_tuya: boolean;
  leidos: number;
  total: number;
  sin_leer: Array<{ nombre: string; motivo: string }>;
  /** Están en Mercado Público, pero no llegaron (los comprimidos). */
  sin_traer: Array<{ nombre: string; motivo: string }>;
}

export interface ComparacionDeOfertas {
  resumen: string;
  criterios: Array<{ nombre: string; peso: number }>;
  /** El motor las entrega siempre, también para una comparación de antes. */
  lineas: LineaComparada[];
  lectura?: LecturaDeUnaOferta[];
  para_la_proxima: string[];
  /** Los de la línea principal: lo que leían las pantallas de antes. */
  ganador_probable: string;
  oferentes: OferenteComparado[];
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

/** «Traer las ofertas» (decisión 123, 10-11): lo que dejó una vuelta del
 *  motor sobre el cuadro de ofertas público de una licitación. */
export interface OfertasTraidas {
  /** false: Mercado Público todavía no muestra el cuadro de ofertas. */
  publicadas: boolean;
  /** Los demás oferentes, sin contar a la empresa. */
  oferentes: number;
  traidos: number;
  yaEstaban: number;
  /** Comprimidos, tipos que Eventia no guarda o de más de 30 MB. */
  noSeTraen: number;
  /** Quedó algo sin traer: se puede pedir de nuevo. */
  incompleto: boolean;
}

export interface EstadoDeTraerOfertas {
  trayendo: boolean;
  /** Cómo terminó la última vuelta desde que partió el motor. */
  ultima: {
    terminada_en: string;
    error: string | null;
    resultado: OfertasTraidas | null;
  } | null;
}

/** ¿El motor está trayendo las ofertas, y cómo terminó la última vez? */
export const getEstadoDeTraerOfertas = async (id: number) =>
  (await apiRequest(
    `${API_ROUTES.OPORTUNIDADES}/${id}/competencia/traer`,
    "GET",
  )) as EstadoDeTraerOfertas;

/** Parte la vuelta: el motor responde al tiro y sigue por detrás. */
export const traerOfertas = async (id: number) =>
  (await apiRequest(
    `${API_ROUTES.OPORTUNIDADES}/${id}/competencia/traer`,
    "POST",
  )) as EstadoDeTraerOfertas;

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
