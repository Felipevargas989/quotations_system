import { Injectable } from '@nestjs/common';
import { SupabaseService } from 'src/supabase/supabase.service';
import type { ProcesoPasado } from '../historia/anterior';
import type { ProcesoDeLaZona, ProcesoReciente } from '../historia/mercado';
import type { ProcesoParaLeer } from '../lectura/lectura.service';
import { codigosDeRegiones } from '../mercado-publico/mapeo';
import type { CategoriaDeLaZona } from './categorias';
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
// También de aquí sale «quién ganó el año anterior» (decisión 109): la
// historia ya no se pide a la API.
// El rubro de la empresa (decisión 109): si su configuración trae
// categorías de ChileCompra, son las licitaciones que tienen alguna de
// ellas; si no, la marca «del rubro» de siempre, la de eventos y
// alimentación.

const COMPRAS = 'mercado_compras';
const VISTA = 'mercado_licitaciones_con_ganadores';
const COLUMNAS_DE_LA_VISTA =
  'codigo, nombre, organismo, organismo_codigo, unidad, comuna, region, fecha_publicacion, fecha_cierre, monto_estimado, oferentes, rubros, ganadores';
/** Las mismas columnas en la capa resumida: el monto estimado es `monto`. */
const COLUMNAS_DE_COMPRAS =
  'codigo, nombre, organismo, organismo_codigo, unidad, comuna, region, fecha_publicacion, fecha_cierre, monto_estimado:monto, oferentes, rubros, ganadores';
/** Como la historia del radar: algo más de 3 años. */
const MESES_DE_LA_ZONA = 38;
/** «El año anterior» se busca entre 6 y 30 meses atrás (`anteriorDe`). */
const MESES_DEL_ANTERIOR = 31;
/** Lo de este año para «ya salió» (decisión 110): los últimos 8 meses. */
const DIAS_DE_LO_RECIENTE = 240;
const COLUMNAS_DE_LO_RECIENTE =
  'codigo, nombre, organismo, organismo_codigo, fecha_publicacion';
/** PostgREST no entrega más de mil filas por pedido. */
const PAGINA = 1000;
/** De a cuántos códigos se pregunta (la URL tiene tope). */
const LOTE = 100;
const VIGENCIA_MS = 10 * 60_000;

/** Las categorías de ChileCompra del rubro de la empresa; vacío o null =
 *  la marca «del rubro» de siempre. */
export type CategoriasDelRubro = readonly string[] | null | undefined;

@Injectable()
export class MercadoDeLaZonaRepository {
  private readonly guardadas = new Map<
    string,
    { en: number; procesos: ProcesoDeLaZona[] }
  >();

  private capa: { en: number; hay: boolean } | null = null;
  private readonly recientes = new Map<
    string,
    { en: number; procesos: ProcesoReciente[] }
  >();
  private readonly categorias = new Map<
    string,
    { en: number; lista: CategoriaDeLaZona[] }
  >();

  constructor(private readonly supabase: SupabaseService) {}

  private get db() {
    return this.supabase.client;
  }

  /** ¿Ya tiene algo la capa resumida? Se mira una vez cada 10 minutos. */
  private async hayCapa(): Promise<boolean> {
    if (this.capa && Date.now() - this.capa.en < VIGENCIA_MS) {
      return this.capa.hay;
    }
    const { data, error } = await this.db
      .from(COMPRAS)
      .select('codigo')
      .limit(1);
    if (error) throw error;
    this.capa = { en: Date.now(), hay: (data ?? []).length > 0 };
    return this.capa.hay;
  }

