import { comprasAgilesDelMes } from '../datos-abiertos/compras-agiles-del-mes';
import type { FilaDelCsv } from '../datos-abiertos/csv';
import {
  codigoDelRubro,
  mesesHaciaAtras,
  nombreDelRubro,
  numero,
  urlDelArchivo,
} from '../datos-abiertos/datos-abiertos';
import { licitacionesDelMes } from '../datos-abiertos/licitaciones-del-mes';
import { filaDeCompraAgil, filaDeLicitacion } from './datos-abiertos-de-prueba';

// EL MERCADO DE TODO CHILE (decisión 101, 28-10). Felipe: "traigamos todas
// las licitaciones de Chile", "licitaciones y compra agiles... :D".

async function* deLista(filas: FilaDelCsv[]) {
  for (const f of filas) {
    await Promise.resolve();
    yield f;
  }
}

describe('Los archivos de ChileCompra (decisión 101)', () => {
  it('cada fuente tiene su nombre: licitaciones sin cero, compra ágil con cero', () => {
    expect(urlDelArchivo('licitaciones', { anio: 2025, mes: 1 })).toBe(
      'https://transparenciachc.blob.core.windows.net/lic-da/2025-1.zip',
    );
    expect(urlDelArchivo('compra_agil', { anio: 2025, mes: 1 })).toBe(
      'https://transparenciachc.blob.core.windows.net/trnspchc/COT_2025-01.zip',
    );
  });

  it('los meses van del más nuevo al más viejo, en hora de Chile', () => {
    expect(mesesHaciaAtras(new Date('2026-02-10T12:00:00Z'), 3)).toEqual([
      { anio: 2026, mes: 2 },
      { anio: 2026, mes: 1 },
      { anio: 2025, mes: 12 },
    ]);
    // 1 de noviembre a las 02:00 UTC todavía es 31 de octubre en Chile.
    expect(mesesHaciaAtras(new Date('2026-11-01T02:00:00Z'), 1)).toEqual([
      { anio: 2026, mes: 10 },
    ]);
  });

  it('lee los números como vienen: coma decimal y notación científica', () => {
    expect(numero('1,5e+08')).toBe(150_000_000);
    expect(numero('62213,2')).toBe(62213.2);
    expect(numero('')).toBeNull();
    expect(numero('NA')).toBeNull();
  });

  it('el rubro se reconoce por el código ONU o por el nombre', () => {
    expect(codigoDelRubro('90101603')).toBe(true); // catering
    expect(codigoDelRubro('80141607')).toBe(true); // producción de eventos
    expect(codigoDelRubro('90111501')).toBe(true); // hoteles
    expect(codigoDelRubro('49101704')).toBe(false); // galvanos
    expect(nombreDelRubro('CENA ACTIVIDAD DÍA DEL FUNCIONARIO')).toBe(true);
    expect(nombreDelRubro('Celebración aniversario comunal')).toBe(true);
    expect(nombreDelRubro('ESCENARIO MÓVIL PARA ACTOS')).toBe(false);
    expect(nombreDelRubro('Suministro de ventanas')).toBe(false);
  });
});

