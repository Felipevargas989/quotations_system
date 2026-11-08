import { Injectable } from '@nestjs/common';
import { SupabaseService } from 'src/supabase/supabase.service';
import type { DatosDelRecibido } from '../facturacion-cl/compras';

/** Un documento recibido, como se guarda (migración 193). */
export interface DocumentoRecibido extends DatosDelRecibido {
  id: number;
  periodo: string;
  link_pdf: string | null;
  recepcion_sii: string | null;
  acuse_sii: string | null;
  tipo_compra: number | null;
  traido_en: string;
}

export type RecibidoAGuardar = DatosDelRecibido & {
  link_pdf: string | null;
  recepcion_sii: string | null;
  acuse_sii: string | null;
  tipo_compra: number | null;
};

/** Un acuse hecho desde Eventia (migración 195). */
export interface AcuseDeRecibido {
  rut_emisor: string;
  tipo: number;
  folio: number;
  accion: 'aceptar' | 'reclamar';
  resultado: boolean;
  mensaje: string | null;
  pedido_por_nombre: string | null;
  pedido_en: string;
}

const COLUMNAS_DEL_ACUSE =
  'rut_emisor, tipo, folio, accion, resultado, mensaje, pedido_por_nombre, pedido_en';

const COLUMNAS =
  'id, periodo, rut_emisor, razon_social_emisor, tipo, folio, fecha_emision, neto, exento, iva, total, link_pdf, recepcion_sii, acuse_sii, tipo_compra, traido_en';

/** LO RECIBIDO DE CADA EMPRESA (doc 19 §9.28, migración 193). */
@Injectable()
export class RecibidosRepository {
  constructor(private readonly supabase: SupabaseService) {}

  async delPeriodo(
    companyId: number,
    periodo: string,
  ): Promise<DocumentoRecibido[]> {
    const { data, error } = await this.supabase.client
      .from('documentos_recibidos')
      .select(COLUMNAS)
      .eq('company_id', companyId)
      .eq('periodo', periodo)
      .order('fecha_emision', { ascending: false })
      .order('folio', { ascending: false });
    if (error) throw error;
    return ((data ?? []) as DocumentoRecibido[]).map((d) => ({
      ...d,
      neto: d.neto != null ? Number(d.neto) : null,
      exento: d.exento != null ? Number(d.exento) : null,
      iva: d.iva != null ? Number(d.iva) : null,
      total: d.total != null ? Number(d.total) : null,
      folio: Number(d.folio),
    }));
  }

  /** Guarda o pone al día lo traído (un documento por emisor, tipo y folio). */
  async guardar(
    companyId: number,
    periodo: string,
    documentos: RecibidoAGuardar[],
  ) {
    if (!documentos.length) return;
    const ahora = new Date().toISOString();
    for (let i = 0; i < documentos.length; i += 500) {
      const { error } = await this.supabase.client
        .from('documentos_recibidos')
        .upsert(
          documentos.slice(i, i + 500).map((d) => ({
            ...d,
            company_id: companyId,
            periodo,
            traido_en: ahora,
          })),
          { onConflict: 'company_id,rut_emisor,tipo,folio' },
        );
      if (error) throw error;
    }
  }

  /** Un documento de la empresa, o nulo. */
  async documento(
    companyId: number,
    clave: { rut_emisor: string; tipo: number; folio: number },
  ): Promise<DocumentoRecibido | null> {
    const { data, error } = await this.supabase.client
      .from('documentos_recibidos')
      .select(COLUMNAS)
      .eq('company_id', companyId)
      .eq('rut_emisor', clave.rut_emisor)
      .eq('tipo', clave.tipo)
      .eq('folio', clave.folio)
      .maybeSingle();
    if (error) throw error;
    return (data as DocumentoRecibido | null) ?? null;
  }

  /** Los acuses hechos desde Eventia de esos emisores, del más nuevo al
   *  más viejo. */
  async acusesDe(
    companyId: number,
    rutsEmisores: string[],
  ): Promise<AcuseDeRecibido[]> {
    if (!rutsEmisores.length) return [];
    const { data, error } = await this.supabase.client
      .from('acuses_de_recibidos')
      .select(COLUMNAS_DEL_ACUSE)
      .eq('company_id', companyId)
      .in('rut_emisor', [...new Set(rutsEmisores)])
      .order('pedido_en', { ascending: false });
    if (error) throw error;
    return ((data ?? []) as AcuseDeRecibido[]).map((a) => ({
      ...a,
      folio: Number(a.folio),
    }));
  }

  /** Anota un acuse, haya salido o no. */
  async anotarAcuse(
    companyId: number,
    acuse: Omit<AcuseDeRecibido, 'pedido_en' | 'pedido_por_nombre'>,
    por: { id: string | null; nombre: string | null },
  ) {
    const { error } = await this.supabase.client
      .from('acuses_de_recibidos')
      .insert({
        company_id: companyId,
        ...acuse,
        pedido_por: por.id,
        pedido_por_nombre: por.nombre,
      });
    if (error) throw error;
  }
}
