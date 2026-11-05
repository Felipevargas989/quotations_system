import { useQuery } from "@tanstack/react-query";
import { getEmitidasHoy, getPorBoletear } from "../../services/boletas.service";

// Lo que la sección Facturación y sus pestañas de boletas leen de las
// boletas (doc 19 §9.19): las mismas llaves, así la pestaña y el contador
// de su título comparten la misma consulta.

export const LLAVE_POR_BOLETEAR = ["boletas", "por-boletear"];
export const LLAVE_HOY = ["boletas", "emitidas-hoy"];

export const usePorBoletear = () =>
  useQuery({ queryKey: LLAVE_POR_BOLETEAR, queryFn: () => getPorBoletear() });

export const useEmitidasHoy = () =>
  useQuery({ queryKey: LLAVE_HOY, queryFn: getEmitidasHoy });
