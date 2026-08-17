import { laPuedeQuitarLaProyeccion } from '../people.service';

/**
 * LA PROYECCIÓN SOLO BORRA LO QUE ELLA MISMA PONE.
 *
 * Encontrado en la revisión del 16-08, antes de subir a producción:
 * guardar la ficha de un freelance le borraba sus días de restaurante
 * desde hoy en adelante, con la propina ya repartida adentro. El camino
 * al daño era el camino normal de trabajo — entrar a la ficha a cargar
 * el RUT, que es obligatorio para poder pagarle.
 *
 * Cada caso de acá es una forma de perder plata de un trabajador.
 */
describe('laPuedeQuitarLaProyeccion', () => {
  const jornadaDePlanta = {
    kind: 'planta',
    amount: null,
    tip_amount: null,
    payroll_id: null,
    tip_payroll_id: null,
  };

  it('quita la jornada de planta que ella misma puso y nadie tocó', () => {
    expect(laPuedeQuitarLaProyeccion(jornadaDePlanta)).toBe(true);
  });

  it('NO toca a un freelance del restaurante', () => {
    // El caso de Matías Zapata: $30.000 de jornada y $14.000 de propina
    // que desaparecían al guardar su ficha.
    expect(
      laPuedeQuitarLaProyeccion({ ...jornadaDePlanta, kind: 'freelance' }),
    ).toBe(false);
  });

  it('NO toca una fila con jornada pagada', () => {
    expect(
      laPuedeQuitarLaProyeccion({ ...jornadaDePlanta, amount: 25000 }),
    ).toBe(false);
  });

  it('NO toca una fila con propina repartida', () => {
    // Aunque sea de planta: la propina del restaurante se reparte
    // también a la planta.
    expect(
      laPuedeQuitarLaProyeccion({ ...jornadaDePlanta, tip_amount: 14000 }),
    ).toBe(false);
  });

  it('NO toca una fila que ya entró a una nómina', () => {
    expect(
      laPuedeQuitarLaProyeccion({ ...jornadaDePlanta, payroll_id: 5 }),
    ).toBe(false);
    expect(
      laPuedeQuitarLaProyeccion({ ...jornadaDePlanta, tip_payroll_id: 5 }),
    ).toBe(false);
  });

  it('una fila vieja sin kind se trata como planta', () => {
    // Filas anteriores a la columna: si se trataran como "ajenas", la
    // planta dejaría de limpiarse sola y se llenaría de días fantasma.
    expect(laPuedeQuitarLaProyeccion({ ...jornadaDePlanta, kind: null })).toBe(
      true,
    );
  });

  it('un monto en cero no cuenta como plata', () => {
    expect(
      laPuedeQuitarLaProyeccion({
        ...jornadaDePlanta,
        amount: 0,
        tip_amount: 0,
      }),
    ).toBe(true);
  });
});
