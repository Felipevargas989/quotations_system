import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import { PinoLogger } from 'nestjs-pino';
import { ClientsService } from 'src/clients/clients.service';
import { Company } from 'src/companies/entities/company.entity';
import { EmailService } from 'src/email/email.service';
import { EmailStructure } from 'src/email/types/index';
import { PaymentStatus } from 'src/payments/constants';
import { CreatePaymentDto } from 'src/payments/dto/create-payment.dto';
import { PaymentTransaction } from 'src/payments/entities/payment.entity';
import { PaymentsService } from 'src/payments/payments.service';
import { RefundsService } from 'src/refunds/refunds.service';
import { UserRole } from 'src/users/entities/user.entity';
import { UsersService } from 'src/users/users.service';
import { logSafe } from '../logging/log-safe';
import { getEventDateUtc } from '../utils/dates';
import {
  PaymentPlanType,
  QuotationStatus,
  RequestType,
} from './constants/constants';
import { CheckConflictsWithExistingQuotationsDto } from './dto/check-conflicts-with-existing-quotations.dto';
import { CreateQuotationPublicDto } from './dto/create-quotation-public.dto';
import { CreateQuotationDto } from './dto/create-quotation.dto';
import { UpdateQuotationDto } from './dto/update-quotation.dto';
import { QuotationItem } from './entities/quotation.entity';
import { CreateQuotation } from './interfaces/quotations.interface';
import { QuotationsRepository } from './quotations.repository';
import {
  DeclaredMoney,
  MoneyInput,
  hasMoneyToVerify,
  verifyMoney,
} from './utils/money';

@Injectable()
export class QuotationsService {
  constructor(
    private readonly quotationsRepository: QuotationsRepository,
    private readonly refundsService: RefundsService,
    @Inject(forwardRef(() => PaymentsService))
    private readonly paymentsService: PaymentsService,
    private readonly clientsService: ClientsService,
    private readonly emailService: EmailService,
    @Inject(forwardRef(() => UsersService))
    private readonly usersService: UsersService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(QuotationsService.name);
  }

  // ---------- FASE 1: LA CUENTA LA HACE LA CASA (27-07-2026) ----------
  // El backend rehace los totales desde los ítems (utils/money.ts, misma
  // fórmula del cotizador) y rechaza el guardado si lo declarado no calza
  // al peso. Una solicitud sin ítems y sin montos pasa igual que siempre.
  private assertMoneyMatches(declared: DeclaredMoney, input: MoneyInput) {
    if (!hasMoneyToVerify(declared, input.items)) return;
    const mismatches = verifyMoney(declared, input);
    if (mismatches.length === 0) return;
    const detalle = mismatches
      .map((m) => `${m.campo}: enviado ${m.enviado}, calculado ${m.calculado}`)
      .join('; ');
    this.logger.error(`Totales rechazados por no calzar: ${detalle}`);
    throw new BadRequestException(
      `Los totales enviados no calzan con los ítems de la cotización (${detalle}). ` +
        'Actualiza la página e intenta guardar de nuevo; si el problema persiste, avisa al administrador.',
    );
  }

