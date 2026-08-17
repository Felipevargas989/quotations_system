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

// Section-specific role arrays
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
  customer_satisfaction_survey: ROLE_GROUPS.ADMIN_ONLY,
};
