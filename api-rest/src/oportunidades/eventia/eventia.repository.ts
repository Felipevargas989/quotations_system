import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { BUCKET_PRIVADO } from 'src/storage/storage.service';
import { SupabaseService } from 'src/supabase/supabase.service';

// LO QUE LA EMPRESA YA TIENE EN EVENTIA, para "¿Puedo cumplir?" y para los
// documentos (Felipe, 17-10: "saca las cosas desde Eventia... ¿y qué pasa
// si lo que están pidiendo no está en Eventia?"). Lee tablas de otros
// módulos —la carta (mapa 05) y las cotizaciones (mapa 01), y desde el
// 19-10 las facturas y órdenes de compra de sus eventos— sin escribir
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

/** Un evento ya hecho con sus facturas y órdenes de compra (decisión 45):
 *  de ahí salen los respaldos de experiencia que faltan en «Mi empresa». */
export type DocumentosDeUnEvento = {
  numero: number;
  fecha: string | null;
  cliente: string | null;
  documentos: Array<{
    id: number;
    categoria: 'facturas' | 'ordenes_compra';
    nombre: string;
    ruta: string;
  }>;
};

type FilaDeDocumento = {
  id: number;
  category: string;
  file_name: string;
  file_url: string;
  quotations: {
    quotation_number: number;
    event_date: string | null;
    clients: { name: string | null } | null;
  } | null;
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

  /** Las facturas y órdenes de compra de los eventos ya hechos (decisión
   *  45, 19-10): aceptados o realizados, del día anterior a `antesDe`
   *  (AAAA-MM-DD) hacia atrás, el más nuevo primero. La tabla de documentos
   *  no tiene empresa: la da su cotización (`!inner`). Solo las rutas de la
   *  empresa (`c<empresa>/event-documents/...`). */
  async documentosDeExperiencia(
    companyId: number,
    antesDe: string,
  ): Promise<DocumentosDeUnEvento[]> {
    const { data, error } = await this.db
      .from('event_documents')
      .select(
        'id, category, file_name, file_url, quotations!inner(quotation_number, event_date, quotation_status, company_id, clients(name))',
      )
      .in('category', ['facturas', 'ordenes_compra'])
      .eq('quotations.company_id', companyId)
      .in('quotations.quotation_status', ['aceptada', 'realizada'])
      .lt('quotations.event_date', `${antesDe}T00:00:00.000Z`)
      .order('id', { ascending: true })
      .limit(1000);
    if (error) throw error;
    const porEvento = new Map<number, DocumentosDeUnEvento>();
    for (const f of (data ?? []) as unknown as FilaDeDocumento[]) {
      const q = f.quotations;
      if (!q || !f.file_url.startsWith(`c${companyId}/event-documents/`)) {
        continue;
      }
      const evento = porEvento.get(q.quotation_number) ?? {
        numero: q.quotation_number,
        fecha: q.event_date ? q.event_date.slice(0, 10) : null,
        cliente: q.clients?.name?.trim() || null,
        documentos: [],
      };
      evento.documentos.push({
        id: f.id,
        categoria:
          f.category === 'ordenes_compra' ? 'ordenes_compra' : 'facturas',
        nombre: f.file_name,
        ruta: f.file_url,
      });
      porEvento.set(q.quotation_number, evento);
    }
    return [...porEvento.values()].sort((a, b) =>
      (b.fecha ?? '').localeCompare(a.fecha ?? ''),
    );
  }

  /** Una factura u orden de compra de un evento, del balde privado; solo
   *  de la empresa. */
  async descargarDocumento(companyId: number, ruta: string): Promise<Buffer> {
    if (!ruta.startsWith(`c${companyId}/event-documents/`)) {
      throw new Error('Ese documento no es de la empresa.');
    }
    const { data, error } = await this.db.storage
      .from(BUCKET_PRIVADO)
      .download(ruta);
    if (error || !data) throw error ?? new Error(`sin datos: ${ruta}`);
    return Buffer.from(await data.arrayBuffer());
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
