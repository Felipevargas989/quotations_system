import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { SupabaseService } from 'src/supabase/supabase.service';

// LO QUE LA EMPRESA YA TIENE EN EVENTIA, para "¿Puedo cumplir?" y para los
// documentos (Felipe, 17-10: "saca las cosas desde Eventia... ¿y qué pasa
// si lo que están pidiendo no está en Eventia?"). Lee tablas de otros
// módulos —la carta (mapa 05) y las cotizaciones (mapa 01)— sin escribir
// nada, sin precios de la carta y siempre de UNA empresa.

export type CartaDeEventia = {
  /** Los fijos activos con su sección: salones, audiovisual, decoración. */
  fijos: Array<{ nombre: string; seccion: string | null }>;
  /** Los menús guardados con sus platos. */
  menus: Array<{ categoria: string; nombre: string; platos: string[] }>;
  paquetes: string[];
};

export type EventoDeEventia = {
  numero: number;
  tipo: string | null;
  fecha: string | null;
  personas: number | null;
  monto: number | null;
  cliente: string | null;
  /** Lo fijo que llevó: el salón, sobre todo. */
  fijos: string[];
};

type FilaDeCotizacion = {
  quotation_number: number;
  event_type: string | null;
  event_date: string | null;
  people_count: number | null;
  total_amount: number | null;
  items: { fixed_services?: Array<{ nombre?: string }> } | null;
  cliente: { name: string | null } | null;
};

const COLUMNAS_DE_EVENTO =
  'quotation_number, event_type, event_date, people_count, total_amount, items, cliente:clients(name)';

const aEvento = (q: FilaDeCotizacion): EventoDeEventia => ({
  numero: q.quotation_number,
  tipo: q.event_type,
  fecha: q.event_date ? q.event_date.slice(0, 10) : null,
  personas: q.people_count,
  monto: q.total_amount,
  cliente: q.cliente?.name ?? null,
  fijos: (q.items?.fixed_services ?? [])
    .map((f) => f.nombre?.trim())
    .filter((n): n is string => Boolean(n)),
});

@Injectable()
export class EventiaRepository {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(EventiaRepository.name);
  }

  private get db() {
    return this.supabase.client;
  }

  /** La carta, sin precios: fijos activos, menús guardados con sus platos
   *  y nombres de paquetes. */
  async carta(companyId: number): Promise<CartaDeEventia> {
    const [fijos, menus, paquetes] = await Promise.all([
      this.db
        .from('fixed_services')
        .select('name, seccion:fixed_service_sections(name)')
        .eq('company_id', companyId)
        .eq('is_active', true)
        .limit(300),
      this.db
        .from('service_groups')
        .select(
          'name, category, items:service_group_items(quantity, servicio:variable_services(name))',
        )
        .eq('company_id', companyId)
        .limit(300),
      this.db
        .from('service_group_collections')
        .select('name')
        .eq('company_id', companyId)
        .limit(200),
    ]);
    if (fijos.error) throw fijos.error;
    if (menus.error) throw menus.error;
    if (paquetes.error) throw paquetes.error;
    return {
      fijos: (
        (fijos.data ?? []) as unknown as Array<{
          name: string;
          seccion: { name: string | null } | null;
        }>
      ).map((f) => ({ nombre: f.name, seccion: f.seccion?.name ?? null })),
      menus: (
        (menus.data ?? []) as unknown as Array<{
          name: string;
          category: string;
          items: Array<{ servicio: { name: string | null } | null }>;
        }>
      ).map((m) => ({
        categoria: m.category,
        nombre: m.name,
        platos: (m.items ?? [])
          .map((i) => i.servicio?.name?.trim())
          .filter((n): n is string => Boolean(n)),
      })),
      paquetes: ((paquetes.data ?? []) as Array<{ name: string | null }>)
        .map((p) => p.name?.trim())
        .filter((n): n is string => Boolean(n)),
    };
  }

  /** Los eventos realizados desde una fecha (AAAA-MM-DD), del más nuevo al
   *  más viejo: la experiencia de verdad de la empresa. */
  async eventosRealizados(
    companyId: number,
    desde: string,
    limite = 200,
  ): Promise<EventoDeEventia[]> {
    const { data, error } = await this.db
      .from('quotations')
      .select(COLUMNAS_DE_EVENTO)
      .eq('company_id', companyId)
      .eq('quotation_status', 'realizada')
      .gte('event_date', desde)
      .order('event_date', { ascending: false })
      .limit(limite);
    if (error) throw error;
    return ((data ?? []) as unknown as FilaDeCotizacion[]).map(aEvento);
  }

  /** Lo confirmado (aceptado) que cae ese día (AAAA-MM-DD), también los
   *  eventos de varios días que lo cruzan. Las fechas de evento se guardan
   *  a medianoche UTC. */
  async agendaDelDia(
    companyId: number,
    fecha: string,
  ): Promise<EventoDeEventia[]> {
    const inicio = `${fecha}T00:00:00.000Z`;
    const fin = `${fecha}T23:59:59.999Z`;
    const { data, error } = await this.db
      .from('quotations')
      .select(COLUMNAS_DE_EVENTO)
      .eq('company_id', companyId)
      .eq('quotation_status', 'aceptada')
      .lte('event_date', fin)
      .or(
        `event_end_date.gte."${inicio}",and(event_end_date.is.null,event_date.gte."${inicio}")`,
      )
      .limit(50);
    if (error) throw error;
    return ((data ?? []) as unknown as FilaDeCotizacion[]).map(aEvento);
  }
}
