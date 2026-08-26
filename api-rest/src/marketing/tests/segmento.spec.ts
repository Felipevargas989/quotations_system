import { resolverSegmento } from '../segmento';

/** Fase 3: audiencias desde los datos de la casa (doc 11). */
describe('resolverSegmento', () => {
  const HOY = '2026-08-25';
  const clientes = [
    {
      id: 1,
      name: 'Municipalidad',
      email: 'muni@quillon.cl',
      client_type: 'Empresas Publicas',
    },
    {
      id: 2,
      name: 'Colegio Alemán',
      email: 'colegio@chillan.cl',
      client_type: 'Colegios & Universidades',
    },
    { id: 3, name: 'CCU', email: 'ccu@ccu.cl', client_type: 'Empresas' },
    { id: 4, name: 'Sin Correo SpA', email: null, client_type: 'Empresas' },
  ];
  const cotizaciones = [
    // Municipalidad: paseo realizado hace ~12 meses, $8M
    {
      client_id: 1,
      quotation_status: 'realizada',
      event_date: '2025-08-20',
      total_amount: 8_000_000,
      event_type: 'Paseo de empresa',
      created_at: '2025-06-01',
    },
    // Colegio: cotización rechazada este año, evento graduación
    {
      client_id: 2,
      quotation_status: 'rechazada',
      event_date: '2026-12-10',
      total_amount: 3_000_000,
      event_type: 'Graduación',
      created_at: '2026-07-01',
    },
    // CCU: aceptada reciente, monto alto
    {
      client_id: 3,
      quotation_status: 'aceptada',
      event_date: '2026-12-06',
      total_amount: 12_000_000,
      event_type: 'Fiesta de fin de año',
      created_at: '2026-08-01',
    },
  ];

  it('sin correo no hay campaña, tenga lo que tenga', () => {
    const r = resolverSegmento(clientes, cotizaciones, [], {}, HOY);
    expect(r.map((d) => d.email)).not.toContain(null);
    expect(r).toHaveLength(3);
  });

  it('aniversario: evento realizado hace 11 a 13 meses', () => {
    const r = resolverSegmento(clientes, cotizaciones, [], { aniversario: true },
      HOY,
    );
    expect(r.map((d) => d.name)).toEqual(['Municipalidad']);
  });

  it('dormidos: sin cotización creada desde una fecha', () => {
    const r = resolverSegmento(clientes, cotizaciones, [], { sin_cotizacion_desde: '2026-01-01' },
      HOY,
    );
    // Colegio (jul-2026) y CCU (ago-2026) cotizaron este año: fuera.
    expect(r.map((d) => d.name)).toEqual(['Municipalidad']);
  });

  it('monto mínimo mira la mayor aceptada/realizada, no las rechazadas', () => {
    const r = resolverSegmento(clientes, cotizaciones, [], { monto_min: 10_000_000 },
      HOY,
    );
    expect(r.map((d) => d.name)).toEqual(['CCU']);
    // La rechazada de $3M del colegio no lo mete aunque el umbral baje:
    const r2 = resolverSegmento(clientes, cotizaciones, [], { monto_min: 1_000_000 },
      HOY,
    );
    expect(r2.map((d) => d.name).sort()).toEqual(['CCU', 'Municipalidad']);
  });

  it('estados con rango de fecha de evento', () => {
    const r = resolverSegmento(clientes, cotizaciones, [], { con_estados: ['rechazada'], evento_desde: '2026-01-01' },
      HOY,
    );
    expect(r.map((d) => d.name)).toEqual(['Colegio Alemán']);
  });

  it('las condiciones se suman (Y), y tipo de evento filtra', () => {
    const r = resolverSegmento(clientes, cotizaciones, [], { tipos_cliente: ['Empresas'], tipos_evento: ['Fiesta de fin de año'] },
      HOY,
    );
    expect(r.map((d) => d.name)).toEqual(['CCU']);
  });

  // LA EXPANSIÓN A PERSONAS (26-08): el filtro decide por el cliente,
  // el correo sale hacia cada uno de sus contactos con correo.
  describe('a personas: uno a cada contacto del cliente', () => {
    const contactos = [
      { client_id: 1, name: 'Sandra Saez', email: 'sandra@quillon.cl' },
      { client_id: 1, name: 'Ruben Valenzuela', email: 'ruben@quillon.cl' },
      { client_id: 1, name: 'Sin Correo', email: null },
      { client_id: 3, name: 'Pedro CCU', email: 'pedro@ccu.cl' },
    ];

    it('cliente con varios contactos: un correo a cada persona, con su nombre', () => {
      const r = resolverSegmento(
        clientes,
        cotizaciones,
        contactos,
        { aniversario: true },
        HOY,
      );
      expect(r).toEqual([
        {
          email: 'sandra@quillon.cl',
          name: 'Sandra Saez',
          empresa: 'Municipalidad',
        },
        {
          email: 'ruben@quillon.cl',
          name: 'Ruben Valenzuela',
          empresa: 'Municipalidad',
        },
      ]);
    });

    it('cliente sin contactos con correo: respaldo al correo de la ficha', () => {
      const r = resolverSegmento(
        clientes,
        cotizaciones,
        contactos,
        { con_estados: ['rechazada'] },
        HOY,
      );
      expect(r).toEqual([
        {
          email: 'colegio@chillan.cl',
          name: 'Colegio Alemán',
          empresa: 'Colegio Alemán',
        },
      ]);
    });

    it('con contactos, la ficha ya no manda: no se duplica el correo del cliente', () => {
      const r = resolverSegmento(
        clientes,
        cotizaciones,
        contactos,
        { monto_min: 10_000_000 },
        HOY,
      );
      expect(r.map((d) => d.email)).toEqual(['pedro@ccu.cl']);
    });
  });
});
