import { Injectable } from '@nestjs/common';
import type { PostgrestError } from '@supabase/supabase-js';
import { PinoLogger } from 'nestjs-pino';
import { SupabaseService } from 'src/supabase/supabase.service';
import type { ActaDeAdjudicacion } from '../historia/acta';
import type {
  MarcaDeCompetidor,
  OfertaLeida,
  ProcesoDelActa,
} from './competencia';

// COMPETIDORES REALES (decisión 70 del doc 17, migración 162): las ofertas
// leídas de las actas públicas (mp_ofertas, de todos, como mp_procesos) y lo
// que cada empresa marca de un proveedor (oportunidades_competidores, que
// filtra siempre por company_id).

export type ProcesoConActa = ProcesoDelActa & {
  url_acta: string;
  /** «Seguir» (decisión 30) ya guardó su acta: no se vuelve a bajar. */
  acta_guardada: boolean;
};

const COLUMNAS_DEL_PROCESO =
  'codigo, nombre, organismo_codigo, organismo, region, comuna, fecha_publicacion, adjudicacion, acta_leida_en';

const COLUMNAS_DE_LA_OFERTA =
  'codigo, rut, proveedor, total_ofertado, total_adjudicado, adjudicada, lineas, detalle, proceso, organismo_codigo, organismo, region, comuna, fecha';

const COLUMNAS_DE_LA_MARCA =
  'rut, nombre, seguido, descartado, similar, similar_razon';

/** De a cuántos códigos se pregunta (la URL tiene tope). */
const LOTE = 100;
/** PostgREST no entrega más de mil filas por pedido. */
const PAGINA = 1000;

const lotes = <T>(lista: readonly T[]): T[][] => {
  const r: T[][] = [];
  for (let i = 0; i < lista.length; i += LOTE) r.push(lista.slice(i, i + LOTE));
  return r;
};

/** Todas las filas de una consulta, de a mil. */
const todasLasFilas = async <T>(
  pedir: (
    desde: number,
    hasta: number,
  ) => PromiseLike<{ data: unknown; error: PostgrestError | null }>,
): Promise<T[]> => {
  const filas: T[] = [];
  for (let desde = 0; ; desde += PAGINA) {
    const { data, error } = await pedir(desde, desde + PAGINA - 1);
    if (error) throw error;
    const pagina = (data ?? []) as T[];
    filas.push(...pagina);
    if (pagina.length < PAGINA) return filas;
  }
};

