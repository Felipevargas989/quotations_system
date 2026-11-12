import { Injectable } from '@nestjs/common';
import { SupabaseService } from 'src/supabase/supabase.service';
import type { LecturaCorta } from './lectura-corta';

// LA TABLA DE LA LECTURA CORTA (decisión 132, migración 206): una fila por
// oportunidad leída, agrupadas por lote. Es lo ÚNICO que escribe la prueba:
// no toca la oportunidad, ni su análisis, ni la bandeja. Siempre de UNA
// empresa.

/** 'prueba': la que se lanza a mano para medir; 'radar': la de cada pasada
 *  (decisión 132, segunda parte). */
export type OrigenDeLaLectura = 'prueba' | 'radar';

export type FilaNuevaDeLecturaCorta = {
  company_id: number;
  oportunidad_id: number;
  codigo: string;
  lote: string;
  origen: OrigenDeLaLectura;
  modelo: string;
};

export type FinDeLecturaCorta =
  | (LecturaCorta & {
      estado: 'listo';
      archivos: Array<{ id: number; nombre: string }>;
      no_leidos: Array<{ nombre: string; motivo: string }>;
      tokens_entrada: number;
      tokens_salida: number;
      costo_usd: number;
    })
  | {
      estado: 'error';
      error: string;
      tokens_entrada?: number;
      tokens_salida?: number;
      costo_usd?: number;
    };

@Injectable()
export class LecturaCortaRepository {
  constructor(private readonly supabase: SupabaseService) {}

  private get db() {
    return this.supabase.client;
  }

  /** La fila «procesando»; devuelve su id. */
  async crear(fila: FilaNuevaDeLecturaCorta): Promise<number> {
    const { data, error } = await this.db
      .from('oportunidades_lectura_corta')
      .insert(fila)
      .select('id')
      .single();
    if (error) throw error;
    return (data as { id: number }).id;
  }

  /** El lote más reciente de la empresa, o null si no hay pruebas. */
  async ultimoLote(companyId: number): Promise<string | null> {
    const { data, error } = await this.db
      .from('oportunidades_lectura_corta')
      .select('lote')
      .eq('company_id', companyId)
      .order('creado_en', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return (data as { lote: string } | null)?.lote ?? null;
  }

  /** Las filas de un lote, para contar el avance. */
  async delLote(
    companyId: number,
    lote: string,
  ): Promise<
    Array<{
      estado: string;
      veredicto: string | null;
      costo_usd: number | null;
    }>
  > {
    const { data, error } = await this.db
      .from('oportunidades_lectura_corta')
      .select('estado, veredicto, costo_usd')
      .eq('company_id', companyId)
      .eq('lote', lote);
    if (error) throw error;
    return (data ?? []) as Array<{
      estado: string;
      veredicto: string | null;
      costo_usd: number | null;
    }>;
  }

  async terminar(
    companyId: number,
    id: number,
    fin: FinDeLecturaCorta,
  ): Promise<void> {
    const { error } = await this.db
      .from('oportunidades_lectura_corta')
      .update({ ...fin, terminado_en: new Date().toISOString() })
      .eq('company_id', companyId)
      .eq('id', id);
    if (error) throw error;
  }
}
