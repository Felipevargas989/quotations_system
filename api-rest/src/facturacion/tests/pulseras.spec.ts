import type { PinoLogger } from 'nestjs-pino';
import {
  cierreDeCajaTemplate,
  type CierreDeCajaParams,
} from 'src/email/templates/cierreDeCaja';
import type { User } from 'src/users/entities/user.entity';
import type { CajaRepository, TurnoDeCaja } from '../caja/caja.repository';
import { CajaService } from '../caja/caja.service';
import {
  contarPulseras,
  descuentaDeRecepcion,
  pulserasDe,
  type EntregaDePulseras,
  type TurnoConPulseras,
  type VentaConPulseras,
} from '../pulseras/cuenta';
import type { PulserasRepository } from '../pulseras/pulseras.repository';
import { PulserasService } from '../pulseras/pulseras.service';

// LAS PULSERAS DE RECEPCIÓN (doc 19 §9.49): entregadas − vendidas =
// deberían quedar, contra lo que recepción cuenta a ciegas al cerrar.

const RECEPCION = {
  id: 'u-recepcion',
  company_id: 1,
  role: 'recepcion',
  full_name: 'Ana',
} as unknown as User;
const OPERACIONES = {
  id: 'u-ops',
  company_id: 1,
  role: 'operaciones',
  full_name: 'Pedro Operaciones',
} as unknown as User;

const entrega = (
  id: number,
  cantidad: number,
  created_at: string,
): EntregaDePulseras => ({
  id,
  cantidad,
  created_at,
  entregada_por_nombre: 'Pedro',
});
const turno = (t: Partial<TurnoConPulseras>): TurnoConPulseras => ({
  id: 1,
  abierta_en: '2026-11-17T12:00:00Z',
  cerrada_en: null,
  abierta_por_nombre: 'Ana',
  cerrada_por_nombre: null,
  pulseras_contadas: null,
  ...t,
});
const venta = (v: Partial<VentaConPulseras>): VentaConPulseras => ({
  origen: 'solicitud',
  turno_de_caja_id: 1,
  created_at: '2026-11-17T15:00:00Z',
  pulseras: 1,
  ...v,
});

describe('Las pulseras de cada línea (§9.49)', () => {
  it('una unidad de un ítem con «Usa pulsera» es una pulsera; lo demás no cuenta', () => {
    const con = new Set([26]);
    expect(
      pulserasDe(
        [
          { cantidad: 4, tarifario_id: 26 },
          { cantidad: 1, tarifario_id: 22 },
          { cantidad: 2 },
          { cantidad: 3, tarifario_id: 26 },
        ],
        con,
      ),
    ).toBe(7);
    expect(pulserasDe(null, con)).toBe(0);
  });

  it('la solicitud y lo emitido directo descuentan del stock (Felipe, 16-11)', () => {
    expect(descuentaDeRecepcion({ origen: 'solicitud' })).toBe(true);
    expect(descuentaDeRecepcion({ origen: 'directa' })).toBe(true);
  });
});

