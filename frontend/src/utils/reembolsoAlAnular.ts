import { QuotationStatus } from "../types/quotations.types";

// REEMBOLSO AL ANULAR (20-10-2026). Felipe: "al momento de anular un
// evento con reembolsos el sistema debería preguntar si se reembolsarán
// los ingresos y si se coloca sí, generar el reembolso". El motor valida
// lo mismo (api-rest/src/quotations/utils/reembolso-al-anular.ts).

type ConAbonos = {
  payment_transactions?: { amount?: number | string | null }[] | null;
};
type Reembolso = { amount?: number | string | null };

/** Lo abonado en todas las cuotas menos lo que ya tiene reembolso
 *  (pagado o pendiente). Nunca negativo. */
export const disponibleParaReembolsar = (
  cuotas: readonly ConAbonos[],
  reembolsos: readonly Reembolso[],
): number => {
  const abonado = cuotas.reduce(
    (total, cuota) =>
      total +
      (cuota.payment_transactions ?? []).reduce(
        (suma, registro) => suma + (Number(registro.amount) || 0),
        0,
      ),
    0,
  );
  const reembolsado = reembolsos.reduce(
    (total, r) => total + (Number(r.amount) || 0),
    0,
  );
  return Math.max(0, Math.round(abonado - reembolsado));
};

/** El parche de anular: estado, motivo y, si dijeron que sí, cuánto se
 *  devuelve (nace un reembolso pendiente en el motor). */
export const cambioDeAnulacion = (motivo: string, reembolso?: number) => ({
  quotation_status: QuotationStatus.CANCELADA,
  loss_reason: motivo,
  ...(reembolso ? { reembolso_al_anular: reembolso } : {}),
});
