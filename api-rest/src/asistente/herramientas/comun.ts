import type Anthropic from '@anthropic-ai/sdk';
import type { Derecho } from 'src/auth/derechos';
import { OPERATIONS_AND_UP } from 'src/auth/roles.decorator';
import type { AlcanceDeRecepcion } from 'src/clients/alcance-de-recepcion';
import type { LogisticsService } from 'src/logistics/logistics.service';
import type { QuotationFollowupsService } from 'src/quotation-followups/quotation-followups.service';
import type { ChoquesDeFechaService } from 'src/quotations/choques/choques.service';
import {
  QuotationStatus,
  STATUS_LABELS,
} from 'src/quotations/constants/constants';
import type { GenerarRepository } from 'src/quotations/generar/generar.repository';
import type { QuotationsRepository } from 'src/quotations/quotations.repository';
import { UserRole, type User } from 'src/users/entities/user.entity';
import type { AsistenteRepository } from '../asistente.repository';
import type { TarjetaDePropuesta } from '../propuestas/comun';
import type { PropuestasService } from '../propuestas/propuestas.service';

// LO COMÚN DE LAS HERRAMIENTAS DE BELIA (doc 20 §3 y §9).
//
// Una herramienta es un botón que ya existe: lee con la empresa y el cargo
// de la persona que escribe, nunca con lo que diga la IA. Devuelve un
// resumen corto (la fila cruda de la 500 pesa miles de tokens) y las cifras
// ya escritas como las ve la persona, para que la IA no tenga que hacer
// cuentas.

export type ContextoDeHerramienta = {
  usuario: User;
  /** La cotización que la persona tiene abierta, si es de su empresa. */
  cotizacionAbierta: string | null;
  repositorio: AsistenteRepository;
  cotizaciones: QuotationsRepository;
  catalogo: GenerarRepository;
  bitacora: QuotationFollowupsService;
  /** Las mismas lecturas de la pantalla de Compras (base y eventos). */
  logistica: LogisticsService;
  /** Los topes de calendario, con la misma lista del tablero. */
  choques: ChoquesDeFechaService;
  /** Fase 2: arma y guarda las propuestas (doc 20 §3, regla 3). */
  propuestas: PropuestasService;
  /** Las tarjetas que arman las herramientas en esta pregunta: viajan a la
   *  ventanilla junto con la respuesta. */
  tarjetas: TarjetaDePropuesta[];
  /** AAAA-MM-DD, en Chile. */
  hoy: string;
  /** Lo que ve recepción (doc 21): cuáles tipos de cliente son
   *  particulares. Sin ella, recepción no ve plata de nadie. */
  alcance?: AlcanceDeRecepcion;
};

export type Herramienta = {
  nombre: string;
  descripcion: string;
  esquema: Anthropic.Tool.InputSchema;
  /** Los cargos que ven ese dato en sus pantallas (SECTION_ROLES). */
  cargos: readonly UserRole[];
  /** El derecho del plan que pide la pantalla, si pide alguno. */
  derecho?: Derecho;
  /** Lo que devuelve no es plata de un cliente (el catálogo): a recepción
   *  le llega sin pasar por la red, como lo ve en el cotizador (doc 21). */
  plataLibre?: true;
  ejecutar: (
    entrada: Record<string, unknown>,
    ctx: ContextoDeHerramienta,
  ) => Promise<unknown>;
};

/** Lo que la herramienta le contesta a la IA cuando algo no calza: va como
 *  error, en palabras de la casa, y la IA se lo explica a la persona. */
export class ErrorDeHerramienta extends Error {}

// ---------- Leer lo que manda la IA, sin creerle ----------

export const texto = (v: unknown, max = 120): string | undefined => {
  if (typeof v !== 'string') return undefined;
  const t = v.trim().slice(0, max);
  return t ? t : undefined;
};

export const entero = (
  v: unknown,
  min: number,
  max: number,
): number | undefined => {
  const n = typeof v === 'string' ? Number(v) : v;
  if (typeof n !== 'number' || !Number.isInteger(n)) return undefined;
  return Math.min(max, Math.max(min, n));
};

