import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { BUCKET_PRIVADO } from 'src/storage/storage.service';
import { SupabaseService } from 'src/supabase/supabase.service';
import type { Receptor } from '../archivo/tipos';
import type { AmbienteDeFacturacion } from '../facturacion-cl/facturacion-cl';
import type { EventoAFacturar, OrdenAFacturar } from './borrador';

/** Un documento tributario (tabla `documentos_tributarios`, migración 184). */
export interface DocumentoTributario {
  id: number;
  company_id: number;
  tipo: number;
  ambiente: AmbienteDeFacturacion;
  folio: number | null;
  fecha_emision: string | null;
  estado: 'borrador' | 'enviando' | 'emitido' | 'por_confirmar' | 'rechazado';
  receptor: Receptor;
  detalle: unknown[];
  referencias: unknown[];
  neto: number;
  exento: number;
  iva: number;
  total: number;
  quotation_id: string | null;
  orden_de_compra_id: number | null;
  porcentaje: number | null;
  modifica_id: number | null;
  codigo_referencia: number | null;
  error: string | null;
  pdf_path: string | null;
  creado_por: string | null;
  emitido_por: string | null;
  emitido_en: string | null;
  created_at: string;
}

export type NuevoDocumentoTributario = Pick<
  DocumentoTributario,
  | 'company_id'
  | 'tipo'
  | 'ambiente'
  | 'estado'
  | 'receptor'
  | 'detalle'
  | 'referencias'
  | 'neto'
  | 'exento'
  | 'iva'
  | 'total'
  | 'quotation_id'
  | 'orden_de_compra_id'
  | 'porcentaje'
  | 'creado_por'
> & { archivo_enviado: string };

export type CambiosDelDocumento = Partial<
  Pick<
    DocumentoTributario,
    | 'estado'
    | 'folio'
    | 'fecha_emision'
    | 'error'
    | 'pdf_path'
    | 'emitido_por'
    | 'emitido_en'
  >
> & {
  archivo_enviado?: string;
  respuesta?: unknown;
  url_original?: string | null;
  url_cedible?: string | null;
};

// Lo que la pantalla ve: ni el archivo enviado ni la respuesta cruda.
const COLUMNAS =
  'id, company_id, tipo, ambiente, folio, fecha_emision, estado, receptor, detalle, referencias, neto, exento, iva, total, quotation_id, orden_de_compra_id, porcentaje, modifica_id, codigo_referencia, error, pdf_path, creado_por, emitido_por, emitido_en, created_at';

// Lo que cuenta como facturado: lo emitido y lo que quedó por confirmar
// (puede haber salido: L5). Las notas de crédito restan en el paso 4.
const FACTURADO = ['emitido', 'por_confirmar', 'enviando'];

