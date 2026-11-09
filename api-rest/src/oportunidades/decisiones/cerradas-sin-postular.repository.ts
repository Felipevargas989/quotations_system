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
   *  medio, manda lo suyo. Sin cierre informado no se toca. Desde la
   *  decisión 122 (09-11) tampoco una con algo firmado en «Mi postulación»:
   *  esa espera que la empresa diga si la subió. Devuelve las que
   *  cambiaron. */
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
    const cerradas = ((data ?? []) as Array<{ id: number }>).map((f) => f.id);
    if (cerradas.length === 0) return [];
    // Decisión 122 (09-11). Felipe, con la 3904-996-COT26, que se descartó
    // sola habiéndola postulado por $570.000: "por qué no la veo acá". Con
    // algo firmado, lo más probable es que se haya subido: no se descarta
    // y «Mis licitaciones» pregunta «¿La subiste?».
    const { data: firmados, error: alLeer } = await this.db
      .from('oportunidad_adjuntos')
      .select('oportunidad_id')
      .eq('company_id', companyId)
      .eq('seccion', 'postulacion')
      .eq('origen', 'firmado')
      .in('oportunidad_id', cerradas);
    if (alLeer) throw alLeer;
    const conFirma = new Set(
      ((firmados ?? []) as Array<{ oportunidad_id: number }>).map(
        (f) => f.oportunidad_id,
      ),
    );
    const ids = cerradas.filter((id) => !conFirma.has(id));
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
