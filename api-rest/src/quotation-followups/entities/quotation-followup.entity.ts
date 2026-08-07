import { Company } from 'src/companies/entities/company.entity';
import { Quotation } from 'src/quotations/entities/quotation.entity';

// Bitácora comercial (03-08): cada fila es una nota de seguimiento de
// venta sobre una cotización (llamé, mandé correo, quedamos en...).
// El autor queda CONGELADO al escribir (author_name), para que la
// historia no se reescriba si el usuario cambia de nombre o se va.
export class QuotationFollowup {
  id: number;
  created_at: string;
  updated_at: string | null;
  company_id: Company['id'];
  quotation_id: Quotation['id'];
  author_user_id: string | null;
  author_name: string | null;
  note: string;
  tipo: string | null;
  next_contact_date: string | null;
  // Cuándo se dio por cumplido ese próximo contacto (migración 65).
  // NULL con next_contact_date ya vencida = pendiente: es lo que
  // enciende el aviso ámbar en Post-Venta.
  next_contact_done_at: string | null;
}