describe('La cuenta de las pulseras (§9.49)', () => {
  it('sin entregas, todo en cero y sin conteo', () => {
    const c = contarPulseras([], [turno({})], [venta({ pulseras: 5 })]);
    expect(c).toMatchObject({
      entregadas: 0,
      vendidas: 0,
      deberian_quedar: 0,
      contadas: null,
      diferencia: null,
      turnos: [],
    });
  });

  it('entregadas − vendidas = deberían quedar; antes del primer conteo, contadas va nulo', () => {
    const c = contarPulseras(
      [entrega(1, 100, '2026-11-17T11:00:00Z')],
      [turno({})],
      [venta({ pulseras: 4 }), venta({ pulseras: 2 })],
    );
    expect(c.entregadas).toBe(100);
    expect(c.vendidas).toBe(6);
    expect(c.deberian_quedar).toBe(94);
    expect(c.contadas).toBeNull();
    expect(c.diferencia).toBeNull();
    expect(c.turnos[0]).toMatchObject({ vendidas: 6, deberian: null });
  });

  it('cada cierre parte de lo contado en el anterior; la diferencia de arriba es la suma', () => {
    const c = contarPulseras(
      [
        entrega(1, 100, '2026-11-17T11:00:00Z'),
        entrega(2, 50, '2026-11-18T11:00:00Z'),
      ],
      [
        turno({
          id: 1,
          cerrada_en: '2026-11-17T23:00:00Z',
          pulseras_contadas: 88,
        }),
        turno({
          id: 2,
          abierta_en: '2026-11-18T12:00:00Z',
          cerrada_en: '2026-11-18T23:00:00Z',
          pulseras_contadas: 120,
        }),
      ],
      [
        venta({ turno_de_caja_id: 1, pulseras: 10 }),
        venta({
          turno_de_caja_id: 2,
          created_at: '2026-11-18T15:00:00Z',
          pulseras: 17,
        }),
      ],
    );
    // Turno 1: 0 + 100 − 10 = 90, contó 88: faltan 2.
    // Turno 2: 88 + 50 − 17 = 121, contó 120: falta 1.
    const [t2, t1] = c.turnos;
    expect(t1).toMatchObject({ entregadas: 100, deberian: 90, diferencia: -2 });
    expect(t2).toMatchObject({ entregadas: 50, deberian: 121, diferencia: -1 });
    expect(c).toMatchObject({
      entregadas: 150,
      vendidas: 27,
      deberian_quedar: 123,
      contadas: 120,
      contadas_en: '2026-11-18T23:00:00Z',
      diferencia: -3,
    });
  });

  it('la rechazada cuenta (viene como una venta más); un cierre sin conteo no es cero: pasa al siguiente', () => {
    const c = contarPulseras(
      [entrega(1, 20, '2026-11-17T11:00:00Z')],
      [
        turno({ id: 1, cerrada_en: '2026-11-17T23:00:00Z' }),
        turno({
          id: 2,
          abierta_en: '2026-11-18T12:00:00Z',
          cerrada_en: '2026-11-18T23:00:00Z',
          pulseras_contadas: 15,
        }),
      ],
      [
        venta({ turno_de_caja_id: 1, pulseras: 3 }),
        venta({
          turno_de_caja_id: 2,
          created_at: '2026-11-18T15:00:00Z',
          pulseras: 2,
        }),
      ],
    );
    const [t2, t1] = c.turnos;
    expect(t1).toMatchObject({ contadas: null, deberian: null });
    expect(t2).toMatchObject({ deberian: 15, diferencia: 0 });
    expect(c.diferencia).toBe(0);
  });

  it('el control parte con la primera entrega: los cierres y ventas de antes no cuentan', () => {
    const c = contarPulseras(
      [entrega(1, 30, '2026-11-17T11:00:00Z')],
      [
        // Un cierre de antes del cambio (contadas nulo) y otro de antes de
        // la primera entrega.
        turno({
          id: 1,
          abierta_en: '2026-11-15T12:00:00Z',
          cerrada_en: '2026-11-15T23:00:00Z',
        }),
        turno({ id: 2 }),
      ],
      [
        venta({
          turno_de_caja_id: 1,
          created_at: '2026-11-15T15:00:00Z',
          pulseras: 9,
        }),
        venta({ turno_de_caja_id: 2, pulseras: 1 }),
      ],
    );
    expect(c.vendidas).toBe(1);
    expect(c.turnos.map((t) => t.id)).toEqual([2]);
  });

  it('lo emitido directo descuenta y entra al turno que cierra después de su emisión; las diferencias siguen sumando', () => {
    const c = contarPulseras(
      [entrega(1, 50, '2026-11-17T11:00:00Z')],
      [
        turno({
          id: 1,
          cerrada_en: '2026-11-17T23:00:00Z',
          pulseras_contadas: 40,
        }),
        turno({
          id: 2,
          abierta_en: '2026-11-18T12:00:00Z',
          cerrada_en: '2026-11-18T23:00:00Z',
          pulseras_contadas: 33,
        }),
      ],
      [
        venta({ turno_de_caja_id: 1, pulseras: 2 }),
        // Emitida entre los dos turnos (de noche): va al turno 2.
        venta({
          origen: 'directa',
          turno_de_caja_id: null,
          created_at: '2026-11-18T02:00:00Z',
          pulseras: 6,
        }),
      ],
    );
    expect(c.vendidas).toBe(8);
    expect(c.deberian_quedar).toBe(42);
    const [t2, t1] = c.turnos;
    // Turno 1: 50 − 2 = 48, contó 40: faltan 8. Turno 2: 40 − 6 = 34,
    // contó 33: falta 1. Arriba: 33 − 42 = −9 = −8 − 1.
    expect(t1).toMatchObject({ vendidas: 2, deberian: 48, diferencia: -8 });
    expect(t2).toMatchObject({ vendidas: 6, deberian: 34, diferencia: -1 });
    expect(c.diferencia).toBe(-9);
    expect(c.ventas_directas).toEqual([
      { created_at: '2026-11-18T02:00:00Z', pulseras: 6 },
    ]);
  });
});

