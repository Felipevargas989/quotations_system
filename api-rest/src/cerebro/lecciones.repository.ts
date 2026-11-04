import { Injectable } from '@nestjs/common';
import type { Company } from 'src/companies/entities/company.entity';
import { SupabaseService } from 'src/supabase/supabase.service';
import type { EstadoDeLeccion, Leccion, TareaDeLeccion } from './lecciones';

// Las lecciones de cada empresa (migración 185). Toda lectura y escritura
// filtra por la empresa, salvo la carga del arranque, que trae las
// aprobadas de todas para dejarlas en la memoria del motor.

const COLUMNAS =
  'id, company_id, tarea, texto, motivo, estado, propuesta_por_nombre, decidida_por_nombre, decidida_at, created_at';

export type NuevaLeccion = {
  company_id: Company['id'];
  tarea: TareaDeLeccion;
  texto: string;
  motivo: string | null;
  propuesta_por: string | null;
  propuesta_por_nombre: string | null;
  estado: 'pendiente' | 'aprobada';
  decidida_por?: string | null;
  decidida_por_nombre?: string | null;
  decidida_at?: string | null;
};

@Injectable()
export class LeccionesRepository {
  constructor(private readonly supabase: SupabaseService) {}

  /** Las aprobadas de todas las empresas: la carga del arranque. */
  async aprobadasDeTodas(): Promise<Leccion[]> {
    const { data, error } = await this.supabase.client
      .from('cerebro_lecciones')
      .select(COLUMNAS)
      .eq('estado', 'aprobada')
      .order('created_at', { ascending: true })
      .limit(2000);
    if (error) throw error;
    return (data ?? []) as Leccion[];
  }

  async aprobadas(companyId: Company['id']): Promise<Leccion[]> {
    const { data, error } = await this.supabase.client
      .from('cerebro_lecciones')
      .select(COLUMNAS)
      .eq('company_id', companyId)
      .eq('estado', 'aprobada')
      .order('created_at', { ascending: true })
      .limit(200);
    if (error) throw error;
    return (data ?? []) as Leccion[];
  }

  /** Las aprobadas y las que esperan, las más nuevas primero. */
  async vivas(companyId: Company['id']): Promise<Leccion[]> {
    const { data, error } = await this.supabase.client
      .from('cerebro_lecciones')
      .select(COLUMNAS)
      .eq('company_id', companyId)
      .in('estado', ['pendiente', 'aprobada'])
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) throw error;
    return (data ?? []) as Leccion[];
  }

  async una(companyId: Company['id'], id: string): Promise<Leccion | null> {
    const { data, error } = await this.supabase.client
      .from('cerebro_lecciones')
      .select(COLUMNAS)
      .eq('company_id', companyId)
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    return (data as Leccion | null) ?? null;
  }

  async crear(fila: NuevaLeccion): Promise<Leccion> {
    const { data, error } = await this.supabase.client
      .from('cerebro_lecciones')
      .insert(fila)
      .select(COLUMNAS)
      .single();
    if (error) throw error;
    return data as Leccion;
  }

  /** Cambia el estado SOLO si sigue en el esperado (dos clics, dos
   *  personas): null si ya no estaba así. */
  async mover(
    companyId: Company['id'],
    id: string,
    desde: EstadoDeLeccion,
    cambio: {
      estado: EstadoDeLeccion;
      decidida_por: string | null;
      decidida_por_nombre: string | null;
    },
  ): Promise<Leccion | null> {
    const { data, error } = await this.supabase.client
      .from('cerebro_lecciones')
      .update({ ...cambio, decidida_at: new Date().toISOString() })
      .eq('company_id', companyId)
      .eq('id', id)
      .eq('estado', desde)
      .select(COLUMNAS)
      .maybeSingle();
    if (error) throw error;
    return (data as Leccion | null) ?? null;
  }
}
