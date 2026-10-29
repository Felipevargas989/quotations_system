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
import { ordenesDeCompraDelMes } from '../datos-abiertos/ordenes-de-compra-del-mes';
import {
  filaDeCompraAgil,
  filaDeLicitacion,
  filaDeOrdenDeCompra,
} from './datos-abiertos-de-prueba';

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
    // Decisión 108: las órdenes de compra, también sin cero.
    expect(urlDelArchivo('ordenes_de_compra', { anio: 2026, mes: 9 })).toBe(
      'https://transparenciachc.blob.core.windows.net/oc-da/2026-9.zip',
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
    // Fuera del rubro: cuenta en los totales y, como es de un municipio,
    // queda sin sus cotizaciones (decisión 108).
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
      '3497-480-COT26',
    ]);
    expect(r.solicitudes.map((s) => s.del_rubro)).toEqual([true, true, false]);
    expect(r.cotizaciones.some((c) => c.codigo === '3497-480-COT26')).toBe(
      false,
    );
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

describe('Las compras ágiles de los municipios (decisión 108)', () => {
  it('las de un municipio quedan aunque no sean del rubro, con sus cotizaciones contadas pero no guardadas', async () => {
    const fuera = {
      CodigoCotizacion: '3497-500-COT26',
      NombreCotizacion: 'COMPRA DE NEUMATICOS',
      CodigoProducto: '25172504',
      NombreProductoGenerico: 'Neumáticos',
      MontoTotal: '900000',
    };
    const filas = [
      filaDeCompraAgil(fuera),
      filaDeCompraAgil({
        ...fuera,
        RUTProveedor: '77.222.222-2',
        ProveedorSeleccionado: 'no',
        MontoTotal: '950000',
      }),
      // Un servicio de salud, fuera del rubro: no queda.
      filaDeCompraAgil({
        ...fuera,
        CodigoCotizacion: '1057-9-COT26',
        NombreOOPP: 'SERVICIO DE SALUD ÑUBLE',
      }),
      // Del rubro, del municipio: queda con su cotización.
      filaDeCompraAgil(),
    ];
    const del = await comprasAgilesDelMes(() => deLista(filas), '2026-10-01');
    const neumaticos = del.solicitudes.find(
      (s) => s.codigo === '3497-500-COT26',
    );
    expect(neumaticos).toMatchObject({
      del_rubro: false,
      municipal: true,
      cotizaciones: 2,
      rut_elegido: '76.111.111-1',
      monto_elegido: 900000,
    });
    expect(del.solicitudes.some((s) => s.codigo === '1057-9-COT26')).toBe(
      false,
    );
    expect(
      del.solicitudes.find((s) => s.codigo === '3497-466-COT26'),
    ).toMatchObject({
      del_rubro: true,
      municipal: true,
    });
    expect(del.cotizaciones.map((c) => c.codigo)).toEqual(['3497-466-COT26']);
    // Igual cuentan las tres en los totales de su unidad.
    expect(del.todas).toBe(3);
  });
});

describe('Las órdenes de compra de un mes (decisión 108)', () => {
  it('quedan solo las de municipios, una por orden, con su organismo y su proveedor aparte', async () => {
    const nombre = 'ADQUISICION DE SERVICIOS VARIOS';
    const filas = [
      filaDeOrdenDeCompra({ Nombre: nombre, codigoProductoONU: '50192100' }),
      // La segunda línea es catering: la orden pasa a ser del rubro.
      filaDeOrdenDeCompra({ Nombre: nombre, codigoProductoONU: '90101603' }),
      filaDeOrdenDeCompra({
        Codigo: '1057-80-CM26',
        sector: 'Salud',
        OrganismoPublico: 'SERVICIO DE SALUD ÑUBLE',
      }),
    ];
    const del = await ordenesDeCompraDelMes(deLista(filas), '2026-10-01');
    expect(del.filas).toBe(3);
    expect(del.todas).toBe(2);
    expect(del.ordenes).toEqual([
      {
        codigo: '3497-120-SE26',
        mes: '2026-10-01',
        fecha_envio: '2026-10-21',
        nombre,
        tipo: 'SE',
        modalidad: 'licitacion',
        causal: null,
        emergencia: false,
        estado: 'Aceptada',
        organismo_codigo: '7240',
        unidad_codigo: '3497',
        rut_proveedor: '76.111.111-1',
        monto: 6902000,
        codigo_licitacion: '3497-55-LE26',
        del_rubro: true,
      },
    ]);
    expect(del.organismos).toEqual([
      {
        codigo: '7240',
        nombre: 'I MUNICIPALIDAD DE COBQUECURA',
        sector: 'Municipalidades',
        region: 'Región del Ñuble',
        ciudad: 'Cobquecura',
      },
    ]);
    expect(del.proveedores).toEqual([
      {
        rut: '76.111.111-1',
        nombre: 'VALLE DEL SOL SPA',
        actividad: 'SERVICIOS DE BANQUETERIA',
        comuna: 'Quillón',
        region: 'Región del Ñuble',
      },
    ]);
  });

  it('cada modalidad sale del tipo o de la procedencia, y el trato directo trae su causal', async () => {
    const orden = (Codigo: string, cambios: FilaDelCsv) =>
      filaDeOrdenDeCompra({
        Codigo,
        CodigoLicitacion: 'NA',
        codigoProductoONU: '50192100',
        Nombre: 'ARRIENDO',
        ...cambios,
      });
    const filas = [
      orden('1-AG26', { Tipo: 'AG', ProcedenciaOC: 'NA', EsCompraAgil: 'Si' }),
      orden('2-CM26', {
        Tipo: 'CM',
        ProcedenciaOC: 'Proveniente de convenio marco',
      }),
      orden('3-TD26', {
        Tipo: 'TD',
        EsTratoDirecto: 'Si',
        ProcedenciaOC: 'Emergencia, urgencia o imprevisto',
      }),
      orden('4-SE26', {
        ProcedenciaOC:
          'Si sólo existe un proveedor del bien o servicio. (Monto igual o inferior a 1.000 UTM)',
      }),
      orden('5-SE26', { ProcedenciaOC: 'Orden de Compra para informar' }),
      orden('6-SE26', {
        ProcedenciaOC:
          'licitación pública previa sin ofertas, o con ofertas inadmisibles',
      }),
    ];
    const del = await ordenesDeCompraDelMes(deLista(filas), '2026-10-01');
    const por = Object.fromEntries(del.ordenes.map((o) => [o.codigo, o]));
    expect(por['1-AG26'].modalidad).toBe('compra_agil');
    expect(por['2-CM26'].modalidad).toBe('convenio_marco');
    expect(por['3-TD26']).toMatchObject({
      modalidad: 'trato_directo',
      causal: 'Emergencia, urgencia o imprevisto',
      emergencia: true,
    });
    expect(por['4-SE26']).toMatchObject({
      modalidad: 'trato_directo',
      emergencia: false,
    });
    expect(por['5-SE26']).toMatchObject({ modalidad: 'otra', causal: null });
    expect(por['6-SE26'].modalidad).toBe('trato_directo');
    expect(por['1-AG26'].codigo_licitacion).toBeNull();
    expect(del.ordenes.every((o) => !o.del_rubro)).toBe(true);
  });

  it('el monto queda en pesos enteros, aunque venga con decimales', async () => {
    const del = await ordenesDeCompraDelMes(
      deLista([
        filaDeOrdenDeCompra({ MontoTotalOC_PesosChilenos: '520101856,628794' }),
      ]),
      '2026-10-01',
    );
    expect(del.ordenes[0].monto).toBe(520101857);
  });
});
