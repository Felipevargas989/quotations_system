import { useQuery } from "@tanstack/react-query";
import { getRefundsByQuotation } from "../services/refunds.service";
import { resumenDeReembolsos } from "../utils/reembolsosDelEvento";

/**
 * Los reembolsos de un evento y su resumen (20-10-2026). Misma llave que
 * usaba la sección de Reembolsos: el prefijo ["postventa"] hace que
 * refreshAfterSave los refresque al registrar o eliminar.
 */
export function useReembolsosDelEvento(quotationId: string) {
  const query = useQuery({
    queryKey: ["postventa", "refunds", quotationId],
    staleTime: 0,
    queryFn: () => getRefundsByQuotation(quotationId),
  });
  return {
    ...resumenDeReembolsos(query.data ?? []),
    cargando: query.isPending,
  };
}
