import { ForbiddenException, Injectable } from '@nestjs/common';
import { permisosDelCargo, sinPermiso, type Permiso } from 'src/auth/permisos';
import { UserRole } from 'src/users/entities/user.entity';
import { ClientsRepository } from './clients.repository';

// LO QUE VE RECEPCIÓN DE LAS COTIZACIONES (doc 21; Felipe, 04-11-2026:
// "recepción podría ver la parte de cotizaciones de personas naturales...
// mostrar los precios... solo personas naturales").
//
// Una sola regla, en el motor (la pantalla esconde, pero la barrera es
// esta, mapa 23):
// - vendedor para arriba: todo, como siempre;
// - recepción: todos los requerimientos (sin plata, como hoy) y, de las
//   cotizaciones, solo las de clientes de un tipo particular de su empresa
//   (`client_types.es_particular`, migración 186). Los montos, solo de esas.
//
// La usan todas las puertas que entregan o cambian una cotización: el
// tablero, la ficha, las cuotas, el resumen del cliente, crear, editar,
// enviar, el seguimiento y BelIA.

type Sesion = {
  role?: string | null;
  company_id: number;
  /** Los permisos por cargo de la sesión (doc 22); sin ellos, los de
   *  fábrica del cargo. */
  permisos?: readonly Permiso[];
};

/** Las secciones que leen la lista entera de cotizaciones (doc 22 §4.4);
 *  con solo Requerimientos, la lista trae solo requerimientos. */
const LEEN_LA_LISTA_ENTERA: readonly Permiso[] = [
  'cotizaciones',
  'dashboard',
  'personal',
];

/** Lo justo de una cotización para decidir: si es requerimiento y el tipo
 *  de su cliente. */
export type CotizacionParaElAlcance = {
  request_type?: string | null;
  clients?: { client_type?: string | null } | null;
};

export const esRecepcion = (s: Pick<Sesion, 'role'>): boolean =>
  s.role === UserRole.RECEPCION;

const normal = (t: string | null | undefined): string =>
  (t ?? '').trim().toLowerCase();

/** ¿Este tipo de cliente está entre los particulares de la empresa (los de
 *  `particulares()`)? Sin mayúsculas ni espacios de diferencia: el mismo
 *  criterio de toda la regla. */
export const esDeLosParticulares = (
  particulares: ReadonlySet<string>,
  tipo: string | null | undefined,
): boolean => particulares.has(normal(tipo));

/** Los estados que recepción no da: aceptar es el plan de pagos (de
 *  operaciones), y anular y realizado tampoco son de ella (doc 21 §2). */
const ESTADOS_DE_OPERACIONES = new Set(['aceptada', 'cancelada', 'realizada']);

type LoQueCotiza = {
  discount_percentage?: number | string | null;
  discount_amount?: number | string | null;
  quotation_status?: string | null;
};

/** Lo que recepción no puede poner en una cotización: descuento ni esos
 *  estados (Felipe, 04-11-2026: "recepción no puede dar descuento"; "el
 *  aceptar ya no"). Al editar, `actual` es lo guardado: el descuento que
 *  ya dio quien vende se mantiene (el cotizador lo vuelve a mandar), pero
 *  no sube; y el estado se revisa solo si cambia, también para sacarla de
 *  uno de operaciones (reabrir una anulada). */
export const revisarLoQueCotiza = (
  cambio: LoQueCotiza,
  actual?: LoQueCotiza | null,
): void => {
  const sube = (
    nuevo: number | string | null | undefined,
    antes: number | string | null | undefined,
  ) => nuevo != null && Number(nuevo) > Number(antes ?? 0);
  if (
    sube(cambio.discount_percentage, actual?.discount_percentage) ||
    sube(cambio.discount_amount, actual?.discount_amount)
  ) {
    throw new ForbiddenException('Recepción no da descuentos.');
  }
  const nuevo = cambio.quotation_status;
  const antes = actual?.quotation_status ?? null;
  if (
    nuevo &&
    nuevo !== antes &&
    (ESTADOS_DE_OPERACIONES.has(nuevo) ||
      (antes !== null && ESTADOS_DE_OPERACIONES.has(antes)))
  ) {
    throw new ForbiddenException(
      'Aceptar, anular, marcar realizada o reabrir una cotización es de operaciones.',
    );
  }
};

