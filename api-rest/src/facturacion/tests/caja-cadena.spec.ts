import type { PinoLogger } from 'nestjs-pino';
import type { User } from 'src/users/entities/user.entity';
import {
  cadenaDelTurno,
  desdeDelResumen,
  resumenDeLaCadena,
} from '../caja/cadena';
import type { CajaRepository, TurnoDeCaja } from '../caja/caja.repository';
import { CajaService } from '../caja/caja.service';
import type { DocumentoDelTurno } from '../caja/cuadre';

// LA CADENA DEL EFECTIVO (doc 19 §9.54). Felipe, 16-11: *"para que el
// abrió con tenga sentido necesitamos otra que diga cerró con o no?"*. Cada
// turno solo en efectivo (abrió con, debía tener, cerró con) y las tres
// cifras de los últimos 7 días corridos. Recepción no ve nada de esto.

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

const turno = (t: Partial<TurnoDeCaja>): TurnoDeCaja => ({
  id: 1,
  company_id: 1,
  caja: 'recepcion',
  abierta_por: 'u-recepcion',
  abierta_por_nombre: 'Ana',
  abierta_en: '2026-11-15T12:00:00Z',
  sencillo_inicial: 26850,
  cerrada_por: 'u-recepcion',
  cerrada_por_nombre: 'Ana',
  cerrada_en: '2026-11-15T22:00:00Z',
  declarado_efectivo: 26850,
  declarado_debito: 0,
  declarado_credito: 0,
  declarado_transferencia: 0,
  comentario: null,
  revisado_por: null,
  revisado_por_nombre: null,
  revisado_en: '2026-11-16T10:00:00Z',
  nota_revision: null,
  ...t,
});

// El caso real de producción (16-11): el domingo 15 abrió y cerró con
// 26.850; el turno A (16-11, 11:22 a 19:11) abrió con 26.850, sin ventas en
// efectivo ni movimientos, y declaró 0; el turno B (19:56) abrió con 26.850.
const DOMINGO = turno({ id: 5 });
const TURNO_A = turno({
  id: 6,
  abierta_en: '2026-11-16T14:22:00Z',
  cerrada_en: '2026-11-16T22:11:00Z',
  declarado_efectivo: 0,
  revisado_en: null,
});
const TURNO_B = turno({
  id: 7,
  abierta_en: '2026-11-16T22:56:00Z',
  cerrada_por: null,
  cerrada_por_nombre: null,
  cerrada_en: null,
  declarado_efectivo: null,
  declarado_debito: null,
  declarado_credito: null,
  declarado_transferencia: null,
  revisado_en: null,
});
const AHORA = new Date('2026-11-16T23:30:00Z');

const linea = (
  medio: 'efectivo' | 'debito' | 'credito' | 'transferencia',
  esperado: number,
  declarado: number | null,
) => ({ medio, esperado, declarado });

describe('La cadena de un turno (§9.54)', () => {
  it('solo en efectivo: debía tener, cerró con y la diferencia; aparte, los otros medios sumados', () => {
    expect(
      cadenaDelTurno(true, [
        linea('efectivo', 26850, 0),
        linea('debito', 30000, 35000),
        linea('credito', 20000, 15000),
        linea('transferencia', 10000, 9000),
      ]),
    ).toEqual({
      debia_tener: 26850,
      cerro_con: 0,
      diferencia_efectivo: -26850,
      diferencia_otros: -1000,
    });
  });

  it('con la caja abierta, nada: el esperado no se muestra', () => {
    expect(cadenaDelTurno(false, [linea('efectivo', 26850, null)])).toEqual({
      debia_tener: null,
      cerro_con: null,
      diferencia_efectivo: null,
      diferencia_otros: null,
    });
  });
});

