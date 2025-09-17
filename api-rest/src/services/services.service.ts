import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { Company } from 'src/companies/entities/company.entity';
import { CreateServicesBulkDto } from './dto/create-services-bulk.dto';
import { FixedService, VariableService } from './entities/service.entity';
import { ServicesRepository } from './services.repository';

@Injectable()
export class ServicesService {
  constructor(
    private readonly servicesRepository: ServicesRepository,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(ServicesService.name);
  }
  async createServicesBulk(
    createServicesBulkDto: CreateServicesBulkDto,
    companyId: Company['id'],
  ) {
    this.logger.info(
      `createServicesBulk with createServicesBulkDto ${JSON.stringify(createServicesBulkDto)}`,
    );
    try {
      // create variable services
      const variableServices: Omit<VariableService, 'id'>[] =
        createServicesBulkDto.variable_services.map((service) => ({
          ...service,
          company_id: companyId,
        }));
      // create fixed services
      const fixedServices: Omit<FixedService, 'id'>[] =
        createServicesBulkDto.fixed_services.map((service) => ({
          ...service,
          company_id: companyId,
        }));

      // create variable services in DB
      await this.servicesRepository.createVariableServices(variableServices);
      // create fixed services in DB
      await this.servicesRepository.createFixedServices(fixedServices);

      return {
        variableServices,
        fixedServices,
      };
    } catch (error) {
      this.logger.error(error);
      throw new Error(error);
    }
  }

  async findAll(companyId: Company['id']) {
    this.logger.info(`findAll services with companyId ${companyId}`);

    try {
      // find all variable services
      const variableServices =
        await this.servicesRepository.findAllVariableServices(companyId);
      // find all fixed services
      const fixedServices =
        await this.servicesRepository.findAllFixedServices(companyId);

      return {
        variableServices: variableServices.data,
        fixedServices: fixedServices.data,
      };
    } catch (error) {
      this.logger.error(error);
      throw new Error(error);
    }
  }

  // findOne(id: number) {
  //   return `This action returns a #${id} service`;
  // }

  // update(id: number, updateServiceDto: UpdateServiceDto) {
  //   return `This action updates a #${id} service`;
  // }

  // remove(id: number) {
  //   return `This action removes a #${id} service`;
  // }
}
