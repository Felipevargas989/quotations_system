import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { SupabaseService } from 'src/supabase/supabase.service';
import type { FilaDeStaff } from './utils/cambio-de-tipo';
import type { CambioDeTipo, Tipo } from './utils/tipo-vigente';

/**
 * LA VENTANA «DESDE» (doc 10 §12): lo que el cambio de tipo escribe. La
 * lectura del historial vive en PeopleRepository, porque la usa cada vez
 * que lee a una persona. Todo filtra por company_id.
 */
@Injectable()
export class TipoDePersonaRepository {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(TipoDePersonaRepository.name);
  }

  /** Sus días de STAFF desde una fecha, con la plata y las marcas que
   *  deciden si se pueden tocar. Los eventos no se piden: no cambian. */
  async diasDeStaffDesde(
    companyId: number,
    personId: number,
    desde: string,
  ): Promise<FilaDeStaff[]> {
    const { data, error } = await this.supabase.client
      .from('event_staff')
      .select(
        'id, day, quotation_id, kind, amount, tip_amount, payroll_id, tip_payroll_id, ajuste, solo_propina',
      )
      .eq('company_id', companyId)
      .eq('person_id', personId)
      .is('quotation_id', null)
      .gte('day', desde);
    if (error) throw error;
    return (data ?? []) as FilaDeStaff[];
  }

  /** Los mismos cambios a varias filas, en un viaje. */
  async cambiarDias(
    companyId: number,
    ids: number[],
    datos: Record<string, unknown>,
  ) {
    if (ids.length === 0) return 0;
    this.logger.info(
      `cambiarDias ${ids.length} filas ${JSON.stringify(datos)}`,
    );
    const { error } = await this.supabase.client
      .from('event_staff')
      .update(datos)
      .in('id', ids)
      .eq('company_id', companyId)
      .is('quotation_id', null);
    if (error) throw error;
    return ids.length;
  }

  async registrar(row: {
    company_id: number;
    person_id: number;
    kind: Tipo;
    anterior: Tipo;
    desde: string;
    registrado_por: string | null;
    registrado_por_nombre: string | null;
  }): Promise<CambioDeTipo> {
    this.logger.info(
      `registrar tipo persona ${row.person_id}: ${row.kind} desde ${row.desde}`,
    );
    const { data, error } = await this.supabase.client
      .from('historial_de_tipo')
      .insert([row])
      .select(
        'id, person_id, kind, anterior, desde, registrado_en, registrado_por_nombre',
      )
      .single();
    if (error) throw error;
    return data as CambioDeTipo;
  }

  /** El `default_kind` guardado de cada persona, sin derivar: para
   *  ponerlo al día cuando un cambio a futuro ya llegó. */
  async tiposGuardados(companyId: number) {
    const { data, error } = await this.supabase.client
      .from('people')
      .select('id, default_kind')
      .eq('company_id', companyId);
    if (error) throw error;
    return (data ?? []) as { id: number; default_kind: string | null }[];
  }

  async guardarTipo(companyId: number, personId: number, kind: Tipo) {
    const { error } = await this.supabase.client
      .from('people')
      .update({ default_kind: kind })
      .eq('id', personId)
      .eq('company_id', companyId);
    if (error) throw error;
  }
}