describe('El efectivo que falta no resta sobras ni lo que apareció después (§9.58)', () => {
  const fila = (
    diferencia_efectivo: number,
    aparecio_despues = 0,
  ): Parameters<typeof resumenDeLaCadena>[0][number] => ({
    abierta_en: '2026-11-15T14:00:00Z',
    estado: 'revisada',
    diferencia_efectivo,
    apertura: null,
    aparecio_despues,
  });

  it('el caso de Felipe: sobraron 15.000 un día y otro declaró $0 que apareció al abrir', () => {
    const r = resumenDeLaCadena([fila(15000), fila(-26850, 26850)], AHORA);
    expect(r.efectivo_que_falta).toBe(0);
    expect(r.efectivo_que_sobra).toBe(15000);
  });

  it('una falta de verdad no la tapa una sobra de otro turno', () => {
    const r = resumenDeLaCadena([fila(15000), fila(-4000)], AHORA);
    expect(r.efectivo_que_falta).toBe(-4000);
    expect(r.efectivo_que_sobra).toBe(15000);
  });

  it('si apareció solo una parte, falta el resto; si apareció de más, no pasa a sobra', () => {
    expect(
      resumenDeLaCadena([fila(-10000, 6000)], AHORA).efectivo_que_falta,
    ).toBe(-4000);
    const r = resumenDeLaCadena([fila(-10000, 30000)], AHORA);
    expect(r.efectivo_que_falta).toBe(0);
    expect(r.efectivo_que_sobra).toBe(0);
  });
});

describe('Las tres cifras de los 7 días (§9.54)', () => {
  it('suma el efectivo de los cerrados, lo perdido entre turnos (solo lo negativo) y cuenta los por revisar, dentro de los 7 días', () => {
    const r = resumenDeLaCadena(
      [
        {
          abierta_en: '2026-11-16T14:22:00Z',
          estado: 'por_revisar',
          diferencia_efectivo: -26850,
          apertura: { cierre_anterior: 26850, diferencia: 0 },
        },
        {
          abierta_en: '2026-11-14T14:00:00Z',
          estado: 'revisada',
          diferencia_efectivo: 500,
          apertura: { cierre_anterior: 30000, diferencia: -2000 },
        },
        {
          abierta_en: '2026-11-13T14:00:00Z',
          estado: 'por_revisar',
          diferencia_efectivo: 0,
          // Sobra: no es pérdida.
          apertura: { cierre_anterior: 0, diferencia: 5000 },
        },
        // Fuera de los 7 días: no cuenta.
        {
          abierta_en: '2026-11-09T14:00:00Z',
          estado: 'por_revisar',
          diferencia_efectivo: -99999,
          apertura: { cierre_anterior: 99999, diferencia: -99999 },
        },
      ],
      AHORA,
    );
    expect(r).toEqual({
      desde: '2026-11-09T23:30:00.000Z',
      // §9.58: los $500 que sobraron no bajan la falta; van aparte.
      efectivo_que_falta: -26850,
      efectivo_que_sobra: 500,
      perdido_entre_turnos: -2000,
      por_revisar: 2,
    });
  });

  it('la ventana son 7 días corridos desde ahora', () => {
    expect(desdeDelResumen(AHORA).toISOString()).toBe(
      '2026-11-09T23:30:00.000Z',
    );
  });
});

const logger = {
  setContext: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
} as unknown as PinoLogger;

