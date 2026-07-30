import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PostgrestError } from '@supabase/supabase-js';
import { PinoLogger } from 'nestjs-pino';
import { Company } from 'src/companies/entities/company.entity';
import { EmailService } from 'src/email/email.service';
import { EmailStructure } from 'src/email/types';
import { QuotationStatus } from 'src/quotations/constants/constants';
import { Quotation } from 'src/quotations/entities/quotation.entity';
import { QuotationsRepository } from 'src/quotations/quotations.repository';
import { QuotationsService } from 'src/quotations/quotations.service';
import { PaymentStatus } from './constants';
import { CreateOverflowTransactionDto } from './dto/create-overflow-transaction.dto';
import { CreatePaymentPlanDto } from './dto/create-payment-plan.dto';
import { CreatePaymentTransactionDto } from './dto/create-payment-transaction.dto';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { UpdatePaymentScheduleDto } from './dto/update-payment-schedule.dto';
import { UpdatePaymentTransactionDto } from './dto/update-payment-transaction.dto';
import { UpdatePaymentDto } from './dto/update-payment.dto';
import { Payment, PaymentTransaction } from './entities/payment.entity';
import {
  CreatePayment,
  CreatePaymentTransaction,
  PaymentWithTransactionsAndQuotation,
  UpdatePayment,
  UpdatePaymentTransaction,
} from './interfaces/payments.types';
import { PaymentsRepository } from './payments.repository';

/**
 * Service responsible for managing payment operations including
 * payment plans, transactions, and automated overdue payment updates.
 */
@Injectable()
export class PaymentsService {
  constructor(
    private readonly paymentsRepository: PaymentsRepository,
    private readonly quotationsRepository: QuotationsRepository,
    @Inject(forwardRef(() => QuotationsService))
    private readonly quotationsService: QuotationsService,
    private readonly emailService: EmailService,
    private readonly logger: PinoLogger,
  ) {}
  /**
   * Creates a payment plan for a quotation.
   * Deletes existing payments, creates new ones, and updates quotation status to 'aceptada'.
   *
   * @param createPaymentPlanDto - The payment plan details
   * @param companyId - The company ID
   * @returns {Promise<void>}
   */
  async createPaymentPlan(
    createPaymentPlanDto: CreatePaymentPlanDto,
    companyId: Company['id'],
  ) {
    this.logger.info(
      `createPaymentPlan with createPaymentPlanDto ${JSON.stringify(createPaymentPlanDto)}`,
    );
    // 1. Delete existing payments
    await this.paymentsRepository.deletePaymentsByQuotationId(
      createPaymentPlanDto.quotation_id,
      companyId,
    );

    // 2. Create new payments
    await this.paymentsRepository.createPaymentPlan(
      createPaymentPlanDto.payments,
    );

    // 3. Get quotation details
    const { data: quotation } = await this.quotationsService.findOne(
      createPaymentPlanDto.quotation_id,
    );

    // 4. Send email to client with payment plan details
    try {
      if (
        quotation &&
        quotation.quotation_status !== QuotationStatus.ACEPTADA
      ) {
        const portalToken = await this.quotationsService.portalTokenOf(
          quotation.client_contact_id,
        );
        void this.emailService.sendEmail(
          quotation.clients.email,
          EmailStructure.PAYMENT_PLAN_CREATED,
          {
            clientName: quotation.clients.name,
            companyName: quotation.companies.name,
            quotationNumber: quotation.quotation_number,
            payments: createPaymentPlanDto.payments.map((payment) => ({
              payment_number: payment.payment_number,
              amount: payment.amount,
              due_date: payment.due_date,
            })),
          },
          companyId,
          portalToken,
        );
      }
    } catch (error) {
      // Do not throw error, just log it
      this.logger.error(error);
    }

    // 5. Update the quotation status to 'aceptada'
    await this.quotationsRepository.update(
      createPaymentPlanDto.quotation_id,
      { quotation_status: QuotationStatus.ACEPTADA },
      companyId,
    );
  }

