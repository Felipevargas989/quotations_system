import { Injectable } from '@nestjs/common';
import { SupabaseService } from 'src/supabase/supabase.service';
import type { DocumentoDelTurno } from './cuadre';

/** Un turno de la caja de recepción, como se guarda (migración 199). */
export interface TurnoDeCaja {
  id: number;
  company_id: number;
  caja: string;
  abierta_por: string | null;
  abierta_por_nombre: string;
  abierta_en: string;
  sencillo_inicial: number;
  cerrada_por: string | null;
  cerrada_por_nombre: string | null;
  cerrada_en: string | null;
  declarado_efectivo: number | null;
  declarado_debito: number | null;
  declarado_credito: number | null;
  declarado_transferencia: number | null;
  comentario: string | null;
  revisado_por: string | null;
  revisado_por_nombre: string | null;
  revisado_en: string | null;
  nota_revision: string | null;
}

export interface RetiroDeCaja {
  id: number;
  turno_id: number;
  monto: number;
  motivo: string;
  created_at: string;
}

export interface CorreccionDeCaja {
  id: number;
  documento_id: number;
  medio_antes: string | null;
  medio_despues: string;
  corregido_por_nombre: string | null;
  created_at: string;
}

const TURNO =
  'id, company_id, caja, abierta_por, abierta_por_nombre, abierta_en, sencillo_inicial, cerrada_por, cerrada_por_nombre, cerrada_en, declarado_efectivo, declarado_debito, declarado_credito, declarado_transferencia, comentario, revisado_por, revisado_por_nombre, revisado_en, nota_revision';

const numeros = (t: TurnoDeCaja): TurnoDeCaja => ({
  ...t,
  sencillo_inicial: Number(t.sencillo_inicial),
  declarado_efectivo:
    t.declarado_efectivo == null ? null : Number(t.declarado_efectivo),
  declarado_debito:
    t.declarado_debito == null ? null : Number(t.declarado_debito),
  declarado_credito:
    t.declarado_credito == null ? null : Number(t.declarado_credito),
  declarado_transferencia:
    t.declarado_transferencia == null
      ? null
      : Number(t.declarado_transferencia),
});

/**
 * LA CAJA DE RECEPCIÓN EN LA BASE (doc 19 §9.43, migración 199). Toda
 * consulta va con `company_id`: el motor usa la llave de servicio.
 */
@Injectable()
export class CajaRepository {
  constructor(private readonly supabase: SupabaseService) {}

  private get db() {
    return this.supabase.client;
  }

  /** La caja de recepción abierta de la empresa, si hay. */
  async turnoAbierto(companyId: number): Promise<TurnoDeCaja | null> {
    const { data, error } = await this.db
      .from('turnos_de_caja')
      .select(TURNO)
      .eq('company_id', companyId)
      .eq('caja', 'recepcion')
      .is('cerrada_en', null)
      .maybeSingle();
    if (error) throw error;
    return data ? numeros(data as TurnoDeCaja) : null;
  }

  /** Abre la caja. Si ya hay una abierta, la base lo rechaza (23505). */
  async abrir(fila: {
    company_id: number;
    abierta_por: string | null;
    abierta_por_nombre: string;
    sencillo_inicial: number;
  }): Promise<TurnoDeCaja> {
    const { data, error } = await this.db
      .from('turnos_de_caja')
      .insert([{ ...fila, caja: 'recepcion' }])
      .select(TURNO)
      .single();
    if (error) throw error;
    return numeros(data as TurnoDeCaja);
  }

  /** Cierra la caja con lo declarado; nulo si ya estaba cerrada. */
  async cerrar(
    companyId: number,
    id: number,
    cierre: {
      cerrada_por: string | null;
      cerrada_por_nombre: string;
      declarado_efectivo: number;
      declarado_debito: number;
      declarado_credito: number;
      declarado_transferencia: number;
      comentario: string | null;
    },
  ): Promise<TurnoDeCaja | null> {
    const { data, error } = await this.db
      .from('turnos_de_caja')
      .update({ ...cierre, cerrada_en: new Date().toISOString() })
      .eq('company_id', companyId)
      .eq('id', id)
      .is('cerrada_en', null)
      .select(TURNO)
      .maybeSingle();
    if (error) throw error;
    return data ? numeros(data as TurnoDeCaja) : null;
  }

  /** Los turnos de la empresa, del más nuevo al más viejo. */
  async turnos(companyId: number, limite = 60): Promise<TurnoDeCaja[]> {
    const { data, error } = await this.db
      .from('turnos_de_caja')
      .select(TURNO)
      .eq('company_id', companyId)
      .order('abierta_en', { ascending: false })
      .limit(limite);
    if (error) throw error;
    return ((data ?? []) as TurnoDeCaja[]).map(numeros);
  }