/** El resumen de un cliente sin plata: sus cotizaciones sin el total y sin
 *  los pagos por cobrar (para recepción, de un cliente que no es
 *  particular). */
export const sinMontosDelResumen = <
  R extends {
    quotations?: Array<Record<string, unknown>>;
    pendingPayments?: unknown[];
  } | null,
>(
  resumen: R,
): R => {
  if (!resumen) return resumen;
  return {
    ...resumen,
    quotations: (resumen.quotations ?? []).map((q) => ({
      ...q,
      total_amount: null,
    })),
    pendingPayments: [],
  };
};

/** Lo que recepción ve de una cotización que no es de particulares: lo
 *  del calendario, donde sigue solo mirando (03-10-2026), sin plata. Una
 *  lista cerrada: un campo que se agregue mañana a la cotización no viaja
 *  solo. Las categorías salen de los servicios, sin sus precios. */
const CAMPOS_DE_LA_AGENDA = [
  'id',
  'company_id',
  'quotation_number',
  'request_type',
  'quotation_status',
  'event_type',
  'event_date',
  'event_end_date',
  'people_count',
  'children_count',
  'client_id',
] as const;

export type CotizacionDeAgenda = Record<string, unknown> & {
  solo_agenda: true;
  clients: { name: string | null };
  categorias?: string[];
};

export const paraLaAgenda = (cotizacion: object): CotizacionDeAgenda => {
  const q = cotizacion as Record<string, unknown>;
  const cliente = q.clients as { name?: string | null } | null | undefined;
  const agenda: CotizacionDeAgenda = {
    solo_agenda: true,
    clients: { name: cliente?.name ?? null },
  };
  for (const campo of CAMPOS_DE_LA_AGENDA) {
    if (campo in q) agenda[campo] = q[campo];
  }
  const servicios = (
    q.items as { variable_services?: Array<{ category?: unknown }> } | null
  )?.variable_services;
  if (Array.isArray(servicios)) {
    agenda.categorias = [
      ...new Set(
        servicios
          .map((g) => g?.category)
          .filter((c): c is string => typeof c === 'string' && c.trim() !== ''),
      ),
    ];
  }
  return agenda;
};

/** ¿Recepción ve completa esta cotización? Los requerimientos y las de
 *  clientes particulares. */
const laVe = (
  particulares: ReadonlySet<string>,
  q: CotizacionParaElAlcance,
): boolean =>
  q.request_type === 'requerimiento' ||
  esDeLosParticulares(particulares, q.clients?.client_type);

/** Cuánto dura lo que se sabe de los tipos de una empresa. */
const MINUTOS = 5;

@Injectable()
export class AlcanceDeRecepcion {
  private readonly tipos = new Map<
    number,
    { particulares: Set<string>; hasta: number }
  >();

  constructor(private readonly repositorio: ClientsRepository) {}

  /** Los tipos particulares de la empresa (en minúsculas), recordados 5
   *  minutos. */
  async particulares(empresa: number): Promise<Set<string>> {
    const ya = this.tipos.get(empresa);
    if (ya && ya.hasta > Date.now()) return ya.particulares;
    const lista = await this.repositorio.tiposParticulares(empresa);
    const particulares = new Set(lista.map(normal));
    this.tipos.set(empresa, {
      particulares,
      hasta: Date.now() + MINUTOS * 60_000,
    });
    return particulares;
  }

  /** Para cuando la empresa cambia sus tipos. */
  olvidar(empresa: number): void {
    this.tipos.delete(empresa);
  }

  /** ¿El cliente de este tipo es particular en la empresa? */
  async esParticular(
    empresa: number,
    tipo: string | null | undefined,
  ): Promise<boolean> {
    if (!normal(tipo)) return false;
    return (await this.particulares(empresa)).has(normal(tipo));
  }

  /** ¿Ve esta cotización? Recepción: los requerimientos y las de
   *  particulares; los demás cargos, todo. */
  async ve(s: Sesion, q: CotizacionParaElAlcance): Promise<boolean> {
    if (!esRecepcion(s)) return true;
    if (q.request_type === 'requerimiento') return true;
    return this.esParticular(s.company_id, q.clients?.client_type);
  }

