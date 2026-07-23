import { supabase } from "../lib/supabase";

// ============ LA FILA "HOY" DEL DASHBOARD (Fase 5, 23-07) ============
// Cuatro alertas accionables, independientes del filtro de período:
// el "hoy" no se filtra. Cada una es clicable hacia su módulo.

export interface HoyAlerts {
  // Plata por cobrar: pagos pendientes + vencidos (vencido = estado
  // 'vencido' O pendiente con fecha de vencimiento ya pasada).
  porCobrar: { pendiente: number; vencido: number };
  // Eventos aceptados en los próximos 30 días.
  proximos: { count: number; primera: string | null };
  // Requerimientos en estado "solicitada" sin responder.
  requerimientos: { count: number; oldestDays: number };
  // Cotizaciones enviadas sin movimiento hace más de 7 días (leads
  // enfriándose).
  enviadas: { count: number; oldestDays: number };
}

const daysSince = (iso: string) =>
  Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);

export const getHoyAlerts = async (companyId: number): Promise<HoyAlerts> => {
  const hoy = new Date().toISOString().split("T")[0];
  const en30 = new Date(Date.now() + 30 * 86_400_000)
    .toISOString()
    .split("T")[0];
  const hace7 = new Date(Date.now() - 7 * 86_400_000).toISOString();

  const [pagos, eventos, reqs, envs] = await Promise.all([
    supabase
      .from("payments")
      .select(
        "amount, status, due_date, quotations!inner(company_id, quotation_status)",
      )
      .eq("quotations.company_id", companyId)
      .neq("quotations.quotation_status", "cancelada")
      .in("status", ["pendiente", "vencido"]),
    supabase
      .from("quotations")
      .select("id, event_date")
      .eq("company_id", companyId)
      .eq("quotation_status", "aceptada")
      .gte("event_date", hoy)
      .lte("event_date", en30)
      .order("event_date", { ascending: true }),
    supabase
      .from("quotations")
      .select("id, created_at")
      .eq("company_id", companyId)
      .eq("request_type", "requerimiento")
      .eq("quotation_status", "solicitada")
      .order("created_at", { ascending: true }),
    supabase
      .from("quotations")
      .select("id, updated_at")
      .eq("company_id", companyId)
      .eq("quotation_status", "enviada")
      .lt("updated_at", hace7)
      .order("updated_at", { ascending: true }),
  ]);

  let pendiente = 0;
  let vencido = 0;
  (pagos.data || []).forEach((p: any) => {
    const amount = Number(p.amount) || 0;
    const vencidoYa =
      p.status === "vencido" || (p.due_date && p.due_date < hoy);
    if (vencidoYa) vencido += amount;
    else pendiente += amount;
  });

  return {
    porCobrar: { pendiente, vencido },
    proximos: {
      count: (eventos.data || []).length,
      primera: (eventos.data || [])[0]?.event_date || null,
    },
    requerimientos: {
      count: (reqs.data || []).length,
      oldestDays: (reqs.data || [])[0]
        ? daysSince((reqs.data as any)[0].created_at)
        : 0,
    },
    enviadas: {
      count: (envs.data || []).length,
      oldestDays: (envs.data || [])[0]
        ? daysSince((envs.data as any)[0].updated_at)
        : 0,
    },
  };
};
