import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { Company } from 'src/companies/entities/company.entity';
import { QuotationStatus } from 'src/quotations/constants/constants';
import { Quotation } from 'src/quotations/entities/quotation.entity';
import { QuotationsRepository } from 'src/quotations/quotations.repository';
import { PaymentStatus } from './constants';
import { CreatePaymentPlanDto } from './dto/create-payment-plan.dto';
import { CreatePaymentTransactionDto } from './dto/create-payment-transaction.dto';
import { UpdatePaymentTransactionDto } from './dto/update-payment-transaction.dto';
import { Payment, PaymentTransaction } from './entities/payment.entity';
import {
  CreatePaymentTransaction,
  UpdatePaymentTransaction,
} from './interfaces/payments.types';
import { PaymentsRepository } from './payments.repository';

@Injectable()
export class PaymentsService {
  constructor(
    private readonly paymentsRepository: PaymentsRepository,
    private readonly quotationsRepository: QuotationsRepository,
    private readonly logger: PinoLogger,
  ) {}
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

    // 3. Update the quotation status to 'aceptada'
    await this.quotationsRepository.update(
      createPaymentPlanDto.quotation_id,
      { quotation_status: QuotationStatus.ACEPTADA },
      companyId,
    );
  }

  // create(createPaymentDto: CreatePaymentDto) {
  //   return 'This action adds a new payment';
  // }

  findAllPaymentsFromQuotation(
    quotationId: Quotation['id'],
    companyId: Company['id'],
  ) {
    return this.paymentsRepository.findAllPaymentsFromQuotation(
      quotationId,
      companyId,
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

  async createPaymentTransaction(
    createPaymentTransactionDto: CreatePaymentTransactionDto,
    companyId: Company['id'],
  ) {
    return this.createOrUpdatePaymentTransaction(
      createPaymentTransactionDto,
      companyId,
    );
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
      // 0. if it's udpate, get payment_id from paymentTransactionId
      if (isUpdate) {
        const { data: transactionFromDB, error: transactionError } =
          await this.paymentsRepository.findPaymentTransactionById(
            (payload as UpdatePaymentTransaction).payment_transaction_id,
          );
        if (transactionError) {
          this.logger.error(transactionError);
          throw transactionError;
        }
        if (!transactionFromDB) {
          this.logger.error('Transaction not found');
          throw new Error('Transaction not found');
        }
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
      const new_paid = current_paid + payload.amount;
      if (new_paid > payment.amount) {
        this.logger.error('Current paid is greater than amount');
        throw new Error(
          `El monto total no puede exceder ${payment.amount - current_paid}`,
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
      // 5.0 Define payment status
      const getPaymentStatus = () => {
        if (new_paid === payment.amount) {
          return PaymentStatus.PAGADO;
        }
        if (payment.due_date < new Date()) {
          return PaymentStatus.VENCIDO;
        }
        return PaymentStatus.PENDIENTE;
      };

      // 5.1 Update payment status
      const { error: updatedPaymentError } =
        await this.paymentsRepository.updatePayment(payment_id, {
          status: getPaymentStatus(),
        });

      if (updatedPaymentError) {
        this.logger.error(updatedPaymentError);
        throw updatedPaymentError;
      }

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

  // update(id: number, updatePaymentDto: UpdatePaymentDto) {
  //   return `This action updates a #${id} payment`;
  // }
  removePaymentTransaction(id: number) {
    this.logger.info(`removePaymentTransaction with id ${id}`);
    return this.paymentsRepository.removePaymentTransaction(id);
  }
}
