import { EmailStructure } from '../types';

export const EMAIL_SUBJECTS = {
  [EmailStructure.NEW_ACCOUNT]: 'Bienvenido a Eventia',
  [EmailStructure.NEW_PUBLIC_QUOTATION_CLIENT]:
    'Solicitud de cotización recibida',
  [EmailStructure.NEW_PUBLIC_QUOTATION_ADMIN]:
    'Solicitud de cotización recibida desde link público',
  [EmailStructure.SOON_EVENTS]: 'Tienes estos eventos en 3 días',
  [EmailStructure.PAYMENT_REMINDER]: 'Recordatorio de Pago Pendiente',
  [EmailStructure.PAYMENT_REMINDER_ADMIN]: 'Recordatorio de Pago Pendiente',
  [EmailStructure.PAYMENT_OVERDUE]: 'Recordatorio de Pago Vencido',
  [EmailStructure.PAYMENT_OVERDUE_ADMIN]: 'Recordatorio de Pago Vencido',
  [EmailStructure.QUOTATION_IS_SENT]: 'Cotización enviada para su evento',
  [EmailStructure.PAYMENT_PLAN_CREATED]: 'Cotización aceptada - Plan de pagos',
  [EmailStructure.PAYMENT_RECEIVED]: 'Confirmación de pago recibido',
  [EmailStructure.CUSTOMER_SATISFACTION_SURVEY]:
    'Encuesta de satisfacción evento',
  [EmailStructure.NEW_ANSWER_CUSTOMER_SATISFACTION_SURVEY]:
    'Nueva respuesta de encuesta de satisfacción',
  [EmailStructure.WEEKLY_ANALYTICS]: 'Análisis semanal de tus eventos',
};

export const EMAILS_SEND_TO_CLIENT = [
  EmailStructure.NEW_PUBLIC_QUOTATION_CLIENT,
  EmailStructure.PAYMENT_REMINDER,
  EmailStructure.PAYMENT_OVERDUE,
  EmailStructure.QUOTATION_IS_SENT,
  EmailStructure.PAYMENT_PLAN_CREATED,
  EmailStructure.PAYMENT_RECEIVED,
  EmailStructure.CUSTOMER_SATISFACTION_SURVEY,
];

export const EMAIL_FROM = 'Eventia <hola@eventi-app.com>';