// Cada consulta filtra por company_id (mapa 22). Los registros llevan solo
// ids: el receptor es un dato del cliente. No hay borrar: un documento
// tributario no se borra nunca (L6), y el motor no tiene permiso de DELETE.
@Injectable()
export class DocumentosTributariosRepository {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(DocumentosTributariosRepository.name);
  }

  /** El evento que se factura, si es de la empresa. */
  async eventoAFacturar(
    quotationId: string,
    companyId: number,
  ): Promise<EventoAFacturar | null> {
    const { data, error } = await this.supabase.client
      .from('quotations')
      .select(
        'id, quotation_number, quotation_status, event_type, event_date, event_end_date, people_count, total_amount, client_id, cliente:clients(name)',
      )
      .eq('id', quotationId)
      .eq('company_id', companyId)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    const q = data as unknown as {
      id: string;
      quotation_number: number;
      quotation_status: string;
      event_type: string | null;
      event_date: string | null;
      event_end_date: string | null;
      people_count: number | null;
      total_amount: number | string | null;
      client_id: string | null;
      cliente: { name?: string | null } | null;
    };
    return {
      id: q.id,
      numero: q.quotation_number,
      estado: q.quotation_status,
      tipoDeEvento: q.event_type,
      desde: q.event_date ? q.event_date.slice(0, 10) : null,
      hasta: q.event_end_date ? q.event_end_date.slice(0, 10) : null,
      personas: q.people_count,
      total: Math.round(Number(q.total_amount ?? 0)),
      clientId: q.client_id,
      cliente: q.cliente?.name?.trim() || null,
    };
  }

  /** Las OC del evento (sin lo facturado: lo suma el servicio). */
  async ordenesDelEvento(quotationId: string, companyId: number) {
    const { data, error } = await this.supabase.client
      .from('ordenes_de_compra')
      .select(
        'id, numero, fecha, rut, razon_social, comprador, descripcion, neto, iva, total, documento_id',
      )
      .eq('quotation_id', quotationId)
      .eq('company_id', companyId)
      .order('fecha', { ascending: true })
      .order('id', { ascending: true });
    if (error) throw error;
    return (data ?? []) as (Omit<OrdenAFacturar, 'facturado' | 'pdf'> & {
      documento_id: number | null;
    })[];
  }

  /** El nombre del PDF de una OC (la cotización ya se verificó). */
  async nombreDelDocumento(documentoId: number, quotationId: string) {
    const { data, error } = await this.supabase.client
      .from('event_documents')
      .select('file_name')
      .eq('id', documentoId)
      .eq('quotation_id', quotationId)
      .maybeSingle();
    if (error) throw error;
    return (data as { file_name?: string } | null)?.file_name ?? null;
  }

  /** Los documentos tributarios del evento, del más nuevo al más viejo. */
  async deCotizacion(quotationId: string, companyId: number) {
    this.logger.info(`documentos tributarios de la cotización ${quotationId}`);
    const { data, error } = await this.supabase.client
      .from('documentos_tributarios')
      .select(COLUMNAS)
      .eq('quotation_id', quotationId)
      .eq('company_id', companyId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []) as unknown as DocumentoTributario[];
  }

  /** Lo facturado del evento y de cada una de sus OC (facturas). */
  async facturado(quotationId: string, companyId: number) {
    const { data, error } = await this.supabase.client
      .from('documentos_tributarios')
      .select('orden_de_compra_id, total')
      .eq('quotation_id', quotationId)
      .eq('company_id', companyId)
      .eq('tipo', 33)
      .in('estado', FACTURADO);
    if (error) throw error;
    const porOC = new Map<number, number>();
    let total = 0;
    for (const d of (data ?? []) as {
      orden_de_compra_id: number | null;
      total: number;
    }[]) {
      total += Number(d.total);
      if (d.orden_de_compra_id != null)
        porOC.set(
          d.orden_de_compra_id,
          (porOC.get(d.orden_de_compra_id) ?? 0) + Number(d.total),
        );
    }
    return { total, porOC };
  }

  /** El último folio usado de un tipo, para seguir la numeración. */
  async ultimoFolio(
    companyId: number,
    ambiente: AmbienteDeFacturacion,
    tipo: number,
  ): Promise<number> {
    const { data, error } = await this.supabase.client
      .from('documentos_tributarios')
      .select('folio')
      .eq('company_id', companyId)
      .eq('ambiente', ambiente)
      .eq('tipo', tipo)
      .not('folio', 'is', null)
      .order('folio', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return Number((data as { folio?: number } | null)?.folio ?? 0);
  }

  async crear(fila: NuevoDocumentoTributario) {
    this.logger.info(
      `nuevo documento tipo ${fila.tipo} de la cotización ${fila.quotation_id}`,
    );
    const { data, error } = await this.supabase.client
      .from('documentos_tributarios')
      .insert([fila])
      .select(COLUMNAS)
      .single();
    if (error) throw error;
    return data as unknown as DocumentoTributario;
  }

  async actualizar(
    id: number,
    companyId: number,
    cambios: CambiosDelDocumento,
  ) {
    this.logger.info(
      `documento tributario ${id}: ${cambios.estado ?? 'cambios'}`,
    );
    const { data, error } = await this.supabase.client
      .from('documentos_tributarios')
      .update({ ...cambios, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('company_id', companyId)
      .select(COLUMNAS)
      .single();
    if (error) throw error;
    return data as unknown as DocumentoTributario;
  }

  /** La copia propia del PDF, en el balde privado (L10). */
  async guardarPdf(ruta: string, pdf: Buffer) {
    const { error } = await this.supabase.client.storage
      .from(BUCKET_PRIVADO)
      .upload(ruta, pdf, { contentType: 'application/pdf', upsert: true });
    if (error) throw error;
  }

  /** El PDF en Documentos → Facturas del evento (§9.2). */
  async agregarAlEvento(quotationId: string, nombre: string, ruta: string) {
    const { error } = await this.supabase.client
      .from('event_documents')
      .insert({
        quotation_id: quotationId,
        category: 'facturas',
        file_name: nombre,
        file_url: ruta,
      });
    if (error) throw error;
  }
}
