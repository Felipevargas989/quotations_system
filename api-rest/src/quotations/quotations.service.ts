import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import {
  PaymentPlanType,
  QuotationStatus,
  RequestType,
} from './constants/constants';
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
  create(
    createQuotationDto: CreateQuotationDto,
    companyId: number,
    userId: string,
  ) {
    const newQuotation: CreateQuotation = {
      client_id: createQuotationDto.client_id,
      event_type: createQuotationDto.event_type,
      people_count: createQuotationDto.people_count,
      observations: createQuotationDto.observations,
      event_date: new Date(createQuotationDto.event_date),
      company_id: companyId,
      total_amount: 0,
      // TODO: set real statuses
      quotation_status: QuotationStatus.PENDING,
      // TODO: set real quotation number (from prevous number from the same company)
      quotation_number: 0,
      user_id: userId,
      value_per_person: 0,
      fixed_value: 0,
      // TODO: set real request type
      request_type: RequestType.REQUERIMIENTO,
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
