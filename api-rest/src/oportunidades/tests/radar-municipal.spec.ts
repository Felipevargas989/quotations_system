import type { OferenteRepository } from '../oferente/oferente.repository';
import type { OportunidadesRepository } from '../oportunidades.repository';
import {
  anioEnChile,
  variantesDelRut,
} from '../radar-municipal/radar-municipal';
import type { RadarMunicipalRepository } from '../radar-municipal/radar-municipal.repository';
import { RadarMunicipalService } from '../radar-municipal/radar-municipal.service';

// EL RADAR MUNICIPAL (decisión 108). Felipe: "un radar municipal para
// detectar irregularidades de usos de dineros publicos inspirados en zorro
// de ukrania". El cálculo vive en la base (migración 171); aquí, lo que se
// le pregunta.

describe('El radar municipal (decisión 108)', () => {
  it('los RUT van como los escribe ChileCompra, con puntos y sin ellos', () => {
    expect(variantesDelRut('76.111.111-1')).toEqual([
      '76.111.111-1',
      '76111111-1',
    ]);
    expect(variantesDelRut('761111111')).toEqual([
      '76.111.111-1',
      '76111111-1',
    ]);
    expect(variantesDelRut('7.654.321-k')).toEqual([
      '7.654.321-K',
      '7654321-K',
    ]);
    expect(variantesDelRut(null)).toEqual([]);
  });

  it('el año es el de Chile: el 1 de enero a las 02:00 UTC todavía es el año anterior', () => {
    expect(anioEnChile(new Date('2027-01-01T02:00:00Z'))).toBe(2026);
    expect(anioEnChile(new Date('2026-10-28T15:00:00Z'))).toBe(2026);
  });

  const armar = () => {
    const tablero = jest.fn(() => Promise.resolve({ anio: 2025 }));
    const servicio = new RadarMunicipalService(
      { tablero } as unknown as RadarMunicipalRepository,
      {
        configDe: () => Promise.resolve({ regiones: ['Ñuble', 'Biobío'] }),
      } as unknown as OportunidadesRepository,
      {
        oferente: () => Promise.resolve({ rut: '76.111.111-1' }),
      } as unknown as OferenteRepository,
    );
    return { servicio, tablero };
  };

  it('de partida, las regiones de la empresa, con sus RUT para «Dónde no estás»', async () => {
    const { servicio, tablero } = armar();
    const r = await servicio.tablero(1, { anio: 2025 });
    expect(tablero).toHaveBeenCalledWith(
      2025,
      ['Región del Ñuble', 'Región del Biobío'],
      ['76.111.111-1', '76111111-1'],
    );
    expect(r).toMatchObject({
      anio: 2025,
      regiones: ['Región del Ñuble', 'Región del Biobío'],
      zona: ['Región del Ñuble', 'Región del Biobío'],
    });
  });

  it('también una región sola o todo Chile', async () => {
    const { servicio, tablero } = armar();
    await servicio.tablero(1, { anio: 2025, region: 'Maule' });
    expect(tablero).toHaveBeenLastCalledWith(
      2025,
      ['Región del Maule'],
      expect.any(Array),
    );
    await servicio.tablero(1, { anio: 2025, region: 'chile' });
    expect(tablero).toHaveBeenLastCalledWith(2025, [], expect.any(Array));
  });
});
