import { ForbiddenException, Injectable, Optional } from '@nestjs/common';
import {
  permisosDelCargo,
  sinPermiso,
  tiposQueTrabaja,
  trabajaElTipo,
  type Permiso,
  type TipoDeCliente,
  type TiposQueTrabaja,
} from 'src/auth/permisos';
import { PermisosService } from 'src/auth/permisos.service';
import { olvidarTiposDeCliente } from 'src/cache/memoria';
import { UserRole } from 'src/users/entities/user.entity';
import { ClientsRepository } from './clients.repository';
import type { TablaDelEvento } from './del-evento.decorator';

// LO QUE VE CADA CARGO DE LAS COTIZACIONES, SEGÚN LOS TIPOS DE CLIENTE QUE
// TRABAJA (doc 22 §9). Nació para recepción (doc 21; Felipe, 04-11-2026:
// "recepción podría ver la parte de cotizaciones de personas naturales...
// mostrar los precios... solo personas naturales") y desde el 05-11-2026 es
// de los cuatro cargos (Felipe: "Todo debería mirar el tipo"): un
// interruptor por tipo y por cargo en Permisos por cargo.
//
// Una sola regla, en el motor (la pantalla esconde, pero la barrera es
// esta, mapa 23):
// - un cargo ve y trabaja las cotizaciones de los tipos que tiene
//   prendidos; de las demás, nada (en el calendario, la agenda sin plata);
// - los requerimientos, de todos: son la puerta de entrada, y el tipo a
//   veces se corrige después;
// - de fábrica, lo de hoy: recepción trabaja los tipos particulares
//   (`client_types.es_particular`, migración 186) y los demás cargos,
//   todos.
// Recepción, además, no da descuento ni los estados de operaciones
// (`revisarLoQueCotiza`): eso es de su cargo, no del tipo (doc 21 §2).
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

export { trabajaElTipo, type TiposQueTrabaja };

/** ¿Este tipo de cliente está entre los particulares de la empresa (los de
 *  `particulares()`)? Sin mayúsculas ni espacios de diferencia: el mismo
 *  criterio de toda la regla. Describe al cliente (es persona natural), no
 *  un permiso: para eso, `trabajaElTipo`. */
export const esDeLosParticulares = (
  particulares: ReadonlySet<string>,
  tipo: string | null | undefined,
): boolean => particulares.has(normal(tipo));

/** Por qué no: el cargo no trabaja el tipo de este cliente. */
export const textoDeNoLoTrabaja = (tipo: string | null | undefined): string =>
  tipo?.trim()
    ? `Tu cargo no trabaja los clientes de tipo «${tipo.trim()}»: se prende en Permisos por cargo.`
    : 'Tu cargo no trabaja los clientes sin tipo.';

/** El 403 de un cliente de un tipo que el cargo no trabaja. Con el código
 *  de los permisos: la app vuelve a pedir el perfil (los interruptores
 *  pueden haber cambiado). */
export const noLoTrabaja = (
  tipo: string | null | undefined,
): ForbiddenException => sinPermiso(textoDeNoLoTrabaja(tipo));

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
 *  los pagos por cobrar (para un cargo que no trabaja el tipo del
 *  cliente). */
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

/** Lo que un cargo ve de una cotización de un tipo que no trabaja: lo del
 *  calendario, donde se sigue viendo qué hay cada día (03-10-2026), sin
 *  plata. Una lista cerrada: un campo que se agregue mañana a la cotización
 *  no viaja solo. Las categorías salen de los servicios, sin sus precios. */
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

/** ¿La ve completa? Los requerimientos, de todos; las cotizaciones, si el
 *  cargo trabaja el tipo de su cliente. */
const laVe = (tipos: TiposQueTrabaja, q: CotizacionParaElAlcance): boolean =>
  q.request_type === 'requerimiento' ||
  trabajaElTipo(tipos, q.clients?.client_type);

@Injectable()
export class AlcanceDeRecepcion {
  constructor(
    private readonly repositorio: ClientsRepository,
    // Los interruptores de la empresa (doc 22 §9). Sin la pieza (algunas
    // pruebas), lo de fábrica.
    @Optional() private readonly permisos?: PermisosService,
  ) {}

