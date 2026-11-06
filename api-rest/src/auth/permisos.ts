import { ForbiddenException } from '@nestjs/common';
import { UserRole } from 'src/users/entities/user.entity';
import type { Derecho } from './derechos';

// LOS PERMISOS POR CARGO (doc 22, 05-11-2026).
//
// Felipe: «deberíamos transformar hoy todos los permisos existentes en
// pestañas que se puedan deslizar como botones (lo típico en estos casos) y
// así prendo y/o apago los permisos existentes». Aprobó la maqueta y, el
// mismo día, el catálogo de abajo («ok al catalogo vamos»), con el
// Calendario del vendedor prendido.
//
// Tres reglas:
//  - Lo de fábrica es lo de hoy: el día que se instala, nadie gana ni pierde
//    nada. Lo prueba `tests/permisos-de-fabrica.spec.ts`, puerta por puerta.
//  - La base guarda solo lo que cada empresa aparta de fábrica
//    (`permisos_por_cargo`, migración 188). Un permiso nuevo que se agregue
//    acá llega a todas las empresas con su valor de fábrica.
//  - Mi empresa y Usuarios son fijos: el administrador nunca queda afuera.
//
// El cargo, el permiso y el derecho del plan son tres preguntas, y las tres
// tienen que decir que sí: RolesGuard hace las dos primeras y DerechosGuard
// la tercera, que no cambia.

export type Permiso =
  | 'requerimientos'
  | 'cotizaciones'
  | 'consultas'
  | 'clientes'
  | 'belia'
  | 'calendario'
  | 'postventa'
  | 'proveedores'
  // Facturación (doc 19 y doc 22 §7): sus cuatro, desde que el módulo
  // existe. Con el módulo propio `facturacion`.
  | 'boletas'
  | 'facturacion_documentos'
  | 'facturacion_notas'
  | 'facturacion_ajustes'
  | 'dashboard'
  | 'catalogo'
  | 'personal'
  | 'marketing'
  | 'oportunidades'
  | 'encuestas'
  | 'mi_empresa'
  | 'usuarios';

/** Los grupos de filas de la pantalla, en su orden. */
export type Area = 'comercial' | 'operacion' | 'facturacion' | 'administracion';

export type DefinicionDePermiso = {
  clave: Permiso;
  area: Area;
  /** Como lo lee Felipe en la pantalla. */
  nombre: string;
  /** Los cargos que lo traen prendido de fábrica: los de hoy. */
  fabrica: readonly UserRole[];
  /** El derecho del plan o del módulo que lo trae; sin él, va con candado. */
  derecho: Derecho | null;
  /** No se mueve: el motor ignora sus filas y la puerta de guardar lo
   *  rechaza. */
  fijo?: true;
};

const {
  RECEPCION: R,
  VENDEDOR: V,
  OPERACIONES: O,
  ADMINISTRADOR: A,
} = UserRole;

/** Los cargos en el orden de las columnas (y de los grupos de `@Roles`). */
export const CARGOS: readonly UserRole[] = [R, V, O, A];

