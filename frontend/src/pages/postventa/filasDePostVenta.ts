import type { PaymentWithTransactions } from "../../services/paymentTransactions.service";
import { normalizeText } from "../../utils/searchMatch";
import { cuotaStatus } from "./estadoCuota";

// One row per closed event (quotation), aggregated from its payment plan.
export interface EventRow {
  quotationId: string;
  quotationNumber: number;
  clientName: string;
  clientType?: string;
  contactPerson?: string;
  phone?: string;
  contactEmail?: string;
  hasContract?: boolean;
  total: number;
  paid: number; // bruto: suma de abonos del cliente
  refunded: number; // reembolsos ya devueltos (is_paid = true)
  cuotas: number;
  status: "pagado" | "vencido" | "pendiente";
  // Evento anulado: fuera de la lista por defecto, visible con el filtro.
  cancelled: boolean;
  // Evento realizado: sigue en la lista (cobranza) con su etiqueta verde.
  done: boolean;
  // Fecha del evento (y último día si es multi-día), para la columna.
  eventDate: string | null;
  eventEndDate: string | null;
  // Enlace secreto del portal del cliente (migración 47).
  portalToken: string | null;
  payments: PaymentWithTransactions[];
}

/** La cotización como viene embebida en cada cuota (y, con la misma forma,
 *  en `GET /payments/eventos-sin-plan`). */
interface CotizacionDeLaFila {
  id?: string;
  quotation_number?: number;
  quotation_status?: string;
  total_amount?: number | string;
  event_date?: string | null;
  event_end_date?: string | null;
  has_contract?: boolean;
  contact_name?: string | null;
  mandante?: { portal_token?: string | null } | null;
  clients?: {
    name?: string;
    email?: string;
    client_contacts?: { name: string; phone?: string; email?: string }[];
  };
}

/** Lo que la lista usa de la ficha del cliente (se cruza por nombre). */
interface ClienteDeLaLista {
  name: string;
  client_type?: string;
  contact_person?: string;
  phone?: string;
}

/**
 * LA LISTA DE POST-VENTA: una fila por evento. Hasta el 28-10-2026 las filas
 * salían SOLO de las cuotas, y un evento sin cuotas no existía: la 703 quedó
 * aceptada sin plan y desapareció (Felipe: "los eventos no deberían
 * desaparecer"). Ahora se suman las aceptadas, realizadas y anuladas sin
 * ninguna cuota (`sinPlan`), con 0 cuotas: la pantalla les pone el aviso
 * «Sin plan de pagos». Sacado de PostVentaPage (techo de tamaño).
 */
export function armarFilas({
  payments,
  sinPlan,
  clients,
  refundsPaid,
}: {
  payments: PaymentWithTransactions[];
  sinPlan: unknown[];
  clients: ClienteDeLaLista[];
  refundsPaid: Record<string, number>;
}): EventRow[] {
  const clientByName = new Map<string, ClienteDeLaLista>(
    (clients || []).map((c) => [c.name, c]),
  );

  const byQuotation = new Map<string, PaymentWithTransactions[]>();
  (payments || []).forEach((p) => {
    if (!p.quotation_id) return;
    const arr = byQuotation.get(p.quotation_id) || [];
    arr.push(p);
    byQuotation.set(p.quotation_id, arr);
  });

  const fila = (
    quotationId: string,
    q: CotizacionDeLaFila | undefined,
    ps: PaymentWithTransactions[],
  ): EventRow => {
    const total =
      Number(q?.total_amount) ||
      ps.reduce((s, p) => s + (Number(p.amount) || 0), 0);
    const paid = ps.reduce((s, p) => s + (p.paid_amount || 0), 0);
    const refunded = refundsPaid[quotationId] || 0;
    const client = q?.clients?.name
      ? clientByName.get(q.clients.name)
      : undefined;

    // Saldo neto: lo pagado menos lo ya devuelto al cliente.
    const saldo = total - (paid - refunded);
    let status: EventRow["status"] = "pendiente";
    if (saldo <= 0) status = "pagado";
    else if (ps.some((p) => cuotaStatus(p) === "vencido")) status = "vencido";

    // Contacto mostrado: el MANDANTE de la cotización (quien encargó
    // ESTE evento), con su propio teléfono buscado entre los contactos
    // del cliente. Sin mandante guardado (cotizaciones antiguas) → el
    // contacto principal del cliente, como antes. Si el mandante no
    // tiene fono registrado, no se muestra el de otra persona.
    const mandante = q?.contact_name?.trim();
    let contactPerson = client?.contact_person;
    let phone = client?.phone;
    // Correo en la columna (pedido de Felipe 30-07), igual que en
    // Cotizaciones: el del mandante; sin mandante, el de la ficha.
    let contactEmail = q?.clients?.email;
    if (mandante) {
      contactPerson = mandante;
      const match = (q?.clients?.client_contacts || []).find(
        (c) => normalizeText(c.name) === normalizeText(mandante),
      );
      phone = match?.phone || undefined;
      contactEmail = match?.email || undefined;
    }

    return {
      quotationId,
      cancelled: q?.quotation_status === "cancelada",
      done: q?.quotation_status === "realizada",
      eventDate: q?.event_date ?? null,
      eventEndDate: q?.event_end_date ?? null,
      quotationNumber: q?.quotation_number ?? 0,
      clientName: q?.clients?.name || "—",
      clientType: client?.client_type,
      contactPerson,
      phone,
      contactEmail,
      hasContract: q?.has_contract,
      portalToken: q?.mandante?.portal_token ?? null,
      total,
      paid,
      refunded,
      cuotas: ps.length,
      status,
      payments: ps.slice().sort((a, b) => a.payment_number - b.payment_number),
    };
  };

  const events: EventRow[] = [];
  byQuotation.forEach((ps, quotationId) => {
    events.push(fila(quotationId, ps[0].quotations as CotizacionDeLaFila, ps));
  });
  for (const crudo of sinPlan || []) {
    const q = crudo as CotizacionDeLaFila;
    if (!q?.id || byQuotation.has(q.id)) continue;
    events.push(fila(q.id, q, []));
  }

  events.sort((a, b) => b.quotationNumber - a.quotationNumber);
  return events;
}
