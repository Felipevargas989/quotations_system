import {
  cierreCambio,
  codigosDeRegiones,
  fechaChileAIso,
  normalizar,
  procesoDesdeCompraAgil,
  procesoDesdeLicitacion,
  regionCalza,
} from '../mercado-publico/mapeo';

describe('normalizar y regiones', () => {
  it('quita tildes, signos y mayúsculas', () => {
    expect(normalizar('Región del Bío-Bío')).toBe('region del biobio');
    expect(normalizar('  Ñuble  ')).toBe('nuble');
  });

  it('la región configurada calza por contenido con la de la API', () => {
    expect(regionCalza('Región del Ñuble', ['Ñuble', 'Biobío'])).toBe(true);
    expect(regionCalza('Región del Biobío', ['Ñuble', 'Biobío'])).toBe(true);
    expect(regionCalza('Región del Maule', ['Ñuble', 'Biobío'])).toBe(false);
    expect(regionCalza(null, ['Ñuble'])).toBe(false);
  });

  it('la misma región escrita distinto calza igual ("Bío Bío" = "Biobío")', () => {
    expect(regionCalza('Región del Bío Bío', ['Biobío'])).toBe(true);
    expect(regionCalza('Region del BioBio', ['Bío-Bío'])).toBe(true);
    expect(codigosDeRegiones(['Bío Bío', 'Los Ríos'])).toEqual([8, 14]);
  });

  it('las regiones se traducen al número oficial que pide Compra Ágil', () => {
    expect(codigosDeRegiones(['Ñuble', 'Biobío'])).toEqual([8, 16]);
    expect(codigosDeRegiones(['Región Metropolitana'])).toEqual([13]);
    expect(codigosDeRegiones([])).toEqual([]);
  });
});

describe('fechaChileAIso: la hora de Chile sin zona no puede quedar corrida', () => {
  it('en horario de verano (UTC-3): las 16:00 de Chile son las 19:00 UTC', () => {
    // El cierre real del Día del Profesor 2026 (4364-13-LE26).
    expect(fechaChileAIso('2026-10-19T16:00:00')).toBe(
      '2026-10-19T19:00:00.000Z',
    );
  });

  it('en horario de invierno (UTC-4): las 10:00 de Chile son las 14:00 UTC', () => {
    expect(fechaChileAIso('2026-07-10T10:00:00')).toBe(
      '2026-07-10T14:00:00.000Z',
    );
  });

  it('si la fecha ya trae zona, se respeta', () => {
    expect(fechaChileAIso('2026-10-19T19:00:00Z')).toBe(
      '2026-10-19T19:00:00.000Z',
    );
    expect(fechaChileAIso('2026-10-19T16:00:00-03:00')).toBe(
      '2026-10-19T19:00:00.000Z',
    );
  });

  it('vacía o rara → null', () => {
    expect(fechaChileAIso(null)).toBeNull();
    expect(fechaChileAIso('')).toBeNull();
    expect(fechaChileAIso('mañana')).toBeNull();
  });
});

