import { trabajaElTipo, type TiposQueTrabaja } from 'src/auth/permisos';

// LA SECCIÓN ANÁLISIS DEL DASHBOARD PARA UN CARGO CON UN TIPO DE CLIENTE
// APAGADO (doc 22 §9.8, tanda 4; Felipe, 05-11-2026: los clientes de ese
// tipo "no aparecen ni cuentan en sus números").
//
// Las nueve cuentas de siempre las hace la base para toda la empresa
// (`get_quotation_status_stats` y las demás, en Supabase). Para un cargo
// que no trabaja todos los tipos se hacen acá, con las mismas reglas, sobre
// las cotizaciones que ve. Quien trabaja todos los tipos sigue con las de
// la base: sus números no cambian.

/** Lo justo de una cotización para las nueve cuentas. */
export type CotizacionDelAnalisis = {
  quotation_status: string;
  event_type: string | null;
  total_amount: number | string | null;
  created_at: string;
  clients: {
    id: string;
    name: string | null;
    client_type: string | null;
  } | null;
};

/** Los servicios de una cotización ganada, para contar los más usados. */
export type ServiciosDelAnalisis = {
  created_at: string;
  clients: { client_type: string | null } | null;
  items: {
    variable_services?: unknown;
    fixed_services?: unknown;
  } | null;
};

const GANADAS = new Set(['aceptada', 'realizada']);

const ganada = (q: { quotation_status: string }) =>
  GANADAS.has(q.quotation_status);

const plata = (v: number | string | null): number => Number(v ?? 0) || 0;

/** ROUND de la base, sin el error de los decimales binarios. */
const redondear = (x: number, decimales: number): number => {
  const f = 10 ** decimales;
  return Math.round((x + Number.EPSILON) * f) / f;
};

/** El día de una fecha de la base, en UTC, como `created_at::date`. */
const dia = (iso: string): string => iso.slice(0, 10);

const agrupar = <T, K>(filas: T[], clave: (f: T) => K): Map<K, T[]> => {
  const grupos = new Map<K, T[]>();
  for (const f of filas) {
    const k = clave(f);
    grupos.set(k, [...(grupos.get(k) ?? []), f]);
  }
  return grupos;
};

const porcentaje = (parte: number, todo: number, decimales = 2) =>
  todo ? redondear((parte * 100) / todo, decimales) : null;

/** Los nombres de una lista de servicios, como `item->>'nombre'`. */
const nombres = (lista: unknown): (string | null)[] =>
  Array.isArray(lista)
    ? lista.map((x) => {
        const n = (x as { nombre?: unknown } | null)?.nombre;
        return typeof n === 'string' || typeof n === 'number'
          ? String(n)
          : null;
      })
    : [];

const losMasUsados = (usos: (string | null)[]) =>
  [...agrupar(usos, (n) => n)]
    .map(([service_name, l]) => ({ service_name, usage_count: l.length }))
    .sort((a, b) => b.usage_count - a.usage_count)
    .slice(0, 10);

/**
 * Las nueve cuentas, sobre las cotizaciones que ve el cargo. `desde` y
 * `hasta` son días (AAAA-MM-DD), como los recibe la base. Las cotizaciones
 * ya vienen del período (`created_at::date` entre los dos); los servicios,
 * del suyo (`created_at` entre las medianoches de los dos días, como en la
 * base).
 */
