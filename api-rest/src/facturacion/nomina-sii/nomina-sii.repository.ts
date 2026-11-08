import { Injectable } from '@nestjs/common';
import { SupabaseService } from 'src/supabase/supabase.service';
import type { ContribuyenteDelSii } from './nomina-sii';

/** Una carga de la nómina (migración 192). */
export interface CargaDeLaNomina {
  id: number;
  empezo_en: string;
  termino_en: string | null;
  estado: 'cargando' | 'lista' | 'fallo';
  empresas: number;
  error: string | null;
  pedida_por_nombre: string | null;
}

const COLUMNAS_DE_LA_CARGA =
  'id, empezo_en, termino_en, estado, empresas, error, pedida_por_nombre';

/**
 * LA NÓMINA DEL SII EN LA BASE (doc 19 §9.27, migración 192). Datos
 * públicos, de ninguna empresa: sin `company_id`. Solo el motor los lee.
 */
@Injectable()
export class NominaSiiRepository {
  constructor(private readonly supabase: SupabaseService) {}

  async ultimaCarga(): Promise<CargaDeLaNomina | null> {
    const { data, error } = await this.supabase.client
      .from('sii_cargas')
      .select(COLUMNAS_DE_LA_CARGA)
      .order('id', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return (data as CargaDeLaNomina | null) ?? null;
  }

  /** La última que terminó bien: la que se está usando. */
  async ultimaLista(): Promise<CargaDeLaNomina | null> {
    const { data, error } = await this.supabase.client
      .from('sii_cargas')
      .select(COLUMNAS_DE_LA_CARGA)
      .eq('estado', 'lista')
      .order('id', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return (data as CargaDeLaNomina | null) ?? null;
  }

  async empezarCarga(por: { id: string | null; nombre: string | null }) {
    const { data, error } = await this.supabase.client
      .from('sii_cargas')
      .insert({ pedida_por: por.id, pedida_por_nombre: por.nombre })
      .select(COLUMNAS_DE_LA_CARGA)
      .single();
    if (error) throw error;
    return data as CargaDeLaNomina;
  }

  async avanzarCarga(id: number, empresas: number) {
    const { error } = await this.supabase.client
      .from('sii_cargas')
      .update({ empresas })
      .eq('id', id);
    if (error) throw error;
  }

  async terminarCarga(id: number, empresas: number) {
    const { error } = await this.supabase.client
      .from('sii_cargas')
      .update({
        estado: 'lista',
        empresas,
        termino_en: new Date().toISOString(),
      })
      .eq('id', id);
    if (error) throw error;
  }

  async fallarCarga(id: number, motivo: string) {
    const { error } = await this.supabase.client
      .from('sii_cargas')
      .update({
        estado: 'fallo',
        error: motivo.slice(0, 500),
        termino_en: new Date().toISOString(),
      })
      .eq('id', id);
    if (error) throw error;
  }

  /** Guarda (o pone al día) una tanda de empresas de esta carga. */
  async guardar(filas: ContribuyenteDelSii[], cargaId: number) {
    if (!filas.length) return;
    const { error } = await this.supabase.client
      .from('sii_contribuyentes')
      .upsert(
        filas.map((f) => ({ ...f, carga_id: cargaId })),
        { onConflict: 'rut' },
      );
    if (error) throw error;
  }

  /** Las empresas que ya no vienen en la nómina (dejaron de operar). De a
   *  tandas, para no tener la base ocupada mucho rato. */
  async borrarLasDeOtrasCargas(cargaId: number) {
    const { error } = await this.supabase.client
      .from('sii_contribuyentes')
      .delete()
      .neq('carga_id', cargaId);
    if (error) throw error;
  }

  /** La empresa de ese RUT (sin dígito verificador), o nulo. */
  async contribuyente(rut: number): Promise<ContribuyenteDelSii | null> {
    const { data, error } = await this.supabase.client
      .from('sii_contribuyentes')
      .select(
        'rut, dv, razon_social, giro, actividades, direccion, comuna, ciudad',
      )
      .eq('rut', rut)
      .maybeSingle();
    if (error) throw error;
    return (data as ContribuyenteDelSii | null) ?? null;
  }

  /** El diccionario de actividades de esta carga (unas setecientas). */
  async guardarActividades(
    actividades: { codigo: number; descripcion: string }[],
  ) {
    for (let i = 0; i < actividades.length; i += 1000) {
      const { error } = await this.supabase.client
        .from('sii_actividades')
        .upsert(actividades.slice(i, i + 1000), { onConflict: 'codigo' });
      if (error) throw error;
    }
  }

  /** La descripción de cada código de actividad. */
  async descripcionesDe(codigos: number[]) {
    const descripciones = new Map<number, string>();
    if (!codigos.length) return descripciones;
    const { data, error } = await this.supabase.client
      .from('sii_actividades')
      .select('codigo, descripcion')
      .in('codigo', codigos);
    if (error) throw error;
    for (const a of (data ?? []) as { codigo: number; descripcion: string }[])
      descripciones.set(a.codigo, a.descripcion);
    return descripciones;
  }
}
