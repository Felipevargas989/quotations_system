import {
  mejorVentana,
  publicoDeAudiencia,
  rotuloDeAudiencia,
} from '../programacion';

// Programar envío (04-09, capítulo "Programar envío" del doc 11): la
// recomendación de horario por audiencia — el clasificador de público
// y la ventana ganadora del historial propio.
describe('publicoDeAudiencia', () => {
  it('todos los tipos de oficina → oficina (tildes incluidas)', () => {
    expect(
      publicoDeAudiencia({
        audiencia_tipo: 'clientes',
        tipos_cliente: ['Empresas', 'Colegios y Universidades'],
      }),
    ).toBe('oficina');
    expect(
      publicoDeAudiencia({
        audiencia_tipo: 'clientes',
        tipos_cliente: ['Empresas Públicas'],
      }),
    ).toBe('oficina');
  });

  it('particulares y mezclas → casa (el respaldo seguro)', () => {
    expect(
      publicoDeAudiencia({
        audiencia_tipo: 'clientes',
        tipos_cliente: ['Particulares'],
      }),
    ).toBe('casa');
    expect(
      publicoDeAudiencia({
        audiencia_tipo: 'clientes',
        tipos_cliente: ['Empresas', 'Particulares'],
      }),
    ).toBe('casa');
  });

  it('la importada decide por su nombre; sin señales → casa', () => {
    expect(
      publicoDeAudiencia({
        audiencia_tipo: 'importada',
        audiencia_ref: 'Tour Operadores',
      }),
    ).toBe('oficina');
    expect(
      publicoDeAudiencia({
        audiencia_tipo: 'importada',
        audiencia_ref: 'Cabañas',
      }),
    ).toBe('casa');
  });

  it('el segmento lee los tipos de su filtro', () => {
    expect(
      publicoDeAudiencia({
        audiencia_tipo: 'segmento',
        filtro: { tipos_cliente: ['Convenios'] },
      }),
    ).toBe('oficina');
  });
});

describe('mejorVentana', () => {
  it('gana el bloque con más aperturas, en hora de Chile', () => {
    // 2026-09-08 es martes. 21:30 UTC = 18:30 en Chile (UTC-3).
    const tarde = Array.from({ length: 5 }, () => '2026-09-08T21:30:00.000Z');
    const manana = ['2026-09-09T13:15:00.000Z']; // miércoles 10:15 Chile
    const v = mejorVentana([...tarde, ...manana]);
    expect(v?.texto).toBe('los martes entre 18 y 20 h');
    expect(v?.aperturas).toBe(6);
  });

  it('sin aperturas no hay ventana', () => {
    expect(mejorVentana([])).toBeNull();
  });
});

describe('rotuloDeAudiencia', () => {
  it('prefiere el nombre; después los tipos; al final el genérico', () => {
    expect(
      rotuloDeAudiencia({
        audiencia_tipo: 'importada',
        audiencia_ref: 'Cabañas',
      }),
    ).toBe('Cabañas');
    expect(
      rotuloDeAudiencia({
        audiencia_tipo: 'clientes',
        tipos_cliente: ['Empresas', 'Convenios'],
      }),
    ).toBe('Empresas, Convenios');
    expect(rotuloDeAudiencia({ audiencia_tipo: 'segmento' })).toBe(
      'Segmento de tu base',
    );
  });
});
