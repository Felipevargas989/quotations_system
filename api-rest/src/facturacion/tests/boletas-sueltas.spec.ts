import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { mockPinoLogger } from '../../testing/mocks';
import { BoletaSueltaDto, ItemDelTarifarioDto } from '../boletas/boleta.dto';
import { BoletasService } from '../boletas/boletas.service';
import { FacturacionClSimulado } from '../facturacion-cl/simulado';

/**
 * LA BOLETA SUELTA Y EL TARIFARIO (doc 19 §9.4 y §9.16, paso 3b). D3,
 * Felipe 04-11: *"tarifario aparte puede ser cabañas, ticket diario,
 * otros"*. Los precios de acá son de prueba: los reales los pone Felipe.
 */

const TARIFARIO = [
  {
    id: 1,
    nombre: 'Cabaña 4 personas temporada alta',
    precio: 130000,
    unidad: 'noche',
    activo: true,
    orden: 0,
  },
  {
    id: 2,
    nombre: 'Tinaja',
    precio: 30000,
    unidad: 'unidad',
    activo: true,
    orden: 1,
  },
  {
    id: 3,
    nombre: 'Ticket diario',
    precio: 10000,
    unidad: 'persona',
    activo: false,
    orden: 2,
  },
];

const RECEPCION = {
  id: 'u-isabel',
  company_id: 1,
  email: 'recepcion@valledelsolquillon.cl',
  full_name: 'Isabel',
  role: 'recepcion',
} as never;
const ADMIN = { ...(RECEPCION as object), role: 'administrador' } as never;