export const analisisPorTipos = (
  tipos: TiposQueTrabaja,
  cotizaciones: CotizacionDelAnalisis[],
  servicios: ServiciosDelAnalisis[],
  desde: string,
  hasta: string,
) => {
  const loVe = (q: { clients: { client_type: string | null } | null }) =>
    trabajaElTipo(tipos, q.clients?.client_type);
  const delPeriodo = cotizaciones.filter(
    (q) => dia(q.created_at) >= desde && dia(q.created_at) <= hasta && loVe(q),
  );
  const ganadas = delPeriodo.filter(ganada);
  const conCliente = <T extends { clients: unknown }>(l: T[]) =>
    l.filter((q) => q.clients != null);

  const total = delPeriodo.length;
  const quotation_status_stats = [
    ...agrupar(delPeriodo, (q) => q.quotation_status),
  ]
    .map(([quotation_status, l]) => ({
      quotation_status,
      total: l.length,
      percentage: porcentaje(l.length, total),
    }))
    .sort((a, b) => b.total - a.total);

  const event_type_conversion_stats = [
    ...agrupar(delPeriodo, (q) => q.event_type),
  ]
    .map(([event_type, l]) => {
      const accepted = l.filter(ganada).length;
      return {
        event_type,
        total_quotations: l.length,
        accepted_quotations: accepted,
        conversion_rate_percentage: porcentaje(accepted, l.length),
      };
    })
    .sort(
      (a, b) =>
        (b.conversion_rate_percentage ?? 0) -
        (a.conversion_rate_percentage ?? 0),
    );

  const ventas = ganadas.reduce((s, q) => s + plata(q.total_amount), 0);
  const event_type_revenue_stats = [...agrupar(ganadas, (q) => q.event_type)]
    .map(([event_type, l]) => {
      const revenue = l.reduce((s, q) => s + plata(q.total_amount), 0);
      return {
        event_type,
        total_events: l.length,
        total_revenue: revenue,
        revenue_percentage: porcentaje(revenue, ventas),
      };
    })
    .sort((a, b) => b.total_revenue - a.total_revenue);

  const ganadasConCliente = conCliente(ganadas);
  const ventasConCliente = ganadasConCliente.reduce(
    (s, q) => s + plata(q.total_amount),
    0,
  );
  const revenue_by_client_type = [
    ...agrupar(ganadasConCliente, (q) => q.clients!.client_type),
  ]
    .map(([client_type, l]) => {
      const revenue = l.reduce((s, q) => s + plata(q.total_amount), 0);
      return {
        client_type,
        total_quotations: l.length,
        total_revenue: revenue,
        revenue_percentage: porcentaje(revenue, ventasConCliente),
      };
    })
    .sort((a, b) => b.total_revenue - a.total_revenue);

  const porCliente = (l: CotizacionDelAnalisis[]) =>
    [...agrupar(conCliente(l), (q) => q.clients!.id)].map(([client_id, g]) => ({
      client_id,
      client_name: g[0].clients!.name,
      client_type: g[0].clients!.client_type,
      filas: g,
    }));

  const top_clients_by_revenue = porCliente(ganadas)
    .map(({ filas, ...c }) => ({
      ...c,
      total_revenue: filas.reduce((s, q) => s + plata(q.total_amount), 0),
    }))
    .sort((a, b) => b.total_revenue - a.total_revenue)
    .slice(0, 10);

  const top_clients_by_quotations = porCliente(delPeriodo)
    .map(({ filas, ...c }) => {
      const won = filas.filter(ganada).length;
      return {
        ...c,
        total_quotations: filas.length,
        won_quotations: won,
        conversion_rate: porcentaje(won, filas.length, 1),
      };
    })
    .sort((a, b) => b.total_quotations - a.total_quotations)
    .slice(0, 10);

  const recurring_clients = porCliente(ganadas)
    .map(({ filas, ...c }) => ({
      ...c,
      won_events: filas.length,
      total_revenue: filas.reduce((s, q) => s + plata(q.total_amount), 0),
    }))
    .filter((c) => c.won_events >= 2)
    .sort(
      (a, b) =>
        b.won_events - a.won_events || b.total_revenue - a.total_revenue,
    )
    .slice(0, 10);

  const desdeMs = Date.parse(`${desde}T00:00:00Z`);
  const hastaMs = Date.parse(`${hasta}T00:00:00Z`);
  const conServicios = servicios.filter((q) => {
    const t = Date.parse(q.created_at);
    return t >= desdeMs && t <= hastaMs && loVe(q);
  });
  const variable_services_usage = losMasUsados(
    conServicios.flatMap((q) =>
      Array.isArray(q.items?.variable_services)
        ? (q.items.variable_services as unknown[]).flatMap((g) =>
            nombres((g as { items?: unknown } | null)?.items),
          )
        : [],
    ),
  );
  const fixed_services_usage = losMasUsados(
    conServicios.flatMap((q) => nombres(q.items?.fixed_services)),
  );

  return {
    quotation_status_stats,
    event_type_conversion_stats,
    event_type_revenue_stats,
    revenue_by_client_type,
    top_clients_by_revenue,
    variable_services_usage,
    fixed_services_usage,
    top_clients_by_quotations,
    recurring_clients,
  };
};

/** Para la memoria del panel: los tipos que trabaja el cargo, en una
 *  clave. Un cargo que trabaja todos, sin clave (la de siempre). */
export const firmaDeTipos = (tipos: TiposQueTrabaja): string =>
  tipos
    ? `:tipos=${[...tipos.prendidos].sort().join(',')}${tipos.sinTipo ? '+sin' : ''}`
    : '';