  async create(
    createQuotationDto: CreateQuotationDto,
    companyId: number,
    userId: string | undefined,
  ) {
    this.logger.info(
      `create quotation with createQuotationDto ${logSafe(createQuotationDto)}`,
    );

    // FASE 1: verificar la plata antes de cualquier otra cosa.
    this.assertMoneyMatches(
      {
        fixed_value: createQuotationDto.fixed_value || 0,
        value_per_person: createQuotationDto.value_per_person || 0,
        subtotal_amount: createQuotationDto.subtotal_amount || 0,
        discount_percentage: createQuotationDto.discount_percentage || 0,
        discount_amount: createQuotationDto.discount_amount || 0,
        tip_percentage: createQuotationDto.tip_percentage ?? null,
        tip_amount: createQuotationDto.tip_amount || 0,
        total_amount: createQuotationDto.total_amount || 0,
      },
      {
        items: createQuotationDto.items,
        people_count: createQuotationDto.people_count,
        children_count: createQuotationDto.children_count || 0,
        discount_percentage: createQuotationDto.discount_percentage || 0,
        discount_amount: createQuotationDto.discount_amount || 0,
        tip_percentage: createQuotationDto.tip_percentage ?? null,
      },
    );

    // El número lo asigna LA BASE de forma atómica (migración 38): dos
    // creaciones simultáneas reciben números distintos sí o sí, y la
    // restricción única (company_id, quotation_number) lo garantiza
    // incluso si este código cambia. Antes era "último + 1" leído aparte,
    // con carrera conocida (Fase 1 punto 3 del plan de corrección).
    const quotationNumber =
      await this.quotationsRepository.nextQuotationNumber(companyId);
    const defaultItems: QuotationItem = {
      fixed_services: [],
      variable_services: [],
    };

    // This is to keep the event_date as ISO (UTC) string in the database
    // ISO 8601 with UTC offset (+00:00 = UTC), equivalent to 2025-09-24T00:00:00.000Z
    const eventDateUtc = getEventDateUtc(createQuotationDto.event_date);

    const newQuotation: CreateQuotation = {
      client_id: createQuotationDto.client_id,
      event_type: createQuotationDto.event_type,
      people_count: createQuotationDto.people_count,
      // Niños/adultos y propina (Cotizador 2.0). Van AQUÍ además del DTO:
      // si faltan en el insert, se botan en silencio (bug del 19-07).
      children_count: createQuotationDto.children_count || 0,
      tip_percentage: createQuotationDto.tip_percentage ?? null,
      // El MONTO de la propina, no solo el % (migración 37). Mismo aviso
      // de arriba: si falta aquí, se bota en silencio.
      tip_amount: Math.max(0, Math.round(createQuotationDto.tip_amount || 0)),
      contact_name: createQuotationDto.contact_name || null,
      observations: createQuotationDto.observations,
      event_date: eventDateUtc,
      // Último día (evento multi-día); null = un solo día. Si esto falta,
      // la creación bota el rango en silencio — no repetir el bug 19-07.
      event_end_date: createQuotationDto.event_end_date
        ? getEventDateUtc(createQuotationDto.event_end_date)
        : null,
      company_id: companyId,
      total_amount: createQuotationDto.total_amount || 0,
      quotation_status: createQuotationDto.quotation_status,
      quotation_number: quotationNumber,
      user_id: userId,
      value_per_person: createQuotationDto.value_per_person || 0,
      fixed_value: createQuotationDto.fixed_value || 0,
      request_type: createQuotationDto.request_type,
      requires_invoice: createQuotationDto.requires_invoice || false,
      has_contract: createQuotationDto.has_contract || false,
      payment_plan_type: PaymentPlanType.DEFAULT,
      discount_percentage: createQuotationDto.discount_percentage || 0,
      discount_amount: createQuotationDto.discount_amount || 0,
      subtotal_amount: createQuotationDto.subtotal_amount || 0,
      items: createQuotationDto.items || defaultItems,
    };
    return this.quotationsRepository.create(newQuotation);
  }

