import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { SupabaseService } from 'src/supabase/supabase.service';

// LA GRAN DESCARGA (19-10, decisión 28 del doc 17): la historia pide el
// detalle solo de los compradores de las regiones configuradas. El código
// de una licitación empieza con el de su unidad de compra (4364-13-LE26 es
// de la Municipalidad de Quillón), y la región de cada unidad ya está en
// los procesos guardados: 1.737 unidades conocidas el 19-10, el 97 % en una
// sola región. Aparte del repositorio grande, que está en el tope de 800
// líneas del portero.

const PAGINA = 1000;

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
}
