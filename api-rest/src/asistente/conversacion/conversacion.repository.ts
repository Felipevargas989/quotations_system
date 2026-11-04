import { Injectable } from '@nestjs/common';
import { Company } from 'src/companies/entities/company.entity';
import { SupabaseService } from 'src/supabase/supabase.service';
import type { UserRole } from 'src/users/entities/user.entity';

// LA CONVERSACIÓN GUARDADA DE CADA PERSONA (doc 20 §13): la tabla
// `asistente_conversaciones` (migración 182). Toda consulta va con la
// empresa y la persona de la SESIÓN, nunca con lo que mande el navegador.

/** Un turno como lo muestra la ventanilla. Las tarjetas van tal cual, solo
 *  para pintarlas de nuevo: el «Sí, aplicar» se revisa contra la propuesta
 *  guardada (migración 181), nunca contra esto. */
export type TurnoGuardado = {
  rol: 'persona' | 'belia';
  texto: string;
  error?: boolean;
  propuestas?: Record<string, unknown>[];
};

export type ConversacionGuardada = {
  cargo: UserRole;
  turnos: TurnoGuardado[];
  updated_at: string;
};

@Injectable()
export class ConversacionRepository {
  constructor(private readonly supabase: SupabaseService) {}

  async leer(
    companyId: Company['id'],
    usuarioId: string,
  ): Promise<ConversacionGuardada | null> {
    const { data, error } = await this.supabase.client
      .from('asistente_conversaciones')
      .select('cargo, turnos, updated_at')
      .eq('company_id', companyId)
      .eq('usuario_id', usuarioId)
      .maybeSingle();
    if (error) throw error;
    return (data as ConversacionGuardada | null) ?? null;
  }

  async guardar(
    companyId: Company['id'],
    usuarioId: string,
    cargo: UserRole,
    turnos: TurnoGuardado[],
  ): Promise<void> {
    const { error } = await this.supabase.client
      .from('asistente_conversaciones')
      .upsert(
        {
          company_id: companyId,
          usuario_id: usuarioId,
          cargo,
          turnos,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'company_id,usuario_id' },
      );
    if (error) throw error;
  }

  async borrar(companyId: Company['id'], usuarioId: string): Promise<void> {
    const { error } = await this.supabase.client
      .from('asistente_conversaciones')
      .delete()
      .eq('company_id', companyId)
      .eq('usuario_id', usuarioId);
    if (error) throw error;
  }

  /** Las de la empresa que nadie usa desde `antesDe` (los 90 días). */
  async borrarSinUso(companyId: Company['id'], antesDe: string): Promise<void> {
    const { error } = await this.supabase.client
      .from('asistente_conversaciones')
      .delete()
      .eq('company_id', companyId)
      .lt('updated_at', antesDe);
    if (error) throw error;
  }
}
