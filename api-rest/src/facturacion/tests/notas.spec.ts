import { BadRequestException, ConflictException } from '@nestjs/common';
import {
  ADMIN_ONLY,
  OPERATIONS_AND_UP,
  ROLES_KEY,
} from 'src/auth/roles.decorator';
import { UserRole } from 'src/users/entities/user.entity';
import { mockPinoLogger } from '../../testing/mocks';
import {
  FacturacionClSimulado,
  revisarArchivo,
} from '../facturacion-cl/simulado';
import { NotasController } from '../notas/notas.controller';
import { NotasService } from '../notas/notas.service';

/**
 * LA CADENA DE ANULACIONES Y LAS NOTAS (doc 19 §9.5, paso 4), con el caso
 * del laboratorio: la factura simulada N° 1 de CCU, $1.428.000.
 */

const FACTURA_1 = {
  id: 10,
  company_id: 1,
  tipo: 33,
  ambiente: 'simulado',
  folio: 1,
  fecha_emision: '2026-11-04',
  estado: 'emitido',
  receptor: {
    rut: '90413000-1',
    razon_social: 'Compañía Cervecerías Unidas S.A.',
    giro: 'Elaboración de cervezas',
    direccion: 'Av. Vitacura 2670',
    comuna: 'Las Condes',
    ciudad: 'Santiago',
    correo: null,
  },
  detalle: [
    {
      descripcion: 'Paseo fin de año CCU, 400 personas',
      descripcionLarga: null,
      cantidad: 1,
      precio: 1200000,
    },
  ],
  referencias: [],
  neto: 1200000,
  exento: 0,
  iva: 228000,
  total: 1428000,
  quotation_id: 'ev-408',
  orden_de_compra_id: 1,
  porcentaje: 100,
  modifica_id: null,
  codigo_referencia: null,
  error: null,
  pdf_path: 'c1/x.pdf',
  creado_por: null,
  emitido_por: null,
  emitido_en: null,
  created_at: '2026-11-04T23:00:00Z',
  archivo_enviado: null,
  respuesta: null,
};

const ADMIN = {
  id: 'u-felipe',
  company_id: 1,
  email: 'felipe@valledelsolquillon.cl',
  role: 'administrador',
} as never;

const armar = ({
  documentos = [FACTURA_1] as Record<string, unknown>[],
  simulado = new FacturacionClSimulado({
    ultimoFolio: () => Promise.resolve(0),
  }),
  conexion = { de: () => simulado } as {
    de: (empresa: number, ambiente?: string) => unknown;
  },
} = {}) => {
  const filas = new Map<number, Record<string, unknown>>(
    documentos.map((d) => [d.id as number, { ...d }]),
  );
  let id = 100;
  const repo = {
    documento: jest
      .fn()
      .mockImplementation((i: number) => Promise.resolve(filas.get(i) ?? null)),
    cadenaDeLaEmpresa: jest
      .fn()
      .mockImplementation(() => Promise.resolve([...filas.values()])),
    ordenesDelEvento: jest
      .fn()
      .mockResolvedValue([{ id: 1, numero: '4500918822', total: 1428000 }]),
    delPeriodo: jest.fn().mockImplementation(() =>
      Promise.resolve(
        [...filas.values()].map((f) => ({
          ...f,
          cotizacion: { quotation_number: 408 },
          oc: { numero: '4500918822' },
        })),
      ),
    ),
    crear: jest.fn().mockImplementation((f: Record<string, unknown>) => {
      const fila = { id, ...f, folio: null, fecha_emision: null };
      filas.set(id++, fila);
      return Promise.resolve(fila);
    }),
    actualizar: jest
      .fn()
      .mockImplementation((i: number, _c: number, cambios: object) => {
        filas.set(i, { ...filas.get(i), ...cambios });
        return Promise.resolve(filas.get(i));
      }),
    guardarPdf: jest.fn().mockResolvedValue(undefined),
    agregarAlEvento: jest.fn().mockResolvedValue(undefined),
  };
  const boletas = {
    desamarrarDeLaBoleta: jest.fn().mockResolvedValue(undefined),
  };
  const bitacora = { crearComoBeliaAPedidoDe: jest.fn().mockResolvedValue({}) };
  const servicio = new NotasService(
    repo as never,
    boletas as never,
    conexion as never,
    bitacora as never,
    mockPinoLogger() as never,
    {
      empresaQueVende: jest.fn().mockResolvedValue({
        nombre: 'Valle del Sol Quillón SpA',
        rut: '77701305-K',
      }),
    } as never,
  );
  return { servicio, repo, boletas, bitacora, filas };
};

