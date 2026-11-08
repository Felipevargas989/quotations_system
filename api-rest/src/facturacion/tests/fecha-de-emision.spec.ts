import { fechaDeEmision, rangoDeEmision } from '../facturas/fecha-de-emision';

// LA FECHA DE EMISIÓN (doc 19 §9.32): hasta el último día del mes en curso
// (Felipe, 08-11: «sí, hazlo, pruébalo»); hasta el día 20 (el F29 de los
// facturadores electrónicos), desde el 1 del mes anterior; desde el 21,
// solo el mes en curso.

describe('El rango de la fecha de emisión', () => {
  it('hasta el 20, desde el 1 del mes anterior hasta el último día del mes', () => {
    expect(rangoDeEmision('2026-11-08')).toEqual({
      desde: '2026-10-01',
      hasta: '2026-11-30',
    });
    expect(rangoDeEmision('2026-11-20')).toEqual({
      desde: '2026-10-01',
      hasta: '2026-11-30',
    });
  });

  it('desde el 21, solo el mes en curso', () => {
    expect(rangoDeEmision('2026-11-21')).toEqual({
      desde: '2026-11-01',
      hasta: '2026-11-30',
    });
  });

  it('en enero, el mes anterior es diciembre del año anterior; febrero bisiesto llega al 29', () => {
    expect(rangoDeEmision('2027-01-05')).toEqual({
      desde: '2026-12-01',
      hasta: '2027-01-31',
    });
    expect(rangoDeEmision('2028-02-10').hasta).toBe('2028-02-29');
  });
});

describe('La fecha con que sale', () => {
  it('sin elegir, la de hoy', () => {
    expect(fechaDeEmision(null, '2026-11-08')).toMatchObject({
      fecha: '2026-11-08',
      problema: null,
    });
  });

  it('la elegida, si está en el rango: también una posterior dentro del mes', () => {
    expect(fechaDeEmision('2026-10-31', '2026-11-08')).toMatchObject({
      fecha: '2026-10-31',
      problema: null,
    });
    expect(fechaDeEmision('2026-11-30', '2026-11-08')).toMatchObject({
      fecha: '2026-11-30',
      problema: null,
    });
  });

  it('fuera del rango dice desde y hasta cuándo', () => {
    expect(fechaDeEmision('2026-12-01', '2026-11-08').problema).toBe(
      'La fecha de emisión va del 01-10-2026 al 30-11-2026',
    );
    expect(fechaDeEmision('2026-09-30', '2026-11-08').problema).toBe(
      'La fecha de emisión va del 01-10-2026 al 30-11-2026',
    );
    expect(fechaDeEmision('2026-10-15', '2026-11-21').problema).toBe(
      'La fecha de emisión va del 01-11-2026 al 30-11-2026',
    );
  });
});
