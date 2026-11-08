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
}
