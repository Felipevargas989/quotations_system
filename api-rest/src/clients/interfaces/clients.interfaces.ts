import { Client } from '../entities/client.entity';

export type CreateClient = Omit<Client, 'id' | 'created_at' | 'updated_at'>;
