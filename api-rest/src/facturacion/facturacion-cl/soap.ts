import {
  BadGatewayException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { mensajeDe } from 'src/logging/mensaje-de-error';
import {
  EnvioSinRespuesta,
  type FacturacionCl,
  type FoliosDisponibles,
  type RespuestaDeProcesar,
} from './facturacion-cl';

/**
 * FACTURACION.CL DE VERDAD, POR SU SERVICIO WEB (doc 19 §2, §5.3 y §9.18)
 *
 * El SOAP `wsplano.asmx` del manual «Integración mediante WebService». La
 * dirección es la misma para el ambiente de prueba y el de producción: lo
 * que cambia son las credenciales. Sin librerías: el sobre es corto.
 * - Cada dato de `logininfo` va en Base64, con `Puerto` en «0» (sin
 *   impresión automática). No se pide `IncluyeLink`: el enlace del PDF es
 *   público (L10) y Eventia trae su propia copia con `ObtenerPdf`.
 * - El archivo va en ISO-8859-1, como pide el manual del XML (L23), y en
 *   Base64, con `formato` 1 (TXT).
 * - `Procesar` nunca se reintenta: si se corta o no responde a tiempo, lanza
 *   `EnvioSinRespuesta` y el documento queda «por confirmar» (L5).
 * - Las respuestas se leen con tolerancia: los ejemplos del manual traen
 *   etiquetas mal cerradas, y la forma exacta de lo que no muestra
 *   (`ConsultarCAF`, `ObtenerPdf`) se confirma en el paso 0.
 * - Ni las credenciales ni el sobre van a un error o al registro.
 */

export const URL_DE_FACTURACION_CL =
  'https://wss.facturacion.cl/WSDS/wsplano.asmx';
const ESPACIO = 'http://tempuri.org';

export interface CredencialesDeFacturacionCl {
  usuario: string;
  /** El RUT de la empresa que emite, como lo entrega facturacion.cl. */
  rut: string;
  clave: string;
}

interface DondeLlamar {
  url?: string;
  /** Solo para las pruebas. */
  fetch?: typeof fetch;
}

export interface OpcionesDelSoap extends DondeLlamar {
  ambiente: 'prueba' | 'produccion';
  credenciales: CredencialesDeFacturacionCl;
  /** Cuánto se espera a `Procesar` antes de darlo por cortado (ms). */
  esperaAlProcesar?: number;
  /** Cuánto se espera a lo demás (ms). */
  espera?: number;
}

const base64 = (texto: string) => Buffer.from(texto, 'utf8').toString('base64');

const desescapar = (texto: string) =>
  texto
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) =>
      String.fromCodePoint(parseInt(h, 16)),
    )
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');

/** El sobre SOAP 1.1 de un método (`elementFormDefault` calificado). */
export const sobreSoap = (metodo: string, cuerpo: string): string =>
  '<?xml version="1.0" encoding="utf-8"?>' +
  '<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">' +
  `<soap:Body><${metodo} xmlns="${ESPACIO}">${cuerpo}</${metodo}></soap:Body></soap:Envelope>`;

/** La primera etiqueta con ese nombre (con o sin prefijo, sin importar
 *  mayúsculas): lo de adentro y si venía bien cerrada. */
const buscar = (
  xml: string,
  etiqueta: string,
): { adentro: string; cerrada: boolean } | null => {
  const abre = new RegExp(
    `<(?:[\\w-]+:)?${etiqueta}(?:\\s[^>]*?)?(/?)>`,
    'i',
  ).exec(xml);
  if (!abre) return null;
  if (abre[1] === '/') return { adentro: '', cerrada: true };
  const resto = xml.slice(abre.index + abre[0].length);
  const cierra = new RegExp(`</(?:[\\w-]+:)?${etiqueta}\\s*>`, 'i').exec(resto);
  return cierra
    ? { adentro: resto.slice(0, cierra.index), cerrada: true }
    : { adentro: resto, cerrada: false };
};

