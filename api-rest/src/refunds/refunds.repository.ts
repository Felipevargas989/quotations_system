import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
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
}