  async createPublic(
    createQuotationPublicDto: CreateQuotationPublicDto,
    company_id: Company['id'],
  ) {
    this.logger.info(
      `createPublic quotation with createQuotationPublicDto ${logSafe(createQuotationPublicDto)}`,
    );
    // Anti-duplicados (22-07): match robusto por correo (sin mayúsculas)
    // O teléfono (solo dígitos) — la solicitud se engancha al cliente
    // existente en vez de fabricar uno nuevo.
    const existingClient = await this.clientsService.findMatch(
      company_id,
      createQuotationPublicDto.email,
      createQuotationPublicDto.phone,
    );

    // if not client, create a new one
    let clientId: string;
    if (existingClient) {
      clientId = existingClient.id;
    } else {
      // throw new Error('Client does not exists');
      const newClient = await this.clientsService.create(
        {
          client_type: createQuotationPublicDto.client_type,
          email: createQuotationPublicDto.email,
          name: createQuotationPublicDto.name,
          phone: createQuotationPublicDto.phone,
        },
        company_id,
      );
      clientId = newClient.id;
    }

    // create a new quotation
    const newQuotation: CreateQuotationDto = {
      client_id: clientId,
      event_type: createQuotationPublicDto.event_type,
      people_count: createQuotationPublicDto.people_count,
      // Niños del evento (audiencias del Cotizador 2.0) y MANDANTE: quien
      // llenó el formulario queda como contacto de ESTA cotización.
      children_count: createQuotationPublicDto.children_count || 0,
      contact_name: createQuotationPublicDto.name,
      observations: `[Desde formulario publico] --- ${createQuotationPublicDto.observations}`,
      event_date: createQuotationPublicDto.event_date,
      quotation_status: QuotationStatus.SOLICITADA,
      request_type: RequestType.REQUERIMIENTO,
    };

    // create new quotation
    const newQuotationCreated = await this.create(
      newQuotation,
      company_id,
      undefined,
    );

    if (newQuotationCreated) {
      try {
        // send email to the client who created the quotation
        void this.emailService.sendEmail(
          createQuotationPublicDto.email,
          EmailStructure.NEW_PUBLIC_QUOTATION_CLIENT,
          company_id,
        );

        // get company admin email
        const companyAdmins = await this.usersService.findAll(
          company_id,
          UserRole.ADMINISTRADOR,
        );

        const adminEmails = companyAdmins.map((admin) => admin.email);

        // send email to the company admin
        void this.emailService.sendEmail(
          adminEmails,
          EmailStructure.NEW_PUBLIC_QUOTATION_ADMIN,
          company_id,
        );
      } catch (error) {
        this.logger.error(error);
      }
    }

    return newQuotationCreated;
  }
  async findAll({
    companyId,
    request_type,
    statuses,
    dateRange,
    sort_by,
    sort_order,
    eventDateFrom,
  }: {
    companyId: number;
    request_type?: RequestType;
    statuses?: QuotationStatus[];
    dateRange?: { start_date: Date; end_date: Date };
    sort_by?: 'quotation_number' | 'event_date' | 'status';
    sort_order?: 'asc' | 'desc';
    eventDateFrom?: Date;
  }) {
    this.logger.info(
      `findAll quotations with params ${companyId}, ${request_type}, ${JSON.stringify(statuses)}, ${JSON.stringify(dateRange)}`,
    );
    return this.quotationsRepository.findAll({
      company_id: companyId,
      request_type: request_type,
      statuses: statuses,
      dateRange: dateRange,
      sort_by: sort_by || 'quotation_number',
      sort_order: sort_order || 'asc',
      eventDateFrom: eventDateFrom,
    });
  }

  findOne(id: string) {
    this.logger.info(`findOne quotation with id ${id}`);
    return this.quotationsRepository.findOne(id);
  }

  // Evento REALIZADO: cambia el estado y dispara la encuesta de satisfacción
  // al cliente. La encuesta sale UNA sola vez: survey_sent_at se estampa solo
  // cuando el correo salió bien, y bloquea reenvíos si el evento se re-marca.
  // Destinatario de la correspondencia de una cotización (regla 20-07):
  // 1) el CONTACTO asociado a la cotización, si tiene correo;
  // 2) contacto SIN correo -> NO se envía (null, sin fallback silencioso);
  // 3) cotización sin contacto -> correo del cliente (particulares y
  //    cotizaciones antiguas siguen funcionando como siempre).
  private async resolveRecipient(quotation: {
    client_id: string;
    contact_name?: string | null;
    clients?: { name: string; email?: string | null };
  }): Promise<{ email: string; name: string } | null> {
    const contactName = (quotation.contact_name || '').trim();
    if (contactName) {
      const { data: contact } =
        await this.quotationsRepository.findContactByName(
          quotation.client_id,
          contactName,
        );
      if (contact?.email) {
        return { email: contact.email, name: contact.name };
      }
      return null; // la persona existe pero no tiene correo: no se envía
    }
    if (quotation.clients?.email) {
      return { email: quotation.clients.email, name: quotation.clients.name };
    }
    return null;
  }

