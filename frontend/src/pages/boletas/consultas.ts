import { useQuery } from "@tanstack/react-query";
import { getEmitidasHoy } from "../../services/boletas.service";

// Lo que la sección Facturación lee de las boletas (doc 19 §9.21): las del
// día, que trae también dónde se emite (el letrero). Desde el 06-11 ya no
// hay pestaña «Emitidas hoy»: sirve para el letrero, que lo ve todo el que
// entra, también recepción.

export const LLAVE_HOY = ["boletas", "emitidas-hoy"];

export const useEmitidasHoy = () =>
  useQuery({ queryKey: LLAVE_HOY, queryFn: getEmitidasHoy });
