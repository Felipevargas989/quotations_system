import { laCotizacionVinculadaEnTexto } from '../postulacion/la-cotizacion-vinculada';
import type { CotizacionDeLaPostulacion } from '../postulacion/postulacion.repository';

// LA COTIZACIÓN VINCULADA EN TEXTO PARA LA IA DE LA OFERTA (decisión 119,
// 07-11): día por día, con los ids del catálogo y sin precios. Como la
// N° 574 de la 2705-1740-COT26 (Universidad del Bío-Bío).

const LA_574: CotizacionDeLaPostulacion = {
  id: 'd5dee709',
  quotation_number: 574,
  quotation_status: 'aceptada',
  people_count: 20,
  children_count: null,
  event_date: '2026-11-11T00:00:00+00:00',
  event_end_date: '2026-11-12T00:00:00+00:00',
  subtotal_amount: 1_788_000,
  discount_amount: 8_000,
  total_amount: 1_780_000,
  client: { name: 'Universidad del Bío-Bío' },
  items: {
    fixed_services: [
      {
        day: 1,
        codigo: '39',
        nombre: 'Salón auditorio día completo',
        precio: 250000,
        quantity: 1,
      },
      {
        day: 2,
        codigo: '39',
        nombre: 'Salón auditorio día completo',
        precio: 250000,
        quantity: 1,
      },
    ],
    variable_services: [
      {
        day: 1,
        people: 20,
        audience: 'adultos',
        category: 'Almuerzo',
        items: [
          {
            codigo: '2070',
            nombre: 'Carne mechada',
            precio: 10000,
            quantity: 1,
          },
          { codigo: '2181', nombre: 'Flan Casero', precio: 2000, quantity: 1 },
        ],
      },
      {
        day: 2,
        people: 20,
        audience: 'adultos',
        category: 'Almuerzo',
        items: [
          {
            codigo: '2076',
            nombre: 'Costillar al horno',
            precio: 10000,
            quantity: 1,
          },
          {
            codigo: '2419',
            nombre: 'Turrón de vino',
            precio: 2000,
            quantity: 1,
          },
        ],
      },
      {
        day: 2,
        people: 20,
        audience: 'adultos',
        category: 'Coffee & Cóctel',
        items: [
          {
            codigo: '2178',
            nombre: 'Mini mote con huesillo',
            precio: 1000,
            quantity: 2,
          },
        ],
      },
    ],
  },
};

describe('la cotización vinculada en texto', () => {
  it('día por día, con los ids del catálogo, las personas y sin precios', () => {
    const t = laCotizacionVinculadaEnTexto(LA_574);
    expect(t).toBe(
      [
        'N° 574 (aceptada), para 20 personas, del 11-11-2026 al 12-11-2026.',
        'Día 1:',
        '- Servicio fijo: Salón auditorio día completo (id 39)',
        '- Almuerzo (20 personas, adultos): Carne mechada (id 2070); Flan Casero (id 2181)',
        'Día 2:',
        '- Servicio fijo: Salón auditorio día completo (id 39)',
        '- Almuerzo (20 personas, adultos): Costillar al horno (id 2076); Turrón de vino (id 2419)',
        '- Coffee & Cóctel (20 personas, adultos): Mini mote con huesillo (id 2178) ×2',
      ].join('\n'),
    );
    expect(t).not.toMatch(/\$|10000|250000/);
  });

  it('sin productos no hay nada que seguir', () => {
    expect(laCotizacionVinculadaEnTexto({ ...LA_574, items: null })).toBeNull();
    expect(
      laCotizacionVinculadaEnTexto({
        ...LA_574,
        items: { fixed_services: [], variable_services: [] },
      }),
    ).toBeNull();
  });

  it('un solo día se dice así', () => {
    const t = laCotizacionVinculadaEnTexto({
      ...LA_574,
      event_end_date: null,
    });
    expect(t?.split('\n')[0]).toBe(
      'N° 574 (aceptada), para 20 personas, el 11-11-2026.',
    );
  });
});
