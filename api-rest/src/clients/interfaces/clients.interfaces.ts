import { Client } from '../entities/client.entity';

export type CreateClient = Omit<Client, 'id' | 'created_at' | 'updated_at'>;

// avoid update company_id
export type UpdateClient = Omit<Partial<CreateClient>, 'company_id'>;