describe('Las notas', () => {
  it('anular la factura: una NC por el total, con código 1, que el simulado acepta', async () => {
    const { servicio, repo, bitacora } = armar();
    const nc = await servicio.emitirNota(ADMIN, 10, {
      accion: 'anular',
      motivo: 'Se emitió con el RUT equivocado',
    });
    expect(nc).toMatchObject({
      tipo: 61,
      estado: 'emitido',
      folio: 1,
      total: 1428000,
      modifica_id: 10,
      codigo_referencia: 1,
      quotation_id: 'ev-408',
    });
    const archivo = (repo.crear.mock.calls as unknown[][])[0][0] as {
      archivo_enviado: string;
    };
    expect(archivo.archivo_enviado).toContain(
      '1;33;1;2026-11-04;1;Se emitió con el RUT equivocado;',
    );
    expect(revisarArchivo(archivo.archivo_enviado)).toMatchObject({ tipo: 61 });
    expect(bitacora.crearComoBeliaAPedidoDe).toHaveBeenCalledWith(
      ADMIN,
      expect.objectContaining({
        note: 'Emitió la nota de crédito N° 1 que anula la factura N° 1 ($1.428.000): Se emitió con el RUT equivocado. Es simulada: no salió nada al SII.',
      }),
    );
  });

  it('anular una factura con descuento: la NC lleva las líneas con su descuento y va por el total de verdad (§9.22)', async () => {
    const CON_DESCUENTO = {
      ...FACTURA_1,
      id: 11,
      folio: 2,
      quotation_id: null,
      orden_de_compra_id: null,
      porcentaje: null,
      detalle: [
        {
          descripcion: 'Jornada corporativa',
          descripcionLarga: null,
          cantidad: 1,
          precio: 100000,
          descuento: 10,
        },
      ],
      neto: 90000,
      iva: 17100,
      total: 107100,
    };
    const { servicio, repo } = armar({ documentos: [CON_DESCUENTO] });
    const nc = await servicio.emitirNota(ADMIN, 11, {
      accion: 'anular',
      motivo: 'Prueba del descuento',
    });
    expect(nc).toMatchObject({ tipo: 61, estado: 'emitido', total: 107100 });
    const { archivo_enviado } = (
      repo.crear.mock.calls as unknown[][]
    )[0][0] as {
      archivo_enviado: string;
    };
    expect(archivo_enviado).toContain(
      '1;SERV;Jornada corporativa;1;100000;10;10000;0;0;0;90000;INT1;UN;',
    );
    expect(archivo_enviado).toContain(
      '->Totales<-\r\n0;10000;0;0;90000;0;19;17100;107100;',
    );
  });

  it('una factura ya anulada no se anula dos veces', async () => {
    const { servicio } = armar({
      documentos: [
        FACTURA_1,
        {
          ...FACTURA_1,
          id: 11,
          tipo: 61,
          folio: 1,
          modifica_id: 10,
          codigo_referencia: 1,
        },
      ],
    });
    await expect(
      servicio.emitirNota(ADMIN, 10, { accion: 'anular', motivo: 'Otra vez' }),
    ).rejects.toThrow(ConflictException);
  });

  it('rebajar: nunca más de lo que le queda, y con la ND se anula la NC', async () => {
    const { servicio, filas } = armar();
    await expect(
      servicio.emitirNota(ADMIN, 10, {
        accion: 'rebajar',
        motivo: 'Vinieron menos',
        monto: 2000000,
      }),
    ).rejects.toThrow(
      'A Factura 1 le quedan $1.428.000: la rebaja no puede pasar de eso',
    );
    const nc = (await servicio.emitirNota(ADMIN, 10, {
      accion: 'rebajar',
      motivo: 'Vinieron 50 personas menos',
      monto: 178500,
    })) as { id: number; total: number; codigo_referencia: number };
    expect(nc).toMatchObject({ total: 178500, codigo_referencia: 3 });

    const nd = await servicio.emitirNota(ADMIN, nc.id, {
      accion: 'anular',
      motivo: 'La rebaja no correspondía',
    });
    expect(nd).toMatchObject({ tipo: 56, codigo_referencia: 1, total: 178500 });
    expect(filas.size).toBe(3);
  });

  it('la ND no devuelve la factura si la OC ya se volvió a facturar (nunca más del 100 %)', async () => {
    const NC_1 = {
      ...FACTURA_1,
      id: 11,
      tipo: 61,
      folio: 1,
      fecha_emision: '2026-11-05',
      modifica_id: 10,
      codigo_referencia: 1,
    };
    const { servicio, repo } = armar({
      documentos: [
        FACTURA_1,
        NC_1,
        { ...FACTURA_1, id: 12, folio: 2, fecha_emision: '2026-11-05' },
      ],
    });
    await expect(
      servicio.emitirNota(ADMIN, 11, {
        accion: 'anular',
        motivo: 'La anulación no correspondía',
      }),
    ).rejects.toThrow(
      'Con la nota de débito, la OC N° 4500918822 volvería a sumar $2.856.000 facturados de $1.428.000: ya se volvió a facturar. Anula primero la factura que la reemplazó.',
    );
    expect(repo.ordenesDelEvento).toHaveBeenCalledWith('ev-408', 1);
    expect(repo.crear).not.toHaveBeenCalled();
  });

  it('a una nota solo se la anula, y la boleta espera el paso 0 (L21)', async () => {
    const { servicio } = armar({
      documentos: [
        FACTURA_1,
        {
          ...FACTURA_1,
          id: 12,
          tipo: 61,
          modifica_id: 10,
          codigo_referencia: 3,
          total: 1000,
        },
        { ...FACTURA_1, id: 13, tipo: 39 },
      ],
    });
    await expect(
      servicio.revisarNota(ADMIN, 12, {
        accion: 'rebajar',
        motivo: 'x',
        monto: 1,
      }),
    ).rejects.toThrow('A una nota solo se la anula');
    await expect(
      servicio.revisarNota(ADMIN, 13, { accion: 'anular', motivo: 'x' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('la vista previa dice el folio que sigue y avisa si venció el plazo', async () => {
    const { servicio } = armar({
      documentos: [{ ...FACTURA_1, fecha_emision: '2026-01-10' }],
    });
    const vista = await servicio.revisarNota(ADMIN, 10, {
      accion: 'anular',
      motivo: 'Error',
    });
    expect(vista).toMatchObject({ ok: true, tipo: 61, folio: 1, codigo: 1 });
    expect(vista.avisos[0]).toContain(
      'Venció el plazo del SII (hasta el 28-02-2026)',
    );
    // Para dibujarla como saldrá (§9.22, sprint 3): el emisor y lo que
    // modifica, con su fecha y el motivo.
    expect(vista.emisor).toEqual({
      nombre: 'Valle del Sol Quillón SpA',
      rut: '77701305-K',
    });
    expect(vista.referencia).toEqual({
      tipo: '33',
      folio: '1',
      fecha: '2026-01-10',
      codigo: 1,
      razon: 'Error',
    });
  });
});

describe('Comprobar lo que quedó por confirmar (L5)', () => {
  const porConfirmar = {
    ...FACTURA_1,
    id: 20,
    folio: null,
    fecha_emision: null,
    estado: 'por_confirmar',
    created_at: '2026-11-04T20:00:00Z',
    archivo_enviado:
      '->Encabezado<-\r\n33;5;2026-11-04;0;0;90413000-1;CCU;;;;;;',
  };

  it('si el folio no avanzó, no salió: se puede emitir de nuevo', async () => {
    const { servicio, filas } = armar({
      documentos: [porConfirmar],
      simulado: new FacturacionClSimulado({
        ultimoFolio: () => Promise.resolve(4),
      }),
    });
    await servicio.comprobar(ADMIN, 20);
    expect(filas.get(20)).toMatchObject({ estado: 'rechazado' });
  });

  it('si el folio ya pasó el que se mandó, salió con ese folio', async () => {
    const { servicio, filas } = armar({
      documentos: [porConfirmar],
      simulado: new FacturacionClSimulado({
        ultimoFolio: () => Promise.resolve(5),
      }),
    });
    await servicio.comprobar(ADMIN, 20);
    // Con la fecha del archivo, no la del día en que se comprobó (§9.32).
    expect(filas.get(20)).toMatchObject({
      estado: 'emitido',
      folio: 5,
      fecha_emision: '2026-11-04',
    });
  });

  it('una factura fechada más adelante queda con su fecha al comprobarla', async () => {
    const { servicio, filas } = armar({
      documentos: [
        {
          ...porConfirmar,
          archivo_enviado:
            '->Encabezado<-\r\n33;5;2026-11-30;0;0;90413000-1;CCU;;;;;;',
        },
      ],
      simulado: new FacturacionClSimulado({
        ultimoFolio: () => Promise.resolve(5),
      }),
    });
    await servicio.comprobar(ADMIN, 20);
    expect(filas.get(20)).toMatchObject({ fecha_emision: '2026-11-30' });
  });

  it('una boleta que no salió devuelve su cabaña al reparto', async () => {
    const { servicio, boletas } = armar({
      documentos: [
        {
          ...porConfirmar,
          tipo: 39,
          respuesta: { folio_esperado: 7 },
          archivo_enviado: '->Boleta<-',
        },
      ],
      simulado: new FacturacionClSimulado({
        ultimoFolio: () => Promise.resolve(6),
      }),
    });
    await servicio.comprobar(ADMIN, 20);
    expect(boletas.desamarrarDeLaBoleta).toHaveBeenCalledWith(20, 1);
  });
});

describe('Cada documento en su ambiente (§9.18)', () => {
  /** Ya conectado al ambiente de prueba de facturacion.cl: lo de antes
   *  quedó simulado. */
  const enPrueba = {
    ambiente: 'prueba',
    folioSiguiente: jest.fn().mockResolvedValue(1),
  };

  it('a una factura simulada no se le emite una nota de prueba', async () => {
    const { servicio, repo } = armar({ conexion: { de: () => enPrueba } });
    await expect(
      servicio.revisarNota(ADMIN, 10, {
        accion: 'anular',
        motivo: 'Se emitió con el RUT equivocado',
      }),
    ).rejects.toThrow(
      'Factura 1 salió en el modo simulado y hoy se emite en el ambiente de prueba: no se le emiten notas',
    );
    expect(enPrueba.folioSiguiente).not.toHaveBeenCalled();
    expect(repo.crear).not.toHaveBeenCalled();
  });

  it('la lista no ofrece lo que no se puede: notas de otro ambiente, ni comprobar sin su conexión', async () => {
    const { servicio } = armar({
      documentos: [
        FACTURA_1,
        {
          ...FACTURA_1,
          id: 30,
          ambiente: 'produccion',
          folio: null,
          estado: 'por_confirmar',
        },
      ],
      conexion: {
        de: (_: number, ambiente?: string) =>
          !ambiente || ambiente === 'prueba'
            ? enPrueba
            : ambiente === 'simulado'
              ? new FacturacionClSimulado()
              : null,
      },
    });
    const lista = await servicio.lista(1, '2026-11', UserRole.ADMINISTRADOR);
    const simulada = lista.documentos.find((d) => d.id === 10);
    expect(simulada?.acciones).toMatchObject({
      anular: false,
      rebajar: false,
      corregir: false,
    });
    expect(lista.documentos.find((d) => d.id === 30)?.acciones.comprobar).toBe(
      false,
    );
    expect(lista.ambiente).toBe('prueba');
  });

  it('«Comprobar» pregunta al ambiente que lo emitió, y si ya no está, lo dice', async () => {
    const simulado = new FacturacionClSimulado({
      ultimoFolio: () => Promise.resolve(5),
    });
    const porConfirmar = {
      ...FACTURA_1,
      id: 20,
      folio: null,
      fecha_emision: null,
      estado: 'por_confirmar',
      archivo_enviado:
        '->Encabezado<-\r\n33;5;2026-11-04;0;0;90413000-1;CCU;;;;;;',
    };
    const de = jest.fn((_: number, ambiente?: string) =>
      ambiente === 'simulado' || !ambiente ? simulado : null,
    );
    const { servicio, filas } = armar({
      documentos: [porConfirmar],
      conexion: { de },
    });
    await servicio.comprobar(ADMIN, 20);
    expect(de).toHaveBeenCalledWith(1, 'simulado');
    expect(filas.get(20)).toMatchObject({ estado: 'emitido', folio: 5 });

    const sinSuAmbiente = armar({
      documentos: [{ ...porConfirmar, ambiente: 'produccion' }],
      conexion: { de },
    });
    await expect(sinSuAmbiente.servicio.comprobar(ADMIN, 20)).rejects.toThrow(
      'Ese documento salió en producción: se revisa en la plataforma de facturacion.cl',
    );
  });
});

describe('El XML a pedido (§9.33)', () => {
  const FACTURA_381 = {
    ...FACTURA_1,
    id: 1,
    ambiente: 'produccion',
    folio: 381,
  };
  const conDice = (mensaje: string) => ({
    de: () => ({
      ambiente: 'produccion',
      obtenerXml: jest.fn().mockResolvedValue({ base64: null, mensaje }),
    }),
  });

  it('sin contratar, lo dice en una línea (producción, 08-11)', async () => {
    const { servicio } = armar({
      documentos: [FACTURA_381],
      conexion: conDice(
        'Esta opcion es un servicio adicional solo para clientes que lo contraten.',
      ),
    });
    const error = await servicio.pedirXml(ADMIN, 1).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as Error).message).toBe(
      'El XML es un servicio adicional de facturacion.cl y no está contratado.',
    );
  });

  it('si no lo entrega por otra razón, dice lo que respondió', async () => {
    const { servicio } = armar({
      documentos: [FACTURA_381],
      conexion: conDice('Folio no existe'),
    });
    await expect(servicio.pedirXml(ADMIN, 1)).rejects.toThrow(
      'facturacion.cl no entregó el XML: Folio no existe',
    );
  });
});

describe('Una sola sección: lo que ve cada cargo (§9.19)', () => {
  it('operaciones mira la lista y pide el PDF; anular y «Comprobar» son del administrador', async () => {
    const { servicio } = armar({
      documentos: [
        { ...FACTURA_1, pdf_path: null },
        {
          ...FACTURA_1,
          id: 30,
          folio: null,
          estado: 'por_confirmar',
        },
      ],
    });
    const lista = await servicio.lista(1, '2026-11', UserRole.OPERACIONES);
    expect(lista.documentos.find((d) => d.id === 10)?.acciones).toEqual({
      anular: false,
      rebajar: false,
      corregir: false,
      comprobar: false,
      pedirPdf: true,
      // §9.33: el XML se pide con el botón.
      xml: true,
    });
    expect(lista.documentos.find((d) => d.id === 30)?.acciones.comprobar).toBe(
      false,
    );
    const delAdmin = await servicio.lista(1, '2026-11', UserRole.ADMINISTRADOR);
    expect(
      delAdmin.documentos.find((d) => d.id === 10)?.acciones,
    ).toMatchObject({ anular: true, rebajar: true, corregir: true });
  });

  it('las puertas del motor: la lista y el PDF desde operaciones, lo demás solo el administrador', () => {
    const cargos = (metodo: keyof NotasController) =>
      Reflect.getMetadata(ROLES_KEY, NotasController.prototype[metodo]) as
        | string[]
        | undefined;
    expect(cargos('lista')).toEqual(OPERATIONS_AND_UP);
    expect(cargos('pedirPdf')).toEqual(OPERATIONS_AND_UP);
    expect(cargos('pedirXml')).toEqual(OPERATIONS_AND_UP);
    for (const m of [
      'comprobar',
      'revisarNota',
      'emitirNota',
      'conexion',
    ] as const)
      expect(cargos(m)).toEqual(ADMIN_ONLY);
    // Sin cargo en la clase: cada puerta dice el suyo.
    expect(Reflect.getMetadata(ROLES_KEY, NotasController)).toBeUndefined();
  });
});

describe('La lista de Facturación', () => {
  it('cada documento con su cadena, y lo facturado del mes neto de notas', async () => {
    const { servicio } = armar({
      documentos: [
        FACTURA_1,
        {
          ...FACTURA_1,
          id: 11,
          tipo: 61,
          folio: 1,
          modifica_id: 10,
          codigo_referencia: 1,
        },
      ],
    });
    const lista = await servicio.lista(1, '2026-11', UserRole.ADMINISTRADOR);
    expect(
      lista.documentos.map((d) => [
        d.titulo,
        d.cadena.texto,
        d.cadena.detalle,
        d.neto,
        d.iva,
        d.total,
      ]),
    ).toEqual([
      // El chip en una palabra y abajo la nota que la anuló (§9.22, 07-11).
      ['Factura 1', 'Anulada', 'Por NC 1', 1200000, 228000, 1428000],
      // La NC resta en las tres columnas: el reporte suma bien en Excel.
      ['NC 1 · anula la 1', 'Vigente', null, -1200000, -228000, -1428000],
    ]);
    // La lista pone el nombre arriba y lo que hace la nota junto a la fecha.
    expect(lista.documentos.map((d) => [d.nombre, d.que_hace])).toEqual([
      ['Factura 1', null],
      ['NC 1', 'anula la 1'],
    ]);
    expect(lista.resumen).toMatchObject({
      facturado: 0,
      facturas: 1,
      notas: 1,
    });
    expect(lista.documentos[0].acciones).toMatchObject({
      anular: false,
      rebajar: false,
    });
    expect(lista.documentos[1].acciones.anular).toBe(true);
  });

  it('un rango de fechas, con las dos incluidas (§9.22, sprint 2)', async () => {
    const { servicio, repo } = armar();
    const lista = await servicio.lista(
      1,
      { desde: '2026-10-15', hasta: '2026-11-06' },
      UserRole.ADMINISTRADOR,
    );
    // La consulta pide hasta el día siguiente, excluido.
    expect(repo.delPeriodo).toHaveBeenCalledWith(
      1,
      '2026-10-15',
      '2026-11-07',
      undefined,
    );
    expect(lista).toMatchObject({ desde: '2026-10-15', hasta: '2026-11-06' });
  });

  it('solo los tipos que se piden: la nota elige de las facturas y las notas (§9.22, sprint 3)', async () => {
    const { servicio, repo } = armar();
    await servicio.lista(
      1,
      { desde: '2025-11-07', hasta: '2026-11-06' },
      UserRole.ADMINISTRADOR,
      undefined,
      [33, 56, 61],
    );
    expect(repo.delPeriodo).toHaveBeenCalledWith(
      1,
      '2025-11-07',
      '2026-11-07',
      [33, 56, 61],
    );
  });

  it('el mes, como antes: del primero al último día', async () => {
    const { servicio, repo } = armar();
    const lista = await servicio.lista(1, '2026-12', UserRole.ADMINISTRADOR);
    expect(repo.delPeriodo).toHaveBeenCalledWith(
      1,
      '2026-12-01',
      '2027-01-01',
      undefined,
    );
    expect(lista).toMatchObject({
      mes: '2026-12',
      desde: '2026-12-01',
      hasta: '2026-12-31',
    });
  });

  it.each([
    [{ desde: '2026-11-01' }, 'Faltan las dos fechas'],
    [
      { desde: '2026-02-31', hasta: '2026-03-05' },
      'no existe en el calendario',
    ],
    [{ desde: '2026-11-06', hasta: '2026-11-01' }, 'va antes'],
    [{ desde: '2025-01-01', hasta: '2026-11-06' }, 'hasta un año'],
  ])('un rango que no sirve no se busca: %j', async (periodo, mensaje) => {
    const { servicio, repo } = armar();
    await expect(
      servicio.lista(1, periodo, UserRole.ADMINISTRADOR),
    ).rejects.toThrow(mensaje);
    expect(repo.delPeriodo).not.toHaveBeenCalled();
  });

  it('cada uno con su estado para el filtro, la condición de pago y la referencia (§9.22)', async () => {
    const sinOC = { ...FACTURA_1, orden_de_compra_id: null };
    const { servicio } = armar({
      documentos: [
        {
          ...sinOC,
          id: 20,
          folio: 20,
          forma_de_pago: 2,
          vencimiento: '2026-12-04',
          referencias: [
            {
              tipo: '801',
              folio: '4500-112',
              fecha: '2026-11-02',
              razon: null,
            },
          ],
        },
        { ...sinOC, id: 21, folio: 21, forma_de_pago: 1, vencimiento: null },
        { ...sinOC, id: 22, folio: 22 },
        {
          ...sinOC,
          id: 23,
          tipo: 61,
          folio: 3,
          total: 100000,
          modifica_id: 22,
          codigo_referencia: 3,
        },
        { ...sinOC, id: 26, folio: 26 },
        {
          ...sinOC,
          id: 27,
          tipo: 61,
          folio: 4,
          modifica_id: 26,
          codigo_referencia: 1,
        },
        {
          ...sinOC,
          id: 24,
          tipo: 39,
          folio: 500,
          quotation_id: null,
          receptor: { rut: '66666666-6', razon_social: '' },
          detalle: [{ descripcion: 'Cabaña 4 · Noche', cabana: 'Cabaña 4' }],
        },
        {
          ...sinOC,
          id: 25,
          folio: null,
          estado: 'por_confirmar',
          fecha_emision: null,
        },
      ],
    });
    const lista = await servicio.lista(1, '2026-11', UserRole.ADMINISTRADOR);
    const de = (id: number) => lista.documentos.find((d) => d.id === id);
    expect(de(20)).toMatchObject({
      situacion: 'vigente',
      forma_de_pago: 2,
      vencimiento: '2026-12-04',
      plazo_dias: 30,
      referencia: { tipo: '801', folio: '4500-112' },
      rut: '90413000-1',
    });
    expect(de(21)).toMatchObject({
      situacion: 'vigente',
      forma_de_pago: 1,
      vencimiento: null,
      plazo_dias: null,
      referencia: null,
    });
    expect(de(22)?.situacion).toBe('rebajada');
    expect(de(23)?.situacion).toBe('nota');
    expect(de(26)?.situacion).toBe('anulada');
    expect(de(27)?.situacion).toBe('nota');
    // El chip en una palabra y abajo lo que lo cambió (§9.22, 07-11).
    expect(de(20)?.cadena).toMatchObject({ texto: 'Vigente', detalle: null });
    expect(de(22)?.cadena).toMatchObject({
      texto: 'Rebajada',
      detalle: '−$100.000',
    });
    expect(de(23)?.cadena).toMatchObject({ texto: 'Vigente', detalle: null });
    expect(de(23)).toMatchObject({ nombre: 'NC 3', que_hace: 'rebaja la 22' });
    expect(de(26)?.cadena).toMatchObject({
      texto: 'Anulada',
      detalle: 'Por NC 4',
    });
    expect(de(25)?.cadena).toMatchObject({
      texto: 'Por confirmar',
      detalle: null,
    });
    expect(de(24)).toMatchObject({
      situacion: 'vigente',
      cliente: 'Cabaña 4',
      rut: null,
      forma_de_pago: null,
    });
    expect(de(25)?.situacion).toBe('por_confirmar');
  });
});
