import type { PinoLogger } from 'nestjs-pino';
import 'reflect-metadata';
import { PERMISO_KEY } from 'src/auth/permiso.decorator';
import { pasa, permisosDelCargo, type Permiso } from 'src/auth/permisos';
import { ROLES_KEY } from 'src/auth/roles.decorator';
import { UserRole, type User } from 'src/users/entities/user.entity';
import { gastosDelResumen } from '../caja/cadena';
import { CajaController } from '../caja/caja.controller';
import type {
  CajaRepository,
  MovimientoDeCaja,
  TurnoDeCaja,
} from '../caja/caja.repository';
import { CajaService } from '../caja/caja.service';

// «GASTOS DE 7 DÍAS» (doc 19 §9.57). Felipe, 19-11, con la maqueta: *"sí me
// tinca, hagámoslo"*. La cuarta cifra de la cadena del efectivo: la suma de
// los gastos de caja de los turnos abiertos en los últimos 7 días corridos
// (la misma ventana de las otras tres, con el turno abierto), y su lista.

const ADMIN = {
  id: 'u-camila',
  company_id: 1,
  role: 'administrador',
  full_name: 'Camila Carvajal',
} as unknown as User;

const AHORA = new Date('2026-11-19T15:00:00Z');
// La ventana: desde el 12-11 a las 15:00 (UTC).

const turno = (t: Partial<TurnoDeCaja>): TurnoDeCaja => ({
  id: 1,
  company_id: 1,
  caja: 'recepcion',
  abierta_por: 'u-recepcion',
  abierta_por_nombre: 'Ana',
  abierta_en: '2026-11-18T12:00:00Z',
  sencillo_inicial: 20000,
  cerrada_por: 'u-recepcion',
  cerrada_por_nombre: 'Ana',
  cerrada_en: '2026-11-18T22:00:00Z',
  declarado_efectivo: 20000,
  declarado_debito: 0,
  declarado_credito: 0,
  declarado_transferencia: 0,
  comentario: null,
  revisado_por: null,
  revisado_por_nombre: null,
  revisado_en: null,
  nota_revision: null,
  ...t,
});

// El turno abierto de hoy, uno cerrado de ayer y uno de hace 8 días (fuera).
const ABIERTO = turno({
  id: 30,
  abierta_en: '2026-11-19T12:00:00Z',
  cerrada_por: null,
  cerrada_por_nombre: null,
  cerrada_en: null,
  declarado_efectivo: null,
  declarado_debito: null,
  declarado_credito: null,
  declarado_transferencia: null,
});
const AYER = turno({ id: 29 });
const VIEJO = turno({
  id: 20,
  abierta_en: '2026-11-11T12:00:00Z',
  cerrada_en: '2026-11-11T22:00:00Z',
});

const mov = (m: Partial<MovimientoDeCaja>): MovimientoDeCaja => ({
  id: 1,
  turno_id: 29,
  tipo: 'gasto',
  monto: 1000,
  motivo: 'Taxi al banco',
  creado_por_nombre: 'Ana',
  created_at: '2026-11-18T15:00:00Z',
  ...m,
});

const MOVIMIENTOS: MovimientoDeCaja[] = [
  mov({ id: 1, turno_id: 29, monto: 8000, motivo: 'Taxi al banco' }),
  mov({
    id: 2,
    turno_id: 30,
    monto: 3500,
    motivo: 'Pan para el desayuno',
    creado_por_nombre: 'Rosa',
    created_at: '2026-11-19T13:10:00Z',
  }),
  // Retiros e ingresos no son gastos.
  mov({ id: 3, turno_id: 29, tipo: 'retiro', monto: 50000 }),
  mov({ id: 4, turno_id: 30, tipo: 'ingreso', monto: 30000 }),
  // Un gasto de un turno de hace 8 días: fuera de la ventana.
  mov({
    id: 5,
    turno_id: 20,
    monto: 99000,
    created_at: '2026-11-11T15:00:00Z',
  }),
];

describe('La suma de los gastos de 7 días (§9.57)', () => {
  it('suma solo los gastos de los turnos de la ventana, también el abierto, del más nuevo al más viejo', () => {
    const r = gastosDelResumen([ABIERTO, AYER, VIEJO], MOVIMIENTOS, AHORA);
    expect(r.gastos).toBe(11500);
    expect(r.lista_de_gastos).toEqual([
      {
        id: 2,
        turno_id: 30,
        monto: 3500,
        motivo: 'Pan para el desayuno',
        creado_por_nombre: 'Rosa',
        creado_en: '2026-11-19T13:10:00Z',
      },
      {
        id: 1,
        turno_id: 29,
        monto: 8000,
        motivo: 'Taxi al banco',
        creado_por_nombre: 'Ana',
        creado_en: '2026-11-18T15:00:00Z',
      },
    ]);
  });

  it('no cuenta retiros ni ingresos', () => {
    const r = gastosDelResumen(
      [AYER],
      [
        mov({ id: 3, tipo: 'retiro', monto: 50000 }),
        mov({ id: 4, tipo: 'ingreso', monto: 30000 }),
      ],
      AHORA,
    );
    expect(r).toEqual({ gastos: 0, lista_de_gastos: [] });
  });

  it('la ventana es la de las otras cifras: el turno abierto justo en el borde entra, uno antes no', () => {
    const borde = turno({ id: 40, abierta_en: '2026-11-12T15:00:00.000Z' });
    const antes = turno({ id: 41, abierta_en: '2026-11-12T14:59:59.000Z' });
    const r = gastosDelResumen(
      [borde, antes],
      [
        mov({ id: 6, turno_id: 40, monto: 700 }),
        mov({ id: 7, turno_id: 41, monto: 900 }),
      ],
      AHORA,
    );
    expect(r.gastos).toBe(700);
  });

  it('un gasto de un turno que no se conoce (de otra empresa o fuera de la lista) no cuenta', () => {
    const r = gastosDelResumen(
      [AYER],
      [mov({ id: 8, turno_id: 999, monto: 5000 })],
      AHORA,
    );
    expect(r.gastos).toBe(0);
  });
});

