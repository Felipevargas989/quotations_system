import type { TipoCuenta } from "../utils/bancos";
import type { EstadoPersona, TipoPersona } from "../utils/estadoPersona";

/**
 * UN CARGO.
 *
 * Vive en `management_resources` con type='personal' — la MISMA tabla que
 * usa Recursos. Eran dos listas hasta el 14-08 y se fusionaron: Garzón
 * estaba escrito en las dos.
 *
 * Un cargo NO lleva precio (Felipe, 17-08: "si eso lo asignaremos día a
 * día, caso a caso"). El monto vive en cada silla del evento. Las
 * columnas de precio siguen en la tabla porque la comparten los
 * arriendos; Personal no las lee ni las escribe.
 *
 * Lo que decide si una jornada cuesta plata es si LA PERSONA es planta o
 * freelance ese día — atributo de la persona, no del cargo. Por eso
 * TODOS los cargos aparecen en todas partes.
 */
export interface Cargo {
  id: number;
  company_id: number;
  name: string;
  type: string;
  is_active: boolean;
  created_at: string;
}

export interface Persona {
  id: number;
  company_id: number;

  name: string;
  /** Forma limpia: sin puntos, con guion, K mayúscula. */
  rut: string | null;
  phone: string | null;
  email: string | null;

  /** Código de la CMF, 3 dígitos con ceros: '012'. */
  bank_code: string | null;
  account_type: TipoCuenta | null;
  /** TEXTO, nunca número: hay cuentas que parten en cero. */
  account_number: string | null;

  default_role_id: number | null;
  default_kind: TipoPersona;
  /** El horario habitual: se usa al asignarla si el día no dice otro. */
  default_starts_at: string | null;
  default_ends_at: string | null;
  default_break_minutes: number | null;
  /** Días libres semanales (0=domingo..6=sábado). */
  days_off: number[] | null;
  /** El horario habitual POR DÍA DE LA SEMANA: clave "0".."6". */
  weekly_schedule: HorarioSemanal | null;

  status: EstadoPersona;
  blocked_reason: string | null;
  notes: string | null;

  created_at: string;
  updated_at: string;

  /** El cargo, anidado desde el servidor para no pedirlo aparte. Se llama
   *  así porque los cargos viven en la tabla de recursos. */
  management_resources?: { id: number; name: string } | null;
  /** Solo en el historial de una persona: de qué evento fue. */
  quotations?: { quotation_number: number; clients?: { name: string } | null } | null;
}

/** Lo que el formulario manda al guardar. Todo opcional salvo el nombre:
 *  se puede cargar a alguien con lo poco que se sepa e ir completando. */
export interface PersonaFormData {
  name: string;
  rut?: string | null;
  phone?: string | null;
  email?: string | null;
  bank_code?: string | null;
  account_type?: TipoCuenta | null;
  account_number?: string | null;
  default_role_id?: number | null;
  default_kind?: TipoPersona;
  default_starts_at?: string | null;
  default_ends_at?: string | null;
  default_break_minutes?: number | null;
  days_off?: number[] | null;
  weekly_schedule?: HorarioSemanal | null;
  status?: EstadoPersona;
  blocked_reason?: string | null;
  notes?: string | null;
}

/** Si le falta el RUT o algún dato bancario, no se le puede transferir.
 *  Sirve para avisarlo en la lista antes de que llegue el día de pago. */
export const datosParaPagarCompletos = (p: Persona): boolean =>
  !!p.rut && !!p.bank_code && !!p.account_type && !!p.account_number;

/**
 * UNA PERSONA TRABAJANDO UN DÍA DE UN EVENTO.
 *
 * Es el equivalente de la hoja "trabajadores" del Excel: una fila por
 * persona y por día. La nómina, el detalle del garzón y el costo real son
 * VISTAS de esto — no guardan nada propio.
 *
 * El cargo y planta/freelance se guardan acá porque son valores DEL DÍA.
 */
/** El horario de un día de la semana. Lo que falte cae al horario
 *  único de la ficha, y de ahí al estándar de la casa. */
export interface HorarioDeDia {
  in?: string;
  out?: string;
  break?: number;
}
export type HorarioSemanal = Record<string, HorarioDeDia>;

