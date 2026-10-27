import { Injectable } from '@nestjs/common';
import { SupabaseService } from 'src/supabase/supabase.service';
import type { ResultadoDeCompraAgil } from './resultado-compra-agil';

// EL RESULTADO DE LAS COMPRAS ÁGILES POSTULADAS (decisión 92 del doc 17).
// Va en mp_cambios, con tipo «resultado», y no en mp_procesos: ahí el radar
// reescribe `adjudicacion` de las compras ágiles y la de noche reescribe
// `cotizantes`.

/** Hasta cuántos días después del cierre se sigue esperando la orden. */
const DIAS_DE_ESPERA = 45;

export type CompraAgilPostulada = { id: number; codigo: string };

@Injectable()
export class ResultadosRepository {
  constructor(private readonly supabase: SupabaseService) {}

  private get db() {
    return this.supabase.client;
  }

  /** Las compras ágiles que la empresa postuló, ya cerradas y sin resultado
   *  (siguen en «postulada»): pocas, se piden de una. */
  async comprasAgilesPostuladas(
    companyId: number,
    ahora = Date.now(),
  ): Promise<CompraAgilPostulada[]> {
    const { data, error } = await this.db
      .from('oportunidades')
      .select('id, codigo, proceso:mp_procesos!inner(tipo, fecha_cierre)')
      .eq('company_id', companyId)
      .eq('estado', 'postulada')
      .limit(500);
    if (error) throw error;
    const desde = ahora - DIAS_DE_ESPERA * 24 * 3600_000;
    return (
      (data ?? []) as unknown as Array<{
        id: number;
        codigo: string;
        proceso: { tipo: string; fecha_cierre: string | null } | null;
      }>
    )
      .filter((f) => {
        const cierre = f.proceso?.fecha_cierre
          ? new Date(f.proceso.fecha_cierre).getTime()
          : NaN;
        return (
          f.proceso?.tipo === 'compra_agil' && cierre < ahora && cierre >= desde
        );
      })
      .map((f) => ({ id: f.id, codigo: f.codigo }));
  }

  /** Ganada o perdida, solo si sigue en «postulada»: lo que la empresa
   *  marcó a mano no se pisa. */
  async marcarResultado(
    companyId: number,
    id: number,
    estado: ResultadoDeCompraAgil['estado'],
  ): Promise<boolean> {
    const { data, error } = await this.db
      .from('oportunidades')
      .update({ estado, actualizado_en: new Date().toISOString() })
      .eq('company_id', companyId)
      .eq('id', id)
      .eq('estado', 'postulada')
      .select('id');
    if (error) throw error;
    return (data ?? []).length > 0;
  }

  async registrarResultado(
    codigo: string,
    resultado: ResultadoDeCompraAgil,
  ): Promise<void> {
    const { error } = await this.db.from('mp_cambios').insert({
      codigo,
      tipo: 'resultado',
      antes: { estado: 'postulada' },
      despues: resultado,
    });
    if (error) throw error;
  }

  /** El último resultado de cada código, para «Mis licitaciones». */
  async resultadosDe(
    codigos: readonly string[],
  ): Promise<Map<string, ResultadoDeCompraAgil>> {
    const r = new Map<string, ResultadoDeCompraAgil>();
    if (codigos.length === 0) return r;
    const { data, error } = await this.db
      .from('mp_cambios')
      .select('codigo, despues, creado_en')
      .eq('tipo', 'resultado')
      .in('codigo', [...codigos])
      .order('creado_en', { ascending: false });
    if (error) throw error;
    for (const f of (data ?? []) as Array<{
      codigo: string;
      despues: ResultadoDeCompraAgil;
    }>) {
      if (!r.has(f.codigo)) r.set(f.codigo, f.despues);
    }
    return r;
  }
}
