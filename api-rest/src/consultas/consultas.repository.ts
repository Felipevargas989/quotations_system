import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { SupabaseService } from 'src/supabase/supabase.service';

/** Un brochure configurado: vive en el bucket privado del storage. */
export interface Brochure {
  nombre: string;
  path: string;
  bytes: number;
}

export interface ConfigDeConsulta {
  company_id: number;
  event_type: string;
  texto: string | null;
  brochures: Brochure[];
}

export interface Consulta {
  id: number;
  company_id: number;
  name: string;
  email: string;
  phone: string;
  client_type: string | null;
  company_name: string | null;
  event_type: string;
  event_date: string | null;
  people_count: number | null;
  children_count: number | null;
  observations: string | null;
  estado: 'respondida' | 'convertida' | 'descartada';
  correo_enviado: boolean;
  client_id: string | null;
  created_at: string;
}

@Injectable()
export class ConsultasRepository {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(ConsultasRepository.name);
  }

  async config(companyId: number, eventType: string) {
    const { data, error } = await this.supabase.client
      .from('consulta_config')
      .select('*')
      .eq('company_id', companyId)
      .eq('event_type', eventType)
      .maybeSingle();
    if (error) throw error;
    return data as unknown as ConfigDeConsulta | null;
  }

  async configs(companyId: number) {
    const { data, error } = await this.supabase.client
      .from('consulta_config')
      .select('*')
      .eq('company_id', companyId);
    if (error) throw error;
    return (data ?? []) as unknown as ConfigDeConsulta[];
  }

  async guardarConfig(
    companyId: number,
    eventType: string,
    cambios: { texto?: string | null; brochures?: Brochure[] },
  ) {
    const { data, error } = await this.supabase.client
      .from('consulta_config')
      .upsert(
        { company_id: companyId, event_type: eventType, ...cambios },
        { onConflict: 'company_id,event_type' },
      )
      .select('*')
      .single();
    if (error) throw error;
    return data as unknown as ConfigDeConsulta;
  }

  async crear(fila: Omit<Consulta, 'id' | 'created_at'>) {
    const { data, error } = await this.supabase.client
      .from('consultas')
      .insert(fila)
      .select('*')
      .single();
    if (error) throw error;
    return data as unknown as Consulta;
  }

  async listar(companyId: number) {
    const { data, error } = await this.supabase.client
      .from('consultas')
      .select('*')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false })
      .limit(500);
    if (error) throw error;
    return (data ?? []) as unknown as Consulta[];
  }

  async una(id: number, companyId: number) {
    const { data, error } = await this.supabase.client
      .from('consultas')
      .select('*')
      .eq('id', id)
      .eq('company_id', companyId)
      .maybeSingle();
    if (error) throw error;
    return data as unknown as Consulta | null;
  }

  async actualizar(
    id: number,
    companyId: number,
    cambios: Record<string, unknown>,
  ) {
    const { data, error } = await this.supabase.client
      .from('consultas')
      .update(cambios)
      .eq('id', id)
      .eq('company_id', companyId)
      .select('*')
      .single();
    if (error) throw error;
    return data as unknown as Consulta;
  }

  /** ¿Este correo ya consultó este tipo hace poco? (regla de una vez) */
  async consultaReciente(
    companyId: number,
    email: string,
    eventType: string,
    desdeIso: string,
  ) {
    const { data, error } = await this.supabase.client
      .from('consultas')
      .select('id')
      .eq('company_id', companyId)
      .eq('event_type', eventType)
      .eq('correo_enviado', true)
      .ilike('email', email)
      .gte('created_at', desdeIso)
      .limit(1);
    if (error) throw error;
    return (data ?? []).length > 0;
  }

  /** El PDF del brochure, crudo, para adjuntarlo al correo. */
  async descargarBrochure(path: string): Promise<Buffer> {
    const { data, error } = await this.supabase.client.storage
      .from('payment-receipts')
      .download(path);
    if (error) throw error;
    return Buffer.from(await data.arrayBuffer());
  }
}
