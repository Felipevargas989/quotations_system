import { Injectable } from '@nestjs/common';
import { SupabaseService } from 'src/supabase/supabase.service';
import type { ResultadoPublico } from './resultado-compra-agil';

// EL RESULTADO DE LAS COMPRAS ÁGILES POSTULADAS (decisión 92 del doc 17).
// Lo público (a quién eligieron y todas las ofertas) va en mp_cambios, con
// tipo «resultado», una vez por código, y no en mp_procesos: ahí el radar
// reescribe `adjudicacion` de las compras ágiles y la de noche reescribe
// `cotizantes`. Lo de cada empresa (ganada o perdida) va en su oportunidad.

/** Hasta cuántos días después del cierre se sigue esperando la orden. */
const DIAS_DE_ESPERA = 45;

export type CompraAgilPorResolver = {
  id: number;
  codigo: string;
  estado: 'postulada' | 'ganada' | 'perdida';
  /** Ya tiene su resultado público en mp_cambios. */
  anotada: boolean;
};

@Injectable()
export class ResultadosRepository {
  constructor(private readonly supabase: SupabaseService) {}

  private get db() {
    return this.supabase.client;
  }

  /** Las compras ágiles que la empresa postuló y ya cerraron: las que
   *  siguen en «postulada», y las que marcó a mano como ganada o perdida
   *  mientras no tengan su resultado público. Pocas, se piden de una. */
  async comprasAgilesPorResolver(
    companyId: number,
    ahora = Date.now(),
  ): Promise<CompraAgilPorResolver[]> {
    const { data, error } = await this.db
      .from('oportunidades')
      .select(
        'id, codigo, estado, proceso:mp_procesos!inner(tipo, fecha_cierre)',
      )
      .eq('company_id', companyId)
      .in('estado', ['postulada', 'ganada', 'perdida'])
      .limit(500);
    if (error) throw error;
    const desde = ahora - DIAS_DE_ESPERA * 24 * 3600_000;
    const cerradas = (
      (data ?? []) as unknown as Array<{
        id: number;
        codigo: string;
        estado: CompraAgilPorResolver['estado'];
        proceso: { tipo: string; fecha_cierre: string | null } | null;
      }>
    ).filter((f) => {
      const cierre = f.proceso?.fecha_cierre
        ? new Date(f.proceso.fecha_cierre).getTime()
        : NaN;
      return (
        f.proceso?.tipo === 'compra_agil' && cierre < ahora && cierre >= desde
      );
    });
    if (cerradas.length === 0) return [];
    const anotadas = await this.resultadosDe(cerradas.map((f) => f.codigo));
    return cerradas
      .map((f) => ({
        id: f.id,
        codigo: f.codigo,
        estado: f.estado,
        anotada: anotadas.has(f.codigo),
      }))
      .filter((f) => f.estado === 'postulada' || !f.anotada);
  }

  /** Ganada o perdida, solo si sigue en «postulada»: lo que la empresa
   *  marcó a mano no se pisa. */
  async marcarResultado(
    companyId: number,
    id: number,
    estado: 'ganada' | 'perdida',
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

  /** Lo público, una vez por código: es igual para cualquier empresa. */
  async registrarResultado(
    codigo: string,
    resultado: ResultadoPublico,
  ): Promise<void> {
    const { error } = await this.db.from('mp_cambios').insert({
      codigo,
      tipo: 'resultado',
      antes: null,
      despues: resultado,
    });
    if (error) throw error;
  }

  /** El último resultado público de cada código. */
  async resultadosDe(
    codigos: readonly string[],
  ): Promise<Map<string, ResultadoPublico>> {
    const r = new Map<string, ResultadoPublico>();
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
      despues: ResultadoPublico;
    }>) {
      if (!r.has(f.codigo)) r.set(f.codigo, f.despues);
    }
    return r;
  }
}
