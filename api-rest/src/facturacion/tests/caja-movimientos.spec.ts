import type { PinoLogger } from 'nestjs-pino';
import type { User } from 'src/users/entities/user.entity';
import type {
  CajaRepository,
  MovimientoDeCaja,
  TurnoDeCaja,
} from '../caja/caja.repository';
import { CajaService } from '../caja/caja.service';
import { cuadrar, type DocumentoDelTurno } from '../caja/cuadre';

// LOS MOVIMIENTOS DEL TURNO (doc 19 §9.51): los ingresos (la plata que
// mandan el dueño o la administradora) y los retiros, en la misma tabla
// (`retiros_de_caja.tipo`, migración 208). Un ingreso no es venta: solo
// suma al efectivo esperado. El cierre sigue ciego.

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

// Efectivo $97.500, débito $130.000, crédito $100.000 y transferencia
// $40.000.
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
  doc({ id: 2, total: 130000, medio_de_pago: 'debito' }),
  doc({ id: 3, total: 100000, medio_de_pago: 'credito' }),
  doc({ id: 4, total: 40000, medio_de_pago: 'transferencia' }),
];

const RETIRO: MovimientoDeCaja = {
  id: 1,
  turno_id: 7,
  tipo: 'retiro',
  monto: 50000,
  motivo: 'Entregado a Felipe',
  creado_por_nombre: null,
  created_at: '2026-11-09T17:30:00Z',
};

const repo = () => ({
  turnoAbierto: jest.fn().mockResolvedValue(TURNO),
  turno: jest.fn().mockResolvedValue(TURNO),
  cerrar: jest.fn(),
  movimientos: jest.fn().mockResolvedValue([RETIRO]),
  agregarMovimiento: jest.fn().mockResolvedValue(undefined),
  documentos: jest
    .fn()
    .mockResolvedValue(DOCUMENTOS.map((d) => ({ ...d, turno_de_caja_id: 7 }))),
  correcciones: jest.fn().mockResolvedValue([]),
  correosDe: jest.fn().mockResolvedValue(['camila@example.com']),
  nombreDeLaEmpresa: jest.fn().mockResolvedValue('Valle del Sol Quillón SpA'),
});

const logger = {
  setContext: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
} as unknown as PinoLogger;

