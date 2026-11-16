import type { PinoLogger } from 'nestjs-pino';
import 'reflect-metadata';
import { DENTRO_DE_KEY, PERMISO_KEY } from 'src/auth/permiso.decorator';
import { pasa, permisosDelCargo, type Permiso } from 'src/auth/permisos';
import { ROLES_KEY } from 'src/auth/roles.decorator';
import { UserRole, type User } from 'src/users/entities/user.entity';
import { CajaController } from '../caja/caja.controller';
import type { CajaRepository, TurnoDeCaja } from '../caja/caja.repository';
import { CajaService } from '../caja/caja.service';

// LA CAJA ABIERTA EN SU PANEL (doc 19 §9.55). Felipe, 16-11: *"solo el
// administrador o operaciones, cuando ve la caja, pudiese ingresar
// movimiento o retiro"*; y quien revisa ve lo que debería haber al lado de
// donde se escribe. Recepción sigue cerrando a ciegas.

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

const ABIERTA: TurnoDeCaja = {
  id: 7,
  company_id: 1,
  caja: 'recepcion',
  abierta_por: 'u-recepcion',
  abierta_por_nombre: 'Ana',
  abierta_en: '2026-11-16T22:56:00Z',
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

const logger = {
  setContext: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
} as unknown as PinoLogger;

const armar = () => {
  const r = {
    turnoAbierto: jest.fn().mockResolvedValue(ABIERTA),
    movimientos: jest.fn().mockResolvedValue([
      {
        id: 1,
        turno_id: 7,
        tipo: 'ingreso',
        monto: 10000,
        motivo: 'Sencillo que mandó Felipe',
        creado_por_nombre: 'Camila',
        created_at: '2026-11-16T23:00:00Z',
      },
      {
        id: 2,
        turno_id: 7,
        tipo: 'retiro',
        monto: 3000,
        motivo: 'Gas',
        creado_por_nombre: 'Camila',
        created_at: '2026-11-16T23:10:00Z',
      },
    ]),
    documentos: jest.fn().mockResolvedValue([
      {
        id: 1,
        tipo: 39,
        folio: 1,
        estado: 'emitido',
        total: 15000,
        medio_de_pago: 'efectivo',
        emitido_en: '2026-11-16T23:05:00Z',
        detalle: [],
        turno_de_caja_id: 7,
      },
      {
        id: 2,
        tipo: 39,
        folio: 2,
        estado: 'emitido',
        total: 8000,
        medio_de_pago: 'debito',
        emitido_en: '2026-11-16T23:06:00Z',
        detalle: [],
        turno_de_caja_id: 7,
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

describe('Lo que debería haber en la caja abierta (§9.55)', () => {
  it('por medio de pago; el efectivo: sencillo + vendido en efectivo + ingresos − retiros', async () => {
    const { servicio } = armar();
    const e = await servicio.esperado(ADMIN);
    expect(e.abierta).toEqual({
      id: 7,
      sencillo_inicial: 26850,
      ingresos: 10000,
      retiros: 3000,
      lineas: [
        {
          medio: 'efectivo',
          vendido: 15000,
          esperado: 26850 + 15000 + 10000 - 3000,
        },
        { medio: 'debito', vendido: 8000, esperado: 8000 },
        { medio: 'credito', vendido: 0, esperado: 0 },
        { medio: 'transferencia', vendido: 0, esperado: 0 },
      ],
    });
  });

  it('sin caja abierta, nada', async () => {
    const { servicio, r } = armar();
    r.turnoAbierto.mockResolvedValueOnce(null);
    expect(await servicio.esperado(ADMIN)).toEqual({ abierta: null });
  });

  it('recepción no lo recibe: el estado de la caja abierta no trae lo esperado ni lo vendido', async () => {
    const { servicio } = armar();
    const e = await servicio.estado(RECEPCION);
    expect(e.abierta?.movimientos).toHaveLength(2);
    expect(JSON.stringify(e)).not.toMatch(/esperado|vendido|diferencia/);
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
const entra = (cargo: UserRole, metodo: keyof CajaController) =>
  pasa(cargo, permisosDelCargo(cargo), marcas(metodo));

describe('Quién pasa por cada puerta de la caja, de fábrica (§9.55)', () => {
  it('lo esperado: solo quien revisa los cierres (el administrador); recepción no', () => {
    expect(marcas('esperado').permiso).toEqual(['caja_revision']);
    expect(entra(UserRole.RECEPCION, 'esperado')).toBe(false);
    expect(entra(UserRole.OPERACIONES, 'esperado')).toBe(false);
    expect(entra(UserRole.VENDEDOR, 'esperado')).toBe(false);
    expect(entra(UserRole.ADMINISTRADOR, 'esperado')).toBe(true);
  });

  it('recepción, aunque le prendan «Anotar movimientos», no ve lo esperado sin «Revisar cierres»', () => {
    expect(
      pasa(
        UserRole.RECEPCION,
        [...permisosDelCargo(UserRole.RECEPCION), 'caja_movimientos'],
        marcas('esperado'),
      ),
    ).toBe(false);
  });

  it('anotar ingresos y retiros: operaciones y el administrador; recepción ya no', () => {
    for (const metodo of ['ingreso', 'retiro'] as const) {
      expect(marcas(metodo).permiso).toEqual(['caja_movimientos']);
      expect(entra(UserRole.RECEPCION, metodo)).toBe(false);
      expect(entra(UserRole.VENDEDOR, metodo)).toBe(false);
      expect(entra(UserRole.OPERACIONES, metodo)).toBe(true);
      expect(entra(UserRole.ADMINISTRADOR, metodo)).toBe(true);
    }
  });

  it('el estado (ciego): quien opera la caja y quien anota movimientos', () => {
    expect(entra(UserRole.RECEPCION, 'estado')).toBe(true);
    expect(entra(UserRole.OPERACIONES, 'estado')).toBe(true);
    expect(entra(UserRole.ADMINISTRADOR, 'estado')).toBe(true);
    expect(entra(UserRole.VENDEDOR, 'estado')).toBe(false);
  });

  it('abrir y cerrar no cambian: recepción y el administrador', () => {
    for (const metodo of ['abrir', 'cerrar'] as const) {
      expect(entra(UserRole.RECEPCION, metodo)).toBe(true);
      expect(entra(UserRole.OPERACIONES, metodo)).toBe(false);
      expect(entra(UserRole.ADMINISTRADOR, metodo)).toBe(true);
    }
  });
});
