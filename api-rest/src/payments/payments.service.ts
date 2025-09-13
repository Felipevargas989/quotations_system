import { Injectable } from '@nestjs/common';
import { Company } from 'src/companies/entities/company.entity';
import { Quotation } from 'src/quotations/entities/quotation.entity';
import { PaymentsRepository } from './payments.repository';

@Injectable()
export class PaymentsService {
  constructor(private readonly paymentsRepository: PaymentsRepository) {}
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
