import { ConflictException } from '@nestjs/common';
import type { PinoLogger } from 'nestjs-pino';
import type { User } from 'src/users/entities/user.entity';
import type { CajaRepository, TurnoDeCaja } from '../caja/caja.repository';
import { CajaService } from '../caja/caja.service';
import { cuadrar, type DocumentoDelTurno } from '../caja/cuadre';
import { CAJA_CERRADA, turnoParaEmitir } from '../caja/regla';

// LA CAJA DE RECEPCIÓN (doc 19 §9.43, sprint 2): el cuadre, el cierre ciego,
// la revisión y la regla de emitir con la caja abierta.

const RECEPCION = {
  id: 'u-recepcion',
  company_id: 1,
  role: 'recepcion',
  full_name: 'Recepción',
} as unknown as User;
const ADMIN = {
  id: 'u-camila',
  company_id: 1,
  role: 'administrador',
  full_name: 'Camila Carvajal',
} as unknown as User;

const TURNO: TurnoDeCaja = {
  id: 7,
  company_id: 1,
  caja: 'recepcion',
  abierta_por: 'u-recepcion',
  abierta_por_nombre: 'Ana',
  abierta_en: '2026-11-09T12:02:00Z',
  sencillo_inicial: 20000,
  cerrada_por: null,
  cerrada_por_nombre: null,
  cerrada_en: null,
  declarado_efectivo: null,
  declarado_debito: null,
  declarado_credito: null,
  declarado_transferencia: null,
  comentario: null,
  revisado_por: null,
  revisado_por_nombre: null,
  revisado_en: null,
  nota_revision: null,
};

const doc = (d: Partial<DocumentoDelTurno>): DocumentoDelTurno => ({
  id: 1,
  tipo: 39,
  folio: 45001,
  estado: 'emitido',
  total: 0,
  medio_de_pago: 'efectivo',
  emitido_en: '2026-11-09T13:00:00Z',
  detalle: [],
  ...d,
});

// La maqueta: efectivo $97.500, débito $130.000, crédito $100.000 y
// transferencia $40.000, con un retiro de $50.000.
const DOCUMENTOS = [
  doc({
    id: 1,
    total: 97500,
    detalle: [
      {
        descripcion: 'Ticket diario, temporada media',
        cantidad: 13,
        precio: 7500,
        tarifario_id: 26,
      },
    ],
  }),
  doc({
    id: 2,
    total: 130000,
    medio_de_pago: 'debito',
    detalle: [
      {
        descripcion: 'Cabaña 4 · Cabaña 4 personas, temporada media',
        cantidad: 1,
        precio: 100000,
        tarifario_id: 5,
      },
      {
        descripcion: 'Cabaña 4 · Tinaja con tabla y espumante',
        cantidad: 1,
        precio: 30000,
        tarifario_id: 22,
      },
    ],
  }),
  doc({ id: 3, total: 100000, medio_de_pago: 'credito' }),
  doc({ id: 4, total: 40000, medio_de_pago: 'transferencia' }),
  // Lo que no salió no cuenta.
  doc({ id: 5, total: 999999, estado: 'rechazado' }),
  doc({ id: 6, total: 5000, estado: 'por_confirmar' }),
];
const RETIROS = [{ monto: 50000 }];