  async markEventDone(id: string, companyId: number) {
    const { data: quotation, error } =
      await this.quotationsRepository.findOne(id);
    if (error) throw error;
    if (!quotation || quotation.company_id !== companyId) {
      throw new Error('Quotation not found');
    }
    if (quotation.quotation_status !== QuotationStatus.ACEPTADA) {
      throw new Error('Only accepted events can be marked as done');
    }

    await this.quotationsRepository.update(
      id,
      {
        quotation_status: QuotationStatus.REALIZADA,
      } as unknown as UpdateQuotationDto,
      companyId,
    );

    const alreadySurveyed = Boolean(
      (quotation as { survey_sent_at?: string | null }).survey_sent_at,
    );
    const recipient = await this.resolveRecipient(quotation);
    let surveySent = false;
    if (!alreadySurveyed && recipient) {
      try {
        await this.emailService.sendEmail(
          recipient.email,
          EmailStructure.CUSTOMER_SATISFACTION_SURVEY,
          {
            clientName: recipient.name,
            companyName: quotation.companies?.name,
            companyId: quotation.company_id,
            quotationId: quotation.id,
          },
          quotation.company_id,
        );
        surveySent = true;
        await this.quotationsRepository.update(
          id,
          {
            survey_sent_at: new Date().toISOString(),
          } as unknown as UpdateQuotationDto,
          companyId,
        );
      } catch (emailError) {
        // El estado ya quedó realizado; un correo fallido no lo revierte.
        this.logger.error('Error sending satisfaction survey:', emailError);
      }
    }

    return {
      quotation_status: QuotationStatus.REALIZADA,
      survey_sent: surveySent,
      survey_already_sent: alreadySurveyed,
      // true si hay a quién enviar (contacto de la cotización con correo,
      // o cliente con correo cuando no hay contacto asociado)
      client_has_email: Boolean(recipient),
    };
  }

  /**
   * Portal del cliente (Fase 2a): datos públicos de UNA cotización a
   * partir de su enlace secreto. Solo eventos aceptados o realizados;
   * cualquier otra cosa (token malo, corto, anulada) responde 404 sin
   * dar pistas.
   */
  async getPortalData(token: string) {
    if (!token || token.length < 40) {
      throw new NotFoundException();
    }
    const { data: q } =
      await this.quotationsRepository.findByPortalToken(token);
    if (
      !q ||
      ![QuotationStatus.ACEPTADA, QuotationStatus.REALIZADA].includes(
        q.quotation_status,
      )
    ) {
      throw new NotFoundException();
    }

    const { data: payments } =
      await this.paymentsService.findAllPaymentsFromQuotation(
        [q.id],
        q.company_id,
      );
    const hoy = new Date().toISOString().slice(0, 10);
    let pagado = 0;
    const cuotas = (payments || [])
      .map((p) => {
        const abonado = (p.payment_transactions || []).reduce(
          (s: number, t: PaymentTransaction) => s + t.amount,
          0,
        );
        pagado += abonado;
        const vence = p.due_date ? String(p.due_date).slice(0, 10) : null;
        let estado: string = p.status;
        if (
          estado !== (PaymentStatus.PAGADO as string) &&
          vence &&
          vence < hoy
        ) {
          estado = PaymentStatus.VENCIDO;
        }
        return {
          numero: p.payment_number,
          monto: p.amount,
          vence,
          estado,
          abonado,
        };
      })
      .sort((a, b) => a.numero - b.numero);

    const refundsMap = await this.refundsService.paidMapByCompany(q.company_id);
    const reembolsado = Number(refundsMap?.[q.id] || 0);
    const pagadoNeto = pagado - reembolsado;

    return {
      empresa: {
        nombre: q.companies?.name || '',
        tagline: q.companies?.tagline || null,
        logo_url: q.companies?.logo_url || null,
        color: q.companies?.colors?.primary || null,
        datos_cobro: q.companies?.bank_details || null,
      },
      evento: {
        numero: q.quotation_number,
        tipo: q.event_type,
        fecha: q.event_date,
        personas: q.people_count,
        estado: q.quotation_status,
        cliente: q.clients?.name || '',
        contacto: q.contact_name || null,
      },
      cuotas,
      total: q.total_amount,
      pagado: pagadoNeto,
      saldo: q.total_amount - pagadoNeto,
    };
  }

