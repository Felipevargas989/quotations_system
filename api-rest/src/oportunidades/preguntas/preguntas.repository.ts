import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { SupabaseService } from 'src/supabase/supabase.service';

// PREGÚNTALE A LA IA SOBRE ESTAS BASES (decisión 67 del doc 17, 22-10;
// migración 159). Cada fila es una pregunta de una persona sobre las bases
// de una oportunidad y la respuesta de la IA, con sus citas. El hilo es de
// la oportunidad: lo ve todo el equipo. Toda consulta filtra por company_id.

export type EstadoDePregunta = 'procesando' | 'listo' | 'error';
export type SeguridadDeRespuesta = 'alta' | 'media' | 'baja';

export type CitaDeLaIA = { documento: string; pagina: number; texto: string };

export type FilaDePregunta = {
  id: number;
  oportunidad_id: number;
  pregunta: string;
  estado: EstadoDePregunta;
  respuesta: string | null;
  citas: CitaDeLaIA[];
  seguridad: SeguridadDeRespuesta | null;
  error: string | null;
  modelo: string | null;
  tokens_entrada: number | null;
  tokens_salida: number | null;
  tokens_cache_escrita: number | null;
  tokens_cache_leida: number | null;
  costo_usd: number | null;
  preguntado_por: string | null;
  quien: { full_name: string | null } | null;
  creado_en: string;
  terminado_en: string | null;
};

export type PreguntaNueva = {
  company_id: number;
  oportunidad_id: number;
  pregunta: string;
  modelo: string;
  preguntado_por: string | null;
};

export type FinDePregunta = {
  estado: 'listo' | 'error';
  respuesta?: string;
  citas?: CitaDeLaIA[];
  seguridad?: SeguridadDeRespuesta;
  error?: string;
  tokens_entrada?: number;
  tokens_salida?: number;
  tokens_cache_escrita?: number;
  tokens_cache_leida?: number;
  costo_usd?: number;
};

export const COLUMNAS_DE_PREGUNTA =
  'id, oportunidad_id, pregunta, estado, respuesta, citas, seguridad, error, modelo, tokens_entrada, tokens_salida, tokens_cache_escrita, tokens_cache_leida, costo_usd, preguntado_por, quien:user_profiles(full_name), creado_en, terminado_en';

/** Lo más que se trae de un hilo: de la más vieja a la más nueva. */
export const MAX_HILO = 100;

@Injectable()
export class PreguntasRepository {
  private readonly tabla = 'oportunidad_preguntas';

  constructor(
    private readonly supabase: SupabaseService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(PreguntasRepository.name);
  }

  private get db() {
    return this.supabase.client;
  }

  /** El hilo de una oportunidad de la empresa, de la más vieja a la más
   *  nueva (así la pantalla y la IA lo leen en orden). */
  async listar(
    companyId: number,
    oportunidadId: number,
  ): Promise<FilaDePregunta[]> {
    const { data, error } = await this.db
      .from(this.tabla)
      .select(COLUMNAS_DE_PREGUNTA)
      .eq('company_id', companyId)
      .eq('oportunidad_id', oportunidadId)
      .order('creado_en', { ascending: true })
      .limit(MAX_HILO);
    if (error) throw error;
    return (data ?? []) as unknown as FilaDePregunta[];
  }

  /** null = ya hay una en curso (lo decide el índice único
   *  `oportunidad_preguntas_una_en_curso`, no la memoria). */
  async crear(fila: PreguntaNueva): Promise<FilaDePregunta | null> {
    const { data, error } = await this.db
      .from(this.tabla)
      .insert(fila)
      .select(COLUMNAS_DE_PREGUNTA)
      .single();
    if (error) {
      if ((error as { code?: string }).code === '23505') return null;
      throw error;
    }
    return data as unknown as FilaDePregunta;
  }

  async terminar(
    companyId: number,
    id: number,
    fin: FinDePregunta,
  ): Promise<void> {
    const { error } = await this.db
      .from(this.tabla)
      .update({ ...fin, terminado_en: new Date().toISOString() })
      .eq('company_id', companyId)
      .eq('id', id);
    if (error) throw error;
  }

  /** Las que quedaron "procesando" desde antes de que encendiera este
   *  motor murieron con el proceso anterior (un despliegue a la mitad). */
  async abandonarAntesDe(
    companyId: number,
    oportunidadId: number,
    antes: string,
  ): Promise<void> {
    const { error } = await this.db
      .from(this.tabla)
      .update({
        estado: 'error',
        error: 'Se cortó porque el motor se reinició. Pregunta de nuevo.',
        terminado_en: new Date().toISOString(),
      })
      .eq('company_id', companyId)
      .eq('oportunidad_id', oportunidadId)
      .eq('estado', 'procesando')
      .lt('creado_en', antes);
    if (error) throw error;
  }
}
