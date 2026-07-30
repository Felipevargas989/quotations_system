import { EmailStructure } from "../../types/notifications";
import { EmailCategory } from "./types";

// La lista REAL de correos tras la reforma del 29/30-07: 7 al cliente
// (la cobranza en su propio grupo, para ver de un vistazo si el ciclo
// está encendido) y los del equipo aparte, informativos — el backend
// los envía siempre. Regla del interruptor: sin llave = encendido;
// el casillero se muestra marcado salvo apagado explícito.
export const emailCategories: EmailCategory[] = [
  {
    id: "client",
    name: "Para Clientes",
    badge: "CLIENTE",
    badgeColor: "bg-green-100 text-green-800",
    emails: [
      {
        id: EmailStructure.NEW_PUBLIC_QUOTATION_CLIENT,
        name: "Recibimos tu solicitud",
        description: "Acuse de recibo al crear una cotización por link público",
        icon: "📨",
      },
      {
        id: EmailStructure.QUOTATION_IS_SENT,
        name: "Cotización Enviada",
        description: "Su cotización está lista, con el detalle del evento",
        icon: "📋",
      },
      {
        id: EmailStructure.PAYMENT_PLAN_CREATED,
        name: "Plan de Pagos",
        description: "Cotización aceptada — cuotas y datos para transferir",
        icon: "✅",
      },
      {
        id: EmailStructure.PAYMENT_RECEIVED,
        name: "Pago Recibido",
        description: "Confirmación de cada pago registrado",
        icon: "💰",
      },
      {
        id: EmailStructure.CUSTOMER_SATISFACTION_SURVEY,
        name: "Encuesta",
        description: "Invitación a opinar tras marcar el evento como realizado",
        icon: "📝",
      },
    ],
  },
  {
    id: "cobranza",
    name: "Ciclo de cobranza (máx. 3 avisos por cuota)",
    badge: "COBRANZA",
    badgeColor: "bg-amber-100 text-amber-800",
    emails: [
      {
        id: EmailStructure.PAYMENT_REMINDER,
        name: "Cuota por vencer",
        description: "3 días antes del vencimiento y el mismo día (avisos 1 y 2)",
        icon: "⏰",
      },
      {
        id: EmailStructure.PAYMENT_OVERDUE,
        name: "Cuota vencida",
        description: "Única insistencia, 7 días después de vencida (aviso 3)",
        icon: "⚠️",
      },
    ],
  },
];

// Correos al EQUIPO: siempre activos, sin interruptor (solo informan
// hacia adentro; apagarlos sería esconderse noticias propias).
export const equipoEmails: { name: string; description: string; icon: string }[] =
  [
    {
      name: "Nueva solicitud",
      description: "Cotización recibida por el link público",
      icon: "📧",
    },
    {
      name: "Comprobante del portal",
      description: "Un cliente subió un comprobante de transferencia",
      icon: "💸",
    },
    {
      name: "Respuesta de encuesta",
      description: "Nueva opinión de un cliente",
      icon: "📊",
    },
    {
      name: "Resumen semanal",
      description: "Lunes 11:00 — eventos de la semana y estado del negocio",
      icon: "🗞️",
    },
  ];