@Injectable()
export class CompetenciaRepository {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(CompetenciaRepository.name);
  }

  private get db() {
    return this.supabase.client;
  }

  /** Los códigos y compradores de las oportunidades con que la empresa
   *  hizo algo (todas menos las nuevas y las descartadas). */
  async misLicitaciones(
    companyId: number,
  ): Promise<Array<{ codigo: string; organismo_codigo: string | null }>> {
    const filas = await todasLasFilas<{
      codigo: string;
      proceso: { organismo_codigo: string | null } | null;
    }>((desde, hasta) =>
      this.db
        .from('oportunidades')
        .select('codigo, proceso:mp_procesos!inner(organismo_codigo)')
        .eq('company_id', companyId)
        .not('estado', 'in', '(nueva,descartada)')
        .order('id', { ascending: true })
        .range(desde, hasta),
    );
    return filas.map((f) => ({
      codigo: f.codigo,
      organismo_codigo: f.proceso?.organismo_codigo ?? null,
    }));
  }

  /** Las actas por pasar (adjudicadas, con enlace al acta y sin sus
   *  ofertas en mp_ofertas), de los códigos, los compradores o las comunas
   *  dados, desde una fecha; lo más nuevo primero. */
  async actasPorLeer(
    filtro:
      | { codigos: readonly string[] }
      | { organismos: readonly string[]; desde: string }
      | { comunas: readonly string[]; desde: string },
    limite: number,
  ): Promise<ProcesoConActa[]> {
    const pedir = async (
      armar: (
        c: ReturnType<CompetenciaRepository['consultaDeActas']>,
      ) => ReturnType<CompetenciaRepository['consultaDeActas']>,
    ) => {
      const { data, error } = await armar(this.consultaDeActas())
        .order('fecha_publicacion', { ascending: false })
        .limit(limite);
      if (error) throw error;
      return (
        (data ?? []) as unknown as Array<
          ProcesoDelActa & {
            adjudicacion: { url_acta?: string | null } | null;
            acta_leida_en: string | null;
          }
        >
      )
        .filter((p) => p.adjudicacion?.url_acta)
        .map(({ adjudicacion, acta_leida_en, ...p }) => ({
          ...p,
          url_acta: adjudicacion!.url_acta!,
          acta_guardada: acta_leida_en != null,
        }));
    };
    if ('codigos' in filtro) {
      const r: ProcesoConActa[] = [];
      for (const lote of lotes([...new Set(filtro.codigos)])) {
        r.push(...(await pedir((c) => c.in('codigo', lote))));
      }
      return r.slice(0, limite);
    }
    if ('organismos' in filtro) {
      if (filtro.organismos.length === 0) return [];
      return pedir((c) =>
        c
          .in('organismo_codigo', filtro.organismos.slice(0, 200))
          .gte('fecha_publicacion', filtro.desde),
      );
    }
    if (filtro.comunas.length === 0) return [];
    return pedir((c) =>
      c
        .in('comuna', filtro.comunas.slice(0, 200))
        .gte('fecha_publicacion', filtro.desde),
    );
  }

  private consultaDeActas() {
    return this.db
      .from('mp_procesos')
      .select(COLUMNAS_DEL_PROCESO)
      .not('adjudicacion->>url_acta', 'is', null)
      .is('ofertas_leidas_en', null);
  }

  /** El acta que ya guardó «Seguir» (decisión 30). */
  async actaGuardada(codigo: string): Promise<ActaDeAdjudicacion | null> {
    const { data, error } = await this.db
      .from('mp_procesos')
      .select('acta')
      .eq('codigo', codigo)
      .maybeSingle();
    if (error) throw error;
    const fila = data as { acta?: ActaDeAdjudicacion | null } | null;
    return fila?.acta ?? null;
  }

  /** Las ofertas de un acta (reemplazan las de antes) y la marca de que
   *  pasaron. Con `actaNueva` (recién bajada) la guarda también en su
   *  proceso; un acta sin ítems no se guarda, para que «Seguir» la vuelva
   *  a intentar. */
  async guardarOfertas(
    codigo: string,
    ofertas: readonly OfertaLeida[],
    actaNueva?: ActaDeAdjudicacion,
  ): Promise<void> {
    const ahora = new Date().toISOString();
    const borrar = await this.db
      .from('mp_ofertas')
      .delete()
      .eq('codigo', codigo);
    if (borrar.error) throw borrar.error;
    if (ofertas.length > 0) {
      const { error } = await this.db.from('mp_ofertas').insert([...ofertas]);
      if (error) throw error;
    }
    const { error } = await this.db
      .from('mp_procesos')
      .update({
        ofertas_leidas_en: ahora,
        ...(actaNueva && actaNueva.items.length > 0
          ? { acta: actaNueva, acta_leida_en: ahora }
          : {}),
      })
      .eq('codigo', codigo);
    if (error) throw error;
  }

  /** Las ofertas de un RUT (normalizado). */
  ofertasDe(rut: string): Promise<OfertaLeida[]> {
    return todasLasFilas<OfertaLeida>((desde, hasta) =>
      this.db
        .from('mp_ofertas')
        .select(COLUMNAS_DE_LA_OFERTA)
        .eq('rut', rut)
        .order('codigo', { ascending: true })
        .range(desde, hasta),
    );
  }

  /** Todas las ofertas de esas licitaciones. */
  async ofertasDeLicitaciones(
    codigos: readonly string[],
  ): Promise<OfertaLeida[]> {
    const todas: OfertaLeida[] = [];
    for (const lote of lotes([...new Set(codigos)])) {
      todas.push(
        ...(await todasLasFilas<OfertaLeida>((desde, hasta) =>
          this.db
            .from('mp_ofertas')
            .select(COLUMNAS_DE_LA_OFERTA)
            .in('codigo', lote)
            .order('codigo', { ascending: true })
            .order('rut', { ascending: true })
            .range(desde, hasta),
        )),
      );
    }
    return todas;
  }

  /** Las ofertas en esos compradores desde una fecha. */
  async ofertasEnCompradores(
    organismos: readonly string[],
    desde: string,
  ): Promise<OfertaLeida[]> {
    const todas: OfertaLeida[] = [];
    for (const lote of lotes([...new Set(organismos)])) {
      todas.push(
        ...(await todasLasFilas<OfertaLeida>((inicio, fin) =>
          this.db
            .from('mp_ofertas')
            .select(COLUMNAS_DE_LA_OFERTA)
            .in('organismo_codigo', lote)
            .gte('fecha', desde)
            .order('codigo', { ascending: true })
            .order('rut', { ascending: true })
            .range(inicio, fin),
        )),
      );
    }
    return todas;
  }

  /** Lo que la empresa marcó de cada proveedor. */
  marcas(companyId: number): Promise<MarcaDeCompetidor[]> {
    return todasLasFilas<MarcaDeCompetidor>((desde, hasta) =>
      this.db
        .from('oportunidades_competidores')
        .select(COLUMNAS_DE_LA_MARCA)
        .eq('company_id', companyId)
        .order('rut', { ascending: true })
        .range(desde, hasta),
    );
  }

  /** «Seguir» o «No es mi competidor» (o deshacerlo). */
  async marcar(
    companyId: number,
    rut: string,
    nombre: string | null,
    cambios: { seguido?: boolean; descartado?: boolean },
  ): Promise<MarcaDeCompetidor> {
    const { data, error } = await this.db
      .from('oportunidades_competidores')
      .upsert(
        {
          company_id: companyId,
          rut,
          ...(nombre ? { nombre } : {}),
          ...cambios,
          actualizado_en: new Date().toISOString(),
        },
        { onConflict: 'company_id,rut' },
      )
      .select(COLUMNAS_DE_LA_MARCA)
      .single();
    if (error) throw error;
    return data as unknown as MarcaDeCompetidor;
  }

  /** Lo que dijo la IA de cada proveedor (sin tocar lo que marcó la
   *  empresa). */
  async guardarClasificaciones(
    companyId: number,
    filas: ReadonlyArray<{
      rut: string;
      nombre: string;
      similar: 'si' | 'no';
      razon: string;
    }>,
    modelo: string,
  ): Promise<void> {
    if (filas.length === 0) return;
    const ahora = new Date().toISOString();
    const { error } = await this.db.from('oportunidades_competidores').upsert(
      filas.map((f) => ({
        company_id: companyId,
        rut: f.rut,
        nombre: f.nombre,
        similar: f.similar,
        similar_razon: f.razon,
        clasificado_con: modelo,
        clasificado_en: ahora,
      })),
      { onConflict: 'company_id,rut' },
    );
    if (error) throw error;
  }
}
