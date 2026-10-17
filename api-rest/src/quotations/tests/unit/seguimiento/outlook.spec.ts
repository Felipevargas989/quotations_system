import { readFileSync } from 'fs';
import { join } from 'path';
import {
  aTexto,
  ErrorDeOutlook,
  formatear,
  limpiarHtml,
  OutlookDeLaCasa,
} from '../../../seguimiento/outlook';

// Outlook con Microsoft simulado: ni una llamada de verdad. Lo que se cuida
// (doc 18 §6): solo borradores, solo los buzones de la lista, nunca a la
// casa, y el secreto viaja solo al pedir el permiso.

type Llamada = { url: string; init: RequestInit };
type Respuesta = [RegExp, number, unknown];

const CONTACTO = 'contacto@valledelsolquillon.cl';
const PERMISO: Respuesta = [
  /^POST https:\/\/login\.microsoftonline\.com/,
  200,
  { access_token: 'permiso', expires_in: 3600 },
];

const armar = (respuestas: Respuesta[]) => {
  const llamadas: Llamada[] = [];
  const fetchFalso = jest.fn((url: string, init: RequestInit) => {
    llamadas.push({ url, init });
    const r = respuestas.find(([patron]) =>
      patron.test(`${String(init.method)} ${url}`),
    );
    if (!r) {
      return Promise.reject(
        new Error(`sin respuesta para ${String(init.method)} ${url}`),
      );
    }
    const [, status, cuerpo] = r;
    return Promise.resolve({
      ok: status >= 200 && status < 300,
      status,
      json: () => Promise.resolve(cuerpo),
      text: () => Promise.resolve(JSON.stringify(cuerpo)),
    } as unknown as Response);
  });
  const outlook = new OutlookDeLaCasa({
    secreto: 'secreto-de-prueba',
    inquilino: 'inquilino',
    aplicacion: 'aplicacion',
    buzones: [CONTACTO],
    empresa: 'Valle del Sol',
    fetch: fetchFalso as unknown as typeof fetch,
    ahora: () => Date.parse('2026-10-17T15:00:00Z'),
  });
  return { outlook, llamadas, fetchFalso };
};

/** El cuerpo de una llamada: en esta pieza siempre es texto. */
const textoDe = (l: Llamada | undefined): string =>
  typeof l?.init.body === 'string' ? l.init.body : '';

const cuerpoDe = (l: Llamada | undefined): Record<string, unknown> =>
  JSON.parse(textoDe(l) || '{}') as Record<string, unknown>;

