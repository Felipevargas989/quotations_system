import {
  fichaDeCompetidor,
  type ProcesoDeLaZona,
  rankingDeCompetidores,
  seVienen,
} from '../historia/mercado';

const QUILLON = '5040';
const HOY = new Date('2026-10-17T12:00:00.000Z');

const proceso = (parcial: Partial<ProcesoDeLaZona>): ProcesoDeLaZona => ({
  codigo: 'P-1',
  nombre: 'Día de campo del dirigente social',
  organismo: 'I MUNICIPALIDAD DE QUILLON',
  organismo_codigo: QUILLON,
  unidad: null,
  comuna: 'Quillón',
  region: 'Región del Ñuble',
  fecha_publicacion: '2025-11-10T15:00:00.000Z',
  monto: 17_000_000,
  adjudicacion: {
    oferentes: 1,
    ganadores: [
      {
        nombre: 'PARQUE AVENTURAS ANTU S.A.',
        rut: '76.154.667-8',
        cantidad: 1,
        monto_unitario: 17_000_000,
      },
    ],
  },
  ...parcial,
});

describe('Se viene: lo que se repite cada año', () => {
  it('el Día de Campo del Dirigente 2025 (10-11) anuncia el de 2026, con quién ganó', () => {
    const [r] = seVienen([proceso({ codigo: '5040-25-LE25' })], HOY, {
      comunas: ['Quillón'],
    });
    expect(r).toMatchObject({
      nombre: 'Día de campo del dirigente social',
      esperada: '2026-11-10T15:00:00.000Z',
      atrasada: false,
      anios: [2025],
      comuna_cercana: true,
      ultima: {
        codigo: '5040-25-LE25',
        monto: 17_000_000,
        oferentes: 1,
        ganadores: [
          {
            rut: '76154667-8',
            nombre: 'PARQUE AVENTURAS ANTU S.A.',
            monto: 17_000_000,
          },
        ],
      },
    });
  });

  it('con varios años, los nombra todos', () => {
    const [r] = seVienen(
      [
        proceso({ codigo: 'A', fecha_publicacion: '2024-11-08T15:00:00.000Z' }),
        proceso({
          codigo: 'B',
          nombre: 'Día de campo dirigentes sociales 2025',
        }),
      ],
      HOY,
    );
    expect(r.anios).toEqual([2024, 2025]);
    expect(r.ultima.codigo).toBe('B');
  });

  it('si este año ya salió, no se anuncia (ya está en la bandeja)', () => {
    expect(
      seVienen(
        [
          proceso({ codigo: 'A' }),
          proceso({
            codigo: 'B',
            fecha_publicacion: '2026-10-05T15:00:00.000Z',
          }),
        ],
        HOY,
      ),
    ).toEqual([]);
  });

  it('la que debió salir hace menos de 3 semanas queda como atrasada; antes de eso, nada (decisión 110)', () => {
    const r = seVienen(
      [
        proceso({ codigo: 'A', fecha_publicacion: '2025-10-01T15:00:00.000Z' }),
        proceso({
          codigo: 'B',
          organismo_codigo: 'OTRO',
          fecha_publicacion: '2025-08-01T15:00:00.000Z',
        }),
      ],
      HOY,
    );
    expect(r.map((s) => [s.ultima.codigo, s.atrasada])).toEqual([['A', true]]);
  });

  it('lo que viene en más de 4 semanas todavía no se muestra (decisión 110; antes, 90 días)', () => {
    expect(
      seVienen(
        [proceso({ fecha_publicacion: '2025-11-20T15:00:00.000Z' })],
        HOY,
      ),
    ).toEqual([]);
  });

  it('la ventana de Felipe: 3 semanas atrás y 4 adelante (decisión 110)', () => {
    const r = seVienen(
      [
        proceso({
          codigo: 'HACE-22',
          organismo_codigo: 'A',
          fecha_publicacion: '2025-09-25T12:00:00.000Z',
        }),
        proceso({
          codigo: 'HACE-20',
          organismo_codigo: 'B',
          fecha_publicacion: '2025-09-27T12:00:00.000Z',
        }),
        proceso({
          codigo: 'EN-27',
          organismo_codigo: 'C',
          fecha_publicacion: '2025-11-13T12:00:00.000Z',
        }),
        proceso({
          codigo: 'EN-29',
          organismo_codigo: 'D',
          fecha_publicacion: '2025-11-15T12:00:00.000Z',
        }),
      ],
      HOY,
    );
    expect(r.map((s) => [s.ultima.codigo, s.atrasada])).toEqual([
      ['HACE-20', true],
      ['EN-27', false],
    ]);
  });

  it('nombres distintos del mismo comprador son series distintas; sin organismo no hay serie', () => {
    const r = seVienen(
      [
        proceso({ codigo: 'CAMPO' }),
        proceso({
          codigo: 'NAVIDAD',
          nombre: 'Cena navideña funcionarios',
          fecha_publicacion: '2025-11-12T15:00:00.000Z',
        }),
        proceso({ codigo: 'SIN', organismo_codigo: null }),
      ],
      HOY,
    );
    expect(r.map((s) => s.ultima.codigo)).toEqual(['CAMPO', 'NAVIDAD']);
  });

  it('alto valor según el umbral de la empresa', () => {
    const [r] = seVienen([proceso({})], HOY, { umbralAltoValor: 3_000_000 });
    expect(r.alto_valor).toBe(true);
    const [s] = seVienen([proceso({ monto: 1_000_000 })], HOY, {
      umbralAltoValor: 3_000_000,
    });
    expect(s.alto_valor).toBe(false);
  });
});

