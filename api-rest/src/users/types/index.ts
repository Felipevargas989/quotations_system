import { User } from '../entities/user.entity';

export type CreateUser = Omit<User, 'id' | 'created_at' | 'updated_at'>;
