import { Injectable } from '@nestjs/common';
import { SupabaseService } from 'src/supabase/supabase.service';

// LAS CERRADAS SIN POSTULAR (decisión 116): la consulta que las busca y
// las descarta. Aparte de OportunidadesRepository, que ya roza las 800
// líneas del portero del kit de la casa. Toda consulta filtra por
// company_id.

/** «Mis licitaciones» son pocas: una página basta. */
const PAGINA = 1000;

@Injectable()
export class CerradasSinPostularRepository {
  constructor(private readonly supabase: SupabaseService) {}

  private get db() {
    return this.supabase.client;
  }

  /** Las «Me interesa» que cerraron sin postular pasan a descartadas. El
   *  cambio vuelve a pedir `en_estudio`: si la empresa la movió entre
   *  medio, manda lo suyo. Sin cierre informado no se toca. Devuelve las
   *  que cambiaron. */
  async descartarLasQueCerraron(
    companyId: number,
    ahora: Date = new Date(),
  ): Promise<number[]> {
    const { data, error } = await this.db
      .from('oportunidades')
      .select('id, proceso:mp_procesos!inner(fecha_cierre)')
      .eq('company_id', companyId)
      .eq('estado', 'en_estudio')
      .lt('proceso.fecha_cierre', ahora.toISOString())
      .limit(PAGINA);
    if (error) throw error;
    const ids = ((data ?? []) as Array<{ id: number }>).map((f) => f.id);
    if (ids.length === 0) return [];
    const { data: cambiadas, error: alCambiar } = await this.db
      .from('oportunidades')
      .update({ estado: 'descartada', actualizado_en: ahora.toISOString() })
      .eq('company_id', companyId)
      .eq('estado', 'en_estudio')
      .in('id', ids)
      .select('id');
    if (alCambiar) throw alCambiar;
    return ((cambiadas ?? []) as Array<{ id: number }>).map((f) => f.id);
  }
}
