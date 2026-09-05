import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { SupabaseService } from 'src/supabase/supabase.service';

/**
 * TIPOS DE EVENTO ADMINISTRABLES (05-09, doc 12): dejan de ser lista
 * fija en el código. Cada tipo declara su ENTRADA — 'cotizacion' (el
 * formulario público crea cotización, como siempre) o 'consulta' (el
 * embudo). OJO: tipo de CLIENTE y tipo de EVENTO son ejes separados;
 * este catálogo es del QUÉ celebran, no del quién.
 *
 * Reglas de Felipe: agregar y eliminar sí (eliminar solo sin uso,
 * "como siempre"); renombrar NO existe en v1 — el histórico guarda el
 * texto y un rename lo dejaría huérfano.
 */

export interface TipoDeEvento {
  id: number;
  company_id: number;
  name: string;
  entrada: 'cotizacion' | 'consulta';
  sort_order: number | null;
}

@Injectable()
export class EventTypesRepository {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(EventTypesRepository.name);
  }

  async listar(companyId: number): Promise<TipoDeEvento[]> {
    const { data, error } = await this.supabase.client
      .from('event_types')
      .select('*')
      .eq('company_id', companyId)
      .order('sort_order', { ascending: true, nullsFirst: false })
      .order('name');
    if (error) throw error;
    return (data ?? []) as TipoDeEvento[];
  }

  /** El nombre y nada más: lo que el formulario público necesita. */
  async listarPublico(companyId: number) {
    const tipos = await this.listar(companyId);
    return tipos.map((t) => ({ name: t.name }));
  }

  /** La categoría de entrada de un tipo; null si no está en catálogo
   *  (tipo histórico) — y ahí la puerta sigue creando cotización. */
  async entradaDe(companyId: number, name: string) {
    const { data, error } = await this.supabase.client
      .from('event_types')
      .select('entrada')
      .eq('company_id', companyId)
      .eq('name', name)
      .maybeSingle();
    if (error) throw error;
    return (data?.entrada ?? null) as 'cotizacion' | 'consulta' | null;
  }

  /** Devuelve el tipo creado, o 'duplicado' si el nombre ya existe. */
  async crear(companyId: number, name: string) {
    const { data, error } = await this.supabase.client
      .from('event_types')
      .insert({ company_id: companyId, name })
      .select('*')
      .single();
    if (error) {
      if (error.code === '23505') return 'duplicado' as const;
      throw error;
    }
    return data as TipoDeEvento;
  }

  async cambiarEntrada(
    id: number,
    companyId: number,
    entrada: 'cotizacion' | 'consulta',
  ) {
    const { data, error } = await this.supabase.client
      .from('event_types')
      .update({ entrada })
      .eq('id', id)
      .eq('company_id', companyId)
      .select('*')
      .maybeSingle();
    if (error) throw error;
    return data as TipoDeEvento | null;
  }

  async porId(id: number, companyId: number) {
    const { data, error } = await this.supabase.client
      .from('event_types')
      .select('*')
      .eq('id', id)
      .eq('company_id', companyId)
      .maybeSingle();
    if (error) throw error;
    return data as TipoDeEvento | null;
  }

  /** Cuántas cotizaciones y consultas apuntan al tipo (candado). */
  async usosDe(companyId: number, nombre: string) {
    const [cot, cons] = await Promise.all([
      this.supabase.client
        .from('quotations')
        .select('id', { count: 'exact', head: true })
        .eq('company_id', companyId)
        .eq('event_type', nombre),
      this.supabase.client
        .from('consultas')
        .select('id', { count: 'exact', head: true })
        .eq('company_id', companyId)
        .eq('event_type', nombre),
    ]);
    if (cot.error) throw cot.error;
    if (cons.error) throw cons.error;
    return (cot.count ?? 0) + (cons.count ?? 0);
  }

  async eliminar(id: number, companyId: number) {
    const { error } = await this.supabase.client
      .from('event_types')
      .delete()
      .eq('id', id)
      .eq('company_id', companyId);
    if (error) throw error;
  }
}
