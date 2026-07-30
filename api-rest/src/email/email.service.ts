import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PinoLogger } from 'nestjs-pino';
import { Resend } from 'resend';
import { CompaniesRepository } from 'src/companies/companies.repository';
import { Company } from 'src/companies/entities/company.entity';
import { Quotation } from 'src/quotations/entities/quotation.entity';
import { EMAIL_FROM, EMAIL_SUBJECTS, EMAILS_SEND_TO_CLIENT } from './constants';
import { EmailBranding, fmtCLP } from './templates/brandLayout';
import { customerSatisfactionSurveyTemplate } from './templates/customerSatisfactionSurvey/template';
import { CustomerSatisfactionSurveyParams } from './templates/customerSatisfactionSurvey/types';
import { newAccountTemplate } from './templates/newAccount';
import { newAnswerCustomerSatisfactionSurveyTemplate } from './templates/newAnswerCustomerSatisfactionSurvey/template';
import { NewAnswerCustomerSatisfactionSurveyParams } from './templates/newAnswerCustomerSatisfactionSurvey/types';
import { newPublicQuotationAdminTemplate } from './templates/newPublicQuotationCreated/forAdmin';
import { newPublicQuotationClientTemplate } from './templates/newPublicQuotationCreated/forClient';
import { paymentOverdueTemplate } from './templates/paymentOverdue/paymentOverdue';
import { paymentOverdueAdminTemplate } from './templates/paymentOverdue/paymentOverdueAdmin';
import { paymentPlanCreatedTemplate } from './templates/paymentPlanCreated/paymentPlanCreated';
import { PaymentPlanCreatedParams } from './templates/paymentPlanCreated/types';
import { paymentReceivedTemplate } from './templates/paymentReceived/paymentReceived';
import { PaymentReceivedParams } from './templates/paymentReceived/types';
import {
  daysToDue,
  paymentReminderTemplate,
} from './templates/paymentReminder/paymentReminder';
import { paymentReminderAdminTemplate } from './templates/paymentReminder/paymentReminderAmin';
import { PaymentReminderParams } from './templates/paymentReminder/types';
import { quotationIsSentTemplate } from './templates/quotationIsSent/quotationIsSent';
import { QuotationIsSentParams } from './templates/quotationIsSent/types';
import { quotationStatusCheckTemplate } from './templates/quotationStatusCheck/template';
import { QuotationStatusCheckParams } from './templates/quotationStatusCheck/types';
import { soonEventsTemplate } from './templates/soonEvents';
import { superAdminNotificationTemplate } from './templates/superAdminNotification';
import { WeeklyAnalyticsParams } from './templates/weekly_analytics/types';
import { weeklyAnalyticsTemplate } from './templates/weekly_analytics/weekly_analytics';
import { EmailStructure } from './types';

@Injectable()
export class EmailService {
  constructor(
    private readonly configService: ConfigService,
    private readonly companiesRepository: CompaniesRepository,
    private readonly logger: PinoLogger,
  ) {}

  /**
   * Checks if an email should be sent based on company notification settings
   * @param emailStructure - The type of email being sent
   * @param companyId - The company ID to check settings for
   * @returns Promise<boolean> - true if email should be sent, false otherwise
   */
  private async shouldSendEmail(
    emailStructure: EmailStructure,
    companyId: Company['id'],
  ): Promise<boolean> {
    const { data: company, error: companyError } =
      await this.companiesRepository.findOne(companyId);

    if (companyError) {
      this.logger.error(`Failed to get company: ${companyError.message}`);
      return false;
    }

    if (!company) {
      this.logger.warn(`Company with id ${companyId} not found`);
      return false;
    }

    // If company has no notifications configuration, do not send email (default behavior)
    if (!company.notifications?.emails) {
      this.logger.info(
        `Company ${companyId} has no email notifications configured, allowing email ${emailStructure}`,
      );
      return false;
    }

    const emailNotifications = company.notifications.emails;

    // Check if this specific email type is disabled
    if (emailNotifications[emailStructure] === false) {
      this.logger.warn(
        `Email ${emailStructure} is disabled for company ${companyId}`,
      );
      return false;
    }

    this.logger.info(
      `Email ${emailStructure} is enabled for company ${companyId}`,
    );
    return true;
  }

