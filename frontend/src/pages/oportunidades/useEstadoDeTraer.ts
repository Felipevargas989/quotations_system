import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { getEstadoDeTraer } from "../../services/oportunidades.service";
import { CLAVE_MIAS } from "./useMisLicitaciones";

// «TRAER LOS DOCUMENTOS», SIEMPRE A LA VISTA (23-10). Felipe salió de la
// ficha mientras se bajaba un PDF de 12 MB, volvió, vio el botón libre y
// apretó otra vez: el PDF quedó repetido. El «Trayendo…» vivía solo en el
// botón. Ahora se le pregunta al motor al entrar a la ficha y, mientras
// trae, cada 3 segundos; el botón y la etapa Bases del camino lo usan. Al
// terminar, la lista de bases y «Mis licitaciones» se piden de nuevo.

export const claveDeTraer = (oportunidadId: number) => [
  "oportunidades",
  "adjuntos",
  oportunidadId,
  "traer",
];

const PREGUNTAR_MIENTRAS_TRAE = 3000;

/** `activo` false (en «Mi postulación», que no trae nada): no pregunta. */
export function useEstadoDeTraer(
  oportunidadId: number,
  activo = true,
): boolean {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: claveDeTraer(oportunidadId),
    queryFn: () => getEstadoDeTraer(oportunidadId),
    enabled: activo,
    staleTime: 0,
    refetchOnMount: "always",
    refetchInterval: (q) =>
      q.state.data?.trayendo ? PREGUNTAR_MIENTRAS_TRAE : false,
  });
  const trayendo = data?.trayendo ?? false;

  const antes = useRef(trayendo);
  useEffect(() => {
    if (antes.current && !trayendo) {
      void qc.invalidateQueries({
        queryKey: ["oportunidades", "adjuntos", oportunidadId, "bases"],
      });
      void qc.invalidateQueries({ queryKey: CLAVE_MIAS });
    }
    antes.current = trayendo;
  }, [trayendo, oportunidadId, qc]);

  return trayendo;
}
