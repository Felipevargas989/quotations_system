import { armarStatsMensuales, mesesVentana } from '../super-admin.repository';

// Barras mensuales (05-08): los helpers PUROS del gráfico por empresa.
describe('Barras mensuales (armarStatsMensuales)', () => {
  // "Hoy" fijo para pruebas deterministas: 5 de agosto de 2026.
  const ahora = new Date('2026-08-05T12:00:00.000Z');
  const empresas = [
    { id: 1, name: 'Cabañas' },
    { id: 2, name: 'Eventos Sur' },
  ];

  it('la ventana son SIEMPRE los 6 meses calendario (5 atrás + el en curso)', () => {
    expect(mesesVentana(ahora)).toEqual([
      '2026-03',
      '2026-04',
      '2026-05',
      '2026-06',
      '2026-07',
      '2026-08',
    ]);
  });

  it('reparte por mes con el borde de mes correcto y deja los huecos en 0', () => {
    const cotizaciones = [
      // Borde de mes: 31 de marzo 23:59Z cae en marzo; 1 de abril
      // 00:00Z cae en abril.
      {
        company_id: 1,
        created_at: '2026-03-31T23:59:59.000Z',
        total_amount: 100,
      },
      {
        company_id: 1,
        created_at: '2026-04-01T00:00:00.000Z',
        total_amount: 200,
      },
      {
        company_id: 1,
        created_at: '2026-04-15T10:00:00.000Z',
        total_amount: 50,
      },
      {
        company_id: 2,
        created_at: '2026-08-01T08:00:00.000Z',
        total_amount: 999,
      },
    ];

    const [cabanas, eventosSur] = armarStatsMensuales(
      empresas,
      cotizaciones,
      ahora,
    );

    expect(cabanas.monthly).toEqual([
      { mes: '2026-03', cantidad: 1, monto: 100 },
      { mes: '2026-04', cantidad: 2, monto: 250 },
      { mes: '2026-05', cantidad: 0, monto: 0 },
      { mes: '2026-06', cantidad: 0, monto: 0 },
      { mes: '2026-07', cantidad: 0, monto: 0 },
      { mes: '2026-08', cantidad: 0, monto: 0 },
    ]);
    // Sin meses fantasma: la otra empresa también trae los 6, huecos en 0.
    expect(eventosSur.monthly.map((m) => m.mes)).toEqual(mesesVentana(ahora));
    expect(eventosSur.monthly[5]).toEqual({
      mes: '2026-08',
      cantidad: 1,
      monto: 999,
    });
  });

  it('total_quotations/total_amount conservan su significado de ÚLTIMOS 30 DÍAS', () => {
    const cotizaciones = [
      // Hace 40 días: cuenta en su mes, NO en el total de 30 días.
      {
        company_id: 1,
        created_at: '2026-06-26T10:00:00.000Z',
        total_amount: 1000,
      },
      // El DÍA BORDE completo cuenta (cura 05-08, semántica del viejo
      // endpoint por fecha-string): hace 30 días a las 00:30 entra
      // aunque "ahora" sean las 12:00.
      {
        company_id: 1,
        created_at: '2026-07-06T00:30:00.000Z',
        total_amount: 5,
      },
      // Hace 10 días: cuenta en ambos.
      {
        company_id: 1,
        created_at: '2026-07-26T10:00:00.000Z',
        total_amount: 300,
      },
      // Hoy: cuenta en ambos.
      {
        company_id: 1,
        created_at: '2026-08-05T09:00:00.000Z',
        total_amount: 70,
      },
    ];

    const [cabanas] = armarStatsMensuales(empresas, cotizaciones, ahora);

    expect(cabanas.total_quotations).toBe(3);
    expect(cabanas.total_amount).toBe(375);
    // El dataset mensual sí ve la de hace 40 días.
    expect(cabanas.monthly.find((m) => m.mes === '2026-06')).toEqual({
      mes: '2026-06',
      cantidad: 1,
      monto: 1000,
    });
  });
});
