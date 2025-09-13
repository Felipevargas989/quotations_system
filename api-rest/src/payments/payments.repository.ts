import { Injectable } from '@nestjs/common';
import { Company } from 'src/companies/entities/company.entity';
import { Quotation } from 'src/quotations/entities/quotation.entity';
import { SupabaseService } from 'src/supabase/supabase.service';

@Injectable()
export class PaymentsRepository {
  constructor(private readonly supabase: SupabaseService) {}
  async findAllPaymentsFromQuotation(
    quotationId: Quotation['id'],
    companyId: Company['id'],
  ) {
    return this.supabase.client
      .from('payments')
      .select('*')
      .eq('company_id', companyId)
      .eq('quotation_id', quotationId);
  }
}
