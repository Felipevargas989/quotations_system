import { OutlookDeLaCasa } from '../../../seguimiento/outlook';

// El envío con BelIA (doc 20 §19) con Microsoft simulado: el correo listo
// va sin aviso ámbar y con la firma, nunca a la casa (salvo el ensayo del
// laboratorio, que se escribe a sí mismo), y se envía solo lo que existe.

type Llamada = { url: string; init: RequestInit };
const CONTACTO = 'contacto@valledelsolquillon.cl';
const FELIPE = 'felipe@valledelsolquillon.cl';

const armar = (buzones = [CONTACTO]) => {
  const llamadas: Llamada[] = [];
  const fetchFalso = jest.fn((url: string, init: RequestInit) => {
    llamadas.push({ url, init });
    const metodo = String(init.method);
    let cuerpo: unknown = {};
    if (url.includes('login.microsoftonline.com')) {
      cuerpo = { access_token: 'p', expires_in: 3600 };
    } else if (metodo === 'POST' && url.endsWith('/createReply')) {
      cuerpo = { id: 'borr', body: { content: '<hr>original' } };
    } else if (metodo === 'POST' && url.endsWith('/messages')) {
      cuerpo = { id: 'nuevo', webLink: 'https://x' };
    } else if (metodo === 'PATCH') {
      cuerpo = { id: 'borr', webLink: 'https://x' };
    }
    return Promise.resolve({
      ok: true,
      status: metodo === 'POST' && url.endsWith('/send') ? 202 : 200,
      json: () => Promise.resolve(cuerpo),
      text: () =>
        Promise.resolve(url.endsWith('/send') ? '' : JSON.stringify(cuerpo)),
    } as unknown as Response);
  });
  const outlook = new OutlookDeLaCasa({
    secreto: 's',
    inquilino: 'i',
    aplicacion: 'a',
    buzones,
    empresa: 'Valle del Sol',
    fetch: fetchFalso as unknown as typeof fetch,
  });
  return { outlook, llamadas };
};

const FIRMA = {
  html: '<div>Afectuosamente, Valle del Sol</div>',
  imagenes: [
    {
      name: 'logo.png',
      contentType: 'image/png',
      contentBytes: 'AAAA',
      contentId: 'cid1',
    },
  ],
};

const cuerpo = (l: Llamada) =>
  JSON.parse(typeof l.init.body === 'string' ? l.init.body : '{}') as Record<
    string,
    unknown
  >;

describe('el correo de la cotización, listo para salir', () => {
  it('en el hilo: responde dirigido al cliente, sin aviso ámbar, con la firma y su logo', async () => {
    const { outlook, llamadas } = armar();
    await outlook.borradorParaEnviar({
      buzon: CONTACTO,
      idMensaje: 'msg1',
      html: '<p>Hola Ana</p>',
      para: 'ana@cliente.cl',
      cc: ['jefa@cliente.cl'],
      asunto: '',
      firma: FIRMA,
    });
    const patch = llamadas.find((l) => l.init.method === 'PATCH')!;
    const b = cuerpo(patch) as {
      toRecipients: unknown;
      body: { content: string };
    };
    expect(JSON.stringify(b.toRecipients)).toContain('ana@cliente.cl');
    expect(b.body.content).toContain('Hola Ana');
    expect(b.body.content).toContain('Afectuosamente');
    expect(b.body.content).toContain('original');
    expect(b.body.content).not.toContain('SUGERIDO');
    const adjunto = llamadas.find((l) => l.url.endsWith('/attachments'))!;
    expect(cuerpo(adjunto)).toMatchObject({
      contentId: 'cid1',
      isInline: true,
    });
  });

  it('nunca a la casa', async () => {
    const { outlook } = armar();
    await expect(
      outlook.borradorParaEnviar({
        buzon: CONTACTO,
        idMensaje: null,
        html: '<p>x</p>',
        para: FELIPE,
        cc: [],
        asunto: 'Cotización',
        firma: FIRMA,
      }),
    ).rejects.toThrow('Destinatario no válido');
  });

  it('el ensayo del laboratorio va solo al mismo buzón, nunca a un cliente', async () => {
    const { outlook } = armar([FELIPE]);
    await expect(
      outlook.borradorParaEnviar({
        buzon: FELIPE,
        idMensaje: null,
        html: '<p>x</p>',
        para: 'ana@cliente.cl',
        cc: [],
        asunto: 'Cotización',
        firma: FIRMA,
        ensayo: true,
      }),
    ).rejects.toThrow('mismo buzón de ensayo');
    await expect(
      outlook.borradorParaEnviar({
        buzon: FELIPE,
        idMensaje: null,
        html: '<p>x</p>',
        para: FELIPE,
        cc: [],
        asunto: 'Cotización',
        firma: FIRMA,
        ensayo: true,
      }),
    ).resolves.toMatchObject({ id: 'nuevo' });
  });

  it('enviar y botar van al borrador de ese buzón; otro buzón no se toca', async () => {
    const { outlook, llamadas } = armar();
    await outlook.enviar(CONTACTO, 'b1');
    await outlook.botarBorrador(CONTACTO, 'b2');
    expect(
      llamadas
        .filter((l) => !l.url.includes('login'))
        .map((l) => `${String(l.init.method)} ${l.url.split('/v1.0')[1]}`),
    ).toEqual([
      'POST /users/contacto%40valledelsolquillon.cl/messages/b1/send',
      'DELETE /users/contacto%40valledelsolquillon.cl/messages/b2',
    ]);
    await expect(outlook.enviar(FELIPE, 'b1')).rejects.toThrow(
      'no está en la lista',
    );
  });
});
