import { Injectable } from '@nestjs/common';
import type { Company } from 'src/companies/entities/company.entity';
import { SupabaseService } from 'src/supabase/supabase.service';
import type { Guia, SeccionDeGuia } from './guia';

// La guía de la casa de cada empresa (migración 202). Toda lectura y
// escritura filtra por la empresa, salvo la carga del arranque, que trae
// las de todas para dejarlas en la memoria del motor.

type Fila = {
  company_id: number;
  secciones: SeccionDeGuia[] | null;
  actualizada_por_nombre: string | null;
  updated_at: string | null;
};

const COLUMNAS = 'company_id, secciones, actualizada_por_nombre, updated_at';

const comoGuia = (f: Fila | null): Guia => ({
  secciones: Array.isArray(f?.secciones) ? f.secciones : [],
  actualizada_por_nombre: f?.actualizada_por_nombre ?? null,
  updated_at: f?.updated_at ?? null,
});

@Injectable()
export class GuiaRepository {
  constructor(private readonly supabase: SupabaseService) {}

  /** Las de todas las empresas: la carga del arranque. */
  async todas(): Promise<Map<number, SeccionDeGuia[]>> {
    const { data, error } = await this.supabase.client
      .from('guias_de_la_casa')
      .select(COLUMNAS)
      .limit(5000);
    if (error) throw error;
    return new Map(
      ((data ?? []) as Fila[]).map((f) => [
        f.company_id,
        comoGuia(f).secciones,
      ]),
    );
  }

  async de(companyId: Company['id']): Promise<Guia> {
    const { data, error } = await this.supabase.client
      .from('guias_de_la_casa')
      .select(COLUMNAS)
      .eq('company_id', companyId)
      .maybeSingle();
    if (error) throw error;
    return comoGuia(data as Fila | null);
  }

  async guardar(
    companyId: Company['id'],
    secciones: SeccionDeGuia[],
    por: { id: string | null; nombre: string | null },
  ): Promise<Guia> {
    const { data, error } = await this.supabase.client
      .from('guias_de_la_casa')
      .upsert(
        {
          company_id: companyId,
          secciones,
          actualizada_por: por.id,
          actualizada_por_nombre: por.nombre,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'company_id' },
      )
      .select(COLUMNAS)
      .single();
    if (error) throw error;
    return comoGuia(data as Fila);
  }
}
