import {
  diasDelServicio,
  servicioDe,
  textoDelServicio,
} from '../mias/servicio-de-la-ganada';

// LAS GANADAS (decisión 100, 28-10): los días del servicio, leídos de lo
// que dicen las bases. Los textos son de análisis reales de producción.

describe('Los días del servicio de una ganada', () => {
  it('un día, como lo dicen las bases', () => {
    expect(
      diasDelServicio(
        '28 de octubre 2026, hora por confirmar',
        '2026-10-28',
        null,
      ),
    ).toEqual(['2026-10-28']);
    expect(
      diasDelServicio(
        'Viernes 30 de octubre del 2026, de 19:00 a 02:00 horas',
        '2026-10-30',
        null,
      ),
    ).toEqual(['2026-10-30']);
    expect(
      diasDelServicio('19 noviembre, 08:30 a 18:30 horas', '2026-11-19', null),
    ).toEqual(['2026-11-19']);
    expect(
      diasDelServicio(
        '30/10/2026 desde 13:00 hasta 17:00 hrs.',
        '2026-10-30',
        null,
      ),
    ).toEqual(['2026-10-30']);
    expect(
      diasDelServicio(
        'Fecha en que se requiere el servicio: 2-nov.-2026',
        null,
        null,
      ),
    ).toEqual(['2026-11-02']);
  });

  it('varios días: el último es el que cuenta para «Cumplidas»', () => {
    expect(
      diasDelServicio(
        'Miércoles 25 de noviembre de 2026 (Cierre de Talleres); viernes 04 de diciembre, 20:00 a 22:00; jueves 17 de diciembre, 20:00 a 23:00 (Mérito Deportivo y cátering, montaje desde 17:30); sábado 19 de diciembre, 20:00 a 22:30',
        '2026-11-25',
        null,
      ),
    ).toEqual(['2026-11-25', '2026-12-04', '2026-12-17', '2026-12-19']);
    // El año, una sola vez y al final.
    expect(
      diasDelServicio(
        '21 de noviembre, 28 de noviembre y 12 de diciembre de 2026, de 10:00 a 20:00 hrs (un grupo de 78 personas por día)',
        '2026-11-21',
        null,
      ),
    ).toEqual(['2026-11-21', '2026-11-28', '2026-12-12']);
    // Hasta las 2 de la mañana del día siguiente.
    expect(
      diasDelServicio(
        'viernes 30 de octubre, desde las 18:00 hrs hasta las 02:00 horas del 31 de octubre',
        '2026-10-30',
        null,
      ),
    ).toEqual(['2026-10-30', '2026-10-31']);
    expect(
      diasDelServicio(
        'Ingreso 02-11-2026, salida 04-11-2026 (2 noches)',
        '2026-11-02',
        null,
      ),
    ).toEqual(['2026-11-02', '2026-11-04']);
  });

  it('un rango: todos los días entre medio', () => {
    expect(
      diasDelServicio(
        'Catamarán del 2 al 8 de noviembre; alojamiento y colaciones del 6 al 8 de noviembre',
        '2026-11-02',
        null,
      ),
    ).toEqual([
      '2026-11-02',
      '2026-11-03',
      '2026-11-04',
      '2026-11-05',
      '2026-11-06',
      '2026-11-07',
      '2026-11-08',
    ]);
  });

  it('sin año ni primer día, el del cierre; de diciembre a enero, el año siguiente', () => {
    expect(
      diasDelServicio(
        'Martes 27 de octubre, 12:30 hrs. aprox.',
        null,
        '2026-10-20T15:00:00+00:00',
      ),
    ).toEqual(['2026-10-27']);
    expect(
      diasDelServicio('30 de diciembre y 2 de enero', '2026-12-30', null),
    ).toEqual(['2026-12-30', '2027-01-02']);
  });

  it('sin fecha en las bases, ningún día', () => {
    expect(
      diasDelServicio(
        'Contrato de 6 meses desde la adjudicación (renovable una vez por 6 meses), con servicios a pedido',
        null,
        '2026-10-20T15:00:00+00:00',
      ),
    ).toEqual([]);
    expect(
      diasDelServicio(
        '2 giras de 2 días / 1 noche cada una, en fechas a coordinar tras la orden de compra; salida a las 03:00 desde Curanilahue y llegada estimada a las 23:00 del día 2',
        null,
        null,
      ),
    ).toEqual([]);
  });
});

describe('El servicio de una ganada', () => {
  it('lo que dicen las bases y sus días (la 1030177-85-COT26)', () => {
    expect(
      servicioDe(
        {
          fecha_del_servicio: '28 de octubre 2026, hora por confirmar',
          fecha_del_servicio_iso: '2026-10-28',
        },
        '2026-10-27T19:15:00+00:00',
      ),
    ).toEqual({
      texto: '28 de octubre 2026, hora por confirmar',
      dias: ['2026-10-28'],
    });
  });

  it('un análisis de antes del 17-10: la fecha del servicio está entre sus fechas', () => {
    const analisis = {
      fechas: [
        {
          que: 'Entrega del cronograma del evento por el municipio',
          cuando: 'Mínimo 5 días de antelación a la fecha del evento',
        },
        {
          que: 'Fecha del servicio',
          cuando:
            'Viernes 30 de octubre, desde las 18:00 hrs hasta las 02:00 horas del 31 de octubre',
        },
      ],
    };
    expect(textoDelServicio(analisis)).toBe(
      'Viernes 30 de octubre, desde las 18:00 hrs hasta las 02:00 horas del 31 de octubre',
    );
    expect(servicioDe(analisis, '2026-10-19T18:01:00+00:00')?.dias).toEqual([
      '2026-10-30',
      '2026-10-31',
    ]);
  });

  it('sin análisis, o sin fecha en él: no hay servicio que mostrar', () => {
    expect(servicioDe(undefined, null)).toBeNull();
    expect(
      servicioDe({ fecha_del_servicio: '', fecha_del_servicio_iso: '' }, null),
    ).toBeNull();
    // Un primer día que no existe no cuenta.
    expect(
      servicioDe({ fecha_del_servicio_iso: '2026-11-31' }, null),
    ).toBeNull();
  });
});
