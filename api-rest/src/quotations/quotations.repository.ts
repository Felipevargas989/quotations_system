import { Injectable } from '@nestjs/common';
import { SupabaseService } from 'src/supabase/supabase.service';
import { Quotation } from './entities/quotation.entity';
import { Company } from 'src/companies/entities/company.entity';

@Injectable()
export class QuotationsRepository {
  constructor(private readonly supabase: SupabaseService) {}

  async findAll(company_id: Company['id']): Promise<Quotation[]> {
    const { data, error } = await this.supabase.client
      .from('quotations')
      .select('*')
      .eq('company_id', company_id);
    if (error) throw error;
    return data as Quotation[];
  }
}