describe('Las licitaciones de un mes (decisión 101)', () => {
  it('una fila por licitación y una por proveedor, con lo adjudicado en pesos', async () => {
    const r = await licitacionesDelMes(
      deLista([
        filaDeLicitacion(),
        filaDeLicitacion({
          Correlativo: '2',
          MontoUnitarioOferta: '100000',
          'Cantidad Ofertada': '1',
          CantidadAdjudicada: '1',
          'Valor Total Ofertado': '100000',
        }),
        filaDeLicitacion({
          RutProveedor: '77.222.222-2',
          NombreProveedor: 'LA COMPETENCIA',
          'Oferta seleccionada': 'No Seleccionada',
          CantidadAdjudicada: '0',
          'Valor Total Ofertado': '15000000',
        }),
      ]),
      '2025-10-01',
    );
    expect(r.filas).toBe(3);
    expect(r.licitaciones).toHaveLength(1);
    const [l] = r.licitaciones;
    expect(l).toMatchObject({
      codigo: '4352-6-LE25',
      mes: '2025-10-01',
      region: 'Región del Ñuble',
      monto_estimado: 17_000_000,
      monto_adjudicado: 13_949_580 + 100_000,
      oferentes: 2,
      lineas: 2,
      rubros: ['RESTAURANTES Y CATERING'],
      del_rubro: true,
    });
    expect(r.ofertas).toEqual([
      expect.objectContaining({
        rut: '76.111.111-1',
        gano: true,
        lineas_ofertadas: 2,
        lineas_ganadas: 2,
        monto_ofertado: 13_949_580 + 100_000,
        monto_adjudicado: 13_949_580 + 100_000,
      }),
      expect.objectContaining({
        rut: '77.222.222-2',
        proveedor: 'LA COMPETENCIA',
        gano: false,
        monto_ofertado: 15_000_000,
        monto_adjudicado: null,
      }),
    ]);
  });

  it('la cantidad adjudicada no pasa de la ofertada: la cena de Coelemu no suma billones', async () => {
    const r = await licitacionesDelMes(
      deLista([
        filaDeLicitacion({
          CodigoExterno: '3784-128-LE25',
          MontoUnitarioOferta: '62213,2',
          'Cantidad Ofertada': '200',
          CantidadAdjudicada: '12442640',
          'Valor Total Ofertado': '12442640',
        }),
      ]),
      '2025-10-01',
    );
    expect(r.licitaciones[0].monto_adjudicado).toBe(12_442_640);
  });

  it('lo ofertado en dólares o UF no se suma a los pesos', async () => {
    const r = await licitacionesDelMes(
      deLista([filaDeLicitacion({ 'Moneda de la Oferta': 'Dolar' })]),
      '2025-10-01',
    );
    expect(r.licitaciones[0].monto_adjudicado).toBeNull();
    expect(r.ofertas[0]).toMatchObject({ gano: true, monto_ofertado: null });
  });

  it('una licitación desierta, sin ofertas, igual queda; el rubro sale del código aunque el nombre no lo diga', async () => {
    const r = await licitacionesDelMes(
      deLista([
        filaDeLicitacion({
          CodigoExterno: '2408-269-LE25',
          Nombre: 'SERVICIO INTEGRAL PARA ACTIVIDAD ANUAL',
          Estado: 'Desierta (o art. 3 ó 9 Ley 19.886)',
          CodigoProductoONU: '80141607',
          RutProveedor: '',
        }),
      ]),
      '2025-10-01',
    );
    expect(r.licitaciones[0]).toMatchObject({
      estado: 'Desierta (o art. 3 ó 9 Ley 19.886)',
      del_rubro: true,
      monto_adjudicado: null,
    });
    expect(r.ofertas).toEqual([]);
  });
});

