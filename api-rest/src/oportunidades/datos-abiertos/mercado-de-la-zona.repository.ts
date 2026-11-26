import { Injectable } from '@nestjs/common';
import { SupabaseService } from 'src/supabase/supabase.service';
import type { ProcesoPasado } from '../historia/anterior';
import type { ProcesoDeLaZona, ProcesoReciente } from '../historia/mercado';
import type { ProcesoParaLeer } from '../lectura/lectura.service';
import { codigosDeRegiones } from '../mercado-publico/mapeo';
import type { ProductoOnu } from '../rubro/rubro-de-la-empresa';
import { rubroDeLaInstalacion } from '../rubro/rubro-de-la-instalacion';
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
// El rubro es «la marca» de la 101, la de eventos y alimentación, que mira
// el nombre de la compra y el código de lo que se compra (decisión 112). La
// categoría de ChileCompra no sirve para esto: un comprador puede esconder
// una licitación en otra categoría.
// En una instalación de rubro «general» (Licita, 25-11) la marca no se lee:
// cada método recibe la empresa y lee lo que ella marcó con su propio rubro
// (ver «Solo en una instalación general», más abajo). En Eventia esos
// parámetros no llegan y nada cambia.

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
/** Cuántos productos del catálogo ONU se leen para armar el menú. */
const TOPE_DEL_CATALOGO = 20_000;

