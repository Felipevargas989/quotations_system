import { Injectable } from '@nestjs/common';
import { PostgrestError } from '@supabase/supabase-js';
import { PinoLogger } from 'nestjs-pino';
import { SupabaseService } from 'src/supabase/supabase.service';
import { Company } from './entities/company.entity';

@Injectable()
export class CompaniesRepository {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(CompaniesRepository.name);
  }

  async create(company: Omit<Company, 'id'>): Promise<{
    data: Company | null;
    error: PostgrestError | null;
  }> {
    this.logger.info(
      `create company with company params ${JSON.stringify(company)}`,
    );
    return await this.supabase.client
      .from('companies')
      .insert([company])
      .select()
      .single();
  }
}
