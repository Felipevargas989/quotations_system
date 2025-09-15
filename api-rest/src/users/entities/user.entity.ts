import { Company } from 'src/companies/entities/company.entity';

// TODO: set real roles
export enum UserRole {
  ADMINISTRADOR = 'administrador',
  VENDEDOR = 'vendedor',
  OPERACIONES = 'operaciones',
  RECEPCION = 'recepcion',
}

export type UserAuth = {
  id: string;
  email: string;
};

export type User = {
  id: string;
  user_id: string;
  email: string;
  full_name: string;
  role: UserRole;
  created_at: Date;
  updated_at: Date;
  company_id: Company['id'];
};
