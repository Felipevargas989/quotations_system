import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { BUCKET_PRIVADO } from 'src/storage/storage.service';
import { SupabaseService } from 'src/supabase/supabase.service';

// Los trabajos de la IA sobre los archivos de una oportunidad: el análisis
// de bases (migración 125) y la validación de documentos (127). La misma
// forma de fila en dos tablas. Toda consulta filtra por company_id.

export type EstadoDeAnalisis = 'procesando' | 'listo' | 'error';

export type FilaDeAnalisis = {
  id: number;
  oportunidad_id: number;
  estado: EstadoDeAnalisis;
  resultado: Record<string, unknown> | null;
  /** Lo que leyó. La validación anota la carpeta del ZIP en vez del id
   *  (decisión 83): lee también lo de «Mi empresa». */
  archivos: Array<{ id?: number; nombre: string; carpeta?: string }>;
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
  /** Solo la validación: el análisis cuyo checklist revisó. */
  analisis_id?: number | null;
  oportunidad_id: number;
  modelo: string;
  /** Lo que leyó. La validación anota la carpeta del ZIP en vez del id
   *  (decisión 83): lee también lo de «Mi empresa». */
  archivos: Array<{ id?: number; nombre: string; carpeta?: string }>;
  no_leidos: Array<{ nombre: string; motivo: string }>;
  pedido_por: string | null;
};

/** Lo último de un trabajo, sin el resultado: el avance de "Mis
 *  licitaciones". `tipo` solo en la generación; `listo` solo en la
 *  validación ('si' | 'casi' | 'no'). */
export type TrabajoLiviano = {
  oportunidad_id: number;
  estado: EstadoDeAnalisis;
  creado_en: string;
  tipo?: string;
  listo?: string | null;
};

/** Lo que dice de la fecha del servicio un análisis listo (decisión 100:
 *  la pestaña «Ganadas»). Sin tipo fijo: viene tal cual del resultado. */
