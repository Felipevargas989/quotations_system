import { EmailStructure } from 'src/email/types';

export class Company {
  id: number;
  name: string;
  logo_url?: string;
  // Subtítulo de marca: aparece bajo el nombre en los correos
  // (ej: "Eventos & Banquetería"). Migración 46.
  tagline?: string | null;
  colors?: {
    primary: string;
    secondary: string;
  };
  // Migración 60: umbral de cotización de alto valor (💎 en el
  // tablero). NULL o 0 = sin marca.
  high_value_threshold?: number | null;
  // Migraciones 95 y 96: marca para los correos de marketing. Vacío =
  // esa pieza no aparece. El banner (96) reemplaza el encabezado.
  banner_url?: string | null;
  whatsapp?: string | null;
  instagram?: string | null;
  facebook?: string | null;
  sitio_web?: string | null;
  // Migración 111 (14-09-2026): módulos que no se venden y que esta
  // empresa tiene encendidos ('personal', 'marketing'). Solo Valle del Sol.
  modulos_propios?: string[];
  // Datos de cobro: los leen los correos de cobranza y el portal del
  // cliente (Fase 2). Migración 46.
  bank_details?: {
    titular?: string;
    rut?: string;
    banco?: string;
    tipo_cuenta?: string;
    numero?: string;
    correo_pagos?: string;
  } | null;
  notifications?: {
    emails: {
      [key in EmailStructure]: boolean;
    };
    /** "Responder a" de los correos al cliente (punto medio 30-07). */
    replyTo?: string | null;
  };
  currency: string;
  is_active: boolean;
  // Migración 112 (14-09-2026): el plan contratado y en qué estado está.
  // El código NO los consulta directo — los traduce `auth/derechos.ts` a
  // una lista de derechos, y todo el sistema pregunta por el derecho.
  plan?: 'cotiza' | 'gestiona' | 'crece';
  estado_plan?: 'prueba' | 'activo' | 'moroso' | 'bloqueado';
  /** Cuándo termina la prueba gratis. Null si ya no está en prueba. */
  prueba_vence?: string | null;
  plan_cambiado_en?: string;
  // Migración 116 (18-09-2026): por qué canal llegó el registro. La
  // etiqueta la decide el motor (quotations/origen-del-lead.ts). NULL =
  // no se sabe (anterior a la 116, o creada a mano desde la Torre).
  origen?: string | null;
  origen_detalle?: Record<string, string> | null;
}
