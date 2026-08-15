import type { TipoCuenta } from "../utils/bancos";
import type { EstadoPersona, TipoPersona } from "../utils/estadoPersona";

/**
 * UN CARGO.
 *
 * Vive en `management_resources` con type='personal' — la MISMA tabla que
 * usa Recursos. Eran dos listas hasta el 14-08 y se fusionaron: Garzón
 * estaba escrito en las dos.
 *
 * `list_price_fixed` es el precio de referencia Y la señal de si el cargo
 * se contrata: CON precio aparece en Recursos; SIN precio solo sirve para
 * asignar gente en la grilla.
 */
export interface Cargo {
  id: number;
  company_id: number;
  name: string;
  type: string;
  is_active: boolean;
  list_price_fixed: number | null;
  last_price: number | null;
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

  status: EstadoPersona;
  blocked_reason: string | null;
  notes: string | null;

  created_at: string;
  updated_at: string;

  /** El cargo, anidado desde el servidor para no pedirlo aparte. Se llama
   *  así porque los cargos viven en la tabla de recursos. */
  management_resources?: { id: number; name: string } | null;
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
  status?: EstadoPersona;
  blocked_reason?: string | null;
  notes?: string | null;
}

/** Si le falta el RUT o algún dato bancario, no se le puede transferir.
 *  Sirve para avisarlo en la lista antes de que llegue el día de pago. */
export const datosParaPagarCompletos = (p: Persona): boolean =>
  !!p.rut && !!p.bank_code && !!p.account_type && !!p.account_number;