describe('El cuadre de la caja (§9.43)', () => {
  it('lo esperado: el efectivo con el sencillo y los retiros; lo demás, lo vendido', () => {
    const c = cuadrar(TURNO, DOCUMENTOS, RETIROS);
    const de = (m: string) => c.lineas.find((l) => l.medio === m);
    expect(de('efectivo')?.esperado).toBe(20000 + 97500 - 50000);
    expect(de('debito')?.esperado).toBe(130000);
    expect(de('credito')?.esperado).toBe(100000);
    expect(de('transferencia')?.esperado).toBe(40000);
    expect(c.vendido).toBe(367500);
    expect(c.porConfirmar).toBe(1);
    // Abierta: sin declarado ni diferencia.
    expect(c.declarado).toBeNull();
    expect(de('efectivo')?.diferencia).toBeNull();
  });

  it('la diferencia es lo declarado menos lo esperado, por medio y en total', () => {
    const c = cuadrar(
      {
        ...TURNO,
        declarado_efectivo: 67500,
        declarado_debito: 135000,
        declarado_credito: 95000,
        declarado_transferencia: 40000,
      },
      DOCUMENTOS,
      RETIROS,
    );
    const de = (m: string) => c.lineas.find((l) => l.medio === m);
    expect(de('efectivo')?.diferencia).toBe(0);
    expect(de('debito')?.diferencia).toBe(5000);
    expect(de('credito')?.diferencia).toBe(-5000);
    expect(c.diferencia).toBe(0);
  });

  it('lo vendido por ítem del tarifario, sin la cabaña del comienzo', () => {
    const c = cuadrar(TURNO, DOCUMENTOS, RETIROS);
    expect(c.vendidoPorItem).toEqual([
      {
        tarifario_id: 5,
        nombre: 'Cabaña 4 personas, temporada media',
        cantidad: 1,
        monto: 100000,
      },
      {
        tarifario_id: 26,
        nombre: 'Ticket diario, temporada media',
        cantidad: 13,
        monto: 97500,
      },
      {
        tarifario_id: 22,
        nombre: 'Tinaja con tabla y espumante',
        cantidad: 1,
        monto: 30000,
      },
    ]);
  });

  it('la factura trae sus líneas en neto: lo vendido va con IVA', () => {
    const c = cuadrar(
      TURNO,
      [
        doc({
          tipo: 33,
          total: 140000,
          detalle: [
            {
              descripcion: 'Cabaña 6 personas, temporada media',
              cantidad: 1,
              precio: 117647.058824,
              tarifario_id: 8,
            },
          ],
        }),
      ],
      [],
    );
    expect(c.vendidoPorItem[0].monto).toBe(140000);
  });
});

