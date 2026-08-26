import {
  linkDeWhatsApp,
  MarcaEmpresa,
  plantillaCampana,
  urlAbsoluta,
  validarAsuntoDeReenvio,
} from '../plantilla';
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

describe('linkDeWhatsApp (el link abreviado se genera solo)', () => {
  it('antepone 56 al celular chileno y limpia el formato', () => {
    expect(linkDeWhatsApp('9 8765 4321')).toBe('https://wa.me/56987654321');
    expect(linkDeWhatsApp('+56 9 8765 4321')).toBe('https://wa.me/56987654321');
  });
  it('un número imposible no genera botón', () => {
    expect(linkDeWhatsApp('123')).toBeNull();
  });
});

describe('urlAbsoluta (links pegados sin https igual sirven)', () => {
  it('completa el protocolo solo cuando falta', () => {
    expect(urlAbsoluta('instagram.com/valledelsol')).toBe(
      'https://instagram.com/valledelsol',
    );
    expect(urlAbsoluta('https://valledelsol.cl')).toBe('https://valledelsol.cl');
  });
});

describe('plantillaCampana (el diseño validado por Felipe el 25-08)', () => {
  const marca: MarcaEmpresa = {
    nombre: 'Valle del Sol',
    logo: null,
    tagline: 'Centro de Eventos',
    whatsapp: null,
    instagram: null,
    facebook: null,
    sitioWeb: null,
    colorPrimario: '#213A33',
    colorSecundario: '#E9E2D3',
  };
  const base = {
    marca,
    titulo: 'Hola {nombre}',
    cuerpoHtml: '<p>Cuerpo</p>',
    bajaUrl: 'https://api/baja?t=abc',
    cotizarUrl: 'https://www.eventi-app.com/public-quotation/1',
  };

  it('encabezado blanco pintado, nombre en el color primario, y la baja siempre', () => {
    const html = plantillaCampana(base);
    expect(html).toContain('background-color:#ffffff');
    expect(html).toContain('color:#213A33');
    expect(html).toContain(base.bajaUrl);
    expect(html).toContain('Dejar de recibir estos correos');
    expect(html).not.toContain('linear-gradient'); // los degradados murieron en Outlook
  });

  it('el botón de cotizar va SIEMPRE, sólido, al formulario público', () => {
    const html = plantillaCampana(base);
    expect(html).toContain(base.cotizarUrl);
    expect(html).toContain('background-color:#213A33');
    expect(html).toContain('Cotiza aquí');
  });

  it('con WhatsApp: botón verde universal con el link abreviado', () => {
    const html = plantillaCampana({
      ...base,
      marca: { ...marca, whatsapp: '+56 9 8765 4321' },
    });
    expect(html).toContain('https://wa.me/56987654321');
    expect(html).toContain('#25D366');
    expect(html).toContain('Escríbenos al WhatsApp');
  });

  it('sin WhatsApp no hay botón verde', () => {
    expect(plantillaCampana(base)).not.toContain('#25D366');
  });

  it('la franja de cierre lleva el color secundario, nombre, tagline y solo las redes configuradas', () => {
    const html = plantillaCampana({
      ...base,
      marca: { ...marca, instagram: 'instagram.com/vds', sitioWeb: 'valledelsol.cl' },
    });
    expect(html).toContain('background-color:#E9E2D3');
    expect(html).toContain('Centro de Eventos');
    expect(html).toContain('https://instagram.com/vds');
    expect(html).toContain('https://valledelsol.cl');
    expect(html).not.toContain('Facebook'); // no configurado, no aparece
  });

  it('con logo, la imagen va a la derecha del encabezado; el nombre queda igual', () => {
    const html = plantillaCampana({
      ...base,
      marca: { ...marca, logo: 'https://storage/logo.png' },
    });
    expect(html).toContain('<img src="https://storage/logo.png"');
    expect(html).toContain('align="right"');
    expect(html).toContain('Valle del Sol');
  });

  it('el preencabezado va oculto al principio; sin él, ni el envoltorio', () => {
    const con = plantillaCampana({ ...base, preencabezado: 'Ábreme' });
    expect(con).toContain('Ábreme');
    expect(con.indexOf('display:none')).toBeLessThan(con.indexOf('Valle del Sol'));
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
