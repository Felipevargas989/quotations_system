import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { Company } from 'src/companies/entities/company.entity';
import { CalendarRepository } from './calendar.repository';
import { CreateBlockedDayDto } from './dto/create-blocked-day.dto';

@Injectable()
export class CalendarService {
  constructor(
    private readonly calendarRepository: CalendarRepository,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(CalendarService.name);
  }
  async createBlockedDays(
    createBlockedDaysDto: CreateBlockedDayDto,
    companyId: Company['id'],
  ) {
    this.logger.info(
      `create blocked days with createBlockedDaysDto ${JSON.stringify(createBlockedDaysDto)} and companyId ${companyId}`,
    );
    try {
      return await this.calendarRepository.createBlockedDays(
        createBlockedDaysDto,
        companyId,
      );
    } catch (error) {
      this.logger.error(error);
      throw error;
    }
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
