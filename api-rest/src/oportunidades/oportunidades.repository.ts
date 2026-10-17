import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { derechosDe, tieneDerecho } from 'src/auth/derechos';
import { SupabaseService } from 'src/supabase/supabase.service';
import type { ProcesoParaLeer } from './lectura/lectura.service';
import type { LecturaFinal } from './lectura/reglas';
import type { ProcesoMp } from './mercado-publico/tipos';

// LA ÚNICA CAPA QUE TOCA LA BASE en este módulo (regla del motor).
//
// Dos clases de tabla (doc 17, regla 4):
//  - mp_*: datos públicos de Mercado Público, iguales para todos. Sin
//    company_id, a propósito.
//  - oportunidades*: lo de cada empresa. TODO método que las toca recibe
//    companyId y filtra por él.

const LOTE = 100;
const PAGINA = 1000;
/** Una corrida que lleva más que esto "corriendo" murió con el proceso. */
const CORRIDA_COLGADA_MS = 3 * 60 * 60 * 1000;

export type EmpresaConModulo = {
  id: number;
  name: string;
  high_value_threshold: number | null;
};

export type ConfigOportunidades = {
  regiones: string[];
  comunas_cercanas: string[];
  perfil: string | null;
};

export type ProcesoConocido = {
  fecha_cierre: string | null;
  estado: string | null;
};

