# 22 · Permisos por cargo (los interruptores)

> **Estado: APROBADO el 05-11-2026.** La maqueta (*"si me parece
> perfecto"*) y el catálogo del §3 (*"ok al catalogo vamos"*), con el
> Calendario del vendedor prendido. **P1 (motor) y P2 (pantalla)
> programados** ese día; P3 (laboratorio) sigue. Migración **188** (la 186 es de
> recepción y la 187 de facturación). Rama `feature/permisos-por-cargo`,
> carpeta `wt-permisos`. Al laboratorio por pasos; a producción, solo con su
> «a producción».

## 1. Lo que pidió Felipe

05-11-2026, después de mover permisos sección por sección:
*"deberíamos transformar hoy todos los permisos existentes en pestañas que se
puedan deslizar como botones (lo típico en estos casos) y así prendo y/o
apago los permisos existentes"*. Vio la maqueta y la aprobó.

Lo que dice la maqueta:

- Una pestaña nueva en Gestión de usuarios: **Permisos por cargo**.
- Filas = permisos, agrupados por área (Comercial, Operación, Facturación,
  Administración). Columnas = los cuatro cargos. Cada celda, un interruptor
  deslizable.
- Arriba, «Volver a lo de fábrica». Abajo, «Último cambio: …».
- **Lo de fábrica es lo de hoy**: el día que se instala, nadie gana ni pierde
  nada.
- **Lo cumple el motor**, no solo el menú: apagar un permiso cierra también
  los datos detrás.
- **El administrador no se puede dejar afuera**: Gestión de usuarios y
  Permisos quedan fijos para él, con candado.
- **El plan manda arriba**: lo que el plan o los módulos de la empresa no
  incluyen sale con candado y no se prende.
- **Rige al instante** y queda anotado quién cambió qué y cuándo. Cada
  empresa configura los suyos.
- **Dos tandas**: primero las secciones del menú; después las acciones finas.

## 2. Lo que hay hoy (medido el 05-11-2026)

**En la app** (`frontend/src/constants/permissions.ts`), dos listas que
deberían decir lo mismo: `ROLE_PERMISSIONS` (el menú, vía
`canAccessSection`) y `SECTION_ROLES` (las rutas, vía `PermissionGuard`, y
unos diez botones dentro de las pantallas). Hoy discrepan en dos secciones:

- **Calendario y el vendedor**: no está en su menú, pero la ruta lo deja
  entrar y el cotizador y el formulario de requerimiento le ofrecen «Ver en
  calendario» cuando hay otro evento ese día. Lo usa, sin tenerlo en el menú.
- **Planes**: la ruta es de todos (el letrero de la prueba lleva ahí); el
  menú, solo del administrador. Queda fuera del catálogo (§3.3).

**En el motor**, en `main` (a 2a935ed): 373 puertas en 42 controladores; 22
públicas y **351 con sesión**. De esas, 340 llevan cargo (`@Roles`, de
método o de clase) y 11 piden solo sesión (el propio perfil, la propia clave,
la propia empresa, el estado del plan y la Torre de Control). El laboratorio
suma Facturación: 407 puertas, 385 con sesión.

**Quién llama a qué.** Se midió con un lector de la app (los servicios, sus
llamadas y las importaciones desde cada pantalla de `App.tsx`), cruzado con
el inventario real de decoradores. Dos importaciones de solo un ayudante de
formato (`clp` desde `PostVentaPage`) se descartaron: inflaban a Personal y a
la ficha del negocio con todo Post-Venta. Las herramientas y los resultados
viven fuera del repo, en `Eventia_Desarrollo/atlas_pendiente/permisos_por_cargo/`
(con su `LEEME.md`).

## 3. El catálogo de la tanda 1

✓ = prendido de fábrica · – = apagado de fábrica · 🔒 = fijo, no se mueve.

### 3.1 Los permisos

| Área | Permiso (clave) | Dónde está | Rec. | Vend. | Oper. | Adm. | Derecho del plan |
|---|---|---|:-:|:-:|:-:|:-:|---|
| Comercial | Requerimientos (`requerimientos`) | Menú → Requerimientos | ✓ | ✓ | ✓ | ✓ | — |
| Comercial | Cotizaciones (`cotizaciones`) | Menú → Cotizaciones: tablero, ficha del negocio y cotizador | ✓ | ✓ | ✓ | ✓ | — |
| Comercial | Consultas (`consultas`) | Menú → Consultas | ✓ | ✓ | ✓ | ✓ | `consultas` |
| Comercial | Clientes (`clientes`) | Menú → Clientes | – | ✓ | ✓ | ✓ | — |
| Comercial | BelIA (`belia`) | La ventanita de chat | ✓ | ✓ | ✓ | ✓ | `asistente` |
| Operación | Calendario (`calendario`) | Menú → Calendario | ✓ | **✓** | ✓ | ✓ | `calendario` |
| Operación | Post-Venta (`postventa`) | Menú → Post-Venta | – | – | ✓ | ✓ | `post_venta` |
| Operación | Proveedores e inventario (`proveedores`) | Menú → Proveedores y Menú → Inventario | – | – | ✓ | ✓ | `logistica` |
| Facturación | Boletas (`boletas`) | Menú → Facturación: Boleta suelta, Por boletear, Emitidas hoy | ✓ | ✓ | ✓ | ✓ | `facturacion` |
| Facturación | Documentos y reporte (`facturacion_documentos`) | Facturación → Documentos | – | – | ✓ | ✓ | `facturacion` |
| Facturación | Anular o rebajar (`facturacion_notas`) | Facturación → Documentos → notas | – | – | – | ✓ | `facturacion` |
| Facturación | Tarifario y conexión (`facturacion_ajustes`) | Facturación → Tarifario, «Comprobar», «Probar la conexión» | – | – | – | ✓ | `facturacion` |
| Administración | Dashboard (`dashboard`) | Menú → Dashboard | – | – | – | ✓ | — |
| Administración | Catálogo (`catalogo`) | Menú → Catálogo | – | – | – | ✓ | — |
| Administración | Personal (`personal`) | Menú → Personal | – | – | – | ✓ | `personal` |
| Administración | Marketing (`marketing`) | Menú → Marketing | – | – | – | ✓ | `marketing` |
| Administración | Oportunidades (`oportunidades`) | Menú → Oportunidades | – | – | – | ✓ | `oportunidades` |
| Administración | Encuestas (`encuestas`) | Menú → Encuestas de Satisfacción | – | – | – | ✓ | `encuestas` |
| Administración | Mi empresa (`mi_empresa`) | Menú de usuario → Mi empresa: marca, correos, formulario web, plan | 🔒– | 🔒– | 🔒– | 🔒✓ | — |
| Administración | Gestión de usuarios y permisos (`usuarios`) | Mi empresa → Usuarios | 🔒– | 🔒– | 🔒– | 🔒✓ | — |

- **Calendario del vendedor: prendido** (Felipe, 05-11-2026). Era la
  discrepancia del §2: ahora le aparece en el menú, y sigue teniendo «Ver en
  calendario». En el motor no cambia nada: ya entraba.
- **Facturación** existe solo en el laboratorio (rama
  `feature/facturacion-electronica`). Sus cuatro filas aparecen cuando las
  dos ramas estén juntas (§7).
- **Mi empresa va con candado, igual que Usuarios**: Usuarios vive adentro
  de Mi empresa, y ahí está también el plan que se paga. Si otro cargo
  tuviera que administrar usuarios, se le cambia el cargo a administrador.
- Un interruptor de un permiso que el plan o los módulos de la empresa no
  traen sale con candado y apagado de verdad (no se guarda prendido).

### 3.2 Qué cierra cada uno en el motor (medido)

Una puerta del motor que usan varias secciones sigue abierta mientras el
cargo tenga **alguna** de ellas prendida; si no, apagar una sección rompería
la otra. Por eso algunos permisos cierran mucho y otros casi nada. Lo que
cierra cada uno, apagándolo solo a él y con todo lo demás de fábrica:

| Permiso | Cierra (puertas) | Qué |
|---|---|---|
| Requerimientos | 1 | «✨ Crear con IA» del requerimiento. Lo demás lo comparte con Cotizaciones |
| Cotizaciones | 12 a 41 según el cargo | Enviar, aviso de cierre, seguimiento y bitácora, choques de fecha, menús y paquetes guardados; y la lista del motor le trae solo requerimientos (§4.4) |
| Consultas | 4 (8 al administrador) | La bandeja del embudo: convertir y descartar; al administrador, también configurar el embudo y los tipos de evento |
| Clientes | 8 | Editar y borrar clientes, contactos y tipos de cliente |
| BelIA | 9 | Todas las de BelIA |
| Calendario | 0 puertas, 1 regla | No tiene puertas propias (lee la lista de cotizaciones); el motor le niega la vista de calendario de esa lista (§4.4) |
| Post-Venta | 30 a operaciones, 24 al administrador | Plan de pagos, abonos, reembolsos, comprobantes del portal, cocina, sillas del personal, marcar realizado, borrar archivos |
| Proveedores e inventario | 21 a operaciones, 16 al administrador | Proveedores, insumos, mobiliario, recursos y compras |
| Dashboard | 3 | Los números del panel |
| Catálogo | 34 | Cambiar servicios, categorías, secciones, recetas y costos fijos |
| Personal | 37 | Directorio, planificación, liquidación, propina, nómina e histórico |
| Marketing | 25 | Campañas, audiencias y envíos |
| Oportunidades | 66 | Todo Oportunidades |
| Encuestas | 2 | Respuestas y plantilla |
| Boletas (lab) | 9 | Boleta suelta, por boletear, emitir, emitidas hoy |
| Documentos y reporte (lab) | 2 | La lista del mes y «Pedir el PDF» |
| Anular o rebajar (lab) | 2 | Revisar y emitir notas |
| Tarifario y conexión (lab) | 5 | Tarifario, «Comprobar» y «Probar la conexión» |

Y al revés: prender un permiso a un cargo que no lo tiene le abre las puertas
de esa sección como las usa hoy el cargo más bajo que la tiene. Las acciones
finas que hoy son de un cargo más alto **no** se abren (son de la tanda 2):
prenderle Post-Venta a un vendedor le abre los pagos como a operaciones, pero
no «Volver a pendiente», que sigue siendo del administrador.

### 3.3 Lo que no entra en el catálogo

- **Mi cuenta** (la propia clave, el personaje y el color): siempre de todos.
- **Planes** (`/plans`): sigue como hoy.
- **Eventia Móvil**: es otra aplicación (repo `eventia-movil`); sus 5 puertas
  siguen de operaciones y administrador.
- **Las acciones finas** (descuentos, aceptar, anular, borrar, margen…): tanda
  2.

## 4. Cómo lo cumple el motor

### 4.1 La tabla (migración 188)

- `permisos_por_cargo` (`company_id`, `cargo`, `permiso`, `prendido`,
  `cambiado_por`, `cambiado_en`), llave (`company_id`, `cargo`, `permiso`).
  Guarda **solo lo que se aparta de fábrica**: «Volver a lo de fábrica» borra
  las filas de la empresa, y un permiso nuevo que agregue el código llega a
  todas las empresas con su valor de fábrica.
- `permisos_por_cargo_cambios`: el registro. Cada cambio con quién (id y
  nombre), cuándo, cargo, permiso y cómo quedó; «Volver a lo de fábrica»
  queda como un cambio más. De ahí sale el «Último cambio» de la pantalla.
- Cerradas a `anon` y `authenticated`, con permiso a `service_role` (mapa 18:
  sin ese GRANT la pantalla queda en error 42501).

### 4.2 Cada puerta sabe qué secciones la usan

Dos decorados nuevos, junto al `@Roles` de siempre:

- `@Permiso('postventa', 'cotizaciones', …)`: **la puerta es de esas
  secciones**. Se abre a todo cargo que tenga prendida alguna.
- `@DentroDe('postventa', …)`: **una acción fina dentro de esa sección**.
  Exige su `@Roles` de hoy **y** que el cargo tenga prendida alguna.

La cuenta del guardián: `permitido = ∪ prendidos(@Permiso) ∪ (@Roles ∩ ∪
prendidos(@DentroDe))`. Una puerta sin ninguno de los dos queda como hoy,
solo con su `@Roles`.

`RolesGuard` hace la cuenta con la lista de permisos prendidos del cargo, que
`AuthGuard` deja en la sesión (`request.user.permisos`), calculada una vez con
la fábrica y las filas de la empresa. El 403 lleva cuerpo fijo
`{ codigo: 'SIN_PERMISO', message, mensaje }`, como `SIN_DERECHO` (con
`message` también, que es lo que leen los avisos de error de siempre).

Las piezas: el catálogo y la cuenta (`pasa`, `permisosDelCargo`,
`cargosDeFabrica`) en `api-rest/src/auth/permisos.ts`; los decorados en
`auth/permiso.decorator.ts`; la base y la pantalla en
`auth/permisos.service.ts` y `auth/permisos.controller.ts` (`GET /permisos`,
`PUT /permisos`, `POST /permisos/fabrica`). Las 318 puertas se marcaron con
la regla medida en `atlas_pendiente/permisos_por_cargo/etiquetas.py`: un
controlador entero cuando todas sus puertas son de lo mismo (BelIA,
Marketing, Oportunidades, la bitácora, los documentos del evento, el
Dashboard), y ruta por ruta en los demás.

### 4.3 Lo de fábrica = lo de hoy, y se prueba

La matriz de cargos (`auth/tests/matriz-de-cargos.spec.ts`) **no cambia sus
valores esperados**: pasa a calcular el cargo de fábrica de cada puerta con la
cuenta del §4.2 y lo compara con lo acordado. Una prueba nueva recorre las
351 puertas con sesión y exige, para cada una con permisos, que la fábrica dé
exactamente su `@Roles`. Medido con el borrador: **318 puertas quedan
gobernadas por los interruptores y 33 quedan fijas**, sin ninguna que cambie.

Las 33 fijas:

| Grupo | Puertas | Por qué |
|---|---|---|
| La sesión propia | 5 | El propio perfil, la propia clave, la propia empresa, el estado del plan y la puerta vieja de planes |
| Cualquier cargo | 4 | Subir y ver archivos; ver y cambiar el propio personaje |
| El cobro del plan | 4 | Contratar, cambiar y cancelar el plan: administrador |
| Eventia Móvil | 5 | Otra aplicación (§3.3) |
| Torre de Control | 6 | Su lista de correos |
| Más abiertas que sus pantallas | 9 | El motor ya se las abre a un cargo que ninguna pantalla suya usa: `GET /calendar/events` y tres lecturas de logística (sin llamador), la ficha 360 del cliente (recepción), la cosecha del mes (vendedor), y estado de compras, mobiliario e insumos (vendedor). Cerrarlas cambia lo de hoy: es una decisión aparte, anotada, no tomada |

### 4.4 Dos reglas de datos en la lista de cotizaciones

`GET /quotations` la usan cinco secciones (Requerimientos, Cotizaciones,
Calendario, Dashboard y la planificación de Personal), así que queda abierta
mientras el cargo tenga una. Dos reglas, junto a la pieza que ya filtra lo de
recepción (`AlcanceDeRecepcion`, doc 21):

1. **Sin Calendario**, el motor niega la vista de calendario
   (`vista=calendario`), que es la que trae la agenda de toda la empresa.
2. **Sin Cotizaciones, Dashboard ni Personal**, la lista trae solo
   requerimientos (`request_type=requerimiento`, lo que pide la pantalla de
   Requerimientos). Sin ninguna sección que lea la lista (un cargo con solo
   el Calendario), la lista entera se niega.

Van en `AlcanceDeRecepcion.deLaLista`, que es lo único que llama
`GET /quotations`.

Lo que recepción ve de cada cotización (las de particulares completas, el
resto sin plata) lo sigue decidiendo `AlcanceDeRecepcion`
(`api-rest/src/clients/alcance-de-recepcion.ts`), también en BelIA
(`asistente/propuestas/de-recepcion.ts`) y en la pantalla
(`frontend/src/utils/recepcion.ts`). Las dos reglas de arriba van en la misma
pieza, nunca por un camino aparte (lo pidió «Eventia (Full)» el 05-11).

### 4.5 Rige al instante

Los permisos de cada empresa se recuerdan en la memoria del motor y se
olvidan al guardar un cambio, igual que el perfil al cambiar un cargo
(03-11-2026). Mismo aviso de siempre (mapa 16): con más de una copia del
motor, la memoria de cada una tardaría hasta su vencimiento. En la app, un
`SIN_PERMISO` vuelve a pedir el perfil para que el menú se ponga al día.

### 4.6 El administrador nunca queda afuera

`mi_empresa` y `usuarios` son fijos: el motor ignora cualquier fila que los
toque y la puerta de guardar los rechaza. Las tres puertas de la pantalla de
permisos son de `usuarios`.

### 4.7 El plan sigue mandando arriba

`DerechosGuard` no cambia. Cargo, permiso y derecho son tres preguntas, y las
tres tienen que decir que sí. La pantalla pinta con candado el permiso cuyo
derecho falta, y la puerta de guardar no lo deja prender.

### 4.8 BelIA

BelIA lee datos por su cuenta, sin pasar por las puertas: si no siguiera los
interruptores, apagarle Clientes a un vendedor no le cerraría la búsqueda de
clientes por chat. Cada herramienta dice de qué sección es, con la misma
cuenta de las puertas: las que consultan con `permiso` (por ejemplo, los
pagos son de `postventa`) y las que proponen con `dentroDe` (siguen con su
cargo, y PropuestasService vuelve a revisar al aplicar).
`herramientasPara` hace la cuenta. De fábrica, cada una la ven los mismos
cargos que antes (lo prueba `permisos-de-fabrica.spec.ts`).

## 5. La pantalla

- **El perfil trae los permisos.** `GET /users/:id` devuelve `permisos` (la
  lista prendida del cargo), calculada por el motor como `derechos`. La app
  no guarda copia de la configuración.
- `permissions.ts`: cada sección apunta a su permiso; `canAccessSection`,
  `PermissionGuard` y los botones que hoy preguntan `SECTION_ROLES` leen la
  lista del perfil. `ROLE_PERMISSIONS` y `SECTION_ROLES` dejan de mandar: las
  dos listas que discrepaban se vuelven una sola, la del motor. Si el motor
  todavía no manda la lista (el despliegue va motor primero), la app usa lo de
  fábrica.
- **La pestaña.** Gestión de usuarios tiene dos pestañas: «Usuarios» (lo de
  hoy) y «Permisos por cargo» (la maqueta). Reemplaza el cuadro «📋 Permisos
  por Rol», que es solo texto y está desactualizado (dice que recepción ve
  Clientes).
- **Pieza nueva del kit**: `components/Interruptor.tsx` (`role="switch"`,
  `aria-checked`, Espacio y Enter, deshabilitado con candado). Fila en la
  tabla del kit de `CLAUDE.md` y, si el patrón se deja reconocer con una
  expresión confiable, una regla del portero.

### 5.1 Cómo quedó (05-11-2026)

- La pestaña vive en `pages/configuration/PermisosPorCargo.tsx` (el texto
  del último cambio, en `ultimoCambio.ts`) y la llama
  `UserManagementPage` con `?vista=permisos`.
- `PermissionGuard` pregunta por la sección (`section="quotations"`), no por
  una lista de cargos; Consultas lleva `permiso="consultas"`.
- `AuthContext` expone `permisos`; `services/api.ts` avisa un
  `SIN_PERMISO` y dispara `eventia:sin-permiso`, que vuelve a pedir el
  perfil.
- Los botones que preguntaban `SECTION_ROLES` ahora preguntan el permiso:
  cotizar (`cotizaciones`), ir a Post-Venta (`postventa`), la ficha del
  cliente (`clientes`) y BelIA (`belia`). Las acciones finas por cargo
  (`ROLE_GROUPS.ADMIN_ONLY`) quedan para la tanda 2.

## 6. Pasos (sprints cortos)

| Paso | Qué | Cómo se prueba |
|---|---|---|
| P1 · Motor | Migración 188; catálogo en `auth/permisos.ts`; `@Permiso` / `@DentroDe` en los controladores; guardián; puertas de la pantalla; perfil con `permisos`; reglas del §4.4 | Matriz de cargos con los mismos valores; prueba de las 351 puertas; pruebas del guardián y del servicio; techo de lint 19; build |
| P2 · Pantalla | Interruptor, pestaña, permisos del perfil en menú, rutas y botones | Pruebas de la pieza y de la pestaña; techo de lint 84; portero; build |
| P3 · Laboratorio | Migración en el lab, cherry-pick encima de `origin/pruebas` (nunca force-push) | Un usuario de cada cargo: ve lo mismo que hoy; apagar y prender un permiso cierra y abre de verdad (menú y motor) |

Facturación, encima, en el laboratorio: un commit más que marca sus puertas y
sus pestañas (§7).

## 7. Facturación

Sus cuatro filas (§3.1) y sus puertas (`/boletas`, `/facturacion`,
`/quotations/:id/facturas` y `ordenes-de-compra`, y las razones sociales del
cliente) se marcan en un commit propio **encima de `pruebas`**, porque el
módulo no está en `main`. Cuando Facturación vaya a producción, ese commit va
con ella. Medido con el borrador: sus 33 puertas quedan gobernadas, sin
cambiar ninguna (el laboratorio tiene una más que `main`, el radar municipal
de Oportunidades, que queda en `oportunidades`).

## 8. Decisiones de Felipe

1. **El catálogo del §3**: aprobado el 05-11-2026 (*"ok al catalogo
   vamos"*).
2. **Calendario del vendedor**: prendido (05-11-2026).

Anotado, no decidido: las 9 puertas «más abiertas que sus pantallas» (§4.3).
