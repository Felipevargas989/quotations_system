import type { Refund } from "../types/refunds.types";

// REEMBOLSOS POR PARTES (20-10-2026). Lo PENDIENTE (no pagado) es lo que
// falta por devolver: la barra roja de la ficha de un evento anulado. Cada
// reembolso registrado es una fila pagada, con su fecha, medio y
// comprobante. Total = pendiente + registrado.

export interface ResumenDeReembolsos {
  readonly registrados: Refund[];
  readonly pendiente: number;
  readonly registrado: number;
  readonly total: number;
}

export const resumenDeReembolsos = (
  reembolsos: readonly Refund[],
): ResumenDeReembolsos => {
  const monto = (r: Refund) => Number(r.amount) || 0;
  const registrados = reembolsos
    .filter((r) => r.is_paid)
    .sort((a, b) =>
      String(a.refund_date ?? a.created_at ?? "").localeCompare(
        String(b.refund_date ?? b.created_at ?? ""),
      ),
    );
  const pendiente = reembolsos
    .filter((r) => !r.is_paid)
    .reduce((t, r) => t + monto(r), 0);
  const registrado = registrados.reduce((t, r) => t + monto(r), 0);
  return { registrados, pendiente, registrado, total: pendiente + registrado };
};

/** Ancho de la barra roja: lo que falta sobre el total (se vacía al registrar). */
export const anchoPorReembolsar = (pendiente: number, total: number): number =>
  total > 0 ? Math.min(100, Math.max(0, (pendiente / total) * 100)) : 0;

export const pesos = (n: number) => "$" + Math.round(n).toLocaleString("es-CL");