  /** Los tipos de la empresa con su marca de particular: los recuerda la
   *  pieza de los permisos (doc 22 §9); sin ella (algunas pruebas), de la
   *  base. */
  private tiposDe(empresa: number): Promise<TipoDeCliente[]> {
    return this.permisos
      ? this.permisos.tiposDe(empresa)
      : this.repositorio.tiposConMarca(empresa);
  }

  /** Los tipos particulares de la empresa, en minúsculas: los que la marca
   *  `es_particular` dice que son personas naturales. Describen al cliente,
   *  no un permiso; BelIA los usa para avisar los mal clasificados (doc 21
   *  §6). */
  async particulares(empresa: number): Promise<Set<string>> {
    return new Set(
      (await this.tiposDe(empresa))
        .filter((t) => t.es_particular)
        .map((t) => t.name.trim().toLowerCase()),
    );
  }

  /** Para cuando la empresa cambia sus tipos. */
  olvidar(empresa: number): void {
    olvidarTiposDeCliente(empresa);
  }

  /** Los tipos que trabaja el cargo de la sesión (doc 22 §9); null si los
   *  trabaja todos. Sin la pieza de los permisos, lo de fábrica. */
  async tiposDelCargo(
    s: Pick<Sesion, 'role' | 'company_id'>,
  ): Promise<TiposQueTrabaja> {
    if (this.permisos) return this.permisos.tiposDelCargo(s.company_id, s.role);
    if (!esRecepcion(s)) return null;
    return tiposQueTrabaja(
      s.role,
      await this.repositorio.tiposConMarca(s.company_id),
    );
  }

  /** Los nombres de los tipos que trabaja el cargo, en su orden; null si
   *  los trabaja todos. Para contárselo a BelIA. */
  async nombresDeSusTipos(
    s: Pick<Sesion, 'role' | 'company_id'>,
  ): Promise<string[] | null> {
    const tipos = await this.tiposDelCargo(s);
    if (!tipos) return null;
    return (await this.tiposDe(s.company_id))
      .filter((t) => trabajaElTipo(tipos, t.name))
      .map((t) => t.name);
  }

  /** ¿El cargo de la sesión trabaja un cliente de este tipo? */
  async trabaja(
    s: Pick<Sesion, 'role' | 'company_id'>,
    tipo: string | null | undefined,
  ): Promise<boolean> {
    return trabajaElTipo(await this.tiposDelCargo(s), tipo);
  }

  /** ¿Ve completa esta cotización? Los requerimientos, siempre; las
   *  cotizaciones, si trabaja el tipo de su cliente. */
  async ve(s: Sesion, q: CotizacionParaElAlcance): Promise<boolean> {
    if (q.request_type === 'requerimiento') return true;
    return this.trabaja(s, q.clients?.client_type);
  }

  /** ¿Ve los montos de un cliente de este tipo? Si lo trabaja. */
  async veLosMontos(
    s: Sesion,
    tipo: string | null | undefined,
  ): Promise<boolean> {
    return this.trabaja(s, tipo);
  }

  /**
   * `GET /quotations`, con los permisos por cargo (doc 22 §4.4) y los tipos
   * que trabaja cada cargo (§9). La puerta la usan cinco secciones y queda
   * abierta mientras el cargo tenga una; lo que cambia es lo que trae:
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
    const tipos = await this.tiposDelCargo(s);
    if (!tipos) return filas;
    return filas.filter((q) => laVe(tipos, q));
  }

  /** La lista del calendario: cada cargo sigue viendo todos los eventos,
   *  pero los de los tipos que no trabaja le llegan como agenda, sin
   *  plata (la excepción del calendario, Felipe 05-11-2026: «¿tienen el 20
   *  libre?»). */
  async paraElCalendario<T extends CotizacionParaElAlcance>(
    s: Sesion,
    filas: T[],
  ): Promise<Array<T | CotizacionDeAgenda>> {
    const tipos = await this.tiposDelCargo(s);
    if (!tipos) return filas;
    return filas.map((q) => (laVe(tipos, q) ? q : paraLaAgenda(q)));
  }

  /** ¿Ve esta cotización de la empresa, por su id? */
  async veLaCotizacion(s: Sesion, quotationId: string): Promise<boolean> {
    const tipos = await this.tiposDelCargo(s);
    if (!tipos) return true;
    const q = await this.repositorio.clienteDeLaCotizacion(
      s.company_id,
      quotationId,
    );
    if (!q) return false;
    return laVe(tipos, {
      request_type: q.request_type,
      clients: { client_type: q.client_type },
    });
  }

