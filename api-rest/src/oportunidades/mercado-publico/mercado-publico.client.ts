import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import type {
  CompraAgilDetalle,
  CompraAgilListada,
  LicitacionDetalle,
  LicitacionListada,
} from './tipos';

// EL CLIENTE DE MERCADO PÚBLICO (doc 17 §5.1).
//
// Dos APIs distintas, con el mismo ticket:
//  - Licitaciones (la clásica): el ticket va en la URL.
//  - Compra Ágil (v2): el ticket va en la cabecera.
//
// El ticket vive en MP_TICKET. Ojo con el nombre: en esta casa "MP" suele
// ser Mercado PAGO (MP_ACCESS_TOKEN, MP_WEBHOOK_SECRET); este es el ticket
// de Mercado PÚBLICO. Nunca se escribe en un registro: los errores dicen el
// código HTTP y qué se pedía, no la URL.
//
// La lección del bot de GitHub (agosto de 2026): el servidor de Mercado
// Público responde 504 a ratos. Ante 5xx o un corte de red se reintenta con
// pausa creciente; un 429 (cupo del día) no se reintenta.
//
// Y la del código del bot: la API de licitaciones a veces responde 200 con
// el error ADENTRO ({ Codigo, Mensaje }), y rechaza las peticiones
// simultáneas con el mismo ticket. Por eso se revisa el cuerpo de cada
// respuesta y el radar pide de a una.
//
// LOS TICKETS DE RESPALDO (decisión 55 del doc 17, 20-10). Felipe: "yo
// recuerdo que tenía dos en el bot para esto". Cada ticket tiene su cupo
// del día; el bot usaba tres (MP_TICKET, MP_TICKET_2 y MP_TICKET_3) y
// pasaba al siguiente cuando uno se quedaba sin cupo. Aquí igual: un 429
// que no es de "peticiones simultáneas", o un ticket que Mercado Público
// no reconoce, pasa al siguiente al tiro y ahí se queda. Un ticket repetido
// en dos variables cuenta una vez. En el registro, cada ticket es su número
// (1, 2 o 3), nunca su valor.

const LICITACIONES =
  'https://api.mercadopublico.cl/servicios/v1/publico/licitaciones.json';
const COMPRA_AGIL = 'https://api2.mercadopublico.cl/v2/compra-agil';

/** Las variables de los tickets, en el orden en que se usan. */
const VARIABLES_DE_TICKET = ['MP_TICKET', 'MP_TICKET_2', 'MP_TICKET_3'];

/** Los tickets puestos en el motor, sin repetidos (sin mirar mayúsculas). */
export const ticketsDelMotor = (): string[] => {
  const tickets: string[] = [];
  for (const variable of VARIABLES_DE_TICKET) {
    const t = process.env[variable]?.trim();
    if (t && !tickets.some((x) => x.toUpperCase() === t.toUpperCase())) {
      tickets.push(t);
    }
  }
  return tickets;
};

/** El ticket de cada turno (decisión 109, 29-10). Felipe: "tenemos dos
 *  APIs cargadas, cosa de no sobresaturar ninguna. Una puede trabajar de
 *  mañana y otra de tarde": antes de las 14:00 de Chile, el primero
 *  (`MP_TICKET`); desde ahí, el segundo (`MP_TICKET_2`). Con un solo ticket,
 *  siempre ese. */
export const turnoDelTicket = (instante: number): number => {
  const hora = Number(
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Santiago',
      hour: 'numeric',
      hourCycle: 'h23',
    }).format(new Date(instante)),
  );
  return hora < 14 ? 0 : 1;
};

const escaparRegex = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Lo que dice algo de un ticket que Mercado Público no reconoce. */
const TICKET_MALO = /ticket/i;

/** Un pedido a Mercado Público, armado con el ticket del turno. */
type Pedido = { url: string; cabeceras?: Record<string, string> };

/** El error que la API escribe dentro del cuerpo, aunque responda 200. */
const errorDeLaApi = (
  cuerpo: unknown,
): { codigo: string; mensaje: string; simultaneas: boolean } | null => {
  if (!cuerpo || typeof cuerpo !== 'object') return null;
  const { Codigo, Mensaje } = cuerpo as { Codigo?: unknown; Mensaje?: unknown };
  const codigo =
    typeof Codigo === 'number' || typeof Codigo === 'string'
      ? String(Codigo).trim()
      : '';
  if (!codigo || codigo === '0') return null;
  const mensaje = typeof Mensaje === 'string' ? Mensaje.trim() : '';
  return {
    codigo,
    mensaje,
    simultaneas: codigo === '10500' || /simult/i.test(mensaje),
  };
};

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Lo que Mercado Público escribió en una respuesta de error, corto y sin
 *  el ticket (por si lo repitiera). */
