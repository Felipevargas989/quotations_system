import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
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

  // findAll() {
  //   return `This action returns all refunds`;
  // }

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
