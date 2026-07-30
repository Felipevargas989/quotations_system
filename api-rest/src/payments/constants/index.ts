export enum PaymentStatus {
  PENDIENTE = 'pendiente',
  PAGADO = 'pagado',
  VENCIDO = 'vencido',
}

// Hitos anti-spam (decisión de Felipe 29-07): el cliente recibe COMO
// MÁXIMO 3 toques por cuota — 3 días antes, el día del vencimiento, y
// a los 7 días de vencida. (Antes eran hasta 6: [7,3,0] y [-3,7,14].)
export const UPCOMING_OVERDUE_PAYMENTS_DAYS_NOTIFICATION = [3, 0] as const;
export const OVERDUE_PAYMENTS_DAYS_NOTIFICATION = [-7] as const;