  /** Para Post-Venta (doc 22 §9, tanda 2; `TipoDelEventoGuard`): si no la
   *  ve —una cotización de un tipo que su cargo no trabaja, o de otra
   *  empresa—, 403. Los requerimientos, siempre. */
  async exigirQueLaVea(s: Sesion, quotationId: string): Promise<void> {
    const tipos = await this.tiposDelCargo(s);
    if (!tipos) return;
    const q = await this.repositorio.clienteDeLaCotizacion(
      s.company_id,
      quotationId,
    );
    const ve =
      !!q &&
      laVe(tipos, {
        request_type: q.request_type,
        clients: { client_type: q.client_type },
      });
    if (!ve) throw noLoTrabaja(q?.client_type);
  }

  /** Lo mismo, desde una fila del evento (un pago, un abono, un
   *  documento…). Una fila que no existe o no es de un evento pasa: la
   *  puerta responde lo de siempre. */
  async exigirQueLaVeaLaFila(
    s: Sesion,
    tabla: TablaDelEvento,
    id: string,
  ): Promise<void> {
    if (!(await this.tiposDelCargo(s))) return;
    const quotationId = await this.repositorio.cotizacionDeLaFila(tabla, id);
    if (quotationId) await this.exigirQueLaVea(s, quotationId);
  }

  /** De una lista de toda la empresa (Post-Venta, Compras y Personal, doc
   *  22 §9, tandas 2 y 3), solo lo de las cotizaciones que ve: los eventos
   *  de un tipo que su cargo no trabaja no aparecen. `deQue` dice de qué
   *  cotización es cada fila. Una fila sin cotización no aparece, salvo en
   *  una lista que también trae lo que no es de un evento (una silla de un
   *  día de restaurante): `sinCotizacion: 'queda'`. Un cargo que trabaja
   *  todos los tipos, todo, sin preguntarle a la base. */
  async soloLasQueVe<T>(
    s: Sesion,
    filas: T[],
    deQue: (fila: T) => string | null | undefined,
    sinCotizacion: 'sale' | 'queda' = 'sale',
  ): Promise<T[]> {
    const tipos = await this.tiposDelCargo(s);
    if (!tipos || filas.length === 0) return filas;
    const ids = [...new Set(filas.map(deQue).filter((x): x is string => !!x))];
    const cotizaciones = await this.repositorio.clientesDeLasCotizaciones(
      s.company_id,
      ids,
    );
    return filas.filter((f) => {
      const id = deQue(f);
      if (!id) return sinCotizacion === 'queda';
      const q = cotizaciones.get(id);
      return (
        !!q &&
        laVe(tipos, {
          request_type: q.request_type,
          clients: { client_type: q.client_type },
        })
      );
    });
  }

  /** Lo mismo, para un mapa cuyas llaves son ids de cotización. */
  async soloLasClavesQueVe<V>(
    s: Sesion,
    mapa: Record<string, V>,
  ): Promise<Record<string, V>> {
    const entradas = await this.soloLasQueVe(
      s,
      Object.entries(mapa),
      ([id]) => id,
    );
    return Object.fromEntries(entradas);
  }

  /** Para cotizar (enviar, el seguimiento, «Crear con IA»…): la cotización
   *  tiene que ser de un cliente de un tipo que el cargo trabaja. Un
   *  requerimiento de otro tipo tampoco: pasarlo a cotización es de quien
   *  trabaja ese tipo. */
  async exigirElTipo(s: Sesion, quotationId: string): Promise<void> {
    const tipos = await this.tiposDelCargo(s);
    if (!tipos) return;
    const q = await this.repositorio.clienteDeLaCotizacion(
      s.company_id,
      quotationId,
    );
    if (!q || !trabajaElTipo(tipos, q.client_type)) {
      throw noLoTrabaja(q?.client_type);
    }
  }

  /** Para crear una cotización o cambiarle el cliente: el cliente tiene que
   *  ser de un tipo que el cargo trabaja. */
  async exigirElTipoDelCliente(s: Sesion, clientId: string): Promise<void> {
    const tipos = await this.tiposDelCargo(s);
    if (!tipos) return;
    const tipo = await this.repositorio.tipoDelCliente(s.company_id, clientId);
    if (tipo === undefined || !trabajaElTipo(tipos, tipo)) {
      throw noLoTrabaja(tipo);
    }
  }
}
