import { useQuery } from "@tanstack/react-query";
import { getPorFacturar } from "../../services/facturas.service";

// Lo que la sección Facturación lee de «Por facturar» (doc 19 §9.21): la
// misma llave para la pestaña y el número de su título.

export const LLAVE_POR_FACTURAR = ["facturacion", "por-facturar"];

export const usePorFacturar = (activa = true) =>
  useQuery({
    queryKey: LLAVE_POR_FACTURAR,
    queryFn: getPorFacturar,
    enabled: activa,
  });
