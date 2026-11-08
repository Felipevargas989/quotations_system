import { Injectable } from '@nestjs/common';
import { SupabaseService } from 'src/supabase/supabase.service';
import type { AmbienteDeFacturacion } from '../facturacion-cl/facturacion-cl';

/** La fila de una factura traída de facturacion.cl (doc 19 §9.36). */
export interface FacturaTraidaNueva {
  company_id: number;
  tipo: 33;
  ambiente: AmbienteDeFacturacion;
  estado: 'emitido';
  folio: number;
  fecha_emision: string;
  receptor: Record<string, unknown>;
  detalle: unknown[];
  referencias: unknown[];
  exento: number;
  neto: number;
  iva: number;
  total: number;
  quotation_id: string | null;
  orden_de_compra_id: number | null;
  forma_de_pago: number | null;
  vencimiento: string | null;
  pdf_path: string | null;
  creado_por: string | null;
  respuesta: Record<string, unknown>;
}

/**
 * LO QUE NECESITA TRAER UNA FACTURA EMITIDA FUERA DE EVENTIA (doc 19 §9.36):
 * si ya está, su OC por el N° y el PDF que alguien ya subió al evento.
 * Todo filtrado por la empresa.
 */
@Injectable()
export class FacturasTraidasRepository {
  constructor(private readonly supabase: SupabaseService) {}

  /** ¿Ya está ese folio en Eventia, en ese ambiente? */
  async yaEsta(
    companyId: number,
    tipo: number,
    folio: number,
    ambiente: AmbienteDeFacturacion,
  ) {
    const { data, error } = await this.supabase.client
      .from('documentos_tributarios')
      .select('id')
      .eq('company_id', companyId)
      .eq('tipo', tipo)
      .eq('folio', folio)
      .eq('ambiente', ambiente)
      .limit(1);
    if (error) throw error;
    return (data ?? []).length > 0;
  }

  /** La OC de la empresa con ese N°, con su evento. */
  async ocPorNumero(companyId: number, numero: string) {
    const { data, error } = await this.supabase.client
      .from('ordenes_de_compra')
      .select(
        'id, numero, quotation_id, cotizacion:quotations(quotation_number)',
      )
      .eq('company_id', companyId)
      .eq('numero', numero)
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    const oc = data as {
      id: number;
      numero: string;
      quotation_id: string;
      cotizacion: { quotation_number: number } | null;
    } | null;
    return oc
      ? {
          id: oc.id,
          numero: oc.numero,
          quotation_id: oc.quotation_id,
          cotizacion: oc.cotizacion?.quotation_number ?? null,
        }
      : null;
  }

  /** El PDF de esa factura ya subido a Documentos → Facturas del evento
   *  (como «F374.pdf»): si está, Eventia usa ese. La tabla de documentos
   *  no tiene `company_id`: el evento ya es de la empresa. */
  async pdfSubidoAlEvento(quotationId: string, folio: number) {
    const { data, error } = await this.supabase.client
      .from('event_documents')
      .select('file_name, file_url')
      .eq('quotation_id', quotationId)
      .eq('category', 'facturas');
    if (error) throw error;
    const conElFolio = new RegExp(`(^|\\D)${folio}(\\D|$)`);
    return (
      ((data ?? []) as { file_name: string; file_url: string }[]).find((d) =>
        conElFolio.test(d.file_name ?? ''),
      )?.file_url ?? null
    );
  }

  async guardar(fila: FacturaTraidaNueva) {
    const { data, error } = await this.supabase.client
      .from('documentos_tributarios')
      .insert(fila)
      .select('id, tipo, folio, estado, ambiente, total, quotation_id')
      .single();
    if (error) throw error;
    return data as {
      id: number;
      tipo: number;
      folio: number;
      estado: string;
      ambiente: AmbienteDeFacturacion;
      total: number;
      quotation_id: string | null;
    };
  }
}