const repo = () => ({
  turnoAbierto: jest.fn().mockResolvedValue(TURNO),
  abrir: jest.fn().mockResolvedValue(TURNO),
  cerrar: jest.fn().mockResolvedValue({
    ...TURNO,
    cerrada_en: '2026-11-09T21:05:00Z',
    cerrada_por_nombre: 'Ana',
    declarado_efectivo: 67500,
    declarado_debito: 135000,
    declarado_credito: 95000,
    declarado_transferencia: 40000,
  }),
  turnos: jest.fn().mockResolvedValue([TURNO]),
  turno: jest.fn().mockResolvedValue(TURNO),
  retiros: jest.fn().mockResolvedValue([
    {
      id: 1,
      turno_id: 7,
      monto: 50000,
      motivo: 'Entregado a Felipe',
      created_at: '2026-11-09T17:30:00Z',
    },
  ]),
  agregarRetiro: jest.fn().mockResolvedValue(undefined),
  documentos: jest
    .fn()
    .mockResolvedValue(DOCUMENTOS.map((d) => ({ ...d, turno_de_caja_id: 7 }))),
  cambiarMedio: jest.fn().mockResolvedValue({ medio_antes: 'credito' }),
  anotarCorreccion: jest.fn().mockResolvedValue(undefined),
  correcciones: jest.fn().mockResolvedValue([]),
  revisar: jest.fn().mockResolvedValue({ ...TURNO, revisado_en: 'x' }),
  // Sprint 3: el correo del cierre y «Lo vendido».
  correosDe: jest.fn().mockResolvedValue(['camila@example.com']),
  nombreDeLaEmpresa: jest.fn().mockResolvedValue('Valle del Sol Quillón SpA'),
  documentosDelPeriodo: jest.fn().mockResolvedValue([
    {
      id: 1,
      tipo: 39,
      turno_de_caja_id: 7,
      creado_por: 'u-recepcion',
      detalle: [
        {
          descripcion: 'Ticket diario, temporada media',
          cantidad: 4,
          precio: 7500,
          tarifario_id: 26,
        },
      ],
    },
    {
      id: 2,
      tipo: 39,
      turno_de_caja_id: null,
      creado_por: 'u-camila',
      detalle: [
        {
          descripcion: 'Tinaja con tabla y espumante',
          cantidad: 1,
          precio: 30000,
          tarifario_id: 22,
        },
      ],
    },
    // Anulada por su nota de crédito: no cuenta.
    {
      id: 3,
      tipo: 39,
      turno_de_caja_id: 7,
      creado_por: 'u-recepcion',
      detalle: [
        {
          descripcion: 'Ticket diario, temporada media',
          cantidad: 2,
          precio: 7500,
          tarifario_id: 26,
        },
      ],
    },
    // La factura de un evento: no es de «Nuevo DTE».
    {
      id: 4,
      tipo: 33,
      turno_de_caja_id: null,
      creado_por: 'u-camila',
      quotation_id: 'q-evento',
      detalle: [
        { descripcion: 'Servicio de matrimonio', cantidad: 100, precio: 50000 },
      ],
    },
    // Una línea a mano de «Nuevo DTE»: cuenta, por lo que dice.
    {
      id: 5,
      tipo: 39,
      turno_de_caja_id: null,
      creado_por: 'u-camila',
      quotation_id: null,
      detalle: [{ descripcion: 'test', cantidad: 1, precio: 100 }],
    },
    // Traída de facturacion.cl: no se vendió en Eventia.
    {
      id: 6,
      tipo: 33,
      turno_de_caja_id: null,
      creado_por: 'u-camila',
      quotation_id: null,
      traida: true,
      detalle: [
        { descripcion: 'Factura de antes', cantidad: 1, precio: 84034 },
      ],
    },
  ]),
  anulados: jest.fn().mockResolvedValue(new Set([3])),
  nombresDeTurnos: jest.fn().mockResolvedValue(new Map([[7, 'Ana']])),
  nombresDePersonas: jest
    .fn()
    .mockResolvedValue(new Map([['u-camila', 'Camila Carvajal']])),
  tarifario: jest.fn().mockResolvedValue([
    { id: 26, nombre: 'Ticket diario, temporada media', unidad: 'persona' },
    { id: 22, nombre: 'Tinaja con tabla y espumante', unidad: 'unidad' },
  ]),
});

const logger = {
  setContext: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
} as unknown as PinoLogger;

const armar = () => {
  const r = repo();
  // De fábrica, revisa el administrador.
  const permisos = {
    delCargo: jest.fn((_c: number, cargo: string) =>
      Promise.resolve(cargo === 'administrador' ? ['caja_revision'] : []),
    ),
  };
  const email = { sendEmail: jest.fn().mockResolvedValue(undefined) };
  return {
    r,
    email,
    servicio: new CajaService(
      r as unknown as CajaRepository,
      logger,
      permisos as never,
      email as never,
    ),
  };
};

