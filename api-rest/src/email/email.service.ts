import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PinoLogger } from 'nestjs-pino';
import { Resend } from 'resend';
import { Quotation } from 'src/quotations/entities/quotation.entity';
import { newAccountTemplate } from './templates/newAccount';
import { newPublicQuotationTemplate } from './templates/newPublicQuotation';
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
   * Sends an email with parameters (dynamic templates)
   */
  async sendEmail(
    to: string[],
    emailStructure: EmailStructure.SOON_EVENTS,
    params: { events: Pick<Quotation, 'id' | 'event_date' | 'event_type'>[] },
  ): Promise<void>;

  /**
   * Implementation
   */
  async sendEmail(
    to: string | string[],
    emailStructure: EmailStructure,
    params?: { events?: Pick<Quotation, 'id' | 'event_date' | 'event_type'>[] },
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
        subject = 'Eventos próximos';
        sendTo = to as string[];
        if (!params?.events) {
          throw new Error(
            'Events parameter is required for SOON_EVENTS template',
          );
        }
        html = soonEventsTemplate(params.events);
        break;

      default:
        throw new Error(`Unknown email structure: ${emailStructure}`);
    }

    this.logger.info(
      `Sending email to ${JSON.stringify(sendTo)} with subject ${subject}`,
    );

    await resend.emails.send({
      from: 'Eventia <hola@eventi-app.com>',
      to: sendTo,
      subject,
      html,
    });
  }
}
