import { BadRequestException, ForbiddenException } from '@nestjs/common';
import type { LineaPedida } from '../facturas/borrador';
import { conElTarifario, usaElTarifario } from '../facturas/del-tarifario';

/**
 * LA FACTURA CON EL TARIFARIO (doc 19 §9.23). Felipe, 07-11: *"el
 * recepcionista solamente puede emitir boletas y facturas de cabañas según
 * el tarifario"*. La línea del tarifario lleva su nombre y su precio de
 * ahí; la línea a mano y el descuento son del administrador.
 */
const TARIFARIO = [
  {
    id: 5,
    nombre: 'Cabaña 6 personas, temporada media',
    precio: 140000,
    unidad: 'noche',
    activo: true,
  },
  { id: 6, nombre: 'Tinaja', precio: 25000, unidad: 'unidad', activo: false },
];

const linea = (cambios: Partial<LineaPedida> = {}): LineaPedida => ({
  descripcion: 'Escrita en la pantalla',
  descripcion_larga: null,
  cantidad: 2,
  precio: 1000,
  ...cambios,
});

describe('La factura con el tarifario (§9.23)', () => {
  it('la línea del tarifario lleva su nombre y su precio; la cantidad y la descripción larga, las de la persona', () => {
    const [l] = conElTarifario(
      [
        linea({
          tarifario_id: 5,
          descripcion_larga: 'Del 7 al 9 de noviembre',
        }),
      ],
      TARIFARIO,
      false,
    );
    expect(l).toMatchObject({
      descripcion: 'Cabaña 6 personas, temporada media',
      precio: 140000,
      cantidad: 2,
      descripcion_larga: 'Del 7 al 9 de noviembre',
    });
  });

  it('un ítem que no existe o está desactivado no sirve', () => {
    for (const id of [6, 99])
      expect(() =>
        conElTarifario([linea({ tarifario_id: id })], TARIFARIO, true),
      ).toThrow(BadRequestException);
  });

  it('la línea a mano y el descuento, solo el administrador', () => {
    expect(() => conElTarifario([linea()], TARIFARIO, false)).toThrow(
      ForbiddenException,
    );
    expect(() =>
      conElTarifario(
        [linea({ tarifario_id: 5, descuento: 10 })],
        TARIFARIO,
        false,
      ),
    ).toThrow(ForbiddenException);
    // El administrador: lo escrito a mano pasa tal cual, y el descuento
    // sobre el precio del tarifario también.
    expect(conElTarifario([linea()], TARIFARIO, true)).toEqual([linea()]);
    expect(
      conElTarifario(
        [linea({ tarifario_id: 5, descuento: 10 })],
        TARIFARIO,
        true,
      )[0],
    ).toMatchObject({ precio: 140000, descuento: 10 });
  });

  it('sin líneas del tarifario no hace falta leerlo', () => {
    expect(usaElTarifario([linea()])).toBe(false);
    expect(usaElTarifario([linea(), linea({ tarifario_id: 5 })])).toBe(true);
  });
});