describe('Se viene: lo que ya ocurrió este año no se viene (decisión 110)', () => {
  // El caso que vio Felipe el 29-10: San Ignacio publicó su Día del
  // Funcionario el 23-10 como compra ágil, y «Se viene» lo seguía anunciando.
  const sanIgnacio = proceso({
    codigo: '3706-59-LE25',
    nombre: '“CELEBRACIÓN DÍA DEL FUNCIONARIO MUNICIPAL AÑO 2025',
    organismo: 'I MUNICIPALIDAD DE SAN IGNACIO',
    organismo_codigo: '3706',
    comuna: 'San Ignacio',
    fecha_publicacion: '2025-10-30T12:00:00.000Z',
  });
  const compraAgil = {
    codigo: '3706-382-COT26',
    nombre:
      'Servicio integral de producción y habilitación del evento - Celebración del Día del Funcionario Municipal 2026.',
    organismo: 'I MUNICIPALIDAD DE SAN IGNACIO',
    organismo_codigo: null,
    fecha_publicacion: '2026-10-23T14:20:00.000Z',
  };

  it('el Día del Funcionario de San Ignacio ya salió como compra ágil: no se anuncia', () => {
    expect(seVienen([sanIgnacio], HOY)).toHaveLength(1);
    expect(seVienen([sanIgnacio], HOY, { recientes: [compraAgil] })).toEqual(
      [],
    );
  });

  it('el comprador se reconoce también por su nombre, aunque cambie de unidad', () => {
    const otraUnidad = {
      ...compraAgil,
      codigo: '1532886-12-COT26',
      organismo: 'ILUSTRE MUNICIPALIDAD DE SAN IGNACIO',
    };
    expect(seVienen([sanIgnacio], HOY, { recientes: [otraUnidad] })).toEqual(
      [],
    );
  });

  it('otro comprador, otra compra o la misma edición de antes no la sacan', () => {
    const r = seVienen([sanIgnacio], HOY, {
      recientes: [
        {
          ...compraAgil,
          codigo: '4027-355-COT26',
          organismo: 'I MUNICIPALIDAD DE ANTUCO',
        },
        { ...compraAgil, nombre: 'Adquisición de computadores para oficina' },
        { ...compraAgil, fecha_publicacion: '2025-11-02T12:00:00.000Z' },
      ],
    });
    expect(r).toHaveLength(1);
  });
});

describe('Competidores: quién gana en la zona', () => {
  const procesos = [
    proceso({ codigo: 'A' }),
    proceso({
      codigo: 'B',
      organismo: 'I MUNICIPALIDAD DE BULNES',
      fecha_publicacion: '2026-03-02T15:00:00.000Z',
      adjudicacion: {
        oferentes: 3,
        ganadores: [
          // El mismo proveedor, escrito sin puntos: es el mismo RUT.
          {
            nombre: 'PARQUE AVENTURAS ANTU S.A.',
            rut: '76154667-8',
            cantidad: 2,
            monto_unitario: 1_500_000,
          },
          {
            nombre: 'SOL DE QUILLON SPA',
            rut: '77.067.895-1',
            cantidad: 1,
            monto_unitario: 30_000_000,
          },
          { nombre: 'SIN RUT', cantidad: 1, monto_unitario: 1 },
        ],
      },
    }),
  ];

  it('de más triunfos a menos; los montos se suman y sin RUT no cuenta', () => {
    const r = rankingDeCompetidores(procesos);
    expect(r.map((c) => [c.rut, c.triunfos, c.monto_total])).toEqual([
      ['76154667-8', 2, 20_000_000],
      ['77067895-1', 1, 30_000_000],
    ]);
    expect(r[0].organismos).toEqual([
      { nombre: 'I MUNICIPALIDAD DE BULNES', veces: 1 },
      { nombre: 'I MUNICIPALIDAD DE QUILLON', veces: 1 },
    ]);
    expect(r[0].ultimo).toBe('2026-03-02T15:00:00.000Z');
  });

  it('la ficha: lo que ganó, lo último primero; se busca con o sin puntos', () => {
    const f = fichaDeCompetidor(procesos, '76.154.667-8');
    expect(f?.nombre).toBe('PARQUE AVENTURAS ANTU S.A.');
    expect(f?.triunfos_detalle.map((t) => [t.codigo, t.monto])).toEqual([
      ['B', 3_000_000],
      ['A', 17_000_000],
    ]);
    expect(fichaDeCompetidor(procesos, '11.111.111-1')).toBeNull();
  });
});
