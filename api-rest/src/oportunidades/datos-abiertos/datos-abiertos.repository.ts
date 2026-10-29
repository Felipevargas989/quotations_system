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
import type { OrdenesDeCompraDelMes } from './ordenes-de-compra-del-mes';

// Las tablas mercado_* (migración 168, decisión 101 del doc 17). Datos
// públicos de todo Chile, sin empresa. Recargar un mes no duplica: las
// licitaciones y solicitudes se reemplazan por su código, y sus ofertas y
// cotizaciones se borran y se vuelven a escribir. Las órdenes de compra
// municipales (decisión 108) se reemplazan por mes, y su organismo y su
// proveedor se guardan una vez cada uno.

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
};

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

  async guardarOrdenesDeCompra(
    mes: string,
    { ordenes, organismos, proveedores }: OrdenesDeCompraDelMes,
  ): Promise<void> {
    // Sin la comuna (`cut`): la une el radar después, y un upsert sin ella
    // no la borra.
    await this.escribir('mercado_organismos', organismos, 'codigo');
    await this.escribir('mercado_proveedores', proveedores, 'rut');
    const { error } = await this.db
      .from('mercado_ordenes_de_compra')
      .delete()
      .eq('mes', mes);
    if (error) throw error;
    await this.escribir('mercado_ordenes_de_compra', ordenes);
  }
}
