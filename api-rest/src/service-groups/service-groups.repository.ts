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

  /** Solo el nombre, y solo si el menú es de la empresa (candado). */
  renameGroup(
    id: ServiceGroup['id'],
    companyId: Company['id'],
    name: ServiceGroup['name'],
  ) {
    this.logger.info(`renameGroup ${id} of company ${companyId}`);
    return this.supabase.client
      .from('service_groups')
      .update({ name })
      .eq('id', id)
      .eq('company_id', companyId)
      .select('id, name')
      .single();
  }

  /** De los id pedidos, los que SÍ son del catálogo de la empresa.
   *  Los id de `variable_services` son correlativos: sin esta consulta se
   *  puede armar un menú con servicios de otra empresa (11-09-2026). */
  variableServicesDeLaEmpresa(ids: number[], companyId: Company['id']) {
    this.logger.info(
      `variableServicesDeLaEmpresa ${ids.length} ids of company ${companyId}`,
    );
    return this.supabase.client
      .from('variable_services')
      .select('id')
      .in('id', ids)
      .eq('company_id', companyId);
  }

  /** Solo borra si el menú es de la empresa (candado, 11-09-2026). El
   *  `select` devuelve la fila borrada: sin filas, era ajeno o no existía. */
  removeGroup(id: ServiceGroup['id'], companyId: Company['id']) {
    this.logger.info(`removeGroup ${id} of company ${companyId}`);
    return this.supabase.client
      .from('service_groups')
      .delete()
      .eq('id', id)
      .eq('company_id', companyId)
      .select('id');
  }
}