describe('La caja de recepción (§9.43)', () => {
  it('quien la opera ve que está abierta, con su sencillo y sus retiros, sin lo vendido (cierre ciego)', async () => {
    const { servicio } = armar();
    const e = await servicio.estado(RECEPCION);
    expect(e.abierta).toMatchObject({
      abierta_por_nombre: 'Ana',
      sencillo_inicial: 20000,
      retiros: [{ monto: 50000, motivo: 'Entregado a Felipe' }],
    });
    expect(JSON.stringify(e)).not.toMatch(/esperado|vendido|diferencia/);
  });

  it('se abre con su sencillo, a nombre del perfil de la sesión (no se escribe); si ya está abierta, lo dice', async () => {
    const { servicio, r } = armar();
    await servicio.abrir(RECEPCION, { sencillo: 20000 });
    expect(r.abrir).toHaveBeenCalledWith({
      company_id: 1,
      abierta_por: 'u-recepcion',
      abierta_por_nombre: 'Recepción',
      sencillo_inicial: 20000,
    });
    r.abrir.mockRejectedValueOnce({ code: '23505' });
    await expect(servicio.abrir(RECEPCION, { sencillo: 0 })).rejects.toThrow(
      'ya está abierta',
    );
  });

  it('el cierre guarda lo declarado y responde solo que cerró', async () => {
    const { servicio, r } = armar();
    const res = await servicio.cerrar(RECEPCION, {
      efectivo: 67500,
      debito: 135000,
      credito: 95000,
      transferencia: 40000,
      comentario: '',
    });
    expect(r.cerrar).toHaveBeenCalledWith(1, 7, {
      cerrada_por: 'u-recepcion',
      cerrada_por_nombre: 'Recepción',
      declarado_efectivo: 67500,
      declarado_debito: 135000,
      declarado_credito: 95000,
      declarado_transferencia: 40000,
      comentario: null,
    });
    expect(res).toEqual({ cerrada_en: '2026-11-09T21:05:00Z' });
    // Sin caja abierta no hay nada que cerrar.
    r.turnoAbierto.mockResolvedValueOnce(null);
    await expect(
      servicio.cerrar(RECEPCION, {
        efectivo: 0,
        debito: 0,
        credito: 0,
        transferencia: 0,
      }),
    ).rejects.toThrow('no está abierta');
  });

  it('la revisión ve lo declarado, lo esperado y la diferencia por medio de pago', async () => {
    const { servicio, r } = armar();
    r.turno.mockResolvedValue({
      ...TURNO,
      cerrada_en: '2026-11-09T21:05:00Z',
      cerrada_por_nombre: 'Ana',
      declarado_efectivo: 67500,
      declarado_debito: 135000,
      declarado_credito: 95000,
      declarado_transferencia: 40000,
    });
    const c = await servicio.cierre(ADMIN, 7);
    expect(c.estado).toBe('por_revisar');
    expect(c.cuadre.lineas.map((l) => [l.medio, l.diferencia])).toEqual([
      ['efectivo', 0],
      ['debito', 5000],
      ['credito', -5000],
      ['transferencia', 0],
    ]);
    expect(c.documentos).toHaveLength(6);
  });

  it('corregir el medio de pago de un documento queda anotado con quién', async () => {
    const { servicio, r } = armar();
    await servicio.corregirMedio(ADMIN, 7, 3, { medio: 'debito' });
    expect(r.cambiarMedio).toHaveBeenCalledWith(1, 7, 3, 'debito');
    expect(r.anotarCorreccion).toHaveBeenCalledWith({
      company_id: 1,
      turno_id: 7,
      documento_id: 3,
      medio_antes: 'credito',
      medio_despues: 'debito',
      corregido_por: 'u-camila',
      corregido_por_nombre: 'Camila Carvajal',
    });
    // Un documento de otro turno, no.
    r.cambiarMedio.mockResolvedValueOnce(null);
    await expect(
      servicio.corregirMedio(ADMIN, 7, 99, { medio: 'efectivo' }),
    ).rejects.toThrow('no es de este cierre');
  });

  it('se revisa solo lo cerrado', async () => {
    const { servicio, r } = armar();
    await servicio.revisar(ADMIN, 7, {
      nota: 'Un convenio cargado como crédito',
    });
    expect(r.revisar).toHaveBeenCalledWith(1, 7, {
      revisado_por: 'u-camila',
      revisado_por_nombre: 'Camila Carvajal',
      nota_revision: 'Un convenio cargado como crédito',
    });
    r.revisar.mockResolvedValueOnce(null);
    await expect(servicio.revisar(ADMIN, 7, {})).rejects.toThrow(
      'Solo se revisa una caja cerrada',
    );
  });
});