  async createPayment(
    createPaymentDto: CreatePaymentDto,
    companyId: Company['id'],
  ) {
    this.logger.info(
      `createPayment with createPaymentDto ${JSON.stringify(createPaymentDto)}`,
    );

    try {
      let nextPaymentNumber: number = 1;

      // 1. Get the next payment number for this payment
      const { data: payments, error: paymentsError } =
        await this.paymentsRepository.findAllPaymentsFromQuotation(
          [createPaymentDto.quotation_id],
          companyId,
        );
      if (paymentsError) {
        this.logger.error(paymentsError);
        throw paymentsError;
      }
      if (payments && payments.length > 0) {
        nextPaymentNumber = payments[payments.length - 1].payment_number + 1;
      }

      // 2. Set due_date
      // Calculate due_date: if event_date exists, use 1 week after event date; otherwise use today
      const { data: quotation, error: quotationError } =
        await this.quotationsRepository.findOne(createPaymentDto.quotation_id);
      if (quotationError) {
        this.logger.error(quotationError);
        throw quotationError;
      }

      if (!quotation) {
        this.logger.error('Quotation not found');
        throw new Error('Quotation not found');
      }

      const dueDate = quotation.event_date
        ? new Date(quotation.event_date).getTime() + 7 * 24 * 60 * 60 * 1000
        : new Date().getTime();

      // 3. create payment
      const newPayment: CreatePayment = {
        quotation_id: createPaymentDto.quotation_id,
        amount: createPaymentDto.amount,
        notes: createPaymentDto.notes,
        status: PaymentStatus.PENDIENTE,
        payment_number: nextPaymentNumber,
        due_date: new Date(dueDate),
      };

      return this.paymentsRepository.createPayment(newPayment);
    } catch (error) {
      this.logger.error(error);
      throw error;
    }
  }

  // Elimina el plan de pagos completo de una cotización. Solo se usa cuando
  // NO hay dinero registrado (guardia de estados en QuotationsService.update):
  // volver una cotización a pre-venta no debe dejar cuotas huérfanas.
  deletePaymentPlan(quotationId: Quotation['id'], companyId: Company['id']) {
    this.logger.info(
      `deletePaymentPlan for quotation ${quotationId} (state guard)`,
    );
    return this.paymentsRepository.deletePaymentsByQuotationId(
      quotationId,
      companyId,
    );
  }

  /**
   * Calendario de pagos, Nivel A: edita SOLO la fecha de vencimiento y
   * la nota de una cuota. Cuotas con dinero registrado (pagadas o con
   * abonos) son intocables por esta vía — para eso está rectificar el
   * registro. Si cambia la fecha, el estado se re-cuadra solo
   * (pendiente/vencido según el nuevo vencimiento).
   */
  async updatePaymentSchedule(
    paymentId: Payment['id'],
    dto: UpdatePaymentScheduleDto,
    companyId: Company['id'],
  ) {
    this.logger.info(`updatePaymentSchedule with paymentId ${paymentId}`);

    const { data: payment, error } =
      await this.paymentsRepository.findPaymentById(paymentId, companyId);
    if (error || !payment) {
      throw new NotFoundException('Cuota no encontrada');
    }

    const { data: transactions } =
      await this.paymentsRepository.findAllTransactionsByPaymentId(paymentId);
    const hasMoney =
      (payment.status as PaymentStatus) === PaymentStatus.PAGADO ||
      (transactions || []).length > 0;
    if (hasMoney) {
      throw new BadRequestException(
        'Esta cuota ya tiene dinero registrado: su fecha y nota no se pueden editar. Si el registro está mal, rectifícalo desde el calendario de pagos.',
      );
    }

    const fields: UpdatePayment = {};
    if (dto.due_date !== undefined) {
      fields.due_date = dto.due_date as unknown as Payment['due_date'];
      const hoy = new Date().toISOString().slice(0, 10);
      fields.status =
        dto.due_date < hoy ? PaymentStatus.VENCIDO : PaymentStatus.PENDIENTE;
    }
    if (dto.notes !== undefined) {
      fields.notes = dto.notes;
    }

    const { error: updateError } = await this.paymentsRepository.updatePayment(
      paymentId,
      fields,
    );
    if (updateError) throw updateError;

    return {
      updated: true,
      status: fields.status ?? payment.status,
    };
  }

