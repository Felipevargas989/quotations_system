export type UserRole =
  | "recepcion"
  | "vendedor"
  | "operaciones"
  | "administrador";

export type Section =
  | "dashboard"
  | "requests"
  | "quotations"
  // VER cotizaciones (tablero, ficha, visor) y EDITARLAS son dos cosas
  // distintas desde el 12-08. Antes iban juntas, y por eso no se podía
  // dejar mirar sin entregar también el cotizador — donde se cambian
  // ítems y descuentos. Recepción mira; no edita.
  | "quotations_edit"
  | "clients"
  | "payments"
  | "admin"
  | "user_management"
  | "configuration"
  | "services"
  | "company_configuration"
  | "calendar"
  | "plans"
  | "analytics"
  | "logistics"
  // La libreta de la gente que trabaja: RUT, teléfono y datos bancarios.
  // Es SOLO de administrador (14-08) porque ahí vive la cuenta corriente
  // de cada persona, y eso no lo tiene por qué ver el mostrador.
  | "people"
  // Campañas de correo a toda la cartera: solo administrador (25-08).
  | "marketing"
  | "customer_satisfaction_survey";

// Define which roles can access which sections
export const ROLE_PERMISSIONS: Record<UserRole, Section[]> = {
  // Recepción (12-08, definido con Felipe): contesta el teléfono, toma
  // solicitudes y hace seguimiento. Ve todo lo que el cliente YA SABE
  // —su cotización, su precio, en qué va— y nada de lo que solo sabe la
  // empresa: márgenes, cobranza, totales del negocio.
  // El calendario entra porque sin él no puede responder "¿tienen el 20
  // libre?", que es la pregunta más común del mostrador; y no escribe
  // nada en la base, es solo-mirar por naturaleza.
  recepcion: ["requests", "clients", "quotations", "calendar", "configuration"],
  vendedor: [
    "requests",
    "clients",
    "quotations",
    "quotations_edit",
    "configuration",
  ],
  operaciones: [
    "requests",
    "clients",
    "quotations",
    "quotations_edit",
    "payments",
    "configuration",
    "calendar",
    "logistics",
  ],
  administrador: [
    "dashboard",
    "requests",
    "clients",
    "quotations",
    "quotations_edit",
    "payments",
    "admin",
    "user_management",
    "configuration",
    "services",
    "company_configuration",
    "calendar",
    "plans",
    "analytics",
    "logistics",
    "people",
    "marketing",
    "customer_satisfaction_survey",
  ],
};

// Helper function to check if a role can access a section
export const canAccessSection = (role: UserRole, section: Section): boolean => {
  return ROLE_PERMISSIONS[role]?.includes(section) || false;
};

// Predefined role arrays for common use cases
export const ROLE_GROUPS = {
  ALL_ROLES: [
    "recepcion",
    "vendedor",
    "operaciones",
    "administrador",
  ] as UserRole[],
  SALES_AND_UP: ["vendedor", "operaciones", "administrador"] as UserRole[],
  OPERATIONS_AND_UP: ["operaciones", "administrador"] as UserRole[],
  ADMIN_ONLY: ["administrador"] as UserRole[],
  RECEPTION_AND_UP: [
    "recepcion",
    "vendedor",
    "operaciones",
    "administrador",
  ] as UserRole[],
};

// LOS DERECHOS POR PLAN (14-09-2026, paso 3.2 del roadmap de venta).
//
// Empezó el 14-09 como "módulos propios", para dejar Personal y Marketing
// solo en Valle del Sol. Es el mismo mecanismo, ahora con todos los
// derechos de los tres planes: Personal y Marketing son dos derechos más.
//
// La app NO tiene copia de la tabla de planes. El motor calcula la lista
// de derechos de la empresa y la manda en el perfil (`company.derechos`),
// así que cambiar qué trae un plan no obliga a publicar la web de nuevo.
//
// Y esto es una ayuda visual, no seguridad: el motor niega igual, con el
// mismo derecho. La pantalla esconde para no ofrecer lo que no se puede.
export type Derecho =
  | "base"
  | "varios_dias"
  | "post_venta"
  | "portal"
  | "clientes_360"
  | "calendario"
  | "dashboard_2"
  | "logistica"
  | "gestion_y_cocina"
  | "dashboard_3"
  | "consultas"
  | "correos_automaticos"
  | "encuestas"
  | "movil"
  | "personal"
  | "marketing";

