import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { Company } from 'src/companies/entities/company.entity';
import { SupabaseService } from 'src/supabase/supabase.service';
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
}
