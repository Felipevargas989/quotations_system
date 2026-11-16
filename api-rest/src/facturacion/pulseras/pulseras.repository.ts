import { Injectable } from '@nestjs/common';
import { SupabaseService } from 'src/supabase/supabase.service';
import type { EntregaDePulseras, TurnoConPulseras } from './cuenta';

/** Una línea guardada, lo único que la cuenta mira de ella. */
type Detalle = { cantidad?: number | null; tarifario_id?: number | null }[];

export interface SolicitudConDetalle {
  turno_de_caja_id: number;
  /** El documento que la emitió: ese cuenta por la solicitud. */
  documento_id: number | null;
  created_at: string;
  detalle: Detalle;
}

export interface DocumentoDirecto {
  id: number;
  created_at: string;
  /** La emisión: con ella entra al turno que cierra después. */
  emitido_en: string | null;
  detalle: Detalle;
  traida: boolean | null;
}

const PAGINA = 1000;

/**
 * LAS PULSERAS EN LA BASE (doc 19 §9.49, migración 207). Toda consulta va
 * con `company_id`: el motor usa la llave de servicio.
 */
@Injectable()
export class PulserasRepository {
  constructor(private readonly supabase: SupabaseService) {}

  private get db() {
    return this.supabase.client;
  }

  /** Los ítems del tarifario con «Usa pulsera» prendido. */
  async conPulsera(companyId: number): Promise<Set<number>> {
    const { data, error } = await this.db
      .from('tarifario_de_boletas')
      .select('id')
      .eq('company_id', companyId)
      .eq('usa_pulsera', true);
    if (error) throw error;
    return new Set(((data ?? []) as { id: number }[]).map((i) => Number(i.id)));
  }

  async entregas(companyId: number): Promise<EntregaDePulseras[]> {
    const { data, error } = await this.db
      .from('entregas_de_pulseras')
      .select('id, cantidad, created_at, entregada_por_nombre')
      .eq('company_id', companyId)
      .order('created_at', { ascending: true })
      .limit(5000);
    if (error) throw error;
    return ((data ?? []) as EntregaDePulseras[]).map((e) => ({
      ...e,
      cantidad: Number(e.cantidad),
    }));
  }

  async hayEntregas(companyId: number): Promise<boolean> {
    const { data, error } = await this.db
      .from('entregas_de_pulseras')
      .select('id')
      .eq('company_id', companyId)
      .limit(1);
    if (error) throw error;
    return (data ?? []).length > 0;
  }

  async entregar(fila: {
    company_id: number;
    cantidad: number;
    entregada_por: string | null;
    entregada_por_nombre: string;
  }) {
    const { error } = await this.db
      .from('entregas_de_pulseras')
      .insert([{ ...fila, para: 'recepcion' }]);
    if (error) throw error;
  }

  /** Los turnos abiertos o cerrados desde ese instante. */
  async turnosDesde(
    companyId: number,
    desde: string,
  ): Promise<TurnoConPulseras[]> {
    const { data, error } = await this.db
      .from('turnos_de_caja')
      .select(
        'id, abierta_en, cerrada_en, abierta_por_nombre, cerrada_por_nombre, pulseras_contadas',
      )
      .eq('company_id', companyId)
      .eq('caja', 'recepcion')
      .or(`cerrada_en.is.null,cerrada_en.gte."${desde}"`)
      .order('abierta_en', { ascending: true })
      .limit(5000);
    if (error) throw error;
    return ((data ?? []) as TurnoConPulseras[]).map((t) => ({
      ...t,
      pulseras_contadas:
        t.pulseras_contadas == null ? null : Number(t.pulseras_contadas),
    }));
  }

  /** Las solicitudes de recepción desde ese instante, en cualquier estado. */
  async solicitudesDesde(
    companyId: number,
    desde: string,
  ): Promise<SolicitudConDetalle[]> {
    const filas: SolicitudConDetalle[] = [];
    for (let fila = 0; ; fila += PAGINA) {
      const { data, error } = await this.db
        .from('solicitudes_de_documento')
        .select('id, turno_de_caja_id, created_at, detalle, documento_id')
        .eq('company_id', companyId)
        .gte('created_at', desde)
        .order('id', { ascending: true })
        .range(fila, fila + PAGINA - 1);
      if (error) throw error;
      filas.push(...((data ?? []) as SolicitudConDetalle[]));
      if (!data || data.length < PAGINA) break;
    }
    return filas;
  }

  /** Lo emitido directo en «Nuevo DTE» desde ese instante: boletas y
   *  facturas sin evento y sin turno (no pasaron por una solicitud). */
  async directasDesde(
    companyId: number,
    desde: string,
  ): Promise<DocumentoDirecto[]> {
    const filas: DocumentoDirecto[] = [];
    for (let fila = 0; ; fila += PAGINA) {
      const { data, error } = await this.db
        .from('documentos_tributarios')
        .select('id, created_at, emitido_en, detalle, traida:respuesta->traida')
        .eq('company_id', companyId)
        .in('tipo', [33, 39])
        .eq('estado', 'emitido')
        .is('quotation_id', null)
        .is('turno_de_caja_id', null)
        .gte('created_at', desde)
        .order('id', { ascending: true })
        .range(fila, fila + PAGINA - 1);
      if (error) throw error;
      filas.push(...((data ?? []) as DocumentoDirecto[]));
      if (!data || data.length < PAGINA) break;
    }
    return filas;
  }
}
