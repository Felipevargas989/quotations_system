import { Body, Controller, Get, Post } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { CurrentUser } from 'src/auth';
import type { User } from 'src/users/entities/user.entity';
import { CalendarService } from './calendar.service';
import { CreateBlockedDayDto } from './dto/create-blocked-day.dto';

@Controller('calendar')
export class CalendarController {
  constructor(
    private readonly calendarService: CalendarService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(CalendarController.name);
  }
  @Post('blocked-days')
  createBlockedDays(
    @Body() createBlockedDaysDto: CreateBlockedDayDto,
    @CurrentUser() user: User,
  ) {
    this.logger.info(
      `POST /calendar/blocked-days with createBlockedDaysDto ${JSON.stringify(createBlockedDaysDto)}`,
    );
    return this.calendarService.createBlockedDays(
      createBlockedDaysDto,
      user.company_id,
    );
  }

  @Get('events')
  findAllEvents(@CurrentUser() user: User) {
    this.logger.info(`GET /calendar/events with user ${user.id}`);
    return this.calendarService.findAllEvents(user.company_id);
  }
}
