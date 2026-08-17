import { esJornadaExtra } from '../people.service';

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

  it('un freelance nunca es "día extra": todos sus días se pagan', () => {
    expect(
      esJornadaExtra(
        { default_kind: 'freelance', default_role_id: 5, days_off: [] },
        { day: '2026-11-18', role_id: 23 },
      ),
    ).toBe(false);
  });
});
