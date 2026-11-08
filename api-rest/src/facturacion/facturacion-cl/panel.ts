import { mensajeDe } from 'src/logging/mensaje-de-error';
import {
  bloqueDe,
  desescapar,
  llamarSoap,
  valorDe,
  type CredencialesDeFacturacionCl,
  type DondeLlamar,
} from './soap';

/**
 * EL PANEL DTE RECIBIDOS DE FACTURACION.CL (doc 19 §9.25 y §9.30).
 *
 * Felipe, 08-11: *"a producción y luego con lo que falta"*. Lo que faltaba
 * de «Recibidos» era el paso 3 de §9.25: aceptar o reclamar una factura
 * recibida. Va por el «Panel DTE Recibidos» del «Manual WebService de
 * Compras», un servicio ASMX aparte del de emitir, con la misma entrada
 * (`logininfo`: usuario, RUT y clave en Base64). Medido el 08-11 en su
 * definición pública (`wspaneldte.asmx?wsdl`):
 *
 * - `ConsultaPanelDte(login, folio, tipo, rutproveedor)`: los documentos
 *   pendientes de acuse; sin filtros, todos. Responde un texto con
 *   `WSPLANO` → `Resultado`, `Mensaje` y un `Documento` por cada uno, con
 *   pares «"folio":"10052","tipodte":"33","rutproveedor":"90635000-9",
 *   "recepcionsii":"2019-08-07T17:15:19Z"».
 * - `Acuse(login, folio, tipo, rutproveedor, accion)`: `a` acepta y `r`
 *   rechaza (reclama). Responde verdadero o falso.
 *
 * Los parámetros que no son la entrada van tal cual, sin Base64 (el
 * ejemplo del manual).
 */

export const URL_DEL_PANEL = 'https://wss.facturacion.cl/WSDS/wspaneldte.asmx';

const base64 = (texto: string) => Buffer.from(texto, 'utf8').toString('base64');

/** Un documento del panel, pendiente de acuse. */
export interface PendienteDelPanel {
  folio: number;
  tipo: number;
  rut_emisor: string;
  recepcion_sii: string | null;
  total: number | null;
}

export interface RespuestaDelPanel {
  ok: boolean;
  mensaje: string | null;
  pendientes: PendienteDelPanel[];
}

/** Los pares «"clave":"valor"» de un documento del panel. */
const pares = (texto: string): Record<string, string> => {
  const r: Record<string, string> = {};
  for (const m of texto.matchAll(/"([\w]+)"\s*:\s*"([^"]*)"/g))
    r[m[1].toLowerCase()] = m[2].trim();
  return r;
};

const numero = (v: string | undefined) => {
  if (v == null || v === '') return null;
  const n = Number(v.replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};

/** Un pendiente desde sus pares, o nulo si le falta el folio, el tipo o el
 *  RUT. */
const pendienteDe = (p: Record<string, string>): PendienteDelPanel | null => {
  const folio = numero(p.folio);
  const tipo = numero(p.tipodte ?? p.tipo);
  const rut = (p.rutproveedor ?? p.rutemisor ?? '')
    .replace(/\./g, '')
    .toUpperCase();
  if (!folio || !tipo || !rut) return null;
  return {
    folio,
    tipo,
    rut_emisor: rut,
    recepcion_sii: p.recepcionsii || null,
    total: numero(p.montototal ?? p.monto ?? p.total),
  };
};

/**
 * La respuesta de `ConsultaPanelDte`, con tolerancia (como el resto).
 * Medido el 08-11 en el ambiente de prueba: llega una lista en JSON
 * («[{"folio":"…","tipodte":"33","rutproveedor":"…","recepcionsii":"…",
 * "montototal":"…","xml":"True"}]»), no el `WSPLANO` que muestra el manual;
 * se leen las dos.
 */
export const leerPanel = (texto: string): RespuestaDelPanel => {
  const limpio = desescapar(texto).trim();
  if (limpio.startsWith('[')) {
    try {
      const lista = JSON.parse(limpio) as unknown;
      if (Array.isArray(lista))
        return {
          ok: true,
          mensaje: null,
          pendientes: lista
            .map((d) =>
              d && typeof d === 'object'
                ? pendienteDe(
                    Object.fromEntries(
                      Object.entries(d as Record<string, unknown>).map(
                        ([k, v]) => [
                          k.toLowerCase(),
                          typeof v === 'string' || typeof v === 'number'
                            ? String(v).trim()
                            : '',
                        ],
                      ),
                    ),
                  )
                : null,
            )
            .filter((d): d is PendienteDelPanel => !!d),
        };
    } catch {
      // No era JSON: se mira como el manual.
    }
  }
  const resultado = valorDe(texto, 'Resultado');
  const mensaje = valorDe(texto, 'Mensaje');
  const detalle = bloqueDe(texto, 'Detalle') ?? '';
  const pendientes: PendienteDelPanel[] = [];
  for (const m of detalle.matchAll(
    /<(?:[\w-]+:)?Documento(?:\s[^>]*)?>([\s\S]*?)<\/(?:[\w-]+:)?Documento>/gi,
  )) {
    const pendiente = pendienteDe(pares(desescapar(m[1])));
    if (pendiente) pendientes.push(pendiente);
  }
  return {
    ok: resultado?.toLowerCase() === 'true',
    mensaje: mensaje || null,
    pendientes,
  };
};

/**
 * El cliente del panel. `pendientes` solo lee; `acuse` acepta o reclama de
 * verdad ante el SII: solo se llama desde «Aceptar» o «Reclamar», con la
 * confirmación del administrador. Ni las credenciales ni el sobre van a un
 * error.
 */
export class FacturacionClPanel {
  constructor(
    private readonly opciones: DondeLlamar & {
      credenciales: CredencialesDeFacturacionCl;
      espera?: number;
    },
  ) {}

  async pendientes(): Promise<RespuestaDelPanel> {
    const texto = await this.llamar(
      'ConsultaPanelDte',
      `${this.login()}<folio></folio><tipo></tipo><rutproveedor></rutproveedor>`,
    );
    const r = leerPanel(texto ?? '');
    // Si no dice «Resultado» ni «Mensaje», el comienzo de lo que respondió
    // (como «Probar la conexión»): es la respuesta, nunca las credenciales.
    if (!r.ok && !r.mensaje)
      r.mensaje =
        desescapar(texto ?? '')
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 300) || 'facturacion.cl respondió vacío';
    return r;
  }

  async acuse(
    documento: { folio: number; tipo: number; rut_emisor: string },
    accion: 'aceptar' | 'reclamar',
  ): Promise<boolean> {
    const texto = await this.llamar(
      'Acuse',
      this.login() +
        `<folio>${documento.folio}</folio>` +
        `<tipo>${documento.tipo}</tipo>` +
        `<rutproveedor>${documento.rut_emisor.replace(/[.\s]/g, '')}</rutproveedor>` +
        `<accion>${accion === 'aceptar' ? 'a' : 'r'}</accion>`,
    );
    return (texto ?? '').trim().toLowerCase() === 'true';
  }

  private async llamar(metodo: string, cuerpo: string) {
    try {
      return await llamarSoap(
        { url: this.opciones.url ?? URL_DEL_PANEL, fetch: this.opciones.fetch },
        metodo,
        cuerpo,
        this.opciones.espera ?? 30_000,
      );
    } catch (error) {
      throw new Error(
        `facturacion.cl no respondió en el panel de recibidos: ${mensajeDe(error)}`,
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