const logger = {
  setContext: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
} as unknown as PinoLogger;

const armar = (turnos: TurnoDeCaja[], movimientos: MovimientoDeCaja[]) => {
  const r = {
    turnos: jest.fn().mockResolvedValue(turnos),
    turnosDesde: jest.fn().mockResolvedValue([]),
    turnoAnterior: jest.fn().mockResolvedValue(null),
    turnoAbierto: jest.fn().mockResolvedValue(ABIERTO),
    movimientos: jest.fn().mockResolvedValue(movimientos),
    documentos: jest.fn().mockResolvedValue([]),
  };
  return {
    r,
    servicio: new CajaService(
      r as unknown as CajaRepository,
      logger,
      { delCargo: jest.fn() } as never,
      { sendEmail: jest.fn() } as never,
    ),
  };
};

describe('El resumen de los cierres trae los gastos (§9.57)', () => {
  beforeEach(() => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
    jest.setSystemTime(AHORA);
  });
  afterEach(() => jest.useRealTimers());

  it('la cuarta cifra y su lista, con las tres de siempre y sin consultas de más', async () => {
    const { servicio, r } = armar([ABIERTO, AYER, VIEJO], MOVIMIENTOS);
    const resumen = await servicio.resumenDeCierres(ADMIN);
    expect(resumen).toMatchObject({
      desde: '2026-11-12T15:00:00.000Z',
      gastos: 11500,
      por_revisar: 1,
    });
    expect(resumen.lista_de_gastos.map((g) => g.id)).toEqual([2, 1]);
    // Los movimientos, en una sola consulta y de la empresa de la sesión.
    expect(r.movimientos).toHaveBeenCalledTimes(1);
    expect(r.movimientos).toHaveBeenCalledWith(1, expect.any(Array));
    expect(r.turnos).toHaveBeenCalledWith(1, 61);
  });

  it('con más de 60 turnos en la semana, cuenta los gastos de la semana entera', async () => {
    const semana = Array.from({ length: 70 }, (_, i) =>
      turno({
        id: 1000 - i,
        abierta_en: new Date(
          AHORA.getTime() - (i + 1) * 2 * 36e5,
        ).toISOString(),
        cerrada_en: new Date(
          AHORA.getTime() - (i + 1) * 2 * 36e5 + 36e5,
        ).toISOString(),
      }),
    );
    const gastos = semana.map((t, i) =>
      mov({ id: i + 1, turno_id: t.id, monto: 100, created_at: t.abierta_en }),
    );
    const { servicio, r } = armar(semana.slice(0, 61), gastos);
    r.turnosDesde.mockResolvedValue(semana);
    const resumen = await servicio.resumenDeCierres(ADMIN);
    expect(resumen.gastos).toBe(100 * 70);
    expect(resumen.lista_de_gastos).toHaveLength(70);
  });

  it('el estado de la caja que lee recepción no trae la cifra ni la lista', async () => {
    const { servicio } = armar([ABIERTO], MOVIMIENTOS);
    const e = await servicio.estado({
      ...ADMIN,
      role: 'recepcion',
    } as unknown as User);
    expect(JSON.stringify(e)).not.toMatch(/lista_de_gastos|"gastos"/);
  });
});

describe('Quién ve los gastos de 7 días (§9.57)', () => {
  it('la misma puerta y el mismo permiso que las otras tres cifras: recepción no', () => {
    const h = CajaController.prototype.resumenDeCierres as unknown as object;
    const marcas = {
      roles: Reflect.getMetadata(ROLES_KEY, h) as string[] | undefined,
      permiso: Reflect.getMetadata(PERMISO_KEY, h) as Permiso[] | undefined,
    };
    expect(marcas.permiso).toEqual(['caja_revision']);
    const entra = (cargo: UserRole) =>
      pasa(cargo, permisosDelCargo(cargo), marcas);
    expect(entra(UserRole.RECEPCION)).toBe(false);
    expect(entra(UserRole.VENDEDOR)).toBe(false);
    expect(entra(UserRole.OPERACIONES)).toBe(false);
    expect(entra(UserRole.ADMINISTRADOR)).toBe(true);
  });
});
