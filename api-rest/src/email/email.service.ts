import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PinoLogger } from 'nestjs-pino';
import { Resend } from 'resend';
import { Quotation } from 'src/quotations/entities/quotation.entity';
import { newAccountTemplate } from './templates/newAccount';
import { newPublicQuotationTemplate } from './templates/newPublicQuotation';
import { paymentOverdueTemplate } from './templates/paymentOverdue/paymentOverdue';
import { paymentReminderTemplate } from './templates/paymentReminder/paymentReminder';
import { PaymentReminderParams } from './templates/paymentReminder/types';
import { quotationAcceptedTemplate } from './templates/quotationAccepted/quotationAccepted';
import { QuotationAcceptedParams } from './templates/quotationAccepted/types';
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
    to: string,
    emailStructure:
      | EmailStructure.NEW_ACCOUNT
      | EmailStructure.NEW_PUBLIC_QUOTATION_CLIENT,
  ): Promise<void>;

  /**
   * Sends an email with events (to multiple recipients)
   */
  async sendEmail(
    to: string[],
    emailStructure: EmailStructure.SOON_EVENTS,
    params: { events: Pick<Quotation, 'id' | 'event_date' | 'event_type'>[] },
  ): Promise<void>;

  /**
   * Sends payment reminder (to single recipient)
   */
  async sendEmail(
    to: string,
    emailStructure:
      | EmailStructure.PAYMENT_REMINDER
      | EmailStructure.PAYMENT_OVERDUE,
    params: PaymentReminderParams,
  ): Promise<void>;

  /**
   * Sends quotation is sent (to single recipient)
   */
  async sendEmail(
    to: string,
    emailStructure: EmailStructure.QUOTATION_IS_SENT,
    params: QuotationIsSentParams,
  ): Promise<void>;

  /**
   * Sends quotation accepted (to single recipient)
   */
  async sendEmail(
    to: string,
    emailStructure: EmailStructure.QUOTATION_ACCEPTED,
    params: QuotationAcceptedParams,
  ): Promise<void>;
  /**
   * Implementation
   */
  async sendEmail(
    to: string | string[],
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
        // TODO: move subject to a constants with key the emailStructure
        subject = 'Bienvenido a Eventia';
        sendTo = [to as string];
        html = newAccountTemplate();
        break;

      case EmailStructure.NEW_PUBLIC_QUOTATION_CLIENT:
        subject = 'Solicitud de cotización recibida';
        sendTo = [to as string];
        html = newPublicQuotationTemplate();
        break;

      case EmailStructure.SOON_EVENTS:
        subject = 'Tienes estos eventos en 3 días';
        sendTo = to as string[];
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        if (!params?.events) {
          throw new Error(
            'Events parameter is required for SOON_EVENTS template',
          );
        }
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument
        html = soonEventsTemplate(params.events);
        break;

      case EmailStructure.PAYMENT_REMINDER:
        subject = 'Recordatorio de Pago Pendiente';
        sendTo = [to as string];
        if (!params) {
          throw new Error('Params are required for PAYMENT_REMINDER template');
        }
        html = paymentReminderTemplate(params as PaymentReminderParams);
        break;

      case EmailStructure.PAYMENT_OVERDUE:
        subject = 'Recordatorio de Pago Vencido';
        sendTo = [to as string];
        if (!params) {
          throw new Error('Params are required for PAYMENT_OVERDUE template');
        }
        html = paymentOverdueTemplate(params as PaymentReminderParams);
        break;

      case EmailStructure.QUOTATION_IS_SENT:
        subject = 'Cotización enviada para su evento';
        sendTo = [to as string];
        if (!params) {
          throw new Error('Params are required for QUOTATION_IS_SENT template');
        }
        html = quotationIsSentTemplate(params as QuotationIsSentParams);
        break;

      case EmailStructure.QUOTATION_ACCEPTED:
        subject = 'Cotización aceptada para su evento';
        sendTo = [to as string];
        if (!params) {
          throw new Error(
            'Params are required for QUOTATION_ACCEPTED template',
          );
        }
        html = quotationAcceptedTemplate(params as QuotationAcceptedParams);
        break;
      default:
        throw new Error(`Unknown email structure: ${emailStructure}`);
    }

    this.logger.info(
      `Sending email to ${JSON.stringify(sendTo)} with subject ${subject}`,
    );

    await resend.emails.send({
      // TODO: move to a constants
      from: 'Eventia <hola@eventi-app.com>',
      to: sendTo,
      subject,
      html,
    });
  }
}
