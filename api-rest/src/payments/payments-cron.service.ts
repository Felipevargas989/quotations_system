import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PinoLogger } from 'nestjs-pino';
import { EmailService } from 'src/email/email.service';
import { PaymentReminderParams } from 'src/email/templates/paymentReminder/types';
import { EmailStructure } from 'src/email/types';
import { UserRole } from 'src/users/entities/user.entity';
import { UsersService } from 'src/users/users.service';
import { normalizeDateToUtc } from 'src/utils/dates';
import {
  OVERDUE_PAYMENTS_DAYS_NOTIFICATION,
  PaymentStatus,
  UPCOMING_OVERDUE_PAYMENTS_DAYS_NOTIFICATION,
} from './constants';
import { PaymentsRepository } from './payments.repository';

@Injectable()
export class PaymentsCronService {
  constructor(
    private readonly paymentsRepository: PaymentsRepository,
    private readonly emailService: EmailService,
    private readonly usersService: UsersService,
    private readonly logger: PinoLogger,
  ) {}

  async checkUpcomingOrOverduePayments(
    status: PaymentStatus,
    days: number | readonly number[],
    emailTemplate:
      | EmailStructure.PAYMENT_REMINDER
      | EmailStructure.PAYMENT_OVERDUE,
  ) {
    this.logger.info('CRON job to check upcoming or overdue payments');

    try {
      const dayOffsets = Array.isArray(days) ? [...days] : [days];
      const uniqueOffsets = [...new Set(dayOffsets)];

      const normalizedDueDates = uniqueOffsets.map((dayOffset) => {
        const dueDate = new Date();
        dueDate.setDate(dueDate.getDate() + dayOffset);
        return normalizeDateToUtc(dueDate);
      });

      const { data: payments } =
        await this.paymentsRepository.findAllPaymentsWithTransactions(
          undefined,
          [status],
          normalizedDueDates,
        );

      if (!payments.length) {
        this.logger.info(
          `No payments found for status ${status} and offsets ${uniqueOffsets.join(', ')}`,
        );
        return;
      }

      for (const payment of payments) {
        // Correos a personas y punto (30-07): la cobranza le escribe
        // SOLO al mandante; sin persona con correo, no sale nada al
        // cliente (el aviso admin de abajo va igual).
        const mandante = payment.quotations.mandante;
        const params: PaymentReminderParams = {
          clientName: mandante?.name || payment.quotations.clients.name,
          companyName: payment.quotations.companies.name,
          quotationId: payment.quotations.quotation_number.toString(),
          payment: {
            payment_number: payment.payment_number,
            amount: payment.amount,
            due_date: payment.due_date,
          },
        };

        if (!mandante?.email) {
          this.logger.warn(
            `Cobranza sin destinatario: cotización ${payment.quotations.quotation_number} sin mandante con correo`,
          );
        } else {
          await this.emailService.sendEmail(
            mandante.email,
            emailTemplate,
            params,
            payment.quotations.company_id,
            mandante.portal_token || null,
          );
        }

        const admins = await this.usersService.findAll(
          payment.quotations.company_id,
          UserRole.ADMINISTRADOR,
        );

        const adminEmails = admins.map((admin) => admin.email);
        if (!adminEmails.length) continue;

        await this.emailService.sendEmail(
          adminEmails,
          emailTemplate === EmailStructure.PAYMENT_REMINDER
            ? EmailStructure.PAYMENT_REMINDER_ADMIN
            : EmailStructure.PAYMENT_OVERDUE_ADMIN,
          params,
          payment.quotations.company_id,
        );
      }
    } catch (error) {
      this.logger.error(error);
      throw error;
    }
  }
  /**
   * Check all payments with status PENDIENTE and send reminders on configured days
   */
  @Cron(CronExpression.EVERY_DAY_AT_11AM)
  async checkUpcomingOverduePayments() {
    this.logger.info('CRON job to check upcoming overdue payments');

    await this.checkUpcomingOrOverduePayments(
      PaymentStatus.PENDIENTE,
      UPCOMING_OVERDUE_PAYMENTS_DAYS_NOTIFICATION,
      EmailStructure.PAYMENT_REMINDER,
    );
  }

  @Cron(CronExpression.EVERY_DAY_AT_11AM)
  async checkOverduePayments() {
    this.logger.info('CRON job to check overdue payments');

    await this.checkUpcomingOrOverduePayments(
      PaymentStatus.VENCIDO,
      OVERDUE_PAYMENTS_DAYS_NOTIFICATION,
      EmailStructure.PAYMENT_OVERDUE,
    );
  }
}
