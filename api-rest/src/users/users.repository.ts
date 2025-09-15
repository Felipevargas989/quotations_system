import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { Company } from 'src/companies/entities/company.entity';
import { SupabaseService } from 'src/supabase/supabase.service';
import { User } from './entities/user.entity';

@Injectable()
export class UsersRepository {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(UsersRepository.name);
  }

  async findOne(id: string): Promise<User> {
    const { data, error } = await this.supabase.client
      .from('user_profiles')
      .select('*')
      .eq('user_id', id)
      .single();

    if (error) throw error;
    return data as User;
  }

  async findAll(companyId: Company['id']) {
    this.logger.info(`findAll users with companyId ${companyId}`);
    const { data, error } = await this.supabase.client
      .from('user_profiles')
      .select('*')
      .eq('company_id', companyId);
    if (error) throw error;
    return data as User[];
  }
}
