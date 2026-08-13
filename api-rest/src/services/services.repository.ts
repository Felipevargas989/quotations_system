import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { Company } from 'src/companies/entities/company.entity';
import { SupabaseService } from 'src/supabase/supabase.service';
import { CreateFixedServiceDto } from './dto/create-fixed-service.dto';
import { CreateVariableServiceDto } from './dto/create-variable-service.dto';
import { UpdateFixedServiceDto } from './dto/update-fixed-service.dto';
import { UpdateVariableServiceDto } from './dto/update-variable-service.dto';
import {
  FixedService,
  FixedServiceSection,
  VariableService,
} from './entities/service.entity';

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
      `createVariableServices with total services ${services.length}`,
    );
    return this.supabase.client.from('variable_services').upsert(services, {
      ignoreDuplicates: true,
      onConflict: 'company_id,category,name',
    });
  }

  createFixedServices(services: Omit<FixedService, 'id'>[]) {
    this.logger.info(
      `createFixedServices with services ${JSON.stringify(services)}`,
    );
    return this.supabase.client.from('fixed_services').upsert(services, {
      ignoreDuplicates: true,
      onConflict: 'company_id,name',
    });
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

  // ¿En cuántas cotizaciones y menús vive este servicio? Las
  // cotizaciones guardan los items como JSON; el operador de
  // contención (@>) baja recursivo por los arreglos, así que una sola
  // consulta cubre el formato por bloques {day, items:[{codigo}]}.
  // El código viaja como texto — así lo guarda el cotizador.
  // LAS COTIZACIONES GUARDAN DOS COSAS DISTINTAS BAJO "codigo" (13-08).
  // Las nuevas anotan el ID del servicio ("2042"); las viejas anotaron
  // el código del catálogo ("SF008"). Medido en producción: de 424
  // referencias vivas, 120 calzan por id y 42 por código. Buscar solo
  // por id dejaba borrar servicios que SÍ están en cotizaciones
  // antiguas — "Sillas Chivari", "Arco de Flores" y 40 más. Se
  // consultan las dos llaves y manda la mayor (no se suman: una misma
  // cotización podría traer las dos formas y el aviso mentiría).
  private async clavesDeServicio(
    tabla: 'variable_services' | 'fixed_services',
    companyId: Company['id'],
    id: number,
  ): Promise<string[]> {
    const { data } = await this.supabase.client
      .from(tabla)
      .select('code')
      .eq('id', id)
      .eq('company_id', companyId)
      .maybeSingle();
    const code = String((data as { code?: string } | null)?.code || '').trim();
    return [...new Set([String(id), code].filter(Boolean))];
  }

  async variableServiceUsage(companyId: Company['id'], id: number) {
    const claves = await this.clavesDeServicio(
      'variable_services',
      companyId,
      id,
    );
    const [conteos, enMenus] = await Promise.all([
      Promise.all(
        claves.map((codigo) =>
          this.supabase.client
            .from('quotations')
            .select('id', { count: 'exact', head: true })
            .eq('company_id', companyId)
            .contains('items', {
              variable_services: [{ items: [{ codigo }] }],
            }),
        ),
      ),
      this.supabase.client
        .from('service_group_items')
        .select('id, service_groups!inner(company_id)', {
          count: 'exact',
          head: true,
        })
        .eq('variable_service_id', id)
        .eq('service_groups.company_id', companyId),
    ]);
    return {
      cotizaciones: Math.max(0, ...conteos.map((c) => c.count ?? 0)),
      menus: enMenus.count ?? 0,
    };
  }

  async fixedServiceUsage(companyId: Company['id'], id: number) {
    // Mismo caso de las dos llaves: ver clavesDeServicio.
    const claves = await this.clavesDeServicio('fixed_services', companyId, id);
    const conteos = await Promise.all(
      claves.map((codigo) =>
        this.supabase.client
          .from('quotations')
          .select('id', { count: 'exact', head: true })
          .eq('company_id', companyId)
          .contains('items', { fixed_services: [{ codigo }] }),
      ),
    );
    return Math.max(0, ...conteos.map((c) => c.count ?? 0));
  }

  removeVariableService(companyId: Company['id'], id: VariableService['id']) {
    this.logger.info(`removeVariableService with id ${id}`);
    return this.supabase.client
      .from('variable_services')
      .delete()
      .eq('id', id)
      .eq('company_id', companyId);
  }

  removeFixedService(companyId: Company['id'], id: FixedService['id']) {
    this.logger.info(`removeFixedService with id ${id}`);
    return this.supabase.client
      .from('fixed_services')
      .delete()
      .eq('id', id)
      .eq('company_id', companyId);
  }

  findAllServiceCategories(companyId: Company['id']) {
    this.logger.info(`findAll service categories with companyId ${companyId}`);
    return this.supabase.client
      .from('service_categories')
      .select('*')
      .eq('company_id', companyId);
  }

  upsertServiceCategory(
    companyId: Company['id'],
    name: string,
    isActive: boolean,
  ) {
    this.logger.info(
      `upsertServiceCategory with companyId ${companyId}, name ${name}, isActive ${isActive}`,
    );
    return this.supabase.client
      .from('service_categories')
      .upsert(
        { company_id: companyId, name, is_active: isActive },
        { onConflict: 'company_id,name' },
      )
      .select()
      .single();
  }

  // ---- Multi-category: service <-> category links ----

  findAllServiceCategoryLinks(companyId: Company['id']) {
    this.logger.info(`findAllServiceCategoryLinks companyId ${companyId}`);
    return this.supabase.client
      .from('variable_service_categories')
      .select('*')
      .eq('company_id', companyId);
  }

  getLinksForService(serviceId: VariableService['id']) {
    return this.supabase.client
      .from('variable_service_categories')
      .select('*')
      .eq('variable_service_id', serviceId);
  }

  async getMaxServiceSortOrder(companyId: Company['id'], categoryId: number) {
    const { data } = await this.supabase.client
      .from('variable_service_categories')
      .select('sort_order')
      .eq('company_id', companyId)
      .eq('category_id', categoryId)
      .order('sort_order', { ascending: false })
      .limit(1);
    return data && data.length ? (data[0].sort_order ?? 0) : 0;
  }

  insertServiceCategoryLink(
    companyId: Company['id'],
    serviceId: VariableService['id'],
    categoryId: number,
    sortOrder: number,
  ) {
    return this.supabase.client.from('variable_service_categories').insert({
      company_id: companyId,
      variable_service_id: serviceId,
      category_id: categoryId,
      sort_order: sortOrder,
    });
  }

  deleteServiceCategoryLink(
    serviceId: VariableService['id'],
    categoryId: number,
  ) {
    return this.supabase.client
      .from('variable_service_categories')
      .delete()
      .eq('variable_service_id', serviceId)
      .eq('category_id', categoryId);
  }

  updateLinkSortOrder(
    serviceId: VariableService['id'],
    categoryId: number,
    sortOrder: number,
  ) {
    return this.supabase.client
      .from('variable_service_categories')
      .update({ sort_order: sortOrder })
      .eq('variable_service_id', serviceId)
      .eq('category_id', categoryId);
  }

  // ---- Category management ----

  findCategoryByName(companyId: Company['id'], name: string) {
    return this.supabase.client
      .from('service_categories')
      .select('*')
      .eq('company_id', companyId)
      .ilike('name', name)
      .limit(1);
  }

  async getMaxCategorySortOrder(companyId: Company['id']) {
    const { data } = await this.supabase.client
      .from('service_categories')
      .select('sort_order')
      .eq('company_id', companyId)
      .order('sort_order', { ascending: false })
      .limit(1);
    return data && data.length ? (data[0].sort_order ?? 0) : 0;
  }

  createCategory(companyId: Company['id'], name: string, sortOrder: number) {
    return this.supabase.client
      .from('service_categories')
      .insert({
        company_id: companyId,
        name,
        is_active: true,
        sort_order: sortOrder,
      })
      .select()
      .single();
  }

  updateCategory(
    companyId: Company['id'],
    id: number,
    fields: Record<string, unknown>,
  ) {
    return this.supabase.client
      .from('service_categories')
      .update(fields)
      .eq('company_id', companyId)
      .eq('id', id)
      .select()
      .single();
  }

  deleteCategory(companyId: Company['id'], id: number) {
    return this.supabase.client
      .from('service_categories')
      .delete()
      .eq('company_id', companyId)
      .eq('id', id);
  }

  // Services whose ONLY category is the given one (would be orphaned on delete).
  async getServicesOnlyInCategory(
    companyId: Company['id'],
    categoryId: number,
  ) {
    const { data: inCat } = await this.supabase.client
      .from('variable_service_categories')
      .select('variable_service_id')
      .eq('company_id', companyId)
      .eq('category_id', categoryId);
    const ids = (inCat ?? []).map((r) => r.variable_service_id);
    if (!ids.length) return [];
    const { data: allLinks } = await this.supabase.client
      .from('variable_service_categories')
      .select('variable_service_id, category_id')
      .in('variable_service_id', ids);
    const countByService = new Map<number, number>();
    (allLinks ?? []).forEach((l) => {
      countByService.set(
        l.variable_service_id,
        (countByService.get(l.variable_service_id) ?? 0) + 1,
      );
    });
    return ids.filter((id) => (countByService.get(id) ?? 0) <= 1);
  }

  // ---- Secciones de servicios fijos (migración 53) ----

  async listFixedSections(companyId: Company['id']) {
    const { data, error } = await this.supabase.client
      .from('fixed_service_sections')
      .select('*')
      .eq('company_id', companyId)
      .order('sort_order', { ascending: true, nullsFirst: false })
      .order('id', { ascending: true });
    if (error) throw error;
    return data as FixedServiceSection[];
  }

  async createFixedSection(
    companyId: Company['id'],
    name: string,
    sortOrder: number,
  ) {
    const { data, error } = await this.supabase.client
      .from('fixed_service_sections')
      .insert({ company_id: companyId, name, sort_order: sortOrder })
      .select()
      .single();
    if (error) throw error;
    return data as FixedServiceSection;
  }

  async updateFixedSection(
    companyId: Company['id'],
    id: number,
    fields: Record<string, unknown>,
  ) {
    const { data, error } = await this.supabase.client
      .from('fixed_service_sections')
      .update(fields)
      .eq('company_id', companyId)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data as FixedServiceSection;
  }

  async deleteFixedSection(companyId: Company['id'], id: number) {
    const { error } = await this.supabase.client
      .from('fixed_service_sections')
      .delete()
      .eq('company_id', companyId)
      .eq('id', id);
    if (error) throw error;
  }

  // Orden y sección de un servicio fijo (el drop del arrastre).
  async updateFixedServicePlacement(
    companyId: Company['id'],
    id: number,
    fields: { section_id?: number | null; sort_order?: number },
  ) {
    const { error } = await this.supabase.client
      .from('fixed_services')
      .update(fields)
      .eq('company_id', companyId)
      .eq('id', id);
    if (error) throw error;
  }

  // Códigos de servicio presentes en alguna cotización (migración 54):
  // el catálogo apaga el basurero para ellos.
  async usedServiceCodes(companyId: Company['id']): Promise<string[]> {
    const { data, error } = await this.supabase.client.rpc(
      'used_service_codes',
      { p_company_id: companyId },
    );
    if (error) throw error;
    return ((data || []) as { code: string }[]).map((r) => r.code);
  }

  // ---- Reorden en un viaje (migración 55) ----

  async reorderFixedServicesBulk(
    companyId: Company['id'],
    sectionId: number | null,
    serviceIds: number[],
  ) {
    const { error } = await this.supabase.client.rpc('reorder_fixed_services', {
      p_company_id: companyId,
      p_section_id: sectionId,
      p_ids: serviceIds,
    });
    if (error) throw error;
  }

  async reorderServicesInCategoryBulk(
    companyId: Company['id'],
    categoryId: number,
    serviceIds: number[],
  ) {
    const { error } = await this.supabase.client.rpc(
      'reorder_services_in_category',
      {
        p_company_id: companyId,
        p_category_id: categoryId,
        p_ids: serviceIds,
      },
    );
    if (error) throw error;
  }
}