  findAllPaymentsFromQuotation(
    quotationIds: Quotation['id'][],
    companyId: Company['id'],
    filterStatus?: PaymentStatus[],
  ): Promise<{
    data: PaymentWithTransactionsAndQuotation[] | null;
    error: PostgrestError | null;
  }> {
    return this.paymentsRepository.findAllPaymentsFromQuotation(
      quotationIds,
      companyId,
      filterStatus,
    );
  }

  async findAllPaymentsWithTransactions(companyId: Company['id']) {
    this.logger.info(
      `findAllPaymentsWithTransactions with companyId ${companyId}`,
    );
    const { data: payments, error } =
      await this.paymentsRepository.findAllPaymentsWithTransactions(companyId);

    if (error) {
      this.logger.error(error);
      throw new Error(error.message);
    }
    // get stats
    const paymentsWithTransactions = payments.map((payment) => {
      const transactions = payment.payment_transactions;
      const paid_amount = transactions.reduce(
        (sum: number, t: PaymentTransaction) => sum + t.amount,
        0,
      );
      const payment_count = transactions.length;
      // TODO: check if tranasctions[0] makes sense now. Maybe now it requires a sort
      const last_payment_date =
        transactions.length > 0 ? transactions[0].transaction_date : null;

      // delete payment_transactions from payment object
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { payment_transactions, ...paymentWithoutTransactions } = payment;

      return {
        ...paymentWithoutTransactions,
        transactions,
        paid_amount,
        payment_count,
        last_payment_date,
      };
    });

    return paymentsWithTransactions;
  }

  /**
   * Creates a new payment transaction for a payment.
   *
   * @param createPaymentTransactionDto - The transaction details
   * @param companyId - The company ID
   * @returns {Promise<PaymentTransaction>} The created transaction
   * @throws {Error} If validation fails or transaction amount exceeds payment amount
   */
  async createPaymentTransaction(
    createPaymentTransactionDto: CreatePaymentTransactionDto,
    companyId: Company['id'],
  ) {
    return this.createOrUpdatePaymentTransaction(
      createPaymentTransactionDto,
      companyId,
    );
  }

