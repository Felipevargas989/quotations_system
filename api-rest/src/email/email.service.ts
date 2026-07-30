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
import {
  PortalReceiptAdminParams,
  portalReceiptAdminTemplate,
} from './templates/portalReceipt/admin';
import { quotationFollowUpTemplate } from './templates/quotationFollowUp/template';
import { QuotationFollowUpParams } from './templates/quotationFollowUp/types';
import { quotationIsSentTemplate } from './templates/quotationIsSent/quotationIsSent';
import { QuotationIsSentParams } from './templates/quotationIsSent/types';
import { quotationStatusCheckTemplate } from './templates/quotationStatusCheck/template';
import { QuotationStatusCheckParams } from './templates/quotationStatusCheck/types';
import { soonEventsTemplate } from './templates/soonEvents';
import { superAdminNotificationTemplate } from './templates/superAdminNotification';
import { weeklyDigestTemplate } from './templates/weeklyDigest/template';
import { WeeklyDigestParams } from './templates/weeklyDigest/types';
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

    // Sin configuración de avisos = TODO ENCENDIDO por defecto
    // (decisión de Felipe 29-07). Antes esta rama devolvía false y
    // tenía mudos los correos al cliente de todas las empresas sin
    // configurar — contradiciendo su propio mensaje de log.
    if (!company.notifications?.emails) {
      this.logger.info(
        `Company ${companyId} has no email notifications configured, allowing email ${emailStructure}`,
      );
      return true;
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
          replyTo: company.notifications?.replyTo || null,
        };
      }
    } catch (error) {
      this.logger.error(`getBranding failed for company ${companyId}`, error);
    }
    return { companyName: fallbackName || 'Eventia' };
  }

  /**
   * Correos de PRUEBA: renderiza los correos del cliente y el resumen
   * semanal con datos de ejemplo y la marca REAL de la empresa, y los
   * manda todos a una casilla. Salta las puertas de notificaciones a
   * propósito (es una vista previa, no un envío de negocio).
   */
  async sendPreviewBatch(
    to: string,
    companyId: Company['id'],
    portalToken?: string | null,
    solo?: 'seguimiento' | null,
  ): Promise<{ sent: number; subjects: string[] }> {
    const branding = await this.getBranding(companyId);
    // Con token real, el botón del portal lleva a ESE portal (validar
    // el circuito completo); sin token, queda decorativo.
    if (portalToken) {
      const base = (
        this.configService.get<string>('FRONTEND_URL') || ''
      ).replace(/\/+$/, '');
      branding.portalUrl = base ? `${base}/portal/${portalToken}` : '#';
    } else {
      branding.portalUrl = '#';
    }
    const resend = new Resend(
      this.configService.get<string>('RESEND_API_KEY') as string,
    );
    const hoy = new Date();
    const en3 = new Date(hoy);
    en3.setDate(en3.getDate() + 3);
    const hace7 = new Date(hoy);
    hace7.setDate(hace7.getDate() - 7);
    const cuota = (due: Date): PaymentReminderParams => ({
      clientName: 'María Fernanda',
      companyName: branding.companyName,
      quotationId: '463',
      payment: { payment_number: 2, amount: 925000, due_date: due },
    });

    const previews: { subject: string; html: string }[] = [
      {
        subject: `[PRUEBA] Recibimos tu solicitud — ${branding.companyName}`,
        html: newPublicQuotationClientTemplate(branding),
      },
      {
        subject: `[PRUEBA] ¿Pudiste revisar tu cotización? — ${branding.companyName}`,
        html: quotationFollowUpTemplate(
          {
            clientName: 'María Fernanda',
            companyName: branding.companyName,
            quotationNumber: 463,
            eventType: 'Celebración',
            eventDate: new Date(Date.now() + 30 * 86400000).toISOString(),
            toque: 1,
          },
          branding,
        ),
      },
      {
        subject: `[PRUEBA] Seguimos disponibles para tu evento — ${branding.companyName}`,
        html: quotationFollowUpTemplate(
          {
            clientName: 'María Fernanda',
            companyName: branding.companyName,
            quotationNumber: 463,
            eventType: 'Celebración',
            eventDate: new Date(Date.now() + 30 * 86400000).toISOString(),
            toque: 2,
          },
          branding,
        ),
      },
      {
        subject: `[PRUEBA] Tu cotización de ${branding.companyName} está lista — N° 463`,
        html: quotationIsSentTemplate(
          {
            clientName: 'María Fernanda',
            companyName: branding.companyName,
            quotationNumber: 463,
          },
          branding,
        ),
      },
      {
        subject: `[PRUEBA] Cotización aceptada — plan de pagos`,
        html: paymentPlanCreatedTemplate(
          {
            clientName: 'María Fernanda',
            companyName: branding.companyName,
            quotationNumber: 463,
            payments: [
              { payment_number: 1, amount: 925000, due_date: hoy },
              { payment_number: 2, amount: 925000, due_date: en3 },
            ],
          },
          branding,
        ),
      },
      {
        subject: `[PRUEBA] Pago recibido ✓ — ${branding.companyName}`,
        html: paymentReceivedTemplate(
          {
            clientName: 'María Fernanda',
            companyName: branding.companyName,
            amount: 925000,
            paymentMethod: 'Transferencia bancaria',
            transactionDate: hoy,
          },
          branding,
        ),
      },
      {
        subject: `[PRUEBA] Tu cuota vence pronto — ${branding.companyName}`,
        html: paymentReminderTemplate(cuota(en3), branding),
      },
      {
        subject: `[PRUEBA] Hoy vence tu cuota de ${fmtCLP(925000)} — ${branding.companyName}`,
        html: paymentReminderTemplate(cuota(hoy), branding),
      },
      {
        subject:
          '[PRUEBA] Cuota pendiente de tu evento — necesitamos regularizarla',
        html: paymentOverdueTemplate(cuota(hace7), branding),
      },
      {
        subject: `[PRUEBA] ¿Cómo estuvo tu evento, María Fernanda?`,
        html: customerSatisfactionSurveyTemplate(
          {
            clientName: 'María Fernanda',
            companyName: branding.companyName,
            companyId,
            quotationId: 'prueba',
          },
          branding,
        ),
      },
      {
        subject: `[PRUEBA] Tu semana en ${branding.companyName}: 2 eventos · 5 cotizaciones en curso`,
        html: weeklyDigestTemplate({
          companyName: branding.companyName,
          weekLabel: 'semana de ejemplo',
          eventos: [
            { fecha: 'vie 7', tipo: 'Almuerzo empresa · CCU', personas: 120 },
            { fecha: 'sáb 8', tipo: 'Matrimonio', personas: 180 },
          ],
          pipeline: { solicitadas: 2, enviadas: 2, enNegociacion: 1 },
        }),
      },
    ];

    // solo='seguimiento': únicamente los 2 toques del seguimiento.
    const lista =
      solo === 'seguimiento'
        ? previews.filter(
            (p) =>
              p.subject.includes('¿Pudiste revisar') ||
              p.subject.includes('Seguimos disponibles'),
          )
        : previews;

    const from = `${branding.companyName} <hola@eventi-app.com>`;
    for (const p of lista) {
      await resend.emails.send({
        from,
        to: [to],
        subject: p.subject,
        html: p.html,
      });
    }
    return { sent: lista.length, subjects: lista.map((p) => p.subject) };
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
    // En este overload el companyId viaja en la posición de params
    // (herencia histórica); el token va en la 5ª posición como en el
    // resto, dejando la 4ª vacía.
    unused?: undefined,
    portalToken?: string | null,
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
    portalToken?: string | null,
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
    portalToken?: string | null,
  ): Promise<void>;

  /**
   * Sends quotation is sent (to single recipient)
   */
  async sendEmail(
    to: string | undefined | null,
    emailStructure: EmailStructure.QUOTATION_IS_SENT,
    params: QuotationIsSentParams,
    companyId: Company['id'],
    portalToken?: string | null,
  ): Promise<void>;

  /**
   * Sends a commercial follow-up (day 7 / day 14) to single recipient
   */
  async sendEmail(
    to: string | undefined | null,
    emailStructure: EmailStructure.QUOTATION_FOLLOW_UP,
    params: QuotationFollowUpParams,
    companyId: Company['id'],
    portalToken?: string | null,
  ): Promise<void>;

  /**
   * Sends payment plan created (to single recipient)
   */
  async sendEmail(
    to: string | undefined | null,
    emailStructure: EmailStructure.PAYMENT_PLAN_CREATED,
    params: PaymentPlanCreatedParams,
    companyId: Company['id'],
    portalToken?: string | null,
  ): Promise<void>;

  /**
   * Sends payment received confirmation (to single recipient)
   */
  async sendEmail(
    to: string | undefined | null,
    emailStructure: EmailStructure.PAYMENT_RECEIVED,
    params: PaymentReceivedParams,
    companyId: Company['id'],
    portalToken?: string | null,
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
   * Sends the weekly digest (to multiple recipients)
   */
  async sendEmail(
    to: (string | undefined | null)[] | undefined | null,
    emailStructure: EmailStructure.WEEKLY_DIGEST,
    params: WeeklyDigestParams,
  ): Promise<void>;
  /**
   * Notifies admins of a portal receipt awaiting confirmation
   */
  async sendEmail(
    to: (string | undefined | null)[] | undefined | null,
    emailStructure: EmailStructure.PORTAL_RECEIPT_ADMIN,
    params: PortalReceiptAdminParams,
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
    portalToken?: string | null,
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
    // params (así son sus overloads) y en runtime puede llegar como
    // TEXTO ("1", viene de la URL pública) — por eso el Number().
    const paramsAsId =
      (typeof params === 'number' || typeof params === 'string') &&
      Number.isFinite(Number(params))
        ? Number(params)
        : undefined;
    const brandCompanyId = companyId ?? paramsAsId;
    let branding: EmailBranding = {
      companyName:
        ((params as { companyName?: string })?.companyName as string) ||
        'Eventia',
    };
    if (brandCompanyId && EMAILS_SEND_TO_CLIENT.includes(emailStructure)) {
      branding = await this.getBranding(brandCompanyId, branding.companyName);
    }
    // Botón "Ingresar a mi portal": solo si la cotización tiene mandante
    // vinculado (el que llama pasa su token secreto).
    if (portalToken && EMAILS_SEND_TO_CLIENT.includes(emailStructure)) {
      const base = (
        this.configService.get<string>('FRONTEND_URL') || ''
      ).replace(/\/+$/, '');
      if (base) {
        branding.portalUrl = `${base}/portal/${portalToken}`;
      }
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

      case EmailStructure.QUOTATION_FOLLOW_UP: {
        if (!params) {
          throw new Error(
            'Params are required for QUOTATION_FOLLOW_UP template',
          );
        }
        const fp = params as QuotationFollowUpParams;
        subject =
          fp.toque === 1
            ? `¿Pudiste revisar tu cotización? — ${branding.companyName}`
            : `Seguimos disponibles para tu evento — ${branding.companyName}`;
        sendTo = [to as string];
        html = quotationFollowUpTemplate(fp, branding);
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

      case EmailStructure.WEEKLY_DIGEST: {
        if (!params) {
          throw new Error('Params are required for WEEKLY_DIGEST template');
        }
        const wd = params as WeeklyDigestParams;
        subject = `Tu semana en ${wd.companyName}: ${wd.eventos.length} evento${wd.eventos.length === 1 ? '' : 's'} · ${wd.pipeline.solicitadas + wd.pipeline.enviadas + wd.pipeline.enNegociacion} cotizaciones en curso`;
        sendTo = to as string[];
        html = weeklyDigestTemplate(wd);
        break;
      }

      case EmailStructure.PORTAL_RECEIPT_ADMIN: {
        if (!params) {
          throw new Error(
            'Params are required for PORTAL_RECEIPT_ADMIN template',
          );
        }
        const pr = params as PortalReceiptAdminParams;
        subject = `💸 Comprobante por confirmar — ${pr.mandante} · cot. N° ${pr.quotationNumber}`;
        sendTo = to as string[];
        html = portalReceiptAdminTemplate(pr);
        break;
      }

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

    // "Responder a" de la empresa (punto medio 30-07): el envío sigue
    // saliendo del dominio de Eventia, pero la respuesta del cliente
    // llega a la casilla real de la empresa.
    const replyTo =
      EMAILS_SEND_TO_CLIENT.includes(emailStructure) && branding.replyTo
        ? branding.replyTo
        : undefined;

    await resend.emails.send({
      from,
      to: sendTo,
      subject,
      html,
      ...(replyTo ? { replyTo } : {}),
    });
  }
}
