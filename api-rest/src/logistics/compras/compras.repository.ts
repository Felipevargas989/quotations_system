import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { BUCKET_PRIVADO, sanitize } from 'src/storage/storage.service';
import { SupabaseService } from 'src/supabase/supabase.service';
import type { CompraLeida, EquivalenteParaLeer } from './leer-compra';

// Compras con IA (doc 25, migración 214). Como todo repositorio de
// la casa: la ÚNICA capa que toca Supabase, y cada consulta va por la
// empresa de la sesión.

export interface FilaDeLinea {
  id: number;
  compra_id: number;
  orden: number;
  texto: string;
  cantidad_texto: string | null;
  total: number | null;
  supply_id: number | null;
  equivalente: string | null;
  posibles: number[] | null;
  cantidad_base: number | null;
  costo_base: number | null;
  costo_antes: number | null;
  estado: 'propuesta' | 'aplicada' | 'no_es_insumo';
}

export interface FilaDeCompra {
  id: number;
  archivo: string;
  nombre_archivo: string | null;
  supplier_id: number | null;
  proveedor_texto: string | null;
  tipo_documento: string | null;
  numero: string | null;
  fecha: string | null;
  con_iva: boolean;
  estado: 'por_revisar' | 'aplicada' | 'descartada';
  created_at: string;
  aplicada_at: string | null;
  lineas?: FilaDeLinea[];
}

