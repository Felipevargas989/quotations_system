# Mapa: Kit de la casa y base compartida de la app

> **Estado: verificado una vez contra el código** (commit 0de0ddb, 11-09-2026). Falta la etapa de completar lo que no quedó escrito. Parte del atlas de docs/arquitectura/mapa; el índice es 00_MAPA_DEL_SISTEMA.md.

## 1. Qué hace

Es el piso sobre el que se paran todas las pantallas de Eventia. No cotiza, no cobra y no liquida: reúne lo que todas las pantallas comparten, para que una mejora hecha una vez llegue sola a todas. Ahí están el desplegable con buscador, la ventana, el aviso, la confirmación, el campo de números, las fechas y el buscador sin tildes. También es la cáscara de la app: el menú lateral, la barra de arriba, quién puede entrar a cada dirección y la conexión con el motor (pone el token y reintenta cuando vence la sesión). Suma la memoria de datos de React Query y la red que evita la pantalla en blanco. La usan todos los roles en todas las etapas de un evento, sin notarlo. La cuida un guardia automático, **el portero**, que deja el CI en rojo si alguien escribe a mano una copia de una pieza que ya existe o si un archivo engorda de más.

Cómo leer los conteos de este mapa: "archivos que la usan" es la cantidad de archivos que la importan, sin contar pruebas, medida con grep en 0de0ddb. Las rutas cortas (`pages/…`, `components/…`) cuelgan de `frontend/src/`.

## 2. Pantallas y rutas de la app

### 2.1 La cáscara (lo que este módulo dibuja)

| Ruta de la app | Componente principal | Archivo | Qué hace el usuario ahí | Rol que la ve |
|---|---|---|---|---|
| toda ruta hija de `/` | `Layout` | `frontend/src/layout/Layout.tsx` | Barra superior con menú de usuario (Gestión de Usuarios, Configuración, Configuración de la Compañía, Cerrar Sesión). Letrero ámbar **LABORATORIO** cuando `VITE_SUPABASE_URL` apunta a la base de pruebas (`ES_LABORATORIO`). Banda de "período de prueba gratuito" si `company.is_premium === false`. Sin sesión, manda a `/login` | cualquiera con sesión |
| (dentro de `Layout`) | `Sidebar` | `frontend/src/layout/Sidebar.tsx` | Menú lateral de 13 entradas filtradas por `ROLE_PERMISSIONS`. Al pasar el mouse empieza a descargar la pantalla | según `ROLE_PERMISSIONS` |
| rutas con guardia | `PermissionGuard` | `frontend/src/components/PermissionGuard.tsx` | Esqueleto mientras llega el rol; "Acceso Denegado" (sin sesión, botón Ir al Login) o "Permisos Insuficientes" | — |
| toda espera | `PageSkeleton` (vía `PageLoader`) | `frontend/src/components/PageSkeleton.tsx` | La única textura de "cargando" | — |
| toda caída al pintar | `RedDeSeguridad` | `frontend/src/components/RedDeSeguridad.tsx` | "Algo se desconectó" con botón Recargar la página | — |
| toda la app, públicas incluidas | `ToastHost` | `frontend/src/components/toast/Toast.tsx` | Tarjetas de aviso abajo a la derecha | — |

### 2.2 Índice de rutas de `App.tsx`

`frontend/src/App.tsx` declara 39 rutas: 10 públicas, la envoltura `Layout` y 28 hijas. Hay 30 pantallas perezosas (`lazy`); solo portada, login, registro y las dos de clave van en el paquete inicial. Los roles salen de `SECTION_ROLES` (`frontend/src/constants/permissions.ts`); "todos" = recepción, vendedor, operaciones y administrador. El detalle de cada pantalla está en su mapa.

| Ruta | Componente | Archivo | Guardia (sección → roles) | Mapa |
|---|---|---|---|---|
| `/`, `/login`, `/register`, `/forgot-password`, `/reset-password` | `LandingPage`, `LoginPage`, `RegisterPage`, `ForgotPasswordPage`, `ResetPasswordPage` | `pages/landingPage/`, `pages/LoginPage.tsx`, `pages/auth/` | pública | 15 |
| ruta oculta del súper administrador (ver `App.tsx`) | `SuperAdminPage` | `pages/superAdmin/Index.tsx` | **pública en la app** (`TODO: add authentication`); el motor exige `SUPER_ADMIN_EMAILS` | 15 |
| `/public-quotation/:company_id` | `CreateQuotationPublic` | `pages/quotations/CreateQuotationPublic.tsx` | pública | 01, 11 |
| `/customer-satisfaction-survey/:companyId/:quotationId` | `CustomerSatisfactionSurveyPublicPage` | `pages/customerSatisfactionSurveys/PublicSurvey.tsx` | pública | 14 |
| `/portal/:token` | `PortalPage` | `pages/portal/PortalPage.tsx` | pública (enlace secreto) | 03 |
| `/imprimir/:token` | `ImprimirCotizacion` | `pages/quotations/ImprimirCotizacion.tsx` | pública (token de corta vida) | 02 |
| `/dashboard` · `/analytics` redirige a `/dashboard` | `DashboardPage` | `pages/dashboard/DashboardPage.tsx` | `dashboard` → administrador | 13 |
| `/requests` | `RequestsPage` | `pages/RequestsPage.tsx` | `requests` → todos | 01 |
| `/quotations`, `/negocio/:id` | `QuotationsPage`, `NegocioPage` | `pages/quotations/` | `quotations` → todos | 02 |
| `/consultas` | `ConsultasPage` | `pages/consultas/ConsultasPage.tsx` | `quotations` → todos | 11 |
| `/quotation-form`, `/quotation-form/:id` | `QuotationForm` | `pages/quotations/QuotationForm.tsx` | `quotations_edit` → vendedor, operaciones, administrador | 01 |
| `/clients`, `/clients/:id` | `ClientsPage`, `ClientDetailPage` | `pages/ClientsPage.tsx`, `pages/ClientDetailPage.tsx` | `clients` → todos | 09 |
| `/post-venta`, `/post-venta/:id` | `PostVentaPage` | `pages/postventa/PostVentaPage.tsx` | `payments` → operaciones, administrador | 04 |
| `/services` | `ServicesPage` | `pages/services/ServicesPage.tsx` | `services` → administrador | 05 |
| `/logistica`, `/inventario` | `LogisticaPage`, `InventarioPage` | `pages/logistica/`, `pages/inventario/` | `logistics` → operaciones, administrador | 06 |
| `/personas`, `/personas/:id` | `PersonasPage`, `PersonaFichaPage` | `pages/personas/` | `people` → administrador | 07, 08 |
| `/marketing`, `/marketing/campana/:id` | `MarketingPage`, `CampanaFichaPage` | `pages/marketing/` | `marketing` → administrador | 10 |
| `/calendar` | `Calendar` | `pages/calendar/Calendar.tsx` | `calendar` → todos | 16 |
| `/admin/users` | `UserManagementPage` | `pages/UserManagementPage.tsx` | `user_management` → administrador | 15 |
| `/configuration` | `ConfigurationPage` | `pages/configuration/ConfigurationPage.tsx` | `configuration` → todos | 15 |
| `/company-configuration` | `CompanyConfiguration` | `pages/configuration/companyConfiguration/CompanyConfiguration.tsx` | `company_configuration` → administrador | 15 |
| `/plans`, `/plans/confirmation` | `Plans`, `ConfirmationPage` | `pages/plans/` | `plans` → todos | 15 |
| `/customer-satisfaction-survey`, `…/template`, `…/answers` | `CustomerSatisfactionSurveysPage`, `TemplateView`, `AnswersView` | `pages/customerSatisfactionSurveys/` | **sin `PermissionGuard`**: basta la sesión que exige `Layout` | 14 |

## 3. Endpoints del motor

El kit no tiene endpoints propios. Esta tabla lista solo lo que la base llama por su cuenta o desde sus ganchos y componentes compartidos. Los endpoints de negocio están en el mapa de cada módulo.

| Método y ruta | Controller y método | Service | Quién lo llama desde la app | Roles o @Public |
|---|---|---|---|---|
| `GET /users/:id` | `UsersController.findOne` (`api-rest/src/users/users.controller.ts`) | `UsersService.findOne` → `UsersRepository.findOne` | `getUser` (`services/users.service.ts`) desde `AuthContext` (`profileQuery` y `signIn`): trae rol, nombre y empresa, que alimentan `PermissionGuard`, `Layout` y `Sidebar` | Autenticado, sin `@Roles` en el método (ver 15) |
| Supabase Auth (no es el motor): `getSession`, `refreshSession`, `onAuthStateChange`, `signInWithPassword`, `signOut` | — | — | `services/api.ts` (token y reintento en 401) y `contexts/AuthContext.tsx` | clave anónima (`VITE_SUPABASE_ANON_KEY`) |
| `GET /quotations/check-conflicts` | `QuotationsController.checkConflictsWithExistingQuotations` | quotations | `useDateAvailability` (en `RequestForm` y `QuotationForm`) | ver 01 |
| `GET /services` | `ServicesController.findAll` | services | `useServices` (`findAllServices`) | ver 05 |
| `/service-groups` y `/service-group-collections` | ver 05 | ver 05 | `useServiceGroups`, `useServiceGroupCollections` | ver 05 |
| `GET /logistics/base-catalogo` | `LogisticsController.baseCatalogo` | logistics | `useBaseLogistica` (`getBaseCatalogo`, ruta escrita a mano fuera de `API_ROUTES`) | ver 06 |
| `GET /payments?quotationId=` | ver 03 | payments | `AvisoPlanDePagos` (`getPaymentsByQuotationId`) | ver 03 |
| `GET /storage/signed-url`, `POST /storage/upload` | ver 03 y 16 | storage | `FileViewLink` (`resolveStorageUrl`) y `storage.service.subir` | ver 03 y 16 |
| `GET /sections/menu-order` | ver 05 | sections | `QuotationViewer` y `FichaCocinaSection` (`getMenuOrder`) | ver 02, 04 y 05 |

