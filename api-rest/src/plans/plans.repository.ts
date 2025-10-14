import { Injectable } from '@nestjs/common';
import { PostgrestError } from '@supabase/supabase-js';
import { PinoLogger } from 'nestjs-pino';
import { Company } from 'src/companies/entities/company.entity';
import { SupabaseService } from 'src/supabase/supabase.service';
@Injectable()
export class PlansRepository {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly logger: PinoLogger,
  ) {}
  async confirmPlan(companyId: Company['id']): Promise<{
    data: Company | null;
    error: PostgrestError | null;
  }> {
    this.logger.info(`confirmPlan with companyId ${companyId}`);
    return await this.supabase.client
      .from('companies')
      .update({
        is_premium: true,
      })
      .eq('id', companyId);
  }
}