  /** ¿Ve los montos de un cliente de este tipo? Recepción, solo de los
   *  particulares. */
  async veLosMontos(
    s: Sesion,
    tipo: string | null | undefined,
  ): Promise<boolean> {
    if (!esRecepcion(s)) return true;
    return this.esParticular(s.company_id, tipo);
  }

  /**
   * `GET /quotations`, con los permisos por cargo (doc 22 §4.4) y lo que ve
   * recepción. La puerta la usan cinco secciones y queda abierta mientras
   * el cargo tenga una; lo que cambia es lo que trae:
   * - la vista de calendario (la agenda de toda la empresa), solo con el
   *   Calendario prendido;
   * - la lista entera, con Cotizaciones, Dashboard o Personal; con solo
   *   Requerimientos, los requerimientos.
   * Con todo de fábrica no cambia nada: todos los cargos tienen
   * Cotizaciones y Calendario.
   */
  async deLaLista<T extends CotizacionParaElAlcance>(
    s: Sesion,
    filas: T[],
    vista?: string,
  ): Promise<Array<T | CotizacionDeAgenda>> {
    const prendidos = s.permisos ?? permisosDelCargo(s.role);
    if (vista === 'calendario') {
      if (!prendidos.includes('calendario')) throw sinPermiso();
      return this.paraElCalendario(s, filas);
    }
    if (LEEN_LA_LISTA_ENTERA.some((p) => prendidos.includes(p))) {
      return this.filtrar(s, filas);
    }
    if (!prendidos.includes('requerimientos')) throw sinPermiso();
    return this.filtrar(
      s,
      filas.filter((q) => q.request_type === 'requerimiento'),
    );
  }

  /** La lista del tablero, con lo que ve quien la pide. */
  async filtrar<T extends CotizacionParaElAlcance>(
    s: Sesion,
    filas: T[],
  ): Promise<T[]> {
    if (!esRecepcion(s)) return filas;
    const particulares = await this.particulares(s.company_id);
    return filas.filter((q) => laVe(particulares, q));
  }

  /** La lista del calendario: recepción sigue viendo todos los eventos,
   *  pero los que no son de particulares le llegan como agenda, sin plata. */
  async paraElCalendario<T extends CotizacionParaElAlcance>(
    s: Sesion,
    filas: T[],
  ): Promise<Array<T | CotizacionDeAgenda>> {
    if (!esRecepcion(s)) return filas;
    const particulares = await this.particulares(s.company_id);
    return filas.map((q) => (laVe(particulares, q) ? q : paraLaAgenda(q)));
  }

  /** ¿Ve esta cotización de la empresa, por su id? */
  async veLaCotizacion(s: Sesion, quotationId: string): Promise<boolean> {
    if (!esRecepcion(s)) return true;
    const q = await this.repositorio.clienteDeLaCotizacion(
      s.company_id,
      quotationId,
    );
    if (!q) return false;
    return this.ve(s, {
      request_type: q.request_type,
      clients: { client_type: q.client_type },
    });
  }

  /** Para cotizar (enviar, el seguimiento, «Crear con IA»…): si es
   *  recepción, la cotización tiene que ser de un particular. Un
   *  requerimiento de otro tipo de cliente tampoco: pasarlo a cotización es
   *  de quien vende. */
  async exigirParticular(s: Sesion, quotationId: string): Promise<void> {
    if (!esRecepcion(s)) return;
    const q = await this.repositorio.clienteDeLaCotizacion(
      s.company_id,
      quotationId,
    );
    if (!q || !(await this.esParticular(s.company_id, q.client_type))) {
      throw new ForbiddenException(
        'Recepción trabaja las cotizaciones de clientes particulares: esta la ve quien vende.',
      );
    }
  }

  /** Para crear una cotización o cambiarle el cliente: si es recepción, el
   *  cliente tiene que ser particular. */
  async exigirClienteParticular(s: Sesion, clientId: string): Promise<void> {
    if (!esRecepcion(s)) return;
    const tipo = await this.repositorio.tipoDelCliente(s.company_id, clientId);
    if (tipo === undefined || !(await this.esParticular(s.company_id, tipo))) {
      throw new ForbiddenException(
        'Recepción cotiza a clientes particulares: a este cliente lo cotiza quien vende.',
      );
    }
  }
}
