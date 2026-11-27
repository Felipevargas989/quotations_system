import type { Quotation } from '../../../entities/quotation.entity';
import {
  filasDeLaTabla,
  tablaEnTexto,
  tablaVerde,
} from '../../../envio-belia/tabla';

// La tabla verde (doc 20 §19): las cifras salen de Eventia, con neto, IVA y
// total dentro de la tabla.

const q = {
  people_count: 50,
  children_count: 10,
  total_amount: 1_190_000,
  subtotal_amount: 1_190_000,
  tip_percentage: null,
  items: {
    variable_services: [
      { audience: 'adultos', items: [{ nombre: 'Almuerzo', precio: 20_000 }] },
      { audience: 'ninos', items: [{ nombre: 'Menú niño', precio: 15_000 }] },
    ],
    fixed_services: [{ nombre: 'Salón', precio: 240_000, quantity: 1 }],
  },
} as unknown as Quotation;

describe('la tabla verde del envío', () => {
  it('una fila por público y cada fijo', () => {
    expect(filasDeLaTabla(q)).toEqual([
      {
        item: 'Valor por persona, adultos',
        cantidad: '40',
        unitario: 20_000,
        total: 800_000,
      },
      {
        item: 'Valor por persona, niños',
        cantidad: '10',
        unitario: 15_000,
        total: 150_000,
      },
      { item: 'Salón', cantidad: '1', unitario: 240_000, total: 240_000 },
    ]);
  });

  it('neto, IVA y total dentro, con la cabecera verde y el total en crema', () => {
    const html = tablaVerde(q);
    expect(html).toContain('#23443a');
    expect(html).toContain('#f3efe4');
    expect(html).toContain('$1.000.000');
    expect(html).toContain('$190.000');
    expect(html).toContain('$1.190.000');
    expect(tablaEnTexto(q)).toContain('Total con IVA incluido: $1.190.000');
  });
});
