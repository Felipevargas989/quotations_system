import {
  type FilaDeLaZona,
  procesoDeLaZona,
  procesoParaLeer,
} from '../datos-abiertos/mercado-de-la-zona';
import { ganadoresDe } from '../historia/ganadores';
import { rankingDeCompetidores } from '../historia/mercado';

// EL MERCADO DE LA ZONA (decisión 106, 28-10). Felipe: «se viene y el
// competidor es en quién ganó. Deberían actualizarse».

const fila = (cambios: Partial<FilaDeLaZona> = {}): FilaDeLaZona => ({
  codigo: '4352-6-LE25',
  nombre: 'SERV. ALIMENTACIÓN CENA DÍA DEL FUNCIONARIO MUNIC.',
  organismo: 'ILUSTRE MUNICIPALIDAD DE QUILLON',
  organismo_codigo: '135562',
  unidad: 'ADMINISTRACIÓN Y FINANZAS',
  comuna: 'Quillón',
  region: 'Región del Ñuble',
  fecha_publicacion: '2025-10-02',
  fecha_cierre: '2025-10-13',
  monto_estimado: '17000000',
  oferentes: 2,
  rubros: ['RESTAURANTES Y CATERING'],
  ganadores: [
    {
      rut: '76.111.111-1',
      nombre: 'VALLE DEL SOL SPA',
      cantidad: 1,
      monto_unitario: '13949580',
    },
  ],
  ...cambios,
});

describe('El mercado de la zona (decisión 106)', () => {
  it('una licitación del mercado queda como las de la historia del radar, con quién ganó y por cuánto', () => {
    const p = procesoDeLaZona(fila());
    expect(p).toMatchObject({
      codigo: '4352-6-LE25',
      organismo_codigo: '135562',
      region: 'Región del Ñuble',
      fecha_publicacion: '2025-10-02',
      monto: 17_000_000,
    });
    expect(ganadoresDe(p.adjudicacion)).toEqual([
      expect.objectContaining({
        nombre: 'VALLE DEL SOL SPA',
        monto: 13_949_580,
      }),
    ]);
  });

  it('sin ganadores ni oferentes informados, no tiene adjudicación; sin monto estimado, el monto es null', () => {
    const p = procesoDeLaZona(
      fila({ ganadores: null, oferentes: null, monto_estimado: null }),
    );
    expect(p.adjudicacion).toBeNull();
    expect(p.monto).toBeNull();
  });

  it('los competidores se arman igual que con la historia del radar', () => {
    const ranking = rankingDeCompetidores([
      procesoDeLaZona(fila()),
      procesoDeLaZona(
        fila({
          codigo: '3784-128-LE25',
          organismo_codigo: '116742',
          ganadores: [
            {
              rut: '76.111.111-1',
              nombre: 'VALLE DEL SOL SPA',
              cantidad: 1,
              monto_unitario: 12_442_640,
            },
          ],
        }),
      ),
    ]);
    expect(ranking[0]).toMatchObject({
      triunfos: 2,
      monto_total: 13_949_580 + 12_442_640,
    });
  });

  it('para la IA de «Se viene», sin descripción y con los rubros de lo comprado', () => {
    expect(procesoParaLeer(fila())).toEqual({
      codigo: '4352-6-LE25',
      tipo: 'licitacion',
      nombre: 'SERV. ALIMENTACIÓN CENA DÍA DEL FUNCIONARIO MUNIC.',
      descripcion: null,
      organismo: 'ILUSTRE MUNICIPALIDAD DE QUILLON',
      unidad: 'ADMINISTRACIÓN Y FINANZAS',
      comuna: 'Quillón',
      region: 'Región del Ñuble',
      monto: 17_000_000,
      fecha_cierre: '2025-10-13',
      productos: [{ nombre: 'RESTAURANTES Y CATERING' }],
    });
  });
});
