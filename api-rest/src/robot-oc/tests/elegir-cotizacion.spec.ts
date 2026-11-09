import {
  elegirCotizacion,
  type CotizacionCandidata,
} from '../elegir-cotizacion';
import { clienteCorto } from '../robot-oc.service';

/**
 * Los casos de verdad del 09-11-2026: las 7 OC de empresa que llegaron por
 * correo en cuatro meses, con las cotizaciones como estaban en Eventia.
 */
const cot = (
  numero: number,
  p: Partial<CotizacionCandidata> & { cliente_id: string; cliente: string },
): CotizacionCandidata => ({
  id: `q-${numero}`,
  numero,
  estado: 'aceptada',
  total: 0,
  fecha_evento: null,
  correo_contacto: null,
  correos_cliente: [],
  ruts_cliente: [],
  ocs_cargadas: [],
  ...p,
});

const CCU = {
  cliente_id: 'ccu',
  cliente: 'CCU',
  ruts_cliente: ['99554560-8'],
  correos_cliente: ['judiaz@ccu.cl', 'daranedac@ccu.cl'],
};
const TODAS: CotizacionCandidata[] = [
  cot(407, { ...CCU, total: 12_601_500, correo_contacto: 'judiaz@ccu.cl' }),
  cot(408, { ...CCU, total: 21_844_000, correo_contacto: 'daranedac@ccu.cl' }),
  cot(554, {
    ...CCU,
    estado: 'realizada',
    total: 195_300,
    correo_contacto: 'daranedac@ccu.cl',
  }),
  cot(390, { ...CCU, estado: 'rechazada', total: 50_000_000 }),
  cot(470, {
    cliente_id: 'linde',
    cliente: 'Linde High Lift Chile S.A.',
    total: 5_855_500,
    correo_contacto: 'Cristian.penailillo@linde-hl.cl',
    correos_cliente: ['Cristian.penailillo@linde-hl.cl'],
  }),
  cot(481, {
    cliente_id: 'st',
    cliente: 'Instituto Profesional Santo Tomás',
    total: 11_301_500,
    correo_contacto: 'maguilera@santotomas.cl',
    correos_cliente: ['maguilera@santotomas.cl'],
    ruts_cliente: ['65175239-6', '65175242-6'],
  }),
  cot(500, {
    cliente_id: 'rudel',
    cliente: 'Rudel S.A.',
    total: 40_840_800,
    correo_contacto: 'crozas@rudel.cl',
    correos_cliente: ['crozas@rudel.cl'],
  }),
  cot(510, {
    cliente_id: 'gmail',
    cliente: 'Particular',
    total: 99_000_000,
    correos_cliente: ['alguien@gmail.com'],
  }),
];

const va = (r: ReturnType<typeof elegirCotizacion>) =>
  r.resultado === 'elegida' ? r.cotizacion.numero : r.resultado;

