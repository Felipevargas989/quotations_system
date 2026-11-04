import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { Company } from 'src/companies/entities/company.entity';
import {
  QuotationStatus,
  RequestType,
} from 'src/quotations/constants/constants';
import { SupabaseService } from 'src/supabase/supabase.service';
import type { CotizacionParaCambiar } from './propuestas/reglas';

// LO QUE BELIA LEE DE LA BASE (doc 20 §9). Solo lectura, salvo la cuenta
// del mes y sus propuestas (fase 2): los cambios de una cotización NO se
// escriben acá, van por `QuotationsService.update` como los del cotizador.
// Toda consulta filtra por la empresa de la SESIÓN, que llega
// como parámetro y nunca de lo que pida la IA (doc 20 §3, regla 1; mapa 22
// §6). No usa `QuotationsRepository.findOne`: no filtra por empresa (zona
// de riesgo 3 del mapa 00).

/** Lo justo de una cotización para nombrarla en una lista. */
const COLUMNAS_DE_LISTA =
  'id, quotation_number, quotation_status, request_type, event_type, ' +
  'event_date, event_end_date, people_count, children_count, ' +
  'total_amount, sent_at, created_at';

export type FilaDeLista = {
  id: string;
  quotation_number: number;
  quotation_status: QuotationStatus;
  request_type: RequestType;
  event_type: string | null;
  event_date: string | null;
  event_end_date: string | null;
  people_count: number | null;
  children_count: number | null;
  total_amount: number | null;
  sent_at: string | null;
  created_at: string;
  clients: { name: string | null } | null;
};

export type FiltrosDeBusqueda = {
  numero?: number;
  cliente?: string;
  estados?: QuotationStatus[];
  tipo?: RequestType;
  tipoDeEvento?: string;
  eventoDesde?: string;
  eventoHasta?: string;
  creadaDesde?: string;
  creadaHasta?: string;
  orden: 'fecha_evento' | 'numero' | 'creada' | 'total';
  limite: number;
};

export type FichaDeCotizacion = FilaDeLista & {
  subtotal_amount: number | null;
  discount_percentage: number | null;
  discount_amount: number | null;
  tip_percentage: number | null;
  tip_amount: number | null;
  value_per_person: number | null;
  fixed_value: number | null;
  observations: string | null;
  comentario_interno: string | null;
  contact_name: string | null;
  loss_reason: string | null;
  items: unknown;
  clients: {
    name: string | null;
    client_type: string | null;
    email: string | null;
    phone: string | null;
  } | null;
  mandante: {
    name: string | null;
    email: string | null;
    phone: string | null;
  } | null;
};

export type FilaDeCliente = {
  id: string;
  name: string;
  client_type: string | null;
  email: string | null;
  phone: string | null;
  contact_person: string | null;
};

export type CotizacionDeCliente = {
  id: string;
  client_id: string;
  quotation_number: number;
  quotation_status: QuotationStatus;
  event_type: string | null;
  event_date: string | null;
  total_amount: number | null;
};

export type FilaDeUso = {
  company_id: Company['id'];
  usuario_id: string | null;
  mes: string;
  modelo: string;
  tokens_entrada: number;
  tokens_salida: number;
  tokens_cache_escrita: number;
  tokens_cache_leida: number;
  costo_usd: number;
  segundos: number;
  herramientas: string[];
  ruta: string | null;
  fallo: string | null;
};

/** El texto de un `ilike` sin comodines: lo que escribe la persona se
 *  busca tal cual (misma regla de consultas.repository). */
const literal = (texto: string): string => texto.replace(/[\\%_]/g, '\\$&');

