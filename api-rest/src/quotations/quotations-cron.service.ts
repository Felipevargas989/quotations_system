import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PinoLogger } from 'nestjs-pino';
import { EmailService } from 'src/email/email.service';
import { EmailStructure } from 'src/email/types';
import { UserRole } from 'src/users/entities/user.entity';
import { UsersService } from 'src/users/users.service';
import { QuotationStatus, RequestType } from './constants/constants';
import { Quotation } from './entities/quotation.entity';
import { QuotationsRepository } from './quotations.repository';

/**
 * Service responsible for scheduling and executing quotation-related cron jobs.
 * This service keeps scheduled tasks separate from business logic.
 */
@Injectable()
export class QuotationsCronService {
  constructor(
    private readonly quotationsRepository: QuotationsRepository,
    private readonly usersService: UsersService,
    private readonly emailService: EmailService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(QuotationsCronService.name);
  }
  @Cron(CronExpression.EVERY_10_SECONDS)
  async checkSoonEvents() {
    this.logger.info('CRON job: Checking for soon events');

    try {
      // get event date 3 days from now
      const eventDate = new Date();
      eventDate.setDate(eventDate.getDate() + 3);

      // 1. Get all quotations events
      const soonEvents = await this.quotationsRepository.findAll({
        company_id: undefined,
        statuses: [QuotationStatus.ACEPTADA],
        request_type: RequestType.COTIZACION,
        // TODO: add event date filter
        // event_date: eventDate.toISOString(),
      });

      // 2. Group by company_id
      const soonEventsByCompany = soonEvents.reduce(
        (acc, event) => {
          acc[event.company_id] = acc[event.company_id] || [];
          acc[event.company_id].push(event);
          return acc;
        },
        {} as Record<number, Quotation[]>,
      );

      // (optional filter)
      const filteredCompanies = Object.entries(soonEventsByCompany).filter(
        ([companyId]) => Number.parseInt(companyId) === 3,
      );

      // 3. Loop properly with await
      for (const [companyId, events] of filteredCompanies) {
        const admins = await this.usersService.findAll(
          Number.parseInt(companyId),
          UserRole.ADMINISTRADOR,
        );

        const adminEmails = admins.map((admin) => admin.email);

        if (!adminEmails.length) continue;

        // Send the email
        await this.emailService.sendEmail(
          adminEmails,
          EmailStructure.SOON_EVENTS,
          {
            events: events.map((event) => ({
              id: event.id,
              event_date: event.event_date,
            })),
          },
        );
      }
    } catch (error) {
      this.logger.error('Error checking soon events:', error);
      throw error;
    }
  }
}
