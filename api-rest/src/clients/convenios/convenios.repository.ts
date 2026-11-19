import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { SupabaseService } from 'src/supabase/supabase.service';

/** La plantilla de la empresa (migración 211). */
export interface PlantillaDeConvenio {
  id: number;
  company_id: number;
  nombre: string;
  titulo: string;
  texto: string;
  beneficios: { titulo: string; detalle?: string | null }[];
  vigencia_anios: number;
  correo_de_contacto: string | null;
}

/** Una fila de `convenios`. */
export interface Convenio {
  id: string;
  company_id: number;
  client_id: string;
  plantilla_id: number | null;
  estado: 'enviado' | 'firmado' | 'anulado';
  origen: 'en_linea' | 'papel' | null;
  token_hash: string | null;
  enviado_a_contact_id: number | null;
  enviado_a_correo: string | null;
  enviado_a_nombre: string | null;
  enviado_at: string | null;
  enviado_por: string | null;
  firmado_at: string | null;
  vence_at: string | null;
  firmante_nombre: string | null;
  firmante_rut: string | null;
  firmante_cargo: string | null;
  firmante_correo: string | null;
  razon_social: string | null;
  rut_empresa: string | null;
  domicilio: string | null;
  comuna: string | null;
  region: string | null;
  personeria_documento: string | null;
  personeria_fecha: string | null;
  personeria_notario: string | null;
  ip: string | null;
  user_agent: string | null;
  texto_firmado: string | null;
  texto_sha256: string | null;
  documento_id: number | null;
  registrado_por: string | null;
}

export interface DocumentoDelCliente {
  id: number;
  company_id: number;
  client_id: string;
  file_name: string;
  file_url: string;
  categoria: 'convenio' | 'otros';
  subido_por_nombre: string | null;
  uploaded_at: string;
}

const VIGENTES = ['enviado', 'firmado'];

/**
 * El convenio del cliente y sus documentos (doc 24). La ÚNICA capa que toca
 * la base; todo método con sesión filtra por `company_id`. La búsqueda por
 * huella del enlace es la única sin empresa: es la puerta pública, y lo que
 * devuelve trae su propia empresa.
 */
