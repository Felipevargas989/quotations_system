import { API_ROUTES } from "../constants/api.routes";
import { apiRequest } from "./api";
import type {
  AnalisisDeBases,
  VistaDelOferente,
} from "./oportunidades.service";

// LA EXPERIENCIA QUE SE PRESENTA (decisión 76 del doc 17, 24-10). Felipe:
// "hay dos fuentes de información... las órdenes de compra que han pasado
// por el mercado público... en segunda instancia tiene que ir a la base de
// datos de Eventia... me puede preguntar cuál está pensando traer. Yo le
// confirmo si sí o si no, que busque otras. Y listo, con eso las arma".
// Aparte de oportunidades.service, que está en el tope de 800 líneas.

/** Una experiencia que se puede presentar: una orden de compra de Mercado
 *  Público de «Mi empresa» o un evento de Eventia. */
export interface CandidataDeExperiencia {
  clave: string;
  de: "mi_empresa" | "eventia";
  /** Con su orden de compra o factura: solo esas van al formulario. */
  con_respaldo: boolean;
  numero: string | null;
  mandante: string | null;
  contrato: string | null;
  anio: number | null;
  /** Pesos, con impuestos. */
  monto: number | null;
  fuente: "mercado_publico" | "manual";
  /** N° del evento de Eventia. */
  evento?: number;
  archivo: string | null;
  /** Lo que fue, de Eventia: tipo, personas y lo que se sirvió. */
  que_fue?: string;
  /** Por qué la eligió la IA, o por qué conviene subir su factura. */
  por_que?: string;
}

export interface EleccionDeExperiencia {
  /** Cuántos contratos dan el puntaje máximo (0 = las bases no lo dicen). */
  pide: number;
  periodo: string;
  condiciones: string;
  /** En el orden del formulario: las que cuentan y al final las de
   *  reserva. */
  elegidas: CandidataDeExperiencia[];
  /** Sin factura subida, pero convendría subirla. */
  faltan: CandidataDeExperiencia[];
  nota: string;
  confirmada?: boolean;
  confirmada_en?: string;
}

export interface TrabajoDeExperiencia
  extends Omit<AnalisisDeBases, "resultado"> {
  tipo: "experiencia";
  parametros?: { excluir?: string[] };
  resultado: EleccionDeExperiencia | null;
}

export interface EstadoDeLaExperiencia {
  /** ¿Las bases piden experiencia? Si no, no hay nada que confirmar. */
  piden: boolean;
  trabajo: TrabajoDeExperiencia | null;
}

export const getExperiencia = async (id: number) =>
  (await apiRequest(
    `${API_ROUTES.OPORTUNIDADES}/${id}/experiencia`,
    "GET",
  )) as EstadoDeLaExperiencia;

/** La IA propone según las bases. `excluir`: las que ya se sacaron
 *  («Buscar otras»). */
export const proponerExperiencia = async (id: number, excluir: string[] = []) =>
  (await apiRequest(`${API_ROUTES.OPORTUNIDADES}/${id}/experiencia`, "POST", {
    excluir,
  })) as TrabajoDeExperiencia;

/** La empresa dice cuáles van: las elegidas, sin las que se sacan. */
export const confirmarExperiencia = async (id: number, quitar: string[] = []) =>
  (await apiRequest(
    `${API_ROUTES.OPORTUNIDADES}/${id}/experiencia/confirmar`,
    "POST",
    { quitar },
  )) as TrabajoDeExperiencia;

export const guardarClientesQueSeMuestran = async (ids: string[]) =>
  (await apiRequest(
    `${API_ROUTES.OPORTUNIDADES}/oferente/clientes-que-se-muestran`,
    "PATCH",
    { ids },
  )) as VistaDelOferente;
