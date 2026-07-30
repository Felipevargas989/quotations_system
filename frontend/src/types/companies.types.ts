import { EmailStructure } from "./notifications";

// Datos de cobro de la empresa (migración 46): los leen los correos de
// cobranza y el portal del cliente (Fase 2).
export interface BankDetails {
  titular?: string;
  rut?: string;
  banco?: string;
  tipo_cuenta?: string;
  numero?: string;
  correo_pagos?: string;
}

export interface Company {
  id: number;
  name: string;
  created_at: string;
  logo_url?: string;
  // Subtítulo de marca bajo el nombre (ej: "Eventos & Banquetería").
  tagline?: string | null;
  colors?: {
    primary: string;
    secondary: string;
  };
  bank_details?: BankDetails | null;
  is_premium: boolean;
  notifications?: {
    emails?: {
      [key in EmailStructure]?: boolean;
    };
    // "Responder a" de los correos al cliente (punto medio 30-07).
    replyTo?: string | null;
  };
  currency: string;
}

export interface CompaniesResponse {
  data: Company[] | null;
  error: string | null;
}
