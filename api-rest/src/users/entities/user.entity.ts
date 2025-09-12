// TODO: set real roles
export enum UserRole {
  ADMIN = 'admin',
  USER = 'user',
}

export interface User {
  id: string;
  user_id: string;
  email: string;
  full_name: string;
  role: UserRole;
  created_at: Date;
  updated_at: Date;
  company_id: number;
}