// EL CATÁLOGO DE LA TANDA 1: las secciones del menú (doc 22 §3.1). Lo que
// cierra cada uno en el motor lo dicen los `@Permiso` y `@DentroDe` de las
// puertas; el doc 22 §3.2 lo resume.
export const CATALOGO_DE_PERMISOS: readonly DefinicionDePermiso[] = [
  {
    clave: 'requerimientos',
    area: 'comercial',
    nombre: 'Requerimientos',
    fabrica: CARGOS,
    derecho: null,
  },
  {
    clave: 'cotizaciones',
    area: 'comercial',
    nombre: 'Cotizaciones',
    fabrica: CARGOS,
    derecho: null,
  },
  {
    clave: 'consultas',
    area: 'comercial',
    nombre: 'Consultas',
    fabrica: CARGOS,
    derecho: 'consultas',
  },
  {
    clave: 'clientes',
    area: 'comercial',
    nombre: 'Clientes',
    fabrica: [V, O, A],
    derecho: null,
  },
  {
    clave: 'belia',
    area: 'comercial',
    nombre: 'BelIA',
    fabrica: CARGOS,
    derecho: 'asistente',
  },
  // El vendedor entraba sin tenerlo en el menú, por «Ver en calendario» del
  // cotizador; Felipe lo dejó prendido (05-11-2026) y ahora le aparece.
  {
    clave: 'calendario',
    area: 'operacion',
    nombre: 'Calendario',
    fabrica: CARGOS,
    derecho: 'calendario',
  },
  {
    clave: 'postventa',
    area: 'operacion',
    nombre: 'Post-Venta',
    fabrica: [O, A],
    derecho: 'post_venta',
  },
  {
    clave: 'proveedores',
    area: 'operacion',
    nombre: 'Proveedores e inventario',
    fabrica: [O, A],
    derecho: 'logistica',
  },
  // Facturación (doc 22 §7): las pestañas que hasta el 05-11 decidía el
  // cargo. El vendedor ve las boletas, como hasta hoy.
  {
    clave: 'boletas',
    area: 'facturacion',
    nombre: 'Boletas',
    fabrica: CARGOS,
    derecho: 'facturacion',
  },
  {
    clave: 'facturacion_documentos',
    area: 'facturacion',
    nombre: 'Documentos y reporte',
    fabrica: [O, A],
    derecho: 'facturacion',
  },
  {
    clave: 'facturacion_notas',
    area: 'facturacion',
    nombre: 'Anular o rebajar',
    fabrica: [A],
    derecho: 'facturacion',
  },
  {
    clave: 'facturacion_ajustes',
    area: 'facturacion',
    nombre: 'Tarifario y conexión',
    fabrica: [A],
    derecho: 'facturacion',
  },
  {
    clave: 'dashboard',
    area: 'administracion',
    nombre: 'Dashboard',
    fabrica: [A],
    derecho: null,
  },
  {
    clave: 'catalogo',
    area: 'administracion',
    nombre: 'Catálogo',
    fabrica: [A],
    derecho: null,
  },
  {
    clave: 'personal',
    area: 'administracion',
    nombre: 'Personal',
    fabrica: [A],
    derecho: 'personal',
  },
  {
    clave: 'marketing',
    area: 'administracion',
    nombre: 'Marketing',
    fabrica: [A],
    derecho: 'marketing',
  },
  {
    clave: 'oportunidades',
    area: 'administracion',
    nombre: 'Oportunidades',
    fabrica: [A],
    derecho: 'oportunidades',
  },
  {
    clave: 'encuestas',
    area: 'administracion',
    nombre: 'Encuestas de satisfacción',
    fabrica: [A],
    derecho: 'encuestas',
  },
  // Usuarios vive adentro de Mi empresa, y ahí está también el plan que se
  // paga: los dos van con candado. Si otro cargo tiene que administrar
  // usuarios, se le cambia el cargo a administrador.
  {
    clave: 'mi_empresa',
    area: 'administracion',
    nombre: 'Mi empresa',
    fabrica: [A],
    derecho: null,
    fijo: true,
  },
  {
    clave: 'usuarios',
    area: 'administracion',
    nombre: 'Gestión de usuarios y permisos',
    fabrica: [A],
    derecho: null,
    fijo: true,
  },
];

export const definicionDe = (clave: string): DefinicionDePermiso | undefined =>
  CATALOGO_DE_PERMISOS.find((p) => p.clave === clave);

/** Lo que una empresa apartó de fábrica: una fila de `permisos_por_cargo`. */
export type FilaDePermiso = {
  cargo: string;
  permiso: string;
  prendido: boolean;
};

const esDeFabrica = (p: DefinicionDePermiso, cargo: string): boolean =>
  (p.fabrica as readonly string[]).includes(cargo);

