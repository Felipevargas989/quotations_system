import { Injectable } from '@nestjs/common';
import { SupabaseService } from 'src/supabase/supabase.service';
import type { ProcesoDeLaZona } from '../historia/mercado';
import type { ProcesoParaLeer } from '../lectura/lectura.service';
import {
  type FilaDeLaZona,
  procesoDeLaZona,
  procesoParaLeer,
  regionesDelMercado,
} from './mercado-de-la-zona';

// Lo que «Se viene» y los competidores leen del mercado (decisión 106):
// las licitaciones del rubro de los últimos 3 años en las regiones de la
// empresa, con sus ganadores (vista de la migración 169). Dato público,
// sin empresa. Se guarda 10 minutos en memoria: el mercado cambia de noche.
// Se pagina por código (después del último), no con «range»: saltarse
// miles de filas para llegar a la página siguiente pasaba el tope de
// tiempo de la base (medido en el laboratorio el 28-10).

const VISTA = 'mercado_licitaciones_con_ganadores';
const COLUMNAS =
  'codigo, nombre, organismo, organismo_codigo, unidad, comuna, region, fecha_publicacion, fecha_cierre, monto_estimado, oferentes, rubros, ganadores';
/** Como la historia del radar: algo más de 3 años. */
const MESES_DE_LA_ZONA = 38;
/** PostgREST no entrega más de mil filas por pedido. */
const PAGINA = 1000;
/** De a cuántos códigos se pregunta (la URL tiene tope). */
const LOTE = 100;
const VIGENCIA_MS = 10 * 60_000;

@Injectable()
export class MercadoDeLaZonaRepository {
  private readonly guardadas = new Map<
    string,
    { en: number; procesos: ProcesoDeLaZona[] }
  >();

  constructor(private readonly supabase: SupabaseService) {}

  private get db() {
    return this.supabase.client;
  }

  async procesosDeLaZona(regiones: string[]): Promise<ProcesoDeLaZona[]> {
    const nombres = regionesDelMercado(regiones);
    if (nombres.length === 0) return [];
    const clave = nombres.join('|');
    const guardada = this.guardadas.get(clave);
    if (guardada && Date.now() - guardada.en < VIGENCIA_MS) {
      return guardada.procesos;
    }
    const desde = new Date();
    desde.setUTCMonth(desde.getUTCMonth() - MESES_DE_LA_ZONA);
    const procesos: ProcesoDeLaZona[] = [];
    for (let ultimo = ''; ; ) {
      let consulta = this.db
        .from(VISTA)
        .select(COLUMNAS)
        .eq('del_rubro', true)
        .in('region', nombres)
        .gte('mes', desde.toISOString().slice(0, 10))
        .order('codigo', { ascending: true })
        .limit(PAGINA);
      if (ultimo) consulta = consulta.gt('codigo', ultimo);
      const { data, error } = await consulta;
      if (error) throw error;
      const pagina = (data ?? []) as FilaDeLaZona[];
      procesos.push(...pagina.map(procesoDeLaZona));
      if (pagina.length < PAGINA) break;
      ultimo = pagina[pagina.length - 1].codigo;
    }
    this.guardadas.set(clave, { en: Date.now(), procesos });
    return procesos;
  }

  /** Para la IA de «Se viene», las que el radar no tiene guardadas. */
  async paraLeer(codigos: string[]): Promise<ProcesoParaLeer[]> {
    const filas: ProcesoParaLeer[] = [];
    const unicos = [...new Set(codigos)];
    for (let i = 0; i < unicos.length; i += LOTE) {
      const { data, error } = await this.db
        .from(VISTA)
        .select(COLUMNAS)
        .in('codigo', unicos.slice(i, i + LOTE));
      if (error) throw error;
      filas.push(...((data ?? []) as FilaDeLaZona[]).map(procesoParaLeer));
    }
    return filas;
  }
}
