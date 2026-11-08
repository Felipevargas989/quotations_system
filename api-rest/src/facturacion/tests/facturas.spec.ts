import { BadRequestException, ConflictException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { mockPinoLogger } from '../../testing/mocks';
import { FacturacionClSimulado } from '../facturacion-cl/simulado';
import type { DtePedido } from '../facturas/borrador';
import { DtePedidoDto } from '../facturas/factura.dto';
import { FacturasService } from '../facturas/facturas.service';

/**
 * EMITIR EL DTE DEL EVENTO (doc 19 §9.10 y §9.20), contra facturacion.cl
 * simulado: el folio que sigue, un envío a la vez, el «por confirmar» si se
 * corta, y lo que queda después (el PDF, la razón social y la nota de
 * BelIA). La boleta sale por el camino de las boletas de recepción.
 */

const EVENTO = {
  id: 'ev-423',
  numero: 423,
  estado: 'realizada',
  tipoDeEvento: 'Estadía y Alimentación',
  desde: '2026-08-11',
  hasta: '2026-08-15',
  personas: 40,
  total: 3440000,
  clientId: 'joker',
  cliente: 'JOKER SERVICIOS SPA',
};

const OC = {
  id: 12,
  numero: '1213301-49-AG26',
  fecha: '2026-05-15',
  rut: '69141400-0',
  razon_social: 'ILUSTRE MUNICIPALIDAD DE QUILLON',
  comprador: {
    giro: null,
    direccion: 'Calle 18 de Septiembre N°250',
    comuna: 'Quillón',
    ciudad: null,
  },
  descripcion: 'Servicio de Catering y Arriendo de Salón, Ciclo de Foros 2026',
  neto: 2084034,
  iva: 395966,
  total: 2480000,
  documento_id: null,
};

const PEDIDA: DtePedido = {
  tipo: 33,
  orden_de_compra_id: 12,
  receptor: {
    rut: '69141400-0',
    razon_social: 'ILUSTRE MUNICIPALIDAD DE QUILLON',
    giro: 'MUNICIPALIDAD',
    direccion: 'Calle 18 de Septiembre N°250',
    comuna: 'Quillón',
    ciudad: null,
    correo: null,
  },
  lineas: [
    {
      descripcion:
        'Servicio de Catering y Arriendo de Salón, Ciclo de Foros 2026',
      descripcion_larga: null,
      cantidad: 1,
      precio: 2480000,
    },
  ],
  referencias: [{ tipo: '801', folio: '1213301-49-AG26', fecha: '2026-05-15' }],
  pedir_siempre: [],
};

const USUARIO = {
  id: 'u-felipe',
  company_id: 1,
  email: 'felipe@valledelsolquillon.cl',
  role: 'administrador',
} as never;

const armar = ({
  simulado = new FacturacionClSimulado({
    ultimoFolio: () => Promise.resolve(41),
  }),
  errorAlCrear = null as { code: string } | null,
  // Los tipos de cliente particulares (doc 21); sin ellos, como antes.
  particulares = null as string[] | null,
  // La nómina del SII (§9.27); sin ella, como antes.
  sii = undefined as { buscar: jest.Mock } | undefined,
} = {}) => {
  let fila: Record<string, unknown> = {};
  const repo = {
    eventoAFacturar: jest.fn().mockResolvedValue(EVENTO),
    ordenesDelEvento: jest.fn().mockResolvedValue([OC]),
    facturado: jest.fn().mockResolvedValue({ total: 0, porOC: new Map() }),
    nombreDelDocumento: jest.fn().mockResolvedValue(null),
    deCotizacion: jest.fn().mockResolvedValue([]),
    crear: jest.fn().mockImplementation((f: Record<string, unknown>) => {
      if (errorAlCrear)
        return Promise.reject(
          Object.assign(new Error('duplicado'), errorAlCrear),
        );
      fila = { id: 7, ...f, folio: null };
      return Promise.resolve(fila);
    }),
    actualizar: jest
      .fn()
      .mockImplementation((_id: number, _c: number, cambios: object) => {
        fila = { ...fila, ...cambios };
        return Promise.resolve(fila);
      }),
    guardarPdf: jest.fn().mockResolvedValue(undefined),
    agregarAlEvento: jest.fn().mockResolvedValue(undefined),
    // §9.35: el cliente como está en Eventia, la cotización y la OC.
    datosDelNombreDelPdf: jest.fn().mockResolvedValue({
      receptor: { razon_social: 'Compañía Cervecerías Unidas S.A.' },
      cotizacion: { quotation_number: 423, cliente: { name: 'CCU Quillón' } },
      oc: { numero: '4500918822' },
    }),
  };
  const ordenes = {
    empresaQueVende: jest
      .fn()
      .mockResolvedValue({ nombre: 'Valle del Sol Quillón SpA', rut: null }),
  };
  const razones = {
    deCliente: jest.fn().mockResolvedValue([]),
    crear: jest.fn().mockResolvedValue({}),
    editar: jest.fn().mockResolvedValue({}),
  };
  const bitacora = { crearComoBeliaAPedidoDe: jest.fn().mockResolvedValue({}) };
  const ocs = {
    deDocumentos: jest.fn().mockResolvedValue({ ordenes: [OC], sinLeer: [] }),
  };
  const boletas = {
    emitirDelEvento: jest.fn().mockResolvedValue({
      id: 8,
      tipo: 39,
      ambiente: 'simulado',
      estado: 'emitido',
      folio: 1021,
      total: 2480000,
    }),
    // §9.23: el tarifario de la factura de «Nuevo documento».
    tarifario: jest.fn().mockResolvedValue([
      {
        id: 5,
        nombre: 'Cabaña 6 personas, temporada media',
        precio: 140000,
        unidad: 'noche',
        activo: true,
      },
    ]),
  };
  const alcance = particulares
    ? { particulares: jest.fn().mockResolvedValue(new Set(particulares)) }
    : undefined;
  const servicio = new FacturasService(
    repo as never,
    ordenes as never,
    { de: () => simulado } as never,
    razones as never,
    bitacora as never,
    mockPinoLogger() as never,
    ocs as never,
    boletas as never,
    alcance as never,
    sii as never,
  );
  return { servicio, repo, razones, bitacora, ocs, boletas, simulado };
};

describe('Los documentos del evento', () => {
  const FACTURA_1 = {
    id: 7,
    tipo: 33,
    ambiente: 'simulado',
    folio: 1,
    estado: 'emitido',
    total: 2480000,
    fecha_emision: '2026-11-04',
    modifica_id: null,
    codigo_referencia: null,
    orden_de_compra_id: 12,
  };
  const NC_1 = {
    ...FACTURA_1,
    id: 12,
    tipo: 61,
    fecha_emision: '2026-11-05',
    modifica_id: 7,
    codigo_referencia: 1,
  };

  it('una factura anulada por una NC ya no cuenta: la OC se puede volver a facturar', async () => {
    const { servicio, repo } = armar();
    repo.deCotizacion.mockResolvedValue([NC_1, FACTURA_1]);
    const r = await servicio.documentos('ev-423', 1);
    expect(r.facturado_por_oc).toEqual({ 12: 0 });
    expect(r.documentos.find((d) => d.id === 7)?.cadena).toEqual({
      como: 'anulado',
      texto: 'Anulada por NC 1',
      modifica: null,
    });
    expect(r.documentos.find((d) => d.id === 12)?.cadena).toEqual({
      como: 'vigente',
      texto: null,
      modifica: 'Anula la factura N° 1',
    });
  });

  it('con la ND que anula la NC, la factura vuelve a contar entera', async () => {
    const { servicio, repo } = armar();
    repo.deCotizacion.mockResolvedValue([
      { ...NC_1, id: 13, tipo: 56, modifica_id: 12 },
      NC_1,
      FACTURA_1,
    ]);
    const r = await servicio.documentos('ev-423', 1);
    expect(r.facturado_por_oc).toEqual({ 12: 2480000 });
    expect(r.documentos.find((d) => d.id === 7)?.cadena.texto).toBeNull();
    expect(r.documentos.find((d) => d.id === 12)?.cadena).toEqual({
      como: 'anulado',
      texto: 'Anulada por ND 1',
      modifica: 'Anula la factura N° 1',
    });
    expect(r.documentos.find((d) => d.id === 13)?.cadena.modifica).toBe(
      'Anula la nota de crédito N° 1',
    );
  });
});

describe('Emitir la factura del evento', () => {
  it('sale con el folio que sigue y deja el PDF, la razón social nueva y la nota de BelIA', async () => {
    const { servicio, repo, razones, bitacora } = armar();
    const emitida = await servicio.emitir('ev-423', USUARIO, PEDIDA);

    expect(repo.crear).toHaveBeenCalledWith(
      expect.objectContaining({
        estado: 'enviando',
        ambiente: 'simulado',
        neto: 2084034,
        iva: 395966,
        total: 2480000,
        orden_de_compra_id: 12,
      }),
    );
    expect(emitida).toMatchObject({
      estado: 'emitido',
      folio: 42,
      pdf_path:
        'c1/event-documents/ev-423/facturas/F42_CCU_Quillon_423_4500918822_simulado.pdf',
    });
    expect(repo.agregarAlEvento).toHaveBeenCalledWith(
      'ev-423',
      'F42_CCU Quillón_423_4500918822 (simulada).pdf',
      'c1/event-documents/ev-423/facturas/F42_CCU_Quillon_423_4500918822_simulado.pdf',
    );
    // El RUT era nuevo para el cliente: queda en su ficha (§9.12).
    expect(razones.crear).toHaveBeenCalledWith(
      'joker',
      1,
      expect.objectContaining({
        rut: '69141400-0',
        giro: 'MUNICIPALIDAD',
        comuna: 'Quillón',
      }),
      'u-felipe',
      'orden_de_compra',
    );
    expect(bitacora.crearComoBeliaAPedidoDe).toHaveBeenCalledWith(
      USUARIO,
      expect.objectContaining({
        note: 'Emitió la factura N° 42 por $2.480.000 a ILUSTRE MUNICIPALIDAD DE QUILLON, OC 1213301-49-AG26. Es simulada: no salió nada al SII.',
      }),
    );
  });

  it('con un dato que falta no se manda nada', async () => {
    const { servicio, repo } = armar();
    await expect(
      servicio.emitir('ev-423', USUARIO, {
        ...PEDIDA,
        receptor: { ...PEDIDA.receptor, giro: '' },
      }),
    ).rejects.toThrow(new BadRequestException('Falta el giro'));
    expect(repo.crear).not.toHaveBeenCalled();
  });

  it('con una fecha de emisión elegida, sale con esa; fuera del rango, no se manda nada (§9.32)', async () => {
    const { servicio, repo } = armar();
    await expect(
      servicio.emitir('ev-423', USUARIO, {
        ...PEDIDA,
        fecha_emision: '2020-01-31',
      }),
    ).rejects.toThrow(/La fecha de emisión va del/);
    await expect(
      servicio.emitir('ev-423', USUARIO, {
        ...PEDIDA,
        fecha_emision: '2999-01-01',
      }),
    ).rejects.toThrow(/La fecha de emisión va del/);
    expect(repo.crear).not.toHaveBeenCalled();
  });

  it('un envío a la vez por evento', async () => {
    const { servicio } = armar({ errorAlCrear: { code: '23505' } });
    await expect(servicio.emitir('ev-423', USUARIO, PEDIDA)).rejects.toThrow(
      ConflictException,
    );
  });

  it('si se corta, queda «por confirmar» y no se reintenta (L5)', async () => {
    const { servicio, bitacora } = armar({
      simulado: new FacturacionClSimulado({ cortarEnElEnvio: true }),
    });
    const r = await servicio.emitir('ev-423', USUARIO, PEDIDA);
    expect(r).toMatchObject({ estado: 'por_confirmar' });
    expect(bitacora.crearComoBeliaAPedidoDe).not.toHaveBeenCalled();
  });

  it('si el folio ya existe (L3), pide otro una sola vez', async () => {
    const simulado = new FacturacionClSimulado({
      ultimoFolio: () => Promise.resolve(41),
    });
    // Alguien emitió en la web de facturacion.cl entre el folio y el envío.
    let primera = true;
    jest.spyOn(simulado, 'folioSiguiente').mockImplementation(() => {
      if (primera) {
        primera = false;
        return Promise.resolve(41);
      }
      return Promise.resolve(42);
    });
    const { servicio } = armar({ simulado });
    const r = await servicio.emitir('ev-423', USUARIO, PEDIDA);
    expect(r).toMatchObject({ estado: 'emitido', folio: 42 });
  });

  it('no se factura un evento que no está aceptado ni realizado', async () => {
    const { servicio, repo } = armar();
    repo.eventoAFacturar.mockResolvedValue({ ...EVENTO, estado: 'enviada' });
    await expect(servicio.emitir('ev-423', USUARIO, PEDIDA)).rejects.toThrow(
      'Se factura un evento aceptado o ya realizado',
    );
  });
});

describe('La boleta del evento', () => {
  const BOLETA: DtePedido = {
    ...PEDIDA,
    tipo: 39,
    receptor: { ...PEDIDA.receptor, correo: 'Novios@Gmail.com' },
  };

  it('sale por el camino de las boletas, sin OC, con sus líneas con IVA, y deja la nota de BelIA', async () => {
    const { servicio, boletas, bitacora, simulado, repo } = armar();
    const r = await servicio.emitir('ev-423', USUARIO, BOLETA);
    expect(r).toMatchObject({ tipo: 39, folio: 1021 });
    expect(boletas.emitirDelEvento).toHaveBeenCalledWith(USUARIO, simulado, {
      quotationId: 'ev-423',
      lineas: [
        {
          descripcion:
            'Servicio de Catering y Arriendo de Salón, Ciclo de Foros 2026',
          descripcionLarga: null,
          cantidad: 1,
          precio: 2480000,
        },
      ],
      correo: 'novios@gmail.com',
      observaciones: ['Cotización N° 423 · evento 11-08-2026'],
      totalEsperado: 2480000,
    });
    // La boleta nunca va contra una OC: ni la busca.
    expect(repo.crear).not.toHaveBeenCalled();
    expect(bitacora.crearComoBeliaAPedidoDe).toHaveBeenCalledWith(
      USUARIO,
      expect.objectContaining({
        note: 'Emitió la boleta N° 1021 por $2.480.000. Es simulada: no salió nada al SII.',
      }),
    );
  });

  it('por confirmar, sin nota', async () => {
    const { servicio, boletas, bitacora } = armar();
    boletas.emitirDelEvento.mockResolvedValue({
      id: 8,
      tipo: 39,
      ambiente: 'simulado',
      estado: 'por_confirmar',
      folio: null,
      total: 2480000,
    });
    const r = await servicio.emitir('ev-423', USUARIO, BOLETA);
    expect(r).toMatchObject({ estado: 'por_confirmar' });
    expect(bitacora.crearComoBeliaAPedidoDe).not.toHaveBeenCalled();
  });
});

describe('Preparar el DTE', () => {
  it('BelIA lee las OC de Documentos y propone la factura, con lo que le queda a cada OC', async () => {
    const { servicio, ocs, repo } = armar();
    repo.facturado.mockResolvedValue({
      total: 480000,
      porOC: new Map([[12, 480000]]),
    });
    const r = await servicio.preparar('ev-423', USUARIO);
    expect(ocs.deDocumentos).toHaveBeenCalledWith('ev-423', 1, 'u-felipe');
    expect(r).toEqual({
      tipo: 33,
      ocs: [
        {
          id: 12,
          numero: '1213301-49-AG26',
          fecha: '2026-05-15',
          razon_social: 'ILUSTRE MUNICIPALIDAD DE QUILLON',
          total: 2480000,
          facturado: 480000,
        },
      ],
      sin_leer: [],
      evento: {
        numero: 423,
        total: 3440000,
        facturado: 480000,
        cliente: 'JOKER SERVICIOS SPA',
      },
    });
  });

  it('sin OC ni razones sociales, propone la boleta', async () => {
    const { servicio, ocs } = armar();
    ocs.deDocumentos.mockResolvedValue({ ordenes: [], sinLeer: [] });
    expect((await servicio.preparar('ev-423', USUARIO)).tipo).toBe(39);
  });

  describe('la boleta, solo a un particular (§9.24)', () => {
    const sinDatos = (tipoDeCliente: string | null) => {
      const r = armar({ particulares: ['particulares'] });
      r.ocs.deDocumentos.mockResolvedValue({ ordenes: [], sinLeer: [] });
      r.repo.eventoAFacturar.mockResolvedValue({ ...EVENTO, tipoDeCliente });
      return r.servicio.preparar('ev-423', USUARIO);
    };

    it('a una empresa sin OC ni datos de facturación, la factura', async () => {
      expect((await sinDatos('Empresas')).tipo).toBe(33);
    });

    it('a un particular sin OC ni razón social, la boleta', async () => {
      expect((await sinDatos('Particulares')).tipo).toBe(39);
      expect((await sinDatos('  PARTICULARES ')).tipo).toBe(39);
    });

    it('un cliente sin tipo no es particular: la factura', async () => {
      expect((await sinDatos(null)).tipo).toBe(33);
    });
  });
});

describe('Lo que acepta el motor', () => {
  const errores = async (body: object) =>
    (await validate(plainToInstance(DtePedidoDto, body))).map(
      (e) => e.property,
    );

  it('una factura o una boleta, con líneas de precio entero', async () => {
    expect(await errores(PEDIDA)).toEqual([]);
    expect(await errores({ ...PEDIDA, tipo: 39 })).toEqual([]);
    expect(await errores({ ...PEDIDA, tipo: 34 })).toEqual(['tipo']);
    expect(
      await errores({
        ...PEDIDA,
        lineas: [{ ...PEDIDA.lineas[0], precio: 10.5 }],
      }),
    ).toEqual(['lineas']);
  });

  it('la condición de pago: contado o crédito a 30, 45 o 60 días; el cliente es un uuid (§9.22)', async () => {
    expect(
      await errores({ ...PEDIDA, forma_de_pago: 2, plazo_dias: 45 }),
    ).toEqual([]);
    expect(await errores({ ...PEDIDA, forma_de_pago: 1 })).toEqual([]);
    expect(await errores({ ...PEDIDA, forma_de_pago: 3 })).toEqual([
      'forma_de_pago',
    ]);
    expect(await errores({ ...PEDIDA, plazo_dias: 90 })).toEqual([
      'plazo_dias',
    ]);
    expect(await errores({ ...PEDIDA, cliente_id: 'ccu' })).toEqual([
      'cliente_id',
    ]);
    expect(
      await errores({
        ...PEDIDA,
        referencias: [
          { ...PEDIDA.referencias[0], razon: 'Paseo de fin de año' },
        ],
      }),
    ).toEqual([]);
  });
});

describe('La factura de «Nuevo documento», sin evento (§9.21)', () => {
  const SUELTA: DtePedido = {
    ...PEDIDA,
    orden_de_compra_id: null,
    referencias: [],
  };

  it('sale con el folio que sigue, sin evento, sin nota en la bitácora y sin tocar fichas', async () => {
    const { servicio, repo, razones, bitacora } = armar();
    const emitida = await servicio.emitirSinEvento(USUARIO, SUELTA);
    expect(repo.crear).toHaveBeenCalledWith(
      expect.objectContaining({
        tipo: 33,
        estado: 'enviando',
        quotation_id: null,
        orden_de_compra_id: null,
        porcentaje: null,
        total: 2480000,
      }),
    );
    expect(emitida).toMatchObject({ estado: 'emitido', folio: 42 });
    expect(repo.eventoAFacturar).not.toHaveBeenCalled();
    expect(razones.crear).not.toHaveBeenCalled();
    expect(bitacora.crearComoBeliaAPedidoDe).not.toHaveBeenCalled();
  });

  it('la vista previa no trae la observación de la cotización ni el aviso del evento', async () => {
    const { servicio, boletas } = armar();
    const vista = await servicio.revisarSinEvento(USUARIO, {
      ...SUELTA,
      tipo: 39,
    });
    expect(vista.ok).toBe(true);
    expect(vista.observaciones).toEqual([]);
    expect(vista.avisos).toEqual([]);
    expect(vista.montos?.total).toBe(2480000);
    // El administrador con líneas a mano: el tarifario ni se lee.
    expect(boletas.tarifario).not.toHaveBeenCalled();
  });

  it('recepción (§9.23): la línea del tarifario sale con su nombre y su precio, y a mano no se puede', async () => {
    const { servicio, repo } = armar();
    const RECEPCION = { ...(USUARIO as object), role: 'recepcion' } as never;
    await servicio.emitirSinEvento(RECEPCION, {
      ...SUELTA,
      lineas: [
        {
          descripcion: 'lo que sea',
          descripcion_larga: 'Del 7 al 9 de noviembre',
          cantidad: 2,
          precio: 1,
          tarifario_id: 5,
        },
      ],
    });
    expect(repo.crear).toHaveBeenCalledWith(
      expect.objectContaining({ tipo: 33, total: 280000 }),
    );
    await expect(servicio.revisarSinEvento(RECEPCION, SUELTA)).rejects.toThrow(
      'solo del administrador',
    );
  });

  it('la condición de pago queda en el documento: crédito a 30 días si no se dice, o al contado', async () => {
    const { servicio, repo } = armar();
    await servicio.emitirSinEvento(USUARIO, SUELTA);
    const fila = (repo.crear.mock.calls as unknown[][])[0][0] as {
      forma_de_pago: number;
      vencimiento: string;
    };
    expect(fila.forma_de_pago).toBe(2);
    expect(fila.vencimiento).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    repo.crear.mockClear();
    await servicio.emitirSinEvento(USUARIO, { ...SUELTA, forma_de_pago: 1 });
    expect(repo.crear).toHaveBeenCalledWith(
      expect.objectContaining({ forma_de_pago: 1, vencimiento: null }),
    );
  });

  it('a un cliente de Eventia (§9.22): su razón social nueva queda en su ficha', async () => {
    const { servicio, razones } = armar();
    await servicio.emitirSinEvento(USUARIO, {
      ...SUELTA,
      cliente_id: '0b8f7a52-3c1e-4a8e-9d55-1f2c3a4b5c6d',
    });
    expect(razones.deCliente).toHaveBeenCalledWith(
      '0b8f7a52-3c1e-4a8e-9d55-1f2c3a4b5c6d',
      1,
    );
    expect(razones.crear).toHaveBeenCalledWith(
      '0b8f7a52-3c1e-4a8e-9d55-1f2c3a4b5c6d',
      1,
      expect.objectContaining({
        rut: '69141400-0',
        razon_social: 'ILUSTRE MUNICIPALIDAD DE QUILLON',
        giro: 'MUNICIPALIDAD',
      }),
      'u-felipe',
      'manual',
    );
  });

  it('lo editado a mano manda: los cambios quedan en la ficha del cliente', async () => {
    const { servicio, razones } = armar();
    razones.deCliente.mockResolvedValue([
      {
        id: 7,
        rut: '69141400-0',
        razon_social: 'ILUSTRE MUNICIPALIDAD DE QUILLON',
        giro: 'MUNICIPALIDAD',
        direccion: 'Calle vieja 1',
        comuna: 'Quillón',
        ciudad: null,
        correo_facturacion: null,
        referencias_exigidas: [],
      },
    ]);
    await servicio.emitirSinEvento(USUARIO, {
      ...SUELTA,
      cliente_id: '0b8f7a52-3c1e-4a8e-9d55-1f2c3a4b5c6d',
    });
    expect(razones.crear).not.toHaveBeenCalled();
    expect(razones.editar).toHaveBeenCalledWith(
      '0b8f7a52-3c1e-4a8e-9d55-1f2c3a4b5c6d',
      1,
      7,
      { direccion: 'Calle 18 de Septiembre N°250' },
    );
  });

  it('con un dato que falta no se manda nada', async () => {
    const { servicio, repo } = armar();
    await expect(
      servicio.emitirSinEvento(USUARIO, {
        ...SUELTA,
        receptor: { ...SUELTA.receptor, comuna: '' },
      }),
    ).rejects.toThrow(new BadRequestException('Falta la comuna'));
    expect(repo.crear).not.toHaveBeenCalled();
  });

  it('la razón social se busca por el RUT limpio; un RUT que no sirve, ni se busca', async () => {
    const { servicio, repo } = armar();
    const r = repo as unknown as Record<string, jest.Mock>;
    r.razonSocialDeLaEmpresa = jest
      .fn()
      .mockResolvedValue({ rut: '90413000-1', razon_social: 'CCU' });
    expect(await servicio.razonSocialPorRut(1, '90.413.000-1')).toMatchObject({
      razon_social: 'CCU',
    });
    expect(r.razonSocialDeLaEmpresa).toHaveBeenCalledWith(1, '90413000-1');
    r.razonSocialDeLaEmpresa.mockClear();
    expect(await servicio.razonSocialPorRut(1, 'hola')).toBeNull();
    expect(r.razonSocialDeLaEmpresa).not.toHaveBeenCalled();
  });

  it('el RUT que llena todo: lo guardado en Eventia primero, y si no, la nómina del SII (§9.27)', async () => {
    const sii = {
      buscar: jest.fn().mockResolvedValue({
        rut: 90413000,
        dv: '1',
        razon_social: 'COMPANIA CERVECERIAS UNIDAS S.A.',
        giro: 'ELABORACION DE BEBIDAS MALTEADAS',
        actividades: [110300, 821100],
        direccion: 'AV VITACURA 2670 PISO 23',
        comuna: 'LAS CONDES',
        ciudad: 'SANTIAGO',
        giros: [
          'ELABORACION DE BEBIDAS MALTEADAS',
          'ACTIVIDADES COMBINADAS DE SERVICIOS',
        ],
      }),
    };
    const { servicio, repo } = armar({ sii });
    const r = repo as unknown as Record<string, jest.Mock>;
    r.razonSocialDeLaEmpresa = jest.fn().mockResolvedValue(null);
    expect(await servicio.razonSocialPorRut(1, '90.413.000-1')).toEqual({
      rut: '90413000-1',
      razon_social: 'COMPANIA CERVECERIAS UNIDAS S.A.',
      giro: 'ELABORACION DE BEBIDAS MALTEADAS',
      direccion: 'AV VITACURA 2670 PISO 23',
      comuna: 'LAS CONDES',
      ciudad: 'SANTIAGO',
      correo_facturacion: null,
      referencias_exigidas: [],
      cliente: null,
      giros: [
        'ELABORACION DE BEBIDAS MALTEADAS',
        'ACTIVIDADES COMBINADAS DE SERVICIOS',
      ],
      origen: 'sii',
    });
    expect(sii.buscar).toHaveBeenCalledWith('90413000-1');

    // Lo guardado en Eventia manda: ni se le pregunta al SII.
    sii.buscar.mockClear();
    r.razonSocialDeLaEmpresa.mockResolvedValue({
      rut: '90413000-1',
      razon_social: 'CCU',
    });
    expect(await servicio.razonSocialPorRut(1, '90413000-1')).toMatchObject({
      razon_social: 'CCU',
      origen: 'eventia',
    });
    expect(sii.buscar).not.toHaveBeenCalled();
  });
});
