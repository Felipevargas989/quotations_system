import { Injectable } from '@nestjs/common';
import { SupabaseService } from 'src/supabase/supabase.service';
import type { DocumentoDelTurno, SolicitudDelTurno } from '../caja/cuadre';

/** Una solicitud de boleta o factura de recepción (migración 200). */
export interface Solicitud {
  id: number;
  company_id: number;
  tipo: number;
  estado: 'pendiente' | 'emitiendo' | 'aprobada' | 'rechazada';
  pedido: Record<string, unknown>;
  detalle: DocumentoDelTurno['detalle'];
  total: number;
  /** Nulo solo en la factura a crédito (§9.46, migración 201). */
  medio_de_pago: string | null;
  correo: string | null;
  imprimir: boolean;
  para: string | null;
  turno_de_caja_id: number;
  solicitada_por: string | null;
  solicitada_por_nombre: string;
  solicitada_por_cargo: string;
  created_at: string;
  resuelta_por: string | null;
  resuelta_por_nombre: string | null;
  resuelta_en: string | null;
  motivo_rechazo: string | null;
  error: string | null;
  documento_id: number | null;
  /** El documento que la emitió (N° y estado), si hay. */
  documento: {
    folio: number | null;
    estado: string;
    pdf_path: string | null;
  } | null;
}

export type NuevaSolicitud = Pick<
  Solicitud,
  | 'company_id'
  | 'tipo'
  | 'pedido'
  | 'detalle'
  | 'total'
  | 'medio_de_pago'
  | 'correo'
  | 'imprimir'
  | 'para'
  | 'turno_de_caja_id'
  | 'solicitada_por'
  | 'solicitada_por_nombre'
  | 'solicitada_por_cargo'
>;

const SOLICITUD =
  'id, company_id, tipo, estado, pedido, detalle, total, medio_de_pago, correo, imprimir, para, turno_de_caja_id, solicitada_por, solicitada_por_nombre, solicitada_por_cargo, created_at, resuelta_por, resuelta_por_nombre, resuelta_en, motivo_rechazo, error, documento_id, documento:documentos_tributarios(folio, estado, pdf_path)';

const conNumeros = (s: Solicitud): Solicitud => ({
  ...s,
  total: Number(s.total),
  detalle: s.detalle ?? [],
  documento: Array.isArray(s.documento)
    ? (((s.documento as unknown[])[0] as Solicitud['documento']) ?? null)
    : (s.documento ?? null),
});

/** Para la caja: la solicitud con el estado de su documento. */
const delTurno = (
  s: Solicitud,
): SolicitudDelTurno & {
  turno_de_caja_id: number;
} => ({
  id: s.id,
  tipo: s.tipo,
  estado: s.estado,
  total: s.total,
  medio_de_pago: s.medio_de_pago,
  created_at: s.created_at,
  detalle: s.detalle,
  documento_id: s.documento_id,
  documento_estado: s.documento?.estado ?? null,
  turno_de_caja_id: s.turno_de_caja_id,
});

// Las filas de cada pedido a la base: lo más que entrega de una vez.
const PAGINA = 1000;

/**
 * LAS SOLICITUDES DE RECEPCIÓN EN LA BASE (doc 19 §9.45, migración 200).
 * Toda consulta va con `company_id`: el motor usa la llave de servicio. No
 * se borran: una rechazada queda, porque su plata entró a la caja.
 */
@Injectable()
export class SolicitudesRepository {
  constructor(private readonly supabase: SupabaseService) {}

  private get db() {
    return this.supabase.client;
  }

  async crear(fila: NuevaSolicitud): Promise<Solicitud> {
    const { data, error } = await this.db
      .from('solicitudes_de_documento')
      .insert([fila])
      .select(SOLICITUD)
      .single();
    if (error) throw error;
    return conNumeros(data as unknown as Solicitud);
  }

  async una(companyId: number, id: number): Promise<Solicitud | null> {
    const { data, error } = await this.db
      .from('solicitudes_de_documento')
      .select(SOLICITUD)
      .eq('company_id', companyId)
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    return data ? conNumeros(data as unknown as Solicitud) : null;
  }

  /** Las por resolver (también las que se están emitiendo) y las resueltas
   *  desde `desde`, de la más nueva a la más vieja. */
  async lista(companyId: number, desde: string): Promise<Solicitud[]> {
    const { data, error } = await this.db
      .from('solicitudes_de_documento')
      .select(SOLICITUD)
      .eq('company_id', companyId)
      .or(`estado.in.(pendiente,emitiendo),created_at.gte.${desde}`)
      .order('created_at', { ascending: false })
      .limit(300);
    if (error) throw error;
    return ((data ?? []) as unknown as Solicitud[]).map(conNumeros);
  }

  /** Cuántas esperan (para el número de la pestaña). */
  async pendientes(companyId: number): Promise<number> {
    const { count, error } = await this.db
      .from('solicitudes_de_documento')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', companyId)
      .eq('estado', 'pendiente');
    if (error) throw error;
    return count ?? 0;
  }

