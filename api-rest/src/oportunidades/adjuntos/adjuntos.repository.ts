import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { BUCKET_PRIVADO } from 'src/storage/storage.service';
import { SupabaseService } from 'src/supabase/supabase.service';

// Las bases y anexos de una oportunidad (migración 124): la fila en
// `oportunidad_adjuntos` y el archivo en el balde privado de la empresa.
// Toda consulta filtra por company_id.

export type Adjunto = {
  id: number;
  nombre: string;
  ruta: string;
  tipo: string;
  bytes: number;
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
  subido_por: string;
};

const COLUMNAS =
  'id, nombre, ruta, tipo, bytes, creado_en, subido_por, quien:user_profiles(full_name)';

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

  /** Lo subido a una oportunidad, lo último primero. */
  async listar(companyId: number, oportunidadId: number): Promise<Adjunto[]> {
    const { data, error } = await this.db
      .from('oportunidad_adjuntos')
      .select(COLUMNAS)
      .eq('company_id', companyId)
      .eq('oportunidad_id', oportunidadId)
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