@Injectable()
export class AsistenteRepository {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(AsistenteRepository.name);
  }

  async nombreDeLaEmpresa(companyId: Company['id']): Promise<string | null> {
    const { data, error } = await this.supabase.client
      .from('companies')
      .select('name')
      .eq('id', companyId)
      .maybeSingle();
    if (error) throw error;
    return (data as { name: string | null } | null)?.name ?? null;
  }

  /** La cotización que la persona tiene abierta, si es de su empresa. */
  async cotizacionVista(
    companyId: Company['id'],
    id: string,
  ): Promise<FilaDeLista | null> {
    const { data, error } = await this.supabase.client
      .from('quotations')
      .select(`${COLUMNAS_DE_LISTA}, clients ( name )`)
      .eq('company_id', companyId)
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    return (data as unknown as FilaDeLista | null) ?? null;
  }

  async buscarCotizaciones(
    companyId: Company['id'],
    f: FiltrosDeBusqueda,
  ): Promise<{ filas: FilaDeLista[]; total: number }> {
    this.logger.info(`buscarCotizaciones company ${companyId}`);
    // `!inner` solo cuando se filtra por el cliente: sin él, el filtro de
    // la tabla embebida no saca ninguna fila (mapa 22 §6).
    const cliente = f.cliente ? 'clients!inner ( name )' : 'clients ( name )';
    let query = this.supabase.client
      .from('quotations')
      .select(`${COLUMNAS_DE_LISTA}, ${cliente}`, { count: 'exact' })
      .eq('company_id', companyId);
    if (f.numero) query = query.eq('quotation_number', f.numero);
    if (f.cliente)
      query = query.ilike('clients.name', `%${literal(f.cliente)}%`);
    if (f.estados?.length) query = query.in('quotation_status', f.estados);
    if (f.tipo) query = query.eq('request_type', f.tipo);
    if (f.tipoDeEvento) {
      query = query.ilike('event_type', `%${literal(f.tipoDeEvento)}%`);
    }
    if (f.eventoDesde) query = query.gte('event_date', f.eventoDesde);
    if (f.eventoHasta) {
      query = query.lte('event_date', `${f.eventoHasta}T23:59:59.999Z`);
    }
    if (f.creadaDesde) query = query.gte('created_at', f.creadaDesde);
    if (f.creadaHasta) query = query.lt('created_at', f.creadaHasta);
    const orden = {
      fecha_evento: { columna: 'event_date', ascendente: true },
      numero: { columna: 'quotation_number', ascendente: false },
      creada: { columna: 'created_at', ascendente: false },
      total: { columna: 'total_amount', ascendente: false },
    }[f.orden];
    const { data, error, count } = await query
      .order(orden.columna, { ascending: orden.ascendente, nullsFirst: false })
      .order('id', { ascending: true })
      .range(0, f.limite - 1);
    if (error) throw error;
    return {
      filas: (data ?? []) as unknown as FilaDeLista[],
      total: count ?? 0,
    };
  }

  async fichaDeCotizacion(
    companyId: Company['id'],
    por: { numero: number } | { id: string },
  ): Promise<FichaDeCotizacion | null> {
    let query = this.supabase.client
      .from('quotations')
      .select(
        `${COLUMNAS_DE_LISTA}, subtotal_amount, discount_percentage,
         discount_amount, tip_percentage, tip_amount, value_per_person,
         fixed_value, observations, comentario_interno, contact_name,
         loss_reason, items,
         clients ( name, client_type, email, phone ),
         mandante:client_contacts!quotations_client_contact_id_fkey ( name, email, phone )`,
      )
      .eq('company_id', companyId);
    query =
      'numero' in por
        ? query.eq('quotation_number', por.numero)
        : query.eq('id', por.id);
    const { data, error } = await query.maybeSingle();
    if (error) throw error;
    return (data as unknown as FichaDeCotizacion | null) ?? null;
  }

  /** Los eventos que tocan el rango: empiezan antes de que termine y
   *  terminan (o empiezan, si son de un día) después de que empieza. */
  async calendario(
    companyId: Company['id'],
    desde: string,
    hasta: string,
    estados: QuotationStatus[],
  ): Promise<FilaDeLista[]> {
    this.logger.info(`calendario company ${companyId} ${desde}..${hasta}`);
    const { data, error } = await this.supabase.client
      .from('quotations')
      .select(`${COLUMNAS_DE_LISTA}, clients ( name )`)
      .eq('company_id', companyId)
      .in('quotation_status', estados)
      .lte('event_date', `${hasta}T23:59:59.999Z`)
      // `desde` llega validado como AAAA-MM-DD: no trae comas ni paréntesis.
      .or(
        `event_end_date.gte.${desde},and(event_end_date.is.null,event_date.gte.${desde})`,
      )
      .order('event_date', { ascending: true })
      .limit(300);
    if (error) throw error;
    return (data ?? []) as unknown as FilaDeLista[];
  }

  async clientes(
    companyId: Company['id'],
    texto: string,
  ): Promise<FilaDeCliente[]> {
    const { data, error } = await this.supabase.client
      .from('clients')
      .select('id, name, client_type, email, phone, contact_person')
      .eq('company_id', companyId)
      .ilike('name', `%${literal(texto)}%`)
      .order('name', { ascending: true })
      .limit(10);
    if (error) throw error;
    return (data ?? []) as FilaDeCliente[];
  }

  async cotizacionesDeClientes(
    companyId: Company['id'],
    clientes: string[],
  ): Promise<CotizacionDeCliente[]> {
    if (clientes.length === 0) return [];
    const { data, error } = await this.supabase.client
      .from('quotations')
      .select(
        'id, client_id, quotation_number, quotation_status, event_type, event_date, total_amount',
      )
      .eq('company_id', companyId)
      .in('client_id', clientes)
      .order('event_date', { ascending: false, nullsFirst: false })
      .limit(200);
    if (error) throw error;
    return (data ?? []) as CotizacionDeCliente[];
  }

  /** Lo gastado por la empresa en el mes (AAAA-MM, en Chile). */
  async gastoDelMes(companyId: Company['id'], mes: string): Promise<number> {
    const { data, error } = await this.supabase.client
      .from('asistente_uso')
      .select('costo_usd')
      .eq('company_id', companyId)
      .eq('mes', mes);
    if (error) throw error;
    return ((data ?? []) as Array<{ costo_usd: number | string }>).reduce(
      (s, f) => s + (Number(f.costo_usd) || 0),
      0,
    );
  }

  async registrarUso(fila: FilaDeUso): Promise<void> {
    const { error } = await this.supabase.client
      .from('asistente_uso')
      .insert(fila);
    if (error) throw error;
  }

  // ---------- Fase 1, sprint 3: pagos, logística y personal ----------
  //
  // `payments`, `payment_transactions` y `refunds` NO tienen company_id
  // (mapa 18): se leen solo después de comprobar que la cotización es de
  // la empresa, o con `quotations!inner` filtrado por ella.

  async cotizacionPorNumero(
    companyId: Company['id'],
    numero: number,
  ): Promise<FilaDeLista | null> {
    const { data, error } = await this.supabase.client
      .from('quotations')
      .select(`${COLUMNAS_DE_LISTA}, clients ( name )`)
      .eq('company_id', companyId)
      .eq('quotation_number', numero)
      .maybeSingle();
    if (error) throw error;
    return (data as unknown as FilaDeLista | null) ?? null;
  }

  /** Cuotas, abonos y reembolsos de UNA cotización ya comprobada. */
  async plataDe(quotationId: string): Promise<{
    cuotas: Cuota[];
    abonos: Abono[];
    reembolsos: Reembolso[];
  }> {
    const [cuotas, abonos, reembolsos] = await Promise.all([
      this.supabase.client
        .from('payments')
        .select(
          'id, payment_number, amount, due_date, status, payment_type, paid_date',
        )
        .eq('quotation_id', quotationId)
        .order('payment_number', { ascending: true }),
      this.supabase.client
        .from('payment_transactions')
        .select('payment_id, amount, payment_method, transaction_date')
        .eq('quotation_id', quotationId)
        .order('transaction_date', { ascending: false }),
      this.supabase.client
        .from('refunds')
        .select('amount, is_paid, refund_date')
        .eq('quotation_id', quotationId),
    ]);
    for (const r of [cuotas, abonos, reembolsos]) if (r.error) throw r.error;
    return {
      cuotas: (cuotas.data ?? []) as Cuota[],
      abonos: (abonos.data ?? []) as Abono[],
      reembolsos: (reembolsos.data ?? []) as Reembolso[],
    };
  }

  /** Las cuotas sin pagar de los eventos vivos de la empresa, que vencen
   *  hasta `hasta` (las ya vencidas incluidas). */
  async cuotasPorCobrar(
    companyId: Company['id'],
    hasta: string,
  ): Promise<{ cuotas: CuotaPorCobrar[]; abonos: Abono[] }> {
    const { data, error } = await this.supabase.client
      .from('payments')
      .select(
        `id, payment_number, amount, due_date, status,
         quotations!inner ( id, quotation_number, quotation_status, company_id, event_date, clients ( name ) )`,
      )
      .eq('quotations.company_id', companyId)
      .in('quotations.quotation_status', ['aceptada', 'realizada'])
      .neq('status', 'pagado')
      .lte('due_date', hasta)
      .order('due_date', { ascending: true })
      .limit(300);
    if (error) throw error;
    const cuotas = (data ?? []) as unknown as CuotaPorCobrar[];
    if (cuotas.length === 0) return { cuotas, abonos: [] };
    const { data: abonos, error: e2 } = await this.supabase.client
      .from('payment_transactions')
      .select('payment_id, amount, payment_method, transaction_date')
      .in(
        'payment_id',
        cuotas.map((c) => c.id),
      );
    if (e2) throw e2;
    return { cuotas, abonos: (abonos ?? []) as Abono[] };
  }

  async insumos(companyId: Company['id'], texto: string): Promise<Insumo[]> {
    const { data, error } = await this.supabase.client
      .from('supplies')
      .select('id, name, unit_family, price, suppliers ( name )')
      .eq('company_id', companyId)
      .eq('is_active', true)
      .ilike('name', `%${literal(texto)}%`)
      .order('name', { ascending: true })
      .limit(10);
    if (error) throw error;
    return (data ?? []) as unknown as Insumo[];
  }

  /** En qué productos va cada insumo (la receta) y lo comprado para cada
   *  evento. */
  async usosDeInsumos(
    companyId: Company['id'],
    insumos: number[],
  ): Promise<{ recetas: Receta[]; compras: CompraDeInsumo[] }> {
    if (insumos.length === 0) return { recetas: [], compras: [] };
    const [recetas, compras] = await Promise.all([
      this.supabase.client
        .from('service_recipe_items')
        .select('supply_id, service_type, service_id, qty_per_person, unit')
        .eq('company_id', companyId)
        .in('supply_id', insumos),
      this.supabase.client
        .from('event_supply_provisions')
        .select(
          `supply_id, qty_base, cost, provisioned_at, supplier_name,
           quotations ( id, quotation_number, quotation_status, event_date, clients ( name ) )`,
        )
        .eq('company_id', companyId)
        .in('supply_id', insumos)
        .order('provisioned_at', { ascending: false, nullsFirst: false })
        .limit(40),
    ]);
    if (recetas.error) throw recetas.error;
    if (compras.error) throw compras.error;
    return {
      recetas: (recetas.data ?? []) as Receta[],
      compras: (compras.data ?? []) as unknown as CompraDeInsumo[],
    };
  }

  /** Los nombres de los productos de una receta, variables o fijos. */
  async nombresDeProductos(
    companyId: Company['id'],
    variables: number[],
    fijos: number[],
  ): Promise<{ variables: Map<number, string>; fijos: Map<number, string> }> {
    const leer = async (tabla: string, ids: number[]) => {
      if (ids.length === 0) return new Map<number, string>();
      const { data, error } = await this.supabase.client
        .from(tabla)
        .select('id, name')
        .eq('company_id', companyId)
        .in('id', ids);
      if (error) throw error;
      return new Map(
        ((data ?? []) as Array<{ id: number; name: string }>).map((f) => [
          Number(f.id),
          f.name,
        ]),
      );
    };
    const [v, f] = await Promise.all([
      leer('variable_services', variables),
      leer('fixed_services', fijos),
    ]);
    return { variables: v, fijos: f };
  }

  async proveedores(
    companyId: Company['id'],
    texto: string | undefined,
  ): Promise<{ proveedores: Proveedor[]; insumos: InsumoDeProveedor[] }> {
    let query = this.supabase.client
      .from('suppliers')
      .select('id, name, contact_name, phone, notes')
      .eq('company_id', companyId)
      .eq('is_active', true);
    if (texto) query = query.ilike('name', `%${literal(texto)}%`);
    const { data, error } = await query
      .order('name', { ascending: true })
      .limit(30);
    if (error) throw error;
    const proveedores = (data ?? []) as Proveedor[];
    if (proveedores.length === 0) return { proveedores, insumos: [] };
    const { data: insumos, error: e2 } = await this.supabase.client
      .from('supplies')
      .select('supplier_id, name, unit_family, price')
      .eq('company_id', companyId)
      .eq('is_active', true)
      .in(
        'supplier_id',
        proveedores.map((p) => p.id),
      )
      .order('name', { ascending: true });
    if (e2) throw e2;
    return { proveedores, insumos: (insumos ?? []) as InsumoDeProveedor[] };
  }

  async mobiliario(
    companyId: Company['id'],
    texto: string | undefined,
  ): Promise<Mueble[]> {
    let query = this.supabase.client
      .from('furniture_items')
      .select('name, category, stock')
      .eq('company_id', companyId)
      .eq('is_active', true);
    if (texto) query = query.ilike('name', `%${literal(texto)}%`);
    const { data, error } = await query
      .order('category', { ascending: true })
      .order('name', { ascending: true })
      .limit(80);
    if (error) throw error;
    return (data ?? []) as Mueble[];
  }

  /** El personal de un evento, o el citado un día (de todos los eventos
   *  y del restaurante), con el nombre de la persona y del cargo. */
  async personal(
    companyId: Company['id'],
    por: { quotationId: string } | { dia: string },
  ): Promise<{
    turnos: Turno[];
    personas: Map<number, string>;
    cargos: Map<number, string>;
    eventos: Map<string, FilaDeLista>;
  }> {
    let query = this.supabase.client
      .from('event_staff')
      .select(
        'quotation_id, person_id, day, role_id, kind, starts_at, ends_at, status',
      )
      .eq('company_id', companyId);
    query =
      'quotationId' in por
        ? query.eq('quotation_id', por.quotationId)
        : query.eq('day', por.dia);
    const { data, error } = await query
      .order('day', { ascending: true, nullsFirst: false })
      .order('starts_at', { ascending: true, nullsFirst: false })
      .limit(300);
    if (error) throw error;
    const turnos = (data ?? []) as Turno[];
    const ids = <T>(xs: Array<T | null>) => [
      ...new Set(xs.filter((x): x is T => x != null)),
    ];
    const nombres = async (tabla: string, lista: number[]) => {
      if (lista.length === 0) return new Map<number, string>();
      const { data: filas, error: e } = await this.supabase.client
        .from(tabla)
        .select('id, name')
        .eq('company_id', companyId)
        .in('id', lista);
      if (e) throw e;
      return new Map(
        ((filas ?? []) as Array<{ id: number; name: string }>).map((f) => [
          Number(f.id),
          f.name,
        ]),
      );
    };
    const delEvento = ids(turnos.map((t) => t.quotation_id));
    const [personas, cargos, eventos] = await Promise.all([
      nombres('people', ids(turnos.map((t) => t.person_id))),
      nombres('management_resources', ids(turnos.map((t) => t.role_id))),
      (async () => {
        if (delEvento.length === 0) return new Map<string, FilaDeLista>();
        const { data: qs, error: e } = await this.supabase.client
          .from('quotations')
          .select(`${COLUMNAS_DE_LISTA}, clients ( name )`)
          .eq('company_id', companyId)
          .in('id', delEvento);
        if (e) throw e;
        return new Map(
          ((qs ?? []) as unknown as FilaDeLista[]).map((q) => [q.id, q]),
        );
      })(),
    ]);
    return { turnos, personas, cargos, eventos };
  }

  // ---------- Fase 2: las propuestas (doc 20 §3, regla 3) ----------

  /** Lo que se necesita para cambiar los servicios de una cotización, con
   *  la empresa de la sesión. */
  async cotizacionParaCambiar(
    companyId: Company['id'],
    por: { numero: number } | { id: string },
  ): Promise<CotizacionParaCambiar | null> {
    let query = this.supabase.client
      .from('quotations')
      .select(
        `id, quotation_number, quotation_status, request_type, event_date,
         event_end_date, people_count, children_count, items,
         subtotal_amount, discount_percentage, discount_amount,
         tip_percentage, tip_amount, total_amount, value_per_person,
         fixed_value, clients ( name, client_type )`,
      )
      .eq('company_id', companyId);
    query =
      'numero' in por
        ? query.eq('quotation_number', por.numero)
        : query.eq('id', por.id);
    const { data, error } = await query.maybeSingle();
    if (error) throw error;
    return (data as unknown as CotizacionParaCambiar | null) ?? null;
  }

  /** Cuántos insumos de este evento ya compró Compras. */
  async comprasDelEvento(
    companyId: Company['id'],
    quotationId: string,
  ): Promise<number> {
    const { count, error } = await this.supabase.client
      .from('event_supply_provisions')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', companyId)
      .eq('quotation_id', quotationId);
    if (error) throw error;
    return count ?? 0;
  }

  async crearPropuesta(fila: NuevaPropuesta): Promise<Propuesta> {
    const { data, error } = await this.supabase.client
      .from('asistente_propuestas')
      .insert(fila)
      .select('*')
      .single();
    if (error) throw error;
    return data as Propuesta;
  }

  async propuesta(
    companyId: Company['id'],
    id: string,
  ): Promise<Propuesta | null> {
    const { data, error } = await this.supabase.client
      .from('asistente_propuestas')
      .select('*')
      .eq('company_id', companyId)
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    return (data as Propuesta | null) ?? null;
  }

  /** Cambia la propuesta SOLO si sigue en el estado esperado: es el candado
   *  de dos clics. Devuelve si la tomó. */
  async moverPropuesta(
    companyId: Company['id'],
    id: string,
    desde: EstadoDePropuesta,
    cambios: Partial<Propuesta> & { estado: EstadoDePropuesta },
  ): Promise<boolean> {
    const { data, error } = await this.supabase.client
      .from('asistente_propuestas')
      .update(cambios)
      .eq('company_id', companyId)
      .eq('id', id)
      .eq('estado', desde)
      .select('id');
    if (error) throw error;
    return (data ?? []).length > 0;
  }

  /** Una propuesta nueva reemplaza a las pendientes de la misma persona
   *  sobre la misma cotización. */
  async descartarPendientes(
    companyId: Company['id'],
    quotationId: string,
    usuarioId: string,
  ): Promise<void> {
    const { error } = await this.supabase.client
      .from('asistente_propuestas')
      .update({ estado: 'descartada' })
      .eq('company_id', companyId)
      .eq('quotation_id', quotationId)
      .eq('usuario_id', usuarioId)
      .eq('estado', 'pendiente');
    if (error) throw error;
  }
}