  /**
   * Marca de la empresa para los correos al cliente (rediseño 29-07):
   * nombre, subtítulo, logo, color primario y datos de cobro. Si la
   * carga falla, el correo sale igual con la marca mínima.
   */
  private async getBranding(
    companyId: Company['id'],
    fallbackName?: string,
  ): Promise<EmailBranding> {
    try {
      const { data: company } =
        await this.companiesRepository.findOne(companyId);
      if (company) {
        return {
          companyName: company.name,
          tagline: company.tagline || null,
          logoUrl: company.logo_url || null,
          primary: company.colors?.primary,
          bank: company.bank_details || null,
        };
      }
    } catch (error) {
      this.logger.error(`getBranding failed for company ${companyId}`, error);
    }
    return { companyName: fallbackName || 'Eventia' };
  }

  /**
   * Sends an email without parameters (static templates)
   */
  async sendEmail(
    to: string | undefined | null,
    emailStructure: EmailStructure.NEW_ACCOUNT,
  ): Promise<void>;

  /**
   * Sends a new public quotation client email
   */
  async sendEmail(
    to: string | string[] | undefined | null,
    emailStructure:
      | EmailStructure.NEW_PUBLIC_QUOTATION_CLIENT
      | EmailStructure.NEW_PUBLIC_QUOTATION_ADMIN,
    companyId: Company['id'],
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
   * Sends customer satisfaction survey (to single recipient)
   */
  async sendEmail(
    to: string | undefined | null,
    emailStructure: EmailStructure.CUSTOMER_SATISFACTION_SURVEY,
    params: CustomerSatisfactionSurveyParams,
    companyId: Company['id'],
  ): Promise<void>;

  /**
   * Sends new answer customer satisfaction survey notification (to multiple recipients)
   */
  async sendEmail(
    to: (string | undefined | null)[] | undefined | null,
    emailStructure: EmailStructure.NEW_ANSWER_CUSTOMER_SATISFACTION_SURVEY,
    params: NewAnswerCustomerSatisfactionSurveyParams,
  ): Promise<void>;
  /**
   * Sends payment reminder (to single recipient)
   */
  async sendEmail(
    to: string | string[] | undefined | null,
    emailStructure:
      | EmailStructure.PAYMENT_REMINDER
      | EmailStructure.PAYMENT_OVERDUE
      | EmailStructure.PAYMENT_REMINDER_ADMIN
      | EmailStructure.PAYMENT_OVERDUE_ADMIN,
    params: PaymentReminderParams,
    companyId: Company['id'],
  ): Promise<void>;

  /**
   * Sends quotation is sent (to single recipient)
   */
  async sendEmail(
    to: string | undefined | null,
    emailStructure: EmailStructure.QUOTATION_IS_SENT,
    params: QuotationIsSentParams,
    companyId: Company['id'],
  ): Promise<void>;

  /**
   * Sends payment plan created (to single recipient)
   */
  async sendEmail(
    to: string | undefined | null,
    emailStructure: EmailStructure.PAYMENT_PLAN_CREATED,
    params: PaymentPlanCreatedParams,
    companyId: Company['id'],
  ): Promise<void>;

  /**
   * Sends payment received confirmation (to single recipient)
   */
  async sendEmail(
    to: string | undefined | null,
    emailStructure: EmailStructure.PAYMENT_RECEIVED,
    params: PaymentReceivedParams,
    companyId: Company['id'],
  ): Promise<void>;

  /**
   * Sends weekly analytics (to multiple recipients)
   */
  async sendEmail(
    to: (string | undefined | null)[] | undefined | null,
    emailStructure: EmailStructure.WEEKLY_ANALYTICS,
    params: WeeklyAnalyticsParams,
  ): Promise<void>;

  /**
   * Sends quotation status check summary (to multiple recipients)
   */
  async sendEmail(
    to: (string | undefined | null)[] | undefined | null,
    emailStructure: EmailStructure.QUOTATION_STATUS_CHECK,
    params: QuotationStatusCheckParams,
  ): Promise<void>;
  /**
   * Sends a notification to super admins
   */
  async sendEmail(
    to: (string | undefined | null)[] | undefined | null,
    emailStructure: EmailStructure.SUPER_ADMIN_NOTIFICATION,
    params: { content: string },
  ): Promise<void>;
  /**
   * Implementation
   */
  async sendEmail(
    to: string | undefined | null | (string | undefined | null)[],
    emailStructure: EmailStructure,
    params?: any,
    companyId?: Company['id'],
  ): Promise<void> {
    // Check if email should be sent based on company configuration
    // Only check for client-facing emails
    if (EMAILS_SEND_TO_CLIENT.includes(emailStructure) && companyId) {
      const shouldSend = await this.shouldSendEmail(emailStructure, companyId);
      if (!shouldSend) {
        return;
      }
    }

    const resend = new Resend(
      this.configService.get<string>('RESEND_API_KEY') as string,
    );

    // Marca de la empresa para los correos que ve el cliente. Ojo: en
    // NEW_PUBLIC_QUOTATION_* el companyId viaja en la posición de
    // params (así son sus overloads).
    const brandCompanyId =
      companyId ?? (typeof params === 'number' ? params : undefined);
    let branding: EmailBranding = {
      companyName:
        ((params as { companyName?: string })?.companyName as string) ||
        'Eventia',
    };
    if (brandCompanyId && EMAILS_SEND_TO_CLIENT.includes(emailStructure)) {
      branding = await this.getBranding(brandCompanyId, branding.companyName);
    }

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
        subject = `Recibimos tu solicitud — ${branding.companyName}`;
        sendTo = [to as string];
        html = newPublicQuotationClientTemplate(branding);
        break;

      case EmailStructure.NEW_PUBLIC_QUOTATION_ADMIN:
        subject = EMAIL_SUBJECTS[EmailStructure.NEW_PUBLIC_QUOTATION_ADMIN];
        sendTo = to as string[];
        html = newPublicQuotationAdminTemplate();
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

      case EmailStructure.PAYMENT_REMINDER: {
        if (!params) {
          throw new Error('Params are required for PAYMENT_REMINDER template');
        }
        const rp = params as PaymentReminderParams;
        subject =
          daysToDue(rp.payment.due_date) <= 0
            ? `Hoy vence tu cuota de ${fmtCLP(rp.payment.amount)} — ${branding.companyName}`
            : `Tu cuota vence pronto — ${branding.companyName}`;
        sendTo = [to as string];
        html = paymentReminderTemplate(rp, branding);
        break;
      }

      case EmailStructure.PAYMENT_REMINDER_ADMIN:
        subject = EMAIL_SUBJECTS[EmailStructure.PAYMENT_REMINDER_ADMIN];
        sendTo = [to as string];
        if (!params) {
          throw new Error(
            'Params are required for PAYMENT_REMINDER_ADMIN template',
          );
        }
        html = paymentReminderAdminTemplate(params as PaymentReminderParams);
        break;

      case EmailStructure.PAYMENT_OVERDUE:
        subject = 'Cuota pendiente de tu evento — necesitamos regularizarla';
        sendTo = [to as string];
        if (!params) {
          throw new Error('Params are required for PAYMENT_OVERDUE template');
        }
        html = paymentOverdueTemplate(
          params as PaymentReminderParams,
          branding,
        );
        break;

      case EmailStructure.PAYMENT_OVERDUE_ADMIN:
        subject = EMAIL_SUBJECTS[EmailStructure.PAYMENT_OVERDUE_ADMIN];
        sendTo = [to as string];
        if (!params) {
          throw new Error(
            'Params are required for PAYMENT_OVERDUE_ADMIN template',
          );
        }
        html = paymentOverdueAdminTemplate(params as PaymentReminderParams);
        break;

      case EmailStructure.QUOTATION_IS_SENT: {
        if (!params) {
          throw new Error('Params are required for QUOTATION_IS_SENT template');
        }
        const qp = params as QuotationIsSentParams;
        subject = `Tu cotización de ${branding.companyName} está lista — N° ${qp.quotationNumber}`;
        sendTo = [to as string];
        html = quotationIsSentTemplate(qp, branding);
        break;
      }

      case EmailStructure.PAYMENT_PLAN_CREATED:
        subject = EMAIL_SUBJECTS[EmailStructure.PAYMENT_PLAN_CREATED];
        sendTo = [to as string];
        if (!params) {
          throw new Error(
            'Params are required for PAYMENT_PLAN_CREATED template',
          );
        }
        html = paymentPlanCreatedTemplate(
          params as PaymentPlanCreatedParams,
          branding,
        );
        break;

      case EmailStructure.PAYMENT_RECEIVED:
        subject = `Pago recibido ✓ — ${branding.companyName}`;
        sendTo = [to as string];
        if (!params) {
          throw new Error('Params are required for PAYMENT_RECEIVED template');
        }
        html = paymentReceivedTemplate(
          params as PaymentReceivedParams,
          branding,
        );
        break;

      case EmailStructure.CUSTOMER_SATISFACTION_SURVEY: {
        if (!params) {
          throw new Error(
            'Params are required for CUSTOMER_SATISFACTION_SURVEY template',
          );
        }
        const sp = params as CustomerSatisfactionSurveyParams;
        subject = `¿Cómo estuvo tu evento, ${sp.clientName}?`;
        sendTo = [to as string];
        html = customerSatisfactionSurveyTemplate(sp, branding);
        break;
      }

      case EmailStructure.NEW_ANSWER_CUSTOMER_SATISFACTION_SURVEY:
        subject =
          EMAIL_SUBJECTS[
            EmailStructure.NEW_ANSWER_CUSTOMER_SATISFACTION_SURVEY
          ];
        sendTo = to as string[];
        if (!params) {
          throw new Error(
            'Params are required for NEW_ANSWER_CUSTOMER_SATISFACTION_SURVEY template',
          );
        }
        html = newAnswerCustomerSatisfactionSurveyTemplate(
          params as NewAnswerCustomerSatisfactionSurveyParams,
        );
        break;

      case EmailStructure.WEEKLY_ANALYTICS:
        subject = EMAIL_SUBJECTS[EmailStructure.WEEKLY_ANALYTICS];
        sendTo = to as string[];
        if (!params) {
          throw new Error('Params are required for WEEKLY_ANALYTICS template');
        }
        html = weeklyAnalyticsTemplate(params as WeeklyAnalyticsParams);
        break;

      case EmailStructure.QUOTATION_STATUS_CHECK:
        subject = EMAIL_SUBJECTS[EmailStructure.QUOTATION_STATUS_CHECK];
        sendTo = to as string[];
        if (!params) {
          throw new Error(
            'Params are required for QUOTATION_STATUS_CHECK template',
          );
        }
        html = quotationStatusCheckTemplate(
          params as QuotationStatusCheckParams,
        );
        break;

      case EmailStructure.SUPER_ADMIN_NOTIFICATION:
        subject = EMAIL_SUBJECTS[EmailStructure.SUPER_ADMIN_NOTIFICATION];
        sendTo = to as string[];
        if (!(params as { content?: string })?.content) {
          throw new Error(
            'Content is required for SUPER_ADMIN_NOTIFICATION template',
          );
        }
        html = superAdminNotificationTemplate(
          (params as { content: string }).content,
        );
        break;

      default:
        throw new Error(`Unknown email structure: ${emailStructure as string}`);
    }

    this.logger.info(
      `Sending email to ${JSON.stringify(sendTo)} with subject ${subject}`,
    );

    if (!to) {
      this.logger.warn('No email provided');
      return;
    }

    // Los correos al cliente salen con el NOMBRE DE LA EMPRESA como
    // remitente (el dominio verificado sigue siendo el de Eventia).
    const from = EMAILS_SEND_TO_CLIENT.includes(emailStructure)
      ? `${branding.companyName} <hola@eventi-app.com>`
      : EMAIL_FROM;

    await resend.emails.send({
      from,
      to: sendTo,
      subject,
      html,
    });
  }
}
