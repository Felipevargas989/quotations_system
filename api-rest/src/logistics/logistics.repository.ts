import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { SupabaseService } from 'src/supabase/supabase.service';
import { CreateSupplierDto, UpdateSupplierDto } from './dto/create-supplier.dto';
import { CreateSupplyDto, UpdateSupplyDto } from './dto/create-supply.dto';
import {
  CreateFurnitureItemDto,
  CreateManagementResourceDto,
  UpdateFurnitureItemDto,
  UpdateManagementResourceDto,
} from './dto/create-catalog-items.dto';

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
    return data || [];
  }

  async createSupplier(companyId: number, dto: CreateSupplierDto) {
    this.logger.info(`createSupplier company ${companyId}`);
    const { data, error } = await this.supabase.client
      .from('suppliers')
      .insert([{ ...dto, company_id: companyId }])
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  async updateSupplier(
    companyId: number,
    id: number,
    dto: UpdateSupplierDto,
  ) {
    this.logger.info(`updateSupplier ${id} company ${companyId}`);
    const { data, error } = await this.supabase.client
      .from('suppliers')
      .update(dto)
      .eq('id', id)
      .eq('company_id', companyId)
      .select()
      .single();
    if (error) throw error;
    return data;
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

  // ---------- Mobiliario (mudanza #4, 28-07) ----------

  async findAllFurniture(companyId: number) {
    this.logger.info(`findAllFurniture company ${companyId}`);
    const { data, error } = await this.supabase.client
      .from('furniture_items')
      .select('*')
      .eq('company_id', companyId)
      .order('name');
    if (error) throw error;
    return data || [];
  }

  async createFurniture(companyId: number, dto: CreateFurnitureItemDto) {
    this.logger.info(`createFurniture company ${companyId}`);
    const { data, error } = await this.supabase.client
      .from('furniture_items')
      .insert([{ ...dto, company_id: companyId }])
      .select()
      .single();
    if (error) throw error;
    return data;
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
    return data;
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
    return data || [];
  }

  async createResource(companyId: number, dto: CreateManagementResourceDto) {
    this.logger.info(`createResource company ${companyId}`);
    const { data, error } = await this.supabase.client
      .from('management_resources')
      .insert([{ ...dto, company_id: companyId }])
      .select()
      .single();
    if (error) throw error;
    return data;
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
    return data;
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
    return data || [];
  }

  async createSupply(companyId: number, dto: CreateSupplyDto) {
    this.logger.info(`createSupply company ${companyId}`);
    const { data, error } = await this.supabase.client
      .from('supplies')
      .insert([{ ...dto, company_id: companyId }])
      .select()
      .single();
    if (error) throw error;
    return data;
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
    return data;
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