export type EstadoDePropuesta =
  | 'pendiente'
  | 'aplicando'
  | 'aplicada'
  | 'deshaciendo'
  | 'deshecha'
  | 'descartada'
  | 'vencida';

export type NuevaPropuesta = {
  company_id: Company['id'];
  quotation_id: string;
  usuario_id: string;
  usuario_nombre: string | null;
  tipo: 'servicios' | 'nota';
  resumen: string;
  antes: Record<string, unknown>;
  despues: Record<string, unknown>;
  huella_antes: string;
};

export type Propuesta = NuevaPropuesta & {
  id: string;
  estado: EstadoDePropuesta;
  huella_despues: string | null;
  vence_at: string;
  aplicada_at: string | null;
  deshecha_at: string | null;
  created_at: string;
};

export type Cuota = {
  id: string;
  payment_number: number;
  amount: number | string;
  due_date: string | null;
  status: string;
  payment_type: string | null;
  /** Con status pagado y sin abonos: «pagada por fuera» (doc 14). */
  paid_date?: string | null;
};
export type Abono = {
  payment_id: string | null;
  amount: number | string;
  payment_method: string | null;
  transaction_date: string | null;
};
export type Reembolso = {
  amount: number | string;
  is_paid: boolean | null;
  refund_date: string | null;
};
export type CuotaPorCobrar = Omit<Cuota, 'payment_type'> & {
  quotations: {
    id: string;
    quotation_number: number;
    quotation_status: QuotationStatus;
    event_date: string | null;
    clients: { name: string | null } | null;
  };
};
export type Insumo = {
  id: number;
  name: string;
  unit_family: string | null;
  price: number | string | null;
  suppliers: { name: string | null } | null;
};
export type Receta = {
  supply_id: number;
  service_type: string;
  service_id: number;
  qty_per_person: number | string | null;
  unit: string | null;
};
export type CompraDeInsumo = {
  supply_id: number;
  qty_base: number | string | null;
  cost: number | string | null;
  provisioned_at: string | null;
  supplier_name: string | null;
  quotations: {
    id: string;
    quotation_number: number;
    quotation_status: QuotationStatus;
    event_date: string | null;
    clients: { name: string | null } | null;
  } | null;
};
export type Proveedor = {
  id: number;
  name: string;
  contact_name: string | null;
  phone: string | null;
  notes: string | null;
};
export type InsumoDeProveedor = {
  supplier_id: number;
  name: string;
  unit_family: string | null;
  price: number | string | null;
};
export type Mueble = {
  name: string;
  category: string | null;
  stock: number | string | null;
};
export type Turno = {
  quotation_id: string | null;
  person_id: number | null;
  day: string | null;
  role_id: number | null;
  kind: string | null;
  starts_at: string | null;
  ends_at: string | null;
  status: string | null;
};
