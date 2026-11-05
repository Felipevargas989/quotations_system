import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { Company } from 'src/companies/entities/company.entity';
import { SupabaseService } from 'src/supabase/supabase.service';
import type { CotizacionParaCambiar } from './reglas';

// LO QUE LAS PROPUESTAS DE BELIA LEEN Y GUARDAN (doc 20, fase 2): la
// cotización que se va a cambiar, lo que valida «Crear evento» y la tabla
// `asistente_propuestas` (migración 181). Toda consulta filtra por la
// empresa de la SESIÓN. Lo aprobado NO se escribe acá: va por
// `QuotationsService.update` o `create`, como el cotizador y el formulario.

@Injectable()
export class PropuestasRepository {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(PropuestasRepository.name);
  }

  /** Lo que se necesita para cambiar los servicios de una cotización, con
   *  la empresa de la sesión. */
  async cotizacionParaCambiar(
    companyId: Company['id'],
    por: { numero: number } | { id: string },
  ): Promise<CotizacionParaCambiar | null> {
    let query = this.supabase.client
      .from('quotations')
      .select(
        `id, quotation_number, quotation_status, request_type, event_date,
         event_end_date, people_count, children_count, items,
         subtotal_amount, discount_percentage, discount_amount,
         tip_percentage, tip_amount, total_amount, value_per_person,
         fixed_value, clients ( name, client_type )`,
      )
      .eq('company_id', companyId);
    query =
      'numero' in por
        ? query.eq('quotation_number', por.numero)
        : query.eq('id', por.id);
    const { data, error } = await query.maybeSingle();
    if (error) throw error;
    return (data as unknown as CotizacionParaCambiar | null) ?? null;
  }

  /** Los tipos de evento activos de la empresa (Configuración), como los
   *  ofrece el cotizador. */
  async tiposDeEvento(companyId: Company['id']): Promise<string[]> {
    const { data, error } = await this.supabase.client
      .from('event_types')
      .select('name, activo')
      .eq('company_id', companyId)
      .order('sort_order', { ascending: true, nullsFirst: false })
      .order('name');
    if (error) throw error;
    return ((data ?? []) as { name: string; activo: boolean | null }[])
      .filter((t) => t.activo !== false)
      .map((t) => t.name);
  }

  /** Los tipos de cliente de la empresa (tabla client_types). */
  async tiposDeCliente(companyId: Company['id']): Promise<string[]> {
    const { data, error } = await this.supabase.client
      .from('client_types')
      .select('name')
      .eq('company_id', companyId)
      .order('sort_order', { ascending: true, nullsFirst: false })
      .order('name');
    if (error) throw error;
    return ((data ?? []) as { name: string }[]).map((t) => t.name);
  }

  /** Un cliente, solo si es de la empresa de la sesión. */
  async clienteDeLaEmpresa(
    companyId: Company['id'],
    id: string,
  ): Promise<{ id: string; name: string; client_type: string | null } | null> {
    const { data, error } = await this.supabase.client
      .from('clients')
      .select('id, name, client_type')
      .eq('company_id', companyId)
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    return (
      (data as {
        id: string;
        name: string;
        client_type: string | null;
      } | null) ?? null
    );
  }

  /** Cuántos insumos de este evento ya compró Compras. */
  async comprasDelEvento(
    companyId: Company['id'],
    quotationId: string,
  ): Promise<number> {
    const { count, error } = await this.supabase.client
      .from('event_supply_provisions')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', companyId)
      .eq('quotation_id', quotationId);
    if (error) throw error;
    return count ?? 0;
  }

  async crearPropuesta(fila: NuevaPropuesta): Promise<Propuesta> {
    const { data, error } = await this.supabase.client
      .from('asistente_propuestas')
      .insert(fila)
      .select('*')
      .single();
    if (error) throw error;
    return data as Propuesta;
  }

  async propuesta(
    companyId: Company['id'],
    id: string,
  ): Promise<Propuesta | null> {
    const { data, error } = await this.supabase.client
      .from('asistente_propuestas')
      .select('*')
      .eq('company_id', companyId)
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    return (data as Propuesta | null) ?? null;
  }

  /** Cambia la propuesta SOLO si sigue en el estado esperado: es el candado
   *  de dos clics. Devuelve si la tomó. */
  async moverPropuesta(
    companyId: Company['id'],
    id: string,
    desde: EstadoDePropuesta,
    cambios: Partial<Propuesta> & { estado: EstadoDePropuesta },
  ): Promise<boolean> {
    const { data, error } = await this.supabase.client
      .from('asistente_propuestas')
      .update(cambios)
      .eq('company_id', companyId)
      .eq('id', id)
      .eq('estado', desde)
      .select('id');
    if (error) throw error;
    return (data ?? []).length > 0;
  }

  /** Una cotización nueva propuesta reemplaza a las otras nuevas que la
   *  persona dejó pendientes. */
  async descartarNuevasPendientes(
    companyId: Company['id'],
    usuarioId: string,
  ): Promise<void> {
    const { error } = await this.supabase.client
      .from('asistente_propuestas')
      .update({ estado: 'descartada' })
      .eq('company_id', companyId)
      .eq('usuario_id', usuarioId)
      .eq('tipo', 'cotizacion_nueva')
      .eq('estado', 'pendiente');
    if (error) throw error;
  }

  /** Una propuesta nueva reemplaza a las pendientes de la misma persona
   *  sobre la misma cotización. */
  async descartarPendientes(
    companyId: Company['id'],
    quotationId: string,
    usuarioId: string,
  ): Promise<void> {
    const { error } = await this.supabase.client
      .from('asistente_propuestas')
      .update({ estado: 'descartada' })
      .eq('company_id', companyId)
      .eq('quotation_id', quotationId)
      .eq('usuario_id', usuarioId)
      .eq('estado', 'pendiente');
    if (error) throw error;
  }
}

export type EstadoDePropuesta =
  | 'pendiente'
  | 'aplicando'
  | 'aplicada'
  | 'deshaciendo'
  | 'deshecha'
  | 'descartada'
  | 'vencida';

export type NuevaPropuesta = {
  company_id: Company['id'];
  /** Null en una cotización nueva hasta que se crea. */
  quotation_id: string | null;
  usuario_id: string;
  usuario_nombre: string | null;
  tipo:
    | 'servicios'
    | 'nota'
    | 'cotizacion_nueva'
    | 'seguimiento'
    | 'leccion'
    | 'leccion_estado'
    // Corregir un cliente mal clasificado (doc 21 §6, migración 186).
    | 'cliente';
  resumen: string;
  antes: Record<string, unknown>;
  despues: Record<string, unknown>;
  huella_antes: string;
};

export type Propuesta = NuevaPropuesta & {
  id: string;
  estado: EstadoDePropuesta;
  huella_despues: string | null;
  vence_at: string;
  aplicada_at: string | null;
  deshecha_at: string | null;
  created_at: string;
};
