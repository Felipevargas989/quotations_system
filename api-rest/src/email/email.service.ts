import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PinoLogger } from 'nestjs-pino';
import { Resend } from 'resend';
import { Quotation } from 'src/quotations/entities/quotation.entity';
import { EMAIL_FROM, EMAIL_SUBJECTS } from './constants';
import { newAccountTemplate } from './templates/newAccount';
import { newPublicQuotationTemplate } from './templates/newPublicQuotation';
import { paymentOverdueTemplate } from './templates/paymentOverdue/paymentOverdue';
import { paymentPlanCreatedTemplate } from './templates/paymentPlanCreated/paymentPlanCreated';
import { PaymentPlanCreatedParams } from './templates/paymentPlanCreated/types';
import { paymentReceivedTemplate } from './templates/paymentReceived/paymentReceived';
import { PaymentReceivedParams } from './templates/paymentReceived/types';
import { paymentReminderTemplate } from './templates/paymentReminder/paymentReminder';
import { PaymentReminderParams } from './templates/paymentReminder/types';
import { quotationIsSentTemplate } from './templates/quotationIsSent/quotationIsSent';
import { QuotationIsSentParams } from './templates/quotationIsSent/types';
import { soonEventsTemplate } from './templates/soonEvents';
import { EmailStructure } from './types';

@Injectable()
export class EmailService {
  constructor(
    private readonly configService: ConfigService,
    private readonly logger: PinoLogger,
  ) {}

  /**
   * Sends an email without parameters (static templates)
   */
  async sendEmail(
    to: string | undefined | null,
    emailStructure:
      | EmailStructure.NEW_ACCOUNT
      | EmailStructure.NEW_PUBLIC_QUOTATION_CLIENT,
  ): Promise<void>;

  /**
   * Sends an email with events (to multiple recipients)
   */
  async sendEmail(
    to: (string | undefined | null)[] | undefined | null,
    emailStructure: EmailStructure.SOON_EVENTS,
    params: { events: Pick<Quotation, 'id' | 'event_date' | 'event_type'>[] },
  ): Promise<void>;

  /**
   * Sends payment reminder (to single recipient)
   */
  async sendEmail(
    to: string | undefined | null,
    emailStructure:
      | EmailStructure.PAYMENT_REMINDER
      | EmailStructure.PAYMENT_OVERDUE,
    params: PaymentReminderParams,
  ): Promise<void>;

  /**
   * Sends quotation is sent (to single recipient)
   */
  async sendEmail(
    to: string | undefined | null,
    emailStructure: EmailStructure.QUOTATION_IS_SENT,
    params: QuotationIsSentParams,
  ): Promise<void>;

  /**
   * Sends payment plan created (to single recipient)
   */
  async sendEmail(
    to: string | undefined | null,
    emailStructure: EmailStructure.PAYMENT_PLAN_CREATED,
    params: PaymentPlanCreatedParams,
  ): Promise<void>;

  /**
   * Sends payment received confirmation (to single recipient)
   */
  async sendEmail(
    to: string | undefined | null,
    emailStructure: EmailStructure.PAYMENT_RECEIVED,
    params: PaymentReceivedParams,
  ): Promise<void>;
  /**
   * Implementation
   */
  async sendEmail(
    to: string | undefined | null | (string | undefined | null)[],
    emailStructure: EmailStructure,
    params?: any,
  ): Promise<void> {
    const resend = new Resend(
      this.configService.get<string>('RESEND_API_KEY') as string,
    );

    let subject: string;
    let html: string;
    let sendTo: string[];

    // Build email content based on template type
    switch (emailStructure) {
      case EmailStructure.NEW_ACCOUNT:
        subject = EMAIL_SUBJECTS[EmailStructure.NEW_ACCOUNT];
        sendTo = [to as string];
        html = newAccountTemplate();
        break;

      case EmailStructure.NEW_PUBLIC_QUOTATION_CLIENT:
        subject = EMAIL_SUBJECTS[EmailStructure.NEW_PUBLIC_QUOTATION_CLIENT];
        sendTo = [to as string];
        html = newPublicQuotationTemplate();
        break;

      case EmailStructure.SOON_EVENTS:
        subject = EMAIL_SUBJECTS[EmailStructure.SOON_EVENTS];
        sendTo = to as string[];
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        if (!params?.events) {
          throw new Error(
            'Events parameter is required for SOON_EVENTS template',
          );
        }
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        html = soonEventsTemplate(params.events);
        break;

      case EmailStructure.PAYMENT_REMINDER:
        subject = EMAIL_SUBJECTS[EmailStructure.PAYMENT_REMINDER];
        sendTo = [to as string];
        if (!params) {
          throw new Error('Params are required for PAYMENT_REMINDER template');
        }
        html = paymentReminderTemplate(params as PaymentReminderParams);
        break;

      case EmailStructure.PAYMENT_OVERDUE:
        subject = EMAIL_SUBJECTS[EmailStructure.PAYMENT_OVERDUE];
        sendTo = [to as string];
        if (!params) {
          throw new Error('Params are required for PAYMENT_OVERDUE template');
        }
        html = paymentOverdueTemplate(params as PaymentReminderParams);
        break;

      case EmailStructure.QUOTATION_IS_SENT:
        subject = EMAIL_SUBJECTS[EmailStructure.QUOTATION_IS_SENT];
        sendTo = [to as string];
        if (!params) {
          throw new Error('Params are required for QUOTATION_IS_SENT template');
        }
        html = quotationIsSentTemplate(params as QuotationIsSentParams);
        break;

      case EmailStructure.PAYMENT_PLAN_CREATED:
        subject = EMAIL_SUBJECTS[EmailStructure.PAYMENT_PLAN_CREATED];
        sendTo = [to as string];
        if (!params) {
          throw new Error(
            'Params are required for PAYMENT_PLAN_CREATED template',
          );
        }
        html = paymentPlanCreatedTemplate(params as PaymentPlanCreatedParams);
        break;

      case EmailStructure.PAYMENT_RECEIVED:
        subject = EMAIL_SUBJECTS[EmailStructure.PAYMENT_RECEIVED];
        sendTo = [to as string];
        if (!params) {
          throw new Error('Params are required for PAYMENT_RECEIVED template');
        }
        html = paymentReceivedTemplate(params as PaymentReceivedParams);
        break;
      default:
        throw new Error(`Unknown email structure: ${emailStructure}`);
    }

    this.logger.info(
      `Sending email to ${JSON.stringify(sendTo)} with subject ${subject}`,
    );

    if (!to) {
      this.logger.warn('No email provided');
      return;
    }

    await resend.emails.send({
      from: EMAIL_FROM,
      to: sendTo,
      subject,
      html,
    });
  }
}
