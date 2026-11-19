import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { SupabaseService } from 'src/supabase/supabase.service';
import type { FilaDelDia } from './utils/propina-de-otros-eventos';

/** Lo que se lee de cada fila: la jornada, la plata, las marcas y el
 *  número y el estado de su evento (nada más del otro evento). */
const COLUMNAS =
  'id, quotation_id, person_id, day, role_id, kind, starts_at, ends_at, break_minutes, solo_propina, ajuste, no_tip, amount, tip_amount, payroll_id, tip_payroll_id, quotations(quotation_number, quotation_status)';

/**
 * LA PROPINA DE LOS OTROS EVENTOS DEL DÍA (doc 10, 19-11-2026): las
 * lecturas que necesita. Aparte de PeopleRepository porque esa pieza ya
 * es grande. Todo filtra por company_id: los otros eventos son siempre de
 * la misma empresa.
 */
@Injectable()
export class PropinaDeOtrosEventosRepository {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(PropinaDeOtrosEventosRepository.name);
  }

  /** Todas las filas de esos días (de todos los eventos y del staff), o
   *  solo las de esas personas si se pasan. */
  async filasDeLosDias(
    companyId: number,
    dias: readonly string[],
    personas?: readonly number[],
  ): Promise<FilaDelDia[]> {
    if (dias.length === 0 || personas?.length === 0) return [];
    this.logger.info(`filasDeLosDias ${dias.length} días`);
    let q = this.supabase.client
      .from('event_staff')
      .select(COLUMNAS)
      .eq('company_id', companyId)
      .not('person_id', 'is', null)
      .in('day', [...dias]);
    if (personas) q = q.in('person_id', [...personas]);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as unknown as FilaDelDia[];
  }
}
