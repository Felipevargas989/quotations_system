import type { Quotation } from './entities/quotation.entity';

/**
 * LA LISTA BLANCA de la hoja pública (doc 13): los ÚNICOS campos de
 * una cotización que salen por las puertas públicas — el portal del
 * mandante y la vista de impresión del PDF. Los costos internos jamás
 * pasan por aquí. Una sola lista para ambas puertas: si mañana la hoja
 * necesita un campo más, se agrega una vez.
 */
export const listaBlancaDeHoja = (
  q: Quotation & { clients?: { name?: string | null } | null },
  nombreClienteRespaldo?: string | null,
) => ({
  quotation_number: q.quotation_number,
  people_count: q.people_count,
  children_count: q.children_count,
  event_type: q.event_type,
  event_date: q.event_date,
  event_end_date: q.event_end_date,
  created_at: q.created_at,
  total_amount: q.total_amount,
  subtotal_amount: q.subtotal_amount,
  tip_percentage: q.tip_percentage,
  observations: q.observations,
  contact_name: q.contact_name,
  items: q.items,
  clients: { name: q.clients?.name || nombreClienteRespaldo || '' },
});
