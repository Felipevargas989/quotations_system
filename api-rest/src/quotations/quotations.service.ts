import { Injectable } from '@nestjs/common';
import { User } from 'src/users/entities/user.entity';
import { QuotationsRepository } from './quotations.repository';
import { UsersRepository } from 'src/users/users.repository';
import { PinoLogger } from 'nestjs-pino';

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

  async findAll(user: User) {
    this.logger.info(`findAll quotations with params ${user.id}`);
    const userExtended = await this.usersRepository.findOne(user.id);
    return this.quotationsRepository.findAll(userExtended.company_id);
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
