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

  status: EstadoPersona;
  blocked_reason?: string | null;
  notes?: string | null;

  created_at: Date;
  updated_at: Date;
}

export class JobRole {
  id: number;
  company_id: Company['id'];
  name: string;
  is_active: boolean;
  sort_order: number;
  created_at: Date;
}
