import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { UsersRepository } from 'src/users/users.repository';
import { QuotationsRepository } from './quotations.repository';

@Injectable()
export class QuotationsService {
  constructor(
    private readonly quotationsRepository: QuotationsRepository,
    private readonly usersRepository: UsersRepository,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(QuotationsService.name);
  }
  // create(createQuotationDto: CreateQuotationDto) {
  //   return 'This action adds a new quotation';
  // }

  async findAll(companyId: number) {
    this.logger.info(`findAll quotations with params ${companyId}`);
    return this.quotationsRepository.findAll(companyId);
  }

  // findOne(id: number) {
  //   return `This action returns a #${id} quotation`;
  // }

  // update(id: number, updateQuotationDto: UpdateQuotationDto) {
  //   return `This action updates a #${id} quotation`;
  // }

  // remove(id: number) {
  //   return `This action removes a #${id} quotation`;
  // }
}
