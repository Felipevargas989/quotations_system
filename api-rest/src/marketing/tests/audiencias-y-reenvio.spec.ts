import {
  cuerpoAHtml,
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
    expect(urlAbsoluta('https://valledelsol.cl')).toBe(
      'https://valledelsol.cl',
    );
  });
});

describe('plantillaCampana (el diseño validado por Felipe el 25-08)', () => {
  const marca: MarcaEmpresa = {
    nombre: 'Valle del Sol',
    logo: null,
    banner: null,
    tagline: 'Centro de Eventos',
    replyTo: null,
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
    iconosBase: 'https://www.eventi-app.com',
  };

  it('encabezado en el color primario con nombre legible, y la baja siempre', () => {
    const html = plantillaCampana(base);
    expect(html).toContain(`background-color:#213A33`); // el encabezado
    // primario oscuro → el nombre elige blanco por luminancia:
    expect(html).toContain('color:#ffffff;margin:0;letter-spacing');
    expect(html).toContain(`background-color:#E9E2D3`); // la franja crema
    expect(html).toContain(base.bajaUrl);
    expect(html).toContain('Dejar de recibir estos correos');
    expect(html).not.toContain('linear-gradient'); // los degradados murieron en Outlook
  });

  it('con banner, la imagen REEMPLAZA el encabezado completo', () => {
    const html = plantillaCampana({
      ...base,
      marca: {
        ...marca,
        banner: 'https://storage/banner.png',
        logo: 'https://storage/logo.png',
      },
    });
    expect(html).toContain('<img src="https://storage/banner.png"');
    expect(html).not.toContain('https://storage/logo.png'); // el banner ya trae la marca
    expect(html).not.toContain('font-size:24px'); // ni el nombre grande del encabezado
  });

  it('el botón de WhatsApp lleva el glifo blanco adentro', () => {
    const html = plantillaCampana({
      ...base,
      marca: { ...marca, whatsapp: '987654321' },
    });
    expect(html).toContain('/correo/whatsapp.png');
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

  it('la franja de cierre lleva el color secundario, nombre, tagline y solo los íconos configurados', () => {
    const html = plantillaCampana({
      ...base,
      marca: {
        ...marca,
        instagram: 'instagram.com/vds',
        sitioWeb: 'valledelsol.cl',
      },
    });
    expect(html).toContain('background-color:#E9E2D3');
    expect(html).toContain('Centro de Eventos');
    expect(html).toContain('https://instagram.com/vds');
    expect(html).toContain('https://valledelsol.cl');
    // Los íconos clásicos como IMÁGENES (idénticas en claro y oscuro):
    expect(html).toContain('/correo/instagram.png');
    expect(html).toContain('/correo/web.png');
    expect(html).not.toContain('facebook.png'); // no configurado, no aparece
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
    expect(con.indexOf('display:none')).toBeLessThan(
      con.indexOf('Valle del Sol'),
    );
    expect(plantillaCampana(base)).not.toContain('display:none;max-height:0');
  });
});

describe('colores legibles con CUALQUIER paleta (revisión 26-08)', () => {
  const marca: MarcaEmpresa = {
    nombre: 'Otra Empresa',
    logo: null,
    banner: null,
    tagline: null,
    replyTo: null,
    whatsapp: null,
    instagram: null,
    facebook: null,
    sitioWeb: null,
    colorPrimario: '#667eea',
    colorSecundario: '#059669', // el verde saturado por defecto de Configuración
  };
  const base = {
    marca,
    titulo: 'Hola',
    cuerpoHtml: '<p>Cuerpo</p>',
    bajaUrl: 'https://api/baja?t=abc',
    cotizarUrl: 'https://www.eventi-app.com/public-quotation/2',
    iconosBase: 'https://www.eventi-app.com',
  };

  it('secundario saturado: la franja cae al neutro claro, nunca ilegible', () => {
    const html = plantillaCampana(base);
    expect(html).toContain('background-color:#f9fafb');
    expect(html).not.toContain('background-color:#059669');
  });

  it('el nombre sobre el primario elige blanco/negro solo', () => {
    const html = plantillaCampana(base);
    expect(html).toContain('color:#ffffff;margin:0;letter-spacing');
  });

  it('los datos con comillas o < no rompen el HTML del correo', () => {
    const html = plantillaCampana({
      ...base,
      marca: { ...marca, nombre: 'Valle "X" <SpA>' },
    });
    expect(html).not.toContain('<SpA>');
    expect(html).toContain('&lt;SpA&gt;');
  });
});

describe('la audiencia "Todos los clientes" es el filtro vacío', () => {
  it('filtro {} = todo cliente con correo, sin condiciones', () => {
    const clientes = [
      { id: 1, name: 'Ana', email: 'ana@x.cl', client_type: 'Empresa' },
      { id: 2, name: 'Beto', email: null, client_type: 'Particular' },
      { id: 3, name: 'Carla', email: 'carla@x.cl', client_type: null },
    ];
    const r = resolverSegmento(clientes, [], [], {}, '2026-08-25');
    expect(r.map((d) => d.email)).toEqual(['ana@x.cl', 'carla@x.cl']);
  });
});

describe('formato WhatsApp en el cuerpo: *negrita* y _cursiva_ (26-08)', () => {
  it('traduce los delimitadores al formato del correo', () => {
    const html = cuerpoAHtml('Ven al *paseo del curso* y _no te lo pierdas_');
    expect(html).toContain('<strong>paseo del curso</strong>');
    expect(html).toContain('<em>no te lo pierdas</em>');
  });

  it('deja en paz correos con guion bajo y multiplicaciones', () => {
    const html = cuerpoAHtml('Escribe a juan_perez@gmail.com: 2 * 3 * 4');
    expect(html).not.toContain('<em>');
    expect(html).not.toContain('<strong>');
    expect(html).toContain('juan_perez@gmail.com');
  });

  it('escapa el HTML ANTES de formatear: nada inyectable', () => {
    const html = cuerpoAHtml('*<script>alert(1)</script>*');
    expect(html).not.toContain('<script>');
    expect(html).toContain('<strong>&lt;script&gt;');
  });

  it('negrita y cursiva conviven en la misma frase y por lineas', () => {
    const html = cuerpoAHtml('*hola _mundo_*\nsegunda linea');
    expect(html).toContain('<strong>hola <em>mundo</em></strong>');
    expect(html).toContain('<br/>');
  });
});
