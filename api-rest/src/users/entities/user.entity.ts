import type { Derecho, EstadoPlan, Plan } from 'src/auth/derechos';
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
  // Lo que AuthGuard cuelga de la sesión con los derechos de la empresa
  // (paso 3.2, 14-09-2026). Van opcionales porque los tests y algunos
  // caminos internos arman un User a mano; quien los use tiene que
  // aguantar que vengan vacíos.
  derechos?: Derecho[];
  usuarios_max?: number | null;
  cotizaciones_mes?: number | null;
  plan?: Plan | null;
  estado_plan?: EstadoPlan | null;
};
