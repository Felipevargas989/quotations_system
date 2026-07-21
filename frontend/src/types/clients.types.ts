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
}

export interface ClientFormData
  extends Omit<
    Client,
    "id" | "created_at" | "updated_at" | "company_id" | "quotation_count"
  > {}
