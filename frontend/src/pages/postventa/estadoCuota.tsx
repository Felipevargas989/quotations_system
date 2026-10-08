import { format } from "date-fns";
import type { PaymentWithTransactions } from "../../services/paymentTransactions.service";

/*
 * EL ESTADO DE UNA CUOTA EN POST-VENTA (sacado de PostVentaPage el
 * 08-10-2026 para hacerle espacio a "un pago repartido es uno solo":
 * la página está congelada por tamaño).
 */

// Estado EFECTIVO de una cuota. El status guardado en BD solo pasa a
// "vencido" mediante un cron del backend (1 AM); si el backend no estaba
// corriendo (típico en dev) una cuota atrasada seguiría diciendo "pendiente".
// Por eso además comparamos la fecha de vencimiento con hoy (por fecha
// calendario, sin horas): vence hoy = aún pendiente; desde mañana = vencida.
export const cuotaStatus = (p: PaymentWithTransactions): string => {
  if (p.status === "pagado") return "pagado";
  if (p.status === "vencido") return "vencido";
  const saldo = (p.amount || 0) - (p.paid_amount || 0);
  const due = (p.due_date || "").slice(0, 10);
  if (saldo > 0 && due && due < format(new Date(), "yyyy-MM-dd"))
    return "vencido";
  return p.status;
};

// `parcial`: cuota con abonos que no la cubren (cuotas que se llenan, 07-10).
export const statusBadge = (st: string, parcial = false) => {
  const map: Record<string, string> = {
    pagado: "bg-green-100 text-green-800",
    vencido: "bg-red-100 text-red-800",
    pendiente: "bg-yellow-100 text-yellow-800",
  };
  return (
    <span
      className={`px-2 py-0.5 text-xs font-semibold rounded-full ${map[st] || map.pendiente}`}
    >
      {st ? st.charAt(0).toUpperCase() + st.slice(1) : "—"}
      {parcial && st !== "pagado" ? " · parcial" : ""}
    </span>
  );
};
