import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { SupabaseService } from 'src/supabase/supabase.service';
import type { DatosDeFacturacion } from '../../facturacion/datos-del-receptor';

/** Una razón social guardada (tabla `razones_sociales`, migración 184). */
export interface RazonSocial {
  id: number;
  company_id: number;
  client_id: string;
  rut: string;
  razon_social: string;
  giro: string | null;
  direccion: string | null;
  comuna: string | null;
  ciudad: string | null;
  correo_facturacion: string | null;
  referencias_exigidas: string[];
  origen: 'manual' | 'orden_de_compra';
  creado_por: string | null;
  created_at: string;
  updated_at: string;
}

export type NuevaRazonSocial = DatosDeFacturacion & {
  company_id: number;
  client_id: string;
  rut: string;
  razon_social: string;
  origen: RazonSocial['origen'];
  creado_por: string | null;
};

// Cada consulta filtra por company_id (mapa 22): la llave de servicio no
// separa a las empresas, lo hace este filtro. Los registros llevan solo
// ids: un RUT de persona es un dato personal.
@Injectable()
export class RazonesSocialesRepository {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(RazonesSocialesRepository.name);
  }

  /** ¿El cliente es de esta empresa? */
  async clienteDeLaEmpresa(clientId: string, companyId: number) {
    const { data, error } = await this.supabase.client
      .from('clients')
      .select('id')
      .eq('id', clientId)
      .eq('company_id', companyId)
      .maybeSingle();
    if (error) throw error;
    return !!data;
  }

  async deCliente(clientId: string, companyId: number) {
    this.logger.info(`razones sociales del cliente ${clientId}`);
    const { data, error } = await this.supabase.client
      .from('razones_sociales')
      .select('*')
      .eq('client_id', clientId)
      .eq('company_id', companyId)
      .order('created_at', { ascending: true });
    if (error) throw error;
    return (data ?? []) as RazonSocial[];
  }

  async crear(fila: NuevaRazonSocial) {
    this.logger.info(`nueva razón social del cliente ${fila.client_id}`);
    const { data, error } = await this.supabase.client
      .from('razones_sociales')
      .insert([fila])
      .select()
      .single();
    if (error) throw error;
    return data as RazonSocial;
  }

  async editar(
    id: number,
    clientId: string,
    companyId: number,
    cambios: DatosDeFacturacion,
  ) {
    this.logger.info(`edita la razón social ${id} del cliente ${clientId}`);
    const { data, error } = await this.supabase.client
      .from('razones_sociales')
      .update({ ...cambios, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('client_id', clientId)
      .eq('company_id', companyId)
      .select()
      .maybeSingle();
    if (error) throw error;
    return (data ?? null) as RazonSocial | null;
  }

  async borrar(id: number, clientId: string, companyId: number) {
    this.logger.info(`borra la razón social ${id} del cliente ${clientId}`);
    const { data, error } = await this.supabase.client
      .from('razones_sociales')
      .delete()
      .eq('id', id)
      .eq('client_id', clientId)
      .eq('company_id', companyId)
      .select('id');
    if (error) throw error;
    return (data ?? []).length;
  }
}
