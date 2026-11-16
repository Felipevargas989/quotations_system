import type { PinoLogger } from 'nestjs-pino';
import {
  cierreDeCajaTemplate,
  type CierreDeCajaParams,
} from 'src/email/templates/cierreDeCaja';
import type { User } from 'src/users/entities/user.entity';
import { compararApertura, turnoAnteriorEn } from '../caja/apertura';
import type { CajaRepository, TurnoDeCaja } from '../caja/caja.repository';
import { CajaService } from '../caja/caja.service';

// LA APERTURA CONTRA EL CIERRE ANTERIOR (doc 19 §9.53). Felipe, 16-11:
// *"debe concidier el saldo de cierre del ultimo cierre con la apertura
// siguiente, si no en el inter, se pierde el dinero"*. Solo lo ve quien
// revisa: recepción abre a ciegas.

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
  cerrada_en: '2026-11-15T23:00:00Z',
  declarado_efectivo: 26850,
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

// El caso medido en producción: el 16-11 abrió con 26.850 y cerró
// declarando $0 en efectivo; la apertura siguiente tendría que ser $0.
const DEL_15 = turno({ id: 6 });
const DEL_16 = turno({
  id: 7,
  abierta_en: '2026-11-16T12:00:00Z',
  cerrada_en: '2026-11-16T23:00:00Z',
  declarado_efectivo: 0,
});
const DEL_17 = turno({
  id: 8,
  abierta_en: '2026-11-17T12:00:00Z',
  sencillo_inicial: 26850,
  cerrada_en: null,
  declarado_efectivo: null,
});

describe('La apertura contra el cierre anterior (§9.53)', () => {
  it('calza, sobra o falta: el sencillo menos lo que declaró el cierre anterior', () => {
    expect(compararApertura(DEL_16, DEL_15)).toEqual({
      cierre_anterior: 26850,
      diferencia: 0,
    });
    expect(compararApertura(DEL_17, DEL_16)).toEqual({
      cierre_anterior: 0,
      diferencia: 26850,
    });
    expect(
      compararApertura({ sencillo_inicial: 0 }, { declarado_efectivo: 26850 }),
    ).toEqual({ cierre_anterior: 26850, diferencia: -26850 });
  });

  it('el primer turno de la historia no se compara', () => {
    expect(compararApertura(DEL_15, null)).toBeNull();
    expect(turnoAnteriorEn(DEL_15, [DEL_15])).toBeNull();
  });

  it('el anterior: el cerrado de la misma caja abierto justo antes, en cualquier orden', () => {
    const lista = [DEL_15, DEL_17, DEL_16];
    expect(turnoAnteriorEn(DEL_17, lista)?.id).toBe(7);
    expect(turnoAnteriorEn(DEL_16, lista)?.id).toBe(6);
    // Uno sin cerrar no es anterior de nadie.
    const abiertoViejo = turno({
      id: 9,
      abierta_en: '2026-11-16T18:00:00Z',
      cerrada_en: null,
    });
    expect(turnoAnteriorEn(DEL_17, [...lista, abiertoViejo])?.id).toBe(7);
    // Otra caja, tampoco.
    const otraCaja = turno({
      id: 10,
      caja: 'otra',
      abierta_en: '2026-11-16T20:00:00Z',
    });
    expect(turnoAnteriorEn(DEL_17, [...lista, otraCaja])?.id).toBe(7);
  });
});

const logger = {
  setContext: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
} as unknown as PinoLogger;

