import { anteriorDe, parecido, type ProcesoPasado } from '../historia/anterior';

const QUILLON = '1234';

const pasado = (parcial: Partial<ProcesoPasado>): ProcesoPasado => ({
  codigo: 'P-1',
  nombre: 'Producción de evento día del profesor y asistentes',
  organismo_codigo: QUILLON,
  fecha_publicacion: '2025-10-03T15:00:00.000Z',
  monto: null,
  adjudicacion: {
    oferentes: 1,
    url_acta: 'http://acta',
    ganadores: [
      {
        nombre: 'CENTRO TURISTICO SOL DE QUILLON SPA',
        cantidad: 1,
        monto_unitario: 12_000_000,
      },
    ],
  },
  ...parcial,
});

const PROFESOR_2026 = {
  codigo: '4364-13-LE26',
  nombre: 'Producción de Evento día del Profesor y Asistentes de la Educación',
  organismo_codigo: QUILLON,
  fecha_publicacion: '2026-10-09T18:54:00.000Z',
};

describe('parecido', () => {
  it('sin tildes, sin años y sin palabras vacías', () => {
    expect(
      parecido('Día del Profesor 2026', 'dia del profesor 2025'),
    ).toBeCloseTo(1);
    expect(parecido('Insumos dentales CESFAM', 'Día del Profesor')).toBe(0);
  });
});

describe('anteriorDe: la misma compra del año pasado', () => {
  it('el Día del Profesor 2025: quién ganó, por cuánto y cuántos ofertaron', () => {
    expect(
      anteriorDe(PROFESOR_2026, [pasado({ codigo: '4364-5-LE25' })]),
    ).toEqual({
      codigo: '4364-5-LE25',
      nombre: 'Producción de evento día del profesor y asistentes',
      anio: 2025,
      oferentes: 1,
      url_acta: 'http://acta',
      ganadores: [
        { nombre: 'CENTRO TURISTICO SOL DE QUILLON SPA', monto: 12_000_000 },
      ],
    });
  });

  it('mismo municipio aunque cambie la unidad (el Día del Funcionario cambió de código)', () => {
    const funcionario2026 = {
      codigo: '1532886-5-LE26',
      nombre: 'Ceremonia y Cena Día del Funcionario',
      organismo_codigo: QUILLON,
      fecha_publicacion: '2026-10-09T16:24:00.000Z',
    };
    const r = anteriorDe(funcionario2026, [
      pasado({
        codigo: '4352-6-LE25',
        nombre: 'Cena día del funcionario municipal',
        adjudicacion: {
          oferentes: 1,
          ganadores: [
            {
              nombre: 'BPM EVENTOS SPA',
              cantidad: 1,
              monto_unitario: 13_949_580,
            },
          ],
        },
      }),
      pasado({ codigo: 'OTRO', nombre: 'Insumos dentales CESFAM' }),
    ]);
    expect(r?.codigo).toBe('4352-6-LE25');
    expect(r?.ganadores).toEqual([
      { nombre: 'BPM EVENTOS SPA', monto: 13_949_580 },
    ]);
  });

  it('otro organismo, sin adjudicar, demasiado reciente o demasiado antigua: no cuenta', () => {
    expect(
      anteriorDe(PROFESOR_2026, [
        pasado({ organismo_codigo: '9999' }),
        pasado({ adjudicacion: null }),
        pasado({ fecha_publicacion: '2026-08-01T12:00:00.000Z' }),
        pasado({ fecha_publicacion: '2023-01-01T12:00:00.000Z' }),
      ]),
    ).toBeNull();
  });

  it('si hay varias, gana la más parecida; si empatan, la más reciente', () => {
    const r = anteriorDe(PROFESOR_2026, [
      pasado({
        codigo: 'VIEJA',
        fecha_publicacion: '2024-10-03T15:00:00.000Z',
      }),
      pasado({ codigo: 'NUEVA' }),
      pasado({
        codigo: 'LEJANA',
        nombre: 'Celebración aniversario con asistentes',
      }),
    ]);
    expect(r?.codigo).toBe('NUEVA');
  });

  it('varios ítems del mismo ganador se suman', () => {
    const r = anteriorDe(PROFESOR_2026, [
      pasado({
        adjudicacion: {
          oferentes: 2,
          ganadores: [
            { nombre: 'A', cantidad: 2, monto_unitario: 1_000 },
            { nombre: 'A', cantidad: 1, monto_unitario: 500 },
            { nombre: 'B', cantidad: 1, monto_unitario: null },
          ],
        },
      }),
    ]);
    expect(r?.ganadores).toEqual([
      { nombre: 'A', monto: 2_500 },
      { nombre: 'B', monto: null },
    ]);
  });
});
