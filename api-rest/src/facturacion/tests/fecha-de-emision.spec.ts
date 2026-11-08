import { fechaDeEmision, rangoDeEmision } from '../facturas/fecha-de-emision';

// LA FECHA DE EMISIÓN (doc 19 §9.32): nunca futura; hasta el día 20 (el F29
// de los facturadores electrónicos), desde el 1 del mes anterior; desde el
// 21, solo el mes en curso.

describe('El rango de la fecha de emisión', () => {
  it('hasta el 20, desde el 1 del mes anterior hasta hoy', () => {
    expect(rangoDeEmision('2026-11-08')).toEqual({
      desde: '2026-10-01',
      hasta: '2026-11-08',
    });
    expect(rangoDeEmision('2026-11-20')).toEqual({
      desde: '2026-10-01',
      hasta: '2026-11-20',
    });
  });

  it('desde el 21, solo el mes en curso', () => {
    expect(rangoDeEmision('2026-11-21')).toEqual({
      desde: '2026-11-01',
      hasta: '2026-11-21',
    });
  });

  it('en enero, el mes anterior es diciembre del año anterior', () => {
    expect(rangoDeEmision('2027-01-05').desde).toBe('2026-12-01');
  });
});

describe('La fecha con que sale', () => {
  it('sin elegir, la de hoy', () => {
    expect(fechaDeEmision(null, '2026-11-08')).toMatchObject({
      fecha: '2026-11-08',
      problema: null,
    });
  });

  it('la elegida, si está en el rango', () => {
    expect(fechaDeEmision('2026-10-31', '2026-11-08')).toMatchObject({
      fecha: '2026-10-31',
      problema: null,
    });
  });

  it('una futura no sale', () => {
    expect(fechaDeEmision('2026-11-09', '2026-11-08').problema).toBe(
      'La fecha de emisión no puede ser futura',
    );
  });

  it('una anterior al rango dice desde y hasta cuándo', () => {
    expect(fechaDeEmision('2026-09-30', '2026-11-08').problema).toBe(
      'La fecha de emisión va del 01-10-2026 al 08-11-2026',
    );
    expect(fechaDeEmision('2026-10-15', '2026-11-21').problema).toBe(
      'La fecha de emisión va del 01-11-2026 al 21-11-2026',
    );
  });
});