describe('procesoDesdeLicitacion', () => {
  it('traduce el detalle de la API a la fila de mp_procesos', () => {
    const p = procesoDesdeLicitacion({
      CodigoExterno: '4364-13-LE26',
      Nombre: 'Producción de Evento día del Profesor',
      Descripcion: 'Conmemorar a los docentes',
      Estado: 'Publicada',
      MontoEstimado: 15960000,
      Moneda: 'CLP',
      Comprador: {
        CodigoOrganismo: '1234',
        NombreOrganismo: 'I MUNICIPALIDAD DE QUILLON',
        NombreUnidad: 'Educación',
        ComunaUnidad: 'Quillón',
        RegionUnidad: 'Región del Ñuble',
      },
      Fechas: {
        FechaPublicacion: '2026-10-09T15:54:00',
        FechaCierre: '2026-10-19T16:00:00',
      },
      Items: {
        Listado: [{ NombreProducto: 'Producción de eventos', Cantidad: 1 }],
      },
    });
    expect(p).toMatchObject({
      codigo: '4364-13-LE26',
      tipo: 'licitacion',
      organismo: 'I MUNICIPALIDAD DE QUILLON',
      comuna: 'Quillón',
      region: 'Región del Ñuble',
      monto: 15960000,
      fecha_cierre: '2026-10-19T19:00:00.000Z',
      fecha_publicacion: '2026-10-09T18:54:00.000Z',
      adjudicacion: null,
    });
    expect(p?.productos).toEqual([
      { nombre: 'Producción de eventos', descripcion: null, cantidad: 1 },
    ]);
  });

  it('guarda quién ganó y a qué precio cuando viene la adjudicación', () => {
    // El Día del Profesor 2025: una sola oferta, $12.000.000.
    const p = procesoDesdeLicitacion({
      CodigoExterno: '4364-5-LE25',
      Nombre: 'Producción de evento día del profesor y asistentes',
      Adjudicacion: {
        Numero: '123',
        NumeroOferentes: 1,
        UrlActa: 'http://acta',
      },
      Items: {
        Listado: [
          {
            NombreProducto: 'Producción de evento',
            Adjudicacion: {
              RutProveedor: '77067895-1',
              NombreProveedor: 'CENTRO TURISTICO SOL DE QUILLON SPA',
              Cantidad: 1,
              MontoUnitario: 12000000,
            },
          },
        ],
      },
    });
    expect(p?.adjudicacion).toMatchObject({
      oferentes: 1,
      url_acta: 'http://acta',
      ganadores: [
        {
          rut: '77067895-1',
          nombre: 'CENTRO TURISTICO SOL DE QUILLON SPA',
          monto_unitario: 12000000,
        },
      ],
    });
  });

  it('monto 0 es "no informado", y sin código o nombre no hay fila', () => {
    expect(
      procesoDesdeLicitacion({
        CodigoExterno: 'X',
        Nombre: 'Y',
        MontoEstimado: 0,
      })?.monto,
    ).toBeNull();
    expect(procesoDesdeLicitacion({ Nombre: 'sin código' })).toBeNull();
    expect(procesoDesdeLicitacion(null)).toBeNull();
  });
});

describe('procesoDesdeCompraAgil', () => {
  it('junta la fila de la lista con su detalle', () => {
    const p = procesoDesdeCompraAgil(
      {
        codigo: '5040-209-COT26',
        nombre: 'Servicio de coffee break biblioteca municipal',
        institucion: {
          nombre_region: 'Región del Ñuble',
          organismo_comprador: 'ILUSTRE MUNICIPALIDAD DE QUILLON',
        },
        montos: { monto_disponible_clp: 400000 },
        fechas: { fecha_cierre: '2026-10-19T15:00:00Z' },
        estado: { glosa: 'Publicada' },
      },
      {
        descripcion: 'Coffee con entrega parcializada',
        productos_solicitados: [
          { nombre: 'Coffee break', descripcion: 'para 40' },
        ],
      },
    );
    expect(p).toMatchObject({
      codigo: '5040-209-COT26',
      tipo: 'compra_agil',
      monto: 400000,
      region: 'Región del Ñuble',
      descripcion: 'Coffee con entrega parcializada',
      fecha_cierre: '2026-10-19T15:00:00.000Z',
    });
    expect(p?.productos).toEqual([
      { nombre: 'Coffee break', descripcion: 'para 40' },
    ]);
  });

  it('sin detalle igual sirve (nombre, comprador y monto vienen en la lista)', () => {
    const p = procesoDesdeCompraAgil(
      { codigo: 'A-1-COT26', nombre: 'Almuerzo' },
      null,
    );
    expect(p?.descripcion).toBeNull();
    expect(p?.productos).toEqual([]);
  });
});

describe('cierreCambio', () => {
  it('compara instantes, no textos', () => {
    expect(
      cierreCambio('2026-10-19T19:00:00.000Z', '2026-10-19T19:00:00Z'),
    ).toBe(false);
    expect(
      cierreCambio('2026-10-19T19:00:00.000Z', '2026-10-21T19:00:00.000Z'),
    ).toBe(true);
    expect(cierreCambio(null, '2026-10-21T19:00:00.000Z')).toBe(true);
    expect(cierreCambio(null, null)).toBe(false);
  });
});
