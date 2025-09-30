export type UserRole =
  | "recepcion"
  | "vendedor"
  | "operaciones"
  | "administrador";

export type Section =
  | "dashboard"
  | "requests"
  | "quotations"
  | "clients"
  | "payments"
  | "admin"
  | "user_management"
  | "configuration"
  | "services"
  | "company_configuration"
  | "calendar";

// Define which roles can access which sections
export const ROLE_PERMISSIONS: Record<UserRole, Section[]> = {
  recepcion: ["requests", "clients", "configuration"],
  vendedor: ["requests", "clients", "quotations", "configuration"],
  operaciones: [
    "requests",
    "clients",
    "quotations",
    "payments",
    "configuration",
  ],
  administrador: [
    "dashboard",
    "requests",
    "clients",
    "quotations",
    "payments",
    "admin",
    "user_management",
    "configuration",
    "services",
    "company_configuration",
    "calendar",
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
  quotations: ROLE_GROUPS.SALES_AND_UP,
  clients: ROLE_GROUPS.ALL_ROLES,
  payments: ROLE_GROUPS.OPERATIONS_AND_UP,
  admin: ROLE_GROUPS.ADMIN_ONLY,
  user_management: ROLE_GROUPS.ADMIN_ONLY,
  configuration: ROLE_GROUPS.ALL_ROLES,
  services: ROLE_GROUPS.ADMIN_ONLY,
  company_configuration: ROLE_GROUPS.ADMIN_ONLY,
  calendar: ROLE_GROUPS.ADMIN_ONLY,
};
