import { BadRequestException, ConflictException } from '@nestjs/common';
import { mockPinoLogger } from '../../testing/mocks';
import type { CobroGuardado, NuevoCambio } from '../boletas/boletas.repository';
import { BoletasService } from '../boletas/boletas.service';
import {
  glosaDeLaBoleta,
  problemasParaEmitir,
  repartoDelCobro,
} from '../boletas/reparto';
import { FacturacionClSimulado } from '../facturacion-cl/simulado';

/**
 * LAS BOLETAS DE RECEPCIÓN (doc 19 §9.4, paso 3a), con el caso de la
 * maqueta del 04-11: la delegación Vilcún, $1.200.000 repartidos en
 * cabañas, una boleta por cabaña.
 */

const COBRO = (): CobroGuardado => ({
  id: 5,
  company_id: 1,
  quotation_id: 'ev-698',
  descripcion: 'Delegación Vilcún · alojamiento 12 al 15-11',
  total: 1200000,
  creado_por: 'u-felipe',
  creado_por_nombre: 'Felipe Vargas',
  created_at: '2026-11-04T20:00:00Z',
  cotizacion: { quotation_number: 698 },
  lineas: [
    {
      id: 1,
      cobro_id: 5,
      cabana: 'Cabaña 4',
      monto: 300000,
      correo: null,
      documento_id: 90,
      documento: {
        folio: 1021,
        estado: 'emitido',
        ambiente: 'simulado',
        pdf_path: null,
      },
    },
    {
      id: 2,
      cobro_id: 5,
      cabana: 'Cabaña 8',
      monto: 500000,
      correo: 'jperez@gmail.com',
      documento_id: null,
      documento: null,
    },
    {
      id: 3,
      cobro_id: 5,
      cabana: 'Cabaña 9',
      monto: 400000,
      correo: null,
      documento_id: null,
      documento: null,
    },
  ],
  cambios: [],
});

describe('El reparto de un cobro', () => {
  it('cuenta lo repartido, lo boleteado y lo que falta', () => {
    expect(repartoDelCobro(COBRO())).toEqual({
      repartido: 1200000,
      boleteado: 300000,
      falta: 0,
      porEmitir: 2,
    });
  });

  it('no deja emitir si lo repartido no suma el total', () => {
    const c = COBRO();
    c.lineas[2].monto = 300000;
    expect(problemasParaEmitir(c)).toEqual([
      'Lo repartido suma $1.100.000: faltan $100.000 para el total',
    ]);
    c.lineas[2].monto = 500000;
    expect(problemasParaEmitir(c)).toEqual([
      'Lo repartido pasa el total por $100.000',
    ]);
    expect(problemasParaEmitir(COBRO())).toEqual([]);
  });

  it('la glosa (la cabaña y el cobro) cabe en los 80 de la boleta', () => {
    const glosa = glosaDeLaBoleta(
      { descripcion: 'x'.repeat(55) },
      { cabana: 'y'.repeat(22) },
    );
    expect(Array.from(glosa).length).toBeLessThanOrEqual(80);
    expect(glosaDeLaBoleta(COBRO(), COBRO().lineas[1])).toBe(
      'Cabaña 8 · Delegación Vilcún · alojamiento 12 al 15-11',
    );
  });
});

const USUARIO = {
  id: 'u-isabel',
  company_id: 1,
  email: 'recepcion@valledelsolquillon.cl',
  full_name: 'Isabel',
  role: 'recepcion',
} as never;

const armar = ({
  cobro = COBRO(),
  simulado = new FacturacionClSimulado({
    ultimoFolio: () => Promise.resolve(1021),
  }),
} = {}) => {
  let actual = cobro;
  let docId = 100;
  const anotados: NuevoCambio[] = [];
  const repo = {
    cobro: jest.fn().mockImplementation(() => Promise.resolve(actual)),
    cobros: jest.fn().mockImplementation(() => Promise.resolve([actual])),
    editarCobro: jest
      .fn()
      .mockImplementation((_id: number, _c: number, cambios: object) => {
        actual = { ...actual, ...cambios };
        return Promise.resolve();
      }),
    editarLinea: jest
      .fn()
      .mockImplementation(
        (id: number, _cobro: number, _c: number, cambios: object) => {
          actual = {
            ...actual,
            lineas: actual.lineas.map((l) =>
              l.id === id ? { ...l, ...cambios } : l,
            ),
          };
          return Promise.resolve();
        },
      ),
    quitarLinea: jest.fn().mockResolvedValue(undefined),
    agregarLinea: jest.fn().mockResolvedValue(4),
    anotar: jest.fn().mockImplementation((c: NuevoCambio[]) => {
      anotados.push(...c);
      return Promise.resolve();
    }),
  };
  const filas: Record<number, Record<string, unknown>> = {};
  const documentos = {
    eventoAFacturar: jest.fn().mockResolvedValue({ estado: 'aceptada' }),
    crear: jest.fn().mockImplementation((f: Record<string, unknown>) => {
      const id = docId++;
      filas[id] = { id, ...f, folio: null };
      return Promise.resolve(filas[id]);
    }),
    actualizar: jest
      .fn()
      .mockImplementation((id: number, _c: number, cambios: object) => {
        filas[id] = { ...filas[id], ...cambios };
        return Promise.resolve(filas[id]);
      }),
    guardarPdf: jest.fn().mockResolvedValue(undefined),
    agregarAlEvento: jest.fn().mockResolvedValue(undefined),
  };
  const servicio = new BoletasService(
    repo as never,
    documentos as never,
    { de: () => simulado } as never,
    mockPinoLogger() as never,
  );
  return { servicio, repo, documentos, filas, anotados };
};

