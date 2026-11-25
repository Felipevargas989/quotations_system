import { Injectable } from '@nestjs/common';
import { SupabaseService } from 'src/supabase/supabase.service';
import type { DtePedido } from '../facturas/borrador';

/** El documento de un evento, aprobado y guardado (migración 203). */
export interface FacturaAprobada {
  quotation_id: string;
  /** La OC de esta factura si el evento va en una por OC; si no, nulo. */
  oc_id: number | null;
  /** §9.53: la línea de la OC (desde 0) si la OC va en una factura por
   *  línea; si no, nulo. */
  linea_de_la_oc: number | null;
  pedida: DtePedido;
  aprobada_por_nombre: string;
  /** ISO. */
  aprobada_en: string;
}

interface Fila {
  quotation_id: string;
  oc_id: number | null;
  linea_de_la_oc: number | null;
  pedida: DtePedido;
  aprobada_por_nombre: string;
  created_at: string;
}

const COLUMNAS =
  'quotation_id, oc_id, linea_de_la_oc, pedida, aprobada_por_nombre, created_at';

const aprobada = (f: Fila): FacturaAprobada => ({
  quotation_id: f.quotation_id,
  oc_id: f.oc_id == null ? null : Number(f.oc_id),
  linea_de_la_oc: f.linea_de_la_oc == null ? null : Number(f.linea_de_la_oc),
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

  /** La del evento (`ocId` nulo), la de esa OC del evento o, si la OC va
   *  en una factura por línea (§9.53), la de esa línea. */
  async quitar(
    companyId: number,
    quotationId: string,
    ocId: number | null,
    linea: number | null = null,
  ): Promise<void> {
    const consulta = this.db
      .from('facturas_aprobadas')
      .delete()
      .eq('company_id', companyId)
      .eq('quotation_id', quotationId);
    const deLaOC =
      ocId == null ? consulta.is('oc_id', null) : consulta.eq('oc_id', ocId);
    const { error } = await (linea == null
      ? deLaOC.is('linea_de_la_oc', null)
      : deLaOC.eq('linea_de_la_oc', linea));
    if (error) throw error;
  }

  /** Reemplaza la que hubiera: una sola por evento, por OC o por línea de
   *  la OC (§9.53). */
  async guardar(fila: {
    company_id: number;
    quotation_id: string;
    oc_id: number | null;
    linea_de_la_oc: number | null;
    pedida: DtePedido;
    aprobada_por: string | null;
    aprobada_por_nombre: string;
  }): Promise<FacturaAprobada> {
    await this.quitar(
      fila.company_id,
      fila.quotation_id,
      fila.oc_id,
      fila.linea_de_la_oc,
    );
    const { data, error } = await this.db
      .from('facturas_aprobadas')
      .insert([fila])
      .select(COLUMNAS)
      .single();
    if (error) throw error;
    return aprobada(data as unknown as Fila);
  }
}
