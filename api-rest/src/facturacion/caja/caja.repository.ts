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

/** Un documento del período, para «Lo vendido» (sprint 3). */
export interface DocumentoVendido {
  id: number;
  tipo: number;
  detalle: DocumentoDelTurno['detalle'];
  turno_de_caja_id: number | null;
  creado_por: string | null;
  /** El evento; sin él, salió de «Nuevo DTE». */
  quotation_id: string | null;
  /** Traída de facturacion.cl (§9.36): no se vendió en Eventia. */
  traida: boolean | null;
}

// Las filas de cada pedido a la base: lo más que entrega de una vez.
const PAGINA = 1000;
// Los id que van en un `in (...)`: que la dirección no se haga eterna.
const TROZO = 300;
const enTrozos = <T>(xs: T[]) =>
  Array.from({ length: Math.ceil(xs.length / TROZO) }, (_, i) =>
    xs.slice(i * TROZO, (i + 1) * TROZO),
  );

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

  /** Las boletas y facturas emitidas del período, por páginas. */
  async documentosDelPeriodo(
    companyId: number,
    desde: string,
    hasta: string,
  ): Promise<DocumentoVendido[]> {
    const filas: DocumentoVendido[] = [];
    for (let fila = 0; ; fila += PAGINA) {
      const { data, error } = await this.db
        .from('documentos_tributarios')
        .select(
          'id, tipo, detalle, turno_de_caja_id, creado_por, quotation_id, traida:respuesta->traida',
        )
        .eq('company_id', companyId)
        .in('tipo', [33, 39])
        .eq('estado', 'emitido')
        .gte('fecha_emision', desde)
        .lte('fecha_emision', hasta)
        .order('id', { ascending: true })
        .range(fila, fila + PAGINA - 1);
      if (error) throw error;
      filas.push(...((data ?? []) as DocumentoVendido[]));
      if (!data || data.length < PAGINA) break;
    }
    return filas;
  }

  /** Los que anuló una nota de crédito emitida (código 1). */
  async anulados(companyId: number, ids: number[]): Promise<Set<number>> {
    const anulados = new Set<number>();
    for (const trozo of enTrozos(ids)) {
      const { data, error } = await this.db
        .from('documentos_tributarios')
        .select('modifica_id')
        .eq('company_id', companyId)
        .eq('tipo', 61)
        .eq('codigo_referencia', 1)
        .eq('estado', 'emitido')
        .in('modifica_id', trozo);
      if (error) throw error;
      for (const d of (data ?? []) as { modifica_id: number }[])
        anulados.add(d.modifica_id);
    }
    return anulados;
  }

  /** Quién abrió cada turno. */
  async nombresDeTurnos(
    companyId: number,
    ids: number[],
  ): Promise<Map<number, string>> {
    const nombres = new Map<number, string>();
    for (const trozo of enTrozos(ids)) {
      const { data, error } = await this.db
        .from('turnos_de_caja')
        .select('id, abierta_por_nombre')
        .eq('company_id', companyId)
        .in('id', trozo);
      if (error) throw error;
      for (const t of (data ?? []) as {
        id: number;
        abierta_por_nombre: string;
      }[])
        nombres.set(t.id, t.abierta_por_nombre);
    }
    return nombres;
  }

  /** El nombre de cada persona por su id de sesión. */
  async nombresDePersonas(
    companyId: number,
    ids: string[],
  ): Promise<Map<string, string>> {
    const nombres = new Map<string, string>();
    for (const trozo of enTrozos(ids)) {
      const { data, error } = await this.db
        .from('user_profiles')
        .select('user_id, full_name')
        .eq('company_id', companyId)
        .in('user_id', trozo);
      if (error) throw error;
      for (const u of (data ?? []) as {
        user_id: string;
        full_name: string | null;
      }[])
        if (u.full_name) nombres.set(u.user_id, u.full_name);
    }
    return nombres;
  }

  /** El tarifario de la empresa: el nombre de hoy y la unidad de cada ítem. */
  async tarifario(
    companyId: number,
  ): Promise<{ id: number; nombre: string; unidad: string }[]> {
    const { data, error } = await this.db
      .from('tarifario_de_boletas')
      .select('id, nombre, unidad')
      .eq('company_id', companyId);
    if (error) throw error;
    return (data ?? []) as { id: number; nombre: string; unidad: string }[];
  }

  /** Los correos de las personas de esos cargos. */
  async correosDe(companyId: number, cargos: string[]): Promise<string[]> {
    if (!cargos.length) return [];
    const { data, error } = await this.db
      .from('user_profiles')
      .select('email')
      .eq('company_id', companyId)
      .in('role', cargos);
    if (error) throw error;
    return [
      ...new Set(
        ((data ?? []) as { email: string | null }[])
          .map((u) => (u.email ?? '').trim())
          .filter(Boolean),
      ),
    ];
  }

  async nombreDeLaEmpresa(companyId: number): Promise<string | null> {
    const { data, error } = await this.db
      .from('companies')
      .select('name')
      .eq('id', companyId)
      .maybeSingle();
    if (error) throw error;
    return (data as { name: string | null } | null)?.name ?? null;
  }
}
