import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { BUCKET_PRIVADO } from 'src/storage/storage.service';
import { SupabaseService } from 'src/supabase/supabase.service';

/** Lo que la OC dice del comprador, como lo leyó BelIA (paso 2b). */
export interface CompradorDeLaOC {
  giro: string | null;
  direccion: string | null;
  comuna: string | null;
  ciudad: string | null;
}

/** Una OC guardada (tabla `ordenes_de_compra`, migración 184). */
export interface OrdenDeCompra {
  id: number;
  company_id: number;
  quotation_id: string;
  numero: string;
  fecha: string;
  rut: string | null;
  razon_social: string | null;
  comprador: CompradorDeLaOC | null;
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
    | 'comprador'
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

  /** Un documento del evento, para leerlo (la cotización ya se verificó). */
  async documentoDelEvento(documentoId: number, quotationId: string) {
    const { data, error } = await this.supabase.client
      .from('event_documents')
      .select('id, file_url, file_name, category')
      .eq('id', documentoId)
      .eq('quotation_id', quotationId)
      .maybeSingle();
    if (error) throw error;
    return (data ?? null) as {
      id: number;
      file_url: string;
      file_name: string;
      category: string;
    } | null;
  }

  /** El archivo, del balde privado. */
  async descargar(ruta: string): Promise<Buffer> {
    const { data, error } = await this.supabase.client.storage
      .from(BUCKET_PRIVADO)
      .download(ruta);
    if (error || !data) throw error ?? new Error(`sin datos: ${ruta}`);
    return Buffer.from(await data.arrayBuffer());
  }

  /** Quién vende (la empresa): su nombre y, si lo cargó en «Mi empresa»
   *  de Oportunidades, su RUT. Sirve para que BelIA no la confunda con el
   *  comprador. */
  async empresaQueVende(companyId: number) {
    const [{ data: empresa }, { data: oferente }] = await Promise.all([
      this.supabase.client
        .from('companies')
        .select('name')
        .eq('id', companyId)
        .maybeSingle(),
      this.supabase.client
        .from('oportunidades_oferente')
        .select('razon_social, rut')
        .eq('company_id', companyId)
        .maybeSingle(),
    ]);
    const o = (oferente ?? null) as {
      razon_social?: string | null;
      rut?: string | null;
    } | null;
    return {
      nombre:
        o?.razon_social || (empresa as { name?: string } | null)?.name || null,
      rut: o?.rut || null,
    };
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
