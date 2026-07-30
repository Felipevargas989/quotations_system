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
}
