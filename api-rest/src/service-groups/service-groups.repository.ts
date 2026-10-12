import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { Company } from 'src/companies/entities/company.entity';
import { SupabaseService } from 'src/supabase/supabase.service';
import {
  MenuGroup,
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

  // ---------- GRUPOS DE MENÚS GUARDADOS (12-10-2026, migración 121) ----------
  // Cada categoría tiene los suyos. Todo filtrado por empresa: los id de
  // la tabla son correlativos.

  /** Todos los grupos de la empresa, de todas las categorías: la pantalla
   *  los pide una vez y filtra por la categoría de la casilla. */
  todosLosGruposDeMenus(companyId: Company['id']) {
    this.logger.info(`todosLosGruposDeMenus of company ${companyId}`);
    return this.supabase.client
      .from('menu_groups')
      .select('id, name, category, sort_order')
      .eq('company_id', companyId)
      .order('category', { ascending: true })
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true });
  }

  gruposDeMenus(companyId: Company['id'], category: string) {
    return this.supabase.client
      .from('menu_groups')
      .select('id, name, sort_order')
      .eq('company_id', companyId)
      .eq('category', category)
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true });
  }

  crearGrupoDeMenus(
    companyId: Company['id'],
    category: string,
    name: string,
    sortOrder: number,
  ) {
    this.logger.info(`crearGrupoDeMenus ${category} of company ${companyId}`);
    return this.supabase.client
      .from('menu_groups')
      .insert({ company_id: companyId, category, name, sort_order: sortOrder })
      .select('id, name, category, sort_order')
      .single();
  }

  renombrarGrupoDeMenus(
    id: MenuGroup['id'],
    companyId: Company['id'],
    name: string,
  ) {
    this.logger.info(`renombrarGrupoDeMenus ${id} of company ${companyId}`);
    return this.supabase.client
      .from('menu_groups')
      .update({ name })
      .eq('id', id)
      .eq('company_id', companyId)
      .select('id, name, sort_order');
  }

  ordenarGrupoDeMenus(
    id: MenuGroup['id'],
    companyId: Company['id'],
    sortOrder: number,
  ) {
    return this.supabase.client
      .from('menu_groups')
      .update({ sort_order: sortOrder })
      .eq('id', id)
      .eq('company_id', companyId);
  }

  /** Sus menús quedan sin grupo: la base los suelta sola (ON DELETE SET
   *  NULL, migración 121). */
  borrarGrupoDeMenus(id: MenuGroup['id'], companyId: Company['id']) {
    this.logger.info(`borrarGrupoDeMenus ${id} of company ${companyId}`);
    return this.supabase.client
      .from('menu_groups')
      .delete()
      .eq('id', id)
      .eq('company_id', companyId)
      .select('id');
  }

  /** La categoría de un menú, solo si es de la empresa. */
  categoriaDelMenu(id: ServiceGroup['id'], companyId: Company['id']) {
    return this.supabase.client
      .from('service_groups')
      .select('id, category')
      .eq('id', id)
      .eq('company_id', companyId);
  }

  /** La categoría de un grupo de menús, solo si es de la empresa. */
  categoriaDelGrupoDeMenus(id: MenuGroup['id'], companyId: Company['id']) {
    return this.supabase.client
      .from('menu_groups')
      .select('id, category')
      .eq('id', id)
      .eq('company_id', companyId);
  }

  asignarGrupoAlMenu(
    id: ServiceGroup['id'],
    companyId: Company['id'],
    menuGroupId: MenuGroup['id'] | null,
  ) {
    this.logger.info(`asignarGrupoAlMenu ${id} of company ${companyId}`);
    return this.supabase.client
      .from('service_groups')
      .update({ menu_group_id: menuGroupId })
      .eq('id', id)
      .eq('company_id', companyId)
      .select('id, name, menu_group_id');
  }
}
