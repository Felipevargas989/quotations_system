import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { derechosDe, tieneDerecho } from 'src/auth/derechos';
import { SupabaseService } from 'src/supabase/supabase.service';
import type { ProcesoPasado } from './historia/anterior';
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
const HORA = 60 * 60 * 1000;
const DIA = 24 * HORA;
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

const COLUMNAS_DE_LISTA =
  'id, codigo, semaforo, etiquetas, se_hace_en_el_complejo, razon, alertas, estado, responsable_id, leida_en, ' +
  'proceso:mp_procesos!inner(tipo, nombre, organismo, organismo_codigo, unidad, comuna, region, monto, fecha_publicacion, fecha_cierre, estado)';

const COLUMNAS_DE_FICHA =
  'id, codigo, semaforo, etiquetas, se_hace_en_el_complejo, razon, alertas, leida_con, leida_en, estado, responsable_id, notas, quotation_id, actualizado_en, ' +
  'proceso:mp_procesos!inner(codigo, tipo, nombre, descripcion, organismo, organismo_codigo, unidad, comuna, region, monto, moneda, estado, fecha_publicacion, fecha_cierre, fechas, productos, adjudicacion, primera_vez_visto, actualizado_en)';

type ProcesoDeLista = {
  tipo: string;
  nombre: string;
  organismo: string | null;
  organismo_codigo: string | null;
  unidad: string | null;
  comuna: string | null;
  region: string | null;
  monto: number | null;
  fecha_publicacion: string | null;
  fecha_cierre: string | null;
  estado: string | null;
};

export type FilaDeLista = {
  id: number;
  codigo: string;
  semaforo: string | null;
  etiquetas: string[];
  se_hace_en_el_complejo: string | null;
  razon: string | null;
  alertas: string[];
  estado: string;
  responsable_id: string | null;
  leida_en: string | null;
  proceso: ProcesoDeLista;
};