export const SECTION_DERECHO: Partial<Record<Section, Derecho>> = {
  payments: "post_venta",
  logistics: "logistica",
  calendar: "calendario",
  customer_satisfaction_survey: "encuestas",
  people: "personal",
  marketing: "marketing",
};

export type EmpresaConDerechos = {
  derechos?: string[] | null;
  estado_plan?: string | null;
  plan?: string | null;
} | null | undefined;

export const tieneDerecho = (
  company: EmpresaConDerechos,
  derecho?: Derecho | null,
): boolean => !derecho || Boolean(company?.derechos?.includes(derecho));

/** Se le acabó la prueba y no contrató: solo Configuración y Planes. */
export const estaBloqueada = (company: EmpresaConDerechos): boolean =>
  company?.estado_plan === "bloqueado";

// El plan más barato que incluye cada derecho, para decirle al cliente a
// cuál subirse. Los dos módulos propios no se venden: van en null.
export const PLAN_MINIMO: Record<Derecho, "cotiza" | "gestiona" | "crece" | null> = {
  base: "cotiza",
  varios_dias: "gestiona",
  post_venta: "gestiona",
  portal: "gestiona",
  clientes_360: "gestiona",
  calendario: "gestiona",
  dashboard_2: "gestiona",
  logistica: "crece",
  gestion_y_cocina: "crece",
  dashboard_3: "crece",
  consultas: "crece",
  correos_automaticos: "crece",
  encuestas: "crece",
  movil: "crece",
  personal: null,
  marketing: null,
};

export const NOMBRE_DEL_PLAN = {
  cotiza: "Cotiza",
  gestiona: "Gestiona y Cobra",
  crece: "Opera y Crece",
} as const;

export const NOMBRE_DEL_DERECHO: Record<Derecho, string> = {
  base: "Esta función",
  varios_dias: "Los eventos de varios días",
  post_venta: "Post-Venta, pagos y reembolsos",
  portal: "El portal del cliente",
  clientes_360: "Clientes 360",
  calendario: "El Calendario",
  dashboard_2: "Ingresos y Caja",
  logistica: "Proveedores, inventario, recetas y costos",
  gestion_y_cocina: "Gestión y Cocina de Post-Venta",
  dashboard_3: "Los márgenes",
  consultas: "Las consultas con brochure automático",
  correos_automaticos: "Los correos automáticos",
  encuestas: "Las encuestas de satisfacción",
  movil: "Eventia Móvil",
  personal: "El módulo Personal",
  marketing: "El módulo Marketing",
};

export const SECTION_ROLES: Record<Section, UserRole[]> = {
  dashboard: ROLE_GROUPS.ADMIN_ONLY,
  requests: ROLE_GROUPS.ALL_ROLES,
  // Ver: recepción incluida. Editar: de vendedor para arriba.
  quotations: ROLE_GROUPS.RECEPTION_AND_UP,
  quotations_edit: ROLE_GROUPS.SALES_AND_UP,
  clients: ROLE_GROUPS.ALL_ROLES,
  payments: ROLE_GROUPS.OPERATIONS_AND_UP,
  admin: ROLE_GROUPS.ADMIN_ONLY,
  user_management: ROLE_GROUPS.ADMIN_ONLY,
  configuration: ROLE_GROUPS.ALL_ROLES,
  services: ROLE_GROUPS.ADMIN_ONLY,
  company_configuration: ROLE_GROUPS.ADMIN_ONLY,
  calendar: ROLE_GROUPS.RECEPTION_AND_UP,
  plans: ROLE_GROUPS.ALL_ROLES,
  analytics: ROLE_GROUPS.ADMIN_ONLY,
  logistics: ROLE_GROUPS.OPERATIONS_AND_UP,
  people: ROLE_GROUPS.ADMIN_ONLY,
  marketing: ROLE_GROUPS.ADMIN_ONLY,
  customer_satisfaction_survey: ROLE_GROUPS.ADMIN_ONLY,
};