/** ¿Instalación de rubro «general»? Ahí cada empresa lee con su rubro. */
const esGeneral = () => rubroDeLaInstalacion() === 'general';

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

  /** Las licitaciones de la zona. En Eventia (rubro «eventos»), las de «la
   *  marca», como siempre: `companyId` no se usa. En «general», las que
   *  marcó esa empresa con su propio rubro (sin empresa, nada). */
  async procesosDeLaZona(
    regiones: string[],
    companyId?: number,
  ): Promise<ProcesoDeLaZona[]> {
    if (esGeneral()) {
      return companyId === undefined
        ? []
        : this.procesosDeLaEmpresa(regiones, companyId);
    }
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
      let consulta = this.licitacionesDelRubro()
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

  /** Las licitaciones del rubro en la capa resumida: las de «la marca». */
  private licitacionesDelRubro() {
    return this.db
      .from(COMPRAS)
      .select(COLUMNAS_DE_COMPRAS)
      .eq('tipo', 'licitacion')
      .eq('del_rubro', true);
  }

  /** «Quién ganó el año anterior» (decisión 109): lo adjudicado de estos
   *  compradores en la capa resumida, solo licitaciones del rubro de la
   *  empresa y de los últimos 31 meses. null = la capa todavía está vacía:
   *  el que llama usa la historia del radar, como antes. */
  async historialDeOrganismos(
    organismos: string[],
    /** Solo en «general»: de quién es el rubro y en qué regiones busca. */
    deLaEmpresa?: { companyId: number; regiones: string[] },
  ): Promise<ProcesoPasado[] | null> {
    if (esGeneral()) {
      return deLaEmpresa
        ? this.historialDeLaEmpresa(organismos, deLaEmpresa)
        : [];
    }
    if (!(await this.hayCapa())) return null;
    const unicos = [...new Set(organismos.filter(Boolean))];
    const desde = new Date();
    desde.setUTCMonth(desde.getUTCMonth() - MESES_DEL_ANTERIOR);
    const pasados: ProcesoPasado[] = [];
    for (let i = 0; i < unicos.length; i += LOTE) {
      for (let ultimo = ''; ; ) {
        let consulta = this.licitacionesDelRubro()
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
  async recientesDeLaZona(
    regiones: string[],
    /** Solo en «general»: las compras ágiles de los archivos son las que
     *  marcó esta empresa. */
    companyId?: number,
  ): Promise<ProcesoReciente[]> {
    const nombres = regionesDelMercado(regiones);
    const codigos = codigosDeRegiones(regiones);
    if (nombres.length === 0) return [];
    const general = esGeneral();
    if (general && companyId === undefined) return [];
    const clave = general
      ? `${companyId}:${nombres.join('|')}`
      : nombres.join('|');
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
    if (general) {
      // El archivo de un mes trae el mes entero: se pide desde el día uno y
      // se deja lo publicado desde `desde`.
      const mes = `${desde.slice(0, 7)}-01`;
      for (const region of codigos) {
        const filas = await this.deLaEmpresa(
          companyId!,
          region,
          mes,
          'compra_agil',
        );
        procesos.push(
          ...filas
            .filter((f) => (f.fecha_publicacion ?? '') >= desde)
            .map((f) => ({
              codigo: f.codigo,
              nombre: f.nombre ?? '',
              organismo: f.organismo,
              organismo_codigo: f.organismo_codigo,
              fecha_publicacion: f.fecha_publicacion,
            })),
        );
      }
      this.recientes.set(clave, { en: Date.now(), procesos });
      return procesos;
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

  // ── Solo en una instalación «general» (Licita, 25-11) ──────────────────
  // Cada empresa ve lo que marcó con su propio rubro (`mercado_marcas`, que
  // llenan `mercado_marcar_mes` y `mercado_marcar_empresa`), leído por
  // `mercado_zona_de_empresa`: las mismas columnas de la capa resumida. Un
  // resultado vacío es vacío: nunca se cae a la vista ni a la marca de
  // eventos, que traerían el rubro de otro.

  /** La zona de una empresa: una región a la vez, por código y en orden de
   *  código, como la capa resumida. Diez minutos en memoria por empresa. */
  private async procesosDeLaEmpresa(
    regiones: string[],
    companyId: number,
  ): Promise<ProcesoDeLaZona[]> {
    const codigos = codigosDeRegiones(regiones);
    if (codigos.length === 0) return [];
    const clave = `${companyId}:${codigos.join('|')}`;
    const guardada = this.guardadas.get(clave);
    if (guardada && Date.now() - guardada.en < VIGENCIA_MS) {
      return guardada.procesos;
    }
    const desde = new Date();
    desde.setUTCMonth(desde.getUTCMonth() - MESES_DE_LA_ZONA);
    const dia = desde.toISOString().slice(0, 10);
    const filas: FilaDeLaZona[] = [];
    for (const region of codigos) {
      filas.push(...(await this.deLaEmpresa(companyId, region, dia)));
    }
    const procesos = filas.map(procesoDeLaZona);
    this.guardadas.set(clave, { en: Date.now(), procesos });
    return procesos;
  }

  /** Lo marcado de una empresa en una región, de a páginas por código. */
  private async deLaEmpresa(
    companyId: number,
    region: number,
    desde: string,
    tipo: 'licitacion' | 'compra_agil' = 'licitacion',
  ): Promise<FilaDeLaZona[]> {
    const filas: FilaDeLaZona[] = [];
    for (let despues: string | null = null; ; ) {
      const { data, error } = await this.db.rpc('mercado_zona_de_empresa', {
        p_company: companyId,
        p_region: region,
        p_desde: desde,
        p_despues: despues,
        p_limite: PAGINA,
        p_tipo: tipo,
      });
      if (error) throw error;
      const pagina = (data ?? []) as FilaDeLaZona[];
      filas.push(...pagina);
      if (pagina.length < PAGINA) return filas;
      despues = pagina[pagina.length - 1].codigo;
    }
  }

  /** «Quién ganó el año anterior» con el rubro de la empresa: lo adjudicado
   *  de esos compradores dentro de su zona (la misma lectura de «Se viene»,
   *  guardada diez minutos), de los últimos 31 meses. Un comprador de fuera
   *  de sus regiones no trae año anterior. */
  private async historialDeLaEmpresa(
    organismos: string[],
    { companyId, regiones }: { companyId: number; regiones: string[] },
  ): Promise<ProcesoPasado[]> {
    const buscados = new Set(organismos.filter(Boolean));
    if (buscados.size === 0) return [];
    const desde = new Date();
    desde.setUTCMonth(desde.getUTCMonth() - MESES_DEL_ANTERIOR);
    const dia = desde.toISOString().slice(0, 10);
    return (await this.procesosDeLaEmpresa(regiones, companyId)).filter(
      (p) =>
        buscados.has(p.organismo_codigo ?? '') &&
        (p.adjudicacion?.ganadores?.length ?? 0) > 0 &&
        (p.fecha_publicacion ?? '') >= dia,
    );
  }

  /** Olvida lo guardado en memoria de una empresa (al cambiar su rubro). */
  olvidarEmpresa(companyId: number): void {
    for (const clave of [...this.guardadas.keys()]) {
      if (clave.startsWith(`${companyId}:`)) this.guardadas.delete(clave);
    }
    for (const clave of [...this.recientes.keys()]) {
      if (clave.startsWith(`${companyId}:`)) this.recientes.delete(clave);
    }
  }

  /** Rehace todas las marcas de una empresa con su rubro guardado
   *  (`mercado_marcar_empresa`, con su propio tope de tiempo). Devuelve
   *  cuántas compras quedaron marcadas. */
  async marcarEmpresa(companyId: number): Promise<number> {
    const { data, error } = await this.supabase.clientParaTrabajosLargos.rpc(
      'mercado_marcar_empresa',
      { p_company: companyId },
    );
    if (error) throw error;
    this.olvidarEmpresa(companyId);
    return Number(data ?? 0);
  }

  /** El catálogo de productos ONU que vio el cargador, los más vistos
   *  primero, hasta `tope` (para el menú de familias de la IA). */
  async catalogoOnu(tope = TOPE_DEL_CATALOGO): Promise<ProductoOnu[]> {
    const productos: ProductoOnu[] = [];
    for (let desde = 0; desde < tope; desde += PAGINA) {
      const { data, error } = await this.db
        .from('mercado_productos_onu')
        .select('codigo, nombre, veces')
        .order('veces', { ascending: false })
        .order('codigo', { ascending: true })
        .range(desde, Math.min(desde + PAGINA, tope) - 1);
      if (error) throw error;
      const pagina = (data ?? []) as ProductoOnu[];
      productos.push(...pagina);
      if (pagina.length < PAGINA) break;
    }
    return productos;
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
