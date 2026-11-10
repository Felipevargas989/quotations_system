import type { TiposQueTrabaja } from 'src/auth/permisos';
import {
  analisisPorTipos,
  firmaDeTipos,
  type CotizacionDelAnalisis,
  type ServiciosDelAnalisis,
} from '../analisis-por-tipos';

// LA SECCIÓN ANÁLISIS SIN LOS CLIENTES DE UN TIPO APAGADO (doc 22 §9.8):
// las mismas nueve cuentas de la base, sobre lo que ve el cargo.

const sinEmpresas: TiposQueTrabaja = {
  prendidos: new Set(['particulares', 'club adulto mayor']),
  conocidos: new Set(['particulares', 'club adulto mayor', 'empresas']),
  sinTipo: true,
};

const cliente = (id: string, tipo: string) => ({
  id,
  name: `Cliente ${id}`,
  client_type: tipo,
});

const cot = (
  estado: string,
  tipo: string,
  total: number,
  c = cliente(tipo, tipo),
  evento = 'Matrimonio',
  creada = '2026-03-10T15:00:00+00:00',
): CotizacionDelAnalisis => ({
  quotation_status: estado,
  event_type: evento,
  total_amount: total,
  created_at: creada,
  clients: c,
});

describe('analisisPorTipos', () => {
  const cotizaciones = [
    cot('aceptada', 'Particulares', 1_000_000, cliente('p1', 'Particulares')),
    cot('realizada', 'Particulares', 3_000_000, cliente('p1', 'Particulares')),
    cot(
      'enviada',
      'Club Adulto Mayor',
      500_000,
      cliente('c1', 'Club Adulto Mayor'),
    ),
    cot('aceptada', 'Empresas', 9_000_000, cliente('e1', 'Empresas')),
    cot('rechazada', 'Empresas', 2_000_000, cliente('e1', 'Empresas')),
    // Fuera del período.
    cot(
      'aceptada',
      'Particulares',
      7_000_000,
      cliente('p2', 'Particulares'),
      'Graduación',
      '2025-12-31T23:00:00+00:00',
    ),
  ];
  const servicios: ServiciosDelAnalisis[] = [
    {
      created_at: '2026-03-10T15:00:00+00:00',
      clients: { client_type: 'Particulares' },
      items: {
        variable_services: [
          { items: [{ nombre: 'Asado' }, { nombre: 'Torta' }] },
        ],
        fixed_services: [{ nombre: 'Salón' }],
      },
    },
    {
      created_at: '2026-03-11T15:00:00+00:00',
      clients: { client_type: 'Empresas' },
      items: { variable_services: [{ items: [{ nombre: 'Asado' }] }] },
    },
  ];
  const r = analisisPorTipos(
    sinEmpresas,
    cotizaciones,
    servicios,
    '2026-01-01',
    '2026-12-31',
  );

  it('los clientes de un tipo apagado no cuentan en ningún número', () => {
    expect(r.quotation_status_stats).toEqual([
      { quotation_status: 'aceptada', total: 1, percentage: 33.33 },
      { quotation_status: 'realizada', total: 1, percentage: 33.33 },
      { quotation_status: 'enviada', total: 1, percentage: 33.33 },
    ]);
    expect(r.revenue_by_client_type).toEqual([
      {
        client_type: 'Particulares',
        total_quotations: 2,
        total_revenue: 4_000_000,
        revenue_percentage: 100,
      },
    ]);
    expect(r.top_clients_by_revenue.map((c) => c.client_id)).toEqual(['p1']);
    expect(r.recurring_clients).toEqual([
      {
        client_id: 'p1',
        client_name: 'Cliente p1',
        client_type: 'Particulares',
        won_events: 2,
        total_revenue: 4_000_000,
      },
    ]);
  });

  it('la conversión y los ingresos por tipo de evento, como la base', () => {
    expect(r.event_type_conversion_stats).toEqual([
      {
        event_type: 'Matrimonio',
        total_quotations: 3,
        accepted_quotations: 2,
        conversion_rate_percentage: 66.67,
      },
    ]);
    expect(r.event_type_revenue_stats).toEqual([
      {
        event_type: 'Matrimonio',
        total_events: 2,
        total_revenue: 4_000_000,
        revenue_percentage: 100,
      },
    ]);
    expect(r.top_clients_by_quotations[0]).toMatchObject({
      client_id: 'p1',
      total_quotations: 2,
      won_quotations: 2,
      conversion_rate: 100,
    });
  });

  it('los servicios más usados, sin los de los clientes que no ve', () => {
    expect(r.variable_services_usage).toEqual([
      { service_name: 'Asado', usage_count: 1 },
      { service_name: 'Torta', usage_count: 1 },
    ]);
    expect(r.fixed_services_usage).toEqual([
      { service_name: 'Salón', usage_count: 1 },
    ]);
  });

  it('la memoria del panel separa a quien no trabaja todos los tipos', () => {
    expect(firmaDeTipos(null)).toBe('');
    expect(firmaDeTipos(sinEmpresas)).toBe(
      ':tipos=club adulto mayor,particulares+sin',
    );
  });
});
