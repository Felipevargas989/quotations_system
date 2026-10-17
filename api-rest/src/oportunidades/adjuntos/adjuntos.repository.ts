import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { BUCKET_PRIVADO } from 'src/storage/storage.service';
import { SupabaseService } from 'src/supabase/supabase.service';

// Las bases y anexos de una oportunidad (migración 124): la fila en
// `oportunidad_adjuntos` y el archivo en el balde privado de la empresa.
// Toda consulta filtra por company_id.

/** 'bases': lo que publicó el comprador en Mercado Público. 'postulacion':
 *  lo que la empresa va a presentar (migración 127). */
export type Seccion = 'bases' | 'postulacion';

/** De dónde salió (migración 128): 'subido' lo subió una persona;
 *  'generado' lo hizo la IA, SIN firma; 'firmado' es la versión con la foto
 *  de la firma. */
export type Origen = 'subido' | 'generado' | 'firmado';

export type Adjunto = {
  id: number;
  nombre: string;
  ruta: string;
  tipo: string;
  bytes: number;
  seccion: Seccion;
  origen: Origen;
  /** El archivo del que salió: el anexo del comprador (generado) o el
   *  generado (firmado). */
  viene_de: number | null;
  creado_en: string;
  subido_por: string | null;
  quien: { full_name: string | null } | null;
};

export type AdjuntoNuevo = {
  company_id: number;
  oportunidad_id: number;
  nombre: string;
  ruta: string;
  tipo: string;
  bytes: number;
  seccion: Seccion;
  /** El PERFIL (user_profiles.id), no el id de la sesión: ver perfilDe. */
  subido_por: string | null;
  /** Sin decirlo, 'subido' (lo pone la base). */
  origen?: Origen;
  viene_de?: number | null;
  /** El trabajo de la IA que lo hizo (migración 128). */
  generacion_id?: number | null;
};

const COLUMNAS =
  'id, nombre, ruta, tipo, bytes, seccion, origen, viene_de, creado_en, subido_por, quien:user_profiles(full_name)';

@Injectable()
export class AdjuntosRepository {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(AdjuntosRepository.name);
  }

  private get db() {
    return this.supabase.client;
  }

  /** ¿Esa oportunidad es de esta empresa? */
  async esDeLaEmpresa(
    companyId: number,
    oportunidadId: number,
  ): Promise<boolean> {
    const { data, error } = await this.db
      .from('oportunidades')
      .select('id')
      .eq('company_id', companyId)
      .eq('id', oportunidadId)
      .maybeSingle();
    if (error) throw error;
    return Boolean(data);
  }

  /** El perfil de quien está en la sesión. OJO: el id de la sesión es el de
   *  la cuenta (auth), que en user_profiles es `user_id`, NO `id` (lo mismo
   *  que busca el guardián al entrar, `UsersRepository.findOne`). Probado en
   *  el laboratorio el 17-10: con el id de la sesión la base rechazaba la
   *  fila (llave foránea) y la subida daba 500. null = sin perfil en esta
   *  empresa. */
  async perfilDe(companyId: number, cuentaId: string): Promise<string | null> {
    const { data, error } = await this.db
      .from('user_profiles')
      .select('id')
      .eq('company_id', companyId)
      .eq('user_id', cuentaId)
      .maybeSingle();
    if (error) throw error;
    return (data as { id: string } | null)?.id ?? null;
  }

  /** Lo subido a una oportunidad en una sección, lo último primero. */
  async listar(
    companyId: number,
    oportunidadId: number,
    seccion: Seccion,
  ): Promise<Adjunto[]> {
    const { data, error } = await this.db
      .from('oportunidad_adjuntos')
      .select(COLUMNAS)
      .eq('company_id', companyId)
      .eq('oportunidad_id', oportunidadId)
      .eq('seccion', seccion)
      .order('creado_en', { ascending: false });
    if (error) throw error;
    return (data ?? []) as unknown as Adjunto[];
  }

  async subirArchivo(
    ruta: string,
    contenido: Buffer,
    tipo: string,
  ): Promise<void> {
    this.logger.info(
      `subir ${BUCKET_PRIVADO}/${ruta} (${contenido.length} bytes)`,
    );
    const { error } = await this.db.storage
      .from(BUCKET_PRIVADO)
      .upload(ruta, contenido, { contentType: tipo, upsert: false });
    if (error) throw error;
  }

  async guardar(adjunto: AdjuntoNuevo): Promise<Adjunto> {
    const { data, error } = await this.db
      .from('oportunidad_adjuntos')
      .insert(adjunto)
      .select(COLUMNAS)
      .single();
    if (error) throw error;
    return data as unknown as Adjunto;
  }

  /** Borra la fila y devuelve dónde estaba el archivo. null = no era de
   *  esta empresa o de esta oportunidad. */
  async borrarFila(
    companyId: number,
    oportunidadId: number,
    adjuntoId: number,
  ): Promise<{ ruta: string } | null> {
    const { data, error } = await this.db
      .from('oportunidad_adjuntos')
      .delete()
      .eq('company_id', companyId)
      .eq('oportunidad_id', oportunidadId)
      .eq('id', adjuntoId)
      .select('ruta')
      .maybeSingle();
    if (error) throw error;
    return (data as { ruta: string } | null) ?? null;
  }

  /** true = quedó borrado del balde. */
  async borrarArchivo(ruta: string): Promise<boolean> {
    this.logger.info(`borrar ${BUCKET_PRIVADO}/${ruta}`);
    const { error } = await this.db.storage.from(BUCKET_PRIVADO).remove([ruta]);
    return !error;
  }
}
