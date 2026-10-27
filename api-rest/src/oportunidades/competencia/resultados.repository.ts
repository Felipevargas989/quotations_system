import { Injectable } from '@nestjs/common';
import { SupabaseService } from 'src/supabase/supabase.service';
import type { ResultadoPublico } from './resultado-compra-agil';

// EL RESULTADO DE LO POSTULADO (decisión 92 del doc 17). Lo público (a
// quién eligieron o adjudicaron, y las ofertas) va en mp_cambios, con tipo
// «resultado», una vez por código, y no en mp_procesos: ahí el radar
// reescribe `adjudicacion` y la de noche reescribe `cotizantes`. Lo de cada
// empresa (ganada o perdida) va en su oportunidad.

/** Hasta cuántos días después del cierre se sigue esperando que el
 *  comprador elija, en una compra ágil. */
const DIAS_DE_ESPERA = 45;

export type PorResolver = {
  id: number;
  codigo: string;
  tipo: 'compra_agil' | 'licitacion';
  estado: 'postulada' | 'ganada' | 'perdida';
  /** Ya tiene su resultado público en mp_cambios. */
  anotada: boolean;
  /** Lo que el radar ya leyó de Mercado Público: en una licitación, la
   *  adjudicación. */
  proceso: { estado: string | null; adjudicacion: unknown };
};

@Injectable()
export class ResultadosRepository {
  constructor(private readonly supabase: SupabaseService) {}

  private get db() {
    return this.supabase.client;
  }

  /** Lo que la empresa postuló y ya cerró: lo que sigue en «postulada», y
   *  lo que marcó a mano como ganada o perdida mientras no tenga su
   *  resultado público. Una compra ágil, hasta 45 días después del cierre;
   *  una licitación, cuando el radar ya trae su adjudicación. Pocas, se
   *  piden de una. */
  async porResolver(
    companyId: number,
    ahora = Date.now(),
  ): Promise<PorResolver[]> {
    const { data, error } = await this.db
      .from('oportunidades')
      .select(
        'id, codigo, estado, proceso:mp_procesos!inner(tipo, estado, fecha_cierre, adjudicacion)',
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
        estado: PorResolver['estado'];
        proceso: {
          tipo: string;
          estado: string | null;
          fecha_cierre: string | null;
          adjudicacion: unknown;
        } | null;
      }>
    ).filter((f) => {
      if (f.proceso?.tipo === 'licitacion')
        return f.proceso.adjudicacion != null;
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
      .map(
        (f): PorResolver => ({
          id: f.id,
          codigo: f.codigo,
          tipo: f.proceso?.tipo === 'licitacion' ? 'licitacion' : 'compra_agil',
          estado: f.estado,
          anotada: anotadas.has(f.codigo),
          proceso: {
            estado: f.proceso?.estado ?? null,
            adjudicacion: f.proceso?.adjudicacion ?? null,
          },
        }),
      )
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
