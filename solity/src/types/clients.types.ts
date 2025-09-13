export interface Client {
  id: string;
  name: string;
  email: string;
  phone: string;
  client_type: string;
  address: string;
  contact_person: string;
  notes: string;
  company_id: string;
  created_at: string;
  updated_at: string;
}

export interface ClientFormData
  extends Omit<Client, "id" | "created_at" | "updated_at" | "company_id"> {}
