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
  // La sección Facturación (doc 19 §9.19), con el nombre que tuvo cuando
  // eran las boletas de las cabañas: solo con el módulo propio
  // `facturacion` (SECTION_DERECHO). Desde el 07-11 (§9.23) la ve quien
  // tenga cualquiera de sus cinco permisos (SECTION_PERMISO): de fábrica,
  // recepción, operaciones y el administrador; el vendedor ya no.
  | "boletas"
  // «Documentos», la lista de Facturación con la cadena de anulaciones
  // (doc 19 §9.5): desde el 05-11, operaciones y el administrador (§9.19,
  // Felipe: «ver, reporte y PDF»). Anular sigue solo del administrador
  // (E5), y eso lo cuida el motor. Con el módulo propio `facturacion`.
  | "facturacion";

// Define which roles can access which sections. Desde los permisos por
// cargo (doc 22, 05-11-2026) solo deciden las secciones sin permiso (Mi
// cuenta y Planes): las demás las decide SECTION_PERMISO.
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

// LOS PERMISOS POR CARGO (doc 22, 05-11-2026). Felipe: «transformar hoy
// todos los permisos existentes en pestañas que se puedan deslizar como
// botones». Cada empresa prende y apaga, por cargo, las secciones del menú
// (Mi empresa → Usuarios → Permisos por cargo).
//
// La app NO guarda copia de la configuración: el motor manda en el perfil
// la lista de permisos prendidos del cargo (`permisos`), con la misma
// cuenta con que cierra sus puertas. Las secciones que tienen permiso dejan
// de mirar ROLE_PERMISSIONS y SECTION_ROLES: el menú y las rutas preguntan
// lo mismo. Las que no tienen (Mi cuenta y Planes) siguen como estaban.
export type Permiso =
  | "requerimientos"
  | "cotizaciones"
  | "consultas"
  | "clientes"
  | "belia"
  | "calendario"
  | "postventa"
  | "proveedores"
  // Facturación (doc 22 §7), con el módulo propio `facturacion`. «Facturar
  // eventos», desde el 07-11 (doc 19 §9.23).
  | "boletas"
  | "facturacion_eventos"
  | "facturacion_documentos"
  | "facturacion_notas"
  | "facturacion_ajustes"
  | "dashboard"
  | "catalogo"
  | "personal"
  | "marketing"
  | "oportunidades"
  | "encuestas"
  | "mi_empresa"
  | "usuarios";

/** Los permisos de Facturación: con cualquiera de ellos se entra a la
 *  sección (doc 19 §9.23), y adentro cada pestaña pide el suyo
 *  (FacturacionPage). Así, apagar uno no deja afuera de los otros. */
export const PERMISOS_DE_FACTURACION: readonly Permiso[] = [
  "boletas",
  "facturacion_eventos",
  "facturacion_documentos",
  "facturacion_notas",
  "facturacion_ajustes",
];

/** Cada sección con su permiso; con una lista, basta cualquiera. */
export const SECTION_PERMISO: Partial<
  Record<Section, Permiso | readonly Permiso[]>
> = {
  dashboard: "dashboard",
  analytics: "dashboard",
  requests: "requerimientos",
  quotations: "cotizaciones",
  quotations_edit: "cotizaciones",
  clients: "clientes",
  payments: "postventa",
  admin: "usuarios",
  user_management: "usuarios",
  services: "catalogo",
  company_configuration: "mi_empresa",
  calendar: "calendario",
  logistics: "proveedores",
  // Facturación: entra quien tenga cualquiera de sus permisos (§9.23).
  boletas: PERMISOS_DE_FACTURACION,
  facturacion: "facturacion_documentos",
  people: "personal",
  marketing: "marketing",
  customer_satisfaction_survey: "encuestas",
  oportunidades: "oportunidades",
};

const DE_TODOS: Permiso[] = [
  "requerimientos",
  "cotizaciones",
  "consultas",
  "belia",
  "calendario",
];

// Lo de fábrica, que es lo de hoy: lo mismo que `api-rest/src/auth/
// permisos.ts`. Solo se usa si el motor todavía no manda la lista (el
// despliegue va motor primero) o con un perfil viejo guardado en el
// navegador. El Calendario del vendedor, prendido (Felipe, 05-11-2026).
// Las boletas y facturas del tarifario, sin el vendedor, y «Facturar
// eventos», de operaciones y el administrador (doc 19 §9.23, 07-11).
export const PERMISOS_DE_FABRICA: Record<UserRole, Permiso[]> = {
  recepcion: [...DE_TODOS, "boletas"],
  vendedor: [...DE_TODOS, "clientes"],
  operaciones: [
    ...DE_TODOS,
    "clientes",
    "postventa",
    "proveedores",
    "boletas",
    "facturacion_eventos",
    "facturacion_documentos",
  ],
  administrador: [
    ...DE_TODOS,
    "clientes",
    "postventa",
    "proveedores",
    "boletas",
    "facturacion_eventos",
    "facturacion_documentos",
    "facturacion_notas",
    "facturacion_ajustes",
    "dashboard",
    "catalogo",
    "personal",
    "marketing",
    "oportunidades",
    "encuestas",
    "mi_empresa",
    "usuarios",
  ],
};

/** Los permisos prendidos de quien está conectado: los del perfil; sin
 *  ellos, los de fábrica de su cargo. Sin cargo, ninguno. */
export const permisosDe = (
  role: UserRole | null | undefined,
  delPerfil?: string[] | null,
): Permiso[] =>
  Array.isArray(delPerfil)
    ? (delPerfil as Permiso[])
    : role
      ? (PERMISOS_DE_FABRICA[role] ?? [])
      : [];

/** ¿Alguno de los prendidos abre la sección? Con una lista, basta uno. */
const abre = (
  permisos: readonly Permiso[],
  deLaSeccion: Permiso | readonly Permiso[],
): boolean =>
  typeof deLaSeccion === "string"
    ? permisos.includes(deLaSeccion)
    : deLaSeccion.some((p) => permisos.includes(p));

// Helper function to check if a role can access a section (the menu).
// Con permiso por cargo, manda el permiso; si no, la lista de siempre.
export const canAccessSection = (
  role: UserRole,
  section: Section,
  permisos: readonly Permiso[] = permisosDe(role),
): boolean => {
  const permiso = SECTION_PERMISO[section];
  if (permiso) return abre(permisos, permiso);
  return ROLE_PERMISSIONS[role]?.includes(section) || false;
};

/** ¿Puede entrar a la ruta? Igual que el menú para las secciones con
 *  permiso; las demás, con SECTION_ROLES (Planes es de todos por la
 *  ruta, aunque el menú la muestre solo al administrador). */
export const puedeEntrar = (
  role: UserRole | null | undefined,
  section: Section,
  permisos: readonly Permiso[] = permisosDe(role),
): boolean => {
  if (!role) return false;
  const permiso = SECTION_PERMISO[section];
  if (permiso) return abre(permisos, permiso);
  return SECTION_ROLES[section].includes(role);
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

// Las rutas. Igual que ROLE_PERMISSIONS: desde el doc 22 solo decide en
// las secciones sin permiso por cargo (`puedeEntrar`).
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
  // Facturación: sin el vendedor desde el 07-11 (doc 19 §9.23).
  boletas: ["recepcion", "operaciones", "administrador"],
  facturacion: ROLE_GROUPS.OPERATIONS_AND_UP,
};