const pulserasRepo = (o: Partial<Record<string, unknown>> = {}) => ({
  conPulsera: jest.fn().mockResolvedValue(new Set([26])),
  entregas: jest
    .fn()
    .mockResolvedValue([entrega(1, 100, '2026-11-17T11:00:00Z')]),
  hayEntregas: jest.fn().mockResolvedValue(true),
  entregar: jest.fn().mockResolvedValue(undefined),
  turnosDesde: jest.fn().mockResolvedValue([
    turno({
      id: 7,
      cerrada_en: '2026-11-17T23:00:00Z',
      pulseras_contadas: 92,
    }),
  ]),
  // El repositorio no filtra por estado: toda solicitud cuenta.
  solicitudesDesde: jest.fn().mockResolvedValue([
    // Rechazada (sin documento): cuenta.
    {
      turno_de_caja_id: 7,
      created_at: '2026-11-17T15:00:00Z',
      documento_id: null,
      detalle: [
        { cantidad: 4, tarifario_id: 26 },
        { cantidad: 1, tarifario_id: 22 },
      ],
    },
    // Aprobada, emitida como el documento 89: cuenta por la solicitud.
    {
      turno_de_caja_id: 7,
      created_at: '2026-11-17T15:30:00Z',
      documento_id: 89,
      detalle: [{ cantidad: 2, tarifario_id: 26 }],
    },
  ]),
  directasDesde: jest.fn().mockResolvedValue([
    // El documento de la solicitud aprobada: no cuenta dos veces.
    {
      id: 89,
      created_at: '2026-11-17T15:31:00Z',
      emitido_en: '2026-11-17T15:31:00Z',
      detalle: [{ cantidad: 2, tarifario_id: 26 }],
      traida: null,
    },
    // Directa de operaciones: cuenta una vez.
    {
      id: 90,
      created_at: '2026-11-17T16:00:00Z',
      emitido_en: '2026-11-17T16:00:00Z',
      detalle: [{ cantidad: 3, tarifario_id: 26 }],
      traida: null,
    },
    // Anulada por su nota de crédito: no cuenta.
    {
      id: 91,
      created_at: '2026-11-17T16:00:00Z',
      emitido_en: '2026-11-17T16:00:00Z',
      detalle: [{ cantidad: 5, tarifario_id: 26 }],
      traida: null,
    },
    // Traída de facturacion.cl: no se vendió en Eventia.
    {
      id: 92,
      created_at: '2026-11-17T16:00:00Z',
      emitido_en: '2026-11-17T16:00:00Z',
      detalle: [{ cantidad: 7, tarifario_id: 26 }],
      traida: true,
    },
  ]),
  ...o,
});
const cajaRepoParaPulseras = {
  anulados: jest.fn().mockResolvedValue(new Set([91])),
};
const logger = {
  setContext: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
} as unknown as PinoLogger;

