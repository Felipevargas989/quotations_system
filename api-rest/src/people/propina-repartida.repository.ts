import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { SupabaseService } from 'src/supabase/supabase.service';
import type { FilaDelPozo } from './utils/propina-repartida';

/**
 * LA PROPINA NO SE DESHACE A MEDIAS (doc 10 §14): la única lectura que
 * le falta a PeopleRepository, aparte porque esa pieza ya es grande.
 * Filtra por company_id: un pozo ajeno no se lee.
 */
@Injectable()
export class PropinaRepartidaRepository {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(PropinaRepartidaRepository.name);
  }

  /** Todas las filas que apuntan a ese pozo, tengan o no plata. */
  async filasDelPozo(
    companyId: number,
    poolId: number,
  ): Promise<FilaDelPozo[]> {
    this.logger.info(`filasDelPozo ${poolId}`);
    const { data, error } = await this.supabase.client
      .from('event_staff')
      .select('person_id, tip_amount, tip_payroll_id')
      .eq('company_id', companyId)
      .eq('tip_pool_id', poolId);
    if (error) throw error;
    return (data ?? []) as unknown as FilaDelPozo[];
  }

  /** Los pozos por id, con el número de su evento (para nombrarlos). */
  async pozosPorId(companyId: number, ids: readonly number[]) {
    if (ids.length === 0) return [] as PozoConNombre[];
    const { data, error } = await this.supabase.client
      .from('tip_pools')
      .select(COLUMNAS_POZO)
      .eq('company_id', companyId)
      .in('id', [...ids]);
    if (error) throw error;
    return (data ?? []) as unknown as PozoConNombre[];
  }

  /** Los pozos de esos eventos y de esos días de staff. */
  async pozosDe(
    companyId: number,
    quotationIds: readonly string[],
    dias: readonly string[],
  ) {
    const deEventos = async () => {
      if (quotationIds.length === 0) return [] as PozoConNombre[];
      const { data, error } = await this.supabase.client
        .from('tip_pools')
        .select(COLUMNAS_POZO)
        .eq('company_id', companyId)
        .in('quotation_id', [...quotationIds]);
      if (error) throw error;
      return (data ?? []) as unknown as PozoConNombre[];
    };
    const deDias = async () => {
      if (dias.length === 0) return [] as PozoConNombre[];
      const { data, error } = await this.supabase.client
        .from('tip_pools')
        .select(COLUMNAS_POZO)
        .eq('company_id', companyId)
        .is('quotation_id', null)
        .in('day', [...dias]);
      if (error) throw error;
      return (data ?? []) as unknown as PozoConNombre[];
    };
    const [a, b] = await Promise.all([deEventos(), deDias()]);
    return [...a, ...b];
  }

  /** Todas las filas que apuntan a esos pozos, con su pozo. */
  async filasDePozos(companyId: number, ids: readonly number[]) {
    if (ids.length === 0)
      return [] as (FilaDelPozo & { tip_pool_id: number })[];
    this.logger.info(`filasDePozos ${ids.length} pozos`);
    const { data, error } = await this.supabase.client
      .from('event_staff')
      .select('tip_pool_id, person_id, tip_amount, tip_payroll_id')
      .eq('company_id', companyId)
      .in('tip_pool_id', [...ids]);
    if (error) throw error;
    return (data ?? []) as unknown as (FilaDelPozo & { tip_pool_id: number })[];
  }
}

const COLUMNAS_POZO =
  'id, quotation_id, day, first_amount, second_amount, quotations(quotation_number)';

/** Un pozo con lo justo para medirlo y nombrarlo en un aviso. */
export interface PozoConNombre {
  id: number;
  quotation_id: string | null;
  day: string | null;
  first_amount: number | string | null;
  second_amount: number | string | null;
  quotations: { quotation_number: number } | null;
}
