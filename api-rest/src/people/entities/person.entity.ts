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

  created_at: Date;
  updated_at: Date;
}