/** El XML de adentro de un bloque (`<Documento>…</Documento>`). */
export const bloqueDe = (xml: string, etiqueta: string): string | null =>
  buscar(xml, etiqueta)?.adentro ?? null;

/** El texto de una etiqueta. Si viene mal cerrada (el manual trae
 *  «<Resultado>True<Resultado>»), hasta la etiqueta que sigue. */
export const valorDe = (xml: string, etiqueta: string): string | null => {
  const b = buscar(xml, etiqueta);
  if (!b) return null;
  return desescapar(b.cerrada ? b.adentro : b.adentro.split('<')[0]).trim();
};

/** Lo que devolvió el método (`<MetodoResult>`): facturacion.cl manda su
 *  XML como texto, así que llega escapado. */
export const resultadoDe = (sobre: string, metodo: string): string | null => {
  const b = bloqueDe(sobre, `${metodo}Result`);
  return b == null ? null : desescapar(b).trim();
};

/** La falla SOAP (HTTP 500), si la hay. */
export const fallaDe = (
  sobre: string,
): { codigo: string; mensaje: string } | null => {
  const falla = bloqueDe(sobre, 'Fault');
  if (falla == null) return null;
  return {
    codigo: valorDe(falla, 'faultcode') ?? '',
    mensaje: valorDe(falla, 'faultstring') ?? '',
  };
};

/** AAAA-MM-DD, venga como venga («2008-09-12T15:55:09» o «12-09-2008»). */
const fechaDe = (texto: string | null): string | null => {
  if (!texto) return null;
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(texto);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const chilena = /^(\d{2})[-/](\d{2})[-/](\d{4})/.exec(texto);
  return chilena ? `${chilena[3]}-${chilena[2]}-${chilena[1]}` : null;
};

/** Los enlaces del PDF vienen en Base64. */
const enlaceDe = (texto: string | null): string | null => {
  if (!texto) return null;
  const decodificado = Buffer.from(texto, 'base64').toString('utf8');
  return /^https?:\/\//i.test(decodificado) ? decodificado : texto;
};

const rechazo = (
  tipo: number,
  folio: number | null,
  mensaje: string,
  crudo: unknown,
): RespuestaDeProcesar => ({
  resultado: 'rechazado',
  tipo,
  folio,
  fecha: null,
  mensaje,
  urlOriginal: null,
  urlCedible: null,
  crudo,
});

/**
 * Lee la respuesta de `Procesar` (`<WSPLANO>`). El `Resultado` de afuera
 * dice si se leyó el envío; el de `Documento`, si el documento salió (el
 * manual: afuera «True» y adentro «False» con el error del folio repetido).
 * null = no se sabe si salió: dijo que sí sin el folio, o ni sí ni no.
 */
export const leerProcesar = (
  xml: string,
  tipo: number,
): RespuestaDeProcesar | null => {
  const crudo = { xml };
  const documento = bloqueDe(xml, 'Documento');
  const afuera = documento ? xml.replace(documento, '') : xml;
  const general = (valorDe(afuera, 'Resultado') ?? '').toLowerCase();
  const mensaje = valorDe(afuera, 'Mensaje') ?? '';
  if (documento == null)
    return general === 'false'
      ? rechazo(tipo, null, mensaje || 'facturacion.cl no lo aceptó', crudo)
      : null;

  const folio = Number(valorDe(documento, 'Folio'));
  const conFolio = Number.isInteger(folio) && folio > 0 ? folio : null;
  const tipoDte = Number(valorDe(documento, 'TipoDte')) || tipo;
  const resultado = (valorDe(documento, 'Resultado') ?? '').toLowerCase();
  if (resultado === 'true' && conFolio)
    return {
      resultado: 'emitido',
      tipo: tipoDte,
      folio: conFolio,
      fecha: fechaDe(valorDe(documento, 'Fecha')),
      mensaje: mensaje || 'Documento procesado',
      urlOriginal: enlaceDe(valorDe(documento, 'urlOriginal')),
      urlCedible: enlaceDe(valorDe(documento, 'urlCedible')),
      crudo,
    };
  if (resultado === 'false')
    return rechazo(
      tipoDte,
      conFolio,
      valorDe(documento, 'Error') || mensaje || 'facturacion.cl no lo aceptó',
      crudo,
    );
  return null;
};