export type FichaDeOportunidad = Omit<FilaDeLista, 'proceso'> & {
  leida_con: string | null;
  notas: string | null;
  quotation_id: string | null;
  actualizado_en: string;
  proceso: ProcesoDeLista & {
    codigo: string;
    descripcion: string | null;
    moneda: string | null;
    fechas: Record<string, unknown>;
    productos: Array<Record<string, unknown>>;
    adjudicacion: Record<string, unknown> | null;
    primera_vez_visto: string;
    actualizado_en: string;
  };
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

  /** Al encender el motor: lo que quedó "corriendo" desde ANTES de este
   *  encendido murió con el proceso anterior (el motor corre en una sola
   *  réplica). Sin esto, un despliegue a mitad de corrida dejaba el radar
   *  bloqueado 3 horas. Devuelve cuántas marcó. */
  async abandonarCorridasDeAntes(encendido: string): Promise<number> {
    const { data, error } = await this.db
      .from('mp_radar_corridas')
      .update({
        estado: 'abandonada',
        termino_en: new Date().toISOString(),
        error: 'el motor se reinició con la corrida a medias',
      })
      .eq('estado', 'corriendo')
      .lt('empezo_en', encendido)
      .select('id');
    if (error) throw error;
    return (data ?? []).length;
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

  /** La lista de la empresa, con los datos del proceso. `vigentes` deja
   *  solo lo que sigue abierto (cierre futuro o sin cierre). Pagina de a
   *  1000 porque Supabase no entrega más por consulta. */
  async listar(
    companyId: number,
    filtros: {
      vigentes: boolean;
      semaforo?: string;
      estado?: string;
      tipo?: string;
      limite: number;
    },
  ): Promise<FilaDeLista[]> {
    const ahora = new Date().toISOString();
    const filas: FilaDeLista[] = [];
    for (let desde = 0; desde < filtros.limite; desde += PAGINA) {
      const hasta = Math.min(desde + PAGINA, filtros.limite) - 1;
      let consulta = this.db
        .from('oportunidades')
        .select(COLUMNAS_DE_LISTA)
        .eq('company_id', companyId);
      if (filtros.semaforo)
        consulta = consulta.eq('semaforo', filtros.semaforo);
      if (filtros.estado) consulta = consulta.eq('estado', filtros.estado);
      if (filtros.tipo) consulta = consulta.eq('proceso.tipo', filtros.tipo);
      if (filtros.vigentes) {
        consulta = consulta.or(
          `fecha_cierre.gt."${ahora}",fecha_cierre.is.null`,
          { referencedTable: 'proceso' },
        );
      }
      const { data, error } = await consulta
        .order('id', { ascending: true })
        .range(desde, hasta);
      if (error) throw error;
      filas.push(...((data ?? []) as unknown as FilaDeLista[]));
      if (!data || data.length < hasta - desde + 1) break;
    }
    return filas;
  }

  // ------------------------------------------------------------
  // Sprint 1b: adjudicaciones e historia (datos públicos)
  // ------------------------------------------------------------

  /** Licitaciones cerradas hace menos de 120 días que todavía no dicen
   *  quién ganó, revisadas por última vez hace más de 20 horas. */
  async procesosPorAdjudicar(
    limite: number,
  ): Promise<Array<{ codigo: string; region: string | null }>> {
    const ahora = Date.now();
    const { data, error } = await this.db
      .from('mp_procesos')
      .select('codigo, region')
      .eq('tipo', 'licitacion')
      .is('adjudicacion', null)
      .lt('fecha_cierre', new Date(ahora).toISOString())
      .gt('fecha_cierre', new Date(ahora - 120 * DIA).toISOString())
      .lt('actualizado_en', new Date(ahora - 20 * HORA).toISOString())
      .order('fecha_cierre', { ascending: false })
      .limit(limite);
    if (error) throw error;
    return (data ?? []) as Array<{ codigo: string; region: string | null }>;
  }

  /** El próximo día de historia por revisar: primero los cercanos a "hace
   *  un año". null = la historia está completa. */
  async siguienteDiaDeHistoria(): Promise<string | null> {
    const { data, error } = await this.db
      .from('mp_historia')
      .select('fecha')
      .eq('estado', 'pendiente')
      .order('prioridad', { ascending: true })
      .order('fecha', { ascending: false })
      .limit(1);
    if (error) throw error;
    return (data?.[0] as { fecha?: string } | undefined)?.fecha ?? null;
  }

  async marcarDiaDeHistoria(
    fecha: string,
    cambios: {
      estado: 'pendiente' | 'hecha' | 'error';
      listadas?: number;
      candidatas?: number;
      guardadas?: number;
      error?: string | null;
    },
  ): Promise<void> {
    const { error } = await this.db
      .from('mp_historia')
      .update({ ...cambios, revisada_en: new Date().toISOString() })
      .eq('fecha', fecha);
    if (error) throw error;
  }

  /** Lo ya adjudicado de estos organismos compradores, para "el año
   *  anterior". De a 100 organismos por consulta. */
  async historialDeOrganismos(codigos: string[]): Promise<ProcesoPasado[]> {
    const pasados: ProcesoPasado[] = [];
    const unicos = [...new Set(codigos.filter(Boolean))];
    for (let i = 0; i < unicos.length; i += 100) {
      const { data, error } = await this.db
        .from('mp_procesos')
        .select(
          'codigo, nombre, organismo_codigo, fecha_publicacion, monto, adjudicacion',
        )
        .in('organismo_codigo', unicos.slice(i, i + 100))
        .not('adjudicacion', 'is', null)
        .order('fecha_publicacion', { ascending: false })
        .limit(PAGINA);
      if (error) throw error;
      pasados.push(...((data ?? []) as ProcesoPasado[]));
    }
    return pasados;
  }

  /** La ficha: la oportunidad de ESTA empresa con todo su proceso. */
  async ficha(
    companyId: number,
    id: number,
  ): Promise<FichaDeOportunidad | null> {
    const { data, error } = await this.db
      .from('oportunidades')
      .select(COLUMNAS_DE_FICHA)
      .eq('company_id', companyId)
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    return (data as unknown as FichaDeOportunidad | null) ?? null;
  }

  /** El historial de un proceso (dato público: sin company_id). */
  async cambiosDe(codigo: string) {
    const { data, error } = await this.db
      .from('mp_cambios')
      .select('id, tipo, antes, despues, creado_en')
      .eq('codigo', codigo)
      .order('creado_en', { ascending: false })
      .limit(50);
    if (error) throw error;
    return data ?? [];
  }

  /** Lo que la empresa decide. null = no era de esta empresa. */
  async actualizar(
    companyId: number,
    id: number,
    cambios: {
      estado?: string;
      responsable_id?: string | null;
      notas?: string | null;
    },
  ) {
    const { data, error } = await this.db
      .from('oportunidades')
      .update({ ...cambios, actualizado_en: new Date().toISOString() })
      .eq('company_id', companyId)
      .eq('id', id)
      .select('id, estado, responsable_id, notas, actualizado_en')
      .maybeSingle();
    if (error) throw error;
    return data ?? null;
  }

  async esUsuarioDeLaEmpresa(
    companyId: number,
    userId: string,
  ): Promise<boolean> {
    const { data, error } = await this.db
      .from('user_profiles')
      .select('id')
      .eq('company_id', companyId)
      .eq('id', userId)
      .maybeSingle();
    if (error) throw error;
    return Boolean(data);
  }

  /** Lo que la configuración del módulo muestra sin poder cambiarlo: vive
   *  en Configuración de empresa. */
  async datosDeEmpresa(companyId: number): Promise<{
    high_value_threshold: number | null;
    notifications: { replyTo?: string | null } | null;
  } | null> {
    const { data, error } = await this.db
      .from('companies')
      .select('high_value_threshold, notifications')
      .eq('id', companyId)
      .maybeSingle();
    if (error) throw error;
    return (
      (data as {
        high_value_threshold: number | null;
        notifications: { replyTo?: string | null } | null;
      } | null) ?? null
    );
  }

  async guardarConfig(
    companyId: number,
    config: Partial<ConfigOportunidades>,
  ): Promise<void> {
    const { error } = await this.db.from('oportunidades_config').upsert(
      {
        company_id: companyId,
        ...config,
        actualizado_en: new Date().toISOString(),
      },
      { onConflict: 'company_id' },
    );
    if (error) throw error;
  }
}
