import { Controller, Get } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { CurrentUser } from 'src/auth';
import { Derecho } from 'src/auth/derecho.decorator';
import { RECEPTION_AND_UP, Roles } from 'src/auth/roles.decorator';
import type { User } from 'src/users/entities/user.entity';
import { CalendarService } from './calendar.service';

// El Calendario entra desde el plan Gestiona y Cobra (paso 3.2,
// 14-09-2026). Recepción lo usa para responder "¿tienen el 20 libre?",
// pero solo si la empresa lo tiene contratado.
@Derecho('calendario')
@Controller('calendar')
export class CalendarController {
  constructor(
    private readonly calendarService: CalendarService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(CalendarController.name);
  }

  @Roles(...RECEPTION_AND_UP)
  @Get('events')
  findAllEvents(@CurrentUser() user: User) {
    this.logger.info(`GET /calendar/events with user ${user.id}`);
    return this.calendarService.findAllEvents(user.company_id);
  }
}