/**
 * Los permisos prendidos de un cargo: los de fábrica, con lo que su empresa
 * cambió. Las filas de un permiso fijo o que ya no existe no cuentan. Sin
 * cargo, ninguno.
 */
export function permisosDelCargo(
  cargo: string | null | undefined,
  filas: readonly FilaDePermiso[] = [],
): Permiso[] {
  if (!cargo) return [];
  return CATALOGO_DE_PERMISOS.filter((p) => {
    if (p.fijo) return esDeFabrica(p, cargo);
    const fila = filas.find((f) => f.cargo === cargo && f.permiso === p.clave);
    return fila ? fila.prendido : esDeFabrica(p, cargo);
  }).map((p) => p.clave);
}

// LOS TIPOS DE CLIENTE QUE TRABAJA CADA CARGO (doc 22 §9; Felipe,
// 05-11-2026: "podría ser un botón que prende y se apaga, porque no puede
// ser una marca sobre otra"). Un interruptor por tipo y por cargo, en la
// misma tabla que los permisos, con la clave `tipo_cliente:<id>` (el id no
// cambia aunque el tipo cambie de nombre). De fábrica, lo de hoy: recepción
// trabaja los tipos particulares (doc 21) y los demás cargos, todos.

export const PREFIJO_DE_TIPO = 'tipo_cliente:';

export const claveDeTipo = (id: number): string => `${PREFIJO_DE_TIPO}${id}`;

/** Un tipo de cliente de la empresa, con su marca de particular (doc 21). */
export type TipoDeCliente = {
  id: number;
  name: string;
  es_particular?: boolean | null;
};

/** ¿El cargo trabaja este tipo de fábrica? */
export const tipoDeFabrica = (
  cargo: string,
  tipo: Pick<TipoDeCliente, 'es_particular'>,
): boolean =>
  cargo === (UserRole.RECEPCION as string) ? !!tipo.es_particular : true;

/** ¿El cargo trabaja este tipo en su empresa? Lo de fábrica, con lo que la
 *  empresa cambió. */
export const tipoPrendido = (
  cargo: string,
  tipo: TipoDeCliente,
  filas: readonly FilaDePermiso[] = [],
): boolean => {
  const fila = filas.find(
    (f) => f.cargo === cargo && f.permiso === claveDeTipo(tipo.id),
  );
  return fila ? fila.prendido : tipoDeFabrica(cargo, tipo);
};

/** ¿La empresa le cambió a este cargo algún tipo? Sin filas de tipos, el
 *  cargo trabaja lo de fábrica. */
export const cambiaronSusTipos = (
  cargo: string,
  filas: readonly FilaDePermiso[] = [],
): boolean =>
  filas.some((f) => f.cargo === cargo && f.permiso.startsWith(PREFIJO_DE_TIPO));

const normalDelTipo = (t: string | null | undefined): string =>
  (t ?? '').trim().toLowerCase();

/** Los tipos que trabaja un cargo (sus nombres, en minúsculas), o `null` si
 *  los trabaja todos: entonces no se filtra nada, como siempre a vendedor,
 *  operaciones y administrador. */
export type TiposQueTrabaja = {
  prendidos: ReadonlySet<string>;
  /** Todos los de la empresa: un cliente con un tipo que no está acá, o sin
   *  tipo, va por `sinTipo`. */
  conocidos: ReadonlySet<string>;
  /** Los clientes sin tipo: como hoy, todos los cargos menos recepción. No
   *  llevan interruptor: en producción hay uno solo (medido el 05-11-2026). */
  sinTipo: boolean;
} | null;

/** ¿Trabaja un cliente de este tipo? Sin mayúsculas ni espacios de
 *  diferencia. */
