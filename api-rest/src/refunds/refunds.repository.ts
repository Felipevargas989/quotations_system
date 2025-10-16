import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { Company } from 'src/companies/entities/company.entity';
import { SupabaseService } from 'src/supabase/supabase.service';
import { CreateRefundPayload } from './types';

@Injectable()
export class RefundsRepository {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(RefundsRepository.name);
  }

  create(refund: CreateRefundPayload) {
    this.logger.info(
      `create refund with refund params ${JSON.stringify(refund)}`,
    );
    return this.supabase.client
      .from('refunds')
      .insert(refund)
      .select()
      .single();
  }

  findAll(companyId: Company['id']) {
    this.logger.info(`findAll refunds with companyId ${companyId}`);
    return this.supabase.client
      .from('refunds')
      .select(
        `
        *,
        quotations (
          id,
          quotation_number,
          clients (
            id,
            name
          )
        )
      `,
      )
      .eq('quotations.company_id', companyId)
      .order('created_at', { ascending: false });
  }
}