const ES_FECHA = /^\d{4}-\d{2}-\d{2}$/;

/** AAAA-MM-DD válida, o un error que la IA entiende. */
export const fecha = (v: unknown, campo: string): string | undefined => {
  if (v == null || v === '') return undefined;
  if (typeof v !== 'string' || !ES_FECHA.test(v)) {
    throw new ErrorDeHerramienta(`${campo} tiene que venir como AAAA-MM-DD.`);
  }
  const d = new Date(`${v}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v) {
    throw new ErrorDeHerramienta(`${campo} no es una fecha real: ${v}.`);
  }
  return v;
};

export const ESTADOS = Object.values(QuotationStatus);

export const estados = (v: unknown): QuotationStatus[] | undefined => {
  if (!Array.isArray(v)) return undefined;
  const validos = v.filter((e): e is QuotationStatus =>
    ESTADOS.includes(e as QuotationStatus),
  );
  return validos.length ? validos : undefined;
};

// ---------- Escribir como lo ve la persona ----------

/** Los montos llegan de la base como número o como texto (numeric). */
export const pesos = (n: number | string | null | undefined): string =>
  `$${Math.round(Number(n) || 0).toLocaleString('es-CL')}`;

export const estadoDe = (e: QuotationStatus): string => STATUS_LABELS[e] ?? e;

const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];

/** La fecha de un evento (se guarda a las 00:00 UTC, mapa 06 §6). */
export const diaDelEvento = (ts: string | null | undefined): string | null =>
  ts ? new Date(ts).toISOString().slice(0, 10) : null;

/** «lun 09-11-2026». */
export const conDia = (ymd: string | null | undefined): string | null => {
  if (!ymd) return null;
  const d = new Date(`${ymd}T00:00:00Z`);
  const [a, m, dd] = ymd.split('-');
  return `${DIAS[d.getUTCDay()]} ${dd}-${m}-${a}`;
};

export const sumarDias = (ymd: string, dias: number): string => {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
};

export const diasEntre = (desde: string, hasta: string): number =>
  Math.round(
    (Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) /
      86_400_000,
  );

/** AAAA-MM-DD de un instante, en Chile. */
export const fechaEnChile = (ts: string | number | Date): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(
    new Date(ts),
  );

/** El instante en que empieza un día en Chile, como ISO (UTC). Chile está
 *  a -3 o -4 según la época: se mide al mediodía de ese día. */
export const inicioDelDiaEnChile = (ymd: string): string => {
  const mediodia = new Date(`${ymd}T12:00:00Z`);
  const horaEnChile = Number(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'America/Santiago',
      hour: '2-digit',
      hour12: false,
    }).format(mediodia),
  );
  const desfase = horaEnChile - 12;
  return new Date(
    Date.parse(`${ymd}T00:00:00Z`) - desfase * 3_600_000,
  ).toISOString();
};

/** Dónde se abre una cotización en Eventia. Lo vendido se mira en
 *  Post-Venta, que es de operaciones para arriba (SECTION_ROLES.payments).
 *  Recepción no abre la ficha del negocio: su pantalla es Requerimientos
 *  (doc 20 §13). */
export const enlaceDe = (
  q: { id: string; quotation_status: QuotationStatus; request_type?: string },
  rol: UserRole,
  // Recepción abre la ficha de las cotizaciones de particulares (doc 21);
  // lo demás lo ve en Requerimientos.
  deParticular = false,
): string => {
  if (rol === UserRole.RECEPCION) {
    return deParticular && q.request_type !== 'requerimiento'
      ? `/negocio/${q.id}`
      : '/requests';
  }
  const vendido = [
    QuotationStatus.ACEPTADA,
    QuotationStatus.REALIZADA,
    QuotationStatus.CANCELADA,
  ].includes(q.quotation_status);
  return vendido && OPERATIONS_AND_UP.includes(rol)
    ? `/post-venta/${q.id}`
    : `/negocio/${q.id}`;
};
