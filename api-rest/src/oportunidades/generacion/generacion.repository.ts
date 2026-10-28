import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { SupabaseService } from 'src/supabase/supabase.service';
import {
  type AnalisisNuevo,
  COLUMNAS_DE_TRABAJO,
  type FilaDeAnalisis,
  TrabajosDeIARepository,
} from '../analisis/analisis.repository';

// Los trabajos de la IA que HACEN documentos (migración 129): llenar los
// anexos del comprador, firmarlos y crear la propuesta técnica. La misma
// forma que el análisis y la validación, más el tipo y lo que se pidió.
// Toda consulta filtra por company_id.

export type TipoDeGeneracion = 'anexos' | 'firma' | 'propuesta';

export const TIPOS_DE_GENERACION: readonly TipoDeGeneracion[] = [
  'anexos',
  'firma',
  'propuesta',
];

/** Los trabajos de la tabla: los que hacen documentos y, desde el 19-10, el
 *  resumen de negocio de una licitación seguida (decisión 30, migración
 *  145), la oferta (151), la comparación de ofertas (decisión 41,
 *  migración 153), desde el 20-10 «Aprender del acta» (decisión 60,
 *  migración 155), desde el 24-10 la experiencia que se presenta
 *  (decisión 76, migración 164) y desde el 27-10 «Por qué perdimos»
 *  (decisión 97, migración 166), que no dejan archivos. */
export type TipoDeTrabajo =
  | TipoDeGeneracion
  | 'resumen'
  | 'oferta'
  | 'comparacion'
  | 'aprendizaje'
  | 'experiencia'
  | 'por_que';

export type FilaDeGeneracion = FilaDeAnalisis & {
  tipo: TipoDeTrabajo;
  parametros: Record<string, unknown>;
};

export type GeneracionNueva = AnalisisNuevo & {
  tipo: TipoDeTrabajo;
  parametros: Record<string, unknown>;
};

@Injectable()
export class GeneracionRepository extends TrabajosDeIARepository {
  protected readonly tabla = 'oportunidad_generacion';
  protected readonly columnas = `${COLUMNAS_DE_TRABAJO}, tipo, parametros`;
  protected readonly columnasLivianas =
    'oportunidad_id, estado, creado_en, tipo';

  constructor(supabase: SupabaseService, logger: PinoLogger) {
    super(supabase, logger);
    this.logger.setContext(GeneracionRepository.name);
  }

  /** El último trabajo de un tipo en una oportunidad de la empresa. */
  async ultimoDeTipo(
    companyId: number,
    oportunidadId: number,
    tipo: TipoDeTrabajo,
  ): Promise<FilaDeGeneracion | null> {
    const { data, error } = await this.db
      .from(this.tabla)
      .select(this.columnas)
      .eq('company_id', companyId)
      .eq('oportunidad_id', oportunidadId)
      .eq('tipo', tipo)
      .order('creado_en', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return (data as unknown as FilaDeGeneracion | null) ?? null;
  }

  /** Reemplaza los parámetros de un trabajo de la empresa: «Armar
   *  postulación» anota ahí lo que no se pudo seguir (decisión 35). */
  async anotarParametros(
    companyId: number,
    id: number,
    parametros: Record<string, unknown>,
  ): Promise<void> {
    const { error } = await this.db
      .from(this.tabla)
      .update({ parametros })
      .eq('company_id', companyId)
      .eq('id', id);
    if (error) throw error;
  }

  /** null = ya hay uno de ese tipo en curso (lo decide el índice único
   *  `oportunidad_generacion_una_en_curso`). */
  async crearGeneracion(
    fila: GeneracionNueva,
  ): Promise<FilaDeGeneracion | null> {
    return (await this.crear(fila)) as FilaDeGeneracion | null;
  }
}
