import { esJornadaExtra, laMandaronAUnEvento } from '../people.service';

/**
 * UN DÍA EXTRA ES DÍA EXTRA, TAMBIÉN EN EL RESTAURANTE (Felipe, 17-08).
 *
 * El caso que lo destapó: una cocinera de planta, libre el 18 de
 * noviembre (miércoles), puesta como Staff garzón. Quedó como "planta",
 * sin monto, y el cargo Garzón entero saltó a la banda de planta.
 *
 * La jornada de planta es SOLO la del cargo propio, en los días
 * propios. Todo lo demás se paga aparte.
 *
 * (El primer despliegue de esta regla lo tumbó el constructor de
 * Railway antes de leer el código; el reintento pasa por acá.)
 */
describe('esJornadaExtra', () => {
  const cocinera = {
    default_kind: 'planta',
    default_role_id: 23, // Cocina
    days_off: [3], // libre los miércoles
  };

  it('planta en su día libre = día extra, aunque venga con su cargo', () => {
    // 2026-11-18 es miércoles: su día libre.
    expect(esJornadaExtra(cocinera, { day: '2026-11-18', role_id: 23 })).toBe(
      true,
    );
  });

  it('planta con OTRO cargo = día extra, aunque sea su día normal', () => {
    // El caso de Felipe: la cocinera de garzón (cargo 5).
    expect(esJornadaExtra(cocinera, { day: '2026-11-19', role_id: 5 })).toBe(
      true,
    );
  });

  it('planta en un evento = día extra, siempre', () => {
    expect(
      esJornadaExtra(cocinera, {
        quotation_id: 'ev-1',
        day: '2026-11-19',
        role_id: 23,
      }),
    ).toBe(true);
  });

  it('su cargo, su día normal: es su jornada de planta, NO un extra', () => {
    expect(esJornadaExtra(cocinera, { day: '2026-11-19', role_id: 23 })).toBe(
      false,
    );
  });

  it('sin cargo pedido, queda el habitual: tampoco es extra', () => {
    // El restaurante no impone cargo (regla del 15-08).
    expect(esJornadaExtra(cocinera, { day: '2026-11-19' })).toBe(false);
  });

  // LO MISMO DECIDE EL ESTADO CON QUE NACE (Felipe, 18-08): "el 25 no
  // se debe confirmar porque es su jornada de planta, pero si lo hubiese
  // colocado que venga el 24 [su libre], ese día sí me lo tiene que
  // confirmar". La misma regla que dice si se paga dice si es oferta.
  it('su jornada normal NO es extra → nace confirmada, no es una oferta', () => {
    // El caso de Camila: martes 25, su cargo. No hay nada que confirmar.
    expect(esJornadaExtra(cocinera, { day: '2026-08-25', role_id: 23 })).toBe(
      false,
    );
  });

  it('su día libre SÍ es extra → nace por confirmar', () => {
    // 2026-08-26 es miércoles: el libre de la cocinera del ejemplo.
    expect(esJornadaExtra(cocinera, { day: '2026-08-26', role_id: 23 })).toBe(
      true,
    );
  });

  it('un freelance nunca es "día extra": todos sus días se pagan', () => {
    expect(
      esJornadaExtra(
        { default_kind: 'freelance', default_role_id: 5, days_off: [] },
        { day: '2026-11-18', role_id: 23 },
      ),
    ).toBe(false);
  });
});

describe('laMandaronAUnEvento (18-08)', () => {
  it('la planta puesta en un evento desde la casilla (freelance) sí: ese día no está en el restaurante', () => {
    expect(laMandaronAUnEvento({ quotation_id: 'q1', kind: 'freelance' })).toBe(
      true,
    );
  });
  it('la fila que la ficha trae (planta en el evento) NO: estuvo en el restaurante y además reparte', () => {
    expect(laMandaronAUnEvento({ quotation_id: 'q1', kind: 'planta' })).toBe(
      false,
    );
  });
  it('un turno de restaurante nunca es "mandada a un evento"', () => {
    expect(laMandaronAUnEvento({ quotation_id: null, kind: 'planta' })).toBe(
      false,
    );
  });
});
