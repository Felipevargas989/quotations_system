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
}
