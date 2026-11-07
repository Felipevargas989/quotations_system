import {
  BadGatewayException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { armarFactura } from '../archivo/factura';
import { EnvioSinRespuesta } from '../facturacion-cl/facturacion-cl';
import {
  FacturacionClSoap,
  leerFolios,
  leerPdf,
  leerProcesar,
  pulsoDeFacturacionCl,
  rangosDeLosFolios,
} from '../facturacion-cl/soap';

/**
 * FACTURACION.CL DE VERDAD (doc 19 §9.18, paso 5): el sobre SOAP, las
 * credenciales en Base64, el archivo en latin-1 y la lectura tolerante de
 * las respuestas. Las respuestas de `Online`, `Version` y de una falla se
 * copiaron del servicio en vivo (05-11-2026); las de `Procesar`, del manual.
 */

const CREDENCIALES = {
  usuario: 'integrador',
  rut: '77.701.305-K',
  clave: 'clave-de-prueba',
};

const b64 = (s: string) => Buffer.from(s, 'utf8').toString('base64');

/** Envuelve lo que devuelve un método como lo hace el servicio: su XML va
 *  escapado dentro de `<MetodoResult>`. */
const sobre = (metodo: string, resultado: string) =>
  '<?xml version="1.0" encoding="utf-8"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body>' +
  `<${metodo}Response xmlns="http://tempuri.org"><${metodo}Result>${resultado
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(
      />/g,
      '&gt;',
    )}</${metodo}Result></${metodo}Response></soap:Body></soap:Envelope>`;

const falla = (codigo: string, mensaje: string) =>
  `<?xml version="1.0" encoding="utf-8"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><soap:Fault><faultcode>${codigo}</faultcode><faultstring>${mensaje}</faultstring><detail /></soap:Fault></soap:Body></soap:Envelope>`;

type Llamada = { url: string; accion: string; cuerpo: string };

/** Un fetch de mentira: anota cada llamada y responde lo que se le diga. */
const servicio = (
  responder: (metodo: string) => { status?: number; texto: string },
) => {
  const llamadas: Llamada[] = [];
  const fetchFalso = jest.fn((url: string, init: RequestInit) => {
    const accion = String((init.headers as Record<string, string>).SOAPAction);
    const metodo = accion.replace(/^"http:\/\/tempuri\.org\/|"$/g, '');
    llamadas.push({ url, accion, cuerpo: init.body as string });
    const { status = 200, texto } = responder(metodo);
    return Promise.resolve(new Response(texto, { status }));
  });
  const soap = new FacturacionClSoap({
    ambiente: 'prueba',
    credenciales: CREDENCIALES,
    fetch: fetchFalso as unknown as typeof fetch,
  });
  return { soap, llamadas, fetchFalso };
};

const valorEnElCuerpo = (cuerpo: string, etiqueta: string) =>
  new RegExp(`<${etiqueta}>([^<]*)</${etiqueta}>`).exec(cuerpo)?.[1] ?? null;

const archivoDeCabana = () => {
  const armado = armarFactura({
    tipo: 33,
    folio: 375,
    fecha: '2026-11-05',
    receptor: {
      rut: '65.175.242-6',
      razon_social: 'Corporación Centro de Formación Técnica Santo Tomás',
      giro: 'Educación',
      direccion: 'Calle 18 de Septiembre N° 250',
      comuna: 'Quillón',
    },
    lineas: [
      { descripcion: 'Cabaña 4 con desayuno', cantidad: 1, precio: 84034 },
    ],
  });
  if (!armado.ok) throw new Error(armado.problemas.join(' | '));
  return armado.archivo;
};

const EMITIDA = `<WSPLANO><Resultado>True</Resultado><Mensaje>Proceso existoso.</Mensaje><Detalle><Documento><Folio>375</Folio><TipoDte>33</TipoDte><Operacion>VENTA</Operacion><Fecha>2026-11-05T15:55:09</Fecha><Resultado>True</Resultado><urlOriginal></urlOriginal><urlCedible></urlCedible></Documento></Detalle></WSPLANO>`;

describe('el sobre que se manda', () => {
  it('Procesar: la acción, las credenciales en Base64 y el archivo en latin-1', async () => {
    const { soap, llamadas } = servicio(() => ({
      texto: sobre('Procesar', EMITIDA),
    }));
    const archivo = archivoDeCabana();
    await soap.procesar(archivo, 33);

    const [l] = llamadas;
    expect(l.url).toBe('https://wss.facturacion.cl/WSDS/wsplano.asmx');
    expect(l.accion).toBe('"http://tempuri.org/Procesar"');
    expect(l.cuerpo).toContain('<Procesar xmlns="http://tempuri.org">');
    expect(valorEnElCuerpo(l.cuerpo, 'Usuario')).toBe(b64('integrador'));
    // El RUT sin puntos, como el ejemplo del manual («1-9»).
    expect(valorEnElCuerpo(l.cuerpo, 'Rut')).toBe(b64('77701305-K'));
    expect(valorEnElCuerpo(l.cuerpo, 'Clave')).toBe(b64('clave-de-prueba'));
    expect(valorEnElCuerpo(l.cuerpo, 'Puerto')).toBe(b64('0'));
    expect(l.cuerpo).not.toContain('IncluyeLink');
    expect(valorEnElCuerpo(l.cuerpo, 'formato')).toBe('1');
    // La clave nunca viaja a la vista: solo en Base64 dentro del sobre.
    expect(l.cuerpo).not.toContain('clave-de-prueba');

    const bytes = Buffer.from(
      valorEnElCuerpo(l.cuerpo, 'file') ?? '',
      'base64',
    );
    expect(bytes.toString('latin1')).toBe(archivo);
    // «ñ» y «ó» van en un solo byte (latin-1), no en dos (UTF-8).
    expect(bytes.includes(Buffer.from([0xf1]))).toBe(true);
    expect(bytes.includes(Buffer.from('ñ', 'utf8'))).toBe(false);
  });

  it('ConsultarCAF y ObtenerPdf piden el tipo (y el movimiento) en Base64', async () => {
    const { soap, llamadas } = servicio((metodo) =>
      metodo === 'ConsultarCAF'
        ? {
            texto: sobre(
              'ConsultarCAF',
              '<CAF><idcaf>9</idcaf><tipodte>39</tipodte><foliodesde>1</foliodesde><foliohasta>500</foliohasta><foliosiguiente>12</foliosiguiente></CAF>',
            ),
          }
        : {
            texto: sobre(
              'ObtenerPdf',
              '<WSPLANO><Mensaje></Mensaje></WSPLANO>',
            ),
          },
    );
    await soap.folioSiguiente(39);
    await soap.obtenerPdf(39, 12);
    expect(valorEnElCuerpo(llamadas[0].cuerpo, 'tipoDTE')).toBe(b64('39'));
    expect(valorEnElCuerpo(llamadas[1].cuerpo, 'tpomov')).toBe(b64('B'));
    expect(valorEnElCuerpo(llamadas[1].cuerpo, 'folio')).toBe(b64('12'));
    expect(valorEnElCuerpo(llamadas[1].cuerpo, 'cedible')).toBe(b64('False'));
    expect(valorEnElCuerpo(llamadas[1].cuerpo, 'pdfbase64')).toBe('1');
  });

  it('un carácter fuera de latin-1 no sale: rechazado, sin llamar a nadie', async () => {
    const { soap, fetchFalso } = servicio(() => ({ texto: '' }));
    const r = await soap.procesar(`${archivoDeCabana()}🎉`, 33);
    expect(r.resultado).toBe('rechazado');
    expect(r.mensaje).toContain('no se mandó');
    expect(fetchFalso).not.toHaveBeenCalled();
  });
});

describe('la respuesta de Procesar', () => {
  it('emitida: el folio y la fecha en AAAA-MM-DD', async () => {
    const { soap } = servicio(() => ({ texto: sobre('Procesar', EMITIDA) }));
    expect(await soap.procesar(archivoDeCabana(), 33)).toMatchObject({
      resultado: 'emitido',
      tipo: 33,
      folio: 375,
      fecha: '2026-11-05',
      urlOriginal: null,
    });
  });

  it('el ejemplo del manual, con sus etiquetas mal cerradas: el folio repetido (L3)', () => {
    const delManual = `<WSPLANO>
 <Resultado>True<Resultado>
 <Mensaje>Proceso existoso.<Mensaje>
 <Detalle>
 <Documento>
 <Folio>126<Folio>
 <TipoDte>33</TipoDte>
 <Operacion>VENTA</Operacion>
 <Fecha>2008-09-12T15:55:09</Fecha>
 <Resultado>False</Resultado>
 <Error>ERROR: P0001: Ya existe el Documento
 del TipoDTE = 33 con Folio = 126
 </Error>
 <Documento>
 <Detalle>
 </WSPLANO>`;
    const r = leerProcesar(delManual, 33);
    expect(r).toMatchObject({ resultado: 'rechazado', tipo: 33, folio: 126 });
    // emision.ts reconoce el folio repetido por este texto.
    expect(r?.mensaje).toMatch(/ya existe el documento/i);
  });

  it('sin documento y con «False» afuera (las credenciales, por ejemplo): rechazado', () => {
    expect(
      leerProcesar(
        '<WSPLANO><Resultado>False</Resultado><Mensaje>Usuario no autorizado</Mensaje></WSPLANO>',
        33,
      ),
    ).toMatchObject({
      resultado: 'rechazado',
      mensaje: 'Usuario no autorizado',
    });
  });

  it('«True» sin el folio: no se sabe si salió, queda por confirmar (L5)', async () => {
    const { soap } = servicio(() => ({
      texto: sobre(
        'Procesar',
        '<WSPLANO><Resultado>True</Resultado><Mensaje>Proceso existoso.</Mensaje></WSPLANO>',
      ),
    }));
    await expect(soap.procesar(archivoDeCabana(), 33)).rejects.toBeInstanceOf(
      EnvioSinRespuesta,
    );
  });

  it('la falla «soap:Client» (no leyó el pedido) es un rechazo: no se procesó nada', async () => {
    const { soap } = servicio(() => ({
      status: 500,
      texto: falla(
        'soap:Client',
        'Server did not recognize the value of HTTP Header {0}: {1}.',
      ),
    }));
    expect(await soap.procesar(archivoDeCabana(), 33)).toMatchObject({
      resultado: 'rechazado',
      mensaje: expect.stringContaining('no entendió el envío'),
    });
  });

  it('la falla del servidor, el corte y el tiempo: por confirmar, nunca un reintento', async () => {
    const delServidor = servicio(() => ({
      status: 500,
      texto: falla('soap:Server', 'Object reference not set'),
    }));
    await expect(
      delServidor.soap.procesar(archivoDeCabana(), 33),
    ).rejects.toBeInstanceOf(EnvioSinRespuesta);
    expect(delServidor.fetchFalso).toHaveBeenCalledTimes(1);

    const cortado = new FacturacionClSoap({
      ambiente: 'prueba',
      credenciales: CREDENCIALES,
      fetch: (() =>
        Promise.reject(
          Object.assign(new TypeError('fetch failed'), {
            cause: { code: 'ECONNRESET' },
          }),
        )) as unknown as typeof fetch,
    });
    const corte = await cortado
      .procesar(archivoDeCabana(), 33)
      .catch((e: unknown) => e);
    expect(corte).toBeInstanceOf(EnvioSinRespuesta);
    expect((corte as Error).message).toContain('ECONNRESET');
    expect((corte as Error).message).not.toContain('clave-de-prueba');

    const lento = new FacturacionClSoap({
      ambiente: 'prueba',
      credenciales: CREDENCIALES,
      esperaAlProcesar: 20,
      fetch: ((_: string, init: RequestInit) =>
        new Promise((_, rechazar) =>
          init.signal?.addEventListener('abort', () =>
            rechazar(new Error('aborted')),
          ),
        )) as unknown as typeof fetch,
    });
    await expect(lento.procesar(archivoDeCabana(), 33)).rejects.toThrow(
      /no respondió en 0 segundos.*por confirmar/,
    );
  });
});

describe('los folios (ConsultarCAF)', () => {
  it('vale el rango cargado primero que tiene folios (el agotado no); todos los que tienen folios suman a los libres', () => {
    expect(
      leerFolios(
        '<CAF><idcaf>1</idcaf><foliodesde>1</foliodesde><foliohasta>50</foliohasta><fechavencimiento>2027-05-01</fechavencimiento><foliosiguiente>51</foliosiguiente></CAF>' +
          '<CAF><idcaf>2</idcaf><foliodesde>51</foliodesde><foliohasta>100</foliohasta><fechavencimiento>2027-08-01</fechavencimiento><foliosiguiente>61</foliosiguiente></CAF>' +
          '<CAF><idcaf>3</idcaf><foliodesde>101</foliodesde><foliohasta>150</foliohasta><fechavencimiento>2027-09-01</fechavencimiento><foliosiguiente>101</foliosiguiente></CAF>',
        33,
      ),
    ).toEqual({
      tipo: 33,
      siguiente: 61,
      hasta: 100,
      libres: 40 + 50,
      vence: '2027-08-01',
    });
  });

  it('sin idcaf: el de siguiente más alto', () => {
    expect(
      leerFolios(
        '<CAF><rangodesde>1</rangodesde><rangohasta>50</rangohasta><foliosiguiente>7</foliosiguiente></CAF>' +
          '<CAF><rangodesde>51</rangodesde><rangohasta>100</rangohasta><foliosiguiente>60</foliosiguiente></CAF>',
        33,
      ),
    ).toMatchObject({ siguiente: 60 });
  });

  it('los descartados (facturacion.cl dijo «fuera del rango») no vuelven: toca el de otro rango', () => {
    const xml =
      '<CAF><idcaf>6</idcaf><rangodesde>293001</rangodesde><rangohasta>9999999999</rangohasta><foliosiguiente>9999839213</foliosiguiente></CAF>' +
      '<CAF><idcaf>66</idcaf><rangodesde>1</rangodesde><rangohasta>293000</rangohasta><foliosiguiente>292282</foliosiguiente></CAF>';
    expect(leerFolios(xml, 33)?.siguiente).toBe(9999839213);
    expect(leerFolios(xml, 33, [9999839213])?.siguiente).toBe(292282);
    expect(leerFolios(xml, 33, [9999839213, 292282])).toBeNull();
  });

  it('todos los rangos, como los lista facturacion.cl, para el registro de «Probar la conexión»', () => {
    expect(
      rangosDeLosFolios(
        '<CAF> <idcaf>72</idcaf> <tipodte>56</tipodte> <fecha>19-08-2100</fecha> <fechavencimiento>19-02-2101</fechavencimiento> <rangodesde>1</rangodesde> <rangohasta>292099</rangohasta> <cantidad>292099</cantidad> <foliosiguiente>292100</foliosiguiente> </CAF>',
      ),
    ).toEqual([
      {
        idcaf: '72',
        fecha: '19-08-2100',
        desde: 1,
        hasta: 292099,
        siguiente: 292100,
        vence: '2101-02-19',
      },
    ]);
  });

  it('la respuesta de verdad del ambiente de pruebas (06-11): rangodesde/rangohasta, DD-MM-AAAA y los rangos agotados', () => {
    const caf = (
      id: number,
      tipo: number,
      desde: number,
      hasta: number,
      siguiente: number,
      vence = '19-02-2101',
    ) =>
      `<CAF> <idcaf>${id}</idcaf> <tipodte>${tipo}</tipodte> <fecha>19-08-2100</fecha> <fechavencimiento>${vence}</fechavencimiento> <rangodesde>${desde}</rangodesde> <rangohasta>${hasta}</rangohasta> <cantidad>${hasta - desde + 1}</cantidad> <foliosiguiente>${siguiente}</foliosiguiente> </CAF>`;
    // La factura: el rango que va en el folio 9.999.839.213.
    expect(leerFolios(caf(6, 33, 293001, 9999999999, 9999839213), 33)).toEqual({
      tipo: 33,
      siguiente: 9999839213,
      hasta: 9999999999,
      libres: 160787,
      vence: '2101-02-19',
    });
    // Los rangos de la factura como los listó facturacion.cl: vale el 6, el
    // cargado primero. El siguiente del 67 (292.282) fue rechazado, «fuera
    // del rango que tiene autorizado».
    expect(
      leerFolios(
        caf(6, 33, 293001, 9999999999, 9999839213) +
          caf(66, 33, 1, 292099, 292100) +
          caf(67, 33, 292100, 293000, 292282),
        33,
      ),
    ).toEqual({
      tipo: 33,
      siguiente: 9999839213,
      hasta: 9999999999,
      libres: 160787 + 719,
      vence: '2101-02-19',
    });
    // La nota de débito: el 72 agotado, el 73 rechazado (292.104) y el 10,
    // cargado primero, salió (9.999.742.766).
    expect(
      leerFolios(
        caf(72, 56, 1, 292099, 292100) +
          caf(73, 56, 292100, 293000, 292104) +
          caf(10, 56, 293001, 9999999999, 9999742766),
        56,
      ),
    ).toMatchObject({ siguiente: 9999742766 });
    // El primer rango está agotado (el siguiente quedó
    // fuera), vale el que sigue.
    expect(
      leerFolios(
        caf(72, 56, 1, 292099, 292100) +
          caf(73, 56, 292100, 9999999999, 292150),
        56,
      ),
    ).toMatchObject({ siguiente: 292150 });
    // La boleta: «NO APLICA» de vencimiento, cinco rangos (tres agotados);
    // facturacion.cl le puso el siguiente del 59.
    expect(
      leerFolios(
        caf(59, 39, 746670, 9309980000, 9300006564, 'NO APLICA') +
          caf(84, 39, 1, 108004, 108005, 'NO APLICA') +
          caf(89, 39, 108575, 745793, 745794, 'NO APLICA') +
          caf(90, 39, 745794, 746669, 745814, 'NO APLICA') +
          caf(85, 39, 108005, 108574, 108575, 'NO APLICA'),
        39,
      ),
    ).toMatchObject({ siguiente: 9300006564, vence: null });
  });

  it('sin folios: dice lo que respondió facturacion.cl', async () => {
    const { soap } = servicio(() => ({
      texto: sobre(
        'ConsultarCAF',
        '<WSPLANO><Mensaje>No existen CAF vigentes</Mensaje></WSPLANO>',
      ),
    }));
    expect(await soap.folios(61)).toBeNull();
    const error = await soap.folioSiguiente(61).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(BadGatewayException);
    expect((error as Error).message).toContain('No existen CAF vigentes');
  });

  it('sin folios y sin «Mensaje»: dice el comienzo de lo que respondió (el paso 0)', async () => {
    const { soap } = servicio(() => ({
      texto: sobre(
        'ConsultarCAF',
        '<WSPLANO><Resultado>OK</Resultado></WSPLANO>',
      ),
    }));
    const r = await soap.foliosYLoQueDijo(33);
    expect(r.folios).toBeNull();
    expect(r.mensaje).toContain('<Resultado>OK</Resultado>');
  });

  it('si no responde, se dice y no se emite nada', async () => {
    const { soap } = servicio(() => ({ status: 502, texto: 'Bad Gateway' }));
    await expect(soap.folioSiguiente(33)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});

describe('el PDF (ObtenerPdf)', () => {
  const pdf = Buffer.from(`%PDF-1.4\n${'x'.repeat(300)}\n%%EOF`, 'latin1');

  it('el contenido en Base64, venga en la etiqueta que venga', async () => {
    const { soap } = servicio(() => ({
      texto: sobre(
        'ObtenerPdf',
        `<WSPLANO><Mensaje><Pdf>${pdf.toString('base64')}</Pdf></Mensaje></WSPLANO>`,
      ),
    }));
    expect((await soap.obtenerPdf(33, 375))?.equals(pdf)).toBe(true);
  });

  it('envuelto en otro XML en Base64, se mira adentro', () => {
    const envuelto = Buffer.from(
      `<Documento><PDF>${pdf.toString('base64')}</PDF></Documento>`,
      'latin1',
    ).toString('base64');
    expect(
      leerPdf(`<WSPLANO><Mensaje>${envuelto}</Mensaje></WSPLANO>`)?.equals(pdf),
    ).toBe(true);
  });

  it('todavía no está: null, y la pantalla dice «PDF en camino» (L10)', () => {
    expect(
      leerPdf('<WSPLANO><Mensaje>Documento no encontrado</Mensaje></WSPLANO>'),
    ).toBeNull();
  });
});

describe('el pulso del servicio (sin credenciales)', () => {
  it('Online y Version, como respondieron en vivo el 05-11', async () => {
    const vivo = (metodo: string) =>
      `<?xml version="1.0" encoding="utf-8"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema"><soap:Body><${metodo}Response xmlns="http://tempuri.org"><${metodo}Result>${metodo === 'Online' ? 'Online=1' : '1.2.8.3'}</${metodo}Result></${metodo}Response></soap:Body></soap:Envelope>`;
    const fetchFalso = ((_: string, init: RequestInit) =>
      Promise.resolve(
        new Response(
          vivo(
            String(
              (init.headers as Record<string, string>).SOAPAction,
            ).includes('Online')
              ? 'Online'
              : 'Version',
          ),
        ),
      )) as unknown as typeof fetch;
    expect(await pulsoDeFacturacionCl({ fetch: fetchFalso })).toMatchObject({
      en_linea: true,
      version: '1.2.8.3',
      error: null,
    });
    const soap = new FacturacionClSoap({
      ambiente: 'prueba',
      credenciales: CREDENCIALES,
      fetch: fetchFalso,
    });
    expect(await soap.enLinea()).toBe(true);
  });

  it('sin red: no está en línea, y lo dice', async () => {
    const sinRed = (() =>
      Promise.reject(
        Object.assign(new TypeError('fetch failed'), {
          cause: { code: 'ENOTFOUND' },
        }),
      )) as unknown as typeof fetch;
    expect(await pulsoDeFacturacionCl({ fetch: sinRed })).toMatchObject({
      en_linea: false,
      error: expect.stringContaining('ENOTFOUND'),
    });
  });
});
