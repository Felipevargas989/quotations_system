import { Person } from '../entities/person.entity';

export type CreatePerson = Omit<Person, 'id' | 'created_at' | 'updated_at'>;

/** La empresa no se cambia nunca. */
export type UpdatePerson = Omit<Partial<CreatePerson>, 'company_id'>;
