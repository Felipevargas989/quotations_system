import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { Company } from 'src/companies/entities/company.entity';
import { CreateFixedServiceDto } from './dto/create-fixed-service.dto';
import { CreateServicesBulkDto } from './dto/create-services-bulk.dto';
import { CreateVariableServiceDto } from './dto/create-variable-service.dto';
import { UpdateFixedServiceDto } from './dto/update-fixed-service.dto';
import { UpdateServiceCategoryDto } from './dto/update-service-category.dto';
import { UpdateVariableServiceDto } from './dto/update-variable-service.dto';
import { FixedService, VariableService } from './entities/service.entity';
import { ServicesRepository } from './services.repository';
import { validateFixedServices } from './utils';
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

      // validate fixed services before creating them
      validateFixedServices(fixedServices);

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
      // find category activation settings
      const categories =
        await this.servicesRepository.findAllServiceCategories(companyId);

      return {
        variableServices: variableServices.data,
        fixedServices: fixedServices.data,
        categories: categories.data,
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
      // validate fixed service before updating it
      validateFixedServices([
        updateVariableServiceDto as CreateFixedServiceDto,
      ]);

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
      // validate fixed service before updating it
      validateFixedServices([updateFixedServiceDto as CreateFixedServiceDto]);

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
      // validate fixed service before creating it
      validateFixedServices([serviceData]);

      return await this.servicesRepository.createFixedService(serviceData);
    } catch (error) {
      this.logger.error(error);
      throw new HttpException(
        (error as Error).message || 'Error al crear el servicio fijo',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async updateServiceCategory(
    companyId: Company['id'],
    updateServiceCategoryDto: UpdateServiceCategoryDto,
  ) {
    this.logger.info(
      `updateServiceCategory with companyId ${companyId} and dto ${JSON.stringify(updateServiceCategoryDto)}`,
    );
    try {
      return await this.servicesRepository.upsertServiceCategory(
        companyId,
        updateServiceCategoryDto.name,
        updateServiceCategoryDto.is_active,
      );
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
