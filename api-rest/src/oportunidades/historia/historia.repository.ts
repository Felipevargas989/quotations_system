import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { SupabaseService } from 'src/supabase/supabase.service';
import type { ActaDeAdjudicacion } from './acta';

// LA GRAN DESCARGA (19-10, decisión 28 del doc 17): la historia pide el
// detalle solo de los compradores de las regiones configuradas. El código
// de una licitación empieza con el de su unidad de compra (4364-13-LE26 es
// de la Municipalidad de Quillón), y la región de cada unidad ya está en
// los procesos guardados: 1.737 unidades conocidas el 19-10, el 97 % en una
// sola región. Aparte del repositorio grande, que está en el tope de 800
// líneas del portero.

const PAGINA = 1000;
const HORA = 60 * 60 * 1000;

/** La unidad de compra de un código de Mercado Público. */
export const unidadDelCodigo = (codigo: string): string =>
  codigo.split('-')[0]?.trim() ?? '';

@Injectable()
export class HistoriaRepository {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(HistoriaRepository.name);
  }

  private get db() {
    return this.supabase.client;
  }

  /** Las regiones de cada unidad de compra, según las licitaciones ya
   *  guardadas con su detalle. */
  async regionesDeLasUnidades(): Promise<Map<string, string[]>> {
    const unidades = new Map<string, Set<string>>();
    for (let desde = 0; ; desde += PAGINA) {
      const { data, error } = await this.db
        .from('mp_procesos')
        .select('codigo, region')
        .eq('tipo', 'licitacion')
        .not('region', 'is', null)
        .order('codigo', { ascending: true })
        .range(desde, desde + PAGINA - 1);
      if (error) throw error;
      for (const { codigo, region } of (data ?? []) as Array<{
        codigo: string;
        region: string;
      }>) {
        const unidad = unidadDelCodigo(codigo);
        if (!unidad) continue;
        unidades.set(unidad, (unidades.get(unidad) ?? new Set()).add(region));
      }
      if (!data || data.length < PAGINA) break;
    }
    return new Map([...unidades].map(([u, regiones]) => [u, [...regiones]]));
  }

  /** Las licitaciones que alguna empresa sigue (decisión 30, 19-10):
   *  cerradas, todavía sin su acta leída y no revisadas en las últimas 20
   *  horas. De cualquier región y color. */
  async procesosSeguidos(limite: number): Promise<Array<{ codigo: string }>> {
    const { data: seguidas, error: errorSeguidas } = await this.db
      .from('oportunidades')
      .select('codigo')
      .eq('estado', 'seguida')
      .limit(1000);
    if (errorSeguidas) throw errorSeguidas;
    const codigos = [
      ...new Set(
        ((seguidas ?? []) as Array<{ codigo: string }>).map((s) => s.codigo),
      ),
    ];
    if (codigos.length === 0) return [];
    const ahora = Date.now();
    const { data, error } = await this.db
      .from('mp_procesos')
      .select('codigo')
      .in('codigo', codigos)
      .eq('tipo', 'licitacion')
      .is('acta', null)
      .lt('fecha_cierre', new Date(ahora).toISOString())
      .lt('actualizado_en', new Date(ahora - 20 * HORA).toISOString())
      .order('fecha_cierre', { ascending: false })
      .limit(limite);
    if (error) throw error;
    return (data ?? []) as Array<{ codigo: string }>;
  }

  async guardarActa(codigo: string, acta: ActaDeAdjudicacion): Promise<void> {
    const { error } = await this.db
      .from('mp_procesos')
      .update({ acta, acta_leida_en: new Date().toISOString() })
      .eq('codigo', codigo);
    if (error) throw error;
  }
}