const resumirCuerpo = (texto: string): string => {
  let t = texto;
  try {
    const j = JSON.parse(texto) as Record<string, unknown>;
    const m = j?.Mensaje ?? j?.message ?? j?.error ?? j?.errors;
    t = typeof m === 'string' ? m : JSON.stringify(m ?? j);
  } catch {
    // Texto plano o una página HTML.
  }
  t = t
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  for (const ticket of ticketsDelMotor()) {
    t = t.replace(new RegExp(escaparRegex(ticket), 'gi'), '[ticket]');
  }
  return t.slice(0, 160);
};

/** El servidor falló (5xx, red) o no tiene cupo (429). */
export class MercadoPublicoError extends Error {
  constructor(
    mensaje: string,
    readonly status: number | null,
  ) {
    super(mensaje);
    this.name = 'MercadoPublicoError';
  }

  get sinCupo(): boolean {
    return this.status === 429;
  }
}

@Injectable()
export class MercadoPublicoClient {
  /** Pausas entre reintentos, en milisegundos (las pruebas las acortan). */
  esperas: number[] = [15_000, 30_000];
  /** Ante un 429 se espera más antes de darlo por "sin cupo": a veces es
   *  un freno por pedir seguido, no el cupo del día (17-10, laboratorio). */
  esperas429: number[] = [30_000, 90_000];
  /** Pausa mínima entre el inicio de dos pedidos (las pruebas la apagan).
   *  Se ajusta sola: cada "peticiones simultáneas" le suma
   *  `aumentoPorChoqueMs`, sin bajar de `pausaTrasChoqueMs` ni pasar de
   *  `pausaMaximaMs`. Medido el 17-10 en el laboratorio: con 1 s y con 2 s
   *  entre pedidos Mercado Público veía simultáneas; con 4 s, no. */
  pausaMinimaMs = 3_000;
  aumentoPorChoqueMs = 1_000;
  pausaTrasChoqueMs = 2_000;
  pausaMaximaMs = 10_000;
  /** Tantos choques seguidos en un mismo pedido = se rinde con ese. */
  maxChoques = 6;
  private ultimoPedido = 0;
  /** Tope de cada petición (la lista de activas tiene el suyo, más largo). */
  topeMs = 60_000;
  topeListaMs = 120_000;

  constructor(private readonly logger: PinoLogger) {
    this.logger.setContext(MercadoPublicoClient.name);
  }

  /** El ticket con que se pide ahora (decisión 55): uno sin cupo pasa al
   *  siguiente y ahí se queda; después del último vuelve al primero. */
  private turno = 0;

  /** Cada pasada del radar parte con el ticket de su turno (decisión 109):
   *  el primero de mañana y el segundo de tarde. Si el del turno se queda
   *  sin cupo, sigue con el otro, como siempre. */
  empezarPasada(instante = Date.now()): void {
    this.turno = turnoDelTicket(instante);
  }

  /** ¿Está el ticket? Sin él, el radar no corre (y lo dice). */
  get configurado(): boolean {
    return ticketsDelMotor().length > 0;
  }

  private get ticket(): string {
    const tickets = ticketsDelMotor();
    if (tickets.length === 0) {
      throw new MercadoPublicoError(
        'falta MP_TICKET (el ticket de Mercado Público) en las variables del motor',
        null,
      );
    }
    return tickets[this.turno % tickets.length];
  }

  /** Pasa al ticket siguiente si queda alguno sin probar en este pedido
   *  (`rotaciones`: cuántas veces ya cambió en él). */
  private rotar(que: string, rotaciones: number, por: string): boolean {
    const tickets = ticketsDelMotor();
    if (rotaciones + 1 >= tickets.length) return false;
    const antes = (this.turno % tickets.length) + 1;
    this.turno = antes % tickets.length;
    this.logger.warn(
      `${que}: el ticket ${antes} de ${tickets.length} ${por}; sigo con el ${this.turno + 1}`,
    );
    return true;
  }