  async turno(companyId: number, id: number): Promise<TurnoDeCaja | null> {
    const { data, error } = await this.db
      .from('turnos_de_caja')
      .select(TURNO)
      .eq('company_id', companyId)
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    return data ? numeros(data as TurnoDeCaja) : null;
  }

  async retiros(
    companyId: number,
    turnoIds: number[],
  ): Promise<RetiroDeCaja[]> {
    if (!turnoIds.length) return [];
    const { data, error } = await this.db
      .from('retiros_de_caja')
      .select('id, turno_id, monto, motivo, created_at')
      .eq('company_id', companyId)
      .in('turno_id', turnoIds)
      .order('created_at', { ascending: true });
    if (error) throw error;
    return ((data ?? []) as RetiroDeCaja[]).map((r) => ({
      ...r,
      monto: Number(r.monto),
    }));
  }

  async agregarRetiro(fila: {
    company_id: number;
    turno_id: number;
    monto: number;
    motivo: string;
    creado_por: string | null;
  }): Promise<void> {
    const { error } = await this.db.from('retiros_de_caja').insert([fila]);
    if (error) throw error;
  }

  /** Los documentos que entraron a esos turnos. */
  async documentos(
    companyId: number,
    turnoIds: number[],
  ): Promise<(DocumentoDelTurno & { turno_de_caja_id: number })[]> {
    if (!turnoIds.length) return [];
    const { data, error } = await this.db
      .from('documentos_tributarios')
      .select(
        'id, tipo, folio, estado, total, medio_de_pago, emitido_en, detalle, turno_de_caja_id',
      )
      .eq('company_id', companyId)
      .in('turno_de_caja_id', turnoIds)
      .order('id', { ascending: true });
    if (error) throw error;
    return (
      (data ?? []) as (DocumentoDelTurno & { turno_de_caja_id: number })[]
    ).map((d) => ({ ...d, total: Number(d.total), detalle: d.detalle ?? [] }));
  }

  /** El medio de pago de un documento del turno, corregido en la revisión. */
  async cambiarMedio(
    companyId: number,
    turnoId: number,
    documentoId: number,
    medio: string,
  ): Promise<{ medio_antes: string | null } | null> {
    const { data: antes, error: e1 } = await this.db
      .from('documentos_tributarios')
      .select('medio_de_pago')
      .eq('company_id', companyId)
      .eq('id', documentoId)
      .eq('turno_de_caja_id', turnoId)
      .maybeSingle();
    if (e1) throw e1;
    if (!antes) return null;
    const { error } = await this.db
      .from('documentos_tributarios')
      .update({ medio_de_pago: medio })
      .eq('company_id', companyId)
      .eq('id', documentoId)
      .eq('turno_de_caja_id', turnoId);
    if (error) throw error;
    return {
      medio_antes: (antes as { medio_de_pago: string | null }).medio_de_pago,
    };
  }

  async anotarCorreccion(fila: {
    company_id: number;
    turno_id: number;
    documento_id: number;
    medio_antes: string | null;
    medio_despues: string;
    corregido_por: string | null;
    corregido_por_nombre: string | null;
  }): Promise<void> {
    const { error } = await this.db.from('correcciones_de_caja').insert([fila]);
    if (error) throw error;
  }

  async correcciones(
    companyId: number,
    turnoId: number,
  ): Promise<CorreccionDeCaja[]> {
    const { data, error } = await this.db
      .from('correcciones_de_caja')
      .select(
        'id, documento_id, medio_antes, medio_despues, corregido_por_nombre, created_at',
      )
      .eq('company_id', companyId)
      .eq('turno_id', turnoId)
      .order('created_at', { ascending: true });
    if (error) throw error;
    return (data ?? []) as CorreccionDeCaja[];
  }

  /** Marca revisado un turno cerrado; nulo si no está cerrado. */
  async revisar(
    companyId: number,
    id: number,
    revision: {
      revisado_por: string | null;
      revisado_por_nombre: string | null;
      nota_revision: string | null;
    },
  ): Promise<TurnoDeCaja | null> {
    const { data, error } = await this.db
      .from('turnos_de_caja')
      .update({ ...revision, revisado_en: new Date().toISOString() })
      .eq('company_id', companyId)
      .eq('id', id)
      .not('cerrada_en', 'is', null)
      .select(TURNO)
      .maybeSingle();
    if (error) throw error;
    return data ? numeros(data as TurnoDeCaja) : null;
  }
}
