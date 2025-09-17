import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { Company } from 'src/companies/entities/company.entity';
import { CreateFixedServiceDto } from './dto/create-fixed-service.dto';
import { CreateServicesBulkDto } from './dto/create-services-bulk.dto';
import { CreateVariableServiceDto } from './dto/create-variable-service.dto';
import { UpdateFixedServiceDto } from './dto/update-fixed-service.dto';
import { UpdateVariableServiceDto } from './dto/update-variable-service.dto';
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

  async updateVariableService(
    id: VariableService['id'],
    updateVariableServiceDto: UpdateVariableServiceDto,
  ) {
    this.logger.info(
      `updateVariableService with id ${id} and updateVariableServiceDto ${JSON.stringify(updateVariableServiceDto)}`,
    );
    try {
      return await this.servicesRepository.updateVariableService(
        id,
        updateVariableServiceDto,
      );
    } catch (error) {
      this.logger.error(error);
      throw new Error(error);
    }
  }

  async updateFixedService(
    id: FixedService['id'],
    updateFixedServiceDto: UpdateFixedServiceDto,
  ) {
    this.logger.info(
      `updateFixedService with id ${id} and updateFixedServiceDto ${JSON.stringify(updateFixedServiceDto)}`,
    );
    try {
      return await this.servicesRepository.updateFixedService(
        id,
        updateFixedServiceDto,
      );
    } catch (error) {
      this.logger.error(error);
      throw new Error(error);
    }
  }

  async createVariableService(
    createVariableServiceDto: CreateVariableServiceDto,
    companyId: Company['id'],
  ) {
    this.logger.info(
      `createVariableService with createVariableServiceDto ${JSON.stringify(createVariableServiceDto)}`,
    );
    try {
      const serviceData = {
        ...createVariableServiceDto,
        company_id: companyId,
      };
      return await this.servicesRepository.createVariableService(serviceData);
    } catch (error) {
      this.logger.error(error);
      throw new Error(error);
    }
  }

  async createFixedService(
    createFixedServiceDto: CreateFixedServiceDto,
    companyId: Company['id'],
  ) {
    this.logger.info(
      `createFixedService with createFixedServiceDto ${JSON.stringify(createFixedServiceDto)}`,
    );
    try {
      const serviceData = {
        ...createFixedServiceDto,
        company_id: companyId,
      };
      return await this.servicesRepository.createFixedService(serviceData);
    } catch (error) {
      this.logger.error(error);
      throw new Error(error);
    }
  }

  async removeVariableService(id: VariableService['id']) {
    this.logger.info(`removeVariableService with id ${id}`);
    return await this.servicesRepository.removeVariableService(id);
  }

  async removeFixedService(id: FixedService['id']) {
    this.logger.info(`removeFixedService with id ${id}`);
    return await this.servicesRepository.removeFixedService(id);
  }
}