export interface Asignacion {
  id: number;
  /** NULL = restaurante: el evento permanente, sin fechas. */
  quotation_id: string | null;
  /** NULL = SILLA VACÍA: cupo planificado sin nombre (migración 84).
   *  Cuenta para el costo del evento, jamás para la nómina. */
  person_id: number | null;
  /** NULL solo en eventos: silla "por ubicar". */
  day: string | null;
  role_id: number | null;
  kind: TipoPersona;
  starts_at: string | null;
  ends_at: string | null;
  break_minutes: number | null;
  status: "confirmado" | "por_confirmar";
  /** La jornada de ese día. NULL en planta: no cuesta un peso extra. */
  amount: number | null;
  notes: string | null;
  /** Propina del día ya repartida, al peso. NULL = sin repartir. */
  tip_amount: number | null;
  /** No lleva propina ese día: el reparto se la salta. */
  no_tip?: boolean;
  tip_pool_id: number | null;
  /** En qué nómina cayó cada cosa. NULL = pendiente. */
  payroll_id: number | null;
  tip_payroll_id: number | null;
  /** En las filas de nómina el backend manda la persona COMPLETA
   *  (con sus datos bancarios); en el resto, solo lo básico. */
  people?:
    | ({ id: number; name: string; rut: string | null; default_kind: TipoPersona } & Partial<Persona>)
    | null;
  management_resources?: { id: number; name: string } | null;
  /** Solo en el historial de una persona: de qué evento fue. */
  quotations?: {
    quotation_number: number;
    clients?: { name: string } | null;
  } | null;
}

/** El ciclo de la ficha de un evento. */
export type EstadoFicha = "armando" | "confirmado" | "trabajado" | "cerrada";

export interface Ficha {
  id: number;
  quotation_id: string;
  status: EstadoFicha;
  closed_at: string | null;
  /** Cerrada por SQL al arrancar el módulo (migración 86): no es
   *  historial de nadie y la pantalla no la lista. */
  cierre_administrativo?: boolean;
}

/** Un pozo de propina: de un evento o de un día de la planta. Llega
 *  en DOS entregas, separadas por semanas. */
export interface Pozo {
  id: number;
  quotation_id: string | null;
  day: string | null;
  area: string | null;
  first_amount: number;
  second_amount: number;
  distributed_at: string | null;
}

export interface Evaluacion {
  id: number;
  person_id: number;
  quotation_id: string | null;
  stars: number | null;
  note: string | null;
  created_at: string;
}

export interface Nomina {
  id: number;
  label: string;
  created_at: string;
  personas?: number;
  /** Cuántas de esas personas ya están pagadas. */
  pagadas?: number;
  /** Lo que suma la nómina. */
  total?: number;
  /** "banco" = subida, pendiente de pago. "pagada" = no queda nadie. */
  estado?: "banco" | "pagada";
  /** Los pozos sin repartir que la nómina DEJÓ FUERA. */
  fuera?: Pozo[];
}

export interface PagoPersona {
  id: number;
  payroll_id: number;
  person_id: number;
  jornada_paid: boolean;
  propina_paid: boolean;
  paid_at: string | null;
}

export interface NominaDetalle extends Nomina {
  jornadas: Asignacion[];
  propinas: Asignacion[];
  pagos: PagoPersona[];
}

/** Un recado operativo de un día: lo que el personal tiene que hacer.
 *  quotation_id NULL = del día completo; con valor = de ese evento. */
export interface NotaDelDia {
  id: number;
  day: string;
  quotation_id: string | null;
  text: string;
  done: boolean;
  created_at: string;
}

/**
 * UNA LIQUIDACIÓN POR PAGAR: un evento cerrado o un día de restaurante
 * repartido que todavía no entró a ninguna nómina. Se marcan varias y
 * se transforman en una nómina consolidada por persona.
 */
export interface LiquidacionPendiente {
  tipo: "evento" | "dia";
  quotation_id: string | null;
  day: string | null;
  personas: number;
  /** Nombres de quienes no tienen RUT: sin RUT no se sube al banco. */
  sin_rut: string[];
  jornadas: number;
  propinas: number;
  total: number;
}

/** De dónde viene la plata de una línea: un evento, o el restaurante. */
export interface OrigenDeLinea {
  /** null = días sueltos de restaurante. */
  quotation_id: string | null;
  dias: number;
  jornadas: number;
  propinas: number;
}

/** Una línea de la nómina: lo que se le sube al banco a una persona. */
export interface LineaDeNomina {
  person_ids: number[];
  nombre: string;
  rut: string | null;
  bank_code: string | null;
  account_type: string | null;
  account_number: string | null;
  jornadas: number;
  propinas: number;
  total: number;
  detalle: OrigenDeLinea[];
}

/** Lo que se va a pagar, consolidado, ANTES de generar la nómina. */
export interface PreviaNomina {
  personas: LineaDeNomina[];
  total: number;
  sin_rut: string[];
  sin_cuenta: string[];
  fichas_repetidas: string[];
}