describe('Emitir las boletas de un cobro', () => {
  it('una boleta por cabaña que falta, amarrada a su línea antes de mandarla', async () => {
    const { servicio, repo, documentos, filas, anotados } = armar();
    const r = await servicio.emitir(USUARIO, 5);

    expect(r.emitidas).toEqual([1022, 1023]);
    expect(r.aviso).toBeNull();
    expect(documentos.crear).toHaveBeenCalledTimes(2);
    expect(documentos.crear).toHaveBeenCalledWith(
      expect.objectContaining({
        tipo: 39,
        estado: 'enviando',
        total: 500000,
        quotation_id: 'ev-698',
        receptor: {
          rut: '66666666-6',
          razon_social: '',
          correo: 'jperez@gmail.com',
        },
      }),
    );
    // La línea se amarra a su boleta ANTES de mandarla.
    expect(repo.editarLinea).toHaveBeenCalledWith(2, 5, 1, {
      documento_id: 100,
    });
    expect(filas[100]).toMatchObject({ estado: 'emitido', folio: 1022 });
    expect(documentos.agregarAlEvento).toHaveBeenCalledWith(
      'ev-698',
      'Boleta N° 1022 (simulada).pdf',
      'c1/event-documents/ev-698/facturas/boleta_1022_simulado.pdf',
    );
    expect(anotados.map((a) => [a.que, a.despues, a.nombre])).toEqual([
      ['emite', 'Boleta N° 1022', 'Isabel'],
      ['emite', 'Boleta N° 1023', 'Isabel'],
    ]);
    expect(r.cobro).toMatchObject({ falta: 0, porEmitir: 0 });
  });

  it('si no suma el total, no sale ninguna', async () => {
    const cobro = COBRO();
    cobro.lineas[2].monto = 300000;
    const { servicio, documentos } = armar({ cobro });
    await expect(servicio.emitir(USUARIO, 5)).rejects.toThrow(
      new BadRequestException(
        'Lo repartido suma $1.100.000: faltan $100.000 para el total',
      ),
    );
    expect(documentos.crear).not.toHaveBeenCalled();
  });

  it('si se corta, esa queda por confirmar y no sigue con las demás (L5)', async () => {
    const { servicio, documentos, filas } = armar({
      simulado: new FacturacionClSimulado({ cortarEnElEnvio: true }),
    });
    const r = await servicio.emitir(USUARIO, 5);
    expect(r.emitidas).toEqual([]);
    expect(r.aviso).toBe(
      'La boleta de Cabaña 8 quedó por confirmar: se cortó al mandarla. No la emitas de nuevo.',
    );
    expect(documentos.crear).toHaveBeenCalledTimes(1);
    expect(filas[100]).toMatchObject({ estado: 'por_confirmar' });
  });
});

describe('E3: editable, y queda anotado quién cambió qué', () => {
  it('el monto de una cabaña y el total se cambian, con el antes y el después', async () => {
    const { servicio, anotados } = armar();
    await servicio.editarLinea(USUARIO, 5, 2, { monto: 450000 });
    await servicio.editarCobro(USUARIO, 5, { total: 1150000 });
    expect(anotados.map((a) => [a.que, a.antes, a.despues, a.nombre])).toEqual([
      ['monto', '$500.000', '$450.000', 'Isabel'],
      ['total', '$1.200.000', '$1.150.000', 'Isabel'],
    ]);
  });

  it('lo que ya tiene boleta no se toca, y el total no baja de lo boleteado', async () => {
    const { servicio } = armar();
    await expect(
      servicio.editarLinea(USUARIO, 5, 1, { monto: 1 }),
    ).rejects.toThrow(ConflictException);
    await expect(servicio.quitarLinea(USUARIO, 5, 1)).rejects.toThrow(
      ConflictException,
    );
    await expect(
      servicio.editarCobro(USUARIO, 5, { total: 200000 }),
    ).rejects.toThrow(
      'Ya hay $300.000 boleteados: el total no puede quedar bajo eso',
    );
    await expect(servicio.borrarCobro(USUARIO, 5)).rejects.toThrow(
      ConflictException,
    );
  });

  it('el cobro de un evento que no está aceptado ni realizado no se deja', async () => {
    const { servicio, documentos } = armar();
    documentos.eventoAFacturar.mockResolvedValue({ estado: 'enviada' });
    await expect(
      servicio.crearCobro(USUARIO, {
        quotation_id: 'ev-698',
        descripcion: 'Alojamiento',
        total: 100000,
      }),
    ).rejects.toThrow('Se boletea un evento aceptado o ya realizado');
  });
});
