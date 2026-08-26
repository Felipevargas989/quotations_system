import { plantillaCampana, validarAsuntoDeReenvio } from '../plantilla';
import { resolverSegmento } from '../segmento';

describe('validarAsuntoDeReenvio (la segunda pasada exige asunto nuevo)', () => {
  it('rechaza el asunto vacío', () => {
    expect(validarAsuntoDeReenvio('Precios 2026', undefined)).toEqual({
      error: 'Escribe un asunto nuevo para la segunda pasada',
    });
    expect(validarAsuntoDeReenvio('Precios 2026', '   ')).toEqual({
      error: 'Escribe un asunto nuevo para la segunda pasada',
    });
  });

  it('rechaza el mismo asunto aunque cambie mayúsculas o espacios', () => {
    const r = validarAsuntoDeReenvio('Precios 2026', '  PRECIOS 2026 ');
    expect(r).toEqual({
      error: 'El asunto del reenvío debe ser distinto al original',
    });
  });

  it('acepta un asunto distinto y lo entrega limpio', () => {
    expect(
      validarAsuntoDeReenvio('Precios 2026', ' ¿Lo viste? Precios 2026 '),
    ).toEqual({ asunto: '¿Lo viste? Precios 2026' });
  });
});

describe('plantillaCampana (el formato de la casa)', () => {
  const base = {
    empresa: 'Valle del Sol',
    titulo: 'Hola {nombre}',
    cuerpoHtml: '<p>Cuerpo</p>',
    bajaUrl: 'https://api/baja?t=abc',
  };

  it('lleva el azul de la casa y la baja obligatoria, siempre', () => {
    const html = plantillaCampana(base);
    expect(html).toContain('#134686'); // el azul de las cotizaciones
    expect(html).toContain(base.bajaUrl);
    expect(html).toContain('Dejar de recibir estos correos');
  });

  it('con preencabezado, va oculto al principio del correo', () => {
    const html = plantillaCampana({
      ...base,
      preencabezado: 'Precios de temporada adentro',
    });
    expect(html).toContain('Precios de temporada adentro');
    expect(html.indexOf('display:none')).toBeGreaterThan(-1);
    expect(html.indexOf('Precios de temporada')).toBeLessThan(
      html.indexOf('Valle del Sol'),
    );
  });

  it('sin preencabezado no queda ni el envoltorio', () => {
    expect(plantillaCampana(base)).not.toContain('display:none;max-height:0');
  });
});

describe('la audiencia "Todos los clientes" es el filtro vacío', () => {
  it('filtro {} = todo cliente con correo, sin condiciones', () => {
    const clientes = [
      { id: 1, name: 'Ana', email: 'ana@x.cl', client_type: 'Empresa' },
      { id: 2, name: 'Beto', email: null, client_type: 'Particular' },
      { id: 3, name: 'Carla', email: 'carla@x.cl', client_type: null },
    ];
    const r = resolverSegmento(clientes, [], {}, '2026-08-25');
    expect(r.map((d) => d.email)).toEqual(['ana@x.cl', 'carla@x.cl']);
  });
});