const armar = () => {
  const r = repo();
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

const INGRESO: MovimientoDeCaja = {
  id: 2,
  turno_id: 7,
  tipo: 'ingreso',
  monto: 30000,
  motivo: 'Sencillo que mandó Felipe',
  creado_por_nombre: 'Ana',
  created_at: '2026-11-09T15:10:00Z',
};

describe('Los movimientos del turno: ingresos y retiros (§9.51)', () => {
  it('el efectivo esperado: sencillo + vendido en efectivo + ingresos − retiros', () => {
    const c = cuadrar(TURNO, DOCUMENTOS, [
      { monto: 50000, tipo: 'retiro' },
      { monto: 30000, tipo: 'ingreso' },
    ]);
    const de = (m: string) => c.lineas.find((l) => l.medio === m);
    expect(de('efectivo')?.esperado).toBe(20000 + 97500 + 30000 - 50000);
    expect(c.ingresos).toBe(30000);
    expect(c.retiros).toBe(50000);
  });

  it('un ingreso no es venta: no toca lo vendido, lo vendido por ítem ni los otros medios', () => {
    const sin = cuadrar(TURNO, DOCUMENTOS, []);
    const con = cuadrar(TURNO, DOCUMENTOS, [{ monto: 30000, tipo: 'ingreso' }]);
    expect(con.vendido).toBe(sin.vendido);
    expect(con.vendidoPorItem).toEqual(sin.vendidoPorItem);
    for (const medio of ['debito', 'credito', 'transferencia'])
      expect(con.lineas.find((l) => l.medio === medio)).toEqual(
        sin.lineas.find((l) => l.medio === medio),
      );
    expect(con.lineas[0].vendido).toBe(sin.lineas[0].vendido);
  });

  it('una fila sin tipo (de antes de la 208) cuenta como retiro', () => {
    const c = cuadrar(TURNO, DOCUMENTOS, [{ monto: 50000 }]);
    expect(c.retiros).toBe(50000);
    expect(c.ingresos).toBe(0);
    expect(c.lineas[0].esperado).toBe(20000 + 97500 - 50000);
  });

  it('se anota un ingreso al turno abierto, con quién (el perfil) y su motivo', async () => {
    const { servicio, r } = armar();
    await servicio.ingreso(RECEPCION, {
      monto: 30000,
      motivo: '  Sencillo que mandó Felipe ',
    });
    expect(r.agregarMovimiento).toHaveBeenCalledWith({
      company_id: 1,
      turno_id: 7,
      tipo: 'ingreso',
      monto: 30000,
      motivo: 'Sencillo que mandó Felipe',
      creado_por: 'u-recepcion',
      creado_por_nombre: 'Recepción',
    });
  });

  it('el retiro también guarda quién lo anotó', async () => {
    const { servicio, r } = armar();
    await servicio.retiro(RECEPCION, { monto: 5000, motivo: 'Gas' });
    expect(r.agregarMovimiento).toHaveBeenCalledWith(
      expect.objectContaining({
        tipo: 'retiro',
        monto: 5000,
        creado_por_nombre: 'Recepción',
      }),
    );
  });

  it('sin caja abierta no se anota; sin motivo, tampoco', async () => {
    const { servicio, r } = armar();
    r.turnoAbierto.mockResolvedValueOnce(null);
    await expect(
      servicio.ingreso(RECEPCION, { monto: 1000, motivo: 'x' }),
    ).rejects.toThrow('no está abierta');
    await expect(
      servicio.ingreso(RECEPCION, { monto: 1000, motivo: '   ' }),
    ).rejects.toThrow('Falta el motivo del ingreso');
    expect(r.agregarMovimiento).not.toHaveBeenCalled();
  });

  it('quien opera la caja ve sus movimientos por hora, nunca lo esperado (ciego); `retiros` sigue con solo los retiros', async () => {
    const { servicio, r } = armar();
    r.movimientos.mockResolvedValueOnce([
      INGRESO,
      {
        id: 1,
        turno_id: 7,
        tipo: 'retiro',
        monto: 50000,
        motivo: 'Entregado a Felipe',
        creado_por_nombre: null,
        created_at: '2026-11-09T17:30:00Z',
      },
    ]);
    const e = await servicio.estado(RECEPCION);
    expect(e.abierta?.movimientos.map((m) => [m.tipo, m.monto])).toEqual([
      ['ingreso', 30000],
      ['retiro', 50000],
    ]);
    expect(e.abierta?.retiros).toEqual([
      expect.objectContaining({ monto: 50000, motivo: 'Entregado a Felipe' }),
    ]);
    expect(JSON.stringify(e)).not.toMatch(/esperado|vendido|diferencia/);
  });

  it('la revisión y el correo traen los ingresos y los retiros por separado', async () => {
    const { servicio, r, email } = armar();
    r.movimientos.mockResolvedValue([
      INGRESO,
      {
        id: 1,
        turno_id: 7,
        tipo: 'retiro',
        monto: 50000,
        motivo: 'Entregado a Felipe',
        creado_por_nombre: null,
        created_at: '2026-11-09T17:30:00Z',
      },
    ]);
    const cerrado = {
      ...TURNO,
      cerrada_en: '2026-11-09T21:05:00Z',
      cerrada_por_nombre: 'Ana',
      declarado_efectivo: 97500,
      declarado_debito: 130000,
      declarado_credito: 100000,
      declarado_transferencia: 40000,
    };
    r.turno.mockResolvedValue(cerrado);
    const c = await servicio.cierre(ADMIN, 7);
    expect(c.cuadre.ingresos).toBe(30000);
    expect(c.cuadre.retiros).toBe(50000);
    expect(c.cuadre.lineas[0].diferencia).toBe(0);
    expect(c.movimientos[0]).toMatchObject({
      tipo: 'ingreso',
      creado_por_nombre: 'Ana',
    });
    expect(c.retiros).toHaveLength(1);

    r.cerrar.mockResolvedValue(cerrado);
    await servicio.cerrar(RECEPCION, {
      efectivo: 97500,
      debito: 130000,
      credito: 100000,
      transferencia: 40000,
    });
    expect(email.sendEmail).toHaveBeenCalledWith(
      ['camila@example.com'],
      'cierreDeCaja',
      expect.objectContaining({
        ingresos: 30000,
        retiros: 50000,
        diferencia: 0,
      }),
    );
  });
});
