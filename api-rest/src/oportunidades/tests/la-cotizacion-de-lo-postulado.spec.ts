import type { FilaDeLaMatriz } from '../postulacion/armar-la-oferta';
import { sinPrecioAparte } from '../postulacion/la-cotizacion-de-lo-postulado';
import type { DiaDeLaCotizacion } from '../postulacion/la-cotizacion-detallada';

// LO QUE VA SIN PRECIO APARTE EN LA COTIZACIÓN DE LO POSTULADO (decisión
// 120, 08-11). Felipe: "sin precio aparte, el precio es 1 el que ponemos al
// armar", y lo particular de la licitación "la incluyo para no quedar
// fuera por bases". Lo particular que va con un producto del catálogo queda
// en su línea; lo demás que se compromete, en «También incluye».

const DIAS: DiaDeLaCotizacion[] = [
  {
    titulo: 'Viernes 20 de noviembre de 2026',
    subtotal: 1_000_000,
    lineas: [
      {
        servicio: 'Salón Cúpula',
        detalle: '',
        cantidad: '1',
        unidades: 1,
        unitario: 600_000,
        total: 600_000,
        codigos: ['40'],
      },
      {
        servicio: 'Colación',
        detalle: 'Sándwich de ave; Jugo natural',
        cantidad: '200 personas',
        unidades: 200,
        unitario: 2_000,
        total: 400_000,
        codigos: ['2201', '2202'],
      },
    ],
  },
];

const fila = (
  origen: FilaDeLaMatriz['origen'],
  como: string,
  productos: number[] = [],
): FilaDeLaMatriz => ({
  especificacion: como,
  pagina: 0,
  como,
  origen,
  productos,
});

describe('Lo que va sin precio aparte (decisión 120)', () => {
  it('lo particular con un producto, en su línea; lo particular suelto y lo subcontratado, en «También incluye»', () => {
    const { dias, tambien } = sinPrecioAparte(DIAS, [
      fila('catalogo', 'Salón para 200 personas', [40]),
      fila('parecido', 'Colación en bolsa individual', [2201]),
      fila('particular', 'Taza de regalo para cada participante', [2202]),
      fila('particular', '2 galvanos para el premio a los 30 años de servicio'),
      fila('subcontratar', 'Amplificación con 2 micrófonos inalámbricos'),
      fila('subcontratar', 'Amplificación con 2 micrófonos inalámbricos'),
    ]);
    expect(dias[0].lineas.map((l) => l.detalle)).toEqual([
      '',
      'Sándwich de ave; Jugo natural; Taza de regalo para cada participante',
    ]);
    expect(tambien).toEqual([
      '2 galvanos para el premio a los 30 años de servicio',
      'Amplificación con 2 micrófonos inalámbricos',
    ]);
    // Los precios no se tocan: van dentro del mismo precio.
    expect(dias[0].lineas.map((l) => l.total)).toEqual([600_000, 400_000]);
    // Y lo de entrada queda como estaba.
    expect(DIAS[0].lineas[1].detalle).toBe('Sándwich de ave; Jugo natural');
  });

  it('lo particular de un fijo va en su línea, y lo que no calza con ningún producto va aparte', () => {
    const { dias, tambien } = sinPrecioAparte(DIAS, [
      fila('particular', 'Decoración con los colores institucionales', [40]),
      fila('particular', 'Credenciales para los 200 asistentes', [9999]),
    ]);
    expect(dias[0].lineas[0].detalle).toBe(
      'Decoración con los colores institucionales',
    );
    expect(tambien).toEqual(['Credenciales para los 200 asistentes']);
  });

  it('lo que quedó por definir o por confirmar no se promete', () => {
    const { tambien } = sinPrecioAparte(DIAS, [
      fila('completar', '[COMPLETAR: la temática del show]'),
      fila(
        'subcontratar',
        'Show de [POR CONFIRMAR: qué artista] por 45 minutos',
      ),
      fila('particular', '   '),
    ]);
    expect(tambien).toEqual([]);
  });
});
