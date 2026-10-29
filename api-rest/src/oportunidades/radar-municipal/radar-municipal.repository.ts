import { Injectable } from '@nestjs/common';
import { SupabaseService } from 'src/supabase/supabase.service';
import type { TableroDelRadar } from './radar-municipal';

// El radar municipal (decisión 108): una sola función de la base arma todo
// lo de la pestaña, con las vistas que `radar_recalcular()` deja listas
// después de cada carga (migración 171). Datos públicos, sin empresa: los
// RUT de la empresa solo sirven para «Dónde no estás».
@Injectable()
export class RadarMunicipalRepository {
  constructor(private readonly supabase: SupabaseService) {}

  /** `anio` nulo: la base elige el último año completo. */
  async tablero(
    anio: number | null,
    regiones: string[],
    ruts: string[],
  ): Promise<TableroDelRadar> {
    const { data, error } = await this.supabase.client.rpc('radar_tablero', {
      p_anio: anio,
      p_regiones: regiones,
      p_ruts: ruts,
    });
    if (error) throw error;
    return (data ?? {}) as TableroDelRadar;
  }
}
