import { Company } from 'src/companies/entities/company.entity';

/** Los cuatro tipos de cuenta que existen en Chile.
 *  `cuenta_rut` es en realidad una cuenta vista: se guarda aparte solo
 *  porque su número se llena solo (el RUT sin el dígito verificador). */
export type TipoCuenta = 'cuenta_rut' | 'corriente' | 'vista' | 'ahorro';

/** Planta cobra sueldo aparte; freelance cobra por jornada.
 *  Es un valor POR DEFECTO: se puede cambiar en cada día trabajado. */
export type TipoPersona = 'planta' | 'freelance';

/** `bloqueada` es una decisión ("no llamar más") y exige motivo escrito.
 *  `no_disponible` NO es una mala nota: alguien puede ser excelente y
 *  haberse ido a estudiar. */
export type EstadoPersona = 'activa' | 'no_disponible' | 'bloqueada';

export class Person {
  id: number;
  company_id: Company['id'];

  name: string;
  /** Forma limpia: sin puntos, con guion, K mayúscula. */
  rut?: string | null;
  phone?: string | null;
  email?: string | null;

  /** Código de institución de la CMF, 3 dígitos con ceros: '012'. */
  bank_code?: string | null;
  account_type?: TipoCuenta | null;
  /** TEXTO, nunca número: hay cuentas que parten en cero. */
  account_number?: string | null;

  default_role_id?: number | null;
  default_kind: TipoPersona;
  /** El horario habitual: se usa al asignarla si el día no dice otro. */
  default_starts_at?: string | null;
  default_ends_at?: string | null;
  default_break_minutes?: number | null;
  /** Días libres semanales (0=domingo..6=sábado). La carga automática de
   *  planta se los salta. */
  days_off?: number[] | null;
  /** El horario habitual POR DÍA DE LA SEMANA (15-08): el sábado no se
   *  entra a la misma hora que el lunes. Clave "0".."6". Sin entrada
   *  para un día, se usa el horario único de la ficha. */
  weekly_schedule?: Record<
    string,
    { in?: string; out?: string; break?: number }
  > | null;

  status: EstadoPersona;
  blocked_reason?: string | null;
  notes?: string | null;

  created_at: Date;
  updated_at: Date;
}

/**
 * UN CARGO.
 *
 * Vive en `management_resources` con type='personal' — la misma tabla que
 * usa Recursos. Eran dos listas hasta el 14-08 y se fusionaron.
 *
 * `list_price_fixed` es el precio de referencia. El precio es solo una SUGERENCIA para ahorrar tecleo.
 *
 * NO decide nada: un garzón de planta no cuesta y el mismo cargo con un
 * freelance sí. Lo que decide si una jornada cuesta plata es si LA PERSONA
 * es planta o freelance ese día — atributo de la persona, no del cargo.
 * Por eso TODOS los cargos aparecen en todas partes, tengan precio o no.
 */
export class Cargo {
  id: number;
  company_id: Company['id'];
  name: string;
  type: string;
  is_active: boolean;
  list_price_fixed: number | null;
  last_price: number | null;
  created_at: Date;
}

/**
 * UNA PERSONA TRABAJANDO UN DÍA DE UN EVENTO.
 *
 * Es el equivalente de la hoja "trabajadores" del Excel: una fila por
 * persona y por día. La nómina, el detalle del garzón y el costo real son
 * VISTAS de esta tabla — no guardan nada propio.
 *
 * `role_id` y `kind` se guardan acá porque son valores DEL DÍA: Camila
 * Ganga fue Recepción el 2 de agosto y Garzón el 6; Camila Carvajal, de
 * planta, cobró jornada el día que trabajó en su día libre.
 */
export class EventStaff {
  id: number;
  company_id: Company['id'];
  quotation_id: string;
  person_id: number;

  day: string;
  role_id: number | null;
  kind: TipoPersona;

  starts_at: string | null;
  ends_at: string | null;
  break_minutes: number | null;

  status: 'confirmado' | 'por_confirmar';
  /** La jornada de ese día. NULL en planta: no cuesta un peso extra. */
  amount: number | null;
  notes: string | null;

  /** Propina del día ya repartida, al peso. NULL = sin repartir. */
  tip_amount: number | null;
  /** Esa persona NO lleva propina ese día: el reparto se la salta.
   *  Su jornada se paga igual. */
  no_tip: boolean;
  tip_pool_id: number | null;
  /** En qué nómina cayó cada cosa. NULL = pendiente — no hay que
   *  acordarse de nada (regla de la casa: la nómina es un selector). */
  payroll_id: number | null;
  tip_payroll_id: number | null;

  created_at: Date;
  updated_at: Date;
}

/** El ciclo de la ficha de un evento: armando → confirmado →
 *  trabajado → cerrada. El paso "trabajado" es el que hoy no existe
 *  y la razón de que el Excel no sepa a quién se le debe. */
export class StaffSheet {
  id: number;
  company_id: Company['id'];
  quotation_id: string;
  status: 'armando' | 'confirmado' | 'trabajado' | 'cerrada';
  closed_at: string | null;
  created_at: Date;
}

/** Un pozo de propina: de un evento (quotation_id) o de un día de la
 *  planta (day, con área opcional). Llega en DOS entregas. */
export class TipPool {
  id: number;
  company_id: Company['id'];
  quotation_id: string | null;
  day: string | null;
  area: string | null;
  first_amount: number;
  second_amount: number;
  distributed_at: string | null;
  created_at: Date;
}

/** Una evaluación por persona por evento, al cerrar la ficha. La nota
 *  puede ir SIN estrella ("solo fines de semana", "no maneja"). */
export class PersonReview {
  id: number;
  company_id: Company['id'];
  person_id: number;
  quotation_id: string | null;
  stars: number | null;
  note: string | null;
  created_at: Date;
}

export class Payroll {
  id: number;
  company_id: Company['id'];
  label: string;
  created_at: Date;
}

/** El pago persona a persona de una nómina. Jornada y propina van POR
 *  SEPARADO: los eventos cruzan de semana y la propina llega al final. */
export class PayrollPerson {
  id: number;
  company_id: Company['id'];
  payroll_id: number;
  person_id: number;
  jornada_paid: boolean;
  propina_paid: boolean;
  paid_at: string | null;
}

/** Un recado operativo de un día: lo que el personal tiene que hacer.
 *  quotation_id NULL = nota del día completo; con valor = de ese
 *  evento ese día. */
export class DayNote {
  id: number;
  company_id: Company['id'];
  day: string;
  quotation_id: string | null;
  text: string;
  done: boolean;
  created_at: Date;
}
