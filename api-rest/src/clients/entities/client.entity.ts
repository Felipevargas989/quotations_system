import { Company } from 'src/companies/entities/company.entity';

export class Client {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  client_type: string;
  address?: string;
  contact_person?: string;
  notes?: string;
  // Datos de facturación (migración 184): ver facturacion/datos-del-receptor.
  rut?: string | null;
  razon_social?: string | null;
  giro?: string | null;
  direccion_facturacion?: string | null;
  comuna?: string | null;
  ciudad?: string | null;
  correo_facturacion?: string | null;
  referencias_exigidas?: string[] | null;
  created_at: Date;
  updated_at: Date;
  company_id: Company['id'];
}
