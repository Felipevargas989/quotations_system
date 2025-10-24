import { EmailStructure } from "../../types/notifications";
import { EmailCategory } from "./types";

export const emailCategories: EmailCategory[] = [
  {
    id: "admin",
    name: "Para Administradores",
    badge: "ADMIN",
    badgeColor: "bg-blue-100 text-blue-800",
    emails: [
      {
        id: EmailStructure.NEW_PUBLIC_QUOTATION_ADMIN,
        name: "Nueva Solicitud",
        description: "Solicitud de cotización recibida por link público",
        icon: "📧",
      },
      {
        id: EmailStructure.SOON_EVENTS,
        name: "Eventos Próximos",
        description: "Recordatorio de eventos dias antes del evento",
        icon: "⏰",
      },
      {
        id: EmailStructure.NEW_ANSWER_CUSTOMER_SATISFACTION_SURVEY,
        name: "Respuesta Encuesta",
        description: "Nueva respuesta de encuesta de satisfacción",
        icon: "📊",
      },
    ],
  },
  {
    id: "client",
    name: "Para Clientes",
    badge: "CLIENTE",
    badgeColor: "bg-green-100 text-green-800",
    emails: [
      {
        id: EmailStructure.QUOTATION_IS_SENT,
        name: "Cotización Enviada",
        description: "Cotización enviada para su evento",
        icon: "📋",
      },
      {
        id: EmailStructure.PAYMENT_PLAN_CREATED,
        name: "Plan de Pagos",
        description: "Cotización aceptada - Plan de pagos",
        icon: "✅",
      },
      {
        id: EmailStructure.PAYMENT_RECEIVED,
        name: "Pago Recibido",
        description: "Confirmación de pago recibido",
        icon: "💰",
      },
      {
        id: EmailStructure.PAYMENT_REMINDER,
        name: "Recordatorio",
        description: "Recordatorio de Pago Pendiente",
        icon: "⏰",
      },
      {
        id: EmailStructure.PAYMENT_OVERDUE,
        name: "Pago Vencido",
        description: "Recordatorio de Pago Vencido",
        icon: "⚠️",
      },
      {
        id: EmailStructure.CUSTOMER_SATISFACTION_SURVEY,
        name: "Encuesta",
        description: "Encuesta de satisfacción evento",
        icon: "📝",
      },
    ],
  },
];
