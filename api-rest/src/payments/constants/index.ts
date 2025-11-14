export enum PaymentStatus {
  PENDIENTE = 'pendiente',
  PAGADO = 'pagado',
  VENCIDO = 'vencido',
}

export const UPCOMING_OVERDUE_PAYMENTS_DAYS_NOTIFICATION = [7, 3, 0] as const;
export const OVERDUE_PAYMENTS_DAYS_NOTIFICATION = [-3, 7, 14] as const;
