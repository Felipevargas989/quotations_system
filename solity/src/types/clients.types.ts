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
}

export interface ClientFormData
  extends Omit<Client, "id" | "created_at" | "updated_at" | "company_id"> {}
