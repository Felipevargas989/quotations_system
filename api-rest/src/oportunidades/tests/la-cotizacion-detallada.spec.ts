import { archivoDelZip, nombresDelZip, textoDeDocx } from '../analisis/docx';
import {
  calzaCon,
  repartirElPrecio,
  repartoGuardado,
} from '../postulacion/el-reparto';
import {
  armarLaCotizacionDetallada,
  type DatosDeLaCotizacionDetallada,
  type DiaDeLaCotizacion,
  diasDeLaCotizacion,
  esLaCotizacionDetallada,
  laCotizacionQueFalta,
  loQueIncluye,
  medidasDeLaImagen,
  nombreDeLaCotizacionDetallada,
  pidenElDetalle,
  pidenLaCotizacion,
  plazoDeLaCotizacion,
} from '../postulacion/la-cotizacion-detallada';
import type { CotizacionDeLaPostulacion } from '../postulacion/postulacion.repository';

// LA COTIZACIÓN DETALLADA DESDE LA COTIZACIÓN VINCULADA (decisión 119,
// 07-11, parte 2). El caso real: la 2705-1740-COT26 de la Universidad del
// Bío-Bío, con la N° 574 vinculada ($1.788.000 a precios del catálogo) y
// postulada por $1.780.000 con IVA. Desde el reparto (07-11), cada precio
// baja en la misma proporción hasta ese precio, sin línea de descuento.

const linea = (codigo: string, nombre: string, precio: number) => ({
  codigo,
  nombre,
  precio,
  quantity: 1,
});

const LA_574: CotizacionDeLaPostulacion = {
  id: 'd5dee709',
  quotation_number: 574,
  quotation_status: 'aceptada',
  people_count: 20,
  children_count: null,
  event_date: '2026-11-11T00:00:00+00:00',
  event_end_date: '2026-11-12T00:00:00+00:00',
  subtotal_amount: 1_788_000,
  discount_amount: 8_000,
  total_amount: 1_780_000,
  client: { name: 'Universidad del Bío-Bío' },
  items: {
    fixed_services: [
      { day: 1, ...linea('39', 'Salón auditorio día completo', 250_000) },
      { day: 2, ...linea('39', 'Salón auditorio día completo', 250_000) },
    ],
    variable_services: [
      {
        day: 1,
        people: 20,
        audience: 'adultos',
        category: 'Desayuno',
        items: [
          linea('2033', 'Té twinings, café, leche', 3000),
          linea('2034', 'Jugo de naranja', 1000),
          linea('2036', 'Pan amasado o corriente', 550),
          linea('2037', 'Mantequilla individual', 550),
          linea('2043', 'Huevo revuelto', 1800),
          linea('2045', 'Jamón', 1000),
          linea('2293', 'Frutos secos', 1300),
        ],
      },
      {
        day: 1,
        people: 20,
        audience: 'adultos',
        category: 'Almuerzo',
        items: [
          linea('2205', 'Bebida libre consumo', 1300),
          linea('2054', 'Pan acompañado de pebre', 600),
          linea('2070', 'Carne mechada', 10000),
          linea('2086', 'Puré de papa', 2000),
          linea('2057', 'Ensalada surtida de 3 ingredientes', 1000),
          linea('2181', 'Flan Casero', 2000),
        ],
      },
      {
        day: 1,
        people: 20,
        audience: 'adultos',
        category: 'Coffee & Cóctel',
        items: [
          linea('2042', 'Bollería variedades', 800),
          linea('2127', 'Mini sándwich ave pimentón 1 pp', 1500),
          linea('2137', 'Shot de frutas', 1300),
          linea('2280', 'Jugo Natural Cóctel', 1300),
          linea('2123', 'Mini empanada de cóctel 1 pp', 1300),
        ],
      },
      {
        day: 2,
        people: 20,
        audience: 'adultos',
        category: 'Desayuno',
        items: [
          linea('2033', 'Té twinings, café, leche', 3000),
          linea('2034', 'Jugo de naranja', 1000),
          linea('2036', 'Pan amasado o corriente', 550),
          linea('2037', 'Mantequilla individual', 550),
          linea('2044', 'Palta', 1800),
          linea('2046', 'Queso', 1000),
          linea('2039', 'Fruta laminada o trozada', 1100),
        ],
      },
      {
        day: 2,
        people: 20,
        audience: 'adultos',
        category: 'Almuerzo',
        items: [
          linea('2054', 'Pan acompañado de pebre', 600),
          linea('2205', 'Bebida libre consumo', 1300),
          linea('2057', 'Ensalada surtida de 3 ingredientes', 1000),
          linea('2076', 'Costillar al horno', 10000),
          linea('2419', 'Turrón de vino', 2000),
          linea('2085', 'Papas mayo', 2000),
        ],
      },
      {
        day: 2,
        people: 20,
        audience: 'adultos',
        category: 'Coffee & Cóctel',
        items: [
          linea('2178', 'Mini mote con huesillo', 1000),
          linea('2041', 'Sopaipillas con Pebre', 1200),
          linea('2126', 'Mini sándwich mechada queso 1 pp', 1500),
          linea('2280', 'Jugo Natural Cóctel', 1300),
          linea('2134', 'Mini pie de limón 1 pp', 1200),
        ],
      },
    ],
  },
};

