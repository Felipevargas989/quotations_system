import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { SupabaseService } from 'src/supabase/supabase.service';
import {
  CreateFurnitureItemDto,
  CreateManagementResourceDto,
  UpdateFurnitureItemDto,
  UpdateManagementResourceDto,
} from './dto/create-catalog-items.dto';
import {
  CreateSupplierDto,
  UpdateSupplierDto,
} from './dto/create-supplier.dto';
import { CreateSupplyDto, UpdateSupplyDto } from './dto/create-supply.dto';
import {
  AddCostItemDto,
  AddEventResourcesDto,
  AddKitchenNoteDto,
  AddRecipeItemDto,
  MarkProvisionedDto,
  SetServiceTimeDto,
  UpdateCostItemDto,
  UpdateEventResourceDto,
  UpdateFixedCostsDto,
  UpdateRecipeItemDto,
  UpsertSupplyProvisionsDto,
} from './dto/event-operations.dto';

// Mudanza #2 de "una sola puerta" (28-07): PROVEEDORES.
//
// Espejo exacto de frontend/src/services/logistics.service.ts (sección
// Proveedores), con UNA mejora de seguridad: TODAS las operaciones se
// acotan por company_id (el original editaba/borraba solo por id — un
// usuario de otra empresa podía tocar proveedores ajenos por número).
@Injectable()
export class LogisticsRepository {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(LogisticsRepository.name);
  }

  async findAllSuppliers(companyId: number) {
    this.logger.info(`findAllSuppliers company ${companyId}`);
    const { data, error } = await this.supabase.client
      .from('suppliers')
      .select('*')
      .eq('company_id', companyId)
      .order('name');
    if (error) throw error;
    return (data || []) as Record<string, unknown>[];
  }

  async createSupplier(companyId: number, dto: CreateSupplierDto) {
    this.logger.info(`createSupplier company ${companyId}`);
    const { data, error } = await this.supabase.client
      .from('suppliers')
      .insert([{ ...dto, company_id: companyId }])
      .select()
      .single();
    if (error) throw error;
    return data as Record<string, unknown>;
  }

  async updateSupplier(companyId: number, id: number, dto: UpdateSupplierDto) {
    this.logger.info(`updateSupplier ${id} company ${companyId}`);
    const { data, error } = await this.supabase.client
      .from('suppliers')
      .update(dto)
      .eq('id', id)
      .eq('company_id', companyId)
      .select()
      .single();
    if (error) throw error;
    return data as Record<string, unknown>;
  }

  async deleteSupplier(companyId: number, id: number) {
    this.logger.info(`deleteSupplier ${id} company ${companyId}`);
    const { error } = await this.supabase.client
      .from('suppliers')
      .delete()
      .eq('id', id)
      .eq('company_id', companyId);
    if (error) throw error;
    return { deleted: true };
  }

  // ---------- Compras multi-evento (mudanza #6, 28-07) ----------

  async findAcceptedEvents(companyId: number) {
    this.logger.info(`findAcceptedEvents company ${companyId}`);
    const { data, error } = await this.supabase.client
      .from('quotations')
      .select(
        'id, quotation_number, event_date, event_end_date, people_count, total_amount, items, provisioned_at, provisioned_cost, clients(name)',
      )
      .eq('company_id', companyId)
      .eq('quotation_status', 'aceptada')
      .order('event_date', { ascending: true });
    if (error) throw error;
    return (data || []) as Record<string, unknown>[];
  }

  async findWonEventsSince(companyId: number, fromISO: string) {
    this.logger.info(
      `findWonEventsSince company ${companyId} desde ${fromISO}`,
    );
    const { data, error } = await this.supabase.client
      .from('quotations')
      .select(
        'id, quotation_number, event_date, event_end_date, people_count, total_amount, items, provisioned_at, provisioned_cost, clients(name)',
      )
      .eq('company_id', companyId)
      .in('quotation_status', ['aceptada', 'realizada'])
      .gte('event_date', fromISO)
      .order('event_date', { ascending: true });
    if (error) throw error;
    return (data || []) as Record<string, unknown>[];
  }

  async markProvisioned(companyId: number, dto: MarkProvisionedDto) {
    this.logger.info(
      `markProvisioned company ${companyId} (${dto.entries.length} eventos)`,
    );
    const now = new Date().toISOString();
    for (const e of dto.entries) {
      const { error } = await this.supabase.client
        .from('quotations')
        .update({
          provisioned_at: now,
          provisioned_cost: Math.round(e.cost),
          provisioned_people: e.people,
          provisioned_services: e.services,
        })
        .eq('id', e.id)
        .eq('company_id', companyId);
      if (error) throw error;
    }
    return { updated: dto.entries.length };
  }

  async clearProvisioned(companyId: number, ids: string[]) {
    this.logger.info(
      `clearProvisioned company ${companyId} (${ids.length} eventos)`,
    );
    if (!ids.length) return { updated: 0 };
    const { error } = await this.supabase.client
      .from('quotations')
      .update({
        provisioned_at: null,
        provisioned_cost: null,
        provisioned_people: null,
        provisioned_services: null,
      })
      .in('id', ids)
      .eq('company_id', companyId);
    if (error) throw error;
    return { updated: ids.length };
  }

  async quotationProvisioning(companyId: number, quotationId: string) {
    this.logger.info(`quotationProvisioning ${quotationId}`);
    const { data, error } = await this.supabase.client
      .from('quotations')
      .select(
        'provisioned_at, provisioned_cost, provisioned_people, provisioned_services',
      )
      .eq('id', quotationId)
      .eq('company_id', companyId)
      .single();
    if (error) throw error;
    return data as Record<string, unknown>;
  }

  // ---------- Provisión por insumo ----------

  async findSupplyProvisions(companyId: number) {
    this.logger.info(`findSupplyProvisions company ${companyId}`);
    const { data, error } = await this.supabase.client
      .from('event_supply_provisions')
      .select('*')
      .eq('company_id', companyId);
    if (error) throw error;
    return (data || []) as Record<string, unknown>[];
  }

  async upsertSupplyProvisions(
    companyId: number,
    dto: UpsertSupplyProvisionsDto,
  ) {
    this.logger.info(
      `upsertSupplyProvisions company ${companyId} (${dto.rows.length} filas)`,
    );
    if (!dto.rows.length) return { upserted: 0 };
    const now = new Date().toISOString();
    const { error } = await this.supabase.client
      .from('event_supply_provisions')
      .upsert(
        dto.rows.map((r) => ({
          ...r,
          company_id: companyId,
          provisioned_at: now,
        })),
        { onConflict: 'quotation_id,supply_id' },
      );
    if (error) throw error;
    return { upserted: dto.rows.length };
  }

  async deleteSupplyProvisions(
    companyId: number,
    quotationIds: string[],
    supplyIds?: number[],
  ) {
    this.logger.info(
      `deleteSupplyProvisions company ${companyId} (${quotationIds.length} eventos)`,
    );
    if (!quotationIds.length) return { deleted: true };
    let q = this.supabase.client
      .from('event_supply_provisions')
      .delete()
      .eq('company_id', companyId)
      .in('quotation_id', quotationIds);
    if (supplyIds && supplyIds.length) q = q.in('supply_id', supplyIds);
    const { error } = await q;
    if (error) throw error;
    return { deleted: true };
  }

  // ---------- Recursos asignados a un evento ----------

  async findEventResources(companyId: number, quotationId: string) {
    this.logger.info(`findEventResources ${quotationId}`);
    const { data, error } = await this.supabase.client
      .from('event_resources')
      .select('*')
      .eq('company_id', companyId)
      .eq('quotation_id', quotationId)
      .order('created_at');
    if (error) throw error;
    return (data || []) as Record<string, unknown>[];
  }

  async findAllEventResources(companyId: number) {
    this.logger.info(`findAllEventResources company ${companyId}`);
    const { data, error } = await this.supabase.client
      .from('event_resources')
      .select('*')
      .eq('company_id', companyId);
    if (error) throw error;
    return (data || []) as Record<string, unknown>[];
  }

  async addEventResources(companyId: number, dto: AddEventResourcesDto) {
    this.logger.info(
      `addEventResources company ${companyId} (${dto.rows.length} filas)`,
    );
    if (!dto.rows.length) return { added: 0 };
    const { error } = await this.supabase.client
      .from('event_resources')
      .insert(dto.rows.map((r) => ({ ...r, company_id: companyId })));
    if (error) throw error;
    return { added: dto.rows.length };
  }

  async updateEventResource(
    companyId: number,
    id: number,
    dto: UpdateEventResourceDto,
  ) {
    this.logger.info(`updateEventResource ${id} company ${companyId}`);
    const { error } = await this.supabase.client
      .from('event_resources')
      .update(dto)
      .eq('id', id)
      .eq('company_id', companyId);
    if (error) throw error;
    return { updated: true };
  }

  async deleteEventResource(companyId: number, id: number) {
    this.logger.info(`deleteEventResource ${id} company ${companyId}`);
    const { error } = await this.supabase.client
      .from('event_resources')
      .delete()
      .eq('id', id)
      .eq('company_id', companyId);
    if (error) throw error;
    return { deleted: true };
  }

  // ---------- Ficha de cocina: horarios, notas y fichas impresas ----------

  async findServiceTimes(companyId: number, quotationId: string) {
    this.logger.info(`findServiceTimes ${quotationId}`);
    const { data, error } = await this.supabase.client
      .from('event_service_times')
      .select('service_name, start_time')
      .eq('company_id', companyId)
      .eq('quotation_id', quotationId);
    if (error) throw error;
    return (data || []) as Record<string, unknown>[];
  }

  async setServiceTime(companyId: number, dto: SetServiceTimeDto) {
    this.logger.info(`setServiceTime ${dto.quotation_id}`);
    const { error } = await this.supabase.client
      .from('event_service_times')
      .upsert(
        { ...dto, company_id: companyId },
        { onConflict: 'quotation_id,service_name' },
      );
    if (error) throw error;
    return { saved: true };
  }

  async findKitchenNotes(companyId: number, quotationId: string) {
    this.logger.info(`findKitchenNotes ${quotationId}`);
    const { data, error } = await this.supabase.client
      .from('event_kitchen_notes')
      .select('id, note, day')
      .eq('company_id', companyId)
      .eq('quotation_id', quotationId)
      .order('created_at');
    if (error) throw error;
    return (data || []) as Record<string, unknown>[];
  }

  async addKitchenNote(companyId: number, dto: AddKitchenNoteDto) {
    this.logger.info(`addKitchenNote ${dto.quotation_id}`);
    const { error } = await this.supabase.client
      .from('event_kitchen_notes')
      .insert({
        company_id: companyId,
        quotation_id: dto.quotation_id,
        note: dto.note,
        day: dto.day ?? null,
      });
    if (error) throw error;
    return { added: true };
  }

  async deleteKitchenNote(companyId: number, id: number) {
    this.logger.info(`deleteKitchenNote ${id} company ${companyId}`);
    const { error } = await this.supabase.client
      .from('event_kitchen_notes')
      .delete()
      .eq('id', id)
      .eq('company_id', companyId);
    if (error) throw error;
    return { deleted: true };
  }

  async findDayPrints(companyId: number, quotationId: string) {
    this.logger.info(`findDayPrints ${quotationId}`);
    const { data, error } = await this.supabase.client
      .from('event_day_prints')
      .select('day, printed_at')
      .eq('company_id', companyId)
      .eq('quotation_id', quotationId);
    if (error) throw error;
    return (data || []) as Record<string, unknown>[];
  }

  async markDaysPrinted(
    companyId: number,
    quotationId: string,
    days: number[],
  ) {
    this.logger.info(`markDaysPrinted ${quotationId} (${days.length} días)`);
    if (!days.length) return { marked: 0 };
    const now = new Date().toISOString();
    const { error } = await this.supabase.client
      .from('event_day_prints')
      .upsert(
        days.map((day) => ({
          company_id: companyId,
          quotation_id: quotationId,
          day,
          printed_at: now,
        })),
        { onConflict: 'quotation_id,day' },
      );
    if (error) throw error;
    return { marked: days.length };
  }

  // ---------- Recetas por servicio ----------

  async findRecipeItems(
    companyId: number,
    serviceType: string,
    serviceId: number,
  ) {
    this.logger.info(`findRecipeItems ${serviceType}/${serviceId}`);
    const { data, error } = await this.supabase.client
      .from('service_recipe_items')
      .select('*')
      .eq('company_id', companyId)
      .eq('service_type', serviceType)
      .eq('service_id', serviceId)
      .order('created_at');
    if (error) throw error;
    return (data || []) as Record<string, unknown>[];
  }

  async findAllRecipeItems(companyId: number) {
    this.logger.info(`findAllRecipeItems company ${companyId}`);
    const { data, error } = await this.supabase.client
      .from('service_recipe_items')
      .select('*')
      .eq('company_id', companyId);
    if (error) throw error;
    return (data || []) as Record<string, unknown>[];
  }

  async addRecipeItem(companyId: number, dto: AddRecipeItemDto) {
    this.logger.info(`addRecipeItem ${dto.service_type}/${dto.service_id}`);
    const { error } = await this.supabase.client
      .from('service_recipe_items')
      .insert({ ...dto, company_id: companyId });
    if (error) throw error;
    return { added: true };
  }

  async updateRecipeItem(
    companyId: number,
    id: number,
    dto: UpdateRecipeItemDto,
  ) {
    this.logger.info(`updateRecipeItem ${id} company ${companyId}`);
    const { error } = await this.supabase.client
      .from('service_recipe_items')
      .update(dto)
      .eq('id', id)
      .eq('company_id', companyId);
    if (error) throw error;
    return { updated: true };
  }

  async deleteRecipeItem(companyId: number, id: number) {
    this.logger.info(`deleteRecipeItem ${id} company ${companyId}`);
    const { error } = await this.supabase.client
      .from('service_recipe_items')
      .delete()
      .eq('id', id)
      .eq('company_id', companyId);
    if (error) throw error;
    return { deleted: true };
  }

  // ---------- Catálogo para resolver items antiguos + costos fijos ----------

  async catalogServiceNames(companyId: number) {
    this.logger.info(`catalogServiceNames company ${companyId}`);
    const [v, f] = await Promise.all([
      this.supabase.client
        .from('variable_services')
        .select('id, name')
        .eq('company_id', companyId),
      this.supabase.client
        .from('fixed_services')
        .select('id, name')
        .eq('company_id', companyId),
    ]);
    if (v.error) throw v.error;
    if (f.error) throw f.error;
    return { variable: v.data || [], fixed: f.data || [] };
  }

  async fixedServiceCosts(companyId: number) {
    this.logger.info(`fixedServiceCosts company ${companyId}`);
    const { data, error } = await this.supabase.client
      .from('fixed_services')
      .select('id, cost_fixed, cost_per_person')
      .eq('company_id', companyId);
    if (error) throw error;
    return (data || []) as Record<string, unknown>[];
  }

  async updateFixedServiceCosts(
    companyId: number,
    id: number,
    dto: UpdateFixedCostsDto,
  ) {
    this.logger.info(`updateFixedServiceCosts ${id} company ${companyId}`);
    const { error } = await this.supabase.client
      .from('fixed_services')
      .update(dto)
      .eq('id', id)
      .eq('company_id', companyId);
    if (error) throw error;
    return { updated: true };
  }

  async findFixedServiceCostItems(companyId: number, fixedServiceId?: number) {
    this.logger.info(
      `findFixedServiceCostItems company ${companyId} servicio ${fixedServiceId ?? 'todos'}`,
    );
    let q = this.supabase.client
      .from('fixed_service_cost_items')
      .select('*')
      .eq('company_id', companyId);
    if (fixedServiceId) q = q.eq('fixed_service_id', fixedServiceId);
    const { data, error } = await q.order('created_at');
    if (error) throw error;
    return (data || []) as Record<string, unknown>[];
  }

  async addCostItem(companyId: number, dto: AddCostItemDto) {
    this.logger.info(`addCostItem company ${companyId}`);
    const { error } = await this.supabase.client
      .from('fixed_service_cost_items')
      .insert({ ...dto, company_id: companyId });
    if (error) throw error;
    return { added: true };
  }

  async updateCostItem(companyId: number, id: number, dto: UpdateCostItemDto) {
    this.logger.info(`updateCostItem ${id} company ${companyId}`);
    const { error } = await this.supabase.client
      .from('fixed_service_cost_items')
      .update(dto)
      .eq('id', id)
      .eq('company_id', companyId);
    if (error) throw error;
    return { updated: true };
  }

  async deleteCostItem(companyId: number, id: number) {
    this.logger.info(`deleteCostItem ${id} company ${companyId}`);
    const { error } = await this.supabase.client
      .from('fixed_service_cost_items')
      .delete()
      .eq('id', id)
      .eq('company_id', companyId);
    if (error) throw error;
    return { deleted: true };
  }

  // ---------- Mobiliario (mudanza #4, 28-07) ----------

  async findAllFurniture(companyId: number) {
    this.logger.info(`findAllFurniture company ${companyId}`);
    const { data, error } = await this.supabase.client
      .from('furniture_items')
      .select('*')
      .eq('company_id', companyId)
      .order('name');
    if (error) throw error;
    return (data || []) as Record<string, unknown>[];
  }

  async createFurniture(companyId: number, dto: CreateFurnitureItemDto) {
    this.logger.info(`createFurniture company ${companyId}`);
    const { data, error } = await this.supabase.client
      .from('furniture_items')
      .insert([{ ...dto, company_id: companyId }])
      .select()
      .single();
    if (error) throw error;
    return data as Record<string, unknown>;
  }

  async updateFurniture(
    companyId: number,
    id: number,
    dto: UpdateFurnitureItemDto,
  ) {
    this.logger.info(`updateFurniture ${id} company ${companyId}`);
    const { data, error } = await this.supabase.client
      .from('furniture_items')
      .update(dto)
      .eq('id', id)
      .eq('company_id', companyId)
      .select()
      .single();
    if (error) throw error;
    return data as Record<string, unknown>;
  }

  async deleteFurniture(companyId: number, id: number) {
    this.logger.info(`deleteFurniture ${id} company ${companyId}`);
    const { error } = await this.supabase.client
      .from('furniture_items')
      .delete()
      .eq('id', id)
      .eq('company_id', companyId);
    if (error) throw error;
    return { deleted: true };
  }

  // Recetas que usan cada item de mobiliario (misma cuenta que hacía
  // la pantalla).
  async furnitureUsage(companyId: number) {
    this.logger.info(`furnitureUsage company ${companyId}`);
    const { data, error } = await this.supabase.client
      .from('service_recipe_items')
      .select('furniture_id')
      .eq('company_id', companyId)
      .eq('item_kind', 'mobiliario')
      .not('furniture_id', 'is', null);
    if (error) throw error;
    const usage: Record<number, { recipes: number }> = {};
    for (const r of data || []) {
      const id = r.furniture_id as number;
      usage[id] = usage[id] || { recipes: 0 };
      usage[id].recipes += 1;
    }
    return usage;
  }

  // ---------- Recursos de gestión (mudanza #5, 28-07) ----------

  async findAllResources(companyId: number) {
    this.logger.info(`findAllResources company ${companyId}`);
    const { data, error } = await this.supabase.client
      .from('management_resources')
      .select('*')
      .eq('company_id', companyId)
      .order('name');
    if (error) throw error;
    return (data || []) as Record<string, unknown>[];
  }

  async createResource(companyId: number, dto: CreateManagementResourceDto) {
    this.logger.info(`createResource company ${companyId}`);
    const { data, error } = await this.supabase.client
      .from('management_resources')
      .insert([{ ...dto, company_id: companyId }])
      .select()
      .single();
    if (error) throw error;
    return data as Record<string, unknown>;
  }

  async updateResource(
    companyId: number,
    id: number,
    dto: UpdateManagementResourceDto,
  ) {
    this.logger.info(`updateResource ${id} company ${companyId}`);
    const { data, error } = await this.supabase.client
      .from('management_resources')
      .update(dto)
      .eq('id', id)
      .eq('company_id', companyId)
      .select()
      .single();
    if (error) throw error;
    return data as Record<string, unknown>;
  }

  async deleteResource(companyId: number, id: number) {
    this.logger.info(`deleteResource ${id} company ${companyId}`);
    const { error } = await this.supabase.client
      .from('management_resources')
      .delete()
      .eq('id', id)
      .eq('company_id', companyId);
    if (error) throw error;
    return { deleted: true };
  }

  // Referencias de cada recurso: líneas de costo de servicios fijos +
  // asignaciones a eventos. Con cualquiera, no se elimina.
  async resourcesUsage(companyId: number) {
    this.logger.info(`resourcesUsage company ${companyId}`);
    const [cost, ev] = await Promise.all([
      this.supabase.client
        .from('fixed_service_cost_items')
        .select('resource_id')
        .eq('company_id', companyId),
      this.supabase.client
        .from('event_resources')
        .select('resource_id')
        .eq('company_id', companyId),
    ]);
    if (cost.error) throw cost.error;
    if (ev.error) throw ev.error;
    const usage: Record<number, { costLines: number; events: number }> = {};
    for (const r of cost.data || []) {
      const id = r.resource_id as number;
      usage[id] = usage[id] || { costLines: 0, events: 0 };
      usage[id].costLines += 1;
    }
    for (const r of ev.data || []) {
      const id = r.resource_id as number;
      usage[id] = usage[id] || { costLines: 0, events: 0 };
      usage[id].events += 1;
    }
    return usage;
  }

  // ---------- Insumos (mudanza #3, 28-07) ----------

  async findAllSupplies(companyId: number) {
    this.logger.info(`findAllSupplies company ${companyId}`);
    const { data, error } = await this.supabase.client
      .from('supplies')
      .select('*')
      .eq('company_id', companyId)
      .order('name');
    if (error) throw error;
    return (data || []) as Record<string, unknown>[];
  }

  async createSupply(companyId: number, dto: CreateSupplyDto) {
    this.logger.info(`createSupply company ${companyId}`);
    const { data, error } = await this.supabase.client
      .from('supplies')
      .insert([{ ...dto, company_id: companyId }])
      .select()
      .single();
    if (error) throw error;
    return data as Record<string, unknown>;
  }

  async updateSupply(companyId: number, id: number, dto: UpdateSupplyDto) {
    this.logger.info(`updateSupply ${id} company ${companyId}`);
    const { data, error } = await this.supabase.client
      .from('supplies')
      .update(dto)
      .eq('id', id)
      .eq('company_id', companyId)
      .select()
      .single();
    if (error) throw error;
    return data as Record<string, unknown>;
  }

  async deleteSupply(companyId: number, id: number) {
    this.logger.info(`deleteSupply ${id} company ${companyId}`);
    const { error } = await this.supabase.client
      .from('supplies')
      .delete()
      .eq('id', id)
      .eq('company_id', companyId);
    if (error) throw error;
    return { deleted: true };
  }

  // Uso de cada insumo: en cuántos servicios aparece su receta (servicios
  // DISTINTOS) y cuántas compras registradas tiene. Misma cuenta que
  // hacía el frontend, con una mejora: los ids se acotan primero a la
  // empresa de la sesión (no se puede preguntar por insumos ajenos).
  async suppliesUsage(companyId: number, supplyIds: number[]) {
    this.logger.info(
      `suppliesUsage company ${companyId} (${supplyIds.length} ids)`,
    );
    const usage: Record<number, { recipes: number; provisions: number }> = {};
    if (!supplyIds.length) return usage;

    const { data: propios, error: errPropios } = await this.supabase.client
      .from('supplies')
      .select('id')
      .eq('company_id', companyId)
      .in('id', supplyIds);
    if (errPropios) throw errPropios;
    const ids = (propios || []).map((s) => s.id as number);
    if (!ids.length) return usage;
    ids.forEach((id) => {
      usage[id] = { recipes: 0, provisions: 0 };
    });

    const [rec, prov] = await Promise.all([
      this.supabase.client
        .from('service_recipe_items')
        .select('supply_id, service_id')
        .in('supply_id', ids),
      this.supabase.client
        .from('event_supply_provisions')
        .select('supply_id')
        .in('supply_id', ids),
    ]);
    if (rec.error) throw rec.error;
    if (prov.error) throw prov.error;

    const vistos = new Set<string>();
    for (const r of rec.data || []) {
      const sid = r.supply_id as number;
      const clave = `${sid}-${r.service_id}`;
      if (usage[sid] && !vistos.has(clave)) {
        vistos.add(clave);
        usage[sid].recipes += 1;
      }
    }
    for (const r of prov.data || []) {
      const sid = r.supply_id as number;
      if (usage[sid]) usage[sid].provisions += 1;
    }
    return usage;
  }

  // Cuántos insumos y recursos apuntan a cada proveedor (con cualquier
  // referencia no se puede eliminar — misma regla que la pantalla).
  async suppliersUsage(companyId: number) {
    this.logger.info(`suppliersUsage company ${companyId}`);
    const [sup, res] = await Promise.all([
      this.supabase.client
        .from('supplies')
        .select('supplier_id')
        .eq('company_id', companyId)
        .not('supplier_id', 'is', null),
      this.supabase.client
        .from('management_resources')
        .select('supplier_id')
        .eq('company_id', companyId)
        .not('supplier_id', 'is', null),
    ]);
    if (sup.error) throw sup.error;
    if (res.error) throw res.error;
    const usage: Record<number, { supplies: number; resources: number }> = {};
    for (const r of sup.data || []) {
      const id = r.supplier_id as number;
      usage[id] = usage[id] || { supplies: 0, resources: 0 };
      usage[id].supplies += 1;
    }
    for (const r of res.data || []) {
      const id = r.supplier_id as number;
      usage[id] = usage[id] || { supplies: 0, resources: 0 };
      usage[id].resources += 1;
    }
    return usage;
  }
}