describe('El robot de OC: a qué cotización va cada una', () => {
  it('Linde: por el dominio del que la mandó', () => {
    expect(
      va(
        elegirCotizacion(
          {
            numero: 'OC-024940-1',
            total: 5_855_500,
            correos: ['Orieta.Toledo@linde-hl.cl'],
          },
          TODAS,
        ),
      ),
    ).toBe(470);
  });

  it('Santo Tomás: por el RUT, aunque la mande un sistema de Oracle', () => {
    for (const [numero, total] of [
      ['33000132941', 450_000],
      ['33000132942', 5_611_559],
      ['32000066941', 5_239_858],
    ] as const)
      expect(
        va(
          elegirCotizacion(
            {
              numero,
              total,
              rut: '65.175.239-6',
              correos: [
                'elcm.fa.sender@workflow.email.us-phoenix-1.ocs.oraclecloud.com',
              ],
            },
            TODAS,
          ),
        ),
      ).toBe(481);
  });

  it('Rudel: el anticipo va a su evento; nuestro propio correo no cuenta', () => {
    expect(
      va(
        elegirCotizacion(
          {
            numero: '35074',
            total: 4_522_000,
            correos: ['info.sibo@rudel.cl', 'contacto@valledelsolquillon.cl'],
          },
          TODAS,
        ),
      ),
    ).toBe(500);
  });

  it('CCU «1er pago Navidad»: va a la cotización de Daniela, su compradora (Felipe, 09-11)', () => {
    const r = elegirCotizacion(
      {
        numero: '4505466941',
        total: 11_900_000,
        rut: '99554560-8',
        correos: ['proveedores@ccu.cl', 'daranedac@ccu.cl'],
      },
      TODAS,
    );
    expect(va(r)).toBe(408);
    expect(r.resultado === 'elegida' && r.por).toBe('contacto');
  });

  it('CCU almuerzo: Daniela tiene dos, decide el total exacto', () => {
    const r = elegirCotizacion(
      {
        numero: '4505440173',
        total: 195_300,
        rut: '99554560-8',
        correos: ['proveedores@ccu.cl', 'daranedac@ccu.cl'],
      },
      TODAS,
    );
    expect(va(r)).toBe(554);
    expect(r.resultado === 'elegida' && r.por).toBe('contacto y total');
  });

  it('sin el contacto, dos navidades de CCU son una duda, nunca una adivinanza', () => {
    const r = elegirCotizacion(
      {
        numero: '4505466941',
        total: 11_900_000,
        rut: '99554560-8',
        correos: ['proveedores@ccu.cl'],
      },
      TODAS,
    );
    expect(r.resultado).toBe('duda');
    if (r.resultado === 'duda')
      expect(r.candidatas.map((c) => c.numero).sort()).toEqual([407, 408]);
  });

  it('la OC ya cargada no se vuelve a subir', () => {
    const conLaOc = TODAS.map((c) =>
      c.numero === 408
        ? {
            ...c,
            ocs_cargadas: ['2026-11-06T12-00-00_DARANEDAC_4505466941.pdf'],
          }
        : c,
    );
    const r = elegirCotizacion(
      {
        numero: '4505466941',
        total: 11_900_000,
        rut: '99554560-8',
        correos: ['proveedores@ccu.cl'],
      },
      conLaOc,
    );
    expect(r.resultado).toBe('ya_estaba');
    if (r.resultado === 'ya_estaba') expect(r.cotizacion.numero).toBe(408);
  });

  it('una OC más grande que todas las cotizaciones del cliente es una duda', () => {
    expect(
      elegirCotizacion(
        { numero: '1', total: 60_000_000, rut: '99554560-8', correos: [] },
        TODAS,
      ).resultado,
    ).toBe('duda');
  });

  it('un gmail no amarra a nadie por dominio', () => {
    expect(
      elegirCotizacion(
        { numero: '77', total: 1_000, correos: ['otro@gmail.com'] },
        TODAS,
      ).resultado,
    ).toBe('sin_cliente');
  });

  describe('la fecha desempata (Felipe, 09-11: caso Rudel en producción)', () => {
    const HOY = new Date('2026-11-09T12:00:00Z');
    const RUDEL = {
      cliente_id: 'rudel',
      cliente: 'Rudel S.A.',
      correo_contacto: 'crozas@rudel.cl',
      correos_cliente: ['crozas@rudel.cl'],
    };
    const OC_RUDEL = {
      numero: '35074',
      total: 4_522_000,
      correos: ['info.sibo@rudel.cl'],
    };

    it('el evento de 2025 ya hecho no recibe el anticipo: va a la #500', () => {
      const r = elegirCotizacion(
        OC_RUDEL,
        [
          cot(500, { ...RUDEL, total: 40_840_800, fecha_evento: '2026-11-09' }),
          cot(199, {
            ...RUDEL,
            estado: 'realizada',
            total: 34_547_366,
            fecha_evento: '2025-09-29',
          }),
        ],
        HOY,
      );
      expect(r).toMatchObject({
        resultado: 'elegida',
        por: 'fecha',
        cotizacion: { numero: 500 },
      });
    });

    it('entre dos eventos futuros gana el más cercano si le saca 30 días', () => {
      expect(
        va(
          elegirCotizacion(
            OC_RUDEL,
            [
              cot(601, { ...RUDEL, total: 9e6, fecha_evento: '2027-03-01' }),
              cot(600, { ...RUDEL, total: 9e6, fecha_evento: '2026-11-20' }),
            ],
            HOY,
          ),
        ),
      ).toBe(600);
    });

    it('dos eventos con fechas parecidas siguen siendo una duda', () => {
      const r = elegirCotizacion(
        OC_RUDEL,
        [
          cot(600, { ...RUDEL, total: 9e6, fecha_evento: '2026-11-20' }),
          cot(601, { ...RUDEL, total: 9e6, fecha_evento: '2026-12-05' }),
        ],
        HOY,
      );
      expect(r.resultado).toBe('duda');
    });

    it('si alguna no tiene fecha, no se adivina', () => {
      const r = elegirCotizacion(
        OC_RUDEL,
        [
          cot(600, { ...RUDEL, total: 9e6, fecha_evento: '2026-11-20' }),
          cot(601, { ...RUDEL, total: 9e6, fecha_evento: null }),
        ],
        HOY,
      );
      expect(r.resultado).toBe('duda');
    });

    it('un evento realizado hace poco sigue pudiendo recibir su OC', () => {
      const r = elegirCotizacion(
        OC_RUDEL,
        [
          cot(600, {
            ...RUDEL,
            estado: 'realizada',
            total: 9e6,
            fecha_evento: '2026-10-20',
          }),
          cot(601, { ...RUDEL, total: 9e6, fecha_evento: '2026-10-25' }),
        ],
        HOY,
      );
      expect(r.resultado).toBe('duda');
    });
  });

  it('el nombre corto del cliente para el documento', () => {
    expect(clienteCorto('Rudel S.A.')).toBe('Rudel');
    expect(clienteCorto('Linde High Lift Chile S.A.')).toBe(
      'Linde High Lift Chile',
    );
    expect(clienteCorto('Valle del Sol Quillón SpA')).toBe(
      'Valle del Sol Quillón',
    );
    expect(clienteCorto('CCU')).toBe('CCU');
  });
});
