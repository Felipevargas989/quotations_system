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

  it('la que debió salir hace menos de 30 días queda como atrasada; antes de eso, nada', () => {
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

  it('lo que viene en más de 90 días todavía no se muestra', () => {
    expect(
      seVienen(
        [proceso({ fecha_publicacion: '2026-03-01T15:00:00.000Z' })],
        HOY,
      ),
    ).toEqual([]);
  });

  it('nombres distintos del mismo comprador son series distintas; sin organismo no hay serie', () => {
    const r = seVienen(
      [
        proceso({ codigo: 'CAMPO' }),
        proceso({
          codigo: 'NAVIDAD',
          nombre: 'Cena navideña funcionarios',
          fecha_publicacion: '2025-12-01T15:00:00.000Z',
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