  /**
   * Registers a payment with "overflow" (derrame): the amount cascades across
   * the pending/overdue installments starting from the EARLIEST one, creating
   * one transaction per touched installment and marking as PAGADO each
   * installment that gets fully covered. Sends a SINGLE email to the client
   * with the total amount.
   *
   * @param dto - quotation_id, total amount, method, date, notes, receipt url
   * @param companyId - The company ID
   * @returns Distribution summary: one entry per touched installment
   */
  async createOverflowPaymentTransaction(
    dto: CreateOverflowTransactionDto,
    companyId: Company['id'],
  ) {
    this.logger.info(
      `createOverflowPaymentTransaction with dto ${JSON.stringify(dto)}`,
    );
    try {
      // 1. Get pending/overdue payments (ordered by payment_number asc)
      const { data: payments, error } =
        await this.paymentsRepository.findAllPaymentsFromQuotation(
          [dto.quotation_id],
          companyId,
          [PaymentStatus.PENDIENTE, PaymentStatus.VENCIDO],
        );
      if (error) {
        this.logger.error(error);
        throw error;
      }
      if (!payments || payments.length === 0) {
        throw new Error('No hay cuotas pendientes para esta cotización');
      }

      // 2. Compute the remaining amount per installment
      const withRemaining = payments
        .map((payment) => {
          const alreadyPaid = (payment.payment_transactions || []).reduce(
            (sum: number, t: PaymentTransaction) => sum + t.amount,
            0,
          );
          return { payment, remaining: payment.amount - alreadyPaid };
        })
        .filter((x) => x.remaining > 0);

      const totalRemaining = withRemaining.reduce(
        (sum, x) => sum + x.remaining,
        0,
      );
      if (dto.amount > totalRemaining) {
        throw new Error(
          `El monto no puede exceder el saldo pendiente total (${totalRemaining})`,
        );
      }

      // 3. Cascade (derrame): fill each installment in order until the
      //    amount runs out.
      let left = dto.amount;
      const distribution: {
        payment_id: Payment['id'];
        payment_number: number;
        amount: number;
        fully_paid: boolean;
      }[] = [];

      for (const { payment, remaining } of withRemaining) {
        if (left <= 0) break;
        const portion = Math.min(remaining, left);

        const { error: txError } =
          await this.paymentsRepository.createPaymentTransaction({
            payment_id: payment.id,
            quotation_id: dto.quotation_id,
            amount: portion,
            payment_method: dto.payment_method,
            transaction_date: dto.transaction_date,
            notes: dto.notes,
            receipt_photo_url: dto.receipt_photo_url,
          } as CreatePaymentTransaction);
        if (txError) {
          this.logger.error(txError);
          throw txError;
        }

        const fullyPaid = portion === remaining;
        if (fullyPaid) {
          const { error: updError } =
            await this.paymentsRepository.updatePayment(payment.id, {
              status: PaymentStatus.PAGADO,
            });
          if (updError) {
            this.logger.error(updError);
            throw updError;
          }
        }

        distribution.push({
          payment_id: payment.id,
          payment_number: payment.payment_number,
          amount: portion,
          fully_paid: fullyPaid,
        });
        left -= portion;
      }

      // 4. Send ONE email to the client with the total amount
      try {
        const { data: quotation } = await this.quotationsService.findOne(
          dto.quotation_id,
        );
        if (quotation && quotation.clients.email) {
          const portalToken = await this.quotationsService.portalTokenOf(
            quotation.client_contact_id,
          );
          void this.emailService.sendEmail(
            quotation.clients.email,
            EmailStructure.PAYMENT_RECEIVED,
            {
              clientName: quotation.clients.name,
              companyName: quotation.companies.name,
              amount: dto.amount,
              paymentMethod: dto.payment_method || '',
              transactionDate: dto.transaction_date || new Date(),
            },
            companyId,
            portalToken,
          );
        }
      } catch (emailError) {
        // Log email error but don't throw - payments were already created
        this.logger.error(
          `Failed to send payment received email: ${emailError}`,
        );
      }

      // Regla de cuadratura: si la última cuota tocada quedó a medias,
      // se divide (parte pagada + cuota nueva por el remanente).
      const lastTouched = distribution[distribution.length - 1];
      if (lastTouched && !lastTouched.fully_paid) {
        await this.normalizePaymentAfterTransactions(
          lastTouched.payment_id,
          companyId,
        );
      }

      return { total: dto.amount, distribution };
    } catch (error) {
      this.logger.error(error);
      throw new Error(error);
    }
  }

  async updatePaymentTransaction(
    paymentTransactionId: PaymentTransaction['id'],
    updatePaymentTransactionDto: UpdatePaymentTransactionDto,
    companyId: Company['id'],
  ) {
    this.logger.info(
      `updatePaymentTransaction with id ${paymentTransactionId} and updatePaymentTransactionDto ${JSON.stringify(updatePaymentTransactionDto)}`,
    );
    return this.createOrUpdatePaymentTransaction(
      {
        ...updatePaymentTransactionDto,
        payment_transaction_id: paymentTransactionId,
      } as UpdatePaymentTransaction,
      companyId,
      true,
    );
  }