/** La 574 repartida hasta $1.780.000 (el-reparto.ts). */
const repartida = (total: number): DiaDeLaCotizacion[] =>
  repartirElPrecio(diasDeLaCotizacion(LA_574), total) ?? [];

/** Lo que importa de cada línea: qué, cuánto por unidad y en neto. */
const precios = (dias: DiaDeLaCotizacion[]) =>
  dias.map((d) => [
    d.titulo,
    d.subtotal,
    d.lineas.map((l) => [l.servicio, l.cantidad, l.unitario, l.unitarioNeto]),
  ]);

const suma = (dias: DiaDeLaCotizacion[], neto = false) =>
  dias
    .flatMap((d) => d.lineas)
    .reduce((s, l) => s + (neto ? (l.totalNeto ?? 0) : l.total), 0);

/** Un PNG de 1×1 (el logo de prueba), con su IHDR de 400×200. */
const PNG = (() => {
  const b = Buffer.alloc(33);
  b.writeUInt32BE(0x89504e47, 0);
  b.writeUInt32BE(0x0d0a1a0a, 4);
  b.writeUInt32BE(13, 8);
  b.write('IHDR', 12, 'ascii');
  b.writeUInt32BE(400, 16);
  b.writeUInt32BE(200, 20);
  return b;
})();

const datos = (
  extra: Partial<DatosDeLaCotizacionDetallada> = {},
): DatosDeLaCotizacionDetallada => ({
  proceso: 'Compra Ágil 2705-1740-COT26',
  nombre:
    'Servicio de arriendo de salón de eventos con servicio de alimentación SC 5306',
  comprador: 'UNIVERSIDAD DEL BIO BIO',
  numero: 574,
  fecha: '7 de noviembre de 2026',
  proveedor: [
    ['Razón social', 'Valle del Sol Quillón SpA'],
    ['RUT', '77.701.305-K'],
  ],
  dias: repartida(1_780_000),
  total: 1_780_000,
  conPropuesta: true,
  plazo: plazoDeLaCotizacion(LA_574),
  lugar: null,
  banco: [
    ['Banco', 'Banco de Prueba'],
    ['Número de cuenta', '000111222'],
  ],
  firma: {
    nombre: 'Hernán Felipe Vargas Droguett',
    razonSocial: 'Valle del Sol Quillón SpA',
  },
  ...extra,
});

