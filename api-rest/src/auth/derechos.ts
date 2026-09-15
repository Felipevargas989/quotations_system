import { ForbiddenException } from '@nestjs/common';

// LOS DERECHOS POR PLAN (14-09-2026, paso 3.2 del roadmap de venta).
//
// LA REGLA, y es la única que importa: el código NUNCA pregunta "¿qué plan
// tiene esta empresa?". Pregunta "¿tiene el derecho `calendario`?". El plan
// es solo la etiqueta comercial que rellena la lista de derechos, y vive
// entera en este archivo. Así Felipe cambia precios, nombres o el armado de
// los paquetes tocando la tabla de abajo, sin que nadie ande buscando
// `if (plan === 'gestiona')` por el sistema.
//
// Es el patrón que usa la industria para esto (entitlements). Lo dice
// Stigg entre otros: preguntar por el identificador del plan hace el código
// frágil, porque cualquier cambio de precio o de paquete obliga a tocarlo.
//
// Los módulos propios de la migración 111 (personal, marketing) son dos
// derechos más: no los da ningún plan, los da la columna `modulos_propios`
// de la empresa. Valle del Sol los conserva.
//
// Hay dos clases de derecho, y se cuidan en lugares distintos:
//  - De sí o no (`Derecho`): los aplica DerechosGuard en la puerta, o una
//    revisión en el servicio cuando depende de los datos.
//  - De cantidad (usuarios, cotizaciones al mes): SIEMPRE en el servicio,
//    contando antes de crear. Nunca en la puerta: la puerta no sabe contar.

export type Plan = 'cotiza' | 'gestiona' | 'crece';

export type EstadoPlan =
  | 'prueba'
  | 'activo'
  // Cortesía (migración 113): usa todo su plan y el cobro no lo persigue.
  // Es para la propia Valle del Sol, para la demo, y para el cliente al
  // que Felipe decida regalarle el sistema.
  | 'gratis'
  | 'moroso'
  | 'bloqueado';

export type Derecho =
  // Lo que trae cualquier plan: requerimientos, formulario público,
  // cotizador de un día, catálogo, clientes básico, envío por correo,
  // Dashboard nivel 1, Configuración.
  | 'base'
  | 'varios_dias'
  | 'post_venta'
  | 'portal'
  | 'clientes_360'
  | 'calendario'
  | 'dashboard_2'
  | 'logistica'
  | 'gestion_y_cocina'
  | 'dashboard_3'
  | 'consultas'
  | 'correos_automaticos'
  | 'encuestas'
  | 'movil'
  // Módulos propios (migración 111): no los da ningún plan.
  | 'personal'
  | 'marketing';

/** Lo que el motor calcula una vez y viaja en la sesión y en el perfil. */
export type Derechos = {
  derechos: Derecho[];
  /** null = sin tope. */
  usuarios_max: number | null;
  /** null = sin tope. */
  cotizaciones_mes: number | null;
};

const DE_COTIZA: Derecho[] = ['base'];

const DE_GESTIONA: Derecho[] = [
  ...DE_COTIZA,
  'varios_dias',
  'post_venta',
  'portal',
  'clientes_360',
  'calendario',
  'dashboard_2',
];

const DE_CRECE: Derecho[] = [
  ...DE_GESTIONA,
  'logistica',
  'gestion_y_cocina',
  'dashboard_3',
  'consultas',
  'correos_automaticos',
  'encuestas',
  'movil',
];

// LA TABLA. Es lo único que hay que tocar para cambiar qué trae cada plan.
// Los planes son acumulativos: cada uno incluye todo lo del anterior.
// Precios y contenido: PLANES_DE_EVENTIA_DEFINIDOS.md, firmado el 14-09.
export const DERECHOS_POR_PLAN: Record<Plan, Derechos> = {
  cotiza: {
    derechos: DE_COTIZA,
    usuarios_max: 1,
    cotizaciones_mes: 20,
  },
  gestiona: {
    derechos: DE_GESTIONA,
    usuarios_max: 3,
    cotizaciones_mes: null,
  },
  crece: {
    derechos: DE_CRECE,
    usuarios_max: null,
    cotizaciones_mes: null,
  },
};

/** El nombre con que Felipe los vende. Va en los avisos al usuario. */
export const NOMBRE_DEL_PLAN: Record<Plan, string> = {
  cotiza: 'Cotiza',
  gestiona: 'Gestiona y Cobra',
  crece: 'Opera y Crece',
};

/**
 * El plan más barato que incluye cada derecho. Solo sirve para decirle al
 * usuario a cuál tiene que subirse. Los dos módulos propios no se venden:
 * por eso van en null y su aviso no ofrece ninguna mejora de plan.
 */
export const PLAN_MINIMO: Record<Derecho, Plan | null> = {
  base: 'cotiza',
  varios_dias: 'gestiona',
  post_venta: 'gestiona',
  portal: 'gestiona',
  clientes_360: 'gestiona',
  calendario: 'gestiona',
  dashboard_2: 'gestiona',
  logistica: 'crece',
  gestion_y_cocina: 'crece',
  dashboard_3: 'crece',
  consultas: 'crece',
  correos_automaticos: 'crece',
  encuestas: 'crece',
  movil: 'crece',
  personal: null,
  marketing: null,
};