@Injectable()
export class OportunidadesRepository {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(OportunidadesRepository.name);
  }

  private get db() {
    return this.supabase.client;
  }

  // ------------------------------------------------------------
  // Corridas del radar
  // ------------------------------------------------------------

  /** Toma el candado. null = ya hay una corriendo (el índice único
   *  `mp_radar_una_corriendo` es el que decide, no la memoria). */
  async tomarCorrida(origen: string): Promise<number | null> {
    const colgada = new Date(Date.now() - CORRIDA_COLGADA_MS).toISOString();
    const { error: errorColgadas } = await this.db
      .from('mp_radar_corridas')
      .update({
        estado: 'abandonada',
        termino_en: new Date().toISOString(),
        error: 'quedó corriendo más de 3 horas: el proceso murió a la mitad',
      })
      .eq('estado', 'corriendo')
      .lt('empezo_en', colgada);
    if (errorColgadas) throw errorColgadas;

    const { data, error } = await this.db
      .from('mp_radar_corridas')
      .insert({ origen })
      .select('id')
      .single();
    if (error) {
      if (error.code === '23505') return null;
      throw error;
    }
    return (data as { id: number }).id;
  }

  async terminarCorrida(
    id: number,
    estado: 'ok' | 'error',
    resumen: object,
    error?: string,
  ): Promise<void> {
    const { error: e } = await this.db
      .from('mp_radar_corridas')
      .update({
        estado,
        termino_en: new Date().toISOString(),
        resumen,
        error: error ?? null,
      })
      .eq('id', id);
    if (e) throw e;
  }

  /** Cuándo empezó la última corrida que terminó bien. */
  async ultimaCorridaOk(): Promise<string | null> {
    const { data, error } = await this.db
      .from('mp_radar_corridas')
      .select('empezo_en')
      .eq('estado', 'ok')
      .order('empezo_en', { ascending: false })
      .limit(1);
    if (error) throw error;
    return (data?.[0] as { empezo_en?: string } | undefined)?.empezo_en ?? null;
  }

  async ultimasCorridas(limite = 10) {
    const { data, error } = await this.db
      .from('mp_radar_corridas')
      .select('id, origen, estado, empezo_en, termino_en, resumen, error')
      .order('empezo_en', { ascending: false })
      .limit(limite);
    if (error) throw error;
    return data ?? [];
  }

  // ------------------------------------------------------------
  // Procesos de Mercado Público (comunes)
  // ------------------------------------------------------------

  /** Los que ya están en la base, con su cierre y estado guardados. */
  async procesosConocidos(
    codigos: string[],
  ): Promise<Map<string, ProcesoConocido>> {
    const conocidos = new Map<string, ProcesoConocido>();
    for (let i = 0; i < codigos.length; i += 300) {
      const tramo = codigos.slice(i, i + 300);
      const { data, error } = await this.db
        .from('mp_procesos')
        .select('codigo, fecha_cierre, estado')
        .in('codigo', tramo);
      if (error) throw error;
      for (const fila of (data ?? []) as Array<
        { codigo: string } & ProcesoConocido
      >) {
        conocidos.set(fila.codigo, {
          fecha_cierre: fila.fecha_cierre,
          estado: fila.estado,
        });
      }
    }
    return conocidos;
  }

  /** Inserta o actualiza. primera_vez_visto no viaja: la pone la base solo
   *  la primera vez. */
  async guardarProcesos(procesos: ProcesoMp[]): Promise<void> {
    const ahora = new Date().toISOString();
    for (let i = 0; i < procesos.length; i += LOTE) {
      const lote = procesos
        .slice(i, i + LOTE)
        .map((p) => ({ ...p, actualizado_en: ahora }));
      const { error } = await this.db
        .from('mp_procesos')
        .upsert(lote, { onConflict: 'codigo' });
      if (error) throw error;
    }
  }

  async actualizarCierre(
    codigo: string,
    fechaCierre: string | null,
    estado: string | null,
  ): Promise<void> {
    const cambios: Record<string, unknown> = {
      fecha_cierre: fechaCierre,
      actualizado_en: new Date().toISOString(),
    };
    if (estado !== null) cambios.estado = estado;
    const { error } = await this.db
      .from('mp_procesos')
      .update(cambios)
      .eq('codigo', codigo);
    if (error) throw error;
  }

  async registrarCambios(
    cambios: Array<{
      codigo: string;
      tipo: string;
      antes: unknown;
      despues: unknown;
    }>,
  ): Promise<void> {
    for (let i = 0; i < cambios.length; i += LOTE) {
      const { error } = await this.db
        .from('mp_cambios')
        .insert(cambios.slice(i, i + LOTE));
      if (error) throw error;
    }
  }

  /** Los procesos que siguen abiertos (o sin cierre informado), con lo
   *  que la IA necesita para leerlos. */
  async procesosAbiertos(): Promise<ProcesoParaLeer[]> {
    const ahora = new Date().toISOString();
    const filas: ProcesoParaLeer[] = [];
    for (let desde = 0; ; desde += PAGINA) {
      const { data, error } = await this.db
        .from('mp_procesos')
        .select(
          'codigo, tipo, nombre, descripcion, organismo, unidad, comuna, region, monto, fecha_cierre, productos',
        )
        .or(`fecha_cierre.gt."${ahora}",fecha_cierre.is.null`)
        .order('codigo', { ascending: true })
        .range(desde, desde + PAGINA - 1);
      if (error) throw error;
      filas.push(...((data ?? []) as ProcesoParaLeer[]));
      if (!data || data.length < PAGINA) break;
    }
    return filas;
  }

  // ------------------------------------------------------------
  // Lo de cada empresa
  // ------------------------------------------------------------

  /** Las empresas con el derecho `oportunidades`, decidido por la misma
   *  función que usa toda la casa (derechosDe): si la empresa está
   *  bloqueada, no entra aunque tenga el módulo. */
  async empresasConModulo(): Promise<EmpresaConModulo[]> {
    const { data, error } = await this.db
      .from('companies')
      .select(
        'id, name, plan, estado_plan, modulos_propios, high_value_threshold',
      )
      .contains('modulos_propios', ['oportunidades']);
    if (error) throw error;
    return (
      (data ?? []) as Array<
        EmpresaConModulo & {
          plan: string | null;
          estado_plan: string | null;
          modulos_propios: string[] | null;
        }
      >
    )
      .filter((e) => tieneDerecho(derechosDe(e).derechos, 'oportunidades'))
      .map((e) => ({
        id: e.id,
        name: e.name,
        high_value_threshold: e.high_value_threshold,
      }));
  }

  async configDe(companyId: number): Promise<ConfigOportunidades | null> {
    const { data, error } = await this.db
      .from('oportunidades_config')
      .select('regiones, comunas_cercanas, perfil')
      .eq('company_id', companyId)
      .maybeSingle();
    if (error) throw error;
    return (data as ConfigOportunidades | null) ?? null;
  }

  /** El catálogo de la empresa en pocas palabras, para la IA: los nombres
   *  de sus paquetes y de sus servicios fijos activos. */
  async catalogoResumido(
    companyId: number,
  ): Promise<{ paquetes: string[]; fijos: string[] }> {
    const [paquetes, fijos] = await Promise.all([
      this.db
        .from('service_group_collections')
        .select('name')
        .eq('company_id', companyId)
        .order('name', { ascending: true })
        .limit(80),
      this.db
        .from('fixed_services')
        .select('name')
        .eq('company_id', companyId)
        .eq('is_active', true)
        .order('name', { ascending: true })
        .limit(60),
    ]);
    if (paquetes.error) throw paquetes.error;
    if (fijos.error) throw fijos.error;
    const nombres = (filas: unknown) =>
      ((filas ?? []) as Array<{ name: string | null }>)
        .map((f) => f.name?.trim())
        .filter((n): n is string => Boolean(n));
    return { paquetes: nombres(paquetes.data), fijos: nombres(fijos.data) };
  }

  /** Los códigos que esta empresa ya tiene leídos. */
  async codigosLeidos(companyId: number): Promise<Set<string>> {
    const codigos = new Set<string>();
    for (let desde = 0; ; desde += PAGINA) {
      const { data, error } = await this.db
        .from('oportunidades')
        .select('codigo')
        .eq('company_id', companyId)
        .order('id', { ascending: true })
        .range(desde, desde + PAGINA - 1);
      if (error) throw error;
      for (const fila of (data ?? []) as Array<{ codigo: string }>) {
        codigos.add(fila.codigo);
      }
      if (!data || data.length < PAGINA) break;
    }
    return codigos;
  }

  /** Guarda la lectura. Si ya existía no la pisa: la decisión de la
   *  empresa (estado, responsable, notas) nunca la cambia el radar. */
  async guardarLectura(
    companyId: number,
    codigo: string,
    lectura: LecturaFinal,
    modelo: string,
  ): Promise<void> {
    const { error } = await this.db.from('oportunidades').upsert(
      {
        company_id: companyId,
        codigo,
        semaforo: lectura.semaforo,
        etiquetas: lectura.etiquetas,
        se_hace_en_el_complejo: lectura.se_hace_en_el_complejo,
        razon: lectura.razon,
        alertas: lectura.alertas,
        leida_con: modelo,
        leida_en: new Date().toISOString(),
      },
      { onConflict: 'company_id,codigo', ignoreDuplicates: true },
    );
    if (error) throw error;
  }

  /** La lista de la empresa, con los datos del proceso. */
  async listar(
    companyId: number,
    filtros: { semaforo?: string; estado?: string; limite?: number },
  ) {
    let consulta = this.db
      .from('oportunidades')
      .select(
        'id, codigo, semaforo, etiquetas, se_hace_en_el_complejo, razon, alertas, estado, leida_en, ' +
          'proceso:mp_procesos!inner(tipo, nombre, organismo, unidad, comuna, region, monto, fecha_cierre, estado)',
      )
      .eq('company_id', companyId);
    if (filtros.semaforo) consulta = consulta.eq('semaforo', filtros.semaforo);
    if (filtros.estado) consulta = consulta.eq('estado', filtros.estado);
    const { data, error } = await consulta
      .order('leida_en', { ascending: false })
      .limit(Math.min(filtros.limite ?? 200, 1000));
    if (error) throw error;
    return data ?? [];
  }
}
