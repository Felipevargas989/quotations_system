import type { PinoLogger } from 'nestjs-pino';
import { mensajeDe } from 'src/logging/mensaje-de-error';
import type { QuotationFollowupsService } from 'src/quotation-followups/quotation-followups.service';
import { conDia, sumarDias } from '../herramientas/comun';
import type { LineaDelCambio } from './editar-foto';
import type { EstadoDePropuesta, Propuesta } from './propuestas.repository';

// LO COMÚN DE LAS PROPUESTAS DE BELIA (doc 20, fase 2): la tarjeta que ve la
// persona, lo que responde el «Sí, aplicar» y la línea de la bitácora. Lo
// usan los cambios de una cotización (`PropuestasService`) y «Crear evento»
// (`CotizacionNuevaService`).

/** Lo que ve la persona en la tarjeta (doc 20 §8). */
export type TarjetaDePropuesta = {
  id: string;
  tipo: 'servicios' | 'nota' | 'cotizacion_nueva';
  /** Null en una cotización nueva: el N° lo da la base al crearla. */
  numero: number | null;
  cliente: string | null;
  cotizacion_id: string | null;
  enlace: string | null;
  resumen: string;
  /** «Crear evento»: lo que se va a crear. */
  nueva?: {
    es: 'cotización' | 'requerimiento';
    cliente: string;
    cliente_nuevo: boolean;
    tipo_de_evento: string;
    fechas: string;
    personas: string;
    contacto?: string;
  };
  lineas: Array<{
    dia: string;
    que: string;
    quita: string[];
    agrega: string[];
    personas?: string;
    casilla?: 'nueva' | 'sale';
  }>;
  total?: { antes: string; despues: string; diferencia: string };
  cuotas?: Array<{
    cuota: number;
    vence: string | null;
    antes: string;
    despues: string;
  }>;
  cuota_nueva?: string;
  reembolso_nuevo?: string;
  reembolso_compensado?: string;
  avisos: string[];
  nota?: { texto: string; canal: string; proximo_contacto: string | null };
  se_puede_deshacer: boolean;
  vence_at: string;
};

export type ResultadoDeAplicar = {
  estado: 'aplicada' | 'deshecha' | 'descartada';
  numero: number;
  enlace: string;
  total?: string;
  se_puede_deshacer?: boolean;
};

export const CANALES = [
  'llamada',
  'correo',
  'reunion',
  'whatsapp',
  'otro',
] as const;
export type Canal = (typeof CANALES)[number];

/** «a pedido de Camila», o «a pedido del equipo» si no hay nombre. */
export const aPedidoDe = (p: Pick<Propuesta, 'usuario_nombre'>): string =>
  p.usuario_nombre ? `a pedido de ${p.usuario_nombre}` : 'a pedido del equipo';

/** El día de una línea en palabras: «Día 2 · mar 10-11-2026». */
export const diaEnPalabras = (dia: number, desde: string | null): string =>
  dia === 0
    ? 'Todo el evento'
    : `Día ${dia}${desde ? ` · ${conDia(sumarDias(desde, dia - 1))}` : ''}`;

export const lineasDeLaTarjeta = (
  lineas: LineaDelCambio[],
  desde: string | null,
): TarjetaDePropuesta['lineas'] =>
  lineas.map((l) => ({
    dia: diaEnPalabras(l.dia, desde),
    que: l.que,
    quita: l.quita,
    agrega: l.agrega,
    ...(l.personas
      ? { personas: `${l.personas.antes} → ${l.personas.despues} personas` }
      : {}),
    ...(l.casilla ? { casilla: l.casilla } : {}),
  }));

export const ESTADOS: Record<EstadoDePropuesta, string> = {
  pendiente: 'está esperando tu «Sí, aplicar»',
  aplicando: 'se está aplicando en este momento',
  aplicada: 'ya se aplicó',
  deshaciendo: 'se está deshaciendo en este momento',
  deshecha: 'ya se deshizo',
  descartada: 'se descartó (dijiste que no, o la reemplazó una más nueva)',
  vencida: 'venció: pídemela de nuevo',
};

/** La línea de la bitácora, a nombre del Asistente (con el robot). Si no
 *  se puede, se avisa en el registro: el cambio ya quedó. */
export const anotarComoAsistente = async (
  bitacora: QuotationFollowupsService,
  logger: PinoLogger,
  empresa: number,
  quotationId: string,
  note: string,
): Promise<void> => {
  await bitacora
    .crearComoAsistente(empresa, {
      quotation_id: quotationId,
      tipo: 'otro',
      next_contact_date: null,
      note,
    })
    .catch((e: unknown) =>
      logger.warn(`no pude anotar en la bitácora: ${mensajeDe(e)}`),
    );
};
