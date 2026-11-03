import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { Company } from 'src/companies/entities/company.entity';
import {
  QuotationStatus,
  RequestType,
} from 'src/quotations/constants/constants';
import { SupabaseService } from 'src/supabase/supabase.service';

// LO QUE EVIA LEE DE LA BASE (doc 20 §9). Solo lectura, salvo la cuenta
// del mes. Toda consulta filtra por la empresa de la SESIÓN, que llega
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
}
