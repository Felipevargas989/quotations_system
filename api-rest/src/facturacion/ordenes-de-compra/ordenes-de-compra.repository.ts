import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { SupabaseService } from 'src/supabase/supabase.service';

/** Una OC guardada (tabla `ordenes_de_compra`, migración 184). */
export interface OrdenDeCompra {
  id: number;
  company_id: number;
  quotation_id: string;
  numero: string;
  fecha: string;
  rut: string | null;
  razon_social: string | null;
  descripcion: string | null;
  neto: number | null;
  iva: number | null;
  total: number;
  origen: 'manual' | 'mercado_publico' | 'pdf';
  documento_id: number | null;
  creado_por: string | null;
  created_at: string;
  updated_at: string;
}

export type DatosDeOrdenDeCompra = Partial<
  Pick<
    OrdenDeCompra,
    | 'numero'
    | 'fecha'
    | 'rut'
    | 'razon_social'
    | 'descripcion'
    | 'neto'
    | 'iva'
    | 'total'
    | 'documento_id'
  >
>;

export type NuevaOrdenDeCompra = DatosDeOrdenDeCompra & {
  company_id: number;
  quotation_id: string;
  numero: string;
  fecha: string;
  total: number;
  origen: OrdenDeCompra['origen'];
  creado_por: string | null;
};

// Cada consulta filtra por company_id (mapa 22). Los registros llevan solo
// ids.
@Injectable()
export class OrdenesDeCompraRepository {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(OrdenesDeCompraRepository.name);
  }

  /** ¿La cotización es de esta empresa? */
  async cotizacionDeLaEmpresa(quotationId: string, companyId: number) {
    const { data, error } = await this.supabase.client
      .from('quotations')
      .select('id')
      .eq('id', quotationId)
      .eq('company_id', companyId)
      .maybeSingle();
    if (error) throw error;
    return !!data;
  }

  /** ¿El documento es de esa cotización? (`event_documents` no tiene
   *  `company_id`: la pertenencia va por la cotización, ya verificada). */
  async documentoDeLaCotizacion(documentoId: number, quotationId: string) {
    const { data, error } = await this.supabase.client
      .from('event_documents')
      .select('id')
      .eq('id', documentoId)
      .eq('quotation_id', quotationId)
      .maybeSingle();
    if (error) throw error;
    return !!data;
  }

  async deCotizacion(quotationId: string, companyId: number) {
    this.logger.info(`órdenes de compra de la cotización ${quotationId}`);
    const { data, error } = await this.supabase.client
      .from('ordenes_de_compra')
      .select('*')
      .eq('quotation_id', quotationId)
      .eq('company_id', companyId)
      .order('fecha', { ascending: true })
      .order('id', { ascending: true });
    if (error) throw error;
    return (data ?? []) as OrdenDeCompra[];
  }

  async crear(fila: NuevaOrdenDeCompra) {
    this.logger.info(`nueva OC de la cotización ${fila.quotation_id}`);
    const { data, error } = await this.supabase.client
      .from('ordenes_de_compra')
      .insert([fila])
      .select()
      .single();
    if (error) throw error;
    return data as OrdenDeCompra;
  }

  async editar(
    id: number,
    quotationId: string,
    companyId: number,
    cambios: DatosDeOrdenDeCompra,
  ) {
    this.logger.info(`edita la OC ${id} de la cotización ${quotationId}`);
    const { data, error } = await this.supabase.client
      .from('ordenes_de_compra')
      .update({ ...cambios, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('quotation_id', quotationId)
      .eq('company_id', companyId)
      .select()
      .maybeSingle();
    if (error) throw error;
    return (data ?? null) as OrdenDeCompra | null;
  }

  async borrar(id: number, quotationId: string, companyId: number) {
    this.logger.info(`borra la OC ${id} de la cotización ${quotationId}`);
    const { data, error } = await this.supabase.client
      .from('ordenes_de_compra')
      .delete()
      .eq('id', id)
      .eq('quotation_id', quotationId)
      .eq('company_id', companyId)
      .select('id');
    if (error) throw error;
    return (data ?? []).length;
  }
}