describe('Lo que emite recepción entra a su caja (§9.43)', () => {
  it('recepción: con la caja abierta, su turno; cerrada, no emite', async () => {
    const r = repo();
    await expect(
      turnoParaEmitir(RECEPCION, r as unknown as CajaRepository),
    ).resolves.toBe(7);
    r.turnoAbierto.mockResolvedValueOnce(null);
    await expect(
      turnoParaEmitir(RECEPCION, r as unknown as CajaRepository),
    ).rejects.toThrow(new ConflictException(CAJA_CERRADA));
  });

  it('los otros cargos emiten sin turno', async () => {
    const r = repo();
    await expect(
      turnoParaEmitir(ADMIN, r as unknown as CajaRepository),
    ).resolves.toBeNull();
    expect(r.turnoAbierto).not.toHaveBeenCalled();
  });
});

describe('El resumen del cierre por correo (§9.43, sprint 3)', () => {
  it('al cerrar, le llega a quien revisa con lo declarado, lo esperado y la diferencia', async () => {
    const { servicio, r, email } = armar();
    await servicio.cerrar(RECEPCION, {
      efectivo: 67500,
      debito: 135000,
      credito: 95000,
      transferencia: 40000,
    });
    expect(r.correosDe).toHaveBeenCalledWith(1, ['administrador']);
    expect(email.sendEmail).toHaveBeenCalledWith(
      ['camila@example.com'],
      'cierreDeCaja',
      expect.objectContaining({
        companyName: 'Valle del Sol Quillón SpA',
        quien: 'Ana',
        vendido: 367500,
        retiros: 50000,
        diferencia: 0,
        lineas: expect.arrayContaining([
          {
            medio: 'debito',
            declarado: 135000,
            esperado: 130000,
            diferencia: 5000,
          },
        ]),
      }),
    );
  });

  it('si el correo falla, la caja queda cerrada igual', async () => {
    const { servicio, email } = armar();
    email.sendEmail.mockRejectedValueOnce(new Error('Resend caído'));
    await expect(
      servicio.cerrar(RECEPCION, {
        efectivo: 0,
        debito: 0,
        credito: 0,
        transferencia: 0,
      }),
    ).resolves.toEqual({ cerrada_en: '2026-11-09T21:05:00Z' });
  });
});

describe('Lo vendido (§9.43, sprint 3)', () => {
  it('lo de «Nuevo DTE» del período por ítem (y lo a mano por lo que dice), sin lo anulado, con su unidad y por persona', async () => {
    const { servicio } = armar();
    const v = await servicio.vendido(ADMIN, {
      desde: '2026-11-01',
      hasta: '2026-11-09',
    });
    expect(v.items).toEqual([
      {
        tarifario_id: 26,
        nombre: 'Ticket diario, temporada media',
        unidad: 'persona',
        cantidad: 4,
        monto: 30000,
      },
      {
        tarifario_id: 22,
        nombre: 'Tinaja con tabla y espumante',
        unidad: 'unidad',
        cantidad: 1,
        monto: 30000,
      },
      {
        tarifario_id: null,
        nombre: 'A mano · test',
        unidad: 'unidad',
        cantidad: 1,
        monto: 100,
      },
    ]);
    expect(v.total).toBe(60100);
    expect(v.personas).toEqual(['Ana', 'Camila Carvajal']);
    const deAna = await servicio.vendido(ADMIN, {
      desde: '2026-11-01',
      hasta: '2026-11-09',
      persona: 'Ana',
    });
    expect(deAna.items.map((i) => i.tarifario_id)).toEqual([26]);
  });

  it('el período: desde antes que hasta, y hasta un año', async () => {
    const { servicio } = armar();
    await expect(
      servicio.vendido(ADMIN, { desde: '2026-11-09', hasta: '2026-11-01' }),
    ).rejects.toThrow('no es válido');
    await expect(
      servicio.vendido(ADMIN, { desde: '2025-01-01', hasta: '2026-11-01' }),
    ).rejects.toThrow('hasta un año');
  });
});
