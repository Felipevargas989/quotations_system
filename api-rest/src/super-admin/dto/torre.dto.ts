// Torre de Control (tanda 1, 05-08): lo que consume la página
// superAdmin del frontend — tabla "quién ha entrado" + tarjetas.

export interface TorreUsuario {
  email: string;
  nombre: string;
  empresa: string;
  rol: string;
  ultimo_inicio_sesion: string | null;
  creado: string | null;
}

export interface TorreTarjetas {
  empresas_total: number;
  empresas_mes: number;
  usuarios_total: number;
  usuarios_mes: number;
  leads_total: number;
  leads_mes: number;
}

// Una empresa vista desde la Torre (paso 3.2, 14-09-2026): es donde
// Felipe activa el plan de un cliente que le pagó, mientras el cobro
// automático no exista.
export interface TorreEmpresa {
  id: number;
  nombre: string;
  creada: string | null;
  plan: string | null;
  estado_plan: string | null;
  prueba_vence: string | null;
  modulos_propios: string[];
  usuarios: number;
  usuarios_max: number | null;
  cotizaciones_mes: number | null;
}

export interface TorreResponse {
  usuarios: TorreUsuario[];
  tarjetas: TorreTarjetas;
  empresas: TorreEmpresa[];
}

// Crudos que entrega el repositorio para armar la torre.
export interface TorreBase {
  authUsers: {
    email: string | null;
    last_sign_in_at: string | null;
    created_at: string | null;
  }[];
  profiles: {
    email: string | null;
    full_name: string | null;
    role: string | null;
    company_id: number | null;
  }[];
  companies: {
    id: number;
    name: string;
    created_at: string | null;
    // Migración 112: el plan y su estado, para la tabla de empresas.
    plan: string | null;
    estado_plan: string | null;
    prueba_vence: string | null;
    modulos_propios: string[] | null;
  }[];
}