@Injectable()
export class ConveniosRepository {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(ConveniosRepository.name);
  }

  private get db() {
    return this.supabase.client;
  }

  async plantillaDe(companyId: number): Promise<PlantillaDeConvenio | null> {
    const { data, error } = await this.db
      .from('convenio_plantillas')
      .select(
        'id, company_id, nombre, titulo, texto, beneficios, vigencia_anios, correo_de_contacto',
      )
      .eq('company_id', companyId)
      .eq('activa', true)
      .maybeSingle();
    if (error) throw error;
    return (data as PlantillaDeConvenio | null) ?? null;
  }

  /** ¿La empresa tiene plantilla activa? (liviana: sin el texto). */
  async tienePlantilla(companyId: number): Promise<boolean> {
    const { count, error } = await this.db
      .from('convenio_plantillas')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', companyId)
      .eq('activa', true);
    if (error) throw error;
    return (count ?? 0) > 0;
  }

  /** Los convenios vigentes de TODA la empresa, para el edificio de color
   *  (doc 24 §7): una consulta por empresa, nunca una por cliente. */
  async vigentesDeLaEmpresa(companyId: number): Promise<
    {
      client_id: string;
      estado: 'enviado' | 'firmado';
      enviado_at: string | null;
      firmado_at: string | null;
      vence_at: string | null;
    }[]
  > {
    const { data, error } = await this.db
      .from('convenios')
      .select('client_id, estado, enviado_at, firmado_at, vence_at')
      .eq('company_id', companyId)
      .in('estado', VIGENTES);
    if (error) throw error;
    return (data ?? []) as {
      client_id: string;
      estado: 'enviado' | 'firmado';
      enviado_at: string | null;
      firmado_at: string | null;
      vence_at: string | null;
    }[];
  }

  async clienteDe(
    companyId: number,
    clientId: string,
  ): Promise<{ id: string; name: string; client_type: string | null } | null> {
    const { data, error } = await this.db
      .from('clients')
      .select('id, name, client_type')
      .eq('id', clientId)
      .eq('company_id', companyId)
      .maybeSingle();
    if (error) throw error;
    return (data as { id: string; name: string; client_type: string }) ?? null;
  }

  /** La primera razón social del cliente, si tiene (migración 184). */
  async razonSocialDe(
    companyId: number,
    clientId: string,
  ): Promise<string | null> {
    const { data, error } = await this.db
      .from('razones_sociales')
      .select('razon_social')
      .eq('client_id', clientId)
      .eq('company_id', companyId)
      .order('id', { ascending: true })
      .limit(1);
    if (error) throw error;
    return (
      (data?.[0] as { razon_social?: string } | undefined)?.razon_social ?? null
    );
  }

  async contactoDe(
    companyId: number,
    clientId: string,
    contactId: number,
  ): Promise<{ id: number; name: string; email: string | null } | null> {
    const { data, error } = await this.db
      .from('client_contacts')
      .select('id, name, email')
      .eq('id', contactId)
      .eq('client_id', clientId)
      .eq('company_id', companyId)
      .maybeSingle();
    if (error) throw error;
    return (data as { id: number; name: string; email: string | null }) ?? null;
  }

  async vigente(companyId: number, clientId: string): Promise<Convenio | null> {
    const { data, error } = await this.db
      .from('convenios')
      .select('*')
      .eq('company_id', companyId)
      .eq('client_id', clientId)
      .in('estado', VIGENTES)
      .maybeSingle();
    if (error) throw error;
    return (data as Convenio | null) ?? null;
  }

  /** La puerta pública: el convenio de ese enlace (por su huella). */
  async porHuella(tokenHash: string): Promise<Convenio | null> {
    const { data, error } = await this.db
      .from('convenios')
      .select('*')
      .eq('token_hash', tokenHash)
      .maybeSingle();
    if (error) throw error;
    return (data as Convenio | null) ?? null;
  }

  async porId(companyId: number, id: string): Promise<Convenio | null> {
    const { data, error } = await this.db
      .from('convenios')
      .select('*')
      .eq('id', id)
      .eq('company_id', companyId)
      .maybeSingle();
    if (error) throw error;
    return (data as Convenio | null) ?? null;
  }

  async plantillaPorId(
    companyId: number,
    id: number | null,
  ): Promise<PlantillaDeConvenio | null> {
    if (id == null) return this.plantillaDe(companyId);
    const { data, error } = await this.db
      .from('convenio_plantillas')
      .select(
        'id, company_id, nombre, titulo, texto, beneficios, vigencia_anios, correo_de_contacto',
      )
      .eq('id', id)
      .eq('company_id', companyId)
      .maybeSingle();
    if (error) throw error;
    return (data as PlantillaDeConvenio | null) ?? null;
  }

  async crear(fila: Partial<Convenio>): Promise<Convenio> {
    const { data, error } = await this.db
      .from('convenios')
      .insert(fila)
      .select('*')
      .single();
    if (error) throw error;
    return data as Convenio;
  }

  /**
   * Cambia un convenio de la empresa. Con `soloSiEstado`, el cambio se hace
   * SOLO si sigue en ese estado (así dos firmas al mismo tiempo no pasan
   * las dos): devuelve null si otro ya lo cambió.
   */
  async actualizar(
    companyId: number,
    id: string,
    cambios: Partial<Convenio>,
    soloSiEstado?: Convenio['estado'],
  ): Promise<Convenio | null> {
    let q = this.db
      .from('convenios')
      .update({ ...cambios, actualizado_en: new Date().toISOString() })
      .eq('id', id)
      .eq('company_id', companyId);
    if (soloSiEstado) q = q.eq('estado', soloSiEstado);
    const { data, error } = await q.select('*');
    if (error) throw error;
    return ((data as Convenio[] | null) ?? [])[0] ?? null;
  }

  async documentos(
    companyId: number,
    clientId: string,
  ): Promise<DocumentoDelCliente[]> {
    const { data, error } = await this.db
      .from('client_documents')
      .select(
        'id, company_id, client_id, file_name, file_url, categoria, subido_por_nombre, uploaded_at',
      )
      .eq('company_id', companyId)
      .eq('client_id', clientId)
      .order('uploaded_at', { ascending: false });
    if (error) throw error;
    return (data as DocumentoDelCliente[] | null) ?? [];
  }

  async documento(
    companyId: number,
    id: number,
  ): Promise<DocumentoDelCliente | null> {
    const { data, error } = await this.db
      .from('client_documents')
      .select(
        'id, company_id, client_id, file_name, file_url, categoria, subido_por_nombre, uploaded_at',
      )
      .eq('id', id)
      .eq('company_id', companyId)
      .maybeSingle();
    if (error) throw error;
    return (data as DocumentoDelCliente | null) ?? null;
  }

  async agregarDocumento(fila: {
    company_id: number;
    client_id: string;
    file_name: string;
    file_url: string;
    categoria: 'convenio' | 'otros';
    subido_por: string | null;
    subido_por_nombre: string | null;
  }): Promise<DocumentoDelCliente> {
    const { data, error } = await this.db
      .from('client_documents')
      .insert(fila)
      .select(
        'id, company_id, client_id, file_name, file_url, categoria, subido_por_nombre, uploaded_at',
      )
      .single();
    if (error) throw error;
    return data as DocumentoDelCliente;
  }

  async borrarDocumento(companyId: number, id: number): Promise<void> {
    const { error } = await this.db
      .from('client_documents')
      .delete()
      .eq('id', id)
      .eq('company_id', companyId);
    if (error) throw error;
  }
}
