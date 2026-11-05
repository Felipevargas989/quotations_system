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
  | "customer_satisfaction_survey"
  // Licitaciones y compras ágiles de Mercado Público (doc 17): solo
  // administrador (Felipe, 17-10: "solo el administrador y Camila").
  | "oportunidades"
  // Las boletas de las cabañas (doc 19 §9.4): de recepción hacia arriba
  // (D5), solo con el módulo propio `facturacion` (SECTION_DERECHO). Desde
  // el 05-11 son las pestañas de boletas de la sección Facturación, y quien
  // las ve tiene la entrada del menú (§9.19).
  | "boletas"
  // «Documentos», la lista de Facturación con la cadena de anulaciones
  // (doc 19 §9.5): desde el 05-11, operaciones y el administrador (§9.19,
  // Felipe: «ver, reporte y PDF»). Anular sigue solo del administrador
  // (E5), y eso lo cuida el motor. Con el módulo propio `facturacion`.
  | "facturacion";

// Define which roles can access which sections
export const ROLE_PERMISSIONS: Record<UserRole, Section[]> = {
  // Recepción (12-08, definido con Felipe): contesta el teléfono, toma
  // solicitudes y hace seguimiento. Ve todo lo que el cliente YA SABE
  // —su cotización, su precio, en qué va— y nada de lo que solo sabe la
  // empresa: márgenes, cobranza, totales del negocio.
  // El calendario entra porque sin él no puede responder "¿tienen el 20
  // libre?", que es la pregunta más común del mostrador; y no escribe
  // nada en la base, es solo-mirar por naturaleza.
  // 03-10-2026 (Felipe: "requerimiento y calendario, pero no más que
  // eso"): recepción deja de ver Cotizaciones, Consultas y Clientes.
  // OJO: este archivo tiene DOS listas que deben decir lo mismo: esta
  // (el menú lateral, vía canAccessSection) y SECTION_ROLES más abajo
  // (las rutas, vía PermissionGuard). El 03-10 se cambió solo la de
  // abajo y el menú siguió ofreciendo pantallas que la ruta rebotaba.
  // 04-11-2026 (doc 21, Felipe: "recepción podría ver la parte de
  // cotizaciones de personas naturales... crear, editar y enviar"):
  // vuelve a ver Cotizaciones, pero el motor le entrega solo las de
  // clientes particulares (y los requerimientos de todos).
  recepcion: [
    "requests",
    "quotations",
    "quotations_edit",
    "calendar",
    "configuration",
    "boletas",
  ],
  vendedor: [
    "requests",
    "clients",
    "quotations",
    "quotations_edit",
    "configuration",
    "boletas",
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
    "boletas",
    "facturacion",
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
    "oportunidades",
    "boletas",
    "facturacion",
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
  | "marketing"
  | "oportunidades"
  // El botón «✨ Crear con IA» (17-10-2026): módulo propio de Valle del Sol.
  | "cotizar_con_ia"
  // «✉ Generar seguimiento» (17-10-2026, doc 18): módulo propio de Valle
  // del Sol (sus llaves y sus buzones).
  | "seguimiento_con_ia"
  // BelIA, la asistente con IA (doc 20, migración 180): módulo propio.
  | "asistente"
  // La facturación electrónica (doc 19, migración 184): módulo propio de
  // Valle del Sol.
  | "facturacion";

export const SECTION_DERECHO: Partial<Record<Section, Derecho>> = {
  payments: "post_venta",
  logistics: "logistica",
  calendar: "calendario",
  customer_satisfaction_survey: "encuestas",
  people: "personal",
  marketing: "marketing",
  oportunidades: "oportunidades",
  boletas: "facturacion",
  facturacion: "facturacion",
};

export type EmpresaConDerechos =
  | {
      derechos?: string[] | null;
      estado_plan?: string | null;
      plan?: string | null;
    }
  | null
  | undefined;

export const tieneDerecho = (
  company: EmpresaConDerechos,
  derecho?: Derecho | null,
): boolean => !derecho || Boolean(company?.derechos?.includes(derecho));

/** Se le acabó la prueba y no contrató: solo Configuración y Planes. */
export const estaBloqueada = (company: EmpresaConDerechos): boolean =>
  company?.estado_plan === "bloqueado";

// El plan más barato que incluye cada derecho, para decirle al cliente a
// cuál subirse. Los dos módulos propios no se venden: van en null.
export const PLAN_MINIMO: Record<
  Derecho,
  "cotiza" | "gestiona" | "crece" | null
> = {
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
  oportunidades: null,
  cotizar_con_ia: null,
  seguimiento_con_ia: null,
  // BelIA en todos los planes desde el 04-11-2026 (antes, módulo propio).
  asistente: "cotiza",
  facturacion: null,
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
  oportunidades: "El módulo de Oportunidades",
  cotizar_con_ia: "Cotizar con IA",
  seguimiento_con_ia: "El seguimiento con IA",
  asistente: "BelIA, la asistente de Eventia",
  facturacion: "La facturación electrónica",
};

export const SECTION_ROLES: Record<Section, UserRole[]> = {
  dashboard: ROLE_GROUPS.ADMIN_ONLY,
  requests: ROLE_GROUPS.ALL_ROLES,
  // Recepción solo ve Requerimientos y Calendario (Felipe, 03-10-2026:
  // "creo que el perfil de recepción ve demasiadas cosas ... requerimiento
  // y calendario, pero no más que eso"). Cotizaciones, Consultas, la ficha
  // del negocio y Clientes pasan a vendedor para arriba. El motor sigue
  // dejándole buscar y crear clientes DENTRO del formulario de
  // requerimiento, que lo necesita.
  // Desde el doc 21, recepción también: el motor le filtra lo que ve.
  quotations: ROLE_GROUPS.RECEPTION_AND_UP,
  quotations_edit: ROLE_GROUPS.RECEPTION_AND_UP,
  clients: ROLE_GROUPS.SALES_AND_UP,
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
  oportunidades: ROLE_GROUPS.ADMIN_ONLY,
  boletas: ROLE_GROUPS.RECEPTION_AND_UP,
  facturacion: ROLE_GROUPS.OPERATIONS_AND_UP,
};