const servicioDePulseras = (r = pulserasRepo()) =>
  new PulserasService(
    r as unknown as PulserasRepository,
    cajaRepoParaPulseras as unknown as CajaRepository,
    logger,
  );

describe('La pestaña «Pulseras» (§9.49)', () => {
  it('la rechazada cuenta, la aprobada no cuenta doble y la directa cuenta una vez (sin traídas ni anuladas)', async () => {
    const r = await servicioDePulseras().resumen(OPERACIONES);
    // 4 (rechazada) + 2 (aprobada) + 3 (directa) = 9.
    expect(r).toMatchObject({
      usa_pulsera: true,
      entregadas: 100,
      vendidas: 9,
      deberian_quedar: 91,
      contadas: 92,
      diferencia: 1,
      ventas_directas: [{ created_at: '2026-11-17T16:00:00Z', pulseras: 3 }],
      entregas: [{ cantidad: 100, por: 'Pedro' }],
    });
    expect(r.turnos[0]).toMatchObject({ id: 7, vendidas: 9 });
  });

  it('una empresa sin ítems con pulsera: vacía, sin leer las ventas', async () => {
    const repo = pulserasRepo({
      conPulsera: jest.fn().mockResolvedValue(new Set()),
    });
    const r = await servicioDePulseras(repo).resumen(OPERACIONES);
    expect(r.usa_pulsera).toBe(false);
    expect(r.vendidas).toBe(0);
    expect(repo.solicitudesDesde).not.toHaveBeenCalled();
  });

  it('entregar anota cuántas y quién (del perfil, no se escribe)', async () => {
    const repo = pulserasRepo();
    await servicioDePulseras(repo).entregar(OPERACIONES, { cantidad: 100 });
    expect(repo.entregar).toHaveBeenCalledWith({
      company_id: 1,
      cantidad: 100,
      entregada_por: 'u-ops',
      entregada_por_nombre: 'Pedro Operaciones',
    });
  });

  it('el cierre pide contar solo con ítems con pulsera y alguna entrega', async () => {
    expect(await servicioDePulseras().pideAlCerrar(1)).toBe(true);
    expect(
      await servicioDePulseras(
        pulserasRepo({ conPulsera: jest.fn().mockResolvedValue(new Set()) }),
      ).pideAlCerrar(1),
    ).toBe(false);
    expect(
      await servicioDePulseras(
        pulserasRepo({ hayEntregas: jest.fn().mockResolvedValue(false) }),
      ).pideAlCerrar(1),
    ).toBe(false);
  });

  it('lo de un cierre: nulo si no contó', async () => {
    expect(await servicioDePulseras().delCierre(1, 7)).toEqual({
      deberian: 91,
      contadas: 92,
      diferencia: 1,
    });
    expect(await servicioDePulseras().delCierre(1, 8)).toBeNull();
  });
});

