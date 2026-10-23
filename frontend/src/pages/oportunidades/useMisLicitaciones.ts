import { useQuery } from "@tanstack/react-query";
import {
  getMisLicitaciones,
  type MiLicitacion,
} from "../../services/oportunidades.service";

// "MIS LICITACIONES": la consulta, compartida por la pestaña y su conteo.

export const CLAVE_MIAS = ["oportunidades", "mias"];

/** Algo de la IA corriendo, o el motor trayendo documentos: se pregunta
 *  seguido hasta que termine. */
const algoCorriendo = (lista: MiLicitacion[]) =>
  lista.some(
    ({ avance: a }) =>
      a.trayendo ||
      a.analisis === "procesando" ||
      a.anexos === "procesando" ||
      a.propuesta === "procesando" ||
      a.validacion?.estado === "procesando",
  );

/** Siempre al día (Felipe, 23-10: "cuando dejo analizando las bases y
 *  salgo... en la línea de trabajo... no queda como cargando"): la lista se
 *  vuelve a pedir cada vez que se entra a ella o se vuelve a la pestaña, sin
 *  usar lo guardado. Así, lo que se lanzó en una ficha se ve girando aquí, y
 *  mientras la IA trabaja en alguna, pregunta cada 10 segundos. */
export function useMisLicitaciones() {
  return useQuery({
    queryKey: CLAVE_MIAS,
    queryFn: getMisLicitaciones,
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: "always",
    refetchInterval: (q) =>
      q.state.data && algoCorriendo(q.state.data) ? 10_000 : false,
  });
}
