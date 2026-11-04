import { Company } from "./companies.types";

export interface Client {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  client_type: string;
  address?: string;
  contact_person?: string;
  notes?: string;
  created_at: Date;
  updated_at: Date;
  company_id: Company["id"];
  /** Cotizaciones vinculadas (lo entrega el backend). Un cliente con
   *  cotizaciones NO se puede eliminar. */
  quotation_count?: number;
  /** Estados de esas cotizaciones (mismo orden que el embed del backend).
   *  Alimenta el filtro de segmentos comerciales de Gestión de Clientes. */
  quotation_statuses?: string[];
  /** Personas del cliente (embed del backend). La PRINCIPAL es la fuente
   *  de verdad para mostrar contacto en la lista; el espejo de la ficha
   *  (contact_person/email/phone) queda solo de respaldo. */
  client_contacts?: {
    id: number;
    name: string;
    email?: string | null;
    phone?: string | null;
    is_primary?: boolean;
  }[];
}

export interface ClientFormData
  extends Omit<
    Client,
    | "id"
    | "created_at"
    | "updated_at"
    | "company_id"
    | "quotation_count"
    | "quotation_statuses"
    | "client_contacts"
  > {
  /** Correo/teléfono de la persona principal al CREAR un cliente: el
   *  backend los usa para sembrarla (garantía de nacimiento, 31-07). */
  contact_email?: string | null;
  contact_phone?: string | null;
}