const armar = (turnos: TurnoDeCaja[], documentos: DocumentoDelTurno[] = []) => {
  const r = {
    turnos: jest.fn().mockResolvedValue(turnos),
    turnosDesde: jest.fn().mockResolvedValue([]),
    turnoAnterior: jest.fn().mockResolvedValue(null),
    turnoAbierto: jest.fn().mockResolvedValue(TURNO_B),
    movimientos: jest.fn().mockResolvedValue([]),
    documentos: jest.fn().mockResolvedValue(documentos),
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

describe('La lista de cierres como cadena del efectivo (§9.54)', () => {
  beforeEach(() => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
    jest.setSystemTime(AHORA);
  });
  afterEach(() => jest.useRealTimers());

  it('el caso real: el turno A debía tener 26.850 y cerró con 0; el abierto, sin esperado', async () => {
    const { servicio, r } = armar([TURNO_B, TURNO_A, DOMINGO]);
    const lista = await servicio.cierres(ADMIN);
    expect(r.turnos).toHaveBeenCalledTimes(1);
    expect(r.documentos).toHaveBeenCalledTimes(1);
    expect(r.movimientos).toHaveBeenCalledTimes(1);
    const [b, a, domingo] = lista;
    expect(b).toMatchObject({
      estado: 'abierta',
      sencillo_inicial: 26850,
      debia_tener: null,
      cerro_con: null,
      diferencia_efectivo: null,
      diferencia_otros: null,
      // Abrió con 26.850 después de un cierre que declaró 0: aparecieron.
      apertura: { cierre_anterior: 0, diferencia: 26850 },
    });
    expect(a).toMatchObject({
      estado: 'por_revisar',
      debia_tener: 26850,
      cerro_con: 0,
      diferencia_efectivo: -26850,
      diferencia_otros: 0,
      apertura: { cierre_anterior: 26850, diferencia: 0 },
    });
    expect(domingo).toMatchObject({
      estado: 'revisada',
      debia_tener: 26850,
      cerro_con: 26850,
      diferencia_efectivo: 0,
      apertura: null,
    });
  });

  it('debía tener suma lo vendido en efectivo; los otros medios van aparte', async () => {
    const { servicio } = armar(
      [TURNO_A],
      [
        {
          id: 1,
          tipo: 39,
          folio: 1,
          estado: 'emitido',
          total: 10000,
          medio_de_pago: 'efectivo',
          emitido_en: '2026-11-16T15:00:00Z',
          detalle: [],
          turno_de_caja_id: 6,
        } as DocumentoDelTurno,
        {
          id: 2,
          tipo: 39,
          folio: 2,
          estado: 'emitido',
          total: 5000,
          medio_de_pago: 'debito',
          emitido_en: '2026-11-16T15:10:00Z',
          detalle: [],
          turno_de_caja_id: 6,
        } as DocumentoDelTurno,
      ],
    );
    const [a] = await servicio.cierres(ADMIN);
    expect(a).toMatchObject({
      debia_tener: 36850,
      cerro_con: 0,
      diferencia_efectivo: -36850,
      // Débito: declaró 0, debía 5.000.
      diferencia_otros: -5000,
    });
  });

  it('las tres cifras del caso real', async () => {
    const { servicio } = armar([TURNO_B, TURNO_A, DOMINGO]);
    expect(await servicio.resumenDeCierres(ADMIN)).toEqual({
      desde: '2026-11-09T23:30:00.000Z',
      // §9.58: el turno A declaró $0, pero el B abrió con esos $26.850
      // («Aparecieron…»): no faltó plata, se declaró mal.
      efectivo_que_falta: 0,
      efectivo_que_sobra: 0,
      perdido_entre_turnos: 0,
      por_revisar: 1,
      // §9.57: sin gastos en la semana.
      gastos: 0,
      lista_de_gastos: [],
    });
  });

  it('con más de 60 turnos en 7 días, las cifras cuentan la semana entera, no la página', async () => {
    // 70 turnos cerrados cada 2 horas, todos dentro de los 7 días, cada uno
    // con $100 menos de lo que debía tener.
    const semana = Array.from({ length: 70 }, (_, i) =>
      turno({
        id: 1000 - i,
        abierta_en: new Date(
          AHORA.getTime() - (i + 1) * 2 * 36e5,
        ).toISOString(),
        cerrada_en: new Date(
          AHORA.getTime() - (i + 1) * 2 * 36e5 + 36e5,
        ).toISOString(),
        sencillo_inicial: 1000,
        declarado_efectivo: 900,
        revisado_en: null,
      }),
    );
    const { servicio, r } = armar(semana.slice(0, 61));
    r.turnosDesde.mockResolvedValue(semana);
    const lista = await servicio.cierres(ADMIN);
    expect(lista).toHaveLength(60);
    const resumen = await servicio.resumenDeCierres(ADMIN);
    expect(r.turnosDesde).toHaveBeenCalledWith(1, '2026-11-09T23:30:00.000Z');
    // §9.58: cada turno declaró 900 y el siguiente abrió con 1.000: esos
    // 100 aparecieron, no faltan. Solo el más nuevo, sin turno siguiente,
    // cuenta su falta. Y la cuenta mira la semana entera (70 por revisar).
    expect(resumen.efectivo_que_falta).toBe(-100);
    expect(resumen.por_revisar).toBe(70);
    // Cada apertura (1.000) contra el cierre anterior (900): sobran 100,
    // no es pérdida. El más viejo de la semana pide su anterior aparte.
    expect(resumen.perdido_entre_turnos).toBe(0);
    expect(r.turnoAnterior).toHaveBeenCalledTimes(2);
  });

  it('recepción no ve la cadena: el estado de la caja no trae lo esperado ni lo declarado', async () => {
    const { servicio } = armar([]);
    const e = await servicio.estado(RECEPCION);
    expect(JSON.stringify(e)).not.toMatch(
      /debia_tener|cerro_con|diferencia|apertura/,
    );
  });
});