  /** Todas las licitaciones publicadas en este momento, en una sola
   *  consulta liviana: código, nombre, estado y cierre. Sin región. */
  async licitacionesActivas(): Promise<LicitacionListada[]> {
    const json = (await this.pedir(
      (ticket) => ({
        url: `${LICITACIONES}?estado=activas&ticket=${encodeURIComponent(ticket)}`,
      }),
      'licitaciones activas',
      this.topeListaMs,
    )) as { Listado?: LicitacionListada[] } | null;
    // Siempre hay miles abiertas: una respuesta sin lista es una falla, no
    // "no hay nada".
    if (!Array.isArray(json?.Listado)) {
      throw new MercadoPublicoError(
        'licitaciones activas: Mercado Público respondió sin la lista',
        null,
      );
    }
    return json.Listado;
  }

  /** Las licitaciones publicadas en una fecha (de cualquier estado): así
   *  entrega la API la historia. `fecha` en el formato de la API, ddmmaaaa. */
  async licitacionesDelDia(fecha: string): Promise<LicitacionListada[]> {
    const json = (await this.pedir(
      (ticket) => ({
        url: `${LICITACIONES}?fecha=${encodeURIComponent(fecha)}&ticket=${encodeURIComponent(ticket)}`,
      }),
      `licitaciones del ${fecha}`,
      this.topeListaMs,
    )) as { Listado?: LicitacionListada[] } | null;
    if (!Array.isArray(json?.Listado)) {
      throw new MercadoPublicoError(
        `licitaciones del ${fecha}: Mercado Público respondió sin la lista`,
        null,
      );
    }
    return json.Listado;
  }

  async detalleLicitacion(codigo: string): Promise<LicitacionDetalle | null> {
    const json = (await this.pedir(
      (ticket) => ({
        url: `${LICITACIONES}?codigo=${encodeURIComponent(codigo)}&ticket=${encodeURIComponent(ticket)}`,
      }),
      `licitación ${codigo}`,
    )) as {
      Listado?: LicitacionDetalle[];
    };
    return json?.Listado?.[0] ?? null;
  }

  /** Las compras ágiles publicadas desde una fecha, en las regiones dadas
   *  (número oficial de cada región). Si el servidor cae a mitad del
   *  listado, devuelve lo que ya trajo: lo que falte llega en la próxima. */
  async comprasAgiles(
    desdeIso: string,
    regiones: number[],
    maxPaginas = 40,
  ): Promise<CompraAgilListada[]> {
    if (regiones.length === 0) return [];
    const items: CompraAgilListada[] = [];
    for (let pagina = 1; pagina <= maxPaginas; pagina++) {
      const params = new URLSearchParams({
        region: regiones.join(','),
        estado: 'publicada',
        tamano_pagina: '50',
        numero_pagina: String(pagina),
        ordenar_por: 'FechaPublicacion',
        publicado_desde: desdeIso,
      });
      let json: {
        success?: string;
        payload?: {
          items?: CompraAgilListada[];
          paginacion?: { total_paginas?: number };
        };
      };
      try {
        json = (await this.pedir(
          (ticket) => ({
            url: `${COMPRA_AGIL}?${params.toString()}`,
            cabeceras: { ticket },
          }),
          `compras ágiles, página ${pagina}`,
        )) as typeof json;
      } catch (error) {
        if (items.length > 0 && error instanceof MercadoPublicoError) {
          this.logger.warn(
            `compras ágiles: el servidor cayó en la página ${pagina}; sigo con las ${items.length} ya traídas`,
          );
          break;
        }
        throw error;
      }
      if (json?.success !== 'OK') {
        if (pagina === 1) {
          throw new MercadoPublicoError(
            'compras ágiles: Mercado Público respondió sin éxito',
            null,
          );
        }
        this.logger.warn(
          `compras ágiles: la página ${pagina} vino sin éxito; sigo con las ${items.length} ya traídas`,
        );
        break;
      }
      items.push(...(json.payload?.items ?? []));
      const total = json.payload?.paginacion?.total_paginas ?? 1;
      if (pagina >= total) break;
    }
    return items;
  }

  async detalleCompraAgil(codigo: string): Promise<CompraAgilDetalle | null> {
    const json = (await this.pedir(
      (ticket) => ({
        url: `${COMPRA_AGIL}/${encodeURIComponent(codigo)}`,
        cabeceras: { ticket },
      }),
      `compra ágil ${codigo}`,
    )) as { success?: string; payload?: CompraAgilDetalle } | null;
    if (json?.success === 'OK') return json.payload ?? null;
    this.logger.warn(`compra ágil ${codigo}: el detalle vino sin éxito`);
    return null;
  }