export const trabajaElTipo = (
  tipos: TiposQueTrabaja,
  tipo: string | null | undefined,
): boolean => {
  if (!tipos) return true;
  const t = normalDelTipo(tipo);
  if (tipos.prendidos.has(t)) return true;
  return !tipos.conocidos.has(t) && tipos.sinTipo;
};

/** La cuenta de los tipos de un cargo, sin base: los tipos de la empresa y
 *  lo que la empresa apartó de fábrica. Sin cargo, como vendedor para
 *  arriba: no se filtra (lo de siempre). */
export const tiposQueTrabaja = (
  cargo: string | null | undefined,
  tipos: readonly TipoDeCliente[],
  filas: readonly FilaDePermiso[] = [],
): TiposQueTrabaja => {
  const sinTipo = cargo !== UserRole.RECEPCION;
  const prendidos = cargo
    ? tipos.filter((t) => tipoPrendido(cargo, t, filas))
    : tipos;
  if (sinTipo && prendidos.length === tipos.length) return null;
  return {
    prendidos: new Set(prendidos.map((t) => normalDelTipo(t.name))),
    conocidos: new Set(tipos.map((t) => normalDelTipo(t.name))),
    sinTipo,
  };
};

/** Lo que marca una puerta: su `@Roles` de siempre y sus permisos. */
export type MarcasDeLaPuerta = {
  roles?: readonly string[];
  /** `@Permiso`: la puerta es de esas secciones. */
  permiso?: readonly Permiso[];
  /** `@DentroDe`: una acción fina dentro de esas secciones. */
  dentroDe?: readonly Permiso[];
};

/**
 * LA CUENTA DEL GUARDIÁN (doc 22 §4.2):
 *
 *   permitido = prendidos(@Permiso) ∪ (@Roles ∩ prendidos(@DentroDe))
 *
 * - `@Permiso`: se abre a todo cargo que tenga prendida alguna de esas
 *   secciones, aunque su `@Roles` no lo nombre (así prender Post-Venta a un
 *   vendedor le abre los pagos como a operaciones).
 * - `@DentroDe`: exige su `@Roles` de hoy Y alguna sección prendida (así
 *   apagar Post-Venta cierra «Volver a pendiente», pero prenderla no se la
 *   abre a quien hoy no la tiene: las acciones finas son de la tanda 2).
 * - Una puerta sin ninguno de los dos queda como hoy, solo con su `@Roles`.
 */
export function pasa(
  cargo: string | null | undefined,
  prendidos: readonly Permiso[],
  marcas: MarcasDeLaPuerta,
): boolean {
  if (!cargo) return false;
  const { roles, permiso, dentroDe } = marcas;
  const porCargo = !roles?.length || roles.includes(cargo);
  const alguna = (lista?: readonly Permiso[]) =>
    !!lista?.some((p) => prendidos.includes(p));
  if (!permiso?.length && !dentroDe?.length) return porCargo;
  return alguna(permiso) || (porCargo && alguna(dentroDe));
}

/** Los cargos que pasan una puerta con todo de fábrica, en el orden de
 *  `CARGOS`. Es lo que la matriz de cargos compara con lo acordado. */
export const cargosDeFabrica = (marcas: MarcasDeLaPuerta): UserRole[] =>
  CARGOS.filter((c) => pasa(c, permisosDelCargo(c), marcas));

export const MENSAJE_SIN_PERMISO =
  'Tu cargo no tiene permiso para esta función.';

/**
 * El 403 de un permiso apagado. Cuerpo fijo, como `SIN_DERECHO`: la app lo
 * reconoce por `codigo` y vuelve a pedir el perfil para que el menú se
 * ponga al día. Lleva también `message`, que es lo que leen los avisos de
 * error de siempre.
 */
export const sinPermiso = (mensaje = MENSAJE_SIN_PERMISO): ForbiddenException =>
  new ForbiddenException({
    statusCode: 403,
    codigo: 'SIN_PERMISO',
    message: mensaje,
    mensaje,
  });