@Injectable()
export class ComprasRepository {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(ComprasRepository.name);
  }

  private get db() {
    return this.supabase.client;
  }

  async guardarArchivo(
    companyId: number,
    nombre: string,
    contenido: Buffer,
    mime: string,
  ): Promise<string> {
    const sello = new Date().toISOString().replace(/[:.]/g, '-');
    const ruta = `c${companyId}/compras/${sello}_${sanitize(nombre)}`;
    this.logger.info(`guardarArchivo ${ruta} (${contenido.length} bytes)`);
    const { error } = await this.db.storage
      .from(BUCKET_PRIVADO)
      .upload(ruta, contenido, { contentType: mime, upsert: false });
    if (error) throw error;
    return ruta;
  }

  async proveedores(companyId: number) {
    const { data, error } = await this.db
      .from('suppliers')
      .select('id, name')
      .eq('company_id', companyId);
    if (error) throw error;
    return (data ?? []) as { id: number; name: string }[];
  }

  async nombreEmpresa(companyId: number): Promise<string> {
    const { data } = await this.db
      .from('companies')
      .select('name')
      .eq('id', companyId)
      .maybeSingle();
    return (data as { name?: string } | null)?.name ?? 'la empresa';
  }

  async insumos(companyId: number) {
    const { data, error } = await this.db
      .from('supplies')
      .select(
        'id, name, unit_family, price, package_qty, supplier_id, is_active',
      )
      .eq('company_id', companyId);
    if (error) throw error;
    return (data ?? []) as {
      id: number;
      name: string;
      unit_family: 'masa' | 'volumen' | 'unidad';
      price: number;
      package_qty: number | null;
      supplier_id: number | null;
      is_active: boolean;
    }[];
  }

  async equivalentes(
    companyId: number,
  ): Promise<(EquivalenteParaLeer & { id: number })[]> {
    const { data, error } = await this.db
      .from('insumo_equivalentes')
      .select('id, supply_id, nombre, nombre_normal, tipo, supplier_id')
      .eq('company_id', companyId)
      .order('nombre');
    if (error) throw error;
    return (data ?? []) as (EquivalenteParaLeer & { id: number })[];
  }

  async agregarEquivalente(
    companyId: number,
    fila: Omit<EquivalenteParaLeer, 'nombre_normal'> & {
      nombre_normal: string;
    },
  ) {
    // Si ya existe ese nombre (en la empresa y con el mismo proveedor), se
    // mueve al insumo nuevo: lo último que dijo una persona manda.
    let q = this.db
      .from('insumo_equivalentes')
      .select('id')
      .eq('company_id', companyId)
      .eq('nombre_normal', fila.nombre_normal);
    q =
      fila.supplier_id === null
        ? q.is('supplier_id', null)
        : q.eq('supplier_id', fila.supplier_id);
    const { data: ya, error: e1 } = await q.maybeSingle();
    if (e1) throw e1;
    if (ya) {
      const { error } = await this.db
        .from('insumo_equivalentes')
        .update({
          supply_id: fila.supply_id,
          tipo: fila.tipo,
          nombre: fila.nombre,
        })
        .eq('id', (ya as { id: number }).id)
        .eq('company_id', companyId);
      if (error) throw error;
      return;
    }
    const { error } = await this.db
      .from('insumo_equivalentes')
      .insert([{ ...fila, company_id: companyId }]);
    if (error) throw error;
  }

  async borrarEquivalente(companyId: number, id: number) {
    const { error } = await this.db
      .from('insumo_equivalentes')
      .delete()
      .eq('id', id)
      .eq('company_id', companyId);
    if (error) throw error;
  }

  async compraRepetida(
    companyId: number,
    numero: string,
    proveedor: string | null,
    supplierId: number | null,
  ): Promise<boolean> {
    let q = this.db
      .from('compras_subidas')
      .select('id')
      .eq('company_id', companyId)
      .eq('numero', numero)
      .neq('estado', 'descartada')
      .limit(1);
    if (supplierId) q = q.eq('supplier_id', supplierId);
    else if (proveedor) q = q.eq('proveedor_texto', proveedor);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []).length > 0;
  }

  async crearCompra(
    companyId: number,
    archivo: string,
    nombreArchivo: string,
    leida: CompraLeida,
    supplierId: number | null,
    costoUsd: number,
    usuario: string | null,
  ): Promise<number> {
    const { data, error } = await this.db
      .from('compras_subidas')
      .insert([
        {
          company_id: companyId,
          archivo,
          nombre_archivo: nombreArchivo.slice(0, 200),
          supplier_id: supplierId,
          proveedor_texto: leida.proveedor,
          tipo_documento: leida.tipo_documento,
          numero: leida.numero,
          fecha: leida.fecha,
          con_iva: leida.con_iva,
          costo_ia_usd: costoUsd,
          creado_por: usuario,
        },
      ])
      .select('id')
      .single();
    if (error) throw error;
    const id = (data as { id: number }).id;
    if (leida.lineas.length) {
      const { error: e2 } = await this.db.from('compras_subidas_lineas').insert(
        leida.lineas.map((l, i) => ({
          company_id: companyId,
          compra_id: id,
          orden: i,
          texto: l.texto,
          cantidad_texto: l.cantidad_texto,
          total: l.total,
          supply_id: l.supply_id,
          equivalente: l.equivalente,
          posibles: l.posibles.length ? l.posibles : null,
          cantidad_base: l.cantidad_base,
          costo_base: l.costo_base,
          costo_antes: l.costo_antes,
          // Sin insumo y sin plata, no hay nada que proponer.
          estado: 'propuesta',
        })),
      );
      if (e2) throw e2;
    }
    return id;
  }

  /** Las por revisar y las últimas 15 aplicadas, con sus líneas. */
  async compras(companyId: number): Promise<FilaDeCompra[]> {
    const columnas =
      'id, archivo, nombre_archivo, supplier_id, proveedor_texto, tipo_documento, numero, fecha, con_iva, estado, created_at, aplicada_at';
    const [{ data: abiertas, error: e1 }, { data: cerradas, error: e2 }] =
      await Promise.all([
        this.db
          .from('compras_subidas')
          .select(columnas)
          .eq('company_id', companyId)
          .eq('estado', 'por_revisar')
          .order('created_at', { ascending: false }),
        this.db
          .from('compras_subidas')
          .select(columnas)
          .eq('company_id', companyId)
          .eq('estado', 'aplicada')
          .order('aplicada_at', { ascending: false })
          .limit(15),
      ]);
    if (e1) throw e1;
    if (e2) throw e2;
    const lista = [...(abiertas ?? []), ...(cerradas ?? [])] as FilaDeCompra[];
    if (!lista.length) return [];
    const { data: lineas, error: e3 } = await this.db
      .from('compras_subidas_lineas')
      .select(
        'id, compra_id, orden, texto, cantidad_texto, total, supply_id, equivalente, posibles, cantidad_base, costo_base, costo_antes, estado',
      )
      .eq('company_id', companyId)
      .in(
        'compra_id',
        lista.map((c) => c.id),
      )
      .order('orden');
    if (e3) throw e3;
    const porCompra = new Map<number, FilaDeLinea[]>();
    for (const l of (lineas ?? []) as FilaDeLinea[]) {
      const arr = porCompra.get(l.compra_id) ?? [];
      arr.push(l);
      porCompra.set(l.compra_id, arr);
    }
    return lista.map((c) => ({ ...c, lineas: porCompra.get(c.id) ?? [] }));
  }

  async compra(companyId: number, id: number): Promise<FilaDeCompra | null> {
    const { data, error } = await this.db
      .from('compras_subidas')
      .select(
        'id, archivo, nombre_archivo, supplier_id, proveedor_texto, tipo_documento, numero, fecha, con_iva, estado, created_at, aplicada_at',
      )
      .eq('company_id', companyId)
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    const { data: lineas, error: e2 } = await this.db
      .from('compras_subidas_lineas')
      .select(
        'id, compra_id, orden, texto, cantidad_texto, total, supply_id, equivalente, posibles, cantidad_base, costo_base, costo_antes, estado',
      )
      .eq('company_id', companyId)
      .eq('compra_id', id)
      .order('orden');
    if (e2) throw e2;
    return {
      ...(data as FilaDeCompra),
      lineas: (lineas ?? []) as FilaDeLinea[],
    };
  }

  async linea(companyId: number, id: number): Promise<FilaDeLinea | null> {
    const { data, error } = await this.db
      .from('compras_subidas_lineas')
      .select(
        'id, compra_id, orden, texto, cantidad_texto, total, supply_id, equivalente, posibles, cantidad_base, costo_base, costo_antes, estado',
      )
      .eq('company_id', companyId)
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    return (data as FilaDeLinea | null) ?? null;
  }

  async actualizarLinea(
    companyId: number,
    id: number,
    cambios: Partial<FilaDeLinea> & { aplicada_at?: string | null },
  ) {
    const { error } = await this.db
      .from('compras_subidas_lineas')
      .update(cambios)
      .eq('id', id)
      .eq('company_id', companyId);
    if (error) throw error;
  }

  async marcarCompra(
    companyId: number,
    id: number,
    estado: 'aplicada' | 'descartada' | 'por_revisar',
  ) {
    const { error } = await this.db
      .from('compras_subidas')
      .update({
        estado,
        aplicada_at: estado === 'aplicada' ? new Date().toISOString() : null,
      })
      .eq('id', id)
      .eq('company_id', companyId);
    if (error) throw error;
  }

  async ponerCosto(
    companyId: number,
    supplyId: number,
    precio: number,
    packageQty: number | null,
  ) {
    const cambios: Record<string, number> = { price: precio };
    if (packageQty && packageQty > 0) {
      cambios.package_price = Math.round(precio * packageQty);
    }
    const { error } = await this.db
      .from('supplies')
      .update(cambios)
      .eq('id', supplyId)
      .eq('company_id', companyId);
    if (error) throw error;
  }

  async descargar(ruta: string): Promise<Buffer> {
    const { data, error } = await this.db.storage
      .from(BUCKET_PRIVADO)
      .download(ruta);
    if (error || !data) throw error ?? new Error(`sin datos: ${ruta}`);
    return Buffer.from(await data.arrayBuffer());
  }
}
