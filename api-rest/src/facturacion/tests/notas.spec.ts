import { BadRequestException, ConflictException } from '@nestjs/common';
import { mockPinoLogger } from '../../testing/mocks';
import {
  FacturacionClSimulado,
  revisarArchivo,
} from '../facturacion-cl/simulado';
import {
  Cadena,
  estadoEnPalabras,
  plazoDelSii,
  type DocumentoDeLaCadena,
} from '../notas/cadena';
import { NotasService } from '../notas/notas.service';

/**
 * LA CADENA DE ANULACIONES Y LAS NOTAS (doc 19 §9.5, paso 4), con el caso
 * del laboratorio: la factura simulada N° 1 de CCU, $1.428.000.
 */

const doc = (
  d: Partial<DocumentoDeLaCadena> & Pick<DocumentoDeLaCadena, 'id' | 'tipo'>,
): DocumentoDeLaCadena => ({
  folio: d.id,
  estado: 'emitido',
  total: 1000000,
  fecha_emision: '2026-11-04',
  modifica_id: null,
  codigo_referencia: null,
  ...d,
});

describe('La cadena', () => {
  it('una NC que anula deja la factura anulada; la ND que anula esa NC la devuelve', () => {
    const factura = doc({ id: 1, tipo: 33 });
    const nc = doc({ id: 2, tipo: 61, modifica_id: 1, codigo_referencia: 1 });
    let c = new Cadena([factura, nc]);
    expect(estadoEnPalabras(c.estado(1))).toBe('Anulada por NC 2');
    expect(c.facturado(1)).toBe(0);

    const nd = doc({ id: 3, tipo: 56, modifica_id: 2, codigo_referencia: 1 });
    c = new Cadena([factura, nc, nd]);
    expect(estadoEnPalabras(c.estado(2))).toBe('Anulada por ND 3');
    expect(c.estado(1)).toEqual({ como: 'vigente' });
    expect(c.facturado(1)).toBe(1000000);
  });

  it('una rebaja deja lo que queda; una corrección de texto no cambia el monto', () => {
    const c = new Cadena([
      doc({ id: 1, tipo: 33 }),
      doc({
        id: 2,
        tipo: 61,
        modifica_id: 1,
        codigo_referencia: 3,
        total: 300000,
      }),
      doc({ id: 3, tipo: 33 }),
      doc({ id: 4, tipo: 61, modifica_id: 3, codigo_referencia: 2, total: 0 }),
    ]);
    expect(estadoEnPalabras(c.estado(1))).toBe('Rebajada: queda $700.000');
    expect(c.saldo(1)).toBe(700000);
    expect(estadoEnPalabras(c.estado(3))).toBe('Corregida por NC 4');
    expect(c.saldo(3)).toBe(1000000);
  });

  it('una nota rechazada no salió: no cuenta', () => {
    const c = new Cadena([
      doc({ id: 1, tipo: 33 }),
      doc({
        id: 2,
        tipo: 61,
        modifica_id: 1,
        codigo_referencia: 1,
        estado: 'rechazado',
      }),
    ]);
    expect(c.vigente(1)).toBe(true);
  });

  it('los plazos del SII: anular, el mes siguiente; rebajar, 6 meses', () => {
    expect(plazoDelSii('2026-11-04', 'anular')).toBe('2026-12-31');
    expect(plazoDelSii('2026-12-15', 'corregir')).toBe('2027-01-31');
    expect(plazoDelSii('2026-11-04', 'rebajar')).toBe('2027-05-04');
  });
});

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
    { de: () => simulado } as never,
    bitacora as never,
    mockPinoLogger() as never,
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
    expect(filas.get(20)).toMatchObject({ estado: 'emitido', folio: 5 });
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
    const lista = await servicio.lista(1, '2026-11');
    expect(
      lista.documentos.map((d) => [d.titulo, d.cadena.texto, d.total]),
    ).toEqual([
      ['Factura 1', 'Anulada por NC 1', 1428000],
      ['NC 1 · anula la 1', 'Código 1 · 04-11', -1428000],
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
});
