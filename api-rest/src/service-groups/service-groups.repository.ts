import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { Company } from 'src/companies/entities/company.entity';
import { SupabaseService } from 'src/supabase/supabase.service';
import {
  ServiceGroup,
  ServiceGroupItem,
} from './entities/service-group.entity';

@Injectable()
export class ServiceGroupsRepository {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(ServiceGroupsRepository.name);
  }

  createGroup(group: Omit<ServiceGroup, 'id' | 'created_at'>) {
    this.logger.info(`createGroup with group ${JSON.stringify(group)}`);
    return this.supabase.client
      .from('service_groups')
      .insert(group)
      .select()
      .single();
  }

  createGroupItems(items: Omit<ServiceGroupItem, 'id' | 'created_at'>[]) {
    this.logger.info(`createGroupItems with total items ${items.length}`);
    return this.supabase.client.from('service_group_items').insert(items);
  }

  findAll(companyId: Company['id']) {
    this.logger.info(`findAll service groups with companyId ${companyId}`);
    return this.supabase.client
      .from('service_groups')
      .select(
        '*, items:service_group_items(quantity, service:variable_services(*))',
      )
      .eq('company_id', companyId);
  }

  removeGroup(id: ServiceGroup['id']) {
    this.logger.info(`removeGroup with id ${id}`);
    return this.supabase.client.from('service_groups').delete().eq('id', id);
  }
}