  async createOrUpdatePaymentTransaction(
    payload: CreatePaymentTransactionDto | UpdatePaymentTransaction,
    companyId: Company['id'],
    isUpdate: boolean = false,
  ) {
    try {
      let transaction: PaymentTransaction | null = null;
      let payment_id: Payment['id'] = !isUpdate
        ? (payload as CreatePaymentTransactionDto).payment_id
        : '';
      let transactionFromDB: PaymentTransaction | null = null;

      // 0. if it's udpate, get payment_id from paymentTransactionId
      if (isUpdate) {
        const { data: _transactionFromDB, error: transactionError } =
          await this.paymentsRepository.findPaymentTransactionById(
            (payload as UpdatePaymentTransaction).payment_transaction_id,
          );
        if (transactionError) {
          this.logger.error(transactionError);
          throw transactionError;
        }
        if (!_transactionFromDB) {
          this.logger.error('Transaction not found');
          throw new Error('Transaction not found');
        }
        transactionFromDB = _transactionFromDB;
        payment_id = transactionFromDB.payment_id;
      }

      // 1. Get current payment to validate against limits
      const { data: payment, error: paymentError } =
        await this.paymentsRepository.findPaymentById(payment_id, companyId);

      if (paymentError) {
        this.logger.error(paymentError);
        throw paymentError;
      }
      if (!payment) {
        this.logger.error('Payment not found');
        throw new Error('Payment not found');
      }

      // 2. Get all current transactions for this payment to calculate current total
      const { data: transactions, error: transactionsError } =
        await this.paymentsRepository.findAllTransactionsByPaymentId(
          payment_id,
        );

      if (transactionsError) {
        this.logger.error(transactionsError);
        throw transactionsError;
      }

      // 3. Run validation of current_paid < amount
      const current_paid = transactions.reduce(
        (sum: number, t: PaymentTransaction) => sum + t.amount,
        0,
      );
      const new_paid =
        current_paid +
        payload.amount -
        (isUpdate ? transactionFromDB?.amount || 0 : 0);
      if (new_paid > payment.amount) {
        this.logger.error('Current paid is greater than amount');
        throw new Error(
          isUpdate
            ? `El monto excede esta cuota (máximo ${payment.amount - current_paid + (transactionFromDB?.amount || 0)}). Para un pago mayor, elimina el registro y regístralo de nuevo: el excedente se derramará a las cuotas siguientes.`
            : `El monto total no puede exceder ${payment.amount - current_paid}`,
        );
      }

      // 4. Create one or update transaction

      // 4.1 Create new transaction
      if (!isUpdate) {
        const { data: newTransaction, error: newTransactionError } =
          await this.paymentsRepository.createPaymentTransaction(
            payload as CreatePaymentTransaction,
          );

        if (newTransactionError) {
          this.logger.error(newTransactionError);
          throw newTransactionError;
        }

        transaction = newTransaction;

        // Send email to client with payment transaction details
        try {
          const { data: quotation } = await this.quotationsService.findOne(
            (payload as CreatePaymentTransaction).quotation_id,
          );

          if (quotation && quotation.clients.email) {
            const portalToken = await this.quotationsService.portalTokenOf(
              quotation.client_contact_id,
            );
            void this.emailService.sendEmail(
              quotation.clients.email,
              EmailStructure.PAYMENT_RECEIVED,
              {
                clientName: quotation.clients.name,
                companyName: quotation.companies.name,
                amount: payload.amount || 0,
                paymentMethod: payload.payment_method || '',
                transactionDate: payload.transaction_date || new Date(),
              },
              companyId,
              portalToken,
            );
          }
        } catch (emailError) {
          // Log email error but don't throw - payment was already created
          this.logger.error(
            `Failed to send payment received email: ${emailError}`,
          );
        }
      }

      // 4.2 Update transaction
      else {
        const { payment_transaction_id, ...payloadWithoutId } =
          payload as UpdatePaymentTransaction;

        const { data: updatedTransaction, error: updatedTransactionError } =
          await this.paymentsRepository.updatePaymentTransaction(
            payment_transaction_id,
            payloadWithoutId,
          );

        if (updatedTransactionError) {
          this.logger.error(updatedTransaction);
          throw updatedTransactionError;
        }

        transaction = updatedTransaction;
      }
      // 5. Cuadratura de la cuota (regla de Felipe, 20-07-2026): tras
      //    cualquier registro, la cuota queda 100% pagada o 100%
      //    pendiente; un pago parcial divide la cuota.
      await this.normalizePaymentAfterTransactions(payment_id, companyId);

      // 6. Return new transaction
      return transaction;
    } catch (error) {
      this.logger.error(error);
      throw new Error(error);
    }
  }
  // findOne(id: number) {
  //   return `This action returns a #${id} payment`;
  // }

  update(id: Payment['id'], updatePaymentDto: UpdatePaymentDto) {
    return this.paymentsRepository.updatePayment(id, updatePaymentDto);
  }
  async removePaymentTransaction(id: number, companyId: Company['id']) {
    this.logger.info(`removePaymentTransaction with id ${id}`);
    const { data: tx } =
      await this.paymentsRepository.findPaymentTransactionById(id);
    const result = await this.paymentsRepository.removePaymentTransaction(id);
    // La cuota vuelve a pendiente/vencido (o se re-cuadra) segun lo que
    // quede abonado. La cuota nunca se elimina junto con el registro.
    if (tx?.payment_id) {
      await this.normalizePaymentAfterTransactions(tx.payment_id, companyId);
    }
    return result;
  }

