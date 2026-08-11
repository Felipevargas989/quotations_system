import { escaparHtml, sanearAsunto } from '../templates/utils';

// Cura de inyección (revisión 05-08): los datos del visitante viajan
// escapados en el HTML y saneados en los asuntos.
describe('escaparHtml', () => {
  it('escapa & < > comillas y apóstrofe', () => {
    expect(escaparHtml(`<img src=x onerror="alert('hola')"> & fin`)).toBe(
      '&lt;img src=x onerror=&quot;alert(&#39;hola&#39;)&quot;&gt; &amp; fin',
    );
  });

  it('null y undefined quedan en cadena vacía', () => {
    expect(escaparHtml(null)).toBe('');
    expect(escaparHtml(undefined)).toBe('');
  });

  it('texto limpio pasa intacto', () => {
    expect(escaparHtml('Cabañas del Lago 2026')).toBe('Cabañas del Lago 2026');
  });
});

describe('sanearAsunto', () => {
  it('quita CR/LF (inyección de cabeceras) y respeta el texto', () => {
    expect(sanearAsunto('hola\r\nBcc: intruso@x.cl')).toBe(
      'hola Bcc: intruso@x.cl',
    );
  });

  it('aplica el tope de largo', () => {
    expect(sanearAsunto('a'.repeat(300))).toHaveLength(120);
  });
});
