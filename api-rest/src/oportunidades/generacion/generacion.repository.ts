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

export type FilaDeGeneracion = FilaDeAnalisis & {
  tipo: TipoDeGeneracion;
  parametros: Record<string, unknown>;
};

export type GeneracionNueva = AnalisisNuevo & {
  tipo: TipoDeGeneracion;
  parametros: Record<string, unknown>;
};

@Injectable()
export class GeneracionRepository extends TrabajosDeIARepository {
  protected readonly tabla = 'oportunidad_generacion';
  protected readonly columnas = `${COLUMNAS_DE_TRABAJO}, tipo, parametros`;

  constructor(supabase: SupabaseService, logger: PinoLogger) {
    super(supabase, logger);
    this.logger.setContext(GeneracionRepository.name);
  }

  /** El último trabajo de un tipo en una oportunidad de la empresa. */
  async ultimoDeTipo(
    companyId: number,
    oportunidadId: number,
    tipo: TipoDeGeneracion,
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

  /** null = ya hay uno de ese tipo en curso (lo decide el índice único
   *  `oportunidad_generacion_una_en_curso`). */
  async crearGeneracion(
    fila: GeneracionNueva,
  ): Promise<FilaDeGeneracion | null> {
    return (await this.crear(fila)) as FilaDeGeneracion | null;
  }
}