  /**
   * Regla de cuadratura (Felipe, 20-07-2026): despues de cualquier
   * cambio de registros, toda cuota queda 100% pagada o 100% pendiente.
   * - abonado == monto  -> PAGADO
   * - 0 < abonado < monto -> DIVISION: la cuota queda pagada por lo
   *   abonado y nace una cuota nueva por el remanente, heredando la
   *   fecha de vencimiento original (si estaba vencida, nace vencida);
   *   las cuotas posteriores corren su numeracion.
   * - abonado == 0 -> vuelve a PENDIENTE o VENCIDO segun su fecha.
   */
  private async normalizePaymentAfterTransactions(
    paymentId: Payment['id'],
    companyId: Company['id'],
  ) {
    const { data: payment } = await this.paymentsRepository.findPaymentById(
      paymentId,
      companyId,
    );
    if (!payment) return;
    const { data: txs } =
      await this.paymentsRepository.findAllTransactionsByPaymentId(paymentId);
    const paid = (txs || []).reduce(
      (sum: number, t: PaymentTransaction) => sum + t.amount,
      0,
    );
    const overdue = new Date(payment.due_date) < new Date();

    if (paid <= 0) {
      await this.paymentsRepository.updatePayment(paymentId, {
        status: overdue ? PaymentStatus.VENCIDO : PaymentStatus.PENDIENTE,
        paid_date: null as unknown as Date,
      });
      return;
    }
    if (paid >= payment.amount) {
      await this.paymentsRepository.updatePayment(paymentId, {
        status: PaymentStatus.PAGADO,
      });
      return;
    }

    // Division de la cuota parcial
    const remainder = payment.amount - paid;
    const { data: siblings } =
      await this.paymentsRepository.findAllPaymentsFromQuotation(
        [payment.quotation_id],
        companyId,
      );
    const later = (siblings || [])
      .filter((p) => p.payment_number > payment.payment_number)
      .sort((a, b) => b.payment_number - a.payment_number);
    for (const p of later) {
      await this.paymentsRepository.updatePayment(p.id, {
        payment_number: p.payment_number + 1,
      });
    }
    await this.paymentsRepository.updatePayment(paymentId, {
      amount: paid,
      status: PaymentStatus.PAGADO,
    });
    await this.paymentsRepository.createPayment({
      quotation_id: payment.quotation_id,
      payment_number: payment.payment_number + 1,
      amount: remainder,
      due_date: payment.due_date,
      status: overdue ? PaymentStatus.VENCIDO : PaymentStatus.PENDIENTE,
      payment_type: payment.payment_type,
      notes: payment.notes,
    } as CreatePayment);
  }

  async removePayment(id: Payment['id']) {
    this.logger.info(`removePayment with id ${id}`);

    // 1. remove all payment_transactions related to the payment
    const { error } =
      await this.paymentsRepository.removePaymentTransactionsByPaymentId(id);

    if (error) {
      this.logger.error(error);
      throw error;
    }

    // 2. remove the payment by payment_id
    return this.paymentsRepository.removePayment(id);
  }

  /**
   * Scheduled task that runs daily at 1 AM to update overdue payments.
   * Changes payment status from PENDIENTE to VENCIDO for payments past their due date.
   *
   * @throws {Error} If the update operation fails
   * @returns {Promise<void>}
   */
  @Cron(CronExpression.EVERY_DAY_AT_1AM)
  async updateOverduePayments() {
    this.logger.info('CRON job to update overdue payments');
    try {
      // Update status of overdue payments to PENDIENTE
      const { data, error, status } =
        await this.paymentsRepository.updateOverduePayments();

      if (error) {
        this.logger.error(error);
        throw error;
      }

      // get payments ids who have been updated
      const paymentsIds = data.map((payment: Payment) => payment.id);

      const paymentsIdsMessage =
        paymentsIds.length > 0
          ? ` Payments ids: ${paymentsIds.join(', ')}`
          : '';

      this.logger.info(
        `Updated ${data.length} overdue payments with status ${status}.${paymentsIdsMessage}`,
      );
    } catch (error) {
      this.logger.error(error);
      throw error;
    }
  }
}
