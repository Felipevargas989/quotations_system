import { personalizar, resolverDestinatarios } from '../plantilla';

/** Las reglas de fierro del doc 11, en pruebas. */
describe('resolverDestinatarios', () => {
  const set = (...xs: string[]) => new Set(xs);

  it('deduplica por correo, ignorando mayúsculas y espacios', () => {
    const r = resolverDestinatarios(
      [
        { email: 'Ana@x.cl ', name: 'Ana' },
        { email: 'ana@x.cl', name: 'Ana otra vez' },
        { email: 'luis@x.cl', name: 'Luis' },
      ],
      set(),
      set(),
    );
    expect(r.map((d) => d.email)).toEqual(['ana@x.cl', 'luis@x.cl']);
  });

  it('NINGUNA campaña se salta la lista de supresión (regla 2)', () => {
    const r = resolverDestinatarios(
      [{ email: 'baja@x.cl' }, { email: 'ok@x.cl' }],
      set('baja@x.cl'),
      set(),
    );
    expect(r.map((d) => d.email)).toEqual(['ok@x.cl']);
  });

  it('la regla de una vez: quien ya recibió esta campaña queda fuera (regla 3)', () => {
    const r = resolverDestinatarios(
      [{ email: 'ya@x.cl' }, { email: 'nuevo@x.cl' }],
      set(),
      set('ya@x.cl'),
    );
    expect(r.map((d) => d.email)).toEqual(['nuevo@x.cl']);
  });

  it('correos malformados no viajan', () => {
    const r = resolverDestinatarios(
      [{ email: 'sin-arroba' }, { email: '' }, { email: 'bien@x.cl' }],
      set(),
      set(),
    );
    expect(r.map((d) => d.email)).toEqual(['bien@x.cl']);
  });
});

describe('personalizar', () => {
  it('reemplaza {nombre} y {empresa}, con respaldo digno si faltan', () => {
    expect(
      personalizar('Hola {nombre} de {empresa}', {
        name: 'Paola',
        empresa: 'Municipalidad',
      }),
    ).toBe('Hola Paola de Municipalidad');
    expect(personalizar('Hola {nombre}', {})).toBe('Hola estimado cliente');
  });
});
