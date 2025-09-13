import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { PaymentPlanType, RequestType } from './constants/constants';
import { CreateQuotationDto } from './dto/create-quotation.dto';
import { UpdateQuotationDto } from './dto/update-quotation.dto';
import { CreateQuotation } from './interfaces/quotations.interface';
import { QuotationsRepository } from './quotations.repository';

@Injectable()
export class QuotationsService {
  constructor(
    private readonly quotationsRepository: QuotationsRepository,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(QuotationsService.name);
  }
  async create(
    createQuotationDto: CreateQuotationDto,
    companyId: number,
    userId: string,
  ) {
    // set quotation number as the last quotation number + 1
    // get all quotations from the same company
    const quotations = await this.quotationsRepository.findAll(
      companyId,
      undefined,
      'quotation_number',
      'asc',
    );
    const lastQuotation = quotations[quotations.length - 1];
    const quotationNumber = lastQuotation.quotation_number + 1;

    const newQuotation: CreateQuotation = {
      client_id: createQuotationDto.client_id,
      event_type: createQuotationDto.event_type,
      people_count: createQuotationDto.people_count,
      observations: createQuotationDto.observations,
      event_date: new Date(createQuotationDto.event_date),
      company_id: companyId,
      total_amount: 0,
      quotation_status: createQuotationDto.quotation_status,
      quotation_number: quotationNumber,
      user_id: userId,
      value_per_person: 0,
      fixed_value: 0,
      request_type: createQuotationDto.request_type,
      requires_invoice: false,
      has_contract: false,
      // TODO: set real payment plan type
      payment_plan_type: PaymentPlanType.DEFAULT,
      discount_percentage: 0,
      subtotal_amount: 0,
      items: [],
    };
    return this.quotationsRepository.create(newQuotation);
  }

  async findAll(companyId: number, request_type?: RequestType) {
    this.logger.info(`findAll quotations with params ${companyId}`);
    return this.quotationsRepository.findAll(companyId, request_type);
  }

  // findOne(id: number) {
  //   return `This action returns a #${id} quotation`;
  // }

  update(
    id: string,
    updateQuotationDto: UpdateQuotationDto,
    companyId: number,
  ) {
    return this.quotationsRepository.update(id, updateQuotationDto, companyId);
  }

  remove(id: string, companyId: number) {
    return this.quotationsRepository.remove(id, companyId);
  }
}
