import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { Company } from 'src/companies/entities/company.entity';
import { PlansRepository } from './plans.repository';

@Injectable()
export class PlansService {
  constructor(
    private readonly plansRepository: PlansRepository,
    private readonly logger: PinoLogger,
  ) {}
  async confirmPlan(companyId: Company['id']) {
    this.logger.info(`confirmPlan with companyId ${companyId}`);
    try {
      return await this.plansRepository.confirmPlan(companyId);
    } catch (error) {
      this.logger.error(error);
      throw new HttpException(error, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
}
