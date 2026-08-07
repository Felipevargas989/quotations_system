import { QuotationFollowup } from '../entities/quotation-followup.entity';

// Lo que el SERVICE arma para insertar: identidad (empresa + autor)
// puesta por el servidor, nunca por el body.
export type CreateFollowupPayload = Pick<
  QuotationFollowup,
  | 'company_id'
  | 'quotation_id'
  | 'author_user_id'
  | 'author_name'
  | 'note'
  | 'tipo'
  | 'next_contact_date'
>;

// La edición solo toca el contenido; updated_at lo pone el service.
export type UpdateFollowupPayload = Partial<
  Pick<
    QuotationFollowup,
    'note' | 'tipo' | 'next_contact_date' | 'next_contact_done_at'
  >
> & { updated_at: string };

// Fila mínima para el semáforo de la lista (ver findMapRows).
export type FollowupMapRow = Pick<
  QuotationFollowup,
  | 'quotation_id'
  | 'created_at'
  | 'next_contact_date'
  // Sin esto el tablero no puede distinguir un pendiente vivo de uno
  // ya cumplido, y el aviso ámbar quedaría encendido para siempre.
  | 'next_contact_done_at'
>;
