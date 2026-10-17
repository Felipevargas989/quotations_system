import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { SupabaseService } from 'src/supabase/supabase.service';
import type {
  Catalogo,
  CategoriaDelCatalogo,
  MenuDelCatalogo,
  Paquete,
  Servicio,
} from './catalogo';
import type { CotizacionVendida } from './historia';

// LO QUE EL BOTÓN «CREAR CON IA» LEE DE LA BASE (doc 16, sección 6): el
// requerimiento, el catálogo de la empresa y sus cotizaciones vendidas.
// Todo filtrado por empresa: la llave de servicio salta el RLS.

export type FilaDelRequerimiento = {
  id: string;
  company_id: number;
  quotation_number: number;
  quotation_status: string;
  request_type: string;
  event_type: string | null;
  event_date: string | null;
  event_end_date: string | null;
  people_count: number | null;
  children_count: number | null;
  observations: string | null;
  comentario_interno: string | null;
  total_amount: number | null;
  items: {
    variable_services?: unknown[] | null;
    fixed_services?: unknown[] | null;
  } | null;
  client_id: string | null;
  clients: { name: string | null; client_type: string | null } | null;
};

const ESTADOS_VENDIDOS = ['aceptada', 'realizada'];

@Injectable()
export class GenerarRepository {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(GenerarRepository.name);
  }

  /** Recorre por páginas: la base entrega de a 1.000 filas como máximo. */
  private async todas<T>(
    consulta: (
      desde: number,
      hasta: number,
    ) => PromiseLike<{ data: unknown; error: unknown }>,
  ): Promise<T[]> {
    const PAGINA = 1000;
    const filas: T[] = [];
    for (let desde = 0; ; desde += PAGINA) {
      const { data, error } = await consulta(desde, desde + PAGINA - 1);
      if (error) throw new Error((error as { message?: string }).message);
      const lote = (data ?? []) as T[];
      filas.push(...lote);
      if (lote.length < PAGINA) break;
    }
    return filas;
  }

  async requerimiento(
    id: string,
    companyId: number,
  ): Promise<FilaDelRequerimiento | null> {
    const { data, error } = await this.supabase.client
      .from('quotations')
      .select(
        'id, company_id, quotation_number, quotation_status, request_type, ' +
          'event_type, event_date, event_end_date, people_count, children_count, ' +
          'observations, comentario_interno, total_amount, items, client_id, ' +
          'clients(name, client_type)',
      )
      .eq('id', id)
      .eq('company_id', companyId)
      .maybeSingle();
    if (error) throw error;
    return data as FilaDelRequerimiento | null;
  }

  async catalogo(companyId: number): Promise<Catalogo> {
    const db = this.supabase.client;
    const [
      categorias,
      secciones,
      vinculos,
      servicios,
      fijos,
      menus,
      gruposDeMenu,
      paquetes,
      gruposDePaquete,
    ] = await Promise.all([
      this.todas<{ id: number; name: string; sort_order: number | null }>(
        (d, h) =>
          db
            .from('service_categories')
            .select('id, name, sort_order')
            .eq('company_id', companyId)
            .or('is_active.is.null,is_active.eq.true')
            .order('id')
            .range(d, h),
      ),
      this.todas<{ id: number; category_id: number }>((d, h) =>
        db
          .from('category_sections')
          .select('id, category_id')
          .eq('company_id', companyId)
          .eq('is_default', true)
          .order('id')
          .range(d, h),
      ),
      this.todas<{
        variable_service_id: number;
        category_id: number;
        section_id: number | null;
        sort_order: number | null;
      }>((d, h) =>
        db
          .from('variable_service_categories')
          .select('variable_service_id, category_id, section_id, sort_order')
          .eq('company_id', companyId)
          .order('id')
          .range(d, h),
      ),
      this.todas<{ id: number; name: string; price: number | null }>((d, h) =>
        db
          .from('variable_services')
          .select('id, name, price')
          .eq('company_id', companyId)
          .or('is_active.is.null,is_active.eq.true')
          .order('id')
          .range(d, h),
      ),
      this.todas<{ id: number; name: string; price: number | null }>((d, h) =>
        db
          .from('fixed_services')
          .select('id, name, price')
          .eq('company_id', companyId)
          .eq('calculation_type', 'fijo')
          .or('is_active.is.null,is_active.eq.true')
          .order('sort_order', { ascending: true, nullsFirst: false })
          .order('id')
          .range(d, h),
      ),
      this.todas<{
        id: number;
        name: string;
        category: string;
        menu_group_id: number | null;
      }>((d, h) =>
        db
          .from('service_groups')
          .select('id, name, category, menu_group_id')
          .eq('company_id', companyId)
          .order('id')
          .range(d, h),
      ),
      this.todas<{ id: number; name: string; sort_order: number | null }>(
        (d, h) =>
          db
            .from('menu_groups')
            .select('id, name, sort_order')
            .eq('company_id', companyId)
            .order('id')
            .range(d, h),
      ),
      this.todas<{ id: number; name: string; package_group_id: number | null }>(
        (d, h) =>
          db
            .from('service_group_collections')
            .select('id, name, package_group_id')
            .eq('company_id', companyId)
            .order('id')
            .range(d, h),
      ),
      this.todas<{ id: number; name: string; sort_order: number | null }>(
        (d, h) =>
          db
            .from('package_groups')
            .select('id, name, sort_order')
            .eq('company_id', companyId)
            .order('id')
            .range(d, h),
      ),
    ]);

    const idsDeMenus = menus.map((m) => m.id);
    const idsDePaquetes = paquetes.map((p) => p.id);
    const [itemsDeMenus, menusDePaquetes, sueltosDePaquetes, fijosDePaquetes] =
      await Promise.all([
        idsDeMenus.length
          ? this.todas<{
              group_id: number;
              variable_service_id: number;
              quantity: number | null;
            }>((d, h) =>
              db
                .from('service_group_items')
                .select('group_id, variable_service_id, quantity')
                .in('group_id', idsDeMenus)
                .order('id')
                .range(d, h),
            )
          : Promise.resolve([]),
        idsDePaquetes.length
          ? this.todas<{ collection_id: number; service_group_id: number }>(
              (d, h) =>
                db
                  .from('service_group_collection_items')
                  .select('collection_id, service_group_id')
                  .in('collection_id', idsDePaquetes)
                  .order('id')
                  .range(d, h),
            )
          : Promise.resolve([]),
        idsDePaquetes.length
          ? this.todas<{
              collection_id: number;
              variable_service_id: number;
              quantity: number | null;
            }>((d, h) =>
              db
                .from('service_group_collection_services')
                .select('collection_id, variable_service_id, quantity')
                .in('collection_id', idsDePaquetes)
                .order('id')
                .range(d, h),
            )
          : Promise.resolve([]),
        idsDePaquetes.length
          ? this.todas<{
              collection_id: number;
              fixed_service_id: number;
              quantity: number | null;
            }>((d, h) =>
              db
                .from('service_group_collection_fixed_services')
                .select('collection_id, fixed_service_id, quantity')
                .in('collection_id', idsDePaquetes)
                .order('id')
                .range(d, h),
            )
          : Promise.resolve([]),
      ]);

    const mapaServicios = new Map<number, Servicio>(
      servicios.map((s) => [
        Number(s.id),
        { id: Number(s.id), nombre: s.name, precio: Number(s.price) || 0 },
      ]),
    );
    const mapaFijos = new Map<number, Servicio>(
      fijos.map((f) => [
        Number(f.id),
        { id: Number(f.id), nombre: f.name, precio: Number(f.price) || 0 },
      ]),
    );

    const seccionFijaDe = new Map(
      secciones.map((s) => [Number(s.category_id), Number(s.id)]),
    );
    const listaDeCategorias: CategoriaDelCatalogo[] = categorias.map((c) => {
      const id = Number(c.id);
      const propios = vinculos
        .filter((v) => Number(v.category_id) === id)
        .sort(
          (a, b) =>
            (a.sort_order ?? Number.MAX_SAFE_INTEGER) -
            (b.sort_order ?? Number.MAX_SAFE_INTEGER),
        );
      const fija = seccionFijaDe.get(id);
      return {
        id,
        nombre: c.name,
        orden: c.sort_order ?? Number.MAX_SAFE_INTEGER,
        sueltos: propios
          .map((v) => Number(v.variable_service_id))
          .filter((sid) => mapaServicios.has(sid)),
        seccionFija:
          fija == null
            ? []
            : propios
                .filter((v) => Number(v.section_id) === fija)
                .map((v) => Number(v.variable_service_id))
                .filter((sid) => mapaServicios.has(sid)),
      };
    });

    const grupoDeMenu = new Map(gruposDeMenu.map((g) => [Number(g.id), g]));
    const listaDeMenus: MenuDelCatalogo[] = menus.map((m) => {
      const grupo =
        m.menu_group_id == null
          ? null
          : grupoDeMenu.get(Number(m.menu_group_id));
      return {
        id: Number(m.id),
        nombre: m.name,
        categoria: m.category,
        nivel: grupo?.name ?? 'Otros',
        ordenNivel: grupo?.sort_order ?? Number.MAX_SAFE_INTEGER,
        items: itemsDeMenus
          .filter((i) => Number(i.group_id) === Number(m.id))
          .map((i) => {
            const s = mapaServicios.get(Number(i.variable_service_id));
            return {
              id: Number(i.variable_service_id),
              nombre: s?.nombre ?? `#${i.variable_service_id}`,
              precio: s?.precio ?? 0,
              cantidad: Number(i.quantity) || 1,
            };
          }),
      };
    });

    const grupoDePaquete = new Map(
      gruposDePaquete.map((g) => [Number(g.id), g]),
    );
    const listaDePaquetes: Paquete[] = paquetes.map((p) => {
      const grupo =
        p.package_group_id == null
          ? null
          : grupoDePaquete.get(Number(p.package_group_id));
      const id = Number(p.id);
      return {
        id,
        nombre: p.name,
        grupo: grupo?.name ?? 'Otros',
        ordenGrupo: grupo?.sort_order ?? Number.MAX_SAFE_INTEGER,
        menus: menusDePaquetes
          .filter((x) => Number(x.collection_id) === id)
          .map((x) => Number(x.service_group_id)),
        sueltos: sueltosDePaquetes
          .filter((x) => Number(x.collection_id) === id)
          .map((x) => ({
            id: Number(x.variable_service_id),
            cantidad: Number(x.quantity) || 1,
          })),
        fijos: fijosDePaquetes
          .filter((x) => Number(x.collection_id) === id)
          .map((x) => ({
            id: Number(x.fixed_service_id),
            cantidad: Number(x.quantity) || 1,
          })),
      };
    });

    return {
      categorias: listaDeCategorias,
      menus: listaDeMenus,
      servicios: mapaServicios,
      fijos: mapaFijos,
      paquetes: listaDePaquetes,
    };
  }

  /**
   * Cotizaciones vendidas (aceptadas y realizadas) de la empresa: las de un
   * tipo de evento, las de un cliente, o todas, desde una fecha. Las más
   * recientes primero.
   */
  async vendidas(
    companyId: number,
    filtro: { tipo?: string; clienteId?: string; desde?: string },
    limite = 200,
  ): Promise<CotizacionVendida[]> {
    let q = this.supabase.client
      .from('quotations')
      .select(
        'quotation_number, event_type, event_date, event_end_date, people_count, children_count, total_amount, items',
      )
      .eq('company_id', companyId)
      .eq('request_type', 'cotizacion')
      .in('quotation_status', ESTADOS_VENDIDOS);
    if (filtro.tipo) q = q.eq('event_type', filtro.tipo);
    if (filtro.clienteId) q = q.eq('client_id', filtro.clienteId);
    if (filtro.desde) q = q.gte('event_date', filtro.desde);
    const { data, error } = await q
      .order('event_date', { ascending: false })
      .limit(limite);
    if (error) throw error;
    return (data ?? []).map((v) => ({
      numero: Number(v.quotation_number),
      tipo: v.event_type ?? '',
      fecha: String(v.event_date ?? '').slice(0, 10),
      fin: v.event_end_date ? String(v.event_end_date).slice(0, 10) : null,
      personas: Number(v.people_count) || 0,
      ninos: Number(v.children_count) || 0,
      total: Number(v.total_amount) || 0,
      items: (v.items ?? null) as CotizacionVendida['items'],
    }));
  }
}
