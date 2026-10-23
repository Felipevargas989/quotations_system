import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { SupabaseService } from 'src/supabase/supabase.service';
import type { ProcesoParaLeer } from '../lectura/lectura.service';
import type { Lectura, Semaforo } from '../lectura/reglas';

// LA LECTURA DE «SE VIENE» (migración 156, decisión 62 del doc 17). La
// misma lectura de la bandeja, guardada aparte (`oportunidades_se_viene`)
// para la última vez que salió cada serie: lo que se guarda en
// `oportunidades` aparece en la bandeja y en su historial. Toda consulta de
// la tabla filtra por company_id; los procesos son dato público.

/** De a cuántos códigos se pregunta (el filtro `in` va en la dirección). */
const LOTE = 100;

export type LecturaDeSerie = {
  codigo: string;
  semaforo: Semaforo;
  razon: string;
  /** Para el reciclaje (decisión 72): roja, cercana y del rubro. */
  etiquetas: string[] | null;
  /** Con qué se leyó (`LECTURA_ACTUAL`): si cambió, se relee el color. */
  modelo: string | null;
  /** Migración 157 (decisión 63): las ediciones anteriores según la IA
   *  (null: todavía no lo revisa), por qué, y si la empresa la descartó. */
  ediciones: string[] | null;
  repeticion: string | null;
  descartada_en: string | null;
};

@Injectable()
export class SeVieneRepository {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(SeVieneRepository.name);
  }

  private get db() {
    return this.supabase.client;
  }

  /** Lo ya leído de estas series, por el código de su última vez. */
  async lecturas(
    companyId: number,
    codigos: string[],
  ): Promise<Map<string, LecturaDeSerie>> {
    const leidas = new Map<string, LecturaDeSerie>();
    for (let i = 0; i < codigos.length; i += LOTE) {
      const { data, error } = await this.db
        .from('oportunidades_se_viene')
        .select(
          'codigo, semaforo, razon, etiquetas, modelo, ediciones, repeticion, descartada_en',
        )
        .eq('company_id', companyId)
        .in('codigo', codigos.slice(i, i + LOTE));
      if (error) throw error;
      for (const f of (data ?? []) as LecturaDeSerie[]) leidas.set(f.codigo, f);
    }
    return leidas;
  }

  /** Lo que la IA necesita para leer esos procesos, como en el radar. */
  async procesosParaLeer(codigos: string[]): Promise<ProcesoParaLeer[]> {
    const filas: ProcesoParaLeer[] = [];
    for (let i = 0; i < codigos.length; i += LOTE) {
      const { data, error } = await this.db
        .from('mp_procesos')
        .select(
          'codigo, tipo, nombre, descripcion, organismo, unidad, comuna, region, monto, fecha_cierre, productos',
        )
        .in('codigo', codigos.slice(i, i + LOTE));
      if (error) throw error;
      filas.push(...((data ?? []) as ProcesoParaLeer[]));
    }
    return filas;
  }

  /** El nombre con que la IA conoce a la empresa. */
  async nombreDeLaEmpresa(companyId: number): Promise<string> {
    const { data, error } = await this.db
      .from('companies')
      .select('name')
      .eq('id', companyId)
      .maybeSingle();
    if (error) throw error;
    return (data as { name: string | null } | null)?.name ?? '';
  }

  /** Lo que dijo la IA de si se repite (decisión 63), en la fila que dejó
   *  la lectura del semáforo. */
  async guardarRepeticion(
    companyId: number,
    codigo: string,
    ediciones: string[],
    repeticion: string,
  ): Promise<void> {
    const { error } = await this.db
      .from('oportunidades_se_viene')
      .update({ ediciones, repeticion })
      .eq('company_id', companyId)
      .eq('codigo', codigo);
    if (error) throw error;
  }

  /** «Descartar» (o recuperar) una serie (decisión 63). false si esa
   *  serie no está leída para la empresa. */
  async descartar(
    companyId: number,
    codigo: string,
    descartada: boolean,
  ): Promise<boolean> {
    const { data, error } = await this.db
      .from('oportunidades_se_viene')
      .update({
        descartada_en: descartada ? new Date().toISOString() : null,
      })
      .eq('company_id', companyId)
      .eq('codigo', codigo)
      .select('codigo');
    if (error) throw error;
    return ((data ?? []) as unknown[]).length > 0;
  }

  async guardar(
    companyId: number,
    codigo: string,
    lectura: Lectura,
    modelo: string,
  ): Promise<void> {
    const { error } = await this.db.from('oportunidades_se_viene').upsert(
      {
        company_id: companyId,
        codigo,
        semaforo: lectura.semaforo,
        etiquetas: lectura.etiquetas,
        se_hace_en_el_complejo: lectura.se_hace_en_el_complejo,
        razon: lectura.razon,
        modelo,
        leido_en: new Date().toISOString(),
      },
      { onConflict: 'company_id,codigo' },
    );
    if (error) throw error;
  }
}