export type ServicioEnElAnalisis = {
  fecha_del_servicio?: unknown;
  fecha_del_servicio_iso?: unknown;
  /** Las fechas de las bases; en un análisis de antes del 17-10, la del
   *  servicio está entre ellas. */
  fechas?: unknown;
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

export const COLUMNAS_DE_TRABAJO =
  'id, oportunidad_id, estado, resultado, archivos, no_leidos, modelo, tokens_entrada, tokens_salida, costo_usd, error, creado_en, terminado_en';

/** La base de los tres (también `GeneracionRepository`, migración 129):
 *  cada uno dice su tabla, y sus columnas si trae más. */
export abstract class TrabajosDeIARepository {
  protected abstract readonly tabla: string;
  protected readonly columnas: string = COLUMNAS_DE_TRABAJO;
  protected readonly columnasLivianas: string =
    'oportunidad_id, estado, creado_en';

  constructor(
    protected readonly supabase: SupabaseService,
    protected readonly logger: PinoLogger,
  ) {}

  protected get db() {
    return this.supabase.client;
  }

  /** El último análisis de una oportunidad de la empresa. */
  async ultimo(
    companyId: number,
    oportunidadId: number,
  ): Promise<FilaDeAnalisis | null> {
    const { data, error } = await this.db
      .from(this.tabla)
      .select(this.columnas)
      .eq('company_id', companyId)
      .eq('oportunidad_id', oportunidadId)
      .order('creado_en', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return (data as unknown as FilaDeAnalisis | null) ?? null;
  }

  /** Los trabajos de varias oportunidades de la empresa, livianos y lo
   *  más nuevo primero: el avance de "Mis licitaciones". */
  async ultimosDe(
    companyId: number,
    oportunidadIds: number[],
  ): Promise<TrabajoLiviano[]> {
    if (oportunidadIds.length === 0) return [];
    const { data, error } = await this.db
      .from(this.tabla)
      .select(this.columnasLivianas)
      .eq('company_id', companyId)
      .in('oportunidad_id', oportunidadIds)
      .order('creado_en', { ascending: false })
      .limit(1000);
    if (error) throw error;
    return (data ?? []) as unknown as TrabajoLiviano[];
  }

  /** null = ya hay uno en curso (lo decide el índice único
   *  `oportunidad_analisis_uno_en_curso`, no la memoria). */
  async crear(fila: AnalisisNuevo): Promise<FilaDeAnalisis | null> {
    const { data, error } = await this.db
      .from(this.tabla)
      .insert(fila)
      .select(this.columnas)
      .single();
    if (error) {
      if ((error as { code?: string }).code === '23505') return null;
      throw error;
    }
    return data as unknown as FilaDeAnalisis;
  }

  async terminar(
    companyId: number,
    id: number,
    fin: FinDeAnalisis,
  ): Promise<void> {
    const { error } = await this.db
      .from(this.tabla)
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
      .from(this.tabla)
      .update({
        estado: 'error',
        error: 'Se cortó porque el motor se reinició. Vuelve a intentar.',
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

@Injectable()
export class AnalisisRepository extends TrabajosDeIARepository {
  protected readonly tabla = 'oportunidad_analisis';

  constructor(supabase: SupabaseService, logger: PinoLogger) {
    super(supabase, logger);
    this.logger.setContext(AnalisisRepository.name);
  }

  /** Los criterios del último análisis listo de cada oportunidad de la
   *  empresa (decisión 97: en una compra ágil, el lugar por precio solo si
   *  el criterio es el de la ley). */
  async criteriosDe(
    companyId: number,
    oportunidadIds: number[],
  ): Promise<Map<number, Array<{ nombre: string }>>> {
    const r = new Map<number, Array<{ nombre: string }>>();
    if (oportunidadIds.length === 0) return r;
    const { data, error } = await this.db
      .from(this.tabla)
      .select('oportunidad_id, criterios:resultado->criterios')
      .eq('company_id', companyId)
      .eq('estado', 'listo')
      .in('oportunidad_id', oportunidadIds)
      .order('creado_en', { ascending: false })
      .limit(500);
    if (error) throw error;
    for (const f of (data ?? []) as Array<{
      oportunidad_id: number;
      criterios: unknown;
    }>) {
      if (!r.has(f.oportunidad_id) && Array.isArray(f.criterios)) {
        r.set(f.oportunidad_id, f.criterios as Array<{ nombre: string }>);
      }
    }
    return r;
  }

  /** Cuándo es el servicio, según el último análisis listo de cada
   *  oportunidad de la empresa (decisión 100: la pestaña «Ganadas»). */
  async serviciosDe(
    companyId: number,
    oportunidadIds: number[],
  ): Promise<Map<number, ServicioEnElAnalisis>> {
    const r = new Map<number, ServicioEnElAnalisis>();
    if (oportunidadIds.length === 0) return r;
    const { data, error } = await this.db
      .from(this.tabla)
      .select(
        'oportunidad_id, fecha_del_servicio:resultado->fecha_del_servicio, fecha_del_servicio_iso:resultado->fecha_del_servicio_iso, fechas:resultado->fechas',
      )
      .eq('company_id', companyId)
      .eq('estado', 'listo')
      .in('oportunidad_id', oportunidadIds)
      .order('creado_en', { ascending: false })
      .limit(500);
    if (error) throw error;
    for (const f of (data ?? []) as Array<
      ServicioEnElAnalisis & { oportunidad_id: number }
    >) {
      if (!r.has(f.oportunidad_id)) {
        const { oportunidad_id, ...servicio } = f;
        r.set(oportunidad_id, servicio);
      }
    }
    return r;
  }
}

@Injectable()
export class ValidacionRepository extends TrabajosDeIARepository {
  protected readonly tabla = 'oportunidad_validacion';
  protected readonly columnasLivianas =
    'oportunidad_id, estado, creado_en, listo:resultado->>listo';

  constructor(supabase: SupabaseService, logger: PinoLogger) {
    super(supabase, logger);
    this.logger.setContext(ValidacionRepository.name);
  }
}