  /** GET con reintentos ante 5xx, corte de red, peticiones simultáneas y
   *  429. `que` es lo que se pide, en palabras: es lo único que llega al
   *  registro (nunca la URL). */
  private async pedir(
    armar: (ticket: string) => Pedido,
    que: string,
    topeMs = this.topeMs,
  ): Promise<unknown> {
    let fallas = 0;
    let frenos = 0;
    let choques = 0;
    let rotaciones = 0;
    for (;;) {
      let status: number | null = null;
      // Se arma en cada intento: si el ticket cambió, va el nuevo.
      const { url, cabeceras = {} } = armar(this.ticket);
      await this.esperarTurno();
      try {
        const resp = await fetch(url, {
          headers: { accept: 'application/json', ...cabeceras },
          signal: AbortSignal.timeout(topeMs),
        });
        status = resp.status;
        if (resp.status === 429) {
          const dijo = resumirCuerpo(await resp.text().catch(() => ''));
          if (/simult/i.test(dijo)) {
            await this.chocar(que, ++choques);
            continue;
          }
          // Sin cupo con este ticket: si hay otro, se sigue con ese al tiro.
          if (this.rotar(que, rotaciones, 'se quedó sin cupo')) {
            rotaciones++;
            continue;
          }
          const detalle = dijo ? ` (${dijo})` : '';
          if (frenos >= this.esperas429.length) {
            throw new MercadoPublicoError(
              `${que}: Mercado Público respondió 429${detalle} tras ${frenos + 1} intentos: sin cupo`,
              429,
            );
          }
          const espera = this.esperas429[frenos++];
          this.logger.warn(
            `${que}: Mercado Público respondió 429${detalle}; espero ${Math.round(espera / 1000)} s`,
          );
          await dormir(espera);
          continue;
        }
        const cuerpo: unknown = await resp.json().catch(() => null);
        const error = errorDeLaApi(cuerpo);
        if (error?.simultaneas) {
          await this.chocar(que, ++choques);
          continue;
        } else if (
          ((error && TICKET_MALO.test(error.mensaje)) ||
            resp.status === 401 ||
            resp.status === 403) &&
          this.rotar(que, rotaciones, 'no lo reconoce Mercado Público')
        ) {
          rotaciones++;
          continue;
        } else if (error) {
          throw new MercadoPublicoError(
            `${que}: Mercado Público respondió ${error.codigo}${error.mensaje ? ` (${error.mensaje})` : ''}`,
            resp.status,
          );
        } else if (resp.ok) {
          return cuerpo;
        } else if (resp.status < 500) {
          throw new MercadoPublicoError(
            `${que}: Mercado Público respondió ${resp.status}`,
            resp.status,
          );
        }
      } catch (error) {
        if (error instanceof MercadoPublicoError) throw error;
        // Corte de red o tope de tiempo: se reintenta como un 5xx.
      }
      const razon = String(status ?? 'sin respuesta');
      if (fallas >= this.esperas.length) {
        throw new MercadoPublicoError(
          `${que}: Mercado Público no respondió (${razon}) tras ${fallas + 1} intentos`,
          status,
        );
      }
      const espera = this.esperas[fallas++];
      this.logger.warn(
        `${que}: Mercado Público respondió ${razon}; reintento en ${Math.round(espera / 1000)} s`,
      );
      await dormir(espera);
    }
  }

  /** Mercado Público vio "peticiones simultáneas": se pide más despacio de
   *  aquí en adelante, se espera esa misma pausa y se reintenta. */
  private async chocar(que: string, choques: number): Promise<void> {
    if (choques > this.maxChoques) {
      throw new MercadoPublicoError(
        `${que}: Mercado Público sigue viendo peticiones simultáneas tras ${choques} intentos`,
        429,
      );
    }
    const antes = this.pausaMinimaMs;
    this.pausaMinimaMs = Math.min(
      Math.max(antes + this.aumentoPorChoqueMs, this.pausaTrasChoqueMs),
      this.pausaMaximaMs,
    );
    if (this.pausaMinimaMs !== antes) {
      this.logger.warn(
        `${que}: Mercado Público ve peticiones simultáneas; desde ahora pido cada ${(this.pausaMinimaMs / 1000).toFixed(1)} s`,
      );
    }
    await dormir(this.pausaMinimaMs);
  }

  /** Deja pasar al menos `pausaMinimaMs` entre el inicio de dos pedidos. */
  private async esperarTurno(): Promise<void> {
    const falta = this.ultimoPedido + this.pausaMinimaMs - Date.now();
    if (falta > 0) await dormir(falta);
    this.ultimoPedido = Date.now();
  }
}
