import { getDocumentsByQuotation } from "../../services/documents.service";

// Los documentos del evento: UNA receta para Documentos, los respaldos de
// Seguimiento, el aviso de factura y la pestaña Facturación (que elige de
// acá el PDF de cada orden de compra). Compartir la clave es lo que los
// refresca juntos: si cambia, se separan (mapa 04, zona de riesgo 8).
// Sacada de PostVentaPage el 04-11-2026, sin cambiarla.
export const docsQueryOpts = (quotationId: string) => ({
  queryKey: ["postventa", "docs", quotationId],
  staleTime: 0,
  queryFn: () => getDocumentsByQuotation(quotationId),
});
