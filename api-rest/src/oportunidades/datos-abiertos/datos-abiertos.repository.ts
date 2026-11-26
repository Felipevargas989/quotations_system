import { Injectable } from '@nestjs/common';
import { SupabaseService } from 'src/supabase/supabase.service';
import type {
  ComprasAgilesDelMes,
  CotizacionDelMercado,
} from './compras-agiles-del-mes';
import type { Fuente } from './datos-abiertos';
import type {
  LicitacionesDelMes,
  OfertaDelMercado,
} from './licitaciones-del-mes';

// Las tablas mercado_* (migración 168, decisión 101 del doc 17). Datos
// públicos de todo Chile, sin empresa. Recargar un mes no duplica: las
// licitaciones y solicitudes se reemplazan por su código, y sus ofertas y
// cotizaciones se borran y se vuelven a escribir. Después, la base resume
// el mes (decisión 109, migración 172): claves limpias, control de calidad
// y los resúmenes que leen «Se viene» y los competidores.
//
// Cada licitación y compra ágil va entera, con su columna `onu` (los códigos
// ONU con sus prefijos, 25-11-2026): la base necesita esa columna en
// `mercado_licitaciones` y `mercado_compras_agiles` ANTES de que este motor
// cargue un mes; sin ella, PostgREST rechaza el lote y el mes queda en error.

/** Lo que no calzó al resumir un mes: cuántas compras y ofertas, cuántas sin
 *  región o sin comuna, y cuántas con un RUT que no es un RUT chileno
 *  válido (y de esas, cuántas ganaron). */
export type CalidadDelMes = Record<string, number>;

export type CargaDelMercado = {
  fuente: Fuente;
  mes: string;
  estado: 'cargando' | 'lista' | 'error';
  archivo_modificado: string | null;
  bytes: number | null;
  filas: number | null;
  procesos: number | null;
  error: string | null;
  empezo_en: string | null;
  terminada_en: string | null;
  /** null = falta resumirlo. No viene si la base no tiene la migración 172. */
  resumida_en?: string | null;
  calidad?: CalidadDelMes | null;
  /** Solo en una instalación «general» (migración
   *  POR_NUMERAR_rubro_de_cada_empresa): con qué unión de reglas de las
   *  empresas se cargó el mes. En Eventia nunca se escribe. */
  reglas_huella?: string | null;
};

/** Las reglas de una empresa, para la unión de la carga mensual. */
export type ReglasGuardadas = {
  company_id: number;
  onu_familias: string[] | null;
  palabras: string[] | null;
};

/** El tipo de `mercado_compras` de cada fuente. */
export const TIPO_DE_LA_FUENTE: Readonly<Record<Fuente, string>> = {
  licitaciones: 'licitacion',
  compra_agil: 'compra_agil',
};

/** De a cuántos productos se anota el catálogo. */
const LOTE_DE_PRODUCTOS = 1000;

/** De a cuántas filas se escribe. */
const LOTE = 500;
/** De a cuántos códigos se borra (la URL tiene tope). */
const LOTE_DE_CODIGOS = 200;

const lotes = <T>(lista: readonly T[], tamano: number): T[][] => {
  const r: T[][] = [];
  for (let i = 0; i < lista.length; i += tamano) {
    r.push(lista.slice(i, i + tamano));
  }
  return r;
};

@Injectable()
export class DatosAbiertosRepository {
  constructor(private readonly supabase: SupabaseService) {}

  private get db() {
    return this.supabase.client;
  }

  async cargas(): Promise<CargaDelMercado[]> {
    const { data, error } = await this.db
      .from('mercado_cargas')
      .select('*')
      .order('mes', { ascending: false })
      .order('fuente');
    if (error) throw error;
    return (data ?? []) as CargaDelMercado[];
  }

  async marcarCarga(
    fuente: Fuente,
    mes: string,
    cambios: Partial<Omit<CargaDelMercado, 'fuente' | 'mes'>>,
  ): Promise<void> {
    const { error } = await this.db
      .from('mercado_cargas')
      .upsert({ fuente, mes, ...cambios }, { onConflict: 'fuente,mes' });
    if (error) throw error;
  }

  private async escribir(
    tabla: string,
    filas: readonly object[],
    onConflict?: string,
  ): Promise<void> {
    for (const lote of lotes(filas, LOTE)) {
      const { error } = onConflict
        ? await this.db.from(tabla).upsert(lote, { onConflict })
        : await this.db.from(tabla).insert(lote);
      if (error) throw error;
    }
  }