// La caja con las pulseras: el cierre las pide y sigue CIEGO.
const TURNO: TurnoDeCaja = {
  id: 7,
  company_id: 1,
  caja: 'recepcion',
  abierta_por: 'u-recepcion',
  abierta_por_nombre: 'Ana',
  abierta_en: '2026-11-17T12:00:00Z',
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

const armarCaja = (pide: boolean) => {
  const r = {
    turnoAbierto: jest.fn().mockResolvedValue(TURNO),
    movimientos: jest.fn().mockResolvedValue([]),
    cerrar: jest
      .fn<Promise<TurnoDeCaja>, [number, number, object]>()
      .mockResolvedValue({
        ...TURNO,
        cerrada_en: '2026-11-17T23:00:00Z',
        cerrada_por_nombre: 'Ana',
        declarado_efectivo: 0,
        declarado_debito: 0,
        declarado_credito: 0,
        declarado_transferencia: 0,
      }),
    documentos: jest.fn().mockResolvedValue([]),
    correosDe: jest.fn().mockResolvedValue(['camila@example.com']),
    nombreDeLaEmpresa: jest.fn().mockResolvedValue('Valle del Sol'),
  };
  const pulseras = {
    pideAlCerrar: jest.fn().mockResolvedValue(pide),
    delCierre: jest
      .fn()
      .mockResolvedValue(
        pide ? { deberian: 96, contadas: 94, diferencia: -2 } : null,
      ),
  };
  const permisos = {
    delCargo: jest.fn((_c: number, cargo: string) =>
      Promise.resolve(cargo === 'administrador' ? ['caja_revision'] : []),
    ),
  };
  const email = {
    sendEmail: jest
      .fn<Promise<void>, [string[], string, CierreDeCajaParams]>()
      .mockResolvedValue(undefined),
  };
  const servicio = new CajaService(
    r as unknown as CajaRepository,
    logger,
    permisos as never,
    email as never,
    undefined,
    pulseras as never,
  );
  return { r, email, servicio };
};
const CIERRE = { efectivo: 0, debito: 0, credito: 0, transferencia: 0 };

describe('El cierre de la caja con las pulseras (§9.49)', () => {
  it('recepción sabe solo que se cuentan: nunca cuántas debería tener', async () => {
    const { servicio } = armarCaja(true);
    const e = await servicio.estado(RECEPCION);
    expect(e.cuenta_pulseras).toBe(true);
    expect(JSON.stringify(e)).not.toMatch(
      /deberian|diferencia|entregadas|vendidas|esperado/,
    );
  });

  it('si se cuentan, el cierre las pide, las guarda y responde solo la hora', async () => {
    const { servicio, r } = armarCaja(true);
    await expect(servicio.cerrar(RECEPCION, CIERRE)).rejects.toThrow(
      'Falta cuántas pulseras te quedan',
    );
    expect(r.cerrar).not.toHaveBeenCalled();
    const res = await servicio.cerrar(RECEPCION, { ...CIERRE, pulseras: 94 });
    expect(r.cerrar).toHaveBeenCalledWith(
      1,
      7,
      expect.objectContaining({ pulseras_contadas: 94 }),
    );
    expect(res).toEqual({ cerrada_en: '2026-11-17T23:00:00Z' });
  });

  it('una empresa sin pulseras: el cierre de siempre (no pide ni guarda nada)', async () => {
    const { servicio, r, email } = armarCaja(false);
    await servicio.cerrar(RECEPCION, { ...CIERRE, pulseras: 3 });
    expect(r.cerrar.mock.calls[0][2]).not.toHaveProperty('pulseras_contadas');
    expect(email.sendEmail.mock.calls[0][2].pulseras).toBeNull();
    expect((await servicio.estado(RECEPCION)).cuenta_pulseras).toBe(false);
  });

  it('el correo del cierre lleva las pulseras: en rojo si faltan', async () => {
    const { servicio, email } = armarCaja(true);
    await servicio.cerrar(RECEPCION, { ...CIERRE, pulseras: 94 });
    const params = email.sendEmail.mock.calls[0][2];
    expect(params.pulseras).toEqual({
      deberian: 96,
      contadas: 94,
      diferencia: -2,
    });
    const html = cierreDeCajaTemplate(params);
    expect(html).toContain('deberían quedar 96');
    expect(html).toMatch(/color:#b91c1c;">Faltan 2/);
    const sin = cierreDeCajaTemplate({ ...params, pulseras: null });
    expect(sin).not.toContain('Pulseras');
  });
});