/**
 * Lee `ConsultarCAF`, un `<CAF>` por cada rango cargado: idcaf, tipodte,
 * fecha, fechavencimiento, el rango, cantidad y foliosiguiente. El manual
 * nombra el rango `foliodesde`/`foliohasta`; el servicio de verdad (paso 0,
 * 06-11) responde `rangodesde`/`rangohasta`, con las fechas en DD-MM-AAAA
 * y «NO APLICA» de vencimiento en las boletas: se leen las dos formas.
 *
 * Vale el primer rango **en el orden en que los lista facturacion.cl** que
 * todavía tiene folios (los agotados traen el siguiente fuera del rango);
 * los que siguen suman a los libres. Medido el 06-11: con dos rangos con
 * folios, facturacion.cl usa el primero de la lista. La boleta salió con el
 * siguiente del primero, y la factura con el siguiente del segundo (un
 * rango más bajo) fue rechazada: «fuera del rango que tiene autorizado».
 * Por eso no se ordenan por número.
 */
export const leerFolios = (
  xml: string,
  tipo: number,
): FoliosDisponibles | null => {
  const cafs = [
    ...xml.matchAll(/<(?:[\w-]+:)?CAF\s*>([\s\S]*?)<\/(?:[\w-]+:)?CAF\s*>/gi),
  ].map((m) => m[1]);
  // Lo que no viene no es un 0: queda NaN y el rango no vale.
  const uno = (bloque: string, ...etiquetas: string[]) => {
    for (const e of etiquetas) {
      const v = valorDe(bloque, e);
      if (v != null && v !== '') return v;
    }
    return null;
  };
  const numero = (v: string | null) => (v == null ? NaN : Number(v));
  const rangos = (cafs.length ? cafs : [xml])
    .map((b) => ({
      siguiente: numero(uno(b, 'foliosiguiente')),
      desde: numero(uno(b, 'rangodesde', 'foliodesde')),
      hasta: numero(uno(b, 'rangohasta', 'foliohasta')),
      vence: fechaDe(uno(b, 'fechavencimiento')),
    }))
    .filter(
      (r) =>
        [r.siguiente, r.desde, r.hasta].every(Number.isInteger) &&
        r.siguiente >= r.desde &&
        r.siguiente <= r.hasta,
    );
  if (!rangos.length) return null;
  const [actual] = rangos;
  return {
    tipo,
    siguiente: actual.siguiente,
    hasta: actual.hasta,
    libres: rangos.reduce((s, r) => s + r.hasta - r.siguiente + 1, 0),
    vence: actual.vence,
  };
};

/** El PDF de `ObtenerPdf` (`pdfbase64` = 1): el texto en Base64 que,
 *  decodificado, empieza con «%PDF». Si viene envuelto en otro XML en
 *  Base64, se mira adentro. */
export const leerPdf = (xml: string, nivel = 0): Buffer | null => {
  const textos = [
    xml,
    ...[...xml.matchAll(/>([^<]{100,})</g)].map((m) => m[1]),
  ];
  for (const t of textos) {
    const limpio = desescapar(t).replace(/\s+/g, '');
    if (limpio.length < 100 || !/^[A-Za-z0-9+/]+={0,2}$/.test(limpio)) continue;
    const bytes = Buffer.from(limpio, 'base64');
    if (bytes.subarray(0, 5).toString('latin1') === '%PDF-') return bytes;
    const adentro = bytes.toString('latin1');
    if (nivel < 2 && adentro.trimStart().startsWith('<')) {
      const pdf = leerPdf(adentro, nivel + 1);
      if (pdf) return pdf;
    }
  }
  return null;
};