const armar = (turnos: TurnoDeCaja[]) => {
  const r = {
    turnos: jest.fn().mockResolvedValue(turnos),
    turno: jest.fn().mockResolvedValue(DEL_16),
    turnoAbierto: jest.fn().mockResolvedValue(DEL_17),
    turnoAnterior: jest.fn().mockResolvedValue(DEL_15),
    movimientos: jest.fn().mockResolvedValue([]),
    documentos: jest.fn().mockResolvedValue([]),
    correcciones: jest.fn().mockResolvedValue([]),
    cerrar: jest.fn().mockResolvedValue({
      ...DEL_17,
      cerrada_en: '2026-11-17T23:00:00Z',
      declarado_efectivo: 30000,
    }),
    correosDe: jest.fn().mockResolvedValue(['camila@example.com']),
    nombreDeLaEmpresa: jest.fn().mockResolvedValue('Valle del Sol'),
  };
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

describe('Quien revisa ve la apertura (§9.53)', () => {
  it('la lista: cada cierre con su apertura en UNA lectura, y el último visible con el anterior que quedó fuera de la página', async () => {
    // 62 turnos, uno por día, del más nuevo al más viejo; el más viejo
    // declaró 1.000 menos que con lo que abrió el siguiente.
    const turnos = Array.from({ length: 62 }, (_, i) =>
      turno({
        id: 100 - i,
        abierta_en: new Date(Date.UTC(2026, 10, 30) - i * 864e5).toISOString(),
        sencillo_inicial: 26850,
        declarado_efectivo: i === 60 ? 25850 : 26850,
      }),
    );
    const { servicio, r } = armar(turnos.slice(0, 61));
    const lista = await servicio.cierres(ADMIN);
    expect(r.turnos).toHaveBeenCalledTimes(1);
    expect(r.turnos).toHaveBeenCalledWith(1, 61);
    expect(r.turnoAnterior).not.toHaveBeenCalled();
    expect(lista).toHaveLength(60);
    expect(lista[0].apertura).toEqual({
      cierre_anterior: 26850,
      diferencia: 0,
    });
    // El 60° (el más viejo a la vista) se compara con el 61°, que no se muestra.
    expect(lista[59].apertura).toEqual({
      cierre_anterior: 25850,
      diferencia: 1000,
    });
  });

  it('con menos de 60, el más viejo es el primero de la historia: sin comparación', async () => {
    const { servicio } = armar([DEL_17, DEL_16, DEL_15]);
    const lista = await servicio.cierres(ADMIN);
    expect(lista.map((c) => c.apertura)).toEqual([
      { cierre_anterior: 0, diferencia: 26850 },
      { cierre_anterior: 26850, diferencia: 0 },
      null,
    ]);
  });

  it('el detalle del cierre trae la apertura y la cifra del cierre anterior', async () => {
    const { servicio, r } = armar([]);
    const c = await servicio.cierre(ADMIN, 7);
    expect(r.turnoAnterior).toHaveBeenCalledWith(
      1,
      'recepcion',
      '2026-11-16T12:00:00Z',
    );
    expect(c.sencillo_inicial).toBe(26850);
    expect(c.apertura).toEqual({ cierre_anterior: 26850, diferencia: 0 });
    r.turnoAnterior.mockResolvedValueOnce(null);
    expect((await servicio.cierre(ADMIN, 7)).apertura).toBeNull();
  });

  it('recepción no la ve: el estado de la caja no trae el cierre anterior (ciego)', async () => {
    const { servicio, r } = armar([]);
    const e = await servicio.estado(RECEPCION);
    expect(JSON.stringify(e)).not.toMatch(/apertura|cierre_anterior|calza/i);
    expect(r.turnoAnterior).not.toHaveBeenCalled();
  });

  it('el correo del cierre dice con cuánto abrió y si calzó', async () => {
    const { servicio, r, email } = armar([]);
    r.turnoAnterior.mockResolvedValueOnce(DEL_16);
    await servicio.cerrar(RECEPCION, {
      efectivo: 30000,
      debito: 0,
      credito: 0,
      transferencia: 0,
    });
    expect(email.sendEmail).toHaveBeenCalledWith(
      ['camila@example.com'],
      'cierreDeCaja',
      expect.objectContaining({
        apertura: {
          sencillo: 26850,
          comparada: { cierre_anterior: 0, diferencia: 26850 },
        },
      }),
    );
  });

  it('si la consulta del anterior falla, el correo sale igual, sin la comparación', async () => {
    const { servicio, r, email } = armar([]);
    r.turnoAnterior.mockRejectedValueOnce(new Error('se cortó'));
    await servicio.cerrar(RECEPCION, {
      efectivo: 30000,
      debito: 0,
      credito: 0,
      transferencia: 0,
    });
    expect(email.sendEmail).toHaveBeenCalledWith(
      ['camila@example.com'],
      'cierreDeCaja',
      expect.objectContaining({
        apertura: { sencillo: 26850, comparada: null },
      }),
    );
  });
});

describe('La línea de la apertura en el correo (§9.53)', () => {
  const params: CierreDeCajaParams = {
    quien: 'Ana',
    abierta: '2026-11-17T12:00:00Z',
    cerrada: '2026-11-17T23:00:00Z',
    lineas: [],
    vendido: 0,
    retiros: 0,
    diferencia: 0,
  };

  it('calza en verde; falta o sobra en rojo, con lo que declaró el cierre anterior', () => {
    expect(
      cierreDeCajaTemplate({
        ...params,
        apertura: {
          sencillo: 26850,
          comparada: { cierre_anterior: 26850, diferencia: 0 },
        },
      }),
    ).toMatch(/Abrió con \$26\.850 · <strong style="color:#15803d;">Calza/);
    const sobra = cierreDeCajaTemplate({
      ...params,
      apertura: {
        sencillo: 26850,
        comparada: { cierre_anterior: 0, diferencia: 26850 },
      },
    });
    expect(sobra).toMatch(/color:#b91c1c;">Sobran \$26\.850/);
    expect(sobra).toContain('el cierre anterior declaró $0');
    expect(
      cierreDeCajaTemplate({
        ...params,
        apertura: {
          sencillo: 0,
          comparada: { cierre_anterior: 26850, diferencia: -26850 },
        },
      }),
    ).toMatch(/Faltan \$26\.850/);
  });

  it('el primer turno solo dice con cuánto abrió; sin apertura, nada', () => {
    const primero = cierreDeCajaTemplate({
      ...params,
      apertura: { sencillo: 1850, comparada: null },
    });
    expect(primero).toContain('Abrió con $1.850');
    expect(primero).not.toMatch(/Calza|Faltan|Sobran/);
    expect(cierreDeCajaTemplate(params)).not.toContain('Abrió con');
  });
});