  async update(
    id: string,
    updateQuotationDto: UpdateQuotationDto,
    companyId: number,
  ) {
    try {
      // 0. Get quotation
      const { data: quotation, error } =
        await this.quotationsRepository.findOne(id);

      if (error) {
        throw error;
      }

      if (!quotation) {
        throw new Error('Quotation not found');
      }

      // FASE 1: si el parche toca la plata, la cuenta se rehace ANTES de
      // mover pagos o reembolsos. Lo que no viene en el parche conserva su
      // valor guardado (un cambio de estado puro no gatilla nada).
      const d = updateQuotationDto;
      if (
        d.items !== undefined ||
        d.total_amount !== undefined ||
        d.subtotal_amount !== undefined ||
        d.fixed_value !== undefined ||
        d.value_per_person !== undefined ||
        d.discount_percentage !== undefined ||
        d.discount_amount !== undefined ||
        d.tip_percentage !== undefined ||
        d.tip_amount !== undefined ||
        d.people_count !== undefined ||
        d.children_count !== undefined
      ) {
        this.assertMoneyMatches(
          {
            fixed_value:
              d.fixed_value !== undefined
                ? d.fixed_value
                : quotation.fixed_value,
            value_per_person:
              d.value_per_person !== undefined
                ? d.value_per_person
                : quotation.value_per_person,
            subtotal_amount:
              d.subtotal_amount !== undefined
                ? d.subtotal_amount
                : quotation.subtotal_amount,
            discount_percentage:
              d.discount_percentage !== undefined
                ? d.discount_percentage
                : quotation.discount_percentage,
            discount_amount:
              d.discount_amount !== undefined
                ? d.discount_amount
                : quotation.discount_amount,
            tip_percentage:
              d.tip_percentage !== undefined
                ? d.tip_percentage
                : quotation.tip_percentage,
            tip_amount:
              d.tip_amount !== undefined ? d.tip_amount : quotation.tip_amount,
            total_amount:
              d.total_amount !== undefined
                ? d.total_amount
                : quotation.total_amount,
          },
          {
            items: d.items !== undefined ? d.items : quotation.items,
            people_count:
              d.people_count !== undefined
                ? d.people_count
                : quotation.people_count,
            children_count:
              d.children_count !== undefined
                ? d.children_count
                : quotation.children_count,
            discount_percentage:
              d.discount_percentage !== undefined
                ? d.discount_percentage
                : quotation.discount_percentage,
            discount_amount:
              d.discount_amount !== undefined
                ? d.discount_amount
                : quotation.discount_amount,
            tip_percentage:
              d.tip_percentage !== undefined
                ? d.tip_percentage
                : quotation.tip_percentage,
          },
        );
      }

      // GUARDIA DE ESTADOS: abandonar un estado de post-venta (aceptada /
      // realizada / cancelada) hacia uno de pre-venta solo se permite si el
      // evento NO tiene dinero registrado — y en ese caso el plan de pagos
      // se elimina completo, para no dejar cuotas huérfanas en Post-Venta.
      // Con abonos o reembolsos encima, el camino correcto es Anular.
      const PRE_SALE_STATUSES = [
        QuotationStatus.SOLICITADA,
        QuotationStatus.ENVIADA,
        QuotationStatus.EN_NEGOCIACION,
        QuotationStatus.RECHAZADA,
      ];
      const POST_SALE_STATUSES = [
        QuotationStatus.ACEPTADA,
        QuotationStatus.REALIZADA,
        QuotationStatus.CANCELADA,
      ];
      const targetStatus = updateQuotationDto.quotation_status;
      if (
        targetStatus &&
        PRE_SALE_STATUSES.includes(targetStatus) &&
        POST_SALE_STATUSES.includes(quotation.quotation_status)
      ) {
        const { data: planPayments } =
          await this.paymentsService.findAllPaymentsFromQuotation(
            [id],
            companyId,
          );
        const hasMoney = (planPayments || []).some(
          (p) =>
            Number((p as { paid_amount?: number }).paid_amount || 0) > 0 ||
            (p.payment_transactions || []).length > 0,
        );
        if (hasMoney) {
          throw new BadRequestException(
            'Esta cotización tiene pagos registrados: no puede volver a un estado de pre-venta. Si el evento se cayó, usa "Anular evento" en Post-Venta.',
          );
        }
        await this.paymentsService.deletePaymentPlan(id, companyId);
      }

      // 1. Check quotation status
      // If quotation_states is accepted, handle update payment plan (payments)
      if (quotation.quotation_status === QuotationStatus.ACEPTADA) {
        // Get all payments PENDIENTE or VENCIDO
        const { data: payments, error: paymentsError } =
          await this.paymentsService.findAllPaymentsFromQuotation(
            [id],
            companyId,
            [PaymentStatus.PENDIENTE, PaymentStatus.VENCIDO],
          );
        if (paymentsError) {
          throw paymentsError;
        }

        // 2.1 If new total_amount is less than previous one, check if discount if possible or create a refund
        if (
          updateQuotationDto.total_amount &&
          updateQuotationDto.total_amount < quotation.total_amount
        ) {
          // get amount to reduce from the quotation
          let amountToReduce =
            quotation.total_amount - updateQuotationDto.total_amount;

          // if not payments, then create a refund with the difference
          if (!payments || payments.length === 0) {
            await this.refundsService.create({
              amount: amountToReduce,
              quotation_id: id,
            });
          }
          // if there is at least one pending payment
          else {
            // iterate over each payment (starting from the LAST one, i.e. the
            // furthest due date) and reduce the amountToReduce from each
            // payment until the amountToReduce is 0. The remaining balance
            // stays concentrated in the earliest pending installments.
            for (const payment of [...payments].reverse()) {
              // if amountToReduce is 0, then stop the iteration because all the decrements are applied
              if (amountToReduce === 0) {
                break;
              }
              // get already paid amount of this payment
              const alreadyPaidAmount = payment.payment_transactions.reduce(
                (sum: number, transaction: PaymentTransaction) =>
                  sum + transaction.amount,
                0,
              );

              // get pending amount to be paid of this payment
              const pendingAmountToBePaid = payment.amount - alreadyPaidAmount;

              // if pendingAmountToBePaid is greater than amountToReduce, then reduce the amountToReduce from payment
              if (pendingAmountToBePaid > amountToReduce) {
                // update payment with thew new amount
                await this.paymentsService.update(payment.id, {
                  amount: payment.amount - amountToReduce,
                });

                // update amountToReduce to 0
                amountToReduce = 0;
              }
              // if pendingAmountToBePaid is smaller than amountToReduce, then reduce the amount of the payment, update the payment and then continue with the next payment
              else {
                // update payment with the new amount (discount the min between pendingAmountToBePaid and amountToReduce)
                await this.paymentsService.update(payment.id, {
                  amount: payment.amount - pendingAmountToBePaid,
                });
                // update amountToReduce with the difference
                amountToReduce = amountToReduce - pendingAmountToBePaid;
              }
            }

            // check if amountToReduce is 0. If amountToReduce is not 0, then create a refund with the differencei
            if (amountToReduce > 0) {
              await this.refundsService.create({
                amount: amountToReduce,
                quotation_id: id,
              });
            }
          }
        }

        // 2.2 If new total_amount is greater thant previous one, update payments
        if (
          updateQuotationDto.total_amount &&
          updateQuotationDto.total_amount > quotation.total_amount
        ) {
          let amountToCharge =
            updateQuotationDto.total_amount - quotation.total_amount;

          // TAREA #42 — compensación: antes de crear deuda nueva, consumir
          // los reembolsos PENDIENTES (no pagados) de esta cotización, del
          // más antiguo al más nuevo. Si el reembolso cubre toda la
          // diferencia, solo se achica (o se elimina si queda en 0) y no
          // nace deuda. Así nunca conviven "te debo" y "me debes".
          // Los reembolsos YA PAGADOS no se tocan: esa plata ya salió.
          const pendingRefunds =
            (await this.refundsService.findPendingByQuotation(id)) as {
              id: string;
              amount: number;
            }[];

          for (const refund of pendingRefunds) {
            if (amountToCharge <= 0) break;

            if (refund.amount > amountToCharge) {
              // The refund covers the whole new debt: shrink it and stop
              await this.refundsService.updateAmount(
                refund.id,
                refund.amount - amountToCharge,
              );
              amountToCharge = 0;
            } else {
              // The refund is fully consumed by the new debt: remove it
              await this.refundsService.remove(refund.id);
              amountToCharge = amountToCharge - refund.amount;
            }
          }

          // Only the remainder (if any) becomes new debt
          if (amountToCharge > 0) {
            // If payments, then get the last one and increase the amount by the remaining difference
            if (payments && payments.length > 0) {
              // Get the last payment and increase the amount by the remaining difference
              const lastPayment = payments[payments.length - 1];
              const newAmount = lastPayment.amount + amountToCharge;
              await this.paymentsService.update(lastPayment.id, {
                amount: newAmount,
              });
            }

            // If not payments, then create new payment with the remaining difference
            else if (!payments || payments.length === 0) {
              const newPayment: CreatePaymentDto = {
                quotation_id: id,
                amount: amountToCharge,
                notes: 'Pago creado por diferencia de total_amount',
              };
              await this.paymentsService.createPayment(newPayment, companyId);
            }
          }
        }
      }

      try {
        // if quotation is not enviada, and new status is enviada, send email to the client
        if (
          quotation.quotation_status !== QuotationStatus.ENVIADA &&
          updateQuotationDto.quotation_status === QuotationStatus.ENVIADA
        ) {
          // La correspondencia sigue a la persona de la cotización (misma
          // regla que la encuesta); sin destinatario, no se envía.
          const sentRecipient = await this.resolveRecipient(quotation);
          if (sentRecipient) {
            void this.emailService.sendEmail(
              sentRecipient.email,
              EmailStructure.QUOTATION_IS_SENT,
              {
                clientName: sentRecipient.name,
                companyName: quotation.companies.name,
                quotationNumber: quotation.quotation_number,
              },
              companyId,
            );
          }
        }
      } catch (error) {
        // Do not throw error, just log it
        this.logger.error(error);
      }

      // Portal del cliente (Fase 2a): al ACEPTAR nace el enlace secreto.
      if (
        updateQuotationDto.quotation_status === QuotationStatus.ACEPTADA &&
        !quotation.portal_token
      ) {
        await this.quotationsRepository.update(
          id,
          {
            portal_token: randomBytes(32).toString('hex'),
          } as unknown as UpdateQuotationDto,
          companyId,
        );
      }

      // update quotation
      return this.quotationsRepository.update(
        id,
        updateQuotationDto,
        companyId,
      );
      // 3. If quotation_status is not accepted, update quotation
    } catch (error) {
      this.logger.error(error);
      throw error;
    }
  }

