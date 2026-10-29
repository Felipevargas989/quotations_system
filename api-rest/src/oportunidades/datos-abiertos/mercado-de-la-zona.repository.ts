import { Injectable } from '@nestjs/common';
import { SupabaseService } from 'src/supabase/supabase.service';
import type { ProcesoDeLaZona } from '../historia/mercado';
import type { ProcesoParaLeer } from '../lectura/lectura.service';
import { codigosDeRegiones } from '../mercado-publico/mapeo';
import {
  type FilaDeLaZona,
  procesoDeLaZona,
  procesoParaLeer,
  regionesDelMercado,
} from './mercado-de-la-zona';

// Lo que «Se viene» y los competidores leen del mercado (decisión 106):
// las licitaciones del rubro de los últimos 3 años en las regiones de la
// empresa, con sus ganadores. Dato público, sin empresa. Se guarda 10
// minutos en memoria: el mercado cambia de noche.
// Desde la decisión 109 (migración 172) se lee la capa resumida,
// `mercado_compras`: los ganadores ya vienen armados y con el RUT limpio, y
// se pide una región a la vez, por su código oficial (el mismo que usa el
// radar con la API de Compra Ágil), en orden de código y por su índice: 15 ms
// la página en el laboratorio, contra casi un segundo de la vista. Si la
// capa todavía está vacía, se lee la vista de la 169 como antes.
// Se pagina por código (después del último), no con «range»: saltarse
// miles de filas para llegar a la página siguiente pasaba el tope de
// tiempo de la base (medido en el laboratorio el 28-10).

const COMPRAS = 'mercado_compras';
const VISTA = 'mercado_licitaciones_con_ganadores';
const COLUMNAS_DE_LA_VISTA =
  'codigo, nombre, organismo, organismo_codigo, unidad, comuna, region, fecha_publicacion, fecha_cierre, monto_estimado, oferentes, rubros, ganadores';
/** Las mismas columnas en la capa resumida: el monto estimado es `monto`. */
const COLUMNAS_DE_COMPRAS =
  'codigo, nombre, organismo, organismo_codigo, unidad, comuna, region, fecha_publicacion, fecha_cierre, monto_estimado:monto, oferentes, rubros, ganadores';
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
    const codigos = codigosDeRegiones(regiones);
    if (codigos.length === 0) return [];
    const clave = codigos.join('|');
    const guardada = this.guardadas.get(clave);
    if (guardada && Date.now() - guardada.en < VIGENCIA_MS) {
      return guardada.procesos;
    }
    const desde = new Date();
    desde.setUTCMonth(desde.getUTCMonth() - MESES_DE_LA_ZONA);
    const dia = desde.toISOString().slice(0, 10);
    const filas: FilaDeLaZona[] = [];
    for (const region of codigos) {
      filas.push(...(await this.deLaCapaResumida(region, dia)));
    }
    if (filas.length === 0) {
      filas.push(...(await this.deLaVista(regionesDelMercado(regiones), dia)));
    }
    const procesos = filas.map(procesoDeLaZona);
    this.guardadas.set(clave, { en: Date.now(), procesos });
    return procesos;
  }

  /** Las licitaciones del rubro de una región, desde `mercado_compras`. */
  private async deLaCapaResumida(
    region: number,
    desde: string,
  ): Promise<FilaDeLaZona[]> {
    const filas: FilaDeLaZona[] = [];
    for (let ultimo = ''; ; ) {
      let consulta = this.db
        .from(COMPRAS)
        .select(COLUMNAS_DE_COMPRAS)
        .eq('tipo', 'licitacion')
        .eq('del_rubro', true)
        .eq('region_codigo', region)
        .gte('mes', desde)
        .order('codigo', { ascending: true })
        .limit(PAGINA);
      if (ultimo) consulta = consulta.gt('codigo', ultimo);
      const { data, error } = await consulta;
      if (error) throw error;
      const pagina = (data ?? []) as unknown as FilaDeLaZona[];
      filas.push(...pagina);
      if (pagina.length < PAGINA) return filas;
      ultimo = pagina[pagina.length - 1].codigo;
    }
  }

  /** Lo mismo desde la vista de la 169, mientras la capa resumida esté
   *  vacía (una base recién migrada, antes de su primera carga). */
  private async deLaVista(
    nombres: string[],
    desde: string,
  ): Promise<FilaDeLaZona[]> {
    const filas: FilaDeLaZona[] = [];
    for (let ultimo = ''; ; ) {
      let consulta = this.db
        .from(VISTA)
        .select(COLUMNAS_DE_LA_VISTA)
        .eq('del_rubro', true)
        .in('region', nombres)
        .gte('mes', desde)
        .order('codigo', { ascending: true })
        .limit(PAGINA);
      if (ultimo) consulta = consulta.gt('codigo', ultimo);
      const { data, error } = await consulta;
      if (error) throw error;
      const pagina = (data ?? []) as FilaDeLaZona[];
      filas.push(...pagina);
      if (pagina.length < PAGINA) return filas;
      ultimo = pagina[pagina.length - 1].codigo;
    }
  }

  /** Para la IA de «Se viene», las que el radar no tiene guardadas: de la
   *  capa resumida, y de la vista las que todavía no estén ahí. */
  async paraLeer(codigos: string[]): Promise<ProcesoParaLeer[]> {
    const unicos = [...new Set(codigos)];
    const filas = await this.porCodigo(COMPRAS, COLUMNAS_DE_COMPRAS, unicos);
    const encontrados = new Set(filas.map((f) => f.codigo));
    const faltan = unicos.filter((c) => !encontrados.has(c));
    if (faltan.length > 0) {
      filas.push(
        ...(await this.porCodigo(VISTA, COLUMNAS_DE_LA_VISTA, faltan)),
      );
    }
    return filas.map(procesoParaLeer);
  }

  private async porCodigo(
    tabla: string,
    columnas: string,
    codigos: string[],
  ): Promise<FilaDeLaZona[]> {
    const filas: FilaDeLaZona[] = [];
    for (let i = 0; i < codigos.length; i += LOTE) {
      const { data, error } = await this.db
        .from(tabla)
        .select(columnas)
        .in('codigo', codigos.slice(i, i + LOTE));
      if (error) throw error;
      filas.push(...((data ?? []) as unknown as FilaDeLaZona[]));
    }
    return filas;
  }
}