const armar = (
  simulado = new FacturacionClSimulado({
    ultimoFolio: () => Promise.resolve(42),
  }),
) => {
  const repo = {
    tarifario: jest.fn().mockResolvedValue(TARIFARIO),
    nombreDeLaPersona: jest.fn().mockResolvedValue(null),
  };
  const filas: Record<number, Record<string, unknown>> = {};
  let id = 200;
  const documentos = {
    crear: jest.fn().mockImplementation((f: Record<string, unknown>) => {
      filas[id] = { id, ...f, folio: null };
      return Promise.resolve(filas[id++]);
    }),
    actualizar: jest
      .fn()
      .mockImplementation((i: number, _c: number, cambios: object) => {
        filas[i] = { ...filas[i], ...cambios };
        return Promise.resolve(filas[i]);
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
  return { servicio, documentos, simulado };
};

describe('La boleta del evento (doc 19 §9.20)', () => {
  const LINEAS = [
    {
      descripcion: 'Servicio de matrimonio del 15-11-2026',
      descripcionLarga: null,
      cantidad: 100,
      precio: 80000,
    },
  ];

  it('una boleta con las líneas del DTE, en el evento y con su PDF en Documentos', async () => {
    const { servicio, documentos, simulado } = armar();
    const r = await servicio.emitirDelEvento(ADMIN, simulado, {
      quotationId: 'ev-512',
      lineas: LINEAS,
      correo: 'Novios@Gmail.com',
      observaciones: ['Cotización N° 512 · evento 15-11-2026'],
      totalEsperado: 8000000,
    });
    expect(r).toMatchObject({ estado: 'emitido', folio: 43, total: 8000000 });
    expect(documentos.crear).toHaveBeenCalledWith(
      expect.objectContaining({
        tipo: 39,
        quotation_id: 'ev-512',
        orden_de_compra_id: null,
        total: 8000000,
        receptor: expect.objectContaining({ correo: 'novios@gmail.com' }),
      }),
    );
    expect(documentos.agregarAlEvento).toHaveBeenCalledWith(
      'ev-512',
      'Boleta N° 43 (simulada).pdf',
      expect.any(String),
    );
  });

  it('si se corta, devuelve la que quedó por confirmar', async () => {
    const simulado = new FacturacionClSimulado({ cortarEnElEnvio: true });
    const { servicio } = armar(simulado);
    const r = await servicio.emitirDelEvento(ADMIN, simulado, {
      quotationId: 'ev-512',
      lineas: LINEAS,
      correo: null,
      observaciones: [],
      totalEsperado: 8000000,
    });
    expect(r).toMatchObject({ estado: 'por_confirmar', tipo: 39 });
  });
});

describe('La boleta suelta', () => {
  it('lo del tarifario por su cantidad, con la cabaña en la observación', async () => {
    const { servicio, documentos } = armar();
    const r = await servicio.emitirSuelta(RECEPCION, {
      lineas: [
        { tarifario_id: 1, cantidad: 2 },
        { tarifario_id: 2, cantidad: 1 },
      ],
      cabana: 'Cabaña 4',
      correo: 'HUESPED@example.com',
    });
    expect(r).toEqual({
      boleta: {
        id: 200,
        folio: 43,
        estado: 'emitido',
        total: 290000,
        pdf_path: 'c1/documentos-tributarios/boleta_43_simulado.pdf',
      },
      aviso: null,
    });
    const fila = (documentos.crear.mock.calls as unknown[][])[0][0] as {
      archivo_enviado: string;
      quotation_id: string | null;
      receptor: { correo: string };
      detalle: { descripcion: string; descripcionLarga: string | null }[];
    };
    expect(fila.quotation_id).toBeNull();
    expect(fila.receptor.correo).toBe('huesped@example.com');
    expect(fila.detalle[0]).toMatchObject({
      descripcion: 'Cabaña 4 personas temporada alta',
      descripcionLarga: '2 noches',
    });
    expect(fila.archivo_enviado).toContain('->Observacion<-\r\nCabaña 4;');
    // Sin evento, no va a Documentos de ningún evento.
    expect(documentos.agregarAlEvento).not.toHaveBeenCalled();
  });

  it('escribir un monto a mano es solo del administrador', async () => {
    const { servicio } = armar();
    const aMano = { lineas: [{ descripcion: 'Leña', monto: 15000 }] };
    await expect(servicio.emitirSuelta(RECEPCION, aMano)).rejects.toThrow(
      ForbiddenException,
    );
    const r = await servicio.emitirSuelta(ADMIN, aMano);
    expect(r.boleta).toMatchObject({ total: 15000 });
  });

  it('un ítem desactivado o de otra empresa no se boletea', async () => {
    const { servicio, documentos } = armar();
    await expect(
      servicio.emitirSuelta(RECEPCION, { lineas: [{ tarifario_id: 3 }] }),
    ).rejects.toThrow(BadRequestException);
    await expect(
      servicio.emitirSuelta(RECEPCION, { lineas: [{ tarifario_id: 99 }] }),
    ).rejects.toThrow('Ese ítem del tarifario no existe o está desactivado');
    expect(documentos.crear).not.toHaveBeenCalled();
  });

  it('si se corta, queda por confirmar y lo dice, sin reintentar (L5)', async () => {
    const { servicio, documentos } = armar(
      new FacturacionClSimulado({ cortarEnElEnvio: true }),
    );
    const r = await servicio.emitirSuelta(RECEPCION, {
      lineas: [{ tarifario_id: 2 }],
    });
    expect(r).toEqual({
      boleta: null,
      aviso:
        'La boleta quedó por confirmar: se cortó al mandarla. No la emitas de nuevo.',
    });
    expect(documentos.crear).toHaveBeenCalledTimes(1);
  });
});

describe('Lo que acepta el motor', () => {
  const errores = async (
    clase: typeof BoletaSueltaDto | typeof ItemDelTarifarioDto,
    body: Record<string, unknown>,
  ) => (await validate(plainToInstance(clase, body))).map((e) => e.property);

  it('el tarifario: nombre hasta 60, precio entero y una unidad conocida', async () => {
    expect(
      await errores(ItemDelTarifarioDto, {
        nombre: 'Cabaña 6 personas temporada media',
        precio: 140000,
        unidad: 'noche',
      }),
    ).toEqual([]);
    expect(
      await errores(ItemDelTarifarioDto, {
        nombre: 'x'.repeat(61),
        precio: 10.5,
        unidad: 'semana',
      }),
    ).toEqual(['nombre', 'precio', 'unidad']);
  });

  it('la boleta suelta: al menos una línea, cantidades enteras y un correo de verdad', async () => {
    expect(
      await errores(BoletaSueltaDto, {
        lineas: [],
        correo: 'no-es-correo',
        cabana: 'y'.repeat(23),
      }),
    ).toEqual(['lineas', 'cabana', 'correo']);
    expect(
      await errores(BoletaSueltaDto, {
        lineas: [{ tarifario_id: 1, cantidad: 0 }],
      }),
    ).toEqual(['lineas']);
  });
});