/** Cómo se llama cada derecho cuando hay que explicárselo a una persona. */
export const NOMBRE_DEL_DERECHO: Record<Derecho, string> = {
  base: 'Esta función',
  varios_dias: 'Los eventos de varios días',
  post_venta: 'Post-Venta, pagos y reembolsos',
  portal: 'El portal del cliente',
  clientes_360: 'Clientes 360',
  calendario: 'El Calendario',
  dashboard_2: 'Ingresos y Caja',
  logistica: 'Proveedores, inventario, recetas y costos',
  gestion_y_cocina: 'Gestión y Cocina de Post-Venta',
  dashboard_3: 'Los márgenes',
  consultas: 'Las consultas con brochure automático',
  correos_automaticos: 'Los correos automáticos',
  encuestas: 'Las encuestas de satisfacción',
  movil: 'Eventia Móvil',
  personal: 'El módulo Personal',
  marketing: 'El módulo Marketing',
};

/** Lo que el motor trata como empresa para calcular derechos. */
// Se escriben como `string` a propósito y no como `Plan`/`EstadoPlan`: lo
// que llega de la base es texto suelto, y una fila vieja o una migración
// sin aplicar traen cualquier cosa. Quien decide qué es válido es
// `derechosDe`, más abajo, y lo hace mirando el valor real.
export type EmpresaConPlan = {
  plan?: string | null;
  estado_plan?: string | null;
  modulos_propios?: string[] | null;
};

const SIN_NADA: Derechos = {
  derechos: [],
  usuarios_max: 0,
  cotizaciones_mes: 0,
};

const esPlan = (v: unknown): v is Plan =>
  v === 'cotiza' || v === 'gestiona' || v === 'crece';

const esModuloPropio = (v: string): v is Derecho =>
  v === 'personal' || v === 'marketing';

/**
 * Los derechos de una empresa. Única fuente de verdad: lo llaman AuthGuard
 * (para la sesión), el perfil que recibe la app y las rutas públicas que
 * resuelven la empresa desde un token.
 *
 * Cuatro reglas, en este orden:
 *  1. Bloqueada (terminó la prueba sin pagar) → ningún derecho. Solo puede
 *     entrar a Configuración y a Planes, y de eso se encarga el guardián.
 *  2. En prueba → vive los 7 días con los derechos de Opera y Crece.
 *     Decisión de Felipe: el que prueba todo compra más arriba.
 *  3. Activa, de cortesía o morosa → los de su plan. La de cortesía nunca
 *     paga y nadie la va a perseguir; la morosa conserva todo durante la
 *     gracia y solo recibe avisos.
 *  4. Siempre se suman los módulos propios (Personal y Marketing), que no
 *     los da ningún plan sino la columna `modulos_propios`.
 *
 * Si la empresa viene sin plan (migración 112 sin aplicar, o fila vieja),
 * se la trata como Cotiza en prueba: el plan más chico, nunca más. Es la
 * elección segura — pero en producción la migración va ANTES del deploy,
 * justamente para que esto no ocurra.
 */
export function derechosDe(
  empresa: EmpresaConPlan | null | undefined,
): Derechos {
  const estado = empresa?.estado_plan ?? 'prueba';
  if (estado === 'bloqueado') return SIN_NADA;

  const plan = esPlan(empresa?.plan) ? empresa.plan : 'cotiza';
  const base =
    estado === 'prueba' ? DERECHOS_POR_PLAN.crece : DERECHOS_POR_PLAN[plan];

  const propios = (empresa?.modulos_propios ?? []).filter(esModuloPropio);

  return {
    derechos: [...base.derechos, ...propios],
    usuarios_max: base.usuarios_max,
    cotizaciones_mes: base.cotizaciones_mes,
  };
}

export const tieneDerecho = (
  derechos: Derecho[] | undefined,
  derecho: Derecho,
): boolean => (derechos ?? []).includes(derecho);

/**
 * El cuerpo del 403 cuando falta un derecho. La app lo reconoce por
 * `codigo` y muestra "mejora tu plan" en vez de un error rojo; por eso el
 * formato es fijo y no se cambia sin tocar también la app.
 */
export function assertDerecho(
  derechos: Derecho[] | undefined,
  derecho: Derecho,
): void {
  if (tieneDerecho(derechos, derecho)) return;

  const minimo = PLAN_MINIMO[derecho];
  const que = NOMBRE_DEL_DERECHO[derecho];
  throw new ForbiddenException({
    codigo: 'SIN_DERECHO',
    derecho,
    plan_minimo: minimo,
    mensaje: minimo
      ? `${que} ${que.startsWith('Los') || que.startsWith('Las') ? 'están' : 'está'} en el plan ${NOMBRE_DEL_PLAN[minimo]}.`
      : `${que} no está disponible para tu empresa.`,
  });
}

/**
 * El tope de cantidad: usuarios de la empresa y cotizaciones del mes.
 *
 * OJO, y queda dicho a propósito: dos cotizaciones creadas en el mismo
 * segundo pueden pasar ambas como la número 20. Es un tope comercial, no
 * un candado de seguridad — nadie ve datos de otra empresa por esto — y no
 * vale encerrarlo en una transacción con lo que costaría.
 */
export function assertCupo(
  limite: 'usuarios_max' | 'cotizaciones_mes',
  usados: number,
  tope: number | null | undefined,
  plan: string | null | undefined,
): void {
  if (tope === null || tope === undefined) return; // sin tope
  if (usados < tope) return;

  const actual = esPlan(plan) ? NOMBRE_DEL_PLAN[plan] : 'tu plan';
  const mensaje =
    limite === 'usuarios_max'
      ? `El plan ${actual} incluye ${tope} ${tope === 1 ? 'usuario' : 'usuarios'}. Para agregar más, sube de plan.`
      : `Usaste las ${tope} cotizaciones de este mes del plan ${actual}. El plan ${NOMBRE_DEL_PLAN.gestiona} no tiene tope.`;

  throw new ForbiddenException({
    codigo: 'SIN_CUPO',
    limite,
    tope,
    usados,
    plan_minimo: 'gestiona',
    mensaje,
  });
}
