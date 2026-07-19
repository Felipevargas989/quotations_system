import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { Company } from 'src/companies/entities/company.entity';
import { CreateRefundDto } from './dto/create-refund.dto';
import { RefundsRepository } from './refunds.repository';
import { CreateRefundPayload } from './types';

@Injectable()
export class RefundsService {
  constructor(
    private readonly refundsRepository: RefundsRepository,
    private readonly logger: PinoLogger,
  ) {}

  async create(createRefundDto: CreateRefundDto) {
    this.logger.info(
      `create refund with createRefundDto ${JSON.stringify(createRefundDto)}`,
    );
    try {
      const newRefund: CreateRefundPayload = {
        ...createRefundDto,
        is_paid: false,
      };
      return await this.refundsRepository.create(newRefund);
    } catch (error) {
      this.logger.error(error);
      throw error;
    }
  }

  async findAll(companyId: Company['id']) {
    this.logger.info(`findAll refunds with companyId ${companyId}`);
    try {
      return await this.refundsRepository.findAll(companyId);
    } catch (error) {
      this.logger.error(error);
      throw error;
    }
  }

  // Compensación (tarea #42): los usa QuotationsService cuando el total de
  // un evento aceptado SUBE — la deuda nueva consume primero los reembolsos
  // pendientes, para que nunca convivan "te debo" y "me debes".
  async findPendingByQuotation(quotationId: string) {
    const { data, error } =
      await this.refundsRepository.findPendingByQuotation(quotationId);
    if (error) throw error;
    return data || [];
  }

  async updateAmount(id: string, amount: number) {
    const { error } = await this.refundsRepository.updateAmount(id, amount);
    if (error) throw error;
  }

  async remove(id: string) {
    const { error } = await this.refundsRepository.remove(id);
    if (error) throw error;
  }

  // findOne(id: number) {
  //   return `This action returns a #${id} refund`;
  // }

  // update(id: number, updateRefundDto: UpdateRefundDto) {
  //   return `This action updates a #${id} refund`;
  // }

  // remove(id: number) {
  //   return `This action removes a #${id} refund`;
  // }
}
