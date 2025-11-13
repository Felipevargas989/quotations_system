import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PinoLogger } from 'nestjs-pino';
import { EmailService } from 'src/email/email.service';
import { EmailStructure } from 'src/email/types';
import { UserRole } from 'src/users/entities/user.entity';
import { UsersService } from 'src/users/users.service';
import { normalizeDateToUtc } from 'src/utils/dates';
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
  @Cron(CronExpression.EVERY_DAY_AT_9AM)
  async checkSoonEvents() {
    this.logger.info('CRON job: Checking for soon events');

    try {
      // get event date 3 days from now
      const eventDate = new Date();
      eventDate.setDate(eventDate.getDate() + 3);

      // Normalize date
      const normalizedEventDate = normalizeDateToUtc(eventDate);

      // 1. Get all quotations events
      const soonEvents = await this.quotationsRepository.findAll({
        company_id: undefined,
        statuses: [QuotationStatus.ACEPTADA],
        request_type: RequestType.COTIZACION,
        event_date: normalizedEventDate,
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

      // 3. Loop properly with await
      for (const [companyId, events] of Object.entries(soonEventsByCompany)) {
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
              event_type: event.event_type,
            })),
          },
        );
      }
    } catch (error) {
      this.logger.error('Error checking soon events:', error);
      throw error;
    }
  }

  @Cron(CronExpression.EVERY_DAY_AT_9AM)
  async checkEventsForSurvey() {
    this.logger.info('CRON job: Checking for quotations for survey');

    try {
      // get event date 3 days ago
      const eventDate = new Date();
      eventDate.setUTCDate(eventDate.getUTCDate() - 3);
      // Normalize date
      const normalizedEventDate = normalizeDateToUtc(eventDate);

      const doneEvents = await this.quotationsRepository.findAll({
        company_id: undefined,
        statuses: [QuotationStatus.ACEPTADA],
        request_type: RequestType.COTIZACION,
        event_date: normalizedEventDate,
      });

      // 3. Loop properly with await
      for (const event of doneEvents) {
        // Send the email
        await this.emailService.sendEmail(
          event.clients.email,
          EmailStructure.CUSTOMER_SATISFACTION_SURVEY,
          {
            clientName: event.clients.name,
            companyName: event.companies.name,
            companyId: event.company_id,
            quotationId: event.id,
          },
          event.company_id,
        );
      }
    } catch (error) {
      this.logger.error('Error checking quotations for survey:', error);
      throw error;
    }
  }

  @Cron(CronExpression.MONDAY_TO_FRIDAY_AT_09_30AM)
  async checkQuotationStatuses() {
    this.logger.info('CRON job: Checking quotation statuses');
    try {
      // get all quotations with status SOLICITADA
      const quotations = await this.quotationsRepository.findAll({
        company_id: undefined,
        statuses: [
          QuotationStatus.SOLICITADA,
          QuotationStatus.ENVIADA,
          QuotationStatus.EN_NEGOCIACION,
        ],
      });

      // Build summary per company
      const quotationsSummaryByCompany = quotations.reduce<
        Record<
          number,
          {
            companyName?: string;
            statusCounts: Partial<Record<QuotationStatus, number>>;
            total: number;
          }
        >
      >((acc, quotation) => {
        const {
          company_id: companyId,
          quotation_status,
          companies,
        } = quotation;

        if (!acc[companyId]) {
          acc[companyId] = {
            companyName: companies?.name,
            statusCounts: {},
            total: 0,
          };
        }

        const summary = acc[companyId];
        summary.statusCounts[quotation_status] =
          (summary.statusCounts[quotation_status] || 0) + 1;
        summary.total += 1;

        return acc;
      }, {});

      // loop through summary and send email to company admins
      for (const [companyId, summary] of Object.entries(
        quotationsSummaryByCompany,
      )) {
        if (!summary.total) continue;

        if (Number.parseInt(companyId) !== 3) continue;

        const admins = await this.usersService.findAll(
          Number.parseInt(companyId),
          UserRole.ADMINISTRADOR,
        );
        const adminEmails = admins.map((admin) => admin.email);
        if (!adminEmails.length) continue;

        // send email to company admins
        await this.emailService.sendEmail(
          adminEmails,
          EmailStructure.QUOTATION_STATUS_CHECK,
          {
            companyId: Number.parseInt(companyId, 10),
            companyName: summary.companyName,
            statusCounts: summary.statusCounts,
            totalQuotations: summary.total,
          },
        );
      }
    } catch (error) {
      this.logger.error('Error checking quotation statuses:', error);
      throw error;
    }
  }
}
