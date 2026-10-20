import { API_ROUTES } from "../constants/api.routes";
import { apiRequest } from "./api";
import type { AnalisisDeBases } from "./oportunidades.service";

// LO QUE APRENDIMOS DE LAS COMISIONES (decisión 60 del doc 17, 20-10).
// Felipe: "entender los criterios, las flexibilidades que tienen estos
// comités evaluadores... para intentar predecir quién va a ganar, nada
// más". El acta se sube con `subirAdjunto(id, archivo, "acta")`.

export type TipoDeDecision = "estricta" | "flexible" | "contra_las_bases";

export interface Aprendizaje {
  id: number;
  codigo: string;
  unidad: string | null;
  organismo: string | null;
  situacion: string;
  decision: string;
  tipo: TipoDeDecision;
  fuente: "caso" | "acta";
  oportunidad_id: number | null;
  creado_en: string;
}

export interface LoAprendido {
  ganador: string;
  prediccion: "acerto" | "fallo" | "sin_prediccion";
  por_que: string;
  resumen: string;
  aprendizajes: Array<{
    situacion: string;
    decision: string;
    tipo: TipoDeDecision;
  }>;
  /** Cuántas decisiones nuevas quedaron en la base. */
  guardados: number;
}

export interface TrabajoDeAprendizaje
  extends Omit<AnalisisDeBases, "resultado"> {
  tipo: "aprendizaje";
  resultado: LoAprendido | null;
}

export interface EstadoDeLoAprendido {
  /** Lo que se sabe de esta comisión (su unidad de compra). */
  comision: Aprendizaje[];
  /** Cuántas decisiones tiene la base, de todas las comisiones. */
  total: number;
  trabajo: TrabajoDeAprendizaje | null;
}

export const getAprendizajes = async (id: number) =>
  (await apiRequest(
    `${API_ROUTES.OPORTUNIDADES}/${id}/aprendizajes`,
    "GET",
  )) as EstadoDeLoAprendido;

export const pedirAprendizaje = async (id: number) =>
  (await apiRequest(
    `${API_ROUTES.OPORTUNIDADES}/${id}/aprendizajes`,
    "POST",
  )) as TrabajoDeAprendizaje;