## 4. Tablas de la base de datos

La app no toca tablas: `lib/supabase.ts` solo lo importan `services/api.ts` y `contexts/AuthContext.tsx`, y ninguno llama `from`, `rpc` ni `storage`. Todo pasa por el motor.

| Tabla | Qué guarda | Lee o escribe | Migración que la crea o modifica |
|---|---|---|---|
| `user_profiles` | Perfil del usuario: rol, nombre, `company_id` | Lee (vía `GET /users/:id`, `UsersRepository.findOne`) | `docs/migrations/0_initial_models.sql` (foto de contexto); detalle en 18 |
| `companies` | Empresa del usuario (nombre, logo, colores, `is_premium`…), unida al perfil en el mismo `select` | Lee | ver 15 y 18 |
| Navegador (no es base de datos) | `localStorage` `eventia_profile_<userId>` (último perfil conocido, `AuthContext`); `sessionStorage` `eventia_recarga` (candado de recarga, `main.tsx` y `RedDeSeguridad`); la sesión de Supabase, que guarda `supabase-js` | Lee y escribe | — |

## 5. Flujos principales

**Flujo 1: abrir la app y entrar a una pantalla con permiso**
1. `frontend/src/main.tsx` registra el vigilante `vite:preloadError` y monta `RedDeSeguridad` → `QueryClientProvider` (`lib/queryClient.ts`) → `App`.
2. `App` llama `initGA()` (solo reporta en el dominio de producción, `lib/analytics.ts`). A los 2,5 s precarga 10 pantallas en segundo plano.
3. `AuthProvider` pide `supabase.auth.getSession()`. Ante "Invalid Refresh Token" hace `signOut` y escucha `onAuthStateChange`.
4. El perfil sale de `useQuery(["profile", user.id])`. Parte del `localStorage` (`initialData`, con `initialDataUpdatedAt: 0` para revalidar siempre) y luego llama `getUser` → `GET /users/:id` → `UsersService.findOne` → `UsersRepository.findOne` → `user_profiles` + `companies`. Guarda el perfil nuevo en el navegador. `staleTime` 5 min, `retry` 3.
5. `Suspense` muestra `PageSkeleton`. La ruta con sesión entra a `Layout`: con `loading` pinta esqueleto; sin usuario hace `navigate("/login")`.
6. `PermissionGuard` con `SECTION_ROLES.<sección>`: si `loading || roleLoading`, esqueleto; sin usuario, "Acceso Denegado"; rol fuera de la lista, "Permisos Insuficientes"; si pasa, descarga la pantalla perezosa.
7. `Sidebar` pinta solo lo que permite `ROLE_PERMISSIONS`. Mientras no hay rol, no pinta nada.

**Flujo 2: una llamada al motor**
1. La pantalla o el gancho llama a una función de `services/*.service.ts`.
2. `apiRequest(url, method, data, params)` (`services/api.ts`) usa la instancia `api` (Axios): `baseURL` = `VITE_EVENTIA_API_REST`, `withCredentials: true`, JSON por omisión.
3. El interceptor de ida llama `getSupabaseToken()` → `supabase.auth.getSession()` y agrega `Authorization: Bearer`. Si no hay sesión, la petición sale sin token.
4. En el motor, el `AuthGuard` global valida el JWT y los repositorios filtran por `company_id` (ver 15 y 16).
5. Si vuelve un 401 y la petición no tiene `_retry`, llama `supabase.auth.refreshSession()`. Con token nuevo reintenta **una vez**. Si el refresco falla, devuelve el error original: no redirige ni avisa.
6. La pantalla traduce el error con `humanizeApiError` (`utils/apiErrors.ts`) y lo muestra con `toast.error`.
7. Si la llamada vive en `useQuery`, React Query reintenta 2 veces, deja el dato fresco 30 s y lo guarda 30 min en memoria.
8. Las subidas de archivos mandan `headers: { "Content-Type": undefined }` para que el navegador arme el multipart (`storage.service.ts` `subir` y el comprobante de `PortalPage`).

**Flujo 3: se publicó una versión nueva con la pestaña abierta**
1. El usuario navega a una pantalla cuyo archivo ya no existe.
2. Si falla un precargado, `vite:preloadError` en `main.tsx` recarga la página, siempre que hayan pasado más de 10 s desde `eventia_recarga`.
3. Si falla la pieza principal, `React.lazy` lanza el error. `RedDeSeguridad.componentDidCatch` → `esPiezaPerdida` → `recargarConCandado()`, con la misma llave y la misma ventana de 10 s.
4. Si es otro error, o el candado frena la recarga, se ve la pantalla "Algo se desconectó" y el detalle queda en la consola. No toca el motor ni tablas.

**Flujo 4: elegir o sumar con un desplegable de la casa**
1. La pantalla entrega `SelectOption[]` (`value`, `label` y opcionales `group`, `hint`, `dotClass`, `chip`; `components/selects/types.ts`).
2. `SelectWithSearch.abrir()` → `lista.reiniciar()`. `useListaBuscable` pone el foco en el buscador. `useLayoutEffect` mide el contenedor con scroll más cercano **antes de pintar** y decide si abre hacia arriba o hacia abajo, con un alto de 120 a 240 px.
3. Al escribir se filtra con `matchesSearch(texto, label, hint, group)`. Flechas, Enter y Escape pasan por `teclaEnLista`, y `verEnLista` desplaza solo la lista marcada con `data-lista-scroll`.
4. Enter o clic llaman `onChange(value)` y la lista se cierra, salvo con `keepOpenOnSelect`. Un clic fuera (`mousedown`) también la cierra.
5. `AgregadorDeItems` usa el mismo motor con `buscarEnHint: false`, `darLaVuelta: false` y `marcarPrimero: true`. `onAgregar` se puede repetir y la pantalla manda con `abierto` / `onAbiertoChange`.

**Flujo 5: el portero en el CI**
1. Corre a mano con `npm run portero` (`frontend/package.json`) y como último paso del trabajo `frontend` en `.github/workflows/ci.yml`.
2. `frontend/scripts/portero-kit-de-la-casa.sh` se para en `frontend/` y se detiene si no ve `src/`.
3. `buscar` recorre `src` **menos `src/components/*`**, borra los comentarios con awk (incluidos los de varias líneas) y aplica la expresión regular. En las piezas que viven en `utils/` (`rut`, `bancos`, `estadoPersona`) descuenta su propia casa.
4. `revisar` compara con el techo: si lo pasa, imprime RECHAZADO con archivo y línea, y sale con código 1.
5. Cuenta los archivos de más de 800 líneas en `src` y `../api-rest/src` (techo 27) y `congelar` vigila 7 gigantes por nombre.
6. Si una cifra bajó, imprime el techo nuevo para bajarlo en el mismo commit.

## 6. Reglas de negocio acordadas

**Del kit y el portero**
- **Reusar antes de escribir.** Una lista escrita a mano junto a `SelectWithSearch` costó cuatro rondas de correcciones el 13-08-2026 (argumentos del buscador al revés, caja vacía con borde, panel que empujaba los botones, sin cierre al pinchar fuera). Evidencia: `CLAUDE.md`, sección "The house kit".
- **Si a la pieza le falta algo, se agranda la pieza; no se copia.** Evidencia: veredicto final de `portero-kit-de-la-casa.sh`. Condición de Felipe: "la pieza debe respetar los filtros y características de cada lugar"; lo que cambia viaja como parámetro (`docs/arquitectura/09_PLAN_DE_HOMOLOGACION.md`).
- **Nunca migrar a una pieza sin auditarla antes.** Casi se migraron 6 listas a un `SelectWithSearch` con el teclado muerto (`09_PLAN_DE_HOMOLOGACION.md`, "La lección que costó").
- **La deuda solo baja, y el techo se baja en el mismo commit.** Subirlo exige tocar el script con la razón escrita en el commit (`portero-kit-de-la-casa.sh`, encabezado de "LAS REGLAS").
- **Tamaño** (26-08, Felipe: "vamos con la 1"): la cantidad de archivos de más de 800 líneas no crece (techo 27), y los 7 gigantes quedan congelados con 50 líneas de holgura. Al tocar un gigante, lo nuevo se saca a su propio archivo (higuera). Evidencia: bloque "EL TECHO DE TAMAÑO" del portero.
- Una regla del portero solo entra si la copia se reconoce con una expresión regular confiable: "un portero con falsas alarmas se termina ignorando" (encabezado del script).

