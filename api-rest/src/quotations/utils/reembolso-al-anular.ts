// REEMBOLSO AL ANULAR (20-10-2026). Felipe: "al momento de anular un
// evento con reembolsos el sistema debería preguntar si se reembolsarán
// los ingresos y si se coloca sí, generar el reembolso". Antes anular
// dejaba los abonos como historia y nadie devolvía nada (la #465, anulada
// con $1.394.000 abonados y sin reembolso).
//
// Cuánto se puede devolver todavía: lo abonado (todos los registros de
// todas las cuotas) menos lo que ya tiene reembolso, pagado o pendiente.
// Nunca negativo.

type ConAbonos = {
  payment_transactions?: { amount?: number | string | null }[] | null;
};
type Reembolso = { amount?: number | string | null };

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

export const reembolsoMayorQueLoAbonado = (disponible: number): string =>
  `El reembolso no puede superar lo abonado sin reembolsar ($${disponible.toLocaleString('es-CL')}).`;

export const REEMBOLSO_SOLO_AL_ANULAR =
  'El reembolso al anular solo se pide al anular un evento aceptado.';
