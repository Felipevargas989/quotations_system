import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { SupabaseService } from 'src/supabase/supabase.service';
import { LEIDA_SEGUN_LAS_BASES } from '../lectura/reglas';

// LO QUE LA FICHA MUESTRA Y DECIDE (Felipe, 17-10: "vamos con todas", la
// ficha más clara; decisión 21 del doc 17): el color que pone el análisis
// de las bases, el responsable que queda al marcar «Me interesa» y cuánta
// historia falta por cargar. Aparte de oportunidades.repository.ts, que ya
// pasa las 800 líneas (portero de la casa). Siempre de UNA empresa, salvo
// la historia, que es dato público.

@Injectable()
export class FichaRepository {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(FichaRepository.name);
  }

  private get db() {
    return this.supabase.client;
  }

  /** El color sigue a lo que dicen las bases (decisión 21 del doc 17): si
   *  se puede en el complejo, verde; si exigen otro lugar, rojo; "no queda
   *  claro" no lo cambia. Queda marcada como leída según las bases, y el
   *  radar ya no la relee con su lectura corta. false = no cambió nada. */
  async colorSegunLasBases(
    companyId: number,
    id: number,
    lugar: unknown,
    razon: string | null,
  ): Promise<boolean> {
    const semaforo = lugar === 'si' ? 'verde' : lugar === 'no' ? 'rojo' : null;
    if (!semaforo) return false;
    const { error } = await this.db
      .from('oportunidades')
      .update({
        semaforo,
        se_hace_en_el_complejo: lugar,
        ...(razon ? { razon } : {}),
        leida_con: LEIDA_SEGUN_LAS_BASES,
        leida_en: new Date().toISOString(),
      })
      .eq('company_id', companyId)
      .eq('id', id);
    if (error) throw error;
    return true;
  }

  /** El responsable de hoy: null si no tiene, undefined si no es de esta
   *  empresa. */
  async responsableDe(
    companyId: number,
    id: number,
  ): Promise<string | null | undefined> {
    const { data, error } = await this.db
      .from('oportunidades')
      .select('responsable_id')
      .eq('company_id', companyId)
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    if (!data) return undefined;
    return (data as { responsable_id: string | null }).responsable_id;
  }

  /** El perfil (user_profiles.id) de quien tiene la sesión. Una columna
   *  que apunta a user_profiles nunca recibe el id de la sesión directo. */
  async perfilDe(companyId: number, userId: string): Promise<string | null> {
    const { data, error } = await this.db
      .from('user_profiles')
      .select('id')
      .eq('company_id', companyId)
      .eq('user_id', userId)
      .maybeSingle();
    if (error) throw error;
    return (data as { id: string } | null)?.id ?? null;
  }

  /** Los días de historia que faltan por cargar (dato público). */
  async diasDeHistoriaPendientes(): Promise<number> {
    const { count, error } = await this.db
      .from('mp_historia')
      .select('fecha', { count: 'exact', head: true })
      .eq('estado', 'pendiente');
    if (error) throw error;
    return count ?? 0;
  }
}
