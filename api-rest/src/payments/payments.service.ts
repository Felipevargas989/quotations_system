import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { Company } from 'src/companies/entities/company.entity';
import { QuotationStatus } from 'src/quotations/constants/constants';
import { Quotation } from 'src/quotations/entities/quotation.entity';
import { QuotationsRepository } from 'src/quotations/quotations.repository';
import { PaymentStatus } from './constants';
import { CreatePaymentPlanDto } from './dto/create-payment-plan.dto';
import { CreatePaymentTransactionDto } from './dto/create-payment-transaction.dto';
import { PaymentTransaction } from './entities/payment.entity';
import { CreatePaymentTransaction } from './interfaces/payments.types';
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
    try {
      // 1. Get current payment to validate against limits
      const { data: payment, error: paymentError } =
        await this.paymentsRepository.findPaymentById(
          createPaymentTransactionDto.payment_id,
          companyId,
        );

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
          createPaymentTransactionDto.payment_id,
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
      const new_paid = current_paid + createPaymentTransactionDto.amount;
      if (new_paid > payment.amount) {
        this.logger.error('Current paid is greater than amount');
        throw new Error(
          `El monto total no puede exceder ${payment.amount - current_paid}`,
        );
      }

      // 4. Create new transaction
      const { data: newTransaction, error: newTransactionError } =
        await this.paymentsRepository.createPaymentTransaction(
          createPaymentTransactionDto as CreatePaymentTransaction,
        );

      if (newTransactionError) {
        this.logger.error(newTransactionError);
        throw newTransactionError;
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
        await this.paymentsRepository.updatePayment(
          createPaymentTransactionDto.payment_id,
          { status: getPaymentStatus() },
        );

      if (updatedPaymentError) {
        this.logger.error(updatedPaymentError);
        throw updatedPaymentError;
      }

      // 6. Return new transaction
      return newTransaction;
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

  // remove(id: number) {
  //   return `This action removes a #${id} payment`;
  // }
}
