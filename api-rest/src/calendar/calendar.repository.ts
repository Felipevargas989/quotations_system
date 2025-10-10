import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { Company } from 'src/companies/entities/company.entity';
import { SupabaseService } from 'src/supabase/supabase.service';
import { getEventDateUtc } from 'src/utils/dates';
import { CreateBlockedDayDto } from './dto/create-blocked-day.dto';

@Injectable()
export class CalendarRepository {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(CalendarRepository.name);
  }

  createBlockedDays(
    createBlockedDaysDto: CreateBlockedDayDto,
    companyId: Company['id'],
  ) {
    this.logger.info(
      `create blocked days with createBlockedDaysDto ${JSON.stringify(createBlockedDaysDto)}`,
      `and companyId ${companyId}`,
    );

    const payload = {
      date: getEventDateUtc(createBlockedDaysDto.date),
      company_id: companyId,
    };

    return this.supabase.client.from('blocked_days').insert(payload);
  }
}
