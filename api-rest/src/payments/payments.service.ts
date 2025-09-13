import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { Company } from 'src/companies/entities/company.entity';
import { QuotationStatus } from 'src/quotations/constants/constants';
import { Quotation } from 'src/quotations/entities/quotation.entity';
import { QuotationsRepository } from 'src/quotations/quotations.repository';
import { CreatePaymentPlanDto } from './dto/create-payment-plan.dto';
import { PaymentTransaction } from './entities/payment.entity';
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
