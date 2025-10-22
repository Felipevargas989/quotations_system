import { EmailStructure } from '../types';

export const EMAIL_SUBJECTS = {
  [EmailStructure.NEW_ACCOUNT]: 'Bienvenido a Eventia',
  [EmailStructure.NEW_PUBLIC_QUOTATION_CLIENT]:
    'Solicitud de cotización recibida',
  [EmailStructure.SOON_EVENTS]: 'Tienes estos eventos en 3 días',
  [EmailStructure.PAYMENT_REMINDER]: 'Recordatorio de Pago Pendiente',
  [EmailStructure.PAYMENT_OVERDUE]: 'Recordatorio de Pago Vencido',
  [EmailStructure.QUOTATION_IS_SENT]: 'Cotización enviada para su evento',
  [EmailStructure.PAYMENT_PLAN_CREATED]: 'Cotización aceptada - Plan de pagos',
  [EmailStructure.PAYMENT_RECEIVED]: 'Confirmación de pago recibido',
};

export const EMAIL_FROM = 'Eventia <hola@eventi-app.com>';
