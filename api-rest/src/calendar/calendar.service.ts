import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { Company } from 'src/companies/entities/company.entity';
import { QuotationsService } from 'src/quotations/quotations.service';
// import { CalendarRepository } from './calendar.repository';
import { FindAllEventsResponse } from './types';

@Injectable()
export class CalendarService {
  constructor(
    // private readonly calendarRepository: CalendarRepository,
    private readonly quotationsService: QuotationsService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(CalendarService.name);
  }

  async findAllEvents(companyId: Company['id']) {
    this.logger.info(`findAll events with companyId ${companyId}`);

    // 1. Find all quotations by dates and companyId
    const quotations = await this.quotationsService.findAll(companyId);

    // TODO: change name to model bcs logic has changed
    // 2. Find all blocked days by dates and companyId
    // const { data: blockedDays } =
    //   await this.calendarRepository.findAllBlockedDays(companyId);
    // 3. Aggregate all events
    const response: FindAllEventsResponse = {
      quotations,
      // blockedDays,
    };
    // 4. return all events
    return response;
  }
  // create(createCalendarDto: CreateCalendarDto) {
  //   return 'This action adds a new calendar';
  // }
  // findAll() {
  //   return `This action returns all calendar`;
  // }
  // findOne(id: number) {
  //   return `This action returns a #${id} calendar`;
  // }
  // update(id: number, updateCalendarDto: UpdateCalendarDto) {
  //   return `This action updates a #${id} calendar`;
  // }
  // remove(id: number) {
  //   return `This action removes a #${id} calendar`;
  // }
}