  /**
   * La toma quien la aprueba: de «pendiente» a «emitiendo» en un solo paso,
   * así dos personas no la emiten dos veces. Nula si ya no estaba
   * pendiente.
   */
  async tomar(
    companyId: number,
    id: number,
    quien: { resuelta_por: string | null; resuelta_por_nombre: string },
  ): Promise<Solicitud | null> {
    const { data, error } = await this.db
      .from('solicitudes_de_documento')
      .update({ estado: 'emitiendo', error: null, ...quien })
      .eq('company_id', companyId)
      .eq('id', id)
      .eq('estado', 'pendiente')
      .select(SOLICITUD)
      .maybeSingle();
    if (error) throw error;
    return data ? conNumeros(data as unknown as Solicitud) : null;
  }

  /** Salió (emitida o por confirmar): aprobada, con su documento. */
  async aprobar(
    companyId: number,
    id: number,
    documentoId: number,
  ): Promise<void> {
    const { error } = await this.db
      .from('solicitudes_de_documento')
      .update({
        estado: 'aprobada',
        documento_id: documentoId,
        resuelta_en: new Date().toISOString(),
        error: null,
      })
      .eq('company_id', companyId)
      .eq('id', id)
      .eq('estado', 'emitiendo');
    if (error) throw error;
  }

  /** No salió: vuelve a esperar, con lo que respondió la emisión. */
  async devolver(companyId: number, id: number, motivo: string): Promise<void> {
    const { error } = await this.db
      .from('solicitudes_de_documento')
      .update({
        estado: 'pendiente',
        error: motivo.slice(0, 500),
        resuelta_por: null,
        resuelta_por_nombre: null,
      })
      .eq('company_id', companyId)
      .eq('id', id)
      .eq('estado', 'emitiendo');
    if (error) throw error;
  }

  /** No se sabe si salió: se queda «emitiendo» (no vuelve a pendiente,
   *  para no emitirla dos veces) con lo que pasó, para revisarla. */
  async anotarError(
    companyId: number,
    id: number,
    motivo: string,
  ): Promise<void> {
    const { error } = await this.db
      .from('solicitudes_de_documento')
      .update({ error: motivo.slice(0, 500) })
      .eq('company_id', companyId)
      .eq('id', id);
    if (error) throw error;
  }

  /** Rechazada: nunca va al SII. Nula si ya no estaba pendiente. */
  async rechazar(
    companyId: number,
    id: number,
    r: {
      resuelta_por: string | null;
      resuelta_por_nombre: string;
      motivo_rechazo: string | null;
    },
  ): Promise<Solicitud | null> {
    const { data, error } = await this.db
      .from('solicitudes_de_documento')
      .update({
        ...r,
        estado: 'rechazada',
        resuelta_en: new Date().toISOString(),
      })
      .eq('company_id', companyId)
      .eq('id', id)
      .eq('estado', 'pendiente')
      .select(SOLICITUD)
      .maybeSingle();
    if (error) throw error;
    return data ? conNumeros(data as unknown as Solicitud) : null;
  }

  /** Las de esos turnos, para el cuadre de la caja (§9.45). */
  async delTurno(
    companyId: number,
    turnoIds: number[],
  ): Promise<(SolicitudDelTurno & { turno_de_caja_id: number })[]> {
    if (!turnoIds.length) return [];
    const { data, error } = await this.db
      .from('solicitudes_de_documento')
      .select(SOLICITUD)
      .eq('company_id', companyId)
      .in('turno_de_caja_id', turnoIds)
      .order('id', { ascending: true });
    if (error) throw error;
    return ((data ?? []) as unknown as Solicitud[])
      .map(conNumeros)
      .map(delTurno);
  }

  /** Las pedidas entre dos instantes, para «Lo vendido» (§9.45). */
  async delPeriodo(
    companyId: number,
    desde: string,
    hasta: string,
  ): Promise<(SolicitudDelTurno & { turno_de_caja_id: number })[]> {
    const filas: (SolicitudDelTurno & { turno_de_caja_id: number })[] = [];
    for (let fila = 0; ; fila += PAGINA) {
      const { data, error } = await this.db
        .from('solicitudes_de_documento')
        .select(SOLICITUD)
        .eq('company_id', companyId)
        .gte('created_at', desde)
        .lt('created_at', hasta)
        .order('id', { ascending: true })
        .range(fila, fila + PAGINA - 1);
      if (error) throw error;
      filas.push(
        ...((data ?? []) as unknown as Solicitud[])
          .map(conNumeros)
          .map(delTurno),
      );
      if (!data || data.length < PAGINA) break;
    }
    return filas;
  }

  /** La revisión de la caja corrige el medio de una solicitud del turno. */
  async cambiarMedio(
    companyId: number,
    turnoId: number,
    id: number,
    medio: string,
  ): Promise<{ medio_antes: string } | null> {
    // La factura a crédito no trae medio ni cuenta en la caja (§9.46): no
    // es de ningún cierre.
    const { data: antes, error: e1 } = await this.db
      .from('solicitudes_de_documento')
      .select('medio_de_pago')
      .eq('company_id', companyId)
      .eq('id', id)
      .eq('turno_de_caja_id', turnoId)
      .maybeSingle();
    if (e1) throw e1;
    const medioAntes = (antes as { medio_de_pago: string | null } | null)
      ?.medio_de_pago;
    if (!medioAntes) return null;
    const { error } = await this.db
      .from('solicitudes_de_documento')
      .update({ medio_de_pago: medio })
      .eq('company_id', companyId)
      .eq('id', id)
      .eq('turno_de_caja_id', turnoId);
    if (error) throw error;
    return { medio_antes: medioAntes };
  }
}