  /** Borra los hijos de esos códigos y escribe los nuevos, de a lotes. */
  private async reemplazarHijos<T extends { codigo: string }>(
    tabla: string,
    codigos: readonly string[],
    hijos: readonly T[],
  ): Promise<void> {
    const porCodigo = new Map<string, T[]>();
    for (const h of hijos) {
      const lista = porCodigo.get(h.codigo);
      if (lista) lista.push(h);
      else porCodigo.set(h.codigo, [h]);
    }
    for (const lote of lotes(codigos, LOTE_DE_CODIGOS)) {
      const { error } = await this.db.from(tabla).delete().in('codigo', lote);
      if (error) throw error;
      await this.escribir(
        tabla,
        lote.flatMap((c) => porCodigo.get(c) ?? []),
      );
    }
  }

  async guardarLicitaciones({
    licitaciones,
    ofertas,
  }: LicitacionesDelMes): Promise<void> {
    await this.escribir('mercado_licitaciones', licitaciones, 'codigo');
    await this.reemplazarHijos<OfertaDelMercado>(
      'mercado_ofertas',
      licitaciones.map((l) => l.codigo),
      ofertas,
    );
  }

  /** Rehace los resúmenes de ese mes en la base (`mercado_resumir_mes`, con
   *  su propio tope de 60 s) y devuelve el control de calidad. Un mes grande
   *  pasa de los 10 s del cliente de siempre: va por el de trabajos largos. */
  async resumirMes(fuente: Fuente, mes: string): Promise<CalidadDelMes> {
    const { data, error } = await this.supabase.clientParaTrabajosLargos.rpc(
      'mercado_resumir_mes',
      {
        p_fuente: fuente,
        p_mes: mes,
      },
    );
    if (error) throw error;
    return (data ?? {}) as CalidadDelMes;
  }

  // ── Solo en una instalación «general» (Licita, 25-11). Eventia no llama
  //    nada de esto: sus tablas y columnas pueden no existir en su base. ──

  /** Las reglas de todas las empresas que tienen alguna (para la unión). */
  async reglasDeLasEmpresas(): Promise<ReglasGuardadas[]> {
    const { data, error } = await this.db
      .from('oportunidades_config')
      .select('company_id, onu_familias, palabras');
    if (error) throw error;
    return ((data ?? []) as ReglasGuardadas[]).filter(
      (r) => (r.onu_familias ?? []).length > 0 || (r.palabras ?? []).length > 0,
    );
  }

  /** Suma al catálogo `mercado_productos_onu` los productos vistos en un mes
   *  (`mercado_anotar_productos_onu`: guarda el nombre y las veces del mes
   *  con más procesos, así recargar un mes no infla la cuenta). */
  async anotarProductosOnu(
    productos: ReadonlyArray<{ codigo: string; nombre: string; veces: number }>,
  ): Promise<void> {
    for (const lote of lotes(productos, LOTE_DE_PRODUCTOS)) {
      const { error } = await this.db.rpc('mercado_anotar_productos_onu', {
        p_productos: lote,
      });
      if (error) throw error;
    }
  }

  /** Rehace las marcas de todas las empresas con reglas para un mes recién
   *  resumido (`mercado_marcar_mes`). Devuelve cuántas marcas quedaron. */
  async marcarMes(fuente: Fuente, mes: string): Promise<number> {
    const { data, error } = await this.supabase.clientParaTrabajosLargos.rpc(
      'mercado_marcar_mes',
      { p_mes: mes, p_tipo: TIPO_DE_LA_FUENTE[fuente] },
    );
    if (error) throw error;
    return Number(data ?? 0);
  }

  async guardarComprasAgiles(
    mes: string,
    { solicitudes, cotizaciones, totales }: ComprasAgilesDelMes,
  ): Promise<void> {
    await this.escribir('mercado_compras_agiles', solicitudes, 'codigo');
    await this.reemplazarHijos<CotizacionDelMercado>(
      'mercado_cotizaciones',
      solicitudes.map((s) => s.codigo),
      cotizaciones,
    );
    const { error } = await this.db
      .from('mercado_compras_agiles_totales')
      .delete()
      .eq('mes', mes);
    if (error) throw error;
    await this.escribir('mercado_compras_agiles_totales', totales);
  }
}