**De cada pieza**
- **Avisos: `toast`, nunca `alert()`.** Aprobado por Felipe el 31-07 y construido el 03-08. Éxito dura 3,5 s, advertencia 5 s, error 7 s; `sticky` es solo para instrucciones (`Toast.tsx`, `DURACION`).
- **Confirmar: `ConfirmInline`, nunca `confirm()`.** Definido con Felipe el 20-07-2026. Rojo para lo que destruye; `tono="normal"` (azul) para una marca que se deshace ("ya lo llamé", 07-08) (`ConfirmInline.tsx`).
- **Números** (22-07-2026): «La coma es EL decimal. El punto NUNCA es decimal. Los puntos de miles se ponen solos.» Los puntos que teclea la persona se ignoran y no aparece ningún aviso bajo el campo (Felipe capacita al equipo). Fuera de `min`/`max` el campo vibra y avisa, pero no corrige ni congela: el formulario padre bloquea su botón (`NumberInput.tsx`).
- **Búsqueda única** (21-07-2026, caso "universidad concepción"): ignora tildes y mayúsculas y busca por palabras en cualquier orden. El texto buscado va **primero**: `matchesSearch(query, ...targets)` (`utils/searchMatch.ts`).
- **El agregador** nunca muestra lo elegido (Felipe, 04-08: "ensucia la vista"), se queda abierto con el cursor en el buscador, marca la primera fila, no busca por el precio (`hint`), no da la vuelta con las flechas y abre hacia abajo (desde el 28-08 existe `haciaArriba` para el final de un modal) (`AgregadorDeItems.tsx`).
- **Buscar por sección**: sí en los ítems (Felipe, 07-08: "postres" trae la sección); no en los fijos, porque el rótulo "Sin sección" haría que "sin" los traiga a todos (`useListaBuscable.ts`, `buscarEnGrupo`).
- **Un nombre guardado se muestra; un id no.** Una categoría renombrada se sigue viendo, pero un número pelado o un UUID muestra el placeholder (revisión del 16-08: aparecía un "7" en Insumos) (`valorSePuedeMostrar`).
- **Una sola fila azul**: el azul marca dónde se está parado y lo ya elegido lleva un visto (Felipe, 13-08) (`SelectWithSearch.tsx`).
- **La lista se mide antes de pintar** (Felipe, 09-09: "se mueven las categorías") (`SelectWithSearch.tsx`, `useLayoutEffect`).
- **Ventanas con `Modal`** (15-08, "me cubre toda la pantalla, no logro ni cerrarlo"): anclada arriba, tope `88vh` con scroll solo en el cuerpo y cabecera siempre visible. Cierra con Escape y con clic en el fondo, este último con `onMouseDown` y `target === currentTarget` para que arrastrar texto no la cierre. `sinTope` sirve para ventanas con buscador (se veía el 4 % de los nombres) y `altoFijo` para el asistente de pagos (Felipe, 08-09) (`Modal.tsx`).
- **`Tooltip` es solo para leer** (Felipe, 16-08: "pasar el mouse por el dinero"). Con `titulo` vacío no lleva `title`, porque salían dos letreros (31-08); `lado="izquierda"` sirve para la última columna (17-08) y `ancho="amplio"` para nombre + monto (31-08) (`Tooltip.tsx`).
- **"Sin evaluar" no es cero estrellas**; se muestra el promedio simple (15-08) (`Estrellas.tsx`; `10_MODULO_DE_PERSONAS.md`).
- **El sello «fijo»** se queda el 99 % de las veces. Se quita solo en esta cotización, con `ConfirmInline`; el catálogo no cambia (Felipe, 09-09; CCU #408) (`FijoDeCategoria.tsx`, `QuitarFijo`).
- **La grilla de días** tiene anchos fijos e iguales en todas sus instancias para que dos grillas calcen columna con columna. La ✕ va roja junto al día y solo en los días agregados a mano (Felipe, 15-08) (`GrillaDeDias.tsx`).
- **La colación** nunca es cero (30 min o 1 h, Felipe 15-08), es una sola fila en Planificación y Liquidación (16-08) y va en azul "como en toda la casa" (18-08) (`SelectorColacion.tsx`).
- **La hora** siempre en 24 h: se teclea `2200` o `930` y se guarda una vez, al salir o con Enter (Felipe, 18-08) (`HoraInput.tsx`).
- **El RUT** viaja limpio (`7093990-8`), con K mayúscula y rechazando el 55.555.555-5. Tiene gemelo en `api-rest/src/people/utils/rut.ts` y las correcciones se hacen en los dos (`utils/rut.ts`, 14-08).
- **Fechas**: la fecha de un evento se lee en UTC (`formatFechaEvento`, bug #423) y un instante se lee en hora chilena (`formatMomento`). "Hoy" es `hoyEnChile()`, no `new Date().toISOString()`, que da la fecha de Londres después de las 21:00 (`utils/dates.ts`).
- **Un evento realizado queda congelado**: el servidor es la autoridad y la pantalla solo lo refleja (13-08) (`utils/eventoCongelado.ts`).
- **La propina no es venta** (24-07) y el `tip_amount` guardado manda (25-07, migración 37) (`utils/quotationMoney.ts`, espejo `api-rest/src/quotations/utils/tip.ts`).
- **Una sola cuenta de dinero**: el alias `@dinero` apunta a `api-rest/src/quotations/utils/money.ts` (27-07) (`vite.config.ts`, `tsconfig.json`).

**De la cáscara y los permisos**
- **Recepción mira y no edita** (12-08): `quotations` ≠ `quotations_edit`. Recepción ve el calendario porque "¿tienen el 20 libre?" es la pregunta más común del mostrador. Personas es solo del administrador (14-08, ahí viven las cuentas bancarias) y Marketing también (25-08) (`permissions.ts`).
- **Mientras llega el rol no se muestra nada** (12-08): antes recepción veía por un parpadeo Dashboard y Post-Venta. El falso "Permisos Insuficientes" mientras el rol venía en camino se corrigió el 21-07 (`Sidebar.tsx`, `Layout.tsx` `canAccess`; `PermissionGuard.tsx`).
- **Los roles tienen espejo en el motor**: `api-rest/src/auth/roles.decorator.ts` usa los mismos nombres y avisa "si se cambia un lado, se cambia el otro".
- **Memoria de datos** (Felipe, 21-07): `staleTime` 30 s, `gcTime` 30 min, revalida al volver a la pestaña y `retry` 2. Las pantallas de plata ponen `staleTime: 0` en sus consultas (`lib/queryClient.ts`).
- **Perfil "mostrar lo conocido y refrescar por detrás"** (21-07); la autoridad real está en el motor (`AuthContext.tsx`).
- **Carga por partes** (28-07): toda pantalla detrás del login va `lazy`. Las más usadas se precargan y el menú precalienta al pasar el mouse (12-08) (`App.tsx`, `Sidebar.tsx`).
- **Una sola textura de espera** (hallazgo de Felipe, 28-07) (`PageSkeleton.tsx`).
- **Pantalla blanca**: recarga una sola vez con candado de 10 s (03-08) y hay una red bajo toda la app (Felipe, 02-09, tras la caída del 01-09 subiendo un comprobante) (`main.tsx`, `RedDeSeguridad.tsx`).
- **Letrero LABORATORIO** (28-07: "Felipe entró al lab sin querer") (`Layout.tsx`).
- **Renombrar un menú no cambia la dirección**: Catálogo sigue en `/services` (28-07), Proveedores en `/logistica` y Personal en `/personas` (15-08), para no romper enlaces guardados (`Sidebar.tsx`).
- **Una sola puerta**: toda llamada va por `services/*.service.ts` con rutas de `constants/api.routes.ts` (`CLAUDE.md`), y los archivos pasan por el motor desde el 28-07 (`storage.service.ts`).
- **Google Analytics solo en producción** (10-08); el ID anterior era de una cuenta ajena (`lib/analytics.ts`).

## 7. Conexiones con otros módulos

### 7.1 Piezas visuales del kit: qué hacen, qué casos resuelven y quién las usa

| Pieza (archivo, líneas) | Qué hace y qué casos borde ya resuelve | Archivos | Cuáles |
|---|---|---|---|
| `SelectWithSearch` (`components/selects/SelectWithSearch.tsx`, 368) | Elige UN valor. Buscador sin tildes, flechas, Enter y Escape en el buscador; abre hacia arriba si no cabe; se mide contra el contenedor con scroll; cierra al pinchar fuera; reabre con el buscador vacío; ✕ para limpiar fuera del botón (no botón dentro de botón); muestra el nombre guardado pero no ids; `group`, `hint`, `chip`, `tamano`, `mostrarConteo`, `keepOpenOnSelect` | **20** (64 usos) | `RequestForm`, `ClientsPage`, `UserManagementPage`, `AnswersView`, `NewUserRegisterForm`, `InsumosTab`, `RecursosTab`, `EvaluacionesDePersona`, `PersonaForm`, `SemanaTab`, `EventResourcesSection`, `GrillaPersonal`, `PostVentaPage`, `ServiciosTab`, `CreateQuotationPublic`, `PkgFijosPicker`, `QuotationForm`, `FixedCostSection`, `FixedServiceForm`, `RecipeTab` |
| `AgregadorDeItems` (`components/selects/AgregadorDeItems.tsx`, 265) | SUMA varios. Nunca muestra lo elegido, queda abierto con el cursor, marca la primera fila, lista de hasta 43rem, no busca por precio, `data-lista-scroll` en el elemento que de verdad scrollea, cabecera pegajosa sobre las opciones, hover azul, `fondoBlanco`, `haciaArriba`, `buscarPorSeccion` | **4** | `SemanaTab`, `ServiciosTab`, `PkgMenusPicker`, `QuotationForm` |
| `useListaBuscable` (`hooks/useListaBuscable.ts`, 205) | El motor de las listas: filtrar, teclado en el buscador, mantener a la vista lo marcado (con `texto` en las dependencias), cerrar con `mousedown` afuera, foco al abrir. No dibuja nada | 3 piezas → **21** archivos | `SelectWithSearch`, `AgregadorDeItems`, `SelectorDePaquetes` |
| `SelectorDePaquetes` (`components/selects/SelectorDePaquetes.tsx`, 200) | "Partir de un paquete": buscador con motor compartido, basurero por fila con confirmación, pie "+ Crear paquete nuevo…" (higuera 03-09) | 1 | `QuotationForm` |
| `SectionChipSelect` (`components/selects/SectionChipSelect.tsx`, 136) | Chip con menú sin buscador para pocas secciones (30-07); se levanta si no cabe abajo (03-08); `zeroLabel` null; `chipClass` para la cosecha del mes (07-08) | 5 | `DashboardPage`, `ServiciosTab`, `QuotationForm`, `FixedServicesBySection`, `VariableServicesByCategory` |
| `MultiSelect` (`components/MultiSelect.tsx`, 214) | Elegir VARIAS con casillas, "Seleccionar Todo" (con búsqueda solo suma lo visible), "Limpiar Todo", contador; `buscador` desde el 28-08 | **6** | `ClientsPage`, `EditorDeBorrador`, `MarketingPage`, `SegmentoBuilder`, `PostVentaPage`, `ServicesPage` |
| `NumberInput` (`components/inputs/NumberInput.tsx`, 238) | Norma es-CL en vivo: miles con punto, coma decimal, cursor repuesto; selecciona todo al entrar; no toma el valor de afuera mientras tiene foco; aviso de rango con `$` si `currency`; `onCommit` al salir | **21** (53 usos) | `PaymentPlanEditor`, `RequestForm`, `TablaDeJornadas`, `CompanyConfiguration`, `ComprasTab`, `InsumosTab`, `MobiliarioTab`, `RecursosTab`, `FichasTab`, `SemanaTab`, `PortalPage`, `EventResourcesSection`, `GrillaPersonal`, `PostVentaPage`, `ServiciosTab`, `CreateQuotationPublic`, `QuotationForm`, `FixedCostSection`, `FixedServiceForm`, `RecipeTab`, `VariableServiceForm` |
| `HoraInput` (`components/inputs/HoraInput.tsx`, 165) | 24 h siempre; `normalizarHora` entiende `9`, `930`, `22.30`; guarda una vez; algo inválido vuelve a la hora anterior; Escape descarta; muestra HH:MM sin segundos | 7 | `TablaDeJornadas`, `ProgramarEnvio`, `MiniCalendario`, `PersonaForm`, `ResumenDelDia`, `SemanaTab`, `FichaCocinaSection` |
| `RutInput` (`components/inputs/RutInput.tsx`, 199) | Puntos y guion solos, nunca se come un carácter, K mayúscula, no reclama antes de tiempo, el `errorExterno` del servidor manda | 1 | `PersonaForm` |
| `SelectorColacion` (`components/inputs/SelectorColacion.tsx`, 55) | 30 min / 1 h, nunca cero | 4 | `TablaDeJornadas`, `MiniCalendario`, `PersonaForm`, `SemanaTab` |
| `toast` + `ToastHost` (`components/toast/Toast.tsx`, 112) | Almacén sin contexto; se apila, se va solo según el tipo, `sticky`, siempre se puede cerrar; un solo anfitrión en `App.tsx` | **36** (179 llamadas) | 32 de `pages/` (entre ellas `QuotationForm`, `PostVentaPage`, `NegocioPage`, `PortalPage` y las de Personas y Marketing), `EventoCajitas`, `QuotationViewer`, `RequestForm`, `useCopiarDato` |
| `ConfirmInline` (`components/ConfirmInline.tsx`, 47) | Pregunta Sí/No en el lugar; `busy` deshabilita los dos botones y muestra "…"; `tono` | **18** (25 usos) | `FijoDeCategoria`, `SelectorDePaquetes`, `ClientDetailPage`, `ClientsPage`, `RequestsPage`, `ConsultasPage`, `CampanaFichaPage`, `NominaTab`, `PersonaFichaPage`, `EventResourcesSection`, `PostVentaPage`, `ServiciosTab`, `MenusGuardados`, `NegocioPage`, `QuotationForm`, `SeguimientoPanel`, `FixedServicesBySection`, `VariableServicesByCategory` |
| `QuantitySelector` (`components/QuantitySelector.tsx`, 163) | − / número tecleable / +; topa en `min` (0 por omisión) y `max`; Enter confirma, Escape descarta | 3 (+3 vía la grilla) | `GrillaDeDias`, `ServiciosTab`, `QuotationForm` |
| `GrillaDeDias` (`components/grilla/GrillaDeDias.tsx`, 269) | Días en columnas con contador por día, 3 columnas de valores + acción, `colgroup` fijo, `rotuloDia` en UTC al mediodía, bandas de `grupo`, `renderCelda` (sábana), `onDiaClick`, `congelado` | 3 | `SemanaTab`, `EventResourcesSection`, `GrillaPersonal` |
| `Estrellas` (`components/Estrellas.tsx`, 73) | Muestra o edita de 1 a 5; `null` = "sin evaluar"; promedio redondeado al pintar y con un decimal si `conNumero` | 4 | `EvaluacionesDePersona`, `FichasTab`, `PersonaFichaPage`, `PersonasPage` |
| `Modal` (`components/Modal.tsx`, 121) | Ver la regla en 6; `acciones`, `pie`, `bloquearEscape`, `sinTope`, `altoFijo` | **12** (16 usos) | `RecursosTab`, `CampanaFichaPage`, `MarketingPage`, `ProgramarEnvio`, `CargosModal`, `FichasTab`, `NominaTab`, `PersonasPage`, `PreguntaDiaExtra`, `RevisionDeNomina`, `SemanaTab`, `QuotationForm` |
| `Tooltip` (`components/Tooltip.tsx`, 69) | Solo CSS (`group-hover`), `pointer-events-none`, `title` de respaldo cuando lo corta un contenedor; `lado`, `direccion`, `ancho` | 3 | `IngresosYCaja`, `PagosDePersona`, `RevisionDeNomina` |
| `FijoDeCategoria` / `QuitarFijo` (`components/FijoDeCategoria.tsx`, 63) | Sello ámbar con candado y ✕ con confirmación | 2 | `ServiciosTab`, `QuotationForm` |
| `ChipDeEstado` (`components/ChipDeEstado.tsx`, 111) | Píldora que despliega los otros estados, cada uno con su color; cierra con clic afuera y Escape | 1 | `PersonaFichaPage` |
| `IconoWhatsApp` (`components/IconoWhatsApp.tsx`, 24) | El logo real, `aria-hidden` | 1 | `PersonaFichaPage` |
| `PageSkeleton` (`components/PageSkeleton.tsx`, 22) | Esqueleto único, sin parámetros | 5 | `App` (`PageLoader`), `PermissionGuard`, `Layout`, `PersonaFichaPage`, `PersonasPage` |
| `PermissionGuard` (`components/PermissionGuard.tsx`, 90) | Guardia por rol; espera `loading` y `roleLoading`; `fallback` opcional, que nadie usa | 1 archivo, **24 rutas** | `App.tsx` |
| `RedDeSeguridad` (`components/RedDeSeguridad.tsx`, 91) | Límite de errores para toda la app | 1 | `main.tsx` |
| `TablaDeJornadas` (`components/personas/TablaDeJornadas.tsx`, 268) | Tabla de liquidación, pieza del módulo de Personas (18-08) | 1 | `FichasTab` (ver 08) |

### 7.2 Base no visual: servicios, constantes, ganchos, utilidades y tipos

| Pieza | Qué hace y casos que resuelve | Quién la usa | Mapa temático |
|---|---|---|---|
| `services/api.ts` | Instancia Axios, token por petición, un reintento en 401 y `apiRequest` | 31 archivos: 30 servicios + `PortalPage` | todos |
| `constants/api.routes.ts` (118) | Rutas del motor por nombre | 28 servicios + `PortalPage`; **7 rutas escritas a mano** en `auth.service.ts` (2), `logistics.service.ts` (`/logistics/base-catalogo`, `/logistics/estado-compras`) y `storage.service.ts` (3) | todos |
| `constants/permissions.ts` (129) | `UserRole`, `Section`, `ROLE_PERMISSIONS` (menú), `SECTION_ROLES` (rutas), `ROLE_GROUPS`, `canAccessSection` | `App`, `Layout`, `Sidebar`, `PermissionGuard` y chequeos a mano en 11 archivos (`QuotationsPage`, `RequestsPage`, `NegocioPage`, `ClientDetailPage`, `Calendar`, `ConfigurationPage`, `QuotationForm`, `ServiciosTab`, `PostVentaPage`, `DashboardPage`, `LoginPage`) | 15 |
| `constants/users.ts`, `payments.ts`, `services.ts`, `clientTypes.ts`, `dates.ts`, `companies.ts` | `enum UserRole` (segunda definición), `PaymentStatus`, `CalculationType` (con `VARIABLE_CON_LIMITES` retirado y solo para historia), 6 tipos de cliente (`DEFAULT_CLIENT_TYPE` "Particulares"), `MONTHS`, `CURRENCIES` | varios | 03, 05, 09 |
| `lib/queryClient.ts` (23) | Política global de React Query | `main.tsx`, y `FichasTab` lo importa directo | todos |
| `lib/supabase.ts` (10) | Cliente con clave anónima; **lanza error al importarse** si faltan `VITE_SUPABASE_URL` o `VITE_SUPABASE_ANON_KEY` | `api.ts`, `AuthContext.tsx` | 15 |
| `lib/analytics.ts` + `hooks/usePageViews.ts` | GA4 solo en el dominio de producción; una vista por cambio de ruta (`RastreadorDeRutas`) | `App.tsx` | 13 |
| `hooks/useCopiarDato.ts` | Copia con 2 s de confirmación; limpia el reloj al desmontar; avisa si el navegador niega el portapapeles | `ClientDetailPage`, `PostVentaPage`, `NegocioPage` | 02, 04, 09 |
| `hooks/useDateAvailability.ts` | Choque de fechas; `excludeId` evita que un requerimiento choque consigo mismo (18-08) | `RequestForm`, `QuotationForm` | 01 |
| `hooks/useServices.ts`, `useServiceGroups.ts`, `useServiceGroupCollections.ts` | Catálogo, menús guardados y paquetes con caché compartido | `QuotationForm`, `ServiciosTab`, `ServicesPage` | 05 |
| `hooks/useBaseLogistica.ts` | Una sola clave `["logistica","compras","base"]` con `staleTime` 5 min | `MobiliarioTab`, `CocinaTab`, `GestionTab`, `ServiciosTab` | 06 |
| `utils/searchMatch.ts` | `normalizeText`, `matchesSearch`, `canonicalServiceName` (22-07) | 21 (incluye `MultiSelect`, `useListaBuscable`, `logistics.service`) | — |
| `utils/verEnLista.ts` | Desplaza solo la lista, sin `scrollIntoView` (07-08) | `useListaBuscable` | — |
| `utils/dates.ts` | `formatFechaEvento`, `formatMomento`, `hoyEnChile`, `hoyEnChileMas`, `formatISOUTCDateToString` | 18 | — |
| `utils/apiErrors.ts` | `humanizeApiError`: campos de validación de NestJS en español | 20 | — |
| `utils/phone.ts`, `utils/validation.ts` | `+56XXXXXXXXX` al guardar, formato al mostrar, `phoneProblem` (30-07), `emailProblem` | 14 y 2 | 09 |
| `utils/estadoCotizacion.ts` | Nombre, color, emoji y orden de cada estado; "Anulada" en pantalla, `cancelada` en la base | 8 | 02 |
| `utils/estadoPersona.ts`, `rut.ts`, `bancos.ts` | Diccionarios de Personas | 4, 5 y 5 | 07, 08 |
| `utils/costoDeRecursos.ts` | Fijo una vez + variable × personas × días (16-08) | 3 | 04, 07 |
| `utils/eventConsolidation.ts` | Consolida insumos y mobiliario; la merma solo infla el costo (22-07) | 7 | 06 |
| `utils/quotationMoney.ts` | `tipAmountOf`, `saleWithoutTip` | 2 (`DashboardPage`, `GestionTab`) | 13, 04 |
| `utils/categoriaCaja.ts` | Casilla ↔ categoría: por id, luego nombre y luego nombre normalizado (06-08) | 2 | 01 |
| `utils/currencies.ts`, `clientTypeColor.ts` | `formatCurrency` blindado ante moneda vacía (23-07); color estable por tipo de cliente | 6 y 7 | 13, 09 |
| `utils/quotationPrintDoc.ts`, `urls.ts`, `eventoCongelado.ts` | La hoja de cotización pura (30-07); `urlAbsoluta` (05-09); candado del realizado | 2, 2 y 5 | 02, 10, 04 |
| `types/*.ts` (17 archivos) | Espejo a mano de las entidades del motor; `notifications.ts` repite el `EmailStructure` de `api-rest/src/email/types/index.ts` | todo el frontend | 18 |

### 7.3 Componentes de negocio que viven en `components/` (no son kit)

`AvisoPlanDePagos` (→ 03: `ServiciosTab`, `QuotationForm`) · `CelebracionRealizada` (→ 04: `PostVentaPage`) · `EventoCajitas` (→ 02 y 04: `NegocioPage`, `PostVentaPage`) · `FileViewLink` (→ 03: `PostVentaPage`) · `MotivoPerdida` (→ 02: `DashboardPage`, `PostVentaPage`, `NegocioPage`, `QuotationsPage`) · `PaymentPlanEditor` (→ 03: `NegocioPage`, `QuotationsPage`) · `PhotoPopup` (→ 04, 05 y 06: `MobiliarioTab`, `GestionTab`, `RecipeTab`) · `PieDeMarcaPublico` (→ 10 y 11: `CreateQuotationPublic`) · `QuotationViewer` (→ 02: `ClientDetailPage`, `PostVentaPage`, `NegocioPage`, `QuotationsPage`) · `RequestForm` (→ 01: `RequestsPage`). Por vivir en `components/`, el portero no los revisa.

### 7.4 Con otros módulos

- **A quién usa:** el motor completo por HTTP (`api.ts`); Supabase Auth y `GET /users/:id` (**15**); el archivo `api-rest/src/quotations/utils/money.ts` en tiempo de compilación vía `@dinero` (**01**); el espejo de roles `api-rest/src/auth/roles.decorator.ts` (**15**); CORS con credenciales en el motor por `withCredentials: true` (**16** y **19**); el CI y Netlify (**19**).
- **Quién lo usa:** todos los mapas de pantallas, del 01 al 16. Con más peso: **01** (cotizador: `SelectWithSearch`, `AgregadorDeItems`, `SelectorDePaquetes`, `SectionChipSelect`, `QuantitySelector`, `FijoDeCategoria`, `Modal`, `useServices`, `useDateAvailability`), **04** (`ServiciosTab`, `PostVentaPage`, `GrillaPersonal`), **07 y 08** (`Modal`, `GrillaDeDias`, `Estrellas`, `HoraInput`, `RutInput`, `SelectorColacion`, `TablaDeJornadas`, `Tooltip`, `ChipDeEstado`) y **10** (`MultiSelect`, `Modal`, `HoraInput`).
- **Efectos automáticos de la base:** revalidar al volver a la pestaña (todas las consultas sin excepción propia); consultas con recarga cada 5 min (`refetchInterval` en `DashboardPage` y `PostVentaPage`); precarga de 10 pantallas a los 2,5 s; recarga automática ante pieza perdida; vista de página a Google Analytics en producción; toasts que se van solos. **La base no manda correos ni tiene relojes del motor.**

## 8. Zonas de riesgo: si tocas esto, cuidado con aquello

1. **Si tocas** `useListaBuscable`, **se afecta** el teclado, el filtro y el cierre de 21 archivos (20 con `SelectWithSearch`, 4 con `AgregadorDeItems`, más `SelectorDePaquetes`), **porque** es el motor único de las tres piezas. Ya pasó: el teclado estuvo muerto meses en 15 pantallas por colgar el manejador del botón (13-08). Evidencia: `hooks/useListaBuscable.ts` `teclaEnLista`; `SelectWithSearch.test.tsx` y `AgregadorDeItems.test.tsx`.
2. **Si tocas** `verEnLista` o mueves el atributo `data-lista-scroll`, **se afecta** la posición de la fila marcada y hasta la de la página entera, **porque** mide `offsetTop` contra el elemento posicionado que scrollea. El 07-08 `scrollIntoView` mandaba la pantalla al fondo y el 14-08 un `div` mal marcado montó las opciones sobre el buscador. Evidencia: `utils/verEnLista.ts`; comentarios en `AgregadorDeItems.tsx` y `SelectWithSearch.tsx`.
3. **Si tocas** `valorSePuedeMostrar` o la búsqueda de `selectedOption`, **se afecta** lo que se ve en 17 pantallas que guardan ids (el proveedor "7", el UUID del cliente al cargar), **porque** la pieza decide entre mostrar el nombre guardado o el placeholder. Evidencia: `SelectWithSearch.tsx` `valorSePuedeMostrar`; `valorSePuedeMostrar.test.ts`.
4. **Si tocas** los interceptores de `services/api.ts`, **se afecta** toda llamada de 30 servicios y del portal público, **porque** ahí se pone el token y se reintenta el 401 una sola vez. Si el refresco falla, no hay redirección ni aviso: cada pantalla recibe el error. No se juntan los refrescos: varias peticiones con 401 a la vez piden cada una su `refreshSession`. Evidencia: `api.interceptors.response.use` en `services/api.ts`.
5. **Si tocas** los encabezados por omisión de `api` (`Content-Type: application/json`), **se afectan** las subidas de comprobantes y archivos, **porque** esas llamadas anulan el encabezado con `"Content-Type": undefined` para mandar `FormData`. Evidencia: `storage.service.ts` `subir`; comprobante en `PortalPage.tsx`.
6. **Si tocas** `lib/queryClient.ts`, **se afecta** toda consulta que no fije su propia política, **porque** `staleTime`, `refetchOnWindowFocus` y `retry` son globales. Hay 24 consultas con `staleTime: 0` (Post-Venta, Nómina, Negocio, Seguimiento…) que no heredan el cambio, y todas las demás sí. `retry: 2` retrasa que un error llegue a la pantalla. Evidencia: `grep staleTime` en `pages/`.
7. **Si tocas** `constants/permissions.ts`, **se afectan** el menú (`ROLE_PERMISSIONS`), las 24 rutas (`SECTION_ROLES`) y 19 chequeos a mano en 11 pantallas, **porque** hay dos matrices que ya no dicen lo mismo: vendedor abre `/calendar` por dirección sin verlo en el menú (`SECTION_ROLES.calendar` lo deja pasar, `ROLE_PERMISSIONS.vendedor` no trae `calendar`). Con `plans` el problema es otro: está en las dos matrices (abierto a todos por ruta, solo `administrador` en `ROLE_PERMISSIONS`) pero ningún menú la consulta — ni `Sidebar` ni el desplegable de `Layout` tienen una entrada para `/plans` — así que esa fila de `ROLE_PERMISSIONS` es letra muerta; a `/plans` se llega por el botón de la banda de prueba gratuita (visible a cualquier rol) o escribiendo la dirección. El motor tiene su propia copia, que no se sincroniza sola. Evidencia: `constants/permissions.ts`; `layout/Sidebar.tsx`, `layout/Layout.tsx` (ninguno llama `canAccess("plans")`); `api-rest/src/auth/roles.decorator.ts`.
8. **Si tocas** `PermissionGuard` o `roleLoading` en `AuthContext`, **se afecta** la entrada a 24 rutas, **porque** si la consulta del perfil falla (tras 3 reintentos), `roleLoading` pasa a falso sin rol y la guardia muestra "Permisos Insuficientes", cuando lo que falló fue la red. Ya hubo un falso "Permisos Insuficientes" (21-07). Evidencia: `AuthContext.tsx` (`roleLoading = !!user && !profileQuery.data && profileQuery.isPending`); `PermissionGuard.tsx`.
9. **Si agregas** una pantalla de administración sin `PermissionGuard`, **se afecta** quién puede verla, **porque** `Layout` solo exige sesión. Ya ocurre con `/customer-satisfaction-survey`, `/template` y `/answers`, que el menú muestra solo al administrador. Evidencia: `App.tsx`; `Sidebar.tsx` (sección `customer_satisfaction_survey`). La defensa real está en el motor (ver 14).
10. **Si tocas** la llave `eventia_recarga` o la ventana de 10 s en un solo lugar, **se afecta** la cura de la pantalla blanca: puede aparecer un bucle de recargas o dejar de recargar, **porque** `main.tsx` y `RedDeSeguridad.tsx` comparten candado a mano. Evidencia: `recargarConCandado`, `CANDADO`, `VENTANA_MS`; listener `vite:preloadError`.
11. **Si publicas** sin `VITE_SUPABASE_URL` o `VITE_SUPABASE_ANON_KEY`, **se afecta** la app entera, que no arranca, **porque** `lib/supabase.ts` lanza el error al importarse, antes de que exista `RedDeSeguridad` para atajarlo. Evidencia: `lib/supabase.ts`. El CI compila con valores de forma (`.github/workflows/ci.yml`, trabajo `frontend`).
12. **Si pones** un `SelectWithSearch` dentro de un `Modal` sin `bloquearEscape`, **se afecta** la ventana, porque un solo Escape cierra la lista y también la ventana. **Porque** `teclaEnLista` hace `preventDefault` sin `stopPropagation` y `Modal` escucha `keydown` en `window` sin mirar `defaultPrevented`. Hoy solo `SemanaTab` pasa `bloquearEscape`; están expuestos el modal "Crear paquete" de `QuotationForm` y "Nuevo recurso" de `RecursosTab`. Evidencia: `Modal.tsx`, `useListaBuscable.ts`. Deducido del código, sin probar en el laboratorio.
13. **Si tocas** `NumberInput`, **se afectan** 53 campos en 21 archivos (montos, recetas, personas, porcentajes), **porque** `onChange` se dispara con cada tecla aunque el valor viole `min`/`max`: la pantalla que no bloquee su botón guarda fuera de rango. Además acepta decimales también en dinero y no toma el valor externo mientras tiene foco. Evidencia: `NumberInput.tsx` `rangeCheck`, `handleChange`, `useEffect` con `isFocusedRef`.
14. **Si tocas** `QuantitySelector`, **se afectan** el cotizador, Servicios de Post-Venta y las 3 grillas de días, **porque** `GrillaDeDias` lo usa en cada celda y apaga el + con `max={cant}`. Un número tecleado fuera de rango se ignora en silencio hasta salir del campo. Evidencia: `GrillaDeDias.tsx`; `QuantitySelector.tsx` `handleInputChange`.
15. **Si cambias** los anchos de `GrillaDeDias`, **se afecta** la alineación entre `SemanaTab`, `GrillaPersonal` y `EventResourcesSection`, **porque** la regla es que dos grillas apiladas calcen columna con columna (Felipe, 15-08). Evidencia: `colgroup` en `GrillaDeDias.tsx`.
16. **Si confías** en que el portero te cuida dentro de `components/`, **se afecta** la regla del kit, **porque** `buscar` excluye `src/components/*` completo: una copia a mano ahí pasa en verde (`ChipDeEstado` lo cuenta como estrategia a propósito). La regla de paneles también depende del orden de las clases: el menú de usuario de `Layout` (`absolute … bg-white … shadow-lg … z-50`) no calza y no se cuenta. Evidencia: `portero-kit-de-la-casa.sh` `buscar` y la regla "panel flotante a mano".
17. **Si agregas** un panel flotante nuevo o un archivo de más de 800 líneas, **se afecta** el CI, que queda en rojo, **porque** hoy los techos están justos: 13/13 paneles y 27/27 archivos grandes. Evidencia: corrida del portero en 0de0ddb (sección 10).
18. **Si editas** solo `frontend/vite.config.ts`, **se afecta** nada, o peor, algo distinto a lo esperado, **porque** Vite busca `vite.config.js` antes que `.ts` y en el repo están versionados los dos (hoy con el mismo contenido). Evidencia: `node_modules/vite/dist/node/constants.js` (`DEFAULT_CONFIG_FILES`); `git ls-files` muestra `vite.config.js` y `vite.config.d.ts`.
19. **Si tocas** `api-rest/src/quotations/utils/money.ts`, **se afecta** la compilación del frontend (`QuotationForm`, `ServiciosTab`, `useServices`), **porque** `@dinero` lo importa tal cual por alias en `vite.config.ts`/`.js` y `tsconfig.json`. Evidencia: los tres archivos.
20. **Si mueves o renombras** una pantalla, **se afectan** tres listas de importaciones: `App.tsx` (`lazy` y precarga), `Sidebar.tsx` (`precargar`) y `Layout.tsx` (precalentado del menú de usuario). TypeScript avisa si una ruta no existe, pero la precarga falla en silencio (`.catch(() => {})`). Evidencia: esos tres archivos.
21. **Si tocas** `utils/dates.ts` o usas `new Date()` para una fecha de evento, **se afecta** la fecha en 18 archivos, **porque** una fecha de evento a medianoche UTC leída en hora chilena se corre un día (bug #423), y el "hoy" de Londres falla entre las 21:00 y la medianoche. Evidencia: `formatFechaEvento`, `hoyEnChile`; `dates.test.ts`.
22. **Si inviertes** los argumentos de `matchesSearch`, **se afecta** el buscador de 21 archivos, sin error visible, **porque** el primero es la consulta y los demás son los textos. Ya pasó en la copia a mano del 13-08 ("argumentos del buscador al revés"). Evidencia: `utils/searchMatch.ts`; `CLAUDE.md`.
23. **Si cambias** `ES_LABORATORIO` o se reemplaza el proyecto de pruebas, **se afecta** el letrero que evita confundir laboratorio con producción, **porque** se decide comparando `VITE_SUPABASE_URL` con el identificador escrito en el código. Evidencia: `Layout.tsx` (incidente del 28-07).

## 9. Pruebas que lo protegen

Se corren con `npm run test` (vitest) en el trabajo `frontend` del CI. No hay bloque `test` en `vite.config.ts`: cada prueba de componente declara `// @vitest-environment jsdom` y hace `afterEach(cleanup)` porque no se usa `globals: true`.

| Archivo | Casos | Qué cubre |
|---|---|---|
| `components/selects/SelectWithSearch.test.tsx` | 23 | Teclado con la lista abierta (flechas, vuelta, Enter, Escape, Backspace no cierra), una sola fila azul, filtro sin tildes, reabrir vacío, `keepOpenOnSelect`, grupos, nombre guardado, `tamano`, `mostrarConteo`, deshabilitado |
| `components/selects/AgregadorDeItems.test.tsx` | 36 | No muestra lo elegido, queda abierto, carga rápida con Enter, flechas que topan, no busca por precio, secciones, control desde la pantalla, `data-lista-scroll`, cabecera sobre opciones, `buscarPorSeccion` |
| `components/selects/valorSePuedeMostrar.test.ts` | 5 | Nombre sí; número pelado y UUID no |
| `components/inputs/HoraInput.test.tsx` | 10 | `normalizarHora`; guarda una vez; Enter, Escape, inválido, segundos |
| `components/inputs/RutInput.test.tsx` | 14 | Formato en vivo, nunca se come un carácter, forma limpia, 55.555.555-5, `errorExterno` |
| `components/personas/TablaDeJornadas.test.tsx` | 5 | `tituloDelMonto`, chip sin propina, modo cerrado |
| `utils/dates.test.ts` | 16 | Fecha de evento sin correrse, formatos, momento en hora chilena, `hoyEnChile` |
| `utils/phone.test.ts` · `validation.test.ts` | 14 · 6 | Normalizar, formatear, `telHref`, `phoneProblem`, `emailProblem`; validación de cliente |
| `utils/rut.test.ts` · `bancos.test.ts` · `estadoCotizacion.test.ts` | 16 · 13 · 13 | Dígito y reservados; orden y bancos extintos; "Anulada", ciclo de vida, `estadoAlGuardar` |
| `utils/quotationMoney.test.ts` · `costoDeRecursos.test.ts` | 6 · 8 | Propina guardada manda; fijo una vez |

**Lo importante que NO está cubierto:** `services/api.ts` (token, reintento en 401, multipart); `PermissionGuard`, `permissions.ts` y la diferencia entre menú y rutas; `AuthContext` (caché del perfil, `roleLoading`); `RedDeSeguridad` y el candado de recarga; `lib/queryClient.ts`; `NumberInput` (la regla única de números no tiene ni una prueba, pese a estar en 53 campos); `Modal` (Escape, clic en el fondo, `bloquearEscape`); `Toast`; `ConfirmInline`; `MultiSelect`; `QuantitySelector`; `GrillaDeDias`; `Estrellas`; `ChipDeEstado`; `Tooltip`; `SectionChipSelect`; `SelectorDePaquetes`; `utils/searchMatch.ts` (21 usuarios, sin archivo de prueba); `apiErrors`, `verEnLista`, `currencies` (causó una pantalla blanca el 23-07), `categoriaCaja`, `eventConsolidation`, `quotationPrintDoc`; las rutas de `App.tsx`; y el propio script del portero.

## 10. Deuda y rarezas conocidas

**Portero medido en 0de0ddb** (`bash scripts/portero-kit-de-la-casa.sh`, salida OK):

| Regla | Hay / techo |
|---|---|
| lista plegable con buscador a mano · `<select>` · `alert()` · `confirm()` · `type="number"` · RUT a mano · bancos a mano · estado de persona a mano · `type="time"` | 0 / 0 cada una |
| panel flotante a mano | **13 / 13** |
| archivos con más de 800 líneas (frontend + api-rest) | **27 / 27** |
| `QuotationForm` 3928/3936 · `PostVentaPage` 3168/3180 · `DashboardPage` 2748/2798 · `ServiciosTab` 2265/2285 · `people.service` 2008/2040 · `ComprasTab` 1744/1794 · `FichasTab` 1549/1599 | congelados |

- **Los 13 paneles flotantes a mano**: `RequestsPage`, `ClientDetailPage`, `Calendar` (el filtro de estados, una multi-selección escrita junto a `MultiSelect`), `MenusGuardados`, `NegocioPage` (el chip de estado, que repite lo que hace `ChipDeEstado`), `QuotationsPage` ×2, `ComprasTab`, `ServicesPage`, `FixedServicesBySection` ×2 y `VariableServicesByCategory` ×2. Aparte, el menú de usuario de `Layout` no entra en la cuenta por el orden de sus clases y **no se cierra al pinchar fuera**.
- **Copias de piezas:** el SVG de `IconoWhatsApp` está pegado en `NegocioPage` y `SeguimientoPanel`, aunque su comentario dice que salió "para que no haya dos". `Layout` y `Sidebar` repiten `canAccess` palabra por palabra. Cerrar al pinchar fuera está resuelto de tres maneras distintas dentro del mismo kit: `useListaBuscable` (`mousedown`), `ChipDeEstado` (`mousedown` + Escape) y `SectionChipSelect` y `Calendar` (velo `fixed inset-0`). `MultiSelect` tampoco usa el motor compartido.
- **Ventanas a mano:** `fixed inset-0` aparece en 19 archivos de `pages/` y en 7 componentes de negocio (`CelebracionRealizada`, `FileViewLink`, `MotivoPerdida`, `PaymentPlanEditor`, `PhotoPopup`, `QuotationViewer`, `RequestForm`); algunos son velos de menú y no ventanas. La lista de deuda de `CLAUDE.md` sigue siendo cierta pero está incompleta. `Modal` no bloquea el scroll del fondo (`document.body.style` no aparece en el código).
- **Accesibilidad:** ningún `aria-live` en todo `src/`, así que los avisos de `Toast` son mudos para un lector de pantalla (tanda B2 de `09_PLAN_DE_HOMOLOGACION.md`, pendiente). `MultiSelect` pone un `<button>` dentro de otro `<button>` (la ✕ de limpiar), el mismo HTML inválido que `SelectWithSearch` corrigió el 13-08, y no tiene teclado.
- **Opciones muertas:** `dotClass` y `keepOpenOnSelect` de `SelectWithSearch` solo se usan en pruebas; `formatThousands` de `NumberInput` está marcado como OBSOLETO; `fallback` de `PermissionGuard` no lo pasa nadie.
- **Pendientes del plan 09 que siguen igual:** el tope de 240 px de `SelectWithSearch` (B1), abrirlo y cerrarlo desde afuera (B1), el modo dinero de `NumberInput` (B4), `QuantitySelector` que se traga lo fuera de rango (B7), `PermissionGuard` que confunde red con permiso (B7), `PageSkeleton` sin parámetros (B7). También está pendiente que `SelectWithSearch` esconda el buscador con pocas opciones (`10_MODULO_DE_PERSONAS.md`, §7).
- **La capa de servicios tiene fugas:** `PortalPage` importa `api` y `apiRequest` directo; hay 7 rutas escritas a mano fuera de `API_ROUTES`; `api.ts` arrastra `TODO: move to supabase service` y un `apiRequest` cuyo `try/catch` solo relanza.
- **Duplicaciones de tipos:** dos `UserRole` (el `enum` de `constants/users.ts` y el tipo de `constants/permissions.ts`, 4 importadores cada uno); `EmailStructure` repetido en `types/notifications.ts` y en el motor.
- **Archivos generados versionados:** `frontend/vite.config.js`, `frontend/vite.config.d.ts` y `frontend/tsconfig.node.tsbuildinfo`.
- **Rarezas:** `services/superAdmin.service.tsx` tiene extensión de componente; `/` está declarada dos veces (portada y envoltura `Layout`); la ruta del súper administrador no tiene guardia en la app (`TODO: add authentication`); `humanizeApiError` le muestra al usuario final "¿Está corriendo la API?"; `FichasTab` importa `queryClient` directo en vez de usar `useQueryClient`; `signOut` limpia la memoria de React Query pero deja el perfil en `localStorage`; `Layout` tiene escritos en el código el WhatsApp de ventas y el enlace de Calendly; el comentario de la regla `type="time"` del portero dice "Techo 1 A PROPÓSITO", pero el techo es 0.
- **`components/` mezcla** el kit con componentes de negocio grandes (`RequestForm`, 723 líneas) y todo queda fuera del portero.

## 11. Contradicciones entre documento y código

**`docs/arquitectura/`**
1. `09_PLAN_DE_HOMOLOGACION.md`, "Lo que el portero NO vigila todavía", dice que el portero "Solo mira dentro de `pages/`". El código recorre todo `src` menos `src/components/*` (también `layout/`, `hooks/`, `utils/`, `services/`, `contexts/` y `App.tsx`) y además mide tamaño en `../api-rest/src` (`portero-kit-de-la-casa.sh`, `buscar` y `carpetasDeTamano`).
2. `09_PLAN_DE_HOMOLOGACION.md` B2 dice que "`tono` no lo usa nadie". Hoy hay 5 usos: `PersonaFichaPage`, `NominaTab` ×2, `EventResourcesSection` y `NegocioPage` (`tono="normal"`).
3. `09_PLAN_DE_HOMOLOGACION.md` B1 dice que "`group`, `hint`, `dotClass` y `keepOpenOnSelect` no los usa ninguna pantalla". Hoy `group` y `hint` aparecen en las opciones de `QuotationForm`, `ServiciosTab`, `SemanaTab`, `PersonaForm`, entre otras. `dotClass` y `keepOpenOnSelect` siguen sin uso.
4. `09_PLAN_DE_HOMOLOGACION.md` B7 cuenta "`PermissionGuard` (16 rutas + 11 chequeos a mano)". El código tiene 24 rutas con guardia en `App.tsx` y 19 chequeos a mano repartidos en 11 archivos.
5. `10_MODULO_DE_PERSONAS.md` §7, tabla "El portero", incluye "Estrellas a mano | 0". El script no tiene ninguna regla de Estrellas.
6. `10_MODULO_DE_PERSONAS.md` §7 fija "`type="time"` a mano | **1**". El script tiene techo 0 (su comentario todavía dice 1) y `HoraInput.tsx` afirma "techo 0".

**`CLAUDE.md` (guía de la raíz, no está en `docs/arquitectura`)**
7. Dice "There is no frontend test suite". Existen 19 archivos de prueba con vitest y un paso "Pruebas (vitest)" en `.github/workflows/ci.yml`.
8. Dice "There is no shared package; the two apps communicate only over HTTP". El alias `@dinero` compila `api-rest/src/quotations/utils/money.ts` dentro del frontend (`vite.config.ts`, `tsconfig.json`).
9. Llama a `utils/quotationMoney` "the single source of truth for quotation totals". El archivo solo calcula la propina (`tipAmountOf`, `saleWithoutTip`); los totales salen de `computeMoney` de `@dinero` en `QuotationForm` y `ServiciosTab`.
10. La tabla del kit da cantidades de pantallas envejecidas. Según `CLAUDE.md` → según grep: `SelectWithSearch` 17 → 20 · `MultiSelect` 3 → 6 · `NumberInput` 16 → 21 · `Toast` 18 → 36 · `ConfirmInline` 10 → 18 · `GrillaDeDias` 2 → 3 · `Estrellas` 2 → 4 · `Modal` 8 → 12 · `Tooltip` 1 → 3 · `IconoWhatsApp` 2 → 1 · `PageSkeleton` 3 → 5.
11. La tabla de techos pone "hand-rolled floating panel | 15"; el script tiene 13 (el mismo `CLAUDE.md` cuenta más abajo que bajó de 14 a 13).
12. "Known debt: 6 hand-rolled dropdowns with search — `QuotationForm` ×3, `ServiciosTab` ×3". La regla del portero cuenta 0, y las dos pantallas importan `AgregadorDeItems`.
13. "All backend calls go through `src/services/*.service.ts`… Do not call axios/fetch directly from components" y "Endpoint paths are centralized in `api.routes.ts`". `PortalPage` importa `api`/`apiRequest` directo y hay 7 rutas escritas a mano en `auth.service.ts`, `logistics.service.ts` y `storage.service.ts`.

## 12. Preguntas abiertas

1. ¿Un Escape con la lista abierta cierra también la ventana en el modal "Crear paquete" (`QuotationForm`) y en "Nuevo recurso" (`RecursosTab`)? Por el código debería (riesgo 12); falta probarlo en el laboratorio.
2. ¿`refetchOnWindowFocus` pisa formularios a medio editar en las pantallas que copian datos de una consulta a su estado local? No se revisó pantalla por pantalla.
3. Cuando `refreshSession` falla en `api.ts`, ¿`supabase-js` emite el cierre de sesión y `Layout` manda a `/login`, o el usuario queda en la pantalla acumulando errores? No se verificó.
4. ¿Es intencional que vendedor abra `/calendar` por dirección sin tenerlo en el menú, y que `/plans` esté abierto a todos por ruta? ¿Qué dice el motor para esos casos? (ver 15 y 16)
5. ¿Es intencional que las pantallas internas de encuestas (`/customer-satisfaction-survey`, `/template`, `/answers`) no tengan `PermissionGuard`? El controller del motor mezcla `@Roles(ADMIN_ONLY)` con `@Public()` (ver 14).
6. ¿Quién genera `frontend/vite.config.js` y `vite.config.d.ts`, y deben seguir versionados si Vite toma el `.js` primero? No se tocó nada.
7. `09_PLAN_DE_HOMOLOGACION.md` B2 describe un bug de `ConfirmInline` ("Eliminando… nunca se ve"). Hoy la pieza no tiene ese texto: ¿se arregló o vivía en una pantalla?
8. `09_PLAN_DE_HOMOLOGACION.md` B4 afirma que las clases propias de `NumberInput` le ganan siempre a las que manda la pantalla (9 pedidos dormidos). Depende del orden del CSS de Tailwind y no se pudo confirmar leyendo el código.
9. El plan 09 pide anotar el avance en `04_ESTADO_ACTUAL.md`, que no está en el repositorio. ¿Dónde vive y está al día con estas cifras?
10. ¿Sigue siendo correcto el identificador del laboratorio que usa `ES_LABORATORIO` en `Layout.tsx`?

## 13. Archivos clave

**Motor**
- `api-rest/src/auth/roles.decorator.ts`: espejo de `ROLE_GROUPS`.
- `api-rest/src/users/users.controller.ts`, `users.service.ts`, `users.repository.ts`: `GET /users/:id` y el perfil con su empresa.
- `api-rest/src/quotations/utils/money.ts`: lo que importa `@dinero`.
- `api-rest/src/quotations/utils/tip.ts`: espejo de `utils/quotationMoney.ts`.
- `api-rest/src/people/utils/rut.ts`: gemelo de `utils/rut.ts`.
- `api-rest/src/email/types/index.ts`: `EmailStructure` repetido en `types/notifications.ts`.

**App: cáscara y arranque**
- `frontend/src/main.tsx`, `frontend/src/App.tsx`
- `frontend/src/layout/Layout.tsx`, `frontend/src/layout/Sidebar.tsx`
- `frontend/src/contexts/AuthContext.tsx`
- `frontend/src/components/PermissionGuard.tsx`, `PageSkeleton.tsx`, `RedDeSeguridad.tsx`

**App: conexión, memoria y constantes**
- `frontend/src/services/api.ts`
- `frontend/src/constants/api.routes.ts`, `permissions.ts`, `users.ts`, `payments.ts`, `services.ts`, `clientTypes.ts`, `dates.ts`, `companies.ts`
- `frontend/src/lib/queryClient.ts`, `supabase.ts`, `analytics.ts`
- `frontend/src/types/` (17 archivos)

**App: piezas del kit**
- `frontend/src/components/selects/SelectWithSearch.tsx`, `AgregadorDeItems.tsx`, `SelectorDePaquetes.tsx`, `SectionChipSelect.tsx`, `types.ts`
- `frontend/src/hooks/useListaBuscable.ts`, `frontend/src/utils/verEnLista.ts`, `frontend/src/utils/searchMatch.ts`
- `frontend/src/components/MultiSelect.tsx`, `QuantitySelector.tsx`, `Modal.tsx`, `Tooltip.tsx`, `ConfirmInline.tsx`, `Estrellas.tsx`, `ChipDeEstado.tsx`, `FijoDeCategoria.tsx`, `IconoWhatsApp.tsx`
- `frontend/src/components/toast/Toast.tsx`, `frontend/src/components/grilla/GrillaDeDias.tsx`
- `frontend/src/components/inputs/NumberInput.tsx`, `HoraInput.tsx`, `RutInput.tsx`, `SelectorColacion.tsx`, `index.ts`, `types.ts`

**App: ganchos y utilidades**
- `frontend/src/hooks/useCopiarDato.ts`, `useDateAvailability.ts`, `usePageViews.ts`, `useServices.ts`, `useServiceGroups.ts`, `useServiceGroupCollections.ts`, `useBaseLogistica.ts`
- `frontend/src/utils/dates.ts`, `apiErrors.ts`, `phone.ts`, `validation.ts`, `eventoCongelado.ts`, `quotationMoney.ts`, `estadoCotizacion.ts`, `estadoPersona.ts`, `rut.ts`, `bancos.ts`, `costoDeRecursos.ts`, `eventConsolidation.ts`, `categoriaCaja.ts`, `currencies.ts`, `clientTypeColor.ts`, `urls.ts`, `quotationPrintDoc.ts`

**App: guardias, configuración y pruebas**
- `frontend/scripts/portero-kit-de-la-casa.sh`, `frontend/package.json` (`portero`, `test`), `.github/workflows/ci.yml`
- `frontend/vite.config.ts` y `frontend/vite.config.js` (alias `@dinero`), `frontend/tsconfig.json`, `frontend/.eslintrc.cjs`, `frontend/src/index.css` (`ni-shake`)
- Pruebas: `frontend/src/components/selects/*.test.*`, `frontend/src/components/inputs/*.test.tsx`, `frontend/src/components/personas/TablaDeJornadas.test.tsx`, `frontend/src/utils/*.test.ts`
- Documentos: `docs/arquitectura/09_PLAN_DE_HOMOLOGACION.md`, `docs/arquitectura/10_MODULO_DE_PERSONAS.md` (§7), `CLAUDE.md` ("The house kit")
