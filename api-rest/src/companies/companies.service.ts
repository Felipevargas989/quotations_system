import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { CompaniesRepository } from './companies.repository';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { Company } from './entities/company.entity';

@Injectable()
export class CompaniesService {
  constructor(
    private readonly companiesRepository: CompaniesRepository,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(CompaniesService.name);
  }
  // create(createCompanyDto: CreateCompanyDto) {
  //   return 'This action adds a new company';
  // }
  // findAll() {
  //   return `This action returns all companies`;
  // }
  // findOne(id: number) {
  //   return `This action returns a #${id} company`;
  // }
  async update(id: Company['id'], updateCompanyDto: UpdateCompanyDto) {
    this.logger.info(
      `update company with id ${id} and updateCompanyDto ${JSON.stringify(updateCompanyDto)}`,
    );
    try {
      return await this.companiesRepository.update(id, updateCompanyDto);
    } catch (error) {
      this.logger.error(error);
      throw error;
    }
  }
  // remove(id: number) {
  //   return `This action removes a #${id} company`;
  // }
}
