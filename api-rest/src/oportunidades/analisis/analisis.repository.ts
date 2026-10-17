import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { BUCKET_PRIVADO } from 'src/storage/storage.service';
import { SupabaseService } from 'src/supabase/supabase.service';

// Los análisis de bases (migración 125) y la descarga de los archivos del
// balde privado. Toda consulta filtra por company_id.

export type EstadoDeAnalisis = 'procesando' | 'listo' | 'error';

export type FilaDeAnalisis = {
  id: number;
  oportunidad_id: number;
  estado: EstadoDeAnalisis;
  resultado: Record<string, unknown> | null;
  archivos: Array<{ id: number; nombre: string }>;
  no_leidos: Array<{ nombre: string; motivo: string }>;
  modelo: string | null;
  tokens_entrada: number | null;
  tokens_salida: number | null;
  costo_usd: number | null;
  error: string | null;
  creado_en: string;
  terminado_en: string | null;
};

export type AnalisisNuevo = {
  company_id: number;
  oportunidad_id: number;
  modelo: string;
  archivos: Array<{ id: number; nombre: string }>;
  no_leidos: Array<{ nombre: string; motivo: string }>;
  pedido_por: string | null;
};

export type FinDeAnalisis = {
  estado: 'listo' | 'error';
  resultado?: Record<string, unknown>;
  no_leidos?: Array<{ nombre: string; motivo: string }>;
  tokens_entrada?: number;
  tokens_salida?: number;
  costo_usd?: number;
  error?: string;
};

const COLUMNAS =
  'id, oportunidad_id, estado, resultado, archivos, no_leidos, modelo, tokens_entrada, tokens_salida, costo_usd, error, creado_en, terminado_en';

@Injectable()
export class AnalisisRepository {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(AnalisisRepository.name);
  }

  private get db() {
    return this.supabase.client;
  }

  /** El último análisis de una oportunidad de la empresa. */
  async ultimo(
    companyId: number,
    oportunidadId: number,
  ): Promise<FilaDeAnalisis | null> {
    const { data, error } = await this.db
      .from('oportunidad_analisis')
      .select(COLUMNAS)
      .eq('company_id', companyId)
      .eq('oportunidad_id', oportunidadId)
      .order('creado_en', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return (data as FilaDeAnalisis | null) ?? null;
  }

  /** null = ya hay uno en curso (lo decide el índice único
   *  `oportunidad_analisis_uno_en_curso`, no la memoria). */
  async crear(fila: AnalisisNuevo): Promise<FilaDeAnalisis | null> {
    const { data, error } = await this.db
      .from('oportunidad_analisis')
      .insert(fila)
      .select(COLUMNAS)
      .single();
    if (error) {
      if ((error as { code?: string }).code === '23505') return null;
      throw error;
    }
    return data as FilaDeAnalisis;
  }

  async terminar(
    companyId: number,
    id: number,
    fin: FinDeAnalisis,
  ): Promise<void> {
    const { error } = await this.db
      .from('oportunidad_analisis')
      .update({ ...fin, terminado_en: new Date().toISOString() })
      .eq('company_id', companyId)
      .eq('id', id);
    if (error) throw error;
  }

  /** Los que quedaron "procesando" desde antes de que encendiera este
   *  motor murieron con el proceso anterior (un despliegue a la mitad). */
  async abandonarAntesDe(
    companyId: number,
    oportunidadId: number,
    antes: string,
  ): Promise<void> {
    const { error } = await this.db
      .from('oportunidad_analisis')
      .update({
        estado: 'error',
        error: 'Se cortó porque el motor se reinició. Vuelve a analizar.',
        terminado_en: new Date().toISOString(),
      })
      .eq('company_id', companyId)
      .eq('oportunidad_id', oportunidadId)
      .eq('estado', 'procesando')
      .lt('creado_en', antes);
    if (error) throw error;
  }

  /** Un archivo del balde privado. */
  async descargar(ruta: string): Promise<Buffer> {
    const { data, error } = await this.db.storage
      .from(BUCKET_PRIVADO)
      .download(ruta);
    if (error || !data) throw error ?? new Error(`sin datos: ${ruta}`);
    return Buffer.from(await data.arrayBuffer());
  }
}