describe('Outlook: solo borradores y solo los buzones de la lista', () => {
  it('el permiso se pide una vez, y el secreto viaja solo a Microsoft al pedirlo', async () => {
    const { outlook, llamadas } = armar([
      PERMISO,
      [/^GET .*\/messages\?\$search=/, 200, { value: [] }],
    ]);
    await outlook.buscar(CONTACTO, 'cliente@ejemplo.cl');
    await outlook.buscar(CONTACTO, 'otra@ejemplo.cl');
    const conSecreto = llamadas.filter((l) =>
      textoDe(l).includes('secreto-de-prueba'),
    );
    expect(conSecreto.map((l) => l.url)).toEqual([
      'https://login.microsoftonline.com/inquilino/oauth2/v2.0/token',
    ]);
    expect(llamadas).toHaveLength(3);
  });

  it('un buzón fuera de la lista se rechaza sin llamar a Microsoft', async () => {
    const { outlook, fetchFalso } = armar([PERMISO]);
    await expect(
      outlook.buscar('gerencia@valledelsolquillon.cl', 'cliente@ejemplo.cl'),
    ).rejects.toBeInstanceOf(ErrorDeOutlook);
    expect(fetchFalso).not.toHaveBeenCalled();
  });

  it('buscar: del más nuevo al más viejo, y quién escribió en minúsculas', async () => {
    const { outlook, llamadas } = armar([
      PERMISO,
      [
        /^GET .*\/messages\?\$search=/,
        200,
        {
          value: [
            {
              id: 'a',
              conversationId: 'h',
              from: { emailAddress: { address: 'Cliente@Ejemplo.cl' } },
              receivedDateTime: '2026-10-10T10:00:00Z',
            },
            {
              id: 'b',
              conversationId: 'h',
              from: { emailAddress: { address: 'hola@eventi-app.com' } },
              receivedDateTime: '2026-10-12T10:00:00Z',
              isDraft: false,
            },
          ],
        },
      ],
    ]);
    const r = await outlook.buscar(CONTACTO, 'cliente@ejemplo.cl');
    expect(r.map((m) => m.id)).toEqual(['b', 'a']);
    expect(r[1].de).toBe('cliente@ejemplo.cl');
    expect(decodeURIComponent(llamadas[1].url)).toContain(
      '"participants:cliente@ejemplo.cl"',
    );
  });

  it('seguimiento: responde sobre el mensaje pero se dirige al cliente, con el aviso ámbar arriba', async () => {
    const { outlook, llamadas } = armar([
      PERMISO,
      [
        /^POST .*\/messages\/m1\/createReply$/,
        201,
        { id: 'borr1', body: { content: '<div>el original</div>' } },
      ],
      [
        /^PATCH .*\/messages\/borr1$/,
        200,
        {
          id: 'borr1',
          webLink: 'https://outlook.office.com/borr1',
          subject: 'RE: Cotización',
          toRecipients: [{ emailAddress: { address: 'cliente@ejemplo.cl' } }],
        },
      ],
    ]);
    const b = await outlook.borradorDeSeguimiento(
      CONTACTO,
      'm1',
      '<p>¿Cómo está?</p>',
      'cliente@ejemplo.cl',
      ['jefa@ejemplo.cl'],
    );
    const patch = cuerpoDe(llamadas.find((l) => l.init.method === 'PATCH'));
    expect(patch.toRecipients).toEqual([
      { emailAddress: { address: 'cliente@ejemplo.cl' } },
    ]);
    expect(patch.ccRecipients).toEqual([
      { emailAddress: { address: 'jefa@ejemplo.cl' } },
    ]);
    const html = (patch.body as { content: string }).content;
    expect(html).toMatch(
      /^<table[\s\S]*SEGUIMIENTO SUGERIDO[\s\S]*<div id="vds-sugerencia"[\s\S]*¿Cómo está\?[\s\S]*<div>el original<\/div>$/,
    );
    expect(b).toMatchObject({
      id: 'borr1',
      enlace: 'https://outlook.office.com/borr1',
      para: ['cliente@ejemplo.cl'],
    });
  });

  it('correo nuevo: queda en Borradores con su asunto', async () => {
    const { outlook, llamadas } = armar([
      PERMISO,
      [
        /^POST .*\/users\/[^/]+\/messages$/,
        201,
        { id: 'n1', subject: 'Cotización' },
      ],
    ]);
    await outlook.borradorNuevo(
      CONTACTO,
      '<p>Hola</p>',
      'cliente@ejemplo.cl',
      'Cotización Paseo: sábado 20-11',
    );
    const post = cuerpoDe(llamadas[1]);
    expect(post.subject).toBe('Cotización Paseo: sábado 20-11');
    expect(post.toRecipients).toEqual([
      { emailAddress: { address: 'cliente@ejemplo.cl' } },
    ]);
  });

  it('nunca le escribe a la casa', async () => {
    const { outlook } = armar([PERMISO]);
    await expect(
      outlook.borradorDeSeguimiento(
        CONTACTO,
        'm1',
        '<p>x</p>',
        'felipe@valledelsolquillon.cl',
        [],
      ),
    ).rejects.toThrow('Destinatario no válido');
    await expect(
      outlook.borradorNuevo(
        CONTACTO,
        '<p>x</p>',
        'hola@eventi-app.com',
        'Asunto',
      ),
    ).rejects.toThrow('Destinatario no válido');
  });

  it('no tiene cómo enviar, borrar ni mover', () => {
    const metodos = Object.getOwnPropertyNames(OutlookDeLaCasa.prototype);
    expect(
      metodos.filter((m) => /send|enviar|delete|eliminar|move|mover/i.test(m)),
    ).toEqual([]);
    const codigo = readFileSync(
      join(__dirname, '../../../seguimiento/outlook.ts'),
      'utf8',
    );
    expect(codigo).not.toMatch(/\/send\b|sendMail|'DELETE'|\/move\b/);
  });

  it('un error de Microsoft llega con su estado, sin la llave', async () => {
    const { outlook } = armar([
      [/^POST https:\/\/login/, 401, { error: 'invalid_client' }],
    ]);
    await expect(
      outlook.buscar(CONTACTO, 'cliente@ejemplo.cl'),
    ).rejects.toMatchObject({ status: 401 });
  });
});

describe('el texto que lee la IA y el que escribe', () => {
  it('el cuerpo de un correo como texto', () => {
    expect(aTexto('<p>Hola&nbsp;Camila</p><p>¿Cómo &amp; cuándo?</p>')).toBe(
      'Hola Camila\n¿Cómo & cuándo?',
    );
  });

  it('lo que escribe la IA no puede ejecutar nada', () => {
    expect(
      limpiarHtml('<p onclick="x()">Hola</p><script>alert(1)</script>'),
    ).toBe('<p>Hola</p>');
  });

  it('la letra de la casa en cada párrafo', () => {
    expect(formatear('<p>Hola</p>')).toContain(
      '<p style="margin:0 0 12pt 0;font-family:Aptos,Calibri,sans-serif;font-size:11pt;color:#000000">Hola</p>',
    );
  });
});
