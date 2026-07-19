import {
  BadRequestException,
  Inject,
  Injectable,
  forwardRef,
} from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { ClientsService } from 'src/clients/clients.service';
import { Client } from 'src/clients/entities/client.entity';
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
  async create(
    createQuotationDto: CreateQuotationDto,
    companyId: number,
    userId: string | undefined,
  ) {
    this.logger.info(
      `create quotation with createQuotationDto ${JSON.stringify(createQuotationDto)}`,
    );
    // set quotation number as the last quotation number + 1
    // get all quotations from the same company
    const quotations = await this.quotationsRepository.findAll({
      company_id: companyId,
      sort_by: 'quotation_number',
      sort_order: 'asc',
    });
    let quotationNumber = 1;
    if (quotations.length > 0) {
      quotationNumber = quotations[quotations.length - 1].quotation_number + 1;
    }
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
      `createPublic quotation with createQuotationPublicDto ${JSON.stringify(createQuotationPublicDto)}`,
    );
    // check if client exists (try to get a client with the same email or phone)
    const { data: existingClient } = await this.clientsService.findOne(
      company_id,
      undefined,
      createQuotationPublicDto.email,
      createQuotationPublicDto.phone,
    );

    // if not client, create a new one
    let clientId: string;
    if (existingClient) {
      // throw new Error('Client already exists');
      clientId = (existingClient as Client).id;
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
  }: {
    companyId: number;
    request_type?: RequestType;
    statuses?: QuotationStatus[];
    dateRange?: { start_date: Date; end_date: Date };
    sort_by?: 'quotation_number' | 'event_date' | 'status';
    sort_order?: 'asc' | 'desc';
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
    });
  }

  findOne(id: string) {
    this.logger.info(`findOne quotation with id ${id}`);
    return this.quotationsRepository.findOne(id);
  }

  // Evento REALIZADO: cambia el estado y dispara la encuesta de satisfacción
  // al cliente. La encuesta sale UNA sola vez: survey_sent_at se estampa solo
  // cuando el correo salió bien, y bloquea reenvíos si el evento se re-marca.
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
    let surveySent = false;
    if (!alreadySurveyed && quotation.clients?.email) {
      try {
        await this.emailService.sendEmail(
          quotation.clients.email,
          EmailStructure.CUSTOMER_SATISFACTION_SURVEY,
          {
            clientName: quotation.clients.name,
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
      client_has_email: Boolean(quotation.clients?.email),
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
            await this.refundsService.findPendingByQuotation(id);

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
          void this.emailService.sendEmail(
            quotation.clients.email,
            EmailStructure.QUOTATION_IS_SENT,
            {
              clientName: quotation.clients.name,
              companyName: quotation.companies.name,
              quotationNumber: quotation.quotation_number,
            },
            companyId,
          );
        }
      } catch (error) {
        // Do not throw error, just log it
        this.logger.error(error);
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
