import { etiquetaDeOrigen, limpiarOrigen } from '../../origen-del-lead';

// ORIGEN DEL LEAD (migración 110): de dónde llegó quien llenó el
// formulario público. El navegador manda el crudo; el SERVIDOR decide
// qué se guarda y con qué etiqueta.
describe('limpiarOrigen — el navegador no decide qué entra a la base', () => {
  it('se queda solo con las llaves conocidas', () => {
    expect(
      limpiarOrigen({
        gclid: 'Cj0KCQ',
        utm_source: 'google',
        password: 'no',
        cualquier_cosa: 'tampoco',
      }),
    ).toEqual({ gclid: 'Cj0KCQ', utm_source: 'google' });
  });

  it('recorta valores larguísimos y descarta vacíos', () => {
    const limpio = limpiarOrigen({ gclid: 'x'.repeat(900), utm_term: '   ' });
    expect(limpio?.gclid).toHaveLength(512);
    expect(limpio?.utm_term).toBeUndefined();
  });

  it('devuelve null cuando no quedó nada — la columna queda vacía, no {}', () => {
    expect(limpiarOrigen({ basura: 1 })).toBeNull();
    expect(limpiarOrigen(null)).toBeNull();
    expect(limpiarOrigen('texto')).toBeNull();
    expect(limpiarOrigen([1, 2])).toBeNull();
  });
});

describe('etiquetaDeOrigen — la palabra que ve un humano en la ficha', () => {
  it('la huella de clic manda sobre todo lo demás', () => {
    expect(etiquetaDeOrigen({ gclid: 'abc', utm_source: 'instagram' })).toBe(
      'Google Ads',
    );
    expect(etiquetaDeOrigen({ fbclid: 'abc' })).toBe('Meta');
  });

  it('sin huella, las utm_* distinguen pagado de orgánico', () => {
    expect(etiquetaDeOrigen({ utm_source: 'google', utm_medium: 'cpc' })).toBe(
      'Google Ads',
    );
    expect(
      etiquetaDeOrigen({ utm_source: 'google', utm_medium: 'organic' }),
    ).toBe('Google');
    expect(etiquetaDeOrigen({ utm_source: 'whatsapp' })).toBe('WhatsApp');
    expect(etiquetaDeOrigen({ utm_source: 'newsletter' })).toBe('Newsletter');
  });

  it('sin nada marcado, se deduce del referente', () => {
    expect(
      etiquetaDeOrigen({ referrer: 'https://www.google.cl/search?q=x' }),
    ).toBe('Búsqueda orgánica');
    expect(etiquetaDeOrigen({ referrer: 'https://l.instagram.com/' })).toBe(
      'Meta',
    );
    expect(etiquetaDeOrigen({ referrer: 'https://sitio-raro.cl/blog' })).toBe(
      'Referido: sitio-raro.cl',
    );
  });

  it('venir de la propia web NO es un referido', () => {
    expect(
      etiquetaDeOrigen({ referrer: 'https://www.eventi-app.com/otra' }),
    ).toBe('Directo');
  });

  it('sin ninguna miga, es Directo', () => {
    expect(etiquetaDeOrigen(null)).toBe('Directo');
    expect(etiquetaDeOrigen({ referrer: 'no-es-una-direccion' })).toBe(
      'Directo',
    );
  });
});
