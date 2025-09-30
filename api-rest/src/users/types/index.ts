import { Company } from 'src/companies/entities/company.entity';
import { User } from '../entities/user.entity';

export type CreateUser = Omit<User, 'id' | 'created_at' | 'updated_at'>;

export type UserWithCompany = User & {
  companies: {
    id: Company['id'];
    name: Company['name'];
    logo_url: Company['logo_url'];
  };
};