describe('la cotización detallada', () => {
  it('cada día con su salón y cada comida por persona, con los precios de la cotización', () => {
    const dias = diasDeLaCotizacion(LA_574);
    expect(dias.map((d) => [d.titulo, d.subtotal])).toEqual([
      ['Miércoles 11 de noviembre de 2026', 896_000],
      ['Jueves 12 de noviembre de 2026', 892_000],
    ]);
    expect(dias[0].lineas).toEqual([
      {
        servicio: 'Salón auditorio día completo',
        detalle: '',
        cantidad: '1',
        unidades: 1,
        unitario: 250_000,
        total: 250_000,
        // Sus ids del catálogo: ahí va lo particular (decisión 120).
        codigos: ['39'],
      },
      expect.objectContaining({
        servicio: 'Desayuno',
        cantidad: '20 personas',
        unidades: 20,
        unitario: 9_200,
        total: 184_000,
      }),
      expect.objectContaining({
        servicio: 'Almuerzo',
        detalle:
          'Bebida libre consumo; Pan acompañado de pebre; Carne mechada; Puré de papa; Ensalada surtida de 3 ingredientes; Flan Casero',
        unitario: 16_900,
        total: 338_000,
      }),
      expect.objectContaining({
        servicio: 'Coffee & Cóctel',
        unitario: 6_200,
        total: 124_000,
      }),
    ]);
  });

  it('el plazo dice los días con su nombre', () => {
    expect(plazoDeLaCotizacion(LA_574)).toBe(
      'el miércoles 11 y el jueves 12 de noviembre de 2026',
    );
    expect(plazoDeLaCotizacion({ ...LA_574, event_end_date: null })).toBe(
      'el miércoles 11 de noviembre de 2026',
    );
    expect(plazoDeLaCotizacion({ ...LA_574, event_date: null })).toBeNull();
  });

  it('el Word: cada precio repartido hasta el precio postulado, sin descuento; neto e IVA, plazo, banco y firma', () => {
    const docx = armarLaCotizacionDetallada(datos());
    const texto = textoDeDocx(docx) ?? '';
    for (const t of [
      'COTIZACIÓN DETALLADA',
      'Compra Ágil 2705-1740-COT26',
      'Cotización N° 574 · Fecha: 7 de noviembre de 2026 · Validez: 30 días',
      'Miércoles 11 de noviembre de 2026',
      // El salón, el almuerzo por persona y el subtotal de cada día, ya
      // repartidos.
      '$248.890',
      '$16.824',
      '$336.480',
      'Subtotal miércoles 11 de noviembre de 2026',
      '$891.990',
      '$888.010',
      '$1.495.798',
      '$284.202',
      'Total con IVA incluido',
      '$1.780.000',
      'Incluye todo lo descrito en la propuesta técnica adjunta',
      'El servicio se presta el miércoles 11 y el jueves 12 de noviembre de 2026.',
      'Datos bancarios',
      'Banco de Prueba',
      'Hernán Felipe Vargas Droguett',
      'Representante legal',
    ]) {
      expect(texto).toContain(t);
    }
    for (const t of ['Descuento', '$1.788.000', '$250.000', '$16.900']) {
      expect(texto).not.toContain(t);
    }
    // Sin logo, sin imagen.
    expect(nombresDelZip(docx)).not.toContain('word/media/logo.png');
  });

  it('postulando al precio de la cotización, los precios quedan los suyos', () => {
    const texto =
      textoDeDocx(
        armarLaCotizacionDetallada(
          datos({ dias: repartida(1_788_000), total: 1_788_000 }),
        ),
      ) ?? '';
    expect(texto).not.toContain('Descuento');
    for (const t of ['$250.000', '$9.200', '$16.900', '$1.788.000']) {
      expect(texto).toContain(t);
    }
  });

  it('si el detalle no suma el precio, no sale un Word que se contradice', () => {
    expect(() =>
      armarLaCotizacionDetallada(datos({ dias: diasDeLaCotizacion(LA_574) })),
    ).toThrow('el detalle suma $1.788.000 y el precio es $1.780.000');
  });

  it('en una sola línea: «Servicio integral» por el total, con lo que incluye y sin precio por ítem (3904-996-COT26)', () => {
    const texto =
      textoDeDocx(
        armarLaCotizacionDetallada(
          datos({ total: 1_900_000, unaSolaLinea: true }),
        ),
      ) ?? '';
    expect(texto).toContain('COTIZACIÓN');
    expect(texto).not.toContain('COTIZACIÓN DETALLADA');
    expect(texto).toContain('Servicio integral');
    expect(texto).toContain('1 servicio');
    expect(texto).toContain('$1.900.000');
    expect(texto).not.toContain('Descuento');
    expect(texto).not.toContain('$9.200');
    expect(loQueIncluye(diasDeLaCotizacion(LA_574))).toMatch(
      /^Incluye: miércoles 11 de noviembre de 2026: Salón auditorio día completo; Desayuno para 20 personas \(Té twinings, café, leche;/,
    );
  });

  it('el detalle de precios, solo si las bases lo piden', () => {
    expect(
      pidenElDetalle({
        documentos: [
          {
            nombre:
              'Cotización detallada (con plazo de entrega, detalle de lo ofertado y datos bancarios)',
          },
        ],
      }),
    ).toBe(true);
    expect(
      pidenElDetalle({
        documentos: [{ nombre: 'Cotización con precios unitarios' }],
      }),
    ).toBe(true);
    expect(
      pidenElDetalle({
        documentos: [{ nombre: 'Cotización formal en pesos con IVA' }],
      }),
    ).toBe(false);
    expect(nombreDeLaCotizacionDetallada('3904-996-COT26', false)).toBe(
      'Cotización 3904-996-COT26.docx',
    );
    expect(
      esLaCotizacionDetallada('Cotización 3904-996-COT26 - firmado.pdf'),
    ).toBe(true);
  });

  it('con el logo, va arriba sin deformarse; sin banco ni plazo, esas secciones no van', () => {
    const docx = armarLaCotizacionDetallada(
      datos({ logo: { datos: PNG, tipo: 'png' }, banco: [], plazo: null }),
    );
    expect(nombresDelZip(docx)).toContain('word/media/logo.png');
    const documento = archivoDelZip(docx, 'word/document.xml')?.toString();
    // 1,6 cm de alto y el doble de ancho (400×200).
    expect(documento).toContain('<wp:extent cx="1152000" cy="576000"/>');
    const texto = textoDeDocx(docx) ?? '';
    expect(texto).not.toContain('Datos bancarios');
    expect(texto).not.toContain('Plazo de entrega');
  });

  it('el formato de la casa (Felipe, 07-11): los colores de la marca en los títulos, la tabla y el total; sin ellos, grises sobrios', () => {
    const conMarca =
      archivoDelZip(
        armarLaCotizacionDetallada(
          datos({ marca: { primario: '213A33', secundario: 'E9E2D3' } }),
        ),
        'word/document.xml',
      )?.toString() ?? '';
    // El encabezado de la tabla y el total, del color de la marca y en blanco.
    expect(conMarca).toContain('w:fill="213A33"');
    expect(conMarca).toContain('<w:color w:val="FFFFFF"/>');
    // Cada día, sobre el segundo color.
    expect(conMarca).toContain('w:fill="E9E2D3"');
    // Los títulos de cada parte, en mayúsculas y del color de la marca.
    expect(conMarca).toContain('<w:caps/><w:color w:val="213A33"/>');
    const sinMarca =
      archivoDelZip(
        armarLaCotizacionDetallada(datos()),
        'word/document.xml',
      )?.toString() ?? '';
    expect(sinMarca).not.toContain('213A33');
    expect(sinMarca).toContain('w:fill="1F2937"');
  });

  it('las medidas de un PNG y de un JPG; otra cosa no es un logo', () => {
    expect(medidasDeLaImagen(PNG)).toEqual({
      ancho: 400,
      alto: 200,
      tipo: 'png',
    });
    const jpg = Buffer.from([
      0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x11,
      0x08, 0x00, 0x96, 0x01, 0x2c, 0x03, 0x01, 0x22, 0x00,
    ]);
    expect(medidasDeLaImagen(jpg)).toEqual({
      ancho: 300,
      alto: 150,
      tipo: 'jpeg',
    });
    expect(medidasDeLaImagen(Buffer.from('no soy un logo'))).toBeNull();
  });

  it('se reconoce por su nombre, también firmada, y las bases la piden en la sección 4', () => {
    expect(nombreDeLaCotizacionDetallada('2705-1740-COT26')).toBe(
      'Cotización detallada 2705-1740-COT26.docx',
    );
    expect(
      esLaCotizacionDetallada(
        'Cotización detallada 2705-1740-COT26 - firmado.pdf',
      ),
    ).toBe(true);
    expect(esLaCotizacionDetallada('Propuesta técnica 2705.docx')).toBe(false);
    const pedida = {
      documentos: [
        {
          nombre:
            'Cotización detallada (con plazo de entrega, detalle de lo ofertado y datos bancarios)',
          cuando: 'con_la_oferta',
        },
      ],
    };
    expect(pidenLaCotizacion(pedida)).toBe(true);
    expect(
      pidenLaCotizacion({
        documentos: [{ nombre: 'Cotización', cuando: 'para_contratar' }],
      }),
    ).toBe(false);
    expect(pidenLaCotizacion({ documentos: [] })).toBe(false);
    // Desde la decisión 120 la arma Eventia también sin vinculada.
    expect(laCotizacionQueFalta(pedida.documentos, [])).toBe(
      'Las bases piden una cotización: vuelve a armar la postulación (la arma Eventia con lo postulado, o con tu cotización si la vinculas), o súbela hecha a «Mi postulación».',
    );
    expect(
      laCotizacionQueFalta(pedida.documentos, [
        {
          nombre: 'Cotización detallada 2705-1740-COT26.docx',
          ruta: 'c1/x',
          bytes: 1,
          carpetas: ['economica'],
          que_es: 'cotizacion',
          aviso: null,
        },
      ]),
    ).toBeNull();
  });
});

// EL REPARTO DEL PRECIO (decisión 119, 07-11). Felipe: "la cotización manda
// en los servicios", no en el precio; si piden el precio por ítem, "los
// precios se reparten con algún criterio y que la suma calce perfecto".
describe('el reparto del precio', () => {
  it('la 574 a $1.780.000: cada precio baja en la misma proporción y los dos salones absorben el redondeo por partes iguales; suma justo el total y, en neto, justo el neto', () => {
    const dias = repartida(1_780_000);
    expect(precios(dias)).toEqual([
      [
        'Miércoles 11 de noviembre de 2026',
        891_990,
        [
          ['Salón auditorio día completo', '1', 248_890, 209_149],
          ['Desayuno', '20 personas', 9_159, 7_696],
          ['Almuerzo', '20 personas', 16_824, 14_138],
          ['Coffee & Cóctel', '20 personas', 6_172, 5_187],
        ],
      ],
      [
        'Jueves 12 de noviembre de 2026',
        888_010,
        [
          ['Salón auditorio día completo', '1', 248_890, 209_149],
          ['Desayuno', '20 personas', 8_960, 7_529],
          ['Almuerzo', '20 personas', 16_824, 14_138],
          ['Coffee & Cóctel', '20 personas', 6_172, 5_187],
        ],
      ],
    ]);
    expect(suma(dias)).toBe(1_780_000);
    expect(suma(dias, true)).toBe(1_495_798);
    expect(dias[0].lineas[2]).toMatchObject({
      total: 336_480,
      totalNeto: 282_760,
    });
    expect(calzaCon(dias, 1_780_000)).toBe(true);
    expect(calzaCon(dias, 1_788_000)).toBe(false);
    // La cotización de Eventia no se toca: se reparte sobre una copia.
    expect(diasDeLaCotizacion(LA_574)[0].lineas[0].unitario).toBe(250_000);
  });

  it('a un precio mayor que la cotización, los precios suben igual (ya no va en una sola línea)', () => {
    const dias = repartida(1_900_000);
    expect(dias[0].lineas.map((l) => l.unitario)).toEqual([
      265_660, 9_776, 17_959, 6_588,
    ]);
    expect(suma(dias)).toBe(1_900_000);
    expect(suma(dias, true)).toBe(1_596_639);
  });

  it('al precio de la cotización, cada precio queda el suyo', () => {
    const dias = repartida(1_788_000);
    expect(dias.map((d) => d.subtotal)).toEqual([896_000, 892_000]);
    expect(dias[0].lineas.map((l) => l.unitario)).toEqual([
      250_000, 9_200, 16_900, 6_200,
    ]);
  });

  /** Una cotización sin salón: solo comidas por persona. */
  const sinSalon = (personas: number): DiaDeLaCotizacion[] =>
    diasDeLaCotizacion({
      ...LA_574,
      event_end_date: null,
      items: {
        fixed_services: [],
        variable_services: [
          {
            day: 1,
            people: personas,
            category: 'Almuerzo',
            items: [linea('2070', 'Carne mechada', 16_900)],
          },
          {
            day: 1,
            people: personas,
            category: 'Coffee',
            items: [linea('2042', 'Bollería', 6_200)],
          },
        ],
      },
    });

  it('sin salón, el precio por persona calza si el total se divide; el neto por persona, si no da exacto, no va', () => {
    const dias = repartirElPrecio(sinSalon(20), 1_000_000) ?? [];
    expect(dias[0].lineas.map((l) => [l.cantidad, l.unitario])).toEqual([
      ['20 personas', 36_580],
      ['20 personas', 13_420],
    ]);
    expect(suma(dias)).toBe(1_000_000);
    // $840.336 de neto no se reparte exacto entre 20 personas.
    expect(dias[0].lineas[0].unitarioNeto).toBeUndefined();
    expect(calzaCon(dias, 1_000_000)).toBe(true);
  });

  it('sin salón y sin un precio por persona exacto, la comida más grande va como un servicio por su total y calza al peso', () => {
    const dias = repartirElPrecio(sinSalon(37), 1_000_000) ?? [];
    expect(
      dias[0].lineas.map((l) => [l.detalle, l.cantidad, l.unitario]),
    ).toEqual([
      ['Carne mechada, para 37 personas', '1 servicio', 731_602],
      ['Bollería', '37 personas', 7_254],
    ]);
    expect(suma(dias)).toBe(1_000_000);
    expect(suma(dias, true)).toBe(840_336);
  });

  it('lo que no tiene precio queda en $0; sin precios o sin precio, no hay reparto', () => {
    const conRegalo = diasDeLaCotizacion({
      ...LA_574,
      items: {
        fixed_services: [
          { day: 1, ...linea('39', 'Salón', 250_000) },
          { day: 1, ...linea('40', 'Estacionamiento', 0) },
        ],
        variable_services: [],
      },
    });
    const dias = repartirElPrecio(conRegalo, 200_000) ?? [];
    expect(dias[0].lineas.map((l) => l.unitario)).toEqual([200_000, 0]);
    expect(
      repartirElPrecio(
        diasDeLaCotizacion({
          ...LA_574,
          items: { fixed_services: [], variable_services: [] },
        }),
        200_000,
      ),
    ).toBeNull();
    expect(repartirElPrecio(diasDeLaCotizacion(LA_574), 0)).toBeNull();
  });

  it('el reparto guardado con los anexos se lee si tiene su forma', () => {
    const dias = repartida(1_780_000);
    expect(repartoGuardado(JSON.parse(JSON.stringify(dias)))).toEqual(dias);
    expect(repartoGuardado([])).toBeNull();
    expect(repartoGuardado('no')).toBeNull();
    expect(
      repartoGuardado([{ titulo: 'Día 1', subtotal: 1, lineas: [{}] }]),
    ).toBeNull();
  });
});
