import { Injectable } from '@nestjs/common';
import { SupabaseService } from 'src/supabase/supabase.service';
import type { MarcaDeExigencia } from '../ficha/ficha.repository';
import type { RespuestaDeLaEmpresa } from './lo-que-sabemos';

// Lo que Eventia sabe de cada empresa (migración 190). Toda lectura y
// escritura filtra por la empresa, salvo la carga del arranque, que trae
// las de todas para dejarlas en la memoria del motor.

const TABLA = 'oportunidades_lo_que_sabemos';
const COLUMNAS =
  'id, company_id, clave, pregunta, exigencia, respuesta, detalle, oportunidad_id, creado_en, actualizado_en';

export type NuevaRespuesta = {
  clave: string;
  pregunta: string;
  exigencia: string | null;
  respuesta: MarcaDeExigencia;
  detalle: string | null;
  oportunidad_id: number | null;
};

@Injectable()
export class LoQueSabemosRepository {
  constructor(private readonly supabase: SupabaseService) {}

  private get db() {
    return this.supabase.client;
  }

  /** Las de todas las empresas: la carga del arranque. */
  async deTodas(): Promise<RespuestaDeLaEmpresa[]> {
    const { data, error } = await this.db
      .from(TABLA)
      .select(COLUMNAS)
      .order('actualizado_en', { ascending: false })
      .limit(5000);
    if (error) throw error;
    return (data ?? []) as RespuestaDeLaEmpresa[];
  }

  /** Con el código de la licitación de donde salió («Mi empresa»). */
  async deLaEmpresa(companyId: number): Promise<RespuestaDeLaEmpresa[]> {
    const { data, error } = await this.db
      .from(TABLA)
      .select(`${COLUMNAS}, oportunidad:oportunidades(codigo)`)
      .eq('company_id', companyId)
      .order('actualizado_en', { ascending: false })
      .limit(1000);
    if (error) throw error;
    // La licitación es una sola (muchos a uno): llega como objeto.
    return (data ?? []) as unknown as RespuestaDeLaEmpresa[];
  }

  /** Guarda o reemplaza (una sola respuesta por exigencia y empresa). */
  async guardar(companyId: number, filas: NuevaRespuesta[]): Promise<void> {
    if (filas.length === 0) return;
    const ahora = new Date().toISOString();
    const { error } = await this.db.from(TABLA).upsert(
      filas.map((f) => ({
        ...f,
        company_id: companyId,
        actualizado_en: ahora,
      })),
      { onConflict: 'company_id,clave' },
    );
    if (error) throw error;
  }

  /** La de una exigencia, o null. */
  async porClave(
    companyId: number,
    clave: string,
  ): Promise<RespuestaDeLaEmpresa | null> {
    const { data, error } = await this.db
      .from(TABLA)
      .select(COLUMNAS)
      .eq('company_id', companyId)
      .eq('clave', clave)
      .maybeSingle();
    if (error) throw error;
    return (data as RespuestaDeLaEmpresa | null) ?? null;
  }

  /** Cambia lo que respondió. null si no es de esta empresa. */
  async cambiar(
    companyId: number,
    id: number,
    cambios: { respuesta?: MarcaDeExigencia; detalle?: string | null },
  ): Promise<RespuestaDeLaEmpresa | null> {
    const { data, error } = await this.db
      .from(TABLA)
      .update({ ...cambios, actualizado_en: new Date().toISOString() })
      .eq('company_id', companyId)
      .eq('id', id)
      .select(COLUMNAS)
      .maybeSingle();
    if (error) throw error;
    return (data as RespuestaDeLaEmpresa | null) ?? null;
  }

  /** Borra una. false si no era de esta empresa. */
  async borrar(companyId: number, id: number): Promise<boolean> {
    const { data, error } = await this.db
      .from(TABLA)
      .delete()
      .eq('company_id', companyId)
      .eq('id', id)
      .select('id');
    if (error) throw error;
    return (data ?? []).length > 0;
  }

  /** Olvida la respuesta de una exigencia (al desmarcarla). */
  async borrarPorClave(companyId: number, clave: string): Promise<void> {
    const { error } = await this.db
      .from(TABLA)
      .delete()
      .eq('company_id', companyId)
      .eq('clave', clave);
    if (error) throw error;
  }
}
