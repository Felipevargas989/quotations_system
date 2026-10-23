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
import type { ClasificacionDelRubro, FilaDelRubro } from './rubro';

// COMPETIDORES REALES (decisiones 70 y 71 del doc 17; migraciones 162 y 163):
// las ofertas leídas de las actas públicas (mp_ofertas, de todos, como
// mp_procesos), lo que cada empresa marca de un proveedor
// (oportunidades_competidores) y lo que la IA dijo del rubro de cada
// licitación (oportunidades_rubro); las dos últimas filtran siempre por
// company_id.

export type ProcesoConActa = ProcesoDelActa & {
  url_acta: string;
  /** «Seguir» (decisión 30) ya guardó su acta: no se vuelve a bajar. */
  acta_guardada: boolean;
};

/** Una licitación de los últimos 3 años, liviana: para saber qué actas
 *  faltan y qué falta clasificar (la región se compara después, en
 *  memoria, con `regionCalza`). */
export type ProcesoLigero = {
  codigo: string;
  region: string | null;
  comuna: string | null;
  organismo_codigo: string | null;
  fecha_publicacion: string | null;
  url_acta: string | null;
  acta_leida_en: string | null;
  ofertas_leidas_en: string | null;
  con_ganadores: boolean;
};

/** Una licitación para la IA del rubro: su nombre y sus líneas. */
export type ProcesoParaElRubro = {
  codigo: string;
  nombre: string | null;
  organismo: string | null;
  comuna: string | null;
  region: string | null;
  fecha_publicacion: string | null;
  items: unknown;
};

/** Una compra ágil de la empresa, ya cerrada, para ver quién cotizó. */
export type CompraAgilPorRevisar = ProcesoDelActa & {
  fecha_cierre: string | null;
  cotizantes_leidos_en: string | null;
};

const COLUMNAS_DEL_PROCESO =
  'codigo, nombre, organismo_codigo, organismo, region, comuna, fecha_publicacion, adjudicacion, acta_leida_en';

const COLUMNAS_DE_LA_OFERTA =
  'codigo, rut, proveedor, total_ofertado, total_adjudicado, adjudicada, lineas, detalle, proceso, organismo_codigo, organismo, region, comuna, fecha';

const COLUMNAS_DE_LA_MARCA = 'rut, nombre, seguido, descartado';

/** De a cuántos códigos se pregunta (la URL tiene tope). */
const LOTE = 100;
/** PostgREST no entrega más de mil filas por pedido. */
const PAGINA = 1000;
/** La lista liviana de la zona se vuelve a pedir cada 10 minutos. */
const VIGENCIA_DE_LA_ZONA_MS = 10 * 60_000;

