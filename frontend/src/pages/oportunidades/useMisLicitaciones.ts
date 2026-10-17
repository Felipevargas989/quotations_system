import { useQuery } from "@tanstack/react-query";
import {
  getMisLicitaciones,
  type MiLicitacion,
} from "../../services/oportunidades.service";

// "MIS LICITACIONES": la consulta, compartida por la pestaña y su conteo.

export const CLAVE_MIAS = ["oportunidades", "mias"];

/** Algo de la IA corriendo: se pregunta seguido hasta que termine. */
const algoCorriendo = (lista: MiLicitacion[]) =>
  lista.some(
    ({ avance: a }) =>
      a.analisis === "procesando" ||
      a.anexos === "procesando" ||
      a.propuesta === "procesando" ||
      a.validacion?.estado === "procesando",
  );

export function useMisLicitaciones() {
  return useQuery({
    queryKey: CLAVE_MIAS,
    queryFn: getMisLicitaciones,
    refetchInterval: (q) =>
      q.state.data && algoCorriendo(q.state.data) ? 10_000 : false,
  });
}
