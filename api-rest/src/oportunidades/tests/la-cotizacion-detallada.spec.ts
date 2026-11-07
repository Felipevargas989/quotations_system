import { archivoDelZip, nombresDelZip, textoDeDocx } from '../analisis/docx';
import {
  armarLaCotizacionDetallada,
  type DatosDeLaCotizacionDetallada,
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
// Bío-Bío, con la N° 574 vinculada ($1.788.000 a precios del catálogo,
// $8.000 de descuento, $1.780.000 con IVA).

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
  dias: diasDeLaCotizacion(LA_574),
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
        unitario: 250_000,
        total: 250_000,
      },
      expect.objectContaining({
        servicio: 'Desayuno',
        cantidad: '20 personas',
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

  it('el Word: el detalle, el descuento hasta el precio postulado, neto e IVA, plazo, banco y firma', () => {
    const docx = armarLaCotizacionDetallada(datos());
    const texto = textoDeDocx(docx) ?? '';
    for (const t of [
      'COTIZACIÓN DETALLADA',
      'Compra Ágil 2705-1740-COT26',
      'Cotización N° 574 · Fecha: 7 de noviembre de 2026 · Validez: 30 días',
      'Miércoles 11 de noviembre de 2026',
      'Subtotal',
      '$1.788.000',
      '-$8.000',
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
    // Sin logo, sin imagen.
    expect(nombresDelZip(docx)).not.toContain('word/media/logo.png');
  });

  it('postulando a precio de la cotización, sin descuento: el total es el subtotal', () => {
    const texto =
      textoDeDocx(armarLaCotizacionDetallada(datos({ total: 1_788_000 }))) ??
      '';
    expect(texto).not.toContain('Descuento');
    expect(texto).toContain('$1.788.000');
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
    expect(laCotizacionQueFalta(pedida.documentos, [])).toContain(
      'Las bases piden una cotización detallada',
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