class SinRespuesta extends Error {}

class FallaSoap extends Error {
  constructor(
    readonly codigo: string,
    mensaje: string,
  ) {
    super(mensaje);
  }
}

/** Una llamada al servicio. Lanza `SinRespuesta` si no hubo respuesta
 *  (corte, tiempo, HTTP raro) y `FallaSoap` si el servicio dijo que no. */
async function llamarSoap(
  donde: DondeLlamar,
  metodo: string,
  cuerpo: string,
  espera: number,
): Promise<string | null> {
  const control = new AbortController();
  const reloj = setTimeout(() => control.abort(), espera);
  try {
    const res = await (donde.fetch ?? fetch)(
      donde.url ?? URL_DE_FACTURACION_CL,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'text/xml; charset=utf-8',
          SOAPAction: `"${ESPACIO}/${metodo}"`,
        },
        body: sobreSoap(metodo, cuerpo),
        signal: control.signal,
      },
    );
    const texto = await res.text();
    const falla = fallaDe(texto);
    if (falla)
      throw new FallaSoap(falla.codigo, falla.mensaje || `HTTP ${res.status}`);
    if (!res.ok)
      throw new SinRespuesta(`facturacion.cl respondió HTTP ${res.status}`);
    return resultadoDe(texto, metodo);
  } catch (error) {
    if (error instanceof FallaSoap || error instanceof SinRespuesta)
      throw error;
    if (control.signal.aborted)
      throw new SinRespuesta(
        `facturacion.cl no respondió en ${Math.round(espera / 1000)} segundos`,
      );
    const causa = (error as { cause?: { code?: string } })?.cause?.code;
    throw new SinRespuesta(
      `No se pudo hablar con facturacion.cl (${causa ?? mensajeDe(error)})`,
    );
  } finally {
    clearTimeout(reloj);
  }
}

/**
 * ¿Responde facturacion.cl desde este motor? `Online` y `Version` no piden
 * credenciales: sirven para medir antes de tenerlas (paso 0).
 */
export async function pulsoDeFacturacionCl(donde: DondeLlamar = {}): Promise<{
  en_linea: boolean;
  version: string | null;
  ms: number;
  error: string | null;
}> {
  const inicio = Date.now();
  try {
    const online = await llamarSoap(donde, 'Online', '', 10_000);
    const version = await llamarSoap(donde, 'Version', '', 10_000);
    return {
      en_linea: /Online=1/.test(online ?? ''),
      version: version || null,
      ms: Date.now() - inicio,
      error: null,
    };
  } catch (error) {
    return {
      en_linea: false,
      version: null,
      ms: Date.now() - inicio,
      error: mensajeDe(error),
    };
  }
}

export class FacturacionClSoap implements FacturacionCl {
  readonly ambiente: 'prueba' | 'produccion';

  constructor(private readonly opciones: OpcionesDelSoap) {
    this.ambiente = opciones.ambiente;
  }

  async enLinea(): Promise<boolean> {
    try {
      return /Online=1/.test(
        (await llamarSoap(this.opciones, 'Online', '', 10_000)) ?? '',
      );
    } catch {
      return false;
    }
  }

  async folios(tipo: number): Promise<FoliosDisponibles | null> {
    return (await this.consultarCaf(tipo)).folios;
  }

  /** Para «Probar la conexión»: los folios, y si no hay, lo que respondió
   *  facturacion.cl (el paso 0, 06-11: sin eso no se sabe si faltan los
   *  folios o la respuesta trae otra forma). */
  async foliosYLoQueDijo(tipo: number) {
    return this.consultarCaf(tipo);
  }

  async folioSiguiente(tipo: number): Promise<number> {
    const { folios, mensaje } = await this.consultarCaf(tipo);
    if (!folios)
      throw new BadGatewayException(
        `facturacion.cl no tiene folios disponibles del tipo ${tipo}${mensaje ? ` («${mensaje}»)` : ''}: hay que cargarlos en su plataforma`,
      );
    return folios.siguiente;
  }

