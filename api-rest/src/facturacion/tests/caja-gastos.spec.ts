import type { PinoLogger } from 'nestjs-pino';
import 'reflect-metadata';
import { DENTRO_DE_KEY, PERMISO_KEY } from 'src/auth/permiso.decorator';
import { pasa, permisosDelCargo, type Permiso } from 'src/auth/permisos';
import { ROLES_KEY } from 'src/auth/roles.decorator';
import { cierreDeCajaTemplate } from 'src/email/templates/cierreDeCaja';
import { UserRole, type User } from 'src/users/entities/user.entity';
import { CajaController } from '../caja/caja.controller';
import type { CajaRepository, TurnoDeCaja } from '../caja/caja.repository';
import { CajaService } from '../caja/caja.service';
import { cuadrar, type DocumentoDelTurno } from '../caja/cuadre';

// LOS GASTOS DE LA CAJA (doc 19 §9.56). Felipe, 17-11: *"en movimientos de
// turno, anotar movimiento debería poder ingresarse algún gasto … ejemplo
// pago taxi … los ingresos y retiros son solo de operaciones y
// administración y los gastos de recepción"*. Un gasto resta del efectivo
// esperado como un retiro, pero se cuenta aparte.

const RECEPCION = {
  id: 'u-recepcion',
  company_id: 1,
  role: 'recepcion',
  full_name: 'Ana',
} as unknown as User;

