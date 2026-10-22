import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { BUCKET_PRIVADO } from 'src/storage/storage.service';
import { SupabaseService } from 'src/supabase/supabase.service';

// Las bases y anexos de una oportunidad (migración 124): la fila en
// `oportunidad_adjuntos` y el archivo en el balde privado de la empresa.
// Toda consulta filtra por company_id.

/** 'bases': lo que publicó el comprador en Mercado Público. 'postulacion':
 *  lo que la empresa va a presentar (migración 127). 'competencia': las
 *  ofertas de los demás, bajadas del cuadro de ofertas (migración 153).
 *  'acta': el acta de evaluación, para «Aprender del acta» (migración 155,
 *  decisión 60). */
export type Seccion = 'bases' | 'postulacion' | 'competencia' | 'acta';

/** De dónde salió (migración 129): 'subido' lo subió una persona;
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
  /** Solo en 'competencia': de qué oferente es (migración 153). */
  competidor: string | null;
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
  /** El trabajo de la IA que lo hizo (migración 129). */
  generacion_id?: number | null;
  /** Solo en 'competencia' (migración 153). */
  competidor?: string | null;
};

const COLUMNAS =
  'id, nombre, ruta, tipo, bytes, seccion, origen, viene_de, competidor, creado_en, subido_por, quien:user_profiles(full_name)';

/** Un firmado y el Word del que salió (decisión 58). */
export type ParDeFirmado = {
  firmado: { id: number; ruta: string };
  word: {
    id: number;
    ruta: string;
    viene_de: number | null;
    generacion_id: number | null;
  };
};

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

  /** La sección y el origen de cada archivo de varias oportunidades de la
   *  empresa, sin rutas: el avance de "Mis licitaciones". */
  async origenesDe(
    companyId: number,
    oportunidadIds: number[],
  ): Promise<
    Array<{
      id: number;
      oportunidad_id: number;
      seccion: Seccion;
      origen: Origen;
      viene_de: number | null;
    }>
  > {
    if (oportunidadIds.length === 0) return [];
    const { data, error } = await this.db
      .from('oportunidad_adjuntos')
      .select('id, oportunidad_id, seccion, origen, viene_de')
      .eq('company_id', companyId)
      .in('oportunidad_id', oportunidadIds)
      .limit(5000);
    if (error) throw error;
    return (data ?? []) as Array<{
      id: number;
      oportunidad_id: number;
      seccion: Seccion;
      origen: Origen;
      viene_de: number | null;
    }>;
  }

  /** Decisión 58: cada firmado de «Mi postulación» con el Word del que
   *  salió (de la IA o subido a mano), si ese Word sigue ahí. */
  async paresFirmados(
    companyId: number,
    oportunidadId: number,
  ): Promise<ParDeFirmado[]> {
    const { data, error } = await this.db
      .from('oportunidad_adjuntos')
      .select('id, nombre, ruta, origen, viene_de, generacion_id')
      .eq('company_id', companyId)
      .eq('oportunidad_id', oportunidadId)
      .eq('seccion', 'postulacion');
    if (error) throw error;
    const filas = (data ?? []) as Array<{
      id: number;
      nombre: string;
      ruta: string;
      origen: Origen;
      viene_de: number | null;
      generacion_id: number | null;
    }>;
    const porId = new Map(filas.map((f) => [f.id, f]));
    return filas.flatMap((f) => {
      const word = f.origen === 'firmado' ? porId.get(f.viene_de ?? -1) : null;
      return word && word.origen !== 'firmado' && /\.docx$/i.test(word.nombre)
        ? [
            {
              firmado: { id: f.id, ruta: f.ruta },
              word: {
                id: word.id,
                ruta: word.ruta,
                viene_de: word.viene_de,
                generacion_id: word.generacion_id,
              },
            },
          ]
        : [];
    });
  }

  /** Decisión 58 (Felipe: "se firma y se borra"): el PDF firmado queda
   *  solo. Primero toma del Word el archivo del comprador y la corrida que
   *  lo hizo (los usan el ZIP y «Volver a armar»); después se borra el Word,
   *  su fila y su archivo. */
  async dejarSoloElPdf(
    companyId: number,
    oportunidadId: number,
    pares: ParDeFirmado[],
  ): Promise<number> {
    let borrados = 0;
    for (const { firmado, word } of pares) {
      const tomar = await this.db
        .from('oportunidad_adjuntos')
        .update({ viene_de: word.viene_de, generacion_id: word.generacion_id })
        .eq('company_id', companyId)
        .eq('oportunidad_id', oportunidadId)
        .eq('origen', 'firmado')
        .eq('id', firmado.id);
      if (tomar.error) throw tomar.error;
      const { data, error } = await this.db
        .from('oportunidad_adjuntos')
        .delete()
        .eq('company_id', companyId)
        .eq('oportunidad_id', oportunidadId)
        .eq('seccion', 'postulacion')
        .in('origen', ['generado', 'subido'])
        .eq('id', word.id)
        .select('ruta');
      if (error) throw error;
      if ((data ?? []).length === 0) continue;
      borrados++;
      const { error: delBalde } = await this.db.storage
        .from(BUCKET_PRIVADO)
        .remove([word.ruta]);
      if (delBalde) {
        this.logger.warn(`no se pudo borrar del balde: ${word.ruta}`);
      }
    }
    return borrados;
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

  /** «Volver a armar» (decisión 49, 19-10): borra los borradores de la IA
   *  que se reemplazaron, la fila y su archivo, solo si siguen sin firmar:
   *  lo firmado nunca se borra solo, ni el Word del que salió un firmado
   *  (su `viene_de` quedaría en nada). Devuelve cuántos borró. */
  async borrarBorradores(
    companyId: number,
    oportunidadId: number,
    ids: number[],
  ): Promise<number> {
    if (ids.length === 0) return 0;
    const firmados = await this.db
      .from('oportunidad_adjuntos')
      .select('viene_de')
      .eq('company_id', companyId)
      .eq('oportunidad_id', oportunidadId)
      .eq('origen', 'firmado')
      .in('viene_de', ids);
    if (firmados.error) throw firmados.error;
    const conFirma = new Set(
      ((firmados.data ?? []) as Array<{ viene_de: number | null }>).map(
        (f) => f.viene_de,
      ),
    );
    const borrables = ids.filter((id) => !conFirma.has(id));
    if (borrables.length === 0) return 0;
    const { data, error } = await this.db
      .from('oportunidad_adjuntos')
      .delete()
      .eq('company_id', companyId)
      .eq('oportunidad_id', oportunidadId)
      .eq('seccion', 'postulacion')
      .eq('origen', 'generado')
      .in('id', borrables)
      .select('ruta');
    if (error) throw error;
    const rutas = ((data ?? []) as Array<{ ruta: string }>).map((f) => f.ruta);
    // Primero las filas, después los archivos: si el balde falla, quedan
    // archivos que nadie ve (inofensivo), nunca filas que apuntan a nada.
    if (rutas.length > 0) {
      const { error: delBalde } = await this.db.storage
        .from(BUCKET_PRIVADO)
        .remove(rutas);
      if (delBalde) {
        this.logger.warn(
          `no se pudieron borrar del balde: ${rutas.join(', ')}`,
        );
      }
    }
    return rutas.length;
  }

  /** true = quedó borrado del balde. */
  async borrarArchivo(ruta: string): Promise<boolean> {
    this.logger.info(`borrar ${BUCKET_PRIVADO}/${ruta}`);
    const { error } = await this.db.storage.from(BUCKET_PRIVADO).remove([ruta]);
    return !error;
  }
}
