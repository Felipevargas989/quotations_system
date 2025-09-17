import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { Company } from 'src/companies/entities/company.entity';
import { SupabaseService } from 'src/supabase/supabase.service';
import { CreateFixedServiceDto } from './dto/create-fixed-service.dto';
import { CreateVariableServiceDto } from './dto/create-variable-service.dto';
import { UpdateFixedServiceDto } from './dto/update-fixed-service.dto';
import { UpdateVariableServiceDto } from './dto/update-variable-service.dto';
import { FixedService, VariableService } from './entities/service.entity';

@Injectable()
export class ServicesRepository {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(ServicesRepository.name);
  }

  createVariableServices(services: Omit<VariableService, 'id'>[]) {
    this.logger.info(
      `createVariableServices with services ${JSON.stringify(services)}`,
    );
    return this.supabase.client.from('variable_services').insert(services);
  }

  createFixedServices(services: Omit<FixedService, 'id'>[]) {
    this.logger.info(
      `createFixedServices with services ${JSON.stringify(services)}`,
    );
    return this.supabase.client.from('fixed_services').insert(services);
  }

  createVariableService(service: CreateVariableServiceDto) {
    this.logger.info(
      `createVariableService with service ${JSON.stringify(service)}`,
    );
    return this.supabase.client
      .from('variable_services')
      .insert(service)
      .select()
      .single();
  }

  createFixedService(service: CreateFixedServiceDto) {
    this.logger.info(
      `createFixedService with service ${JSON.stringify(service)}`,
    );
    return this.supabase.client
      .from('fixed_services')
      .insert(service)
      .select()
      .single();
  }

  findAllVariableServices(companyId: Company['id']) {
    this.logger.info(`findAll variable services with companyId ${companyId}`);
    return this.supabase.client
      .from('variable_services')
      .select('*')
      .eq('company_id', companyId);
  }

  findAllFixedServices(companyId: Company['id']) {
    this.logger.info(`findAll fixed services with companyId ${companyId}`);
    return this.supabase.client
      .from('fixed_services')
      .select('*')
      .eq('company_id', companyId);
  }

  updateVariableService(
    id: VariableService['id'],
    updateVariableServiceDto: UpdateVariableServiceDto,
  ) {
    this.logger.info(
      `updateVariableService with id ${id} and updateVariableServiceDto ${JSON.stringify(updateVariableServiceDto)}`,
    );
    return this.supabase.client
      .from('variable_services')
      .update(updateVariableServiceDto)
      .eq('id', id);
  }

  updateFixedService(
    id: FixedService['id'],
    updateFixedServiceDto: UpdateFixedServiceDto,
  ) {
    this.logger.info(
      `updateFixedService with id ${id} and updateFixedServiceDto ${JSON.stringify(updateFixedServiceDto)}`,
    );
    return this.supabase.client
      .from('fixed_services')
      .update(updateFixedServiceDto)
      .eq('id', id);
  }
}
