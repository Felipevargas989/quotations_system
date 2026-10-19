import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { SupabaseService } from 'src/supabase/supabase.service';
import { type DatosDeRespaldo, TIPO_RESPALDO } from './respaldo';

// La empresa como oferente y su carpeta de documentos (migración 126). Toda
// consulta filtra por company_id. Los archivos se suben y borran con
// AdjuntosRepository (el mismo balde privado).

export type Oferente = {
  razon_social: string | null;
  rut: string | null;
  giro: string | null;
  direccion: string | null;
  comuna: string | null;
  region: string | null;
  telefono: string | null;
  correo: string | null;
  representante_nombre: string | null;
  representante_rut: string | null;
  representante_cargo: string | null;
  experiencia: string | null;
  instalaciones: string | null;
  firma_ruta: string | null;
  firma_subida_en: string | null;
};

export type DocumentoDeEmpresa = {
  id: number;
  tipo: string;
  nombre: string;
  ruta: string;
  tipo_archivo: string;
  bytes: number;
  vence: string | null;
  /** Los datos de un respaldo de experiencia (migración 150). */
  datos: Record<string, unknown> | null;
  creado_en: string;
  quien: { full_name: string | null } | null;
};

export type DocumentoNuevo = {
  company_id: number;
  tipo: string;
  nombre: string;
  ruta: string;
  tipo_archivo: string;
  bytes: number;
  vence: string | null;
  datos?: DatosDeRespaldo | null;
  subido_por: string | null;
};

/** Lo que ya vive en Configuración de empresa: el módulo lo lee, no lo
 *  repite. */
export type EmpresaDeConfiguracion = {
  name: string | null;
  /** El logo (balde público de Supabase); lo usa la propuesta técnica. */
  logo_url?: string | null;
  bank_details: {
    rut?: string | null;
    banco?: string | null;
    numero?: string | null;
    titular?: string | null;
    tipo_cuenta?: string | null;
    correo_pagos?: string | null;
  } | null;
};

const COLUMNAS_OFERENTE =
  'razon_social, rut, giro, direccion, comuna, region, telefono, correo, representante_nombre, representante_rut, representante_cargo, experiencia, instalaciones, firma_ruta, firma_subida_en';

const COLUMNAS_DOCUMENTO =
  'id, tipo, nombre, ruta, tipo_archivo, bytes, vence, datos, creado_en, quien:user_profiles(full_name)';

@Injectable()
export class OferenteRepository {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(OferenteRepository.name);
  }

  private get db() {
    return this.supabase.client;
  }

  async oferente(companyId: number): Promise<Oferente | null> {
    const { data, error } = await this.db
      .from('oportunidades_oferente')
      .select(COLUMNAS_OFERENTE)
      .eq('company_id', companyId)
      .maybeSingle();
    if (error) throw error;
    return (data as Oferente | null) ?? null;
  }

  /** Guarda solo lo que viene (un upsert por empresa no toca las demás
   *  columnas). */
  async guardar(companyId: number, cambios: Partial<Oferente>): Promise<void> {
    const { error } = await this.db.from('oportunidades_oferente').upsert(
      {
        company_id: companyId,
        ...cambios,
        actualizado_en: new Date().toISOString(),
      },
      { onConflict: 'company_id' },
    );
    if (error) throw error;
  }

  async empresa(companyId: number): Promise<EmpresaDeConfiguracion | null> {
    const { data, error } = await this.db
      .from('companies')
      .select('name, logo_url, bank_details')
      .eq('id', companyId)
      .maybeSingle();
    if (error) throw error;
    return (data as EmpresaDeConfiguracion | null) ?? null;
  }

  async documentos(companyId: number): Promise<DocumentoDeEmpresa[]> {
    const { data, error } = await this.db
      .from('oportunidades_documentos')
      .select(COLUMNAS_DOCUMENTO)
      .eq('company_id', companyId)
      .order('tipo', { ascending: true })
      .order('creado_en', { ascending: false });
    if (error) throw error;
    return (data ?? []) as unknown as DocumentoDeEmpresa[];
  }

  async guardarDocumento(
    documento: DocumentoNuevo,
  ): Promise<DocumentoDeEmpresa> {
    const { data, error } = await this.db
      .from('oportunidades_documentos')
      .insert(documento)
      .select(COLUMNAS_DOCUMENTO)
      .single();
    if (error) throw error;
    return data as unknown as DocumentoDeEmpresa;
  }

  /** Los respaldos de experiencia (decisión 34), del más nuevo al más
   *  viejo: lo que lee la IA para el anexo de experiencia. */
  async respaldos(
    companyId: number,
  ): Promise<Array<DatosDeRespaldo & { archivo: string }>> {
    const { data, error } = await this.db
      .from('oportunidades_documentos')
      .select('nombre, datos')
      .eq('company_id', companyId)
      .eq('tipo', TIPO_RESPALDO)
      .order('creado_en', { ascending: false });
    if (error) throw error;
    return (
      (data ?? []) as Array<{ nombre: string; datos: DatosDeRespaldo | null }>
    )
      .filter((f) => f.datos?.numero)
      .map((f) => ({ ...(f.datos as DatosDeRespaldo), archivo: f.nombre }));
  }

  /** Borra la fila y devuelve dónde estaba el archivo; null = no era de
   *  esta empresa. */
  async borrarDocumento(
    companyId: number,
    id: number,
  ): Promise<{ ruta: string } | null> {
    const { data, error } = await this.db
      .from('oportunidades_documentos')
      .delete()
      .eq('company_id', companyId)
      .eq('id', id)
      .select('ruta')
      .maybeSingle();
    if (error) throw error;
    return (data as { ruta: string } | null) ?? null;
  }
}