describe('Las compras ágiles de un mes (decisión 101)', () => {
  const OTRO = {
    RUTProveedor: '77.222.222-2',
    RazonSocialProveedor: 'LA COMPETENCIA',
    ProveedorSeleccionado: 'no',
  };
  const FILAS = [
    // Del rubro por el nombre: dos productos, dos proveedores; el elegido
    // repite su total en cada producto.
    filaDeCompraAgil(),
    filaDeCompraAgil({
      CodigoProducto: '90111501',
      NombreProductoGenerico: 'Arriendo de salón',
    }),
    filaDeCompraAgil({ ...OTRO, MontoTotal: '6100000' }),
    filaDeCompraAgil({
      ...OTRO,
      MontoTotal: '5900000',
      NombreProductoGenerico: 'Arriendo de salón',
    }),
    // Del rubro por el código del segundo producto; nadie elegido todavía.
    filaDeCompraAgil({
      CodigoCotizacion: '3497-470-COT26',
      NombreCotizacion: 'ADQUISICIÓN PARA ACTIVIDAD DE FIN DE AÑO',
      CodigoProducto: '43211507',
      NombreProductoGenerico: 'Computadores',
      ProveedorSeleccionado: 'no',
      Estado: 'Cerrada',
    }),
    filaDeCompraAgil({
      CodigoCotizacion: '3497-470-COT26',
      NombreCotizacion: 'ADQUISICIÓN PARA ACTIVIDAD DE FIN DE AÑO',
      CodigoProducto: '90111501',
      ProveedorSeleccionado: 'no',
      Estado: 'Cerrada',
    }),
    // Fuera del rubro: solo cuenta en los totales.
    filaDeCompraAgil({
      CodigoCotizacion: '3497-480-COT26',
      NombreCotizacion: 'RESMAS DE PAPEL',
      CodigoProducto: '14111507',
      NombreProductoGenerico: 'Papel para impresora',
      MontoTotal: '300000',
    }),
  ];

  it('las del rubro quedan con cada cotización, contando una vez el total que se repite', async () => {
    const r = await comprasAgilesDelMes(() => deLista(FILAS), '2026-10-01');
    expect(r.filas).toBe(FILAS.length);
    expect(r.todas).toBe(3);
    expect(r.solicitudes.map((s) => s.codigo)).toEqual([
      '3497-466-COT26',
      '3497-470-COT26',
    ]);
    expect(r.solicitudes[0]).toMatchObject({
      region: 'Región del Ñuble',
      monto_disponible: 6_000_000,
      cotizaciones: 2,
      rut_elegido: '76.111.111-1',
      proveedor_elegido: 'VALLE DEL SOL SPA',
      monto_elegido: 5_800_000,
      productos: 'Servicios de catering · Arriendo de salón',
    });
    expect(r.solicitudes[1]).toMatchObject({
      cotizaciones: 1,
      rut_elegido: null,
      monto_elegido: null,
    });
    // La competencia mandó dos montos: vale el más barato.
    expect(r.cotizaciones.filter((c) => c.codigo === '3497-466-COT26')).toEqual(
      [
        expect.objectContaining({
          rut: '76.111.111-1',
          monto: 5_800_000,
          elegida: true,
        }),
        expect.objectContaining({
          rut: '77.222.222-2',
          monto: 5_900_000,
          elegida: false,
        }),
      ],
    );
  });

  it('todas suman en los totales de su unidad de compra, separando las del rubro', async () => {
    const r = await comprasAgilesDelMes(() => deLista(FILAS), '2026-10-01');
    expect(r.totales).toEqual([
      expect.objectContaining({
        mes: '2026-10-01',
        unidad_codigo: '3497',
        organismo: 'I MUNICIPALIDAD DE COBQUECURA',
        solicitudes: 3,
        con_elegido: 2,
        monto_elegido: 5_800_000 + 300_000,
        solicitudes_rubro: 2,
        monto_rubro: 5_800_000,
      }),
    ]);
  });

  it('lo elegido en otra moneda no se suma a los pesos', async () => {
    const r = await comprasAgilesDelMes(
      () => deLista([filaDeCompraAgil({ moneda: 'USD' })]),
      '2026-10-01',
    );
    expect(r.solicitudes[0]).toMatchObject({
      rut_elegido: '76.111.111-1',
      monto_elegido: null,
    });
    expect(r.totales[0]).toMatchObject({ con_elegido: 1, monto_elegido: 0 });
  });

  it('en los archivos hasta septiembre de 2025, sin NombreOOPP, el organismo es la razón social de la unidad', async () => {
    const antigua = filaDeCompraAgil({
      RazonSocialUnidaddeCompra: 'I MUNICIPALIDAD DE COBQUECURA',
    });
    delete antigua['NombreOOPP'];
    const r = await comprasAgilesDelMes(() => deLista([antigua]), '2024-10-01');
    expect(r.solicitudes[0].organismo).toBe('I MUNICIPALIDAD DE COBQUECURA');
    expect(r.totales[0].organismo).toBe('I MUNICIPALIDAD DE COBQUECURA');
  });
});
