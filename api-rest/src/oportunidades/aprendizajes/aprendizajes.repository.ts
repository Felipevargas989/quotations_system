import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { SupabaseService } from 'src/supabase/supabase.service';
import type { Aprendizaje, TipoDeDecision } from './aprendizajes';

// La base de lo que aprendimos de las comisiones (migración 155, decisión
// 60). Toda consulta filtra por company_id.

const COLUMNAS =
  'id, codigo, unidad, organismo, situacion, decision, tipo, fuente, oportunidad_id, creado_en';

/** Lo más que lee la comparación de una vez: lo más nuevo primero. */
const MAX_FILAS = 500;

export type AprendizajeNuevo = {
  codigo: string;
  unidad: string | null;
  organismo: string | null;
  situacion: string;
  decision: string;
  tipo: TipoDeDecision;
};

@Injectable()
export class AprendizajesRepository {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(AprendizajesRepository.name);
  }

  private get db() {
    return this.supabase.client;
  }

  /** Todo lo aprendido por la empresa, lo más nuevo primero. */
  async deLaEmpresa(companyId: number): Promise<Aprendizaje[]> {
    const { data, error } = await this.db
      .from('oportunidades_aprendizajes')
      .select(COLUMNAS)
      .eq('company_id', companyId)
      .order('creado_en', { ascending: false })
      .limit(MAX_FILAS);
    if (error) throw error;
    return (data ?? []) as Aprendizaje[];
  }

  /** Lo que se sabe de una unidad de compra, lo más nuevo primero. */
  async deLaUnidad(companyId: number, unidad: string): Promise<Aprendizaje[]> {
    const { data, error } = await this.db
      .from('oportunidades_aprendizajes')
      .select(COLUMNAS)
      .eq('company_id', companyId)
      .eq('unidad', unidad)
      .order('creado_en', { ascending: false })
      .limit(MAX_FILAS);
    if (error) throw error;
    return (data ?? []) as Aprendizaje[];
  }

  /** «Aprender del acta» otra vez reemplaza lo que dejó la vez anterior en
   *  esa oportunidad (solo lo leído de un acta: los casos no se tocan). Lo
   *  que ya estaba igual en esa licitación (un caso con la misma situación)
   *  no se repite. Devuelve cuántos guardó. */
  async reemplazarLosDelActa(
    companyId: number,
    oportunidadId: number,
    generacionId: number,
    filas: AprendizajeNuevo[],
  ): Promise<number> {
    const borrar = await this.db
      .from('oportunidades_aprendizajes')
      .delete()
      .eq('company_id', companyId)
      .eq('oportunidad_id', oportunidadId)
      .eq('fuente', 'acta');
    if (borrar.error) throw borrar.error;
    const codigos = [...new Set(filas.map((f) => f.codigo))];
    const ya = new Set<string>();
    if (codigos.length > 0) {
      const { data, error } = await this.db
        .from('oportunidades_aprendizajes')
        .select('codigo, situacion')
        .eq('company_id', companyId)
        .in('codigo', codigos);
      if (error) throw error;
      for (const f of (data ?? []) as Array<{
        codigo: string;
        situacion: string;
      }>) {
        ya.add(`${f.codigo}|${f.situacion}`);
      }
    }
    const nuevas = filas
      .filter((f, i) => {
        const clave = `${f.codigo}|${f.situacion}`;
        const repetida =
          ya.has(clave) ||
          filas.findIndex((g) => `${g.codigo}|${g.situacion}` === clave) < i;
        return !repetida;
      })
      .map((f) => ({
        ...f,
        company_id: companyId,
        fuente: 'acta' as const,
        oportunidad_id: oportunidadId,
        generacion_id: generacionId,
      }));
    if (nuevas.length === 0) return 0;
    const { error } = await this.db
      .from('oportunidades_aprendizajes')
      .insert(nuevas);
    if (error) throw error;
    this.logger.info(
      `aprendizajes: ${nuevas.length} del acta de la oportunidad ${oportunidadId}`,
    );
    return nuevas.length;
  }
}