  remove(id: string, companyId: number) {
    return this.quotationsRepository.remove(id, companyId);
  }

  async checkConflictsWithExistingQuotations(
    params: CheckConflictsWithExistingQuotationsDto,
    companyId: Company['id'],
  ): Promise<{ has_conflicts: boolean }> {
    this.logger.info(
      `checkConflictsWithExistingQuotations with params ${JSON.stringify(params)}`,
    );
    try {
      // Choque por RANGO de fechas: un evento multi-día choca con cualquier
      // otro cuyo rango se tope (evento sin "hasta" = un solo día).
      const myStart = new Date(getEventDateUtc(params.event_date)).getTime();
      const myEnd = new Date(
        getEventDateUtc(params.event_end_date || params.event_date),
      ).getTime();

      const data = await this.quotationsRepository.findAll({
        company_id: companyId,
        statuses: [
          QuotationStatus.SOLICITADA,
          QuotationStatus.ENVIADA,
          QuotationStatus.EN_NEGOCIACION,
          QuotationStatus.ACEPTADA,
        ],
      });

      const has_conflicts = data.some((q) => {
        if (!q.event_date) return false;
        const qStart = new Date(q.event_date).getTime();
        const qEnd = q.event_end_date
          ? new Date(q.event_end_date).getTime()
          : qStart;
        return qStart <= myEnd && myStart <= qEnd;
      });

      return { has_conflicts };
    } catch (error) {
      this.logger.error(error);
      throw error;
    }
  }
}
