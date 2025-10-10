import { Controller, Get } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { CurrentUser } from 'src/auth';
import type { User } from 'src/users/entities/user.entity';
import { CalendarService } from './calendar.service';

@Controller('calendar')
export class CalendarController {
  constructor(
    private readonly calendarService: CalendarService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(CalendarController.name);
  }

  @Get('events')
  findAllEvents(@CurrentUser() user: User) {
    this.logger.info(`GET /calendar/events with user ${user.id}`);
    return this.calendarService.findAllEvents(user.company_id);
  }
}