  async procesosDeLaZona(
    regiones: string[],
    categorias?: CategoriasDelRubro,
  ): Promise<ProcesoDeLaZona[]> {
    const codigos = codigosDeRegiones(regiones);
    if (codigos.length === 0) return [];
    const clave = `${codigos.join('|')}#${(categorias ?? []).join('|')}`;
    const guardada = this.guardadas.get(clave);
    if (guardada && Date.now() - guardada.en < VIGENCIA_MS) {
      return guardada.procesos;
    }
    const desde = new Date();
    desde.setUTCMonth(desde.getUTCMonth() - MESES_DE_LA_ZONA);
    const dia = desde.toISOString().slice(0, 10);
    const filas: FilaDeLaZona[] = [];
    for (const region of codigos) {
      filas.push(...(await this.deLaCapaResumida(region, dia, categorias)));
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
    categorias?: CategoriasDelRubro,
  ): Promise<FilaDeLaZona[]> {
    const filas: FilaDeLaZona[] = [];
    for (let ultimo = ''; ; ) {
      let consulta = this.licitacionesDelRubro(categorias)
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

  /** Las licitaciones del rubro de la empresa en la capa resumida: las de
   *  sus categorías, si las tiene; si no, la marca «del rubro» de siempre. */
  private licitacionesDelRubro(categorias?: CategoriasDelRubro) {
    const licitaciones = this.db
      .from(COMPRAS)
      .select(COLUMNAS_DE_COMPRAS)
      .eq('tipo', 'licitacion');
    return categorias?.length
      ? licitaciones.overlaps('rubros', [...categorias])
      : licitaciones.eq('del_rubro', true);
  }

  /** «Quién ganó el año anterior» (decisión 109): lo adjudicado de estos
   *  compradores en la capa resumida, solo licitaciones del rubro de la
   *  empresa y de los últimos 31 meses. null = la capa todavía está vacía:
   *  el que llama usa la historia del radar, como antes. */
  async historialDeOrganismos(
    organismos: string[],
    categorias?: CategoriasDelRubro,
  ): Promise<ProcesoPasado[] | null> {
    if (!(await this.hayCapa())) return null;
    const unicos = [...new Set(organismos.filter(Boolean))];
    const desde = new Date();
    desde.setUTCMonth(desde.getUTCMonth() - MESES_DEL_ANTERIOR);
    const pasados: ProcesoPasado[] = [];
    for (let i = 0; i < unicos.length; i += LOTE) {
      for (let ultimo = ''; ; ) {
        let consulta = this.licitacionesDelRubro(categorias)
          .in('organismo_codigo', unicos.slice(i, i + LOTE))
          .not('ganadores', 'is', null)
          .gte('fecha_publicacion', desde.toISOString().slice(0, 10))
          .order('codigo', { ascending: true })
          .limit(PAGINA);
        if (ultimo) consulta = consulta.gt('codigo', ultimo);
        const { data, error } = await consulta;
        if (error) throw error;
        const pagina = (data ?? []) as unknown as FilaDeLaZona[];
        pasados.push(...pagina.map(procesoDeLaZona));
        if (pagina.length < PAGINA) break;
        ultimo = pagina[pagina.length - 1].codigo;
      }
    }
    return pasados;
  }

  /** Lo que salió este año en las regiones de la empresa, para que «Se
   *  viene» no anuncie lo que ya ocurrió (decisión 110): las licitaciones y
   *  compras ágiles que trajo el radar, que es lo de hoy y no trae el código
   *  del organismo en las compras ágiles, y las compras ágiles del rubro de
   *  los archivos, que llegan con un mes de atraso. Diez minutos en memoria. */
  async recientesDeLaZona(regiones: string[]): Promise<ProcesoReciente[]> {
    const nombres = regionesDelMercado(regiones);
    const codigos = codigosDeRegiones(regiones);
    if (nombres.length === 0) return [];
    const clave = nombres.join('|');
    const guardada = this.recientes.get(clave);
    if (guardada && Date.now() - guardada.en < VIGENCIA_MS) {
      return guardada.procesos;
    }
    const desde = new Date(Date.now() - DIAS_DE_LO_RECIENTE * 24 * 3_600_000)
      .toISOString()
      .slice(0, 10);
    const procesos: ProcesoReciente[] = [];
    for (let ultimo = ''; ; ) {
      let consulta = this.db
        .from('mp_procesos')
        .select(COLUMNAS_DE_LO_RECIENTE)
        .in('region', nombres)
        .gte('fecha_publicacion', desde)
        .order('codigo', { ascending: true })
        .limit(PAGINA);
      if (ultimo) consulta = consulta.gt('codigo', ultimo);
      const { data, error } = await consulta;
      if (error) throw error;
      const pagina = (data ?? []) as ProcesoReciente[];
      procesos.push(...pagina);
      if (pagina.length < PAGINA) break;
      ultimo = pagina[pagina.length - 1].codigo;
    }
    for (const region of codigos) {
      for (let ultimo = ''; ; ) {
        let consulta = this.db
          .from(COMPRAS)
          .select(COLUMNAS_DE_LO_RECIENTE)
          .eq('tipo', 'compra_agil')
          .eq('del_rubro', true)
          .eq('region_codigo', region)
          .gte('fecha_publicacion', desde)
          .order('codigo', { ascending: true })
          .limit(PAGINA);
        if (ultimo) consulta = consulta.gt('codigo', ultimo);
        const { data, error } = await consulta;
        if (error) throw error;
        const pagina = (data ?? []) as ProcesoReciente[];
        procesos.push(...pagina);
        if (pagina.length < PAGINA) break;
        ultimo = pagina[pagina.length - 1].codigo;
      }
    }
    this.recientes.set(clave, { en: Date.now(), procesos });
    return procesos;
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

  /** Cuántas licitaciones tuvo cada categoría de ChileCompra en estas
   *  regiones, en los 3 años de la capa resumida, de más a menos (decisión
   *  111, migración 174): lo que muestra la sección «Categorías de
   *  ChileCompra» de Configuración. */
  async categoriasDeLaZona(regiones: string[]): Promise<CategoriaDeLaZona[]> {
    const codigos = codigosDeRegiones(regiones);
    if (codigos.length === 0) return [];
    const clave = codigos.join('|');
    const guardada = this.categorias.get(clave);
    if (guardada && Date.now() - guardada.en < VIGENCIA_MS) {
      return guardada.lista;
    }
    const { data, error } = await this.db.rpc('mercado_categorias_de_la_zona', {
      p_regiones: codigos,
    });
    if (error) throw error;
    const lista = (
      (data ?? []) as Array<{ categoria: string; licitaciones: number }>
    ).map((c) => ({
      categoria: c.categoria,
      licitaciones: Number(c.licitaciones),
    }));
    this.categorias.set(clave, { en: Date.now(), lista });
    return lista;
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