  async procesar(archivo: string, tipo: number): Promise<RespuestaDeProcesar> {
    // Los armadores ya los quitan (texto.ts): esto es el último resguardo,
    // ANTES de mandar, así que no queda nada por confirmar.
    const raros = [
      ...new Set(
        Array.from(archivo).filter((c) => (c.codePointAt(0) ?? 0) > 0xff),
      ),
    ];
    if (raros.length)
      return rechazo(
        tipo,
        null,
        `El archivo trae caracteres que facturacion.cl no lee (${raros.join(' ')}): no se mandó`,
        null,
      );
    const cuerpo =
      this.login() +
      `<file>${Buffer.from(archivo, 'latin1').toString('base64')}</file>` +
      '<formato>1</formato>';

    let xml: string | null;
    try {
      xml = await llamarSoap(
        this.opciones,
        'Procesar',
        cuerpo,
        this.opciones.esperaAlProcesar ?? 60_000,
      );
    } catch (error) {
      // soap:Client = el servicio no leyó el pedido: no se procesó nada.
      if (error instanceof FallaSoap && /client/i.test(error.codigo))
        return rechazo(
          tipo,
          null,
          `facturacion.cl no entendió el envío: ${error.message}`,
          null,
        );
      throw new EnvioSinRespuesta(
        `${mensajeDe(error)}: puede haber salido, queda por confirmar`,
      );
    }
    const respuesta = xml ? leerProcesar(xml, tipo) : null;
    if (!respuesta)
      throw new EnvioSinRespuesta(
        `facturacion.cl respondió sin decir el folio${xml ? ` («${xml.slice(0, 200)}»)` : ''}: puede haber salido, queda por confirmar`,
      );
    return respuesta;
  }

  async obtenerPdf(tipo: number, folio: number): Promise<Buffer | null> {
    const cuerpo =
      this.login() +
      `<tpomov>${base64(tipo === 39 || tipo === 41 ? 'B' : 'V')}</tpomov>` +
      `<folio>${base64(String(folio))}</folio>` +
      `<tipo>${base64(String(tipo))}</tipo>` +
      `<cedible>${base64('False')}</cedible>` +
      '<pdfbase64>1</pdfbase64>';
    const xml = await this.consultar('ObtenerPdf', cuerpo);
    return xml ? leerPdf(xml) : null;
  }

  private async consultarCaf(tipo: number) {
    const xml =
      (await this.consultar(
        'ConsultarCAF',
        `${this.login()}<tipoDTE>${base64(String(tipo))}</tipoDTE>`,
      )) ?? '';
    const folios = leerFolios(xml, tipo);
    return {
      folios,
      // Lo que dijo si no hay folios (las credenciales, por ejemplo); si no
      // trae «Mensaje», el comienzo de lo que respondió. Es la respuesta:
      // nunca lleva las credenciales.
      mensaje:
        valorDe(xml, 'Mensaje') ??
        (folios ? null : xml.replace(/\s+/g, ' ').trim().slice(0, 300) || null),
    };
  }

  /** Todo lo que no es `Procesar`: si no responde, se dice y no pasa nada. */
  private async consultar(metodo: string, cuerpo: string) {
    try {
      return await llamarSoap(
        this.opciones,
        metodo,
        cuerpo,
        this.opciones.espera ?? 20_000,
      );
    } catch (error) {
      throw new ServiceUnavailableException(
        `facturacion.cl no responde: ${mensajeDe(error)}`,
      );
    }
  }

  private login(): string {
    const { usuario, rut, clave } = this.opciones.credenciales;
    return (
      '<login>' +
      `<Usuario>${base64(usuario)}</Usuario>` +
      `<Rut>${base64(rut.replace(/[.\s]/g, ''))}</Rut>` +
      `<Clave>${base64(clave)}</Clave>` +
      `<Puerto>${base64('0')}</Puerto>` +
      '</login>'
    );
  }
}
