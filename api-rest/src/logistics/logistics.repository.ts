import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { SupabaseService } from 'src/supabase/supabase.service';
import { CreateSupplierDto, UpdateSupplierDto } from './dto/create-supplier.dto';
import { CreateSupplyDto, UpdateSupplyDto } from './dto/create-supply.dto';

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