const TURNO: TurnoDeCaja = {
  id: 7,
  company_id: 1,
  caja: 'recepcion',
  abierta_por: 'u-recepcion',
  abierta_por_nombre: 'Ana',
  abierta_en: '2026-11-17T12:00:00Z',
  sencillo_inicial: 26850,
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

const VENTA: DocumentoDelTurno = {
  id: 1,
  tipo: 39,
  folio: 1,
  estado: 'emitido',
  total: 15000,
  medio_de_pago: 'efectivo',
  emitido_en: '2026-11-17T13:00:00Z',
  detalle: [],
};

describe('El gasto en el cuadre (§9.56)', () => {
  it('resta del efectivo esperado como un retiro, pero se cuenta aparte', () => {
    const c = cuadrar(
      TURNO,
      [VENTA],
      [
        { monto: 10000, tipo: 'ingreso' },
        { monto: 3000, tipo: 'retiro' },
        { monto: 4500, tipo: 'gasto' },
      ],
    );
    expect(c.lineas[0].esperado).toBe(26850 + 15000 + 10000 - 3000 - 4500);
    expect(c.ingresos).toBe(10000);
    expect(c.retiros).toBe(3000);
    expect(c.gastos).toBe(4500);
    // No es venta.
    expect(c.vendido).toBe(15000);
  });

  it('sin tipo sigue siendo retiro, no gasto', () => {
    const c = cuadrar(TURNO, [], [{ monto: 500 }]);
    expect(c.retiros).toBe(500);
    expect(c.gastos).toBe(0);
  });
});

const logger = {
  setContext: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
} as unknown as PinoLogger;

const armar = () => {
  const r = {
    turnoAbierto: jest.fn().mockResolvedValue(TURNO),
    agregarMovimiento: jest.fn().mockResolvedValue(undefined),
    movimientos: jest.fn().mockResolvedValue([
      {
        id: 3,
        turno_id: 7,
        tipo: 'gasto',
        monto: 4500,
        motivo: 'Taxi al banco',
        creado_por_nombre: 'Ana',
        created_at: '2026-11-17T14:00:00Z',
      },
    ]),
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

describe('Anotar un gasto (§9.56)', () => {
  it('se guarda como gasto, con quién y en qué se gastó', async () => {
    const { servicio, r } = armar();
    await servicio.gasto(RECEPCION, { monto: 4500, motivo: ' Taxi al banco ' });
    expect(r.agregarMovimiento).toHaveBeenCalledWith({
      company_id: 1,
      turno_id: 7,
      tipo: 'gasto',
      monto: 4500,
      motivo: 'Taxi al banco',
      creado_por: 'u-recepcion',
      creado_por_nombre: 'Ana',
    });
  });

  it('sin en qué se gastó, no; sin caja abierta, tampoco', async () => {
    const { servicio, r } = armar();
    await expect(
      servicio.gasto(RECEPCION, { monto: 1000, motivo: '  ' }),
    ).rejects.toThrow('Falta el motivo del gasto');
    r.turnoAbierto.mockResolvedValueOnce(null);
    await expect(
      servicio.gasto(RECEPCION, { monto: 1000, motivo: 'Taxi' }),
    ).rejects.toThrow('no está abierta');
    expect(r.agregarMovimiento).not.toHaveBeenCalled();
  });

  it('recepción ve su gasto en los movimientos, pero nada de lo esperado; `retiros` no lo trae', async () => {
    const { servicio } = armar();
    const e = await servicio.estado(RECEPCION);
    expect(e.abierta?.movimientos).toEqual([
      expect.objectContaining({ tipo: 'gasto', motivo: 'Taxi al banco' }),
    ]);
    expect(e.abierta?.retiros).toEqual([]);
    expect(JSON.stringify(e)).not.toMatch(/esperado|vendido|diferencia/);
  });

  it('el correo del cierre dice cuánto se gastó', () => {
    const html = cierreDeCajaTemplate({
      quien: 'Ana',
      abierta: '2026-11-17T12:00:00Z',
      cerrada: '2026-11-17T23:00:00Z',
      lineas: [],
      vendido: 0,
      retiros: 0,
      gastos: 4500,
      diferencia: 0,
    });
    expect(html).toContain('Gastos: $4.500');
  });
});

// Las marcas de cada puerta, como las lee RolesGuard.
const marcas = (metodo: keyof CajaController) => {
  const h = CajaController.prototype[metodo] as unknown as object;
  return {
    roles: Reflect.getMetadata(ROLES_KEY, h) as string[] | undefined,
    permiso: Reflect.getMetadata(PERMISO_KEY, h) as Permiso[] | undefined,
    dentroDe: Reflect.getMetadata(DENTRO_DE_KEY, h) as Permiso[] | undefined,
  };
};
const entra = (
  cargo: UserRole,
  metodo: keyof CajaController,
  prendidos = permisosDelCargo(cargo),
) => pasa(cargo, prendidos, marcas(metodo));

describe('Quién anota qué, de fábrica (§9.56)', () => {
  it('gastos: recepción, operaciones y el administrador; el vendedor no', () => {
    expect(marcas('gasto').permiso).toEqual(['caja_gastos']);
    expect(entra(UserRole.RECEPCION, 'gasto')).toBe(true);
    expect(entra(UserRole.OPERACIONES, 'gasto')).toBe(true);
    expect(entra(UserRole.ADMINISTRADOR, 'gasto')).toBe(true);
    expect(entra(UserRole.VENDEDOR, 'gasto')).toBe(false);
  });

  it('el motor exige el permiso de cada tipo: recepción anota gastos, no ingresos ni retiros', () => {
    expect(entra(UserRole.RECEPCION, 'ingreso')).toBe(false);
    expect(entra(UserRole.RECEPCION, 'retiro')).toBe(false);
  });

  it('con el interruptor de gastos apagado, recepción ya no anota gastos', () => {
    const sinGastos = permisosDelCargo(UserRole.RECEPCION, [
      { cargo: 'recepcion', permiso: 'caja_gastos', prendido: false },
    ]);
    expect(entra(UserRole.RECEPCION, 'gasto', sinGastos)).toBe(false);
  });

  it('quien solo anota gastos ve la caja abierta (ciega), pero no lo esperado', () => {
    const soloGastos: Permiso[] = ['caja_gastos'];
    expect(entra(UserRole.VENDEDOR, 'estado', soloGastos)).toBe(true);
    expect(entra(UserRole.VENDEDOR, 'esperado', soloGastos)).toBe(false);
  });
});
