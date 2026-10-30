import { Injectable } from '@nestjs/common';
import { SupabaseService } from 'src/supabase/supabase.service';
import type { MotivoDelDescarte } from './decisiones';

// El registro de las decisiones (migración 175, decisión 113). Las filas
// las escriben los triggers de la base; aquí solo se pone el porqué de un
// descarte. Toda consulta filtra por company_id.

const DECISIONES = 'oportunidades_decisiones';

@Injectable()
export class DecisionesRepository {
  constructor(private readonly supabase: SupabaseService) {}

  private get db() {
    return this.supabase.client;
  }

  /** Pone el porqué en el último descarte de esa oportunidad. null = la
   *  oportunidad no es de la empresa o no está descartada. */
  async ponerMotivo(
    companyId: number,
    oportunidadId: number,
    motivo: MotivoDelDescarte,
  ): Promise<{ motivo: MotivoDelDescarte } | null> {
    const { data, error } = await this.db
      .from(DECISIONES)
      .select('id')
      .eq('company_id', companyId)
      .eq('oportunidad_id', oportunidadId)
      .eq('decision', 'descartada')
      .order('creado_en', { ascending: false })
      .limit(1);
    if (error) throw error;
    const ultimo = (data ?? [])[0] as { id: number } | undefined;
    if (!ultimo) return null;
    const { error: alGuardar } = await this.db
      .from(DECISIONES)
      .update({ motivo })
      .eq('id', ultimo.id)
      .eq('company_id', companyId);
    if (alGuardar) throw alGuardar;
    return { motivo };
  }
}
