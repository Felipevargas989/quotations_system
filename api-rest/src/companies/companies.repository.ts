import { Injectable } from '@nestjs/common';
import { PostgrestError } from '@supabase/supabase-js';
import { PinoLogger } from 'nestjs-pino';
import { SupabaseService } from 'src/supabase/supabase.service';
import { UpdateCompanyDto } from './dto/update-company.dto';
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

  async findOne(id: Company['id']): Promise<{
    data: Company | null;
    error: PostgrestError | null;
  }> {
    this.logger.info(`findOne company with id ${id}`);
    return await this.supabase.client
      .from('companies')
      .select('*')
      .eq('id', id)
      .single();
  }

  async update(
    id: Company['id'],
    updateCompanyDto: UpdateCompanyDto,
  ): Promise<{
    data: Company | null;
    error: PostgrestError | null;
  }> {
    this.logger.info(
      `update company with id ${id} and updateCompanyDto ${JSON.stringify(updateCompanyDto)}`,
    );
    return await this.supabase.client
      .from('companies')
      .update(updateCompanyDto)
      .eq('id', id)
      .select()
      .single();
  }
}