const lotes = <T>(lista: readonly T[], tamano = LOTE): T[][] => {
  const r: T[][] = [];
  for (let i = 0; i < lista.length; i += tamano) {
    r.push(lista.slice(i, i + tamano));
  }
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
  private zona: { desde: string; filas: ProcesoLigero[]; en: number } | null =
    null;

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

  /** Las licitaciones publicadas desde `desde`, livianas. Se guarda diez
   *  minutos: la usan la lista, la lectura y la IA del rubro. */
  async zonaLigera(desde: string): Promise<ProcesoLigero[]> {
    if (
      this.zona &&
      this.zona.desde.slice(0, 10) === desde.slice(0, 10) &&
      Date.now() - this.zona.en < VIGENCIA_DE_LA_ZONA_MS
    ) {
      return this.zona.filas;
    }
    const filas = await todasLasFilas<
      Omit<ProcesoLigero, 'con_ganadores'> & { ganador: unknown }
    >((inicio, fin) =>
      this.db
        .from('mp_procesos')
        .select(
          'codigo, region, comuna, organismo_codigo, fecha_publicacion, acta_leida_en, ofertas_leidas_en, url_acta:adjudicacion->>url_acta, ganador:adjudicacion->ganadores->0',
        )
        .eq('tipo', 'licitacion')
        .gte('fecha_publicacion', desde)
        .order('codigo', { ascending: true })
        .range(inicio, fin),
    );
    const ligeras = filas.map(({ ganador, ...f }) => ({
      ...f,
      con_ganadores: ganador != null,
    }));
    this.zona = { desde, filas: ligeras, en: Date.now() };
    return ligeras;
  }

  /** Después de leer o clasificar: la próxima vez se pide de nuevo. */
  olvidarLaZona(): void {
    this.zona = null;
  }

  /** Lo de cada proceso que va con sus ofertas, por código. */
  async procesosParaActa(
    codigos: readonly string[],
  ): Promise<ProcesoConActa[]> {
    const r: ProcesoConActa[] = [];
    for (const lote of lotes([...new Set(codigos)])) {
      const { data, error } = await this.db
        .from('mp_procesos')
        .select(COLUMNAS_DEL_PROCESO)
        .in('codigo', lote);
      if (error) throw error;
      for (const p of (data ?? []) as unknown as Array<
        ProcesoDelActa & {
          adjudicacion: { url_acta?: string | null } | null;
          acta_leida_en: string | null;
        }
      >) {
        const url = p.adjudicacion?.url_acta;
        if (!url) continue;
        r.push({
          codigo: p.codigo,
          nombre: p.nombre,
          organismo_codigo: p.organismo_codigo,
          organismo: p.organismo,
          region: p.region,
          comuna: p.comuna,
          fecha_publicacion: p.fecha_publicacion,
          url_acta: url,
          acta_guardada: p.acta_leida_en != null,
        });
      }
    }
    return r;
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

  /** Las actas guardadas de esos procesos (para comparar línea a línea). */
  async actasDe(
    codigos: readonly string[],
  ): Promise<Map<string, ActaDeAdjudicacion | null>> {
    const r = new Map<string, ActaDeAdjudicacion | null>();
    for (const lote of lotes([...new Set(codigos)], 40)) {
      const { data, error } = await this.db
        .from('mp_procesos')
        .select('codigo, acta')
        .in('codigo', lote);
      if (error) throw error;
      for (const f of (data ?? []) as Array<{
        codigo: string;
        acta: ActaDeAdjudicacion | null;
      }>) {
        r.set(f.codigo, f.acta ?? null);
      }
    }
    return r;
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

  /** Las ofertas de varios RUT: la historia de cada competidor. */
  async ofertasDeRuts(ruts: readonly string[]): Promise<OfertaLeida[]> {
    const todas: OfertaLeida[] = [];
    for (const lote of lotes([...new Set(ruts)])) {
      todas.push(
        ...(await todasLasFilas<OfertaLeida>((desde, hasta) =>
          this.db
            .from('mp_ofertas')
            .select(COLUMNAS_DE_LA_OFERTA)
            .in('rut', lote)
            .order('codigo', { ascending: true })
            .order('rut', { ascending: true })
            .range(desde, hasta),
        )),
      );
    }
    return todas;
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

  /** Los códigos que la IA ya clasificó para la empresa con esta versión
   *  de las instrucciones (`etiqueta`); los de otra versión se revisan de
   *  nuevo. */
  async clasificadas(
    companyId: number,
    etiqueta: string,
  ): Promise<Set<string>> {
    const filas = await todasLasFilas<{
      codigo: string;
      modelo: string | null;
    }>((desde, hasta) =>
      this.db
        .from('oportunidades_rubro')
        .select('codigo, modelo')
        .eq('company_id', companyId)
        .order('codigo', { ascending: true })
        .range(desde, hasta),
    );
    return new Set(
      filas.filter((f) => f.modelo === etiqueta).map((f) => f.codigo),
    );
  }

  /** El nombre y las líneas (con quién ganó cada una) de esos procesos. */
  async procesosParaElRubro(
    codigos: readonly string[],
  ): Promise<ProcesoParaElRubro[]> {
    const r: ProcesoParaElRubro[] = [];
    for (const lote of lotes([...new Set(codigos)], 25)) {
      const { data, error } = await this.db
        .from('mp_procesos')
        .select(
          'codigo, nombre, organismo, comuna, region, fecha_publicacion, items:detalle->Items->Listado',
        )
        .in('codigo', lote);
      if (error) throw error;
      r.push(...((data ?? []) as unknown as ProcesoParaElRubro[]));
    }
    return r;
  }

  /** Lo que dijo la IA de cada licitación, con quién ganó lo del rubro. */
  async guardarRubro(
    companyId: number,
    filas: ReadonlyArray<
      ClasificacionDelRubro &
        Omit<FilaDelRubro, 'del_rubro'> & {
          region: string | null;
        }
    >,
    modelo: string,
  ): Promise<void> {
    if (filas.length === 0) return;
    const ahora = new Date().toISOString();
    const { error } = await this.db.from('oportunidades_rubro').upsert(
      filas.map((f) => ({
        company_id: companyId,
        codigo: f.codigo,
        del_rubro: f.del_rubro,
        lineas: f.lineas,
        ganadores: f.ganadores,
        razon: f.razon,
        nombre: f.nombre,
        organismo: f.organismo,
        comuna: f.comuna,
        region: f.region,
        fecha: f.fecha,
        modelo,
        clasificado_en: ahora,
      })),
      { onConflict: 'company_id,codigo' },
    );
    if (error) throw error;
  }

  /** Las licitaciones del rubro de la empresa (sí o en parte) desde una
   *  fecha, revisadas con la versión actual: «Quién gana en tu zona». */
  filasDelRubro(
    companyId: number,
    desde: string,
    etiqueta: string,
  ): Promise<FilaDelRubro[]> {
    return todasLasFilas<FilaDelRubro>((inicio, fin) =>
      this.db
        .from('oportunidades_rubro')
        .select(
          'codigo, del_rubro, ganadores, nombre, organismo, comuna, fecha',
        )
        .eq('company_id', companyId)
        // Solo lo revisado con las instrucciones de hoy: al endurecerlas,
        // lo de antes deja de contar al tiro (23-10, v1 → v2).
        .eq('modelo', etiqueta)
        .in('del_rubro', ['si', 'parcial'])
        .gte('fecha', desde.slice(0, 10))
        .order('codigo', { ascending: true })
        .range(inicio, fin),
    );
  }

  /** Las compras ágiles de la empresa ya cerradas (hasta 45 días) que no
   *  se revisaron en las últimas 20 horas. */
  async comprasAgilesPorRevisar(
    companyId: number,
    ahora = Date.now(),
  ): Promise<CompraAgilPorRevisar[]> {
    const mias = await this.misLicitaciones(companyId);
    const hace45 = new Date(ahora - 45 * 24 * 3600_000).toISOString();
    const hace20h = ahora - 20 * 3600_000;
    const r: CompraAgilPorRevisar[] = [];
    for (const lote of lotes(mias.map((m) => m.codigo))) {
      const { data, error } = await this.db
        .from('mp_procesos')
        .select(
          'codigo, nombre, organismo_codigo, organismo, region, comuna, fecha_publicacion, fecha_cierre, cotizantes_leidos_en',
        )
        .in('codigo', lote)
        .eq('tipo', 'compra_agil')
        .lt('fecha_cierre', new Date(ahora).toISOString())
        .gte('fecha_cierre', hace45);
      if (error) throw error;
      r.push(
        ...((data ?? []) as CompraAgilPorRevisar[]).filter(
          (p) =>
            !p.cotizantes_leidos_en ||
            new Date(p.cotizantes_leidos_en).getTime() < hace20h,
        ),
      );
    }
    return r;
  }

  /** Lo que dijo Mercado Público de una compra ágil cerrada: quién cotizó
   *  (crudo, aparte de `detalle`, que el radar reescribe) y cuándo. */
  async guardarCotizantes(codigo: string, cotizantes: unknown): Promise<void> {
    const { error } = await this.db
      .from('mp_procesos')
      .update({
        cotizantes,
        cotizantes_leidos_en: new Date().toISOString(),
      })
      .eq('codigo', codigo);
    if (error) throw error;
  }
}
