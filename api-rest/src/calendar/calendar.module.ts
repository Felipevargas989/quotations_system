import { Module } from '@nestjs/common';
import { QuotationsModule } from 'src/quotations/quotations.module';
import { CalendarController } from './calendar.controller';
import { CalendarRepository } from './calendar.repository';
import { CalendarService } from './calendar.service';

@Module({
  imports: [QuotationsModule],
  controllers: [CalendarController],
  providers: [CalendarService, CalendarRepository],
})
export class CalendarModule {}
