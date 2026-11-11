import { Injectable } from '@nestjs/common';
import { SupabaseService } from 'src/supabase/supabase.service';
import type { DtePedido } from '../facturas/borrador';

/** El documento de un evento, aprobado y guardado (migración 203). */
export interface FacturaAprobada {
  quotation_id: string;
  /** La OC de esta factura si el evento va en una por OC; si no, nulo. */
  oc_id: number | null;
  pedida: DtePedido;
  aprobada_por_nombre: string;
  /** ISO. */
  aprobada_en: string;
}

interface Fila {
  quotation_id: string;
  oc_id: number | null;
  pedida: DtePedido;
  aprobada_por_nombre: string;
  created_at: string;
}

const COLUMNAS = 'quotation_id, oc_id, pedida, aprobada_por_nombre, created_at';

const aprobada = (f: Fila): FacturaAprobada => ({
  quotation_id: f.quotation_id,
  oc_id: f.oc_id == null ? null : Number(f.oc_id),
  pedida: f.pedida,
  aprobada_por_nombre: f.aprobada_por_nombre,
  aprobada_en: f.created_at,
});

/**
 * LAS FACTURAS APROBADAS QUE ESPERAN, EN LA BASE (doc 19 §9.48, migración
 * 203). Toda consulta va con `company_id`: el motor usa la llave de
 * servicio.
 */
@Injectable()
export class FacturasAprobadasRepository {
  constructor(private readonly supabase: SupabaseService) {}

  private get db() {
    return this.supabase.client;
  }

  async lista(companyId: number): Promise<FacturaAprobada[]> {
    const { data, error } = await this.db
      .from('facturas_aprobadas')
      .select(COLUMNAS)
      .eq('company_id', companyId)
      .order('created_at', { ascending: true })
      .limit(1000);
    if (error) throw error;
    return ((data ?? []) as unknown as Fila[]).map(aprobada);
  }

  /** La del evento (`ocId` nulo) o la de esa OC del evento. */
  async quitar(
    companyId: number,
    quotationId: string,
    ocId: number | null,
  ): Promise<void> {
    const consulta = this.db
      .from('facturas_aprobadas')
      .delete()
      .eq('company_id', companyId)
      .eq('quotation_id', quotationId);
    const { error } = await (ocId == null
      ? consulta.is('oc_id', null)
      : consulta.eq('oc_id', ocId));
    if (error) throw error;
  }

  /** Reemplaza la que hubiera: una sola por evento (o por OC). */
  async guardar(fila: {
    company_id: number;
    quotation_id: string;
    oc_id: number | null;
    pedida: DtePedido;
    aprobada_por: string | null;
    aprobada_por_nombre: string;
  }): Promise<FacturaAprobada> {
    await this.quitar(fila.company_id, fila.quotation_id, fila.oc_id);
    const { data, error } = await this.db
      .from('facturas_aprobadas')
      .insert([fila])
      .select(COLUMNAS)
      .single();
    if (error) throw error;
    return aprobada(data as unknown as Fila);
  }
}
