import { Injectable } from '@nestjs/common';
import { SupabaseService } from 'src/supabase/supabase.service';
import type { AmbienteDeFacturacion } from '../facturacion-cl/facturacion-cl';
import type { ReceptorDeLaFactura } from './texto-del-pdf';

/** Una lectura de las facturas anteriores (migración 194). */
export interface LecturaDeFacturas {
  id: number;
  empezo_en: string;
  termino_en: string | null;
  estado: 'leyendo' | 'lista' | 'fallo';
  folios: number;
  desde_folio: number | null;
  hasta_folio: number | null;
  leidas: number;
  encontradas: number;
  clientes: number;
  error: string | null;
  pedida_por_nombre: string | null;
}

/** El cliente de una factura anterior, con la factura de donde salió. */
export interface ReceptorGuardado
  extends Omit<ReceptorDeLaFactura, 'fecha_emision'> {
  tipo: number;
  folio: number;
  fecha_emision: string | null;
}

const COLUMNAS_DE_LA_LECTURA =
  'id, empezo_en, termino_en, estado, folios, desde_folio, hasta_folio, leidas, encontradas, clientes, error, pedida_por_nombre';

const COLUMNAS_DEL_RECEPTOR =
  'rut, razon_social, giro, direccion, comuna, ciudad, tipo, folio, fecha_emision';

/**
 * TUS FACTURAS ANTERIORES EN LA BASE (doc 19 §9.29, migración 194). Todo de
 * una empresa: cada método recibe `companyId` y filtra por él.
 */
@Injectable()
export class FacturasAnterioresRepository {
  constructor(private readonly supabase: SupabaseService) {}

  async ultima(companyId: number): Promise<LecturaDeFacturas | null> {
    const { data, error } = await this.supabase.client
      .from('lecturas_de_facturas_anteriores')
      .select(COLUMNAS_DE_LA_LECTURA)
      .eq('company_id', companyId)
      .order('id', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return (data as LecturaDeFacturas | null) ?? null;
  }

  async cuantosClientes(companyId: number): Promise<number> {
    const { count, error } = await this.supabase.client
      .from('receptores_de_facturas_anteriores')
      .select('rut', { count: 'exact', head: true })
      .eq('company_id', companyId);
    if (error) throw error;
    return count ?? 0;
  }

  async empezar(
    companyId: number,
    por: { id: string | null; nombre: string | null },
    folios: number[],
  ): Promise<LecturaDeFacturas> {
    const { data, error } = await this.supabase.client
      .from('lecturas_de_facturas_anteriores')
      .insert({
        company_id: companyId,
        folios: folios.length,
        hasta_folio: folios.length ? Math.max(...folios) : null,
        desde_folio: folios.length ? Math.min(...folios) : null,
        pedida_por: por.id,
        pedida_por_nombre: por.nombre,
      })
      .select(COLUMNAS_DE_LA_LECTURA)
      .single();
    if (error) throw error;
    return data as LecturaDeFacturas;
  }

  async avanzar(
    companyId: number,
    id: number,
    cuenta: { leidas: number; encontradas: number; clientes: number },
  ) {
    const { error } = await this.supabase.client
      .from('lecturas_de_facturas_anteriores')
      .update(cuenta)
      .eq('company_id', companyId)
      .eq('id', id);
    if (error) throw error;
  }

  async terminar(
    companyId: number,
    id: number,
    cuenta: { leidas: number; encontradas: number; clientes: number },
    error: string | null = null,
  ) {
    const { error: e } = await this.supabase.client
      .from('lecturas_de_facturas_anteriores')
      .update({
        ...cuenta,
        estado: error ? 'fallo' : 'lista',
        error,
        termino_en: new Date().toISOString(),
      })
      .eq('company_id', companyId)
      .eq('id', id);
    if (e) throw e;
  }

  /** Guarda (o pone al día) el cliente de ese RUT. */
  async guardar(companyId: number, receptor: ReceptorGuardado) {
    const { error } = await this.supabase.client
      .from('receptores_de_facturas_anteriores')
      .upsert(
        {
          company_id: companyId,
          ...receptor,
          leido_en: new Date().toISOString(),
        },
        { onConflict: 'company_id,rut' },
      );
    if (error) throw error;
  }

  async receptor(
    companyId: number,
    rut: string,
  ): Promise<ReceptorGuardado | null> {
    const { data, error } = await this.supabase.client
      .from('receptores_de_facturas_anteriores')
      .select(COLUMNAS_DEL_RECEPTOR)
      .eq('company_id', companyId)
      .eq('rut', rut)
      .maybeSingle();
    if (error) throw error;
    return (data as ReceptorGuardado | null) ?? null;
  }

  /** Los folios de facturas que emitió Eventia en ese ambiente. */
  async foliosDeEventia(
    companyId: number,
    ambiente: AmbienteDeFacturacion,
    tipo: number,
  ): Promise<number[]> {
    const { data, error } = await this.supabase.client
      .from('documentos_tributarios')
      .select('folio')
      .eq('company_id', companyId)
      .eq('ambiente', ambiente)
      .eq('tipo', tipo)
      .not('folio', 'is', null)
      .order('folio', { ascending: false })
      .limit(1000);
    if (error) throw error;
    return ((data ?? []) as { folio: number }[]).map((d) => Number(d.folio));
  }
}
