import { EmailCategory } from "./types";

export const emailCategories: EmailCategory[] = [
  {
    id: "admin",
    name: "Para Administradores",
    badge: "ADMIN",
    badgeColor: "bg-blue-100 text-blue-800",
    emails: [
      {
        id: "new-quotation",
        name: "Nueva Solicitud",
        description: "Solicitud de cotización recibida por link público",
        icon: "📧",
      },
      {
        id: "soon-events",
        name: "Eventos Próximos",
        description: "Recordatorio de eventos dias antes del evento",
        icon: "⏰",
      },
      {
        id: "survey-response",
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
        id: "quotation-sent",
        name: "Cotización Enviada",
        description: "Cotización enviada para su evento",
        icon: "📋",
      },
      {
        id: "payment-plan",
        name: "Plan de Pagos",
        description: "Cotización aceptada - Plan de pagos",
        icon: "✅",
      },
      {
        id: "payment-received",
        name: "Pago Recibido",
        description: "Confirmación de pago recibido",
        icon: "💰",
      },
      {
        id: "payment-reminder",
        name: "Recordatorio",
        description: "Recordatorio de Pago Pendiente",
        icon: "⏰",
      },
      {
        id: "payment-overdue",
        name: "Pago Vencido",
        description: "Recordatorio de Pago Vencido",
        icon: "⚠️",
      },
      {
        id: "satisfaction-survey",
        name: "Encuesta",
        description: "Encuesta de satisfacción evento",
        icon: "📝",
      },
    ],
  },
];
