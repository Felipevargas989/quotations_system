# 22 · Permisos por cargo (los interruptores)

> **Estado: EN PRODUCCIÓN desde el 06-11-2026** (Felipe: *"quedó bien,
> pásalo a producción"*): PR #304, `main` 54d150b6, web de producción
> 6aed463f, migración 188 aplicada en producción antes del motor. Todo de
> fábrica: nadie ganó ni perdió nada. El commit de Facturación 977c490b
> llegó a producción con Facturación el 07-11-2026 (PR #310).
>
> **Las 9 puertas «más abiertas que sus pantallas» (§4.3): decididas el
> 06-11-2026** (*"si hazlo si"*). Seis pasan a la sección de su pantalla y
> se borran tres que nadie llamaba, entre ellas el calendario viejo. En el
> laboratorio desde el 06-11 (`pruebas` 7c79787d) y **en producción desde
> el 06-11-2026** (Felipe: *"pasalo a producción"*; PR #307, rama
> `feature/puertas-mas-abiertas`). Sin migración.
>
> **Aprobado el 05-11-2026.** La maqueta (*"si me parece
> perfecto"*) y el catálogo del §3 (*"ok al catalogo vamos"*), con el
> Calendario del vendedor prendido. **P1 (motor) y P2 (pantalla)
> programados** ese día y **en el laboratorio desde esa noche** (`pruebas`
> 12fd8911, con el commit de Facturación 977c490b; web del lab 6aecf77e;
> migración 188 en su base). Falta la prueba con un usuario de cada cargo
> y, después, el «a producción». Migración **188** (la 186 es de
> recepción y la 187 de facturación). Rama `feature/permisos-por-cargo`,
> carpeta `wt-permisos`. Al laboratorio por pasos; a producción, solo con su
> «a producción».
>
> **Los tipos de cliente de cada cargo (§9): aprobados el 05-11-2026**
> (*"si vamos"*), con sus dos excepciones. La tanda 1 (la pantalla,
> Cotizaciones, el Calendario y BelIA) en el laboratorio desde esa noche,
> sin migración; la tanda 2 (Post-Venta, *"si sigue con la tanda 2"*) en
> el laboratorio esa misma noche (§9.6), la tanda 3 (Compras y la
> planificación de Personal, *"si sigue con la tanda 3"*) en el laboratorio
> después (§9.7) y la tanda 4 (Clientes, Encuestas y Dashboard, *"si sigue
> con la tanda 4"*) programada al final (§9.8). Con eso, las cuatro.

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
| Facturación | Boletas y facturas del tarifario (`boletas`) | Facturación → «Nuevo documento» → Boleta o Factura, con los precios del tarifario; a mano y con descuento, solo el administrador (desde el 07-11-2026, doc 19 §9.23; antes «Boletas», con el vendedor prendido) | ✓ | – | ✓ | ✓ | `facturacion` |
| Facturación | Facturar eventos (`facturacion_eventos`) | Facturación → Por facturar: emitir el DTE de cada evento y la facturación masiva (desde el 07-11-2026; antes lo emitía solo el administrador desde la pestaña del evento), y «Ya está facturado» y «Devolver» para lo facturado fuera de Eventia (doc 19 §9.24) | – | – | ✓ | ✓ | `facturacion` |
| Facturación | Documentos y reporte (`facturacion_documentos`) | Facturación → Documentos: la lista, el reporte y el PDF | – | – | ✓ | ✓ | `facturacion` |
| Facturación | Anular o rebajar (`facturacion_notas`) | Facturación → «Nuevo documento» → Nota de crédito o de débito | – | – | – | ✓ | `facturacion` |
| Facturación | Tarifario y conexión (`facturacion_ajustes`) | Facturación → Tarifario, «Comprobar», «Probar la conexión» | – | – | – | ✓ | `facturacion` |
| Facturación | Caja de recepción (`caja_recepcion`) | Facturación → Caja: abrirla con el sencillo a nombre del perfil de la sesión, los retiros y el cierre ciego (desde el 09-11-2026, doc 19 §9.43). Lo que emite el cargo recepción entra a la caja y sin caja abierta no emite | ✓ | – | – | ✓ | `facturacion` |
| Facturación | Revisar cierres de caja (`caja_revision`) | Facturación → Caja → «Cierres de la caja de recepción»: lo declarado, lo esperado y la diferencia por medio de pago, corregir el medio de un documento y marcar revisado (desde el 09-11-2026, doc 19 §9.43) | – | – | – | ✓ | `facturacion` |
| Facturación | Aprobar y emitir solicitudes (`facturacion_solicitudes`) | Facturación → Solicitudes: lo que pide recepción (su boleta y su factura al contado ya no se emiten, se mandan como solicitud), para revisar que nada se boletee dos veces y «Aprobar y emitir» o «Rechazar» (desde el 09-11-2026, doc 19 §9.45) | – | – | ✓ | ✓ | `facturacion` |
| Facturación | Lo vendido (`facturacion_vendido`) | Facturación → Lo vendido: lo del tarifario por ítem, fechas y persona (desde el 09-11-2026, doc 19 §9.43; Felipe: *"otra pestaña que solo lo vea operaciones y administración"*) | – | – | ✓ | ✓ | `facturacion` |
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
  `feature/facturacion-electronica`). Sus cinco filas aparecen cuando las
  dos ramas estén juntas (§7). La entrada del menú la ve quien tenga
  cualquiera de las cinco (doc 19 §9.23).
- **Mi empresa va con candado, igual que Usuarios**: Usuarios vive adentro
  de Mi empresa, y ahí está también el plan que se paga. Si otro cargo
  tuviera que administrar usuarios, se le cambia el cargo a administrador.
- Un interruptor de un permiso que el plan o los módulos de la empresa no
  traen sale con candado y apagado de verdad (no se guarda prendido).

### 3.2 Qué cierra cada uno en el motor (medido)

Una puerta del motor que usan varias secciones sigue abierta mientras el
cargo tenga **alguna** de ellas prendida; si no, apagar una sección rompería
la otra. Por eso algunos permisos cierran mucho y otros casi nada. Lo que
cierra cada uno, apagándolo solo a él y con todo lo demás de fábrica
(Clientes, Proveedores, Dashboard y Catálogo, medidos de nuevo el
06-11-2026 con las puertas del §4.3):

| Permiso | Cierra (puertas) | Qué |
|---|---|---|
| Requerimientos | 1 | «✨ Crear con IA» del requerimiento. Lo demás lo comparte con Cotizaciones |
| Cotizaciones | 12 a 41 según el cargo | Enviar, aviso de cierre, seguimiento y bitácora, choques de fecha, menús y paquetes guardados; y la lista del motor le trae solo requerimientos (§4.4) |
| Consultas | 4 (8 al administrador) | La bandeja del embudo: convertir y descartar; al administrador, también configurar el embudo y los tipos de evento |
| Clientes | 9 | Editar y borrar clientes, contactos y tipos de cliente, y la ficha 360 |
| BelIA | 9 | Todas las de BelIA |
| Calendario | 0 puertas, 1 regla | No tiene puertas propias (lee la lista de cotizaciones); el motor le niega la vista de calendario de esa lista (§4.4) |
| Post-Venta | 30 a operaciones, 24 al administrador | Plan de pagos, abonos, reembolsos, comprobantes del portal, cocina, sillas del personal, marcar realizado, borrar archivos |
| Proveedores e inventario | 24 a operaciones, 17 al administrador | Proveedores, insumos, mobiliario, recursos y compras |
| Dashboard | 4 | Los números del panel y corregir la cosecha del mes |
| Catálogo | 35 | Cambiar servicios, categorías, secciones, recetas y costos fijos, y leer todas las líneas de receta |
| Personal | 37 | Directorio, planificación, liquidación, propina, nómina e histórico |
| Marketing | 25 | Campañas, audiencias y envíos |
| Oportunidades | 66 | Todo Oportunidades |
| Encuestas | 2 | Respuestas y plantilla |
| Boletas y facturas del tarifario (lab) | 9* | Emitir boletas desde «Nuevo documento»; desde el 07-11, también la factura (4 puertas más) |
| Facturar eventos (lab) | desde el 07-11 | Por facturar y el DTE de cada evento (antes, en Post-Venta y en Documentos) |
| Documentos y reporte (lab) | 2* | Documentos, Por facturar y la factura (hasta el 07-11) |
| Anular o rebajar (lab) | 2* | Las notas de crédito y de débito |
| Tarifario y conexión (lab) | 5* | Tarifario, «Comprobar» y «Probar la conexión» |

\* Contado el 05-11-2026, antes de que la sección Facturación se rehiciera
(06-11: «Documentos», «Por facturar», «Tarifario» y «Nuevo documento»). Se
vuelve a contar cuando Facturación vaya a producción.

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
exactamente su `@Roles`. Medido con el borrador: **318 puertas quedaban
gobernadas por los interruptores y 33 fijas**, sin ninguna que cambie.
Desde el 06-11-2026 (abajo): **324 gobernadas, 24 fijas y 3 puertas
menos.**

Las 24 fijas:

| Grupo | Puertas | Por qué |
|---|---|---|
| La sesión propia | 5 | El propio perfil, la propia clave, la propia empresa, el estado del plan y la puerta vieja de planes |
| Cualquier cargo | 4 | Subir y ver archivos; ver y cambiar el propio personaje |
| El cobro del plan | 4 | Contratar, cambiar y cancelar el plan: administrador |
| Eventia Móvil | 5 | Otra aplicación (§3.3) |
| Torre de Control | 6 | Su lista de correos |

#### Las 9 «más abiertas que sus pantallas» (06-11-2026)

Eran fijas porque el motor se las abría a un cargo que ninguna pantalla suya
usaba, y cerrarlas cambiaba lo de hoy. Felipe lo decidió el 06-11-2026
(*"si hazlo si"*): cada una, de la sección de su pantalla; y las que nadie
llama, borradas.

| Puerta | Antes | Ahora | Pantalla que la usa |
|---|---|---|---|
| `GET /calendar/events` (el calendario viejo) | Los cuatro cargos, con todas las cotizaciones y sus montos, sin las reglas de recepción ni de los tipos de cliente | **Borrada**, con el módulo `calendar` del motor y su servicio de la app | Ninguna: el Calendario lee `GET /quotations` con `vista=calendario` (§4.4) |
| `GET /clients/:id/summary` (la ficha 360) | Los cuatro | `@Permiso('clientes')`: vendedor y arriba | Clientes → un cliente |
| `POST /quotations/:id/cosecha` | Vendedor y arriba | `@Permiso('dashboard')`: administrador; y `@DelEvento`, como el resto del Dashboard (§9.8) | Dashboard → pinchar la barra de un mes |
| `GET /logistics/estado-compras` | Vendedor y arriba | `@Permiso('proveedores')`: operaciones y administrador | Proveedores → Compras |
| `GET /logistics/furniture` | Vendedor y arriba | `@Permiso('proveedores', 'catalogo')`: operaciones y administrador | Inventario; Catálogo → un servicio → Receta; el Inventario de Eventia Móvil |
| `GET /logistics/supplies` | Vendedor y arriba | `@Permiso('proveedores', 'catalogo')`: operaciones y administrador | Proveedores → Insumos; Catálogo |
| `GET /logistics/recipes/all` | Vendedor y arriba | `@Permiso('catalogo')`: administrador | Catálogo (por `getAllIngredientRecipeItems`) |
| `GET /logistics/catalog/service-names` | Vendedor y arriba | **Borrada** | Ninguna: el cotizador recibe lo mismo en `base-catalogo` |
| `GET /logistics/catalog/fixed-costs` | Vendedor y arriba | **Borrada** | Ninguna: ídem |

- Con todo de fábrica, en la app web nadie pierde nada de lo que ve. Lo
  único: un vendedor que abra Inventario en Eventia Móvil deja de ver el
  mobiliario; esa app es de operaciones y administración (§3.3).
- **Medido mal la primera vez:** el 05-11 se anotaron tres lecturas de
  logística «sin llamador», y `recipes/all` sí lo tiene (el Catálogo, a
  través de `getAllIngredientRecipeItems`). Por eso no se borró: quedó del
  Catálogo. Se revisó también la app móvil (repo `eventia-movil`): usa
  `furniture`, `supplies` (sin pantalla que la muestre), `base-catalogo`,
  `purchasing/accepted-events` y `kitchen/times`.
- La ficha 360: recepción no ve Clientes desde el 03-10 (mapa 23). Si se
  le prende el interruptor, la vuelve a ver, sin los montos de lo que no es
  particular (doc 21).

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
- **Un solo título** (Felipe, 05-11-2026: *"los titulos se ven raros, y
  cuando bajo no veo el perfil que estamos configurando"*): el de Mi
  empresa. `UserManagementPage` ya no lleva «Gestión de Usuarios»; sus dos
  pestañas son «Equipo» (antes «Usuarios», para no repetir la de Mi
  empresa) y «Permisos por cargo», con el botón de cada una a la derecha
  de la misma fila («Crear usuario» y «Volver a lo de fábrica», que
  `PermisosPorCargo` pone ahí con `createPortal`). Las columnas son fijas
  (los interruptores parejos) y la fila de los cargos queda fija arriba al
  bajar (`sticky`, sin el corte horizontal en pantallas anchas); la franja
  «Tipos de cliente» repite el cargo de cada columna.
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

**Hecho el 05-11-2026**, en un commit encima de `pruebas`:
- el catálogo suma el área «Facturación» con sus cuatro permisos (derecho
  `facturacion`);
- sus 33 puertas y la del radar municipal llevan su marca (las órdenes de
  compra, el controlador entero en `postventa`);
- `NotasService.lista` ofrece anular o rebajar con `facturacion_notas` y
  «Comprobar» con `facturacion_ajustes`;
- `FacturacionPage` elige «Documentos» y «Tarifario» por permiso, y
  «Probar la conexión» va con `facturacion_ajustes`.
La prueba de fábrica del laboratorio recorre sus 388 puertas con sesión
(355 gobernadas, con las 3 de la pantalla de permisos, y 33 fijas).

**Desde el 07-11-2026 (doc 19 §9.23; Felipe: *"ok hazlo"*), cinco
permisos.** Todo se factura en la sección Facturación y la pestaña del
evento en Post-Venta salió:
- «Boletas» pasa a «Boletas y facturas del tarifario» (misma clave
  `boletas`), apagado de fábrica para el vendedor. Sus puertas llevan
  `@Roles(...DEL_TARIFARIO)` (recepción, operaciones y el administrador,
  `facturacion/cargos-del-tarifario.ts`), y suma las cuatro de la factura
  de «Nuevo documento» (`/facturacion/razon-social`, `clientes`,
  `facturas/revisar` y `facturas/emitir`, antes de «Documentos y reporte»
  y la emisión solo del administrador).
- «Facturar eventos» (`facturacion_eventos`, nuevo): «Por facturar» y las
  puertas del DTE del evento (`/quotations/:id/facturas` y
  `ordenes-de-compra`, antes `postventa`; emitir, antes solo del
  administrador).
- La app abre la entrada «Facturación» del menú con cualquiera de los
  cinco (`SECTION_PERMISO.boletas` es una lista).

## 8. Decisiones de Felipe

1. **El catálogo del §3**: aprobado el 05-11-2026 (*"ok al catalogo
   vamos"*).
2. **Calendario del vendedor**: prendido (05-11-2026).
3. **Los tipos de cliente de cada cargo (§9)**: aprobados el 05-11-2026
   (*"si vamos"*), en cuatro tandas, con dos excepciones: Requerimientos de
   todos y el Calendario como agenda.
4. **Facturación repartida (07-11-2026, *"ok hazlo"*):** recepción emite
   boletas y facturas con el tarifario, operaciones y el administrador
   facturan los eventos, y el vendedor queda sin facturación de fábrica
   (§7 y doc 19 §9.23).

Anotado, no decidido: las 9 puertas «más abiertas que sus pantallas» (§4.3).

## 9. Los tipos de cliente de cada cargo (05-11-2026)

### 9.1 Lo que pidió Felipe

Al pedir que recepción vea también «Club Adulto Mayor» (por «Eventia
(Full)»): *"piénsalo a nivel más sistémico ... podría ser un botón que
prende y se apaga, porque no puede ser una marca sobre otra, sobre otra,
sobre otra en cada configuración"*. Después: *"podrían quedar todos
abiertos, así yo los puedo ir editando"* y *"Todo debería mirar el tipo.
Ahora, si yo un perfil le tengo cerrado postventa, no ve nada"*. Aprobó el
plan del §9.3 el mismo día: *"si vamos"*.

### 9.2 La regla

- **Dos llaves.** Un cargo ve y trabaja lo de un cliente en una sección
  solo si tiene prendidas las dos: la sección (§3) y el tipo del cliente.
  Recepción con «Empresas» prendido pero sin Post-Venta no ve nada de
  Empresas en Post-Venta.
- **Un interruptor por tipo y por cargo**, en el bloque «Tipos de cliente»
  de la pestaña, debajo de los permisos. Sin candados: los cuatro cargos
  se editan.
- **De fábrica, lo de hoy.** Recepción trabaja los tipos marcados
  `es_particular` (doc 21) y los demás cargos, todos. Un tipo nuevo nace
  igual: si no es particular, recepción no lo trabaja hasta que se le
  prenda.
- **Dos excepciones.** Los requerimientos se ven todos: son la puerta de
  entrada y el tipo a veces se corrige después. En el Calendario, los
  eventos de un tipo apagado se ven como agenda, sin plata ni ficha, para
  responder «¿tienen el 20 libre?».
- **Los clientes sin tipo** no llevan interruptor: los ve todo cargo menos
  recepción, como hoy. En producción hay uno solo (medido el 05-11-2026).
- **`es_particular` queda como dato del cliente** (es persona natural): es
  lo de fábrica de recepción y lo usa BelIA para avisar los mal
  clasificados (doc 21 §6). Ya no decide sola lo que ve un cargo.

### 9.3 Las cuatro tandas

| Tanda | Dónde | Con el tipo apagado | Estado |
|---|---|---|---|
| 1 | La pantalla; Cotizaciones (tablero, ficha del negocio, cotizador, crear, editar, borrar, enviar, seguimiento, aviso de cierre, topes, «Crear con IA»), las cuotas de la ficha, el resumen del cliente, el Calendario y BelIA | No ve sus cotizaciones ni sus montos, y no las toca. Es lo de hoy de recepción, ahora para los cuatro cargos | Programada el 05-11-2026 |
| 2 | Post-Venta: pagos, reembolsos, comprobantes, documentos, cocina | Esos eventos no aparecen | Programada el 05-11-2026 (§9.6) |
| 3 | Proveedores (compras del evento) y Personal (planificación) | Esos eventos no aparecen. Ojo: si a quien compra le apagas un tipo, su lista de compras sale sin los insumos de esos eventos | Programada el 05-11-2026 (§9.7) |
| 4 | Clientes, Encuestas y Dashboard | Esos clientes no aparecen ni cuentan en sus números | Programada el 05-11-2026 (§9.8) |

### 9.4 Cómo lo cumple el motor (tanda 1)

- **La tabla**: la misma `permisos_por_cargo`, con la clave
  `tipo_cliente:<id>` (el id no cambia aunque el tipo cambie de nombre), y
  el mismo registro. **Sin migración.**
- **La cuenta** (`auth/permisos.ts`): `claveDeTipo`, `tipoDeFabrica`,
  `tipoPrendido`, `cambiaronSusTipos`, `tiposQueTrabaja` (null si el cargo
  trabaja todos) y `trabajaElTipo`.
- **`PermisosService`**: `tiposDe` (los tipos de la empresa, en
  `cacheTiposDeCliente`, cinco minutos), `tiposDelCargo` (vendedor para
  arriba sin ningún tipo cambiado: null sin leer los tipos, como siempre),
  `nombresDeSusTipos` (el perfil trae `tipos_de_cliente`), `cambiarTipo`
  (`PUT /permisos/tipos`) y la pantalla con `tipos`. Cambiar un interruptor
  de tipo olvida la memoria al instante; crear, ordenar o borrar un tipo,
  también.
- **`AlcanceDeRecepcion`** (sigue con su nombre: nació para recepción)
  aplica la regla a los cuatro cargos en todas sus puertas: `ve`,
  `veLosMontos`, `filtrar`, `paraElCalendario`, `veLaCotizacion`,
  `exigirElTipo` (antes `exigirParticular`) y `exigirElTipoDelCliente`
  (antes `exigirClienteParticular`). El 403 es `SIN_PERMISO`: *«Tu cargo
  no trabaja los clientes de tipo «Empresas»: se prende en Permisos por
  cargo.»*
- **`QuotationsService`**: editar (`revisarElCambio`) y borrar revisan el
  tipo para cualquier cargo; lo de recepción (sin descuento, sin los
  estados de operaciones) sigue siendo solo de ella.
- **BelIA**: la red (`taparPlata`) corre para todo cargo que no trabaja
  todos los tipos; la marca pasó de `particular: true` a `trabaja: true`;
  las herramientas preguntan con `tiposPara` y `loTrabaja`; las propuestas
  (`propuestas/de-recepcion.ts`) revisan el tipo para cualquier cargo; el
  aviso al cambiar el tipo de un cliente dice qué cargos lo ganan o lo
  pierden; y las instrucciones le cuentan a BelIA los tipos del cargo.
- **Lo que la tanda 1 no cubre**: `GET /quotations/check-conflicts` (dice
  si una fecha está tomada: es agenda), las marcas de tope del tablero
  (solo se pintan en las tarjetas que se ven), y Post-Venta, Proveedores,
  Personal, Clientes, Encuestas y Dashboard (tandas 2 a 4).

### 9.5 La pantalla

- El bloque «Tipos de cliente» va en la misma tabla, debajo de los
  permisos, con un `Interruptor` por cargo. «Volver a lo de fábrica»
  vuelve también los tipos. El último cambio dice, por ejemplo, *«prendió
  el tipo «Club Adulto Mayor» a Recepción»*.
- El perfil trae `tipos_de_cliente` (`useAuth().tiposDeCliente`): el
  cotizador muestra solo los clientes de esos tipos y el filtro del tablero,
  solo esos tipos (`utils/recepcion.ts`, `tiposQueTrabaja`). Si el motor
  todavía no lo manda, lo de fábrica.
- El Calendario: un evento que llega como agenda no muestra plata ni abre
  la ficha.

### 9.6 La tanda 2: Post-Venta (05-11-2026)

Felipe: *"si sigue con la tanda 2"*. Con un tipo de cliente apagado, los
eventos de ese tipo no aparecen en Post-Venta ni se tocan.

- **Las listas de toda la empresa** traen solo los eventos que el cargo ve
  (`AlcanceDeRecepcion.soloLasQueVe` y `soloLasClavesQueVe`, que buscan el
  tipo de cada cotización de a 100): la lista de Post-Venta
  (`GET /payments/transactions` y `GET /payments/eventos-sin-plan`), los
  reembolsos (`GET /refunds` y `GET /refunds/paid-map`), los comprobantes
  del portal (`GET /portal-receipts`), el mapa de la bitácora
  (`GET /quotation-followups/map`), los eventos aceptados de compras
  (`GET /logistics/purchasing/accepted-events`) y los recursos de todos los
  eventos (`GET /logistics/event-resources` sin evento).
- **Cada puerta que toca un evento** dice de cuál es con `@DelEvento`
  (`clients/del-evento.decorator.ts`): en la ruta, la consulta, el cuerpo o
  una fila de otra tabla (un pago, un abono, un reembolso, un comprobante,
  un documento, una nota de la bitácora, un recurso, una nota de cocina,
  una silla del personal). El guardián global `TipoDelEventoGuard` (después
  de los derechos) busca la cotización y la deja pasar solo si el cargo la
  ve: los requerimientos, siempre. Un cargo que trabaja todos los tipos
  pasa sin preguntarle a la base. Son 39 puertas; la prueba
  `clients/tests/del-evento.spec.ts` las nombra una por una: **una puerta
  nueva de un evento se agrega ahí**.
- **La ficha** (`/post-venta/:id`) de un evento que no aparece en la lista
  muestra lo de siempre: *«No se encontró ese evento en Post-Venta»*. La
  pantalla no cambió.
- **BelIA**: `pagos_del_evento` no da la plata de un tipo apagado (lo dice
  con el mismo texto) y `cobranza` cuenta solo los eventos de los tipos que
  trabaja; las dos marcan lo suyo con `trabaja: true`.
- **Fuera de la tanda 2**: Facturación (vive solo en el laboratorio; sus
  puertas del evento, como «Emitir DTE», se marcan cuando vaya con
  Post-Venta), la planificación de Personal y las listas de compras
  (tanda 3; con un tipo apagado, BelIA todavía tapa la plata de `compras` y
  `logistica` en vez de esconder esos eventos), y Clientes, Encuestas y
  Dashboard (tanda 4).

### 9.7 La tanda 3: Compras y la planificación de Personal (05-11-2026)

Felipe: *"si sigue con la tanda 3"*. Con un tipo de cliente apagado, los
eventos de ese tipo no aparecen en Compras ni en la planificación de
Personal; como se dijo, la lista de compras de ese cargo sale sin los
insumos de esos eventos.

- **Compras** (`logistics.controller.ts`): el estado de compras
  (`GET /logistics/estado-compras`), los eventos ganados
  (`GET /logistics/purchasing/won-events`) y lo provisionado
  (`GET /logistics/purchasing/supply-provisions`) traen solo los eventos
  que el cargo ve; marcar y desmarcar lo provisionado y guardar o borrar lo
  comprado llevan `@DelEvento`.
- **La planificación de Personal** (`people.controller.ts`): las sillas por
  rango de fechas (`GET /people/staff?desde&hasta`) y las fichas
  (`GET /people/sheets`) sin los eventos que no ve; las sillas de un día
  de restaurante, que no son de un evento, quedan (`soloLasQueVe` con
  `'queda'`). Guardar y cerrar una ficha y «traer la planta» llevan
  `@DelEvento`.
- **Lo que no entra**: la liquidación, la propina, la nómina y el histórico
  de Personal (pagarle a la gente no depende del tipo de cliente), y la
  proyección de la planta (`POST /people/staff/proyectar-planta`), que
  arma la planta de toda la empresa.
- **BelIA**: `lo_que_hay_que_comprar` e `insumos` cuentan solo los eventos
  que el cargo ve y marcan lo suyo con `trabaja: true`; `personal` no da la
  planificación de un evento de un tipo apagado y, de un día, deja solo las
  sillas que ve; `proveedores` y `mobiliario` llevan `plataLibre` (son
  precios del catálogo, no plata de un cliente). Con esto se acaba lo que
  el §9.6 dejó anotado: ya no se tapa la plata de compras en vez de
  esconder esos eventos.
- Las puertas nuevas están en `clients/tests/del-evento.spec.ts`.

### 9.8 La tanda 4: Clientes, Encuestas y Dashboard (05-11-2026)

Felipe: *"si sigue con la tanda 4"*. Con un tipo de cliente apagado, esos
clientes no aparecen ni cuentan en sus números.

- **Clientes**: la lista de `GET /clients` es la de todos, porque la usa
  también el formulario de requerimientos, que es de todos (la excepción
  del §9.2); la pantalla de Clientes deja solo los de los tipos que el
  cargo trabaja (`ClientsPage`, con `tiposQueTrabaja` del perfil). Editar
  o borrar uno de un tipo apagado lo frena el motor
  (`exigirElTipoDelCliente` en `PATCH` y `DELETE /clients/:id`). La ficha
  360 sigue como en la tanda 1: sin plata.
- **Dashboard**: los KPIs (`GET /analytics/dashboard`) se cuentan sin esos
  clientes; la sección Análisis (`GET /analytics/complete`), que la base
  calcula para toda la empresa con nueve funciones, se calcula en el motor
  con las mismas reglas cuando el cargo no trabaja todos los tipos
  (`analytics/analisis-por-tipos.ts`, de a 1000 cotizaciones). Quien
  trabaja todos sigue con las funciones de la base: sus números no
  cambian. La memoria del panel separa cada combinación de tipos
  (`firmaDeTipos`). «Para actuar hoy» (`GET /analytics/hoy`) no avisa lo
  de esos clientes, salvo los requerimientos; el costo de personal por
  evento (`GET /people/costo-personal`), tampoco los cuenta.
- **Encuestas**: las respuestas (`GET /customer-satisfaction-survey/answers`)
  de esos clientes no aparecen ni cuentan en los promedios.
- **Sin migración**, como las otras tres.

