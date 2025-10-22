import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PinoLogger } from 'nestjs-pino';
import { EmailService } from 'src/email/email.service';
import { PaymentReminderParams } from 'src/email/templates/paymentReminder/types';
import { EmailStructure } from 'src/email/types';
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
    private readonly logger: PinoLogger,
  ) {}

  async checkUpcomingOrOverduePayments(
    status: PaymentStatus,
    days: number,
    emailTemplate:
      | EmailStructure.PAYMENT_REMINDER
      | EmailStructure.PAYMENT_OVERDUE,
  ) {
    this.logger.info('CRON job to check upcoming or overdue payments');

    try {
      // set due date in 4 days from now
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + days);

      // Normalize date
      const normalizedDueDate = normalizeDateToUtc(dueDate);

      //  get all payments with status PENDIENTE and due_date in the next X days
      const { data: payments } =
        await this.paymentsRepository.findAllPaymentsWithTransactions(
          undefined,
          [status],
          normalizedDueDate,
        );
      // for each payment, send an email to the client with the payments details
      for (const payment of payments) {
        const params: PaymentReminderParams = {
          clientName: payment.quotations.clients.name,
          companyName: payment.quotations.companies.name,
          quotationId: payment.quotations.quotation_number.toString(),
          payment: {
            payment_number: payment.payment_number,
            amount: payment.amount,
            due_date: payment.due_date,
          },
        };

        await this.emailService.sendEmail(
          payment.quotations.clients.email,
          emailTemplate,
          params,
        );
      }
    } catch (error) {
      this.logger.error(error);
      throw error;
    }
  }
  /**
   * Check all payments with status PENDIENTE and due_date in the next 4 days
   * and send an email to the client with the payments details
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
