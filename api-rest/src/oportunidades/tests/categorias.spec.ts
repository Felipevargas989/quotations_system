import {
  CATEGORIAS_SUGERIDAS,
  categoriasParaElegir,
} from '../datos-abiertos/categorias';

// LAS CATEGORÍAS DE CHILECOMPRA PARA ELEGIR (decisión 111): lo que muestra
// la sección de Configuración, con lo medido en Ñuble y Biobío el 29-10.

const ZONA = [
  {
    categoria: 'SERVICIOS PARA LA COMERCIALIZACIÓN Y DISTRIBUCIÓN',
    licitaciones: 2176,
  },
  { categoria: 'TRANSPORTE DE PASAJEROS', licitaciones: 1792 },
  { categoria: 'RESTAURANTES Y CATERING', licitaciones: 516 },
  { categoria: 'AYUDA Y ASISTENCIA HUMANITARIA', licitaciones: 333 },
  {
    categoria: 'INSTALACIONES HOTELERAS, ALOJAMIENTOS Y CENTROS DE EVENTOS',
    licitaciones: 142,
  },
];

describe('Las categorías de ChileCompra para elegir (decisión 111)', () => {
  it('las cuatro sugeridas van primero, en su orden, con lo que tuvieron en la zona', () => {
    const lista = categoriasParaElegir(ZONA, []);
    expect(lista.slice(0, 4).map((c) => c.categoria)).toEqual([
      ...CATEGORIAS_SUGERIDAS,
    ]);
    expect(lista.slice(0, 4).every((c) => c.sugerida)).toBe(true);
    expect(lista[1].licitaciones).toBe(516);
    // «Asistencia para viajes» no salió en esta zona: va igual, con 0.
    expect(lista[3]).toEqual({
      categoria: 'ASISTENCIA PARA VIAJES',
      licitaciones: 0,
      sugerida: true,
    });
  });

  it('después las demás, de más a menos licitaciones, sin repetir las sugeridas', () => {
    const lista = categoriasParaElegir(ZONA, []);
    expect(lista.slice(4)).toEqual([
      {
        categoria: 'TRANSPORTE DE PASAJEROS',
        licitaciones: 1792,
        sugerida: false,
      },
      {
        categoria: 'AYUDA Y ASISTENCIA HUMANITARIA',
        licitaciones: 333,
        sugerida: false,
      },
    ]);
  });

  it('una ya elegida que la zona no tiene también sale, con 0, para poder quitarla', () => {
    const lista = categoriasParaElegir(ZONA, ['ARTES INTERPRETATIVAS']);
    expect(lista[lista.length - 1]).toEqual({
      categoria: 'ARTES INTERPRETATIVAS',
      licitaciones: 0,
      sugerida: false,
    });
  });
});
