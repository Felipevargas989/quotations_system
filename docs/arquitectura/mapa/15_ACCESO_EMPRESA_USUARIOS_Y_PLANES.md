# Mapa: Acceso, empresa, usuarios, roles y planes

> **Estado: verificado una vez contra el código** (commit bd6a0e1, 11-09-2026), actualizado el 11-09-2026 con las migraciones 107-109 y el estado del sprint 1, revisada la columna de llamadores el 14-09-2026, ampliado el 14-09-2026 con los módulos propios (§5.7) y el candado por plan (§5.8, migración 112), el 16-09-2026 con el alta por cuenta propia (§5.5) y el cobro con Mercado Pago (§5.9, migración 114), el 18-09-2026 con la separación Mi cuenta / Mi empresa (§2) y el cambio de plan con proporcional (§5.9, migración 115), el 18-09-2026 con el origen del registro (§5.5 punto 6 y §5.6, migración 116), y el 18-09-2026 con las páginas legales (§2) y Cancelar mi plan (§3, §5.9 punto 9). Parte del atlas de docs/arquitectura/mapa; el índice es 00_MAPA_DEL_SISTEMA.md.

## 1. Qué hace

Es la puerta del sistema y la ficha de la empresa. Decide **quién entra** (inicio de sesión con Supabase Auth y recuperación de contraseña), **a qué empresa pertenece** cada usuario (el motor saca `company_id` de la sesión y con eso aísla todos los datos) y **qué puede ver y hacer según su cargo**: recepción, vendedor, operaciones o administrador.

El administrador crea y edita usuarios, arma la **marca de la empresa** (nombre, subtítulo, logo, banner, colores, WhatsApp y redes, datos de cobro, umbral de alto valor) y enciende o apaga los correos al cliente. El resto del sistema lee esa marca: cotizaciones y PDF, correos, portal, formulario público y marketing.

No pertenece a un momento del evento: está antes de todos. Tiene además dos piezas del **negocio de Eventia como software**: la página de planes con el botón de Mercado Pago, y el área oculta de super-administrador (Torre de Control), que ve todas las empresas, quién ha entrado y los interesados (leads) de la landing.

## 2. Pantallas y rutas de la app

| Ruta de la app | Componente principal | Archivo | Qué hace el usuario ahí | Rol que la ve |
|---|---|---|---|---|
| `/login` | `LoginPage` | `frontend/src/pages/LoginPage.tsx` | Correo y contraseña → `useAuth().signIn`. El administrador cae en `/dashboard` y los demás en `/requests`. Enlace "¿Olvidaste tu contraseña?". El enlace "Regístrate aquí" está comentado ("TEMP: self-service registration disabled") | público |
| `/forgot-password` | `ForgotPasswordPage` | `frontend/src/pages/auth/ForgotPasswordPage.tsx` | Pide el correo y llama `requestPasswordRecovery`. Siempre dice "Si el correo existe en nuestro sistema, recibirás un enlace…" | público |
| `/reset-password` | `ResetPasswordPage` | `frontend/src/pages/auth/ResetPasswordPage.tsx` | Lee `access_token` y `type` de la query **o** del hash. Pide la nueva contraseña (mínimo 8) dos veces → `resetPasswordWithToken`. Sin token muestra "Enlace inválido o expirado" | público |
| `/register` | `RegisterPage` → `NewUserRegisterForm` | `frontend/src/pages/landingPage/RegisterPage.tsx` | Guarda el interesado (`registerLead`) y crea la empresa de verdad (`signup`, §5.5) con inicio de sesión automático. Desde el 18-09 manda también las huellas del aterrizaje (`origen_detalle`, migración 116), capturadas por `capturarOrigen` (`lib/origenDelLead.ts`) al montar la landing y esta página | público |
| `/terminos` y `/privacidad` | `Terminos` / `Privacidad` (sobre `PaginaLegal`) | `frontend/src/pages/legal/` | Términos y condiciones y política de privacidad (18-09-2026, paso 6 del roadmap): texto aprobado por Felipe (RUT, domicilio en Quillón, hola@eventi-app.com, 90 días de conservación, tribunales de Quillón). Enlazadas desde el registro ("al crear tu cuenta aceptas…"), el pie de la landing y el pie de `/register`. Los números que citan (7 días de prueba y de gracia, precios y topes, proporcional al subir) son los que aplica el sistema: cambian en el mismo commit | público |
| `/admin/users` | **Redirige** a `/company-configuration?tab=usuarios` desde el 18-09 (los marcadores viejos siguen funcionando) | `App.tsx` | La gestión de usuarios vive como pestaña de Mi empresa; la página `UserManagementPage.tsx` sigue siendo la pieza que se renderiza allá | — |
| `/configuration` | `ConfigurationPage` (**"Mi cuenta"** desde el 18-09) | `frontend/src/pages/configuration/ConfigurationPage.tsx` | SOLO lo personal: cambiar su contraseña y ver su correo. Las notificaciones se mudaron a Mi empresa → Correos (Felipe: "hay que separar todo, hoy está revuelto") | todos (`SECTION_ROLES.configuration`) |
| `/company-configuration` | `MiEmpresa` (**"Mi empresa"** desde el 18-09, pestañas en `?tab=`) | `frontend/src/pages/configuration/MiEmpresa.tsx` | Cuatro pestañas: **Marca** (la antigua `CompanyConfiguration` embebida tal cual: nombre, subtítulo, redes, logo/banner, colores, datos de cobro, umbral), **Correos** (`CorreosDeLaEmpresa.tsx`, las notificaciones mudadas desde la pantalla personal), **Usuarios** (`UserManagementPage` embebida) y **Plan** (`PestanaPlan.tsx`: plan/estado/fechas desde `GET /pagos/estado`, botón a `/plans`; futura casa del subir/bajar con prorrateo) | administrador (`SECTION_ROLES.company_configuration`) |
| `/plans` | `Plans` | `frontend/src/pages/plans/Plans.tsx` | Tarjeta "Eventia Profesional", $10.000 CLP/mes. "Suscribirse Ahora" abre un checkout de Mercado Pago en otra pestaña; enlaces a Calendly y WhatsApp | ruta: todos (`SECTION_ROLES.plans`). Se llega desde el banner de prueba de `Layout` |
| `/plans/confirmation` | `ConfirmationPage` | `frontend/src/pages/plans/ConfirmationPage.tsx` | Al abrirse llama `confirmPlan()` y navega a `/dashboard`. Si falla, un toast fijo | ruta: todos |
| `/superAdminqweasdzxc` | `SuperAdminPage` con `TorreDeControl` | `frontend/src/pages/superAdmin/Index.tsx` | Torre de Control (6 tarjetas y la tabla "Quién ha entrado"), barras mensuales de cotizaciones por empresa (6 meses), "Actividad de Usuarios" (30 días) y lista de empresas. El botón "Crear nueva empresa" está comentado | ruta **fuera** de `Layout` y **sin** `PermissionGuard` ("TODO: add authentication"). La protege el motor con `SUPER_ADMIN_EMAILS` |
| todas las de adentro | `Layout` | `frontend/src/layout/Layout.tsx` | Sin sesión manda a `/login`. Menú de usuario con nombre, cargo, Gestión de Usuarios, Configuración, Configuración de la Compañía y Cerrar Sesión. Banner "período de prueba gratuito" si `company.estado_plan === "prueba"`, con los días que quedan (14-09-2026, §5.8; antes miraba `is_premium`, que nadie vencía nunca). Letrero ámbar "LABORATORIO" si `VITE_SUPABASE_URL` es el del laboratorio | cada enlace con `canAccessSection` |
| todas las de adentro | `Sidebar` | `frontend/src/layout/Sidebar.tsx` | Muestra cada ítem solo si `canAccessSection(userRole, section)`. Sin cargo cargado no muestra nada | — |

**Qué cargo ve qué sección de la app.** Hay dos estructuras en `frontend/src/constants/permissions.ts`: `ROLE_PERMISSIONS` (cargo → secciones), que usan `Sidebar` y el menú de `Layout` vía `canAccessSection`, y `SECTION_ROLES` (sección → cargos), que usa `PermissionGuard` en `App.tsx` y los botones de las pantallas. La tabla muestra lo que deja entrar la ruta. Las celdas en negrita son donde las dos estructuras no dicen lo mismo.

| Sección (llave) | Rutas | recepcion | vendedor | operaciones | administrador |
|---|---|:--:|:--:|:--:|:--:|
| `dashboard` | `/dashboard` (`/analytics` redirige acá) | – | – | – | sí |
| `requests` | `/requests` | sí | sí | sí | sí |
| `quotations` (ver) | `/quotations`, `/negocio/:id`, `/consultas` | sí | sí | sí | sí |
| `quotations_edit` | `/quotation-form`, `/quotation-form/:id`; botones `puedeEditar` de `ClientDetailPage`, `Calendar`, `NegocioPage` y `QuotationsPage`; `puedeCotizar` de `RequestsPage` | – | sí | sí | sí |
| `clients` | `/clients`, `/clients/:id` | sí | sí | sí | sí |
| `payments` | `/post-venta`, `/post-venta/:id`; enlace `puedeVerPostVenta` de `QuotationsPage` | – | – | sí | sí |
| `logistics` | `/logistica`, `/inventario` | – | – | sí | sí |
| `calendar` | `/calendar` | sí | **ruta sí, menú no** | sí | sí |
| `configuration` | `/configuration` (notificaciones solo administrador) | sí | sí | sí | sí |
| `plans` | `/plans`, `/plans/confirmation` | **ruta sí, menú no** | **ruta sí, menú no** | **ruta sí, menú no** | sí |
| `admin`, `user_management` | `/admin/users` | – | – | – | sí |
| `company_configuration` | `/company-configuration` | – | – | – | sí |
| `services` | `/services` | – | – | – | sí |
| `people` | `/personas`, `/personas/:id` | – | – | – | sí |
| `marketing` | `/marketing`, `/marketing/campana/:id` | – | – | – | sí |
| `customer_satisfaction_survey` | `/customer-satisfaction-survey`, `/template`, `/answers` | **menú no, ruta sin guard** | **menú no, ruta sin guard** | **menú no, ruta sin guard** | sí |
| `analytics` | solo redirección | – | – | – | sí |

Topes de cargo dentro de pantallas de otros mapas (no son secciones): `QuotationForm.puedeVerMargen` y `ServiciosTab.puedeVerMargen` (administrador y operaciones), editar una aceptada en `QuotationForm` (administrador y operaciones), borrar cotización en `QuotationForm` (administrador), borrar requerimientos en `RequestsPage.handleDelete` (administrador), pasar una aceptada a cancelada en `QuotationsPage` (administrador), guía `NewAccount` en `DashboardPage` (administrador). Ver mapas 01, 02, 04 y 13.

## 3. Endpoints del motor

Todas las rutas pasan por **cuatro** guardias globales, en este orden (`api-rest/src/app.module.ts`): `AuthGuard` (sesión), `ThrottlerGuard` (300 peticiones por minuto por IP), `RolesGuard` (cargo) y, desde el 14-09-2026, `DerechosGuard` (el derecho del plan; era `ModulosPropiosGuard`). Los dos últimos son preguntas distintas y las dos tienen que decir que sí: "¿este cargo puede?" y "¿la empresa pagó por esto?". Ver §5.8.

| Método y ruta | Controller y método | Service | Quién lo llama desde la app | Roles o @Public |
|---|---|---|---|---|
| `POST /auth/password/recovery` | `AuthController.requestPasswordRecovery` | `AuthService.requestPasswordRecovery` (Supabase `resetPasswordForEmail` con `SUPABASE_PASSWORD_RECOVERY_REDIRECT_URL`) | `requestPasswordRecovery` (`services/auth.service.ts`) ← `ForgotPasswordPage` | `@Public`, responde 202. Sin `@Throttle` propio |
| `POST /auth/password/reset` | `AuthController.resetPassword` | `AuthService.resetPasswordWithToken` (`auth.getUser(accessToken)` y `auth.admin.updateUserById`) | `resetPasswordWithToken` ← `ResetPasswordPage` | `@Public`. Sin `@Throttle` propio |
| `GET /users` | `UsersController.findAll` | `UsersService.findAll` → `UsersRepository.findAll(companyId)` | `getUsers` (`services/users.service.ts`) ← `UserManagementPage` | solo sesión |
| `GET /users/:id` (id de **Auth**) | `UsersController.findOne` | `UsersService.findOne` → `UsersRepository.findOne` (perfil + 15 columnas de `companies`) | `getUser` ← `AuthContext` (`profileQuery` y `signIn`), que alimenta a **todas** las pantallas tras el login; además `QuotationForm` (`fetchCreatorUser`, para mostrar quién creó la cotización) | solo sesión. **No filtra por empresa** |
| `POST /users` | `UsersController.create` | `UsersService.create` → `UsersRepository.createAuthUser` (`auth.admin.createUser` — JAMÁS `signUp`, incidente 70) + `UsersRepository.createUser` | `createUser` ← `UserManagementPage.createUser` | `ADMIN_ONLY` |
| `PATCH /users/password` | `UsersController.updatePassword` | `UsersService.updatePassword` → `UsersRepository.updatePassword` (`auth.admin.updateUserById`) | `updatePassword` ← `ConfigurationPage.handleSubmit` | solo sesión (cambia la del propio usuario) |
| `PATCH /users/:id` (id del **perfil**) | `UsersController.update` | `UsersService.update` → `UsersRepository.update` | `updateUser` ← `UserManagementPage.createUser` en modo edición | `ADMIN_ONLY`. No filtra por empresa |
| `DELETE /users/:id` (id del perfil) | `UsersController.remove` | `UsersService.remove` → `UsersRepository.remove` + `UsersRepository.removeAuthUser` | `deleteUser` ← `UserManagementPage.deleteUser` | `ADMIN_ONLY` |
| `POST /users/signup` | `UsersController.signup` | `UsersService.signup` → `SuperAdminService.createSuscription` | `signup` (`services/users.service.ts`) ← `NewUserRegisterForm` (`/register`): **LA puerta del alta por cuenta propia** desde el 16-09 (§5.5); acepta `origen_detalle` opcional (migración 116) y, si el motor lo rechazara, la app reintenta sin la marca | `@Public` + `@Throttle` 10/min |
| `GET /companies/public/:id` | `CompaniesController.findOnePublic` | `CompaniesService.findOne`; el controller recorta a 11 campos | `getCompanyPublic` ← `CreateQuotationPublic` (mapa 11); `getCompanyById` (`services/superAdmin.service.tsx`) ← `PublicSurvey` (mapa 14) | `@Public` |
| `GET /companies/:id` | `CompaniesController.findOne` | `CompaniesService.findOne` → `CompaniesRepository.findOne` (`select('*')`) | `getCompany` ← `ConfigurationPage` (queryKey `["company", id]`) | solo sesión. **No compara con la empresa de la sesión** |
| `PATCH /companies` | `CompaniesController.update` | `CompaniesService.update` → `CompaniesRepository.update` (empresa de la sesión) | `updateCompany` (`services/companies.service.ts`) ← `CompanyConfiguration.handleSubmit`, `ConfigurationPage.handleSaveNotifications` | `ADMIN_ONLY` |
| `POST /plans/confirmation` | `PlansController.confirmPlan` | `PlansService.confirmPlan` — responde **410 a propósito** desde el paso 2 (marcaba premium sin verificar pago) | **Nadie** desde el 16-09: `ConfirmationPage` pasó a preguntar `GET /pagos/estado` | solo sesión |
| `POST /pagos/suscribir` | `PagosController.suscribir` | `PagosService.suscribir` → `MercadoPagoService.crearSuscripcion` (POST `/preapproval` con `external_reference` = id de la empresa) | `pedirEnlaceDePago` (`services/pagos.service.ts`) ← `Plans.contratar` | `ADMIN_ONLY` + `@SinPlan` (una bloqueada TIENE que poder pagar) |
| `GET /pagos/estado` | `PagosController.estado` | `PagosService.estado` → `PagosRepository.empresa` (directo a la base, sin memoria) | `estadoDelPlan` ← `ConfirmationPage` (pregunta cada 3 s hasta ver `activo`) | sesión + `@SinPlan` |
| `POST /pagos/cambiar-plan/cotizar` | `PagosController.cotizarCambio` | `PagosService.cotizarCambio` — lee los dos precios del plan real en Mercado Pago y calcula: subir = (nuevo − actual) × días restantes / 30, bajar = 0 y rige al terminar lo pagado | `cotizarCambio` (`services/pagos.service.ts`) ← `PestanaPlan` (Mi empresa → Plan), para MOSTRAR antes de confirmar | `ADMIN_ONLY`; solo empresa activa que paga por Mercado Pago con suscripción viva |
| `POST /pagos/cambiar-plan` | `PagosController.cambiarPlan` | `PagosService.cambiarPlan`: subir → pago único (Checkout Pro, referencia `cambio:empresa:plan`) cuyo aviso `payment` aplica el plan al instante y ajusta el monto de la suscripción; bajar → `plan_programado` + el monto de la suscripción baja desde ya | `cambiarPlan` ← `PestanaPlan` tras la confirmación | `ADMIN_ONLY` |
| `POST /pagos/cancelar` | `PagosController.cancelar` | `PagosService.cancelar`: cancela la suscripción en Mercado Pago (`PUT /preapproval` con `status: cancelled`) y deja `pago_suscripcion_id` NULL con el proveedor puesto y `plan_programado` NULL — la misma marca que deja el aviso `cancelled`; la empresa conserva todo hasta `pagado_hasta` y el reloj de las 11:10 (paso 1) la pausa | `cancelarPlan` (`services/pagos.service.ts`) ← `PestanaPlan` (Mi empresa → Plan, botón "Cancelar mi plan" tras `ConfirmInline`) | `ADMIN_ONLY` + `@SinPlan`; gratis → 400; sin suscripción viva → 400 |
| `POST /pagos/webhook` | `PagosController.webhook` | `verificarFirmaMercadoPago` (HMAC del header `x-signature`) → `PagosService.procesarAviso` (consulta la VERDAD en Mercado Pago, jamás confía en el cuerpo; idempotente por `avisos_de_pago`) | **Mercado Pago**, nadie de la app | `@Public` + `@Throttle` 600/min; la puerta es la FIRMA (fail-closed sin secreto en producción) |
| `POST /super-admin/suscription` | `SuperAdminController.createSuscription` | `SuperAdminService.createSuscription` | **Nadie** desde la app: no hay función para esta ruta en `frontend/src/services`. Dentro del motor, `UsersService.signup` llama a `SuperAdminService.createSuscription` | `@Public` + `@Throttle` 10 por minuto |
| `POST /super-admin/lead` | `SuperAdminController.registerLead` | `SuperAdminService.registerLead` → `SuperAdminRepository.registerLead` + `alertNuevoLead` | `registerLead` (`services/registerLeads.service.ts`) ← `NewUserRegisterForm.handleSubmit`, dentro de la pantalla `RegisterPage` (ruta `/register`) | `@Public` + `@Throttle` 10 por minuto |
| `GET /super-admin/companies` | `SuperAdminController.listCompanies` | `assertSuperAdmin` + `SuperAdminRepository.listCompanies` | `getAllCompanies` ← `SuperAdminPage.fetchCompanies` | sesión + correo en `SUPER_ADMIN_EMAILS` |
| `POST /super-admin/companies` | `SuperAdminController.createCompany` | `SuperAdminService.createCompanyOnly` → `SuperAdminRepository.createCompanyOnly` + `alertNuevaEmpresa` | `createCompany` ← `SuperAdminPage.handleCreateCompany` (su botón está comentado) | sesión + allowlist |
| `PATCH /super-admin/companies/:id` | `SuperAdminController.updateCompany` | `SuperAdminService.updateCompanyById` → `SuperAdminRepository.updateCompanyById` | **Nadie** desde la app: `updateCompany` de `services/superAdmin.service.tsx` no lo importa ninguna pantalla (ojo: el `updateCompany` que sí se usa es el de `services/companies.service.ts`, y pega en `PATCH /companies`) | sesión + allowlist. Desde el 14-09-2026 tiene clase DTO (`ActualizarEmpresaDto`) y acepta `plan`, `estado_plan` y `prueba_vence`: es por donde Felipe activa a un cliente que le pagó (§5.8) |
| `GET /super-admin/stats/last-month` | `SuperAdminController.getStatsLastMonth` | `SuperAdminService.getStatsLastMonth` → `SuperAdminRepository.getStatsLastMonth` + `getUsersLastSignIns` | `getStatsLastMonth` ← `SuperAdminPage.fetchStatsLastMonth` | sesión + allowlist |
| `GET /super-admin/torre` | `SuperAdminController.getTorre` | `SuperAdminService.getTorre` → `SuperAdminRepository.getTorreBase` + `countLeads` (dos veces) | `getTorre` ← `SuperAdminPage`, en su componente `TorreDeControl` (queryKey `["superAdmin", "torre"]`) | sesión + allowlist |

Ruta ajena que este módulo usa: `POST /storage/upload` con `kind` `company-logo` o `company-banner` (`StorageController.upload` → `StorageService.upload`: balde público `company-logos`, archivo `<empresa>_logo.<ext>` o `<empresa>_banner.<ext>`, con `upsert`). La llaman `uploadCompanyLogo` y `uploadCompanyBanner` desde `CompanyConfiguration.handleSubmit`. Solo exige sesión. Mapa 16.

Usos dentro del motor, sin pasar por HTTP:

| Pieza | La usa | Para qué |
|---|---|---|
| `AuthService.validateToken` y `UsersRepository.findOne` | `AuthGuard.canActivate`, en **cada** petición con sesión | validar el pase y dejar `request.user = { id, company_id, role, email }` |
| `CurrentUser` (`auth/user.decorator.ts`) | todos los controllers con sesión | leer `request.user` |
| `UsersService.findAll(companyId, UserRole.ADMINISTRADOR)` | `QuotationsService` (aviso de solicitud pública y de comprobante del portal), `QuotationsCronService` (resumen semanal), `PaymentsCronService`, `CustomerSatisfactionSurveyService` | destinatarios de los correos internos (mapa 12) |
| `CompaniesRepository.findOne` | `EmailService.shouldSendEmail` (interruptores), `EmailService.getBranding` (nombre, subtítulo, logo, color primario, datos de cobro, responder-a), `EnvioCotizacionService`, `ConsultasService`, `MarketingController`, `MarketingCronService` | la marca y los interruptores de la empresa |
| `CompaniesRepository.create` | `SuperAdminService.createSuscription` | alta de empresa |
| `CustomerSatisfactionSurveyService.createTemplate` | `SuperAdminService.createSuscription` | plantilla de encuesta de la empresa nueva (mapa 14) |

**Qué endpoints exigen qué cargo, en todo el motor.** Reglas de `RolesGuard`: una ruta `@Public` no se revisa; una ruta sin `@Roles` solo pide sesión; el `@Roles` del método manda sobre el del controller. Los grupos viven en `api-rest/src/auth/roles.decorator.ts`: `ADMIN_ONLY`, `OPERATIONS_AND_UP` (operaciones y administrador), `SALES_AND_UP` (vendedor, operaciones y administrador) y `RECEPTION_AND_UP` (los cuatro).

| Exige | Rutas | Mapa |
|---|---|---|
| `ADMIN_ONLY` | `analytics` completo (`AnalyticsController`, `HoyController`); `marketing` completo menos sus 3 `@Public`; `PATCH /companies`; `POST`, `PATCH` y `DELETE /users`; las 19 escrituras de `services` (`bulk`, `fixed-sections/*`, `categories/*`, `variable*`, `fixed*`, reordenes); escrituras de `sections` (`POST`, `PATCH reorder`, `default`, `link/:linkId`, `:id`, `DELETE :id`); en `logistics`, las recetas (`GET` y `POST recipes`, `PATCH` y `DELETE recipes/:id`) y los costos fijos (`PATCH fixed-costs/:id`, `POST`/`PATCH`/`DELETE fixed-cost-items`); `POST /quotations/:id/volver-a-pendiente`; `POST /customer-satisfaction-survey/template` | 13, 10, 15, 05, 06, 04, 14 |
| `OPERATIONS_AND_UP` | `refunds` completo; `event-documents` completo; `logistics` completo por defecto (37 de 53 rutas); escrituras de `payments` (`POST plan`, `POST transactions`, `POST transactions/overflow`, `PATCH transactions/:id`, `PATCH :id`, `DELETE :id`, `DELETE transactions/:id`); `POST /portal-receipts/:id/confirmar` y `/rechazar`; `POST /quotations/:id/realizado` | 03, 04, 06 |
| `SALES_AND_UP` | `POST` y `DELETE /service-group-collections`; `POST`, `PATCH` y `DELETE /service-groups`; lecturas de `logistics` (`GET base-catalogo`, `estado-compras`, `suppliers`, `supplies`, `furniture`, `catalog/service-names`, `catalog/fixed-costs`, `recipes/all`) | 01, 05, 06 |
| `RECEPTION_AND_UP` | `quotation-followups` completo; `GET /sections`, `GET /sections/menu-order` | 02, 05 |
| Solo sesión, sin `@Roles` | `people` (**44 rutas**), `clients` (9 de sus 10 rutas — la décima, `GET /clients/types/public/:company_id`, es `@Public` y va en esa fila), `client-contacts` (5), `consultas` (5), `event-types` (4), `calendar` (1), `movil` (5), `storage` (3), `plans` (1); `GET /users`, `GET /users/:id`, `PATCH /users/password`, `GET /companies/:id`; 7 rutas de `quotations` (crear, editar, borrar, listar, conflictos, enviar por correo…); lecturas de `payments` (2: `GET` y `GET transactions`), `portal-receipts` (1), `service-groups` (1), `service-group-collections` (1) y `services` (3: `GET`, `GET used-codes`, `GET fixed-sections`); `GET /customer-satisfaction-survey/answers`; las 5 rutas con allowlist de `super-admin` | varios | **Desde el 14-09-2026 (rama `pruebas`, paso 2 del roadmap de venta) esa lista se cerró: cada una de esas rutas tiene cargo, salvo el propio perfil, la propia clave y la propia empresa; ver [23_MATRIZ_DE_CARGOS.md](23_MATRIZ_DE_CARGOS.md).**
| Cargo revisado a mano, fuera de `RolesGuard` | `QuotationsController.create` (recepción solo crea requerimientos, 28-07) y `QuotationsService.update` (recepción no edita cotizaciones, 12-08); `SuperAdminService.assertSuperAdmin` (por correo, no por cargo) | 01, 15 |
| `@Public` | `auth` (2), `POST /users/signup`, `GET /companies/public/:id`, `POST /super-admin/suscription` y `/lead`, `GET /clients/types/public/:company_id`, `GET /event-types/public/:companyId`, `customer-satisfaction-survey` (`GET template`, `GET answered`, `POST answer`), `marketing` (3: webhook y baja), `portal` (3), `POST /quotations/public/:company_id`, `GET /quotations/imprimir/:token`, `GET /quotations/:id` (lo usa la encuesta pública), `POST /pagos/webhook` (firma HMAC fail-closed), `GET /health`, `POST /email-previews` (404 en producción) | 01, 03, 10, 11, 14, 16 |

## 4. Tablas de la base de datos

| Tabla | Qué guarda | Lee o escribe | Migración que la crea o modifica |
|---|---|---|---|
| `user_profiles` | Perfil de cada usuario: `id` (uuid propio, **no** es el id de Auth), `user_id` (FK a `auth.users`, UNIQUE), `email`, `full_name`, `role` (CHECK con los 4 cargos, default `vendedor`), `company_id` (FK a `companies`, NOT NULL), `created_at`, `updated_at` | escribe `UsersRepository.createUser`, `update` y `remove`; lee `UsersRepository.findOne` (guardián y perfil), `UsersRepository.findAll` (gestión y destinatarios de avisos), `SuperAdminRepository.getTorreBase` | `0_initial_models.sql` (foto del esquema, no una migración real); `40_cerrar_acceso_directo.sql` le quita todo a `authenticated` |
| `companies` | La empresa: `name`, `logo_url`, `colors` (jsonb `primary` y `secondary`), `is_premium` (default false), `notifications` (jsonb `emails` + `replyTo`), `currency`, `is_active`, `created_at`; `tagline` y `bank_details`; `high_value_threshold`; `whatsapp`, `instagram`, `facebook`, `sitio_web`; `banner_url`; `modulos_propios` (§5.7); `plan`, `estado_plan`, `prueba_vence` y `plan_cambiado_en` (§5.8); `origen` y `origen_detalle` (§5.5 punto 6, migración 116) | escribe `CompaniesRepository.update` y `create`, `PlansRepository.confirmPlan` (`is_premium`), `SuperAdminRepository.createCompanyOnly` y `updateCompanyById`, `PlanCronService.bloquearPruebasVencidas` (`estado_plan`); lee `CompaniesRepository.findOne` (correos, envío de cotizaciones, consultas, marketing), `UsersRepository.findOne` (embebida en el perfil), `DerechosService.deEmpresa` (`plan`, `estado_plan`, `modulos_propios`), `SuperAdminRepository` (`listCompanies`, `getStatsLastMonth`, `getTorreBase`) | `0_initial_models.sql`; `41_barrida_final_anon.sql` (le quita todo a `anon`); `46_datos_cobro_empresa.sql`; `60_umbral_alto_valor.sql`; `95_contacto_de_marca.sql`; `96_banner_de_correos.sql`; `111_modulos_propios.sql`; `112_derechos_por_plan.sql`; `116_origen_del_registro.sql`. `is_active` no tiene migración numerada: llegó con el commit `c3d0f5d` (04-11-2025) y está en la foto 0 |
| `leads` | Interesados de la landing: `nombre`, `telefono`, `email`, `nombre_empresa`, `personas_empresa`, `ventas_anuales`, `created_at`; `origen` y `origen_detalle` (migración 116) | escribe `SuperAdminRepository.registerLead`; lee `SuperAdminRepository.countLeads` | `0_initial_models.sql`; `39_leads_solo_por_backend.sql` (cierra el INSERT anónimo); `116_origen_del_registro.sql` |
| `auth.users` (Supabase Auth) | Cuentas, contraseñas, `last_sign_in_at`, `created_at` | escribe `UsersRepository.createAuthUser` (`auth.signUp`), `UsersRepository.updatePassword` y `AuthService.resetPasswordWithToken` (`auth.admin.updateUserById`), `UsersRepository.removeAuthUser` (`auth.admin.deleteUser`); lee `AuthService.validateToken` (`auth.getUser`), `SuperAdminRepository.listarTodosLosUsuarios` (`auth.admin.listUsers`, en páginas de 1000). El correo de recuperación lo manda Supabase (`resetPasswordForEmail`) | la administra Supabase; sin migración en el repo |
| `quotations` (`created_at`, `company_id`, `total_amount`) | Cotizaciones, para las barras del super-admin | lee `SuperAdminRepository.getStatsLastMonth`, en páginas con `.range()` | mapa 01 |
| `customer_satisfaction_survey_templates` | Plantilla de encuesta por empresa | la crea `createSuscription` vía `CustomerSatisfactionSurveyService.createTemplate` | mapa 14 |
| balde de storage `company-logos` | Logo, banner de correos y banners de campaña. Lectura pública, escritura solo por el motor | escribe `StorageService.upload` | `42_storage_candado.sql` (saca las políticas; escritura solo por el motor); `96_banner_de_correos.sql` |

## 5. Flujos principales

### 5.1 Iniciar sesión, cargar el perfil y cada petición

1. `/login` → `LoginPage.handleSubmit` → `AuthContext.signIn` → `supabase.auth.signInWithPassword`, directo a Supabase Auth con la llave anónima (`frontend/src/lib/supabase.ts`).
2. `signIn` pide el perfil con `getUser(user.id)` → `GET /users/:id`. `api.ts` le pega `Authorization: Bearer <token>`.
3. Motor, `AuthGuard.canActivate`: saca el token → `AuthService.validateToken`. Primero busca la huella sha256 en `cacheTokens`; si no está, pregunta a Supabase (`auth.getUser`) y la guarda hasta el `exp` del JWT, con tope de 1 hora (`vidaRestante`). Después busca el perfil en `cachePerfiles` (indexado por el **id de Auth**) o llama a `UsersRepository.findOne` (`user_profiles` por `user_id` + `companies`) y lo guarda 1 hora. Deja `request.user = { id, company_id, role, email }`. Si no hay perfil, `fullUser!.company_id` revienta y responde 401 "Invalid token".
4. `ThrottlerGuard` (300 por minuto por IP; `main.ts` pone `trust proxy` por el proxy de Railway) → `RolesGuard` (esta ruta no lleva `@Roles`) → `UsersController.findOne`.
5. App: `LoginPage` navega a `/dashboard` (administrador) o `/requests`. `AuthContext.profileQuery` (queryKey `["profile", userId]`) parte del perfil guardado en `localStorage` (`eventia_profile_<userId>`), revalida siempre al montar (`initialDataUpdatedAt: 0`), `staleTime` de 5 minutos y `retry: 3`. De ahí salen `userRole`, `userName` y `company`.
6. `Layout` manda a `/login` si no hay sesión. `Sidebar` y el menú filtran con `canAccessSection`. `PermissionGuard` muestra `PageSkeleton` mientras `loading || roleLoading`, "Acceso Denegado" sin usuario y "Permisos Insuficientes" si el cargo no está en `allowedRoles`.
7. Ante un 401, el interceptor de `api.ts` hace `supabase.auth.refreshSession` y reintenta **una** vez.
8. Cerrar sesión: `AuthContext.signOut` → `supabase.auth.signOut` + `queryClient.clear()`, para que otra cuenta en el mismo navegador parta limpia.

### 5.2 Recuperar la contraseña

1. `/forgot-password` → `requestPasswordRecovery(email)` → `POST /auth/password/recovery` (`@Public`).
2. `AuthService.requestPasswordRecovery` → `supabase.auth.resetPasswordForEmail(email, { redirectTo })`, con `SUPABASE_PASSWORD_RECOVERY_REDIRECT_URL`. **Supabase** manda el correo; no pasa por Resend. Si Supabase devuelve error, responde 400 con su mensaje.
3. El enlace llega a `/reset-password` con `access_token` y `type=recovery`. `ResetPasswordPage` los lee de la query o del hash.
4. `resetPasswordWithToken(accessToken, password)` → `POST /auth/password/reset` → `AuthService.resetPasswordWithToken`: `auth.getUser(accessToken)` (sin la memoria de pases) → `auth.admin.updateUserById(user.id, { password })`. `ResetPasswordDto` exige 8 caracteres.
5. La pantalla dice "Tu contraseña ha sido actualizada correctamente" y ofrece volver al login.

### 5.3 Crear, editar y eliminar un usuario

1. `/admin/users` → `UserManagementPage.createUser` → `createUser({ email, full_name, role, password })` → `POST /users` (`ADMIN_ONLY`). `company_id` no viaja desde el navegador.
2. `UsersService.create` → `UsersRepository.createAuthUser` = `auth.signUp` sobre el cliente **compartido** de `SupabaseService` → `UsersRepository.createUser` inserta en `user_profiles` con el `user_id` recién creado y el `company_id` de la sesión. La app invalida `["users"]`.
3. Editar: `updateUser(perfil.id, { full_name, role })` → `PATCH /users/:id` → `UsersRepository.update` filtra por `id` del perfil. **No** llama `olvidarPerfil`.
4. Eliminar: `deleteUser(perfil.id)` → `DELETE /users/:id` → `UsersService.remove`: `olvidarPerfil(id)` con el id del **perfil** → `UsersRepository.remove(id, companyId)` borra de `user_profiles`, acotado a la empresa → `UsersRepository.removeAuthUser(id)` = `auth.admin.deleteUser` con ese mismo id de perfil ("TODO: check because it's not working").
5. Efecto: sin perfil, el guardián responde 401 y en la app `profileQuery` falla, así que `userRole` queda en null: menú vacío y "Permisos Insuficientes". El modal lo avisa: el usuario "permanecerá en el sistema de autenticación pero no podrá acceder sin un perfil".

### 5.4 Configurar la marca y los correos de la empresa

1. `/company-configuration` → `CompanyConfiguration` parte del `company` de `useAuth()`, es decir, del perfil que arma `UsersRepository.findOne`.
2. Al guardar: si hay logo nuevo, `uploadCompanyLogo` → `POST /storage/upload` (`company-logo`) → URL pública. Lo mismo con el banner (`company-banner`), o `null` si se quitó.
3. `updateCompany(name, logoUrl, colors, undefined, { tagline, bank_details, high_value_threshold, whatsapp, instagram, facebook, sitio_web, banner_url })` → `PATCH /companies` (`ADMIN_ONLY`) → `CompaniesService.update(user.company_id, dto)` → `CompaniesRepository.update` → `companies`.
4. `loadUserProfile()` vuelve a pedir el perfil y `AuthContext.company` se actualiza en todas las pantallas que leen logo, colores, moneda o umbral.
5. Efectos: el próximo correo toma la marca (`EmailService.getBranding`), igual que el formulario público (`GET /companies/public/:id`), marketing y el PDF. No hay reloj ni cascada.
6. Correos: `/configuration` (administrador) → `getCompany(id)` → `GET /companies/:id` → casillas (sin llave = encendido) y "Responder a" → `updateCompany(company.name, company.logo_url, company.colors, { emails, replyTo })` → `PATCH /companies`, que **reemplaza** `notifications` completo. `EmailService.shouldSendEmail` las lee al enviar (mapa 12).

### 5.5 Alta de una empresa: por cuenta propia desde el 16-09-2026

El registro estuvo meses cortado (solo guardaba el interesado); con el
paso 4 del roadmap volvió a crear la empresa de verdad.

1. `/register` → `NewUserRegisterForm.handleSubmit`. Primero guarda el
   interesado — `registerLead` → `POST /super-admin/lead` (`@Public`, 10
   por minuto) → tabla `leads` + `void alertNuevoLead` a
   `SUPER_ADMIN_EMAILS` — **sin bloquear**: si ese registro tropieza, el
   alta sigue igual. Así Felipe ve también a los que empezaron y no
   terminaron.
2. Después, el alta de verdad: `signup` → `POST /users/signup` (**LA
   puerta pública**, `@Public` + `@Throttle` 10/min, `SignupDto`
   endurecido: `@IsEmail`, contraseña mínimo 8, topes de largo en todo)
   → `SuperAdminService.createSuscription`: `CompaniesRepository.create`
   (todas las notificaciones en `true`, `currency`, `is_active: true`,
   y `plan: 'cotiza'` + `estado_plan: 'prueba'` + `prueba_vence: now()+7
   días`, del paso 3.2) → `UsersService.create` con cargo
   `administrador` → `CustomerSatisfactionSurveyService.createTemplate`
   → `void sendEmail(admin_email, NEW_ACCOUNT, {companyName,
   pruebaVence})` → `void alertNuevaEmpresa` (`SUPER_ADMIN_NEW_COMPANY`).
   Con sesión automática al terminar (`signIn` + `/dashboard`); si la
   sesión no abre, la pantalla dice que la cuenta quedó lista y lleva a
   `/login`.
3. **La compensación** (16-09): si la empresa nace pero su administrador
   no pudo crearse (lo típico: el correo ya tiene cuenta),
   `CompaniesRepository.deleteById` borra la empresa recién creada — sin
   eso, cada intento fallido dejaba una huérfana — y el visitante recibe
   409 "Ese correo ya tiene una cuenta en Eventia…" o 400 con el mensaje
   real (nunca "[object Object]"). Prueba:
   `super-admin/tests/alta-por-cuenta-propia.spec.ts`.
4. `POST /super-admin/suscription` **dejó de ser pública**: es la
   herramienta MANUAL de Felipe (mismo motor por dentro, pero
   `assertSuperAdmin`). Regla de la casa: una sola puerta pública por
   función.
5. La empresa nueva ve el banner de la prueba (`Layout`, con los días
   que quedan) y `/plans` muestra los tres planes reales y contrata de
   verdad con Mercado Pago (§5.9, desde el 17-09); `/plans/confirmation`
   pregunta el estado cada 3 s hasta que llegue el aviso del pago.
6. **De dónde llegó cada registro (18-09-2026, migración 116).** Mismo
   molde que el origen del lead de la migración 110 (mapa 01): la app
   captura la huella del aterrizaje (`capturarOrigen`, `lib/origenDelLead.ts`,
   al montar `LandingPage` y `RegisterPage`; el primer toque manda y vive
   en `sessionStorage`) y `NewUserRegisterForm` la manda como
   `origen_detalle` con el interesado Y con el alta. El motor decide:
   `limpiarOrigen` se queda solo con las llaves conocidas y
   `etiquetaDeOrigen` pone la etiqueta (`quotations/origen-del-lead.ts`,
   reutilizado desde `SuperAdminService.createSuscription` y
   `registerLead`) → `companies.origen`/`origen_detalle` y
   `leads.origen`/`origen_detalle`. **NULL = no se sabe** (anterior a la
   116 o creada a mano desde la Torre); **"Directo" = se registró sola
   sin ninguna huella**. Ambos DTOs aceptan `origen_detalle` como objeto
   opcional; la app reintenta sin la marca si el motor la rechazara
   (mismo seguro que la 110). Se ve en la Torre (§5.6). Prueba:
   `super-admin/tests/alta-por-cuenta-propia.spec.ts`.

### 5.6 Torre de Control (super-admin)

1. `/superAdminqweasdzxc` → `TorreDeControl` → `getTorre` → `GET /super-admin/torre` → `AuthGuard` (sesión) → `SuperAdminController.getTorre` → `assertSuperAdmin(user.email)`: compara en minúsculas contra `SUPER_ADMIN_EMAILS` y responde 403 "Solo super-administradores." si no está.
2. `SuperAdminService.getTorre` → en paralelo `SuperAdminRepository.getTorreBase` (`listarTodosLosUsuarios` + `user_profiles` + `companies`) y `countLeads()` + `countLeads(inicio de mes UTC)`. Cruza Auth con perfiles **por correo**, ordena por último inicio de sesión (los que nunca entraron al final) y arma las 6 tarjetas.
3. Al mismo tiempo, `SuperAdminPage` pide `GET /super-admin/companies` y `GET /super-admin/stats/last-month` → `armarStatsMensuales` (6 meses con huecos en 0 y totales de 30 días) + `getUsersLastSignIns`.
4. La tabla de empresas muestra la columna **Llegó por** (`TorreEmpresa.origen`, migración 116, §5.5 punto 6): "—" = no se sabe (anterior a la 116 o creada a mano), "Directo" = se registró sola sin huella, y si no la etiqueta del canal ("Google Ads", "Meta", "Búsqueda orgánica", "Referido: sitio").

## 6. Reglas de negocio acordadas

1. **Cuatro cargos fijos**: `recepcion`, `vendedor`, `operaciones`, `administrador`. Evidencia: CHECK de `user_profiles.role` en `0_initial_models.sql`; `UserRole` en `api-rest/src/users/entities/user.entity.ts`; `UserRole` en `frontend/src/constants/permissions.ts` y en `frontend/src/constants/users.ts`.
2. **El cargo se aplica en el motor desde la Fase 3 (27/28-07).** "Antes solo se comprobaba que existiera sesión: cualquier usuario conectado podía, técnicamente, llamar funciones administrativas." Sin `@Roles` basta la sesión ("compatibilidad: se van marcando rutas por etapas"). Si la sesión no trae cargo, 403 ("nunca dejar pasar por defecto"). Evidencia: `RolesGuard`, `roles.guard.spec.ts`, commit `02ab6eb`.
3. **Pantalla y motor deben decir lo mismo.** "La matriz espejo vive en el frontend (constants/permissions.ts) — si se cambia un lado, se cambia el otro" y, para recepción, "los dos lados tienen que decir lo mismo o la pantalla muestra algo que el servidor niega". Evidencia: comentarios en `roles.decorator.ts`.
4. **Recepción (12-08, definido con Felipe)**: "Ve todo lo que el cliente YA SABE —su cotización, su precio, en qué va— y nada de lo que solo sabe la empresa: márgenes, cobranza, totales del negocio". El calendario entra porque sin él no puede responder "¿tienen el 20 libre?". Evidencia: comentario de `ROLE_PERMISSIONS.recepcion`, commit `f91a6e8`.
5. **Ver cotizaciones y editarlas son permisos distintos desde el 12-08** (`quotations` y `quotations_edit`). "Recepción mira; no edita." Evidencia: `permissions.ts` y el comentario de la ruta `quotation-form` en `App.tsx`.
6. **No se muestra un control que el servidor rechaza** (12-08, barrido de 19 casos). Por ejemplo, la tarjeta de notificaciones solo la ve el administrador, porque "para los demás cargos el botón Guardar terminaba en un 403". Evidencia: `ConfigurationPage` (`esAdministrador`), commit `b0d0965`.
7. **Mientras el cargo viene en camino no se muestra nada.** El menú queda vacío (12-08) y `PermissionGuard` muestra el esqueleto, no un falso "Permisos Insuficientes" (bug del 21-07-2026). Evidencia: `Sidebar.canAccess`, `Layout.canAccess`, `PermissionGuard`.
8. **Personal y Marketing son solo de administrador en la app**: Personal (14-08) "porque ahí vive la cuenta corriente de cada persona", Marketing (25-08). Evidencia: `Section` en `permissions.ts`.
9. **La autoridad real es el motor**: "La autoridad real vive en el backend (valida cada operación con el token); esto solo decide qué se muestra en pantalla". Evidencia: comentario de `PROFILE_CACHE_KEY` en `AuthContext.tsx`.
10. **La empresa sale siempre de la sesión**: "company_id NO viaja desde el navegador". Evidencia: `frontend/src/types/users.types.ts`, `UsersController.create`, `CompaniesController.update`, `StorageController` ("la empresa sale SIEMPRE de la sesión").
11. **Memorias de 1 hora (28-07, pedido de Felipe: "se usa mucho de dejar ahí y volver").** Los pases se recuerdan hasta su vencimiento con tope de 1 hora, y "Solo se recuerdan pases que Supabase aprobó"; los perfiles, 1 hora. Evidencia: `cache/memoria.ts`, `AuthService.validateToken`, commit `83ef01a`.
12. **La cara pública de la empresa es acotada (mudanza #7, 28-07)**: nombre, logo, colores y moneda; desde el 05-09 también banner, subtítulo, sitio y redes, porque "son datos públicos — salen en cada correo de la empresa". La ficha completa exige sesión. Evidencia: `CompaniesController.findOnePublic`.
13. **Una sola puerta (28-07)**: el navegador no toca tablas ni baldes. Tras las migraciones 40 y 41 quedan "CERO privilegios y CERO políticas para anon/authenticated en el esquema public"; los leads entran solo por el motor (39); los baldes, sin políticas (42). Solo el inicio de sesión va directo a Supabase Auth.
14. **Super-admin por lista de correos, no por cargo** (`SUPER_ADMIN_EMAILS`, mudanza #7). Las alertas usan la misma lista, "jamás correos escritos a fuego", y nunca frenan el flujo: "el lead vale más que el correo". Evidencia: `SuperAdminService.assertSuperAdmin`, `superAdminRecipients`, `alertNuevoLead`, `super-admin.service.spec.ts`.
15. **La Torre cuenta en UTC** ("todo el sistema cuenta en UTC — coherencia manda") y cruza por correo porque "el id de user_profiles NO calza con auth.users.id" (medido en la base). Las barras son mensuales por pedido de Felipe (05-08), "SIEMPRE los 6 meses", y los totales conservan su significado de 30 días. Evidencia: `SuperAdminService.getTorre`, `SuperAdminRepository.getTorreBase`, `armarStatsMensuales`, `stats-mensuales.spec.ts`.
16. **Recuperar contraseña no revela si el correo existe**: 202 y mensaje genérico. Evidencia: `docs/password-recovery.md`, `AuthController.requestPasswordRecovery`, `ForgotPasswordPage`.
17. **Contraseñas**: cambiar la propia exige 8 a 128 caracteres con minúscula, mayúscula y número, y no pide la actual (`UpdatePasswordDto`, `ConfigurationPage.validateForm`). Restablecer exige 8 (`ResetPasswordDto`). Crear un usuario: el motor solo exige que no venga vacía (`CreateUserDto`) y la pantalla dice 6 caracteres.
18. **La moneda no se cambia después del alta**: "La moneda se establece al crear la cuenta y no puede ser modificada". `CreateCompanyDto` no tiene `currency`, así que `PATCH /companies` la rechaza (`forbidNonWhitelisted`). Evidencia: `CompanyConfiguration`, `create-company.dto.ts`.
19. **Umbral de alto valor (04-08, decisión de Felipe)**: "un monto configurable es simple y predecible; el promedio automático era magia inestable". NULL o 0 = sin marca. Evidencia: `60_umbral_alto_valor.sql`.
20. **Los correos al cliente están encendidos por defecto**: "Sin llave = encendido (regla del 29-07): solo un 'false' explícito lo apaga". Los del equipo no tienen interruptor ("apagarlos sería esconderse noticias propias"). El alta enciende todos. Evidencia: `ConfigurationPage`, `pages/configuration/constants.ts`, `createSuscription`.
21. **"Responder a" por empresa** (punto medio 30-07): `notifications.replyTo`. El envío sale de `hola@eventi-app.com`. Evidencia: `ConfigurationPage`, `Company.notifications` en `company.entity.ts`.
22. **Canal vacío = no aparece** (migración 95), y el banner reemplaza el encabezado de los correos de marketing (migración 96, Felipe 26-08).
23. **Registros sin datos sensibles (Fase 3, 28-07)**: `logSafe` tapa `password`, `admin_password`, `email`, `full_name`, etc.; pino redacta `authorization` y `cookie`; `resetPassword` solo registra los primeros 6 caracteres del token. Evidencia: `api-rest/src/logging/log-safe.ts`, `app.module.ts`, `AuthController.resetPassword`.
24. **Configuración al arrancar**: sin `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` o `PORT` el servidor no parte; `FRONTEND_URL`, `RESEND_API_KEY`, `SUPABASE_PASSWORD_RECOVERY_REDIRECT_URL`, `SUPER_ADMIN_EMAILS`, `PUBLIC_API_URL`, `RESEND_WEBHOOK_SECRET` y `MARKETING_BAJA_SECRET` solo advierten. Nació de que "RESEND_API_KEY faltó 5 días y el servidor partió igual". Evidencia: `config/validate-env.ts`, `validate-env.spec.ts`.
25. **Registro por cuenta propia apagado** desde el 09-06-2026 (commit `1c9a224`): "We only save the lead and show a 'we will contact you' message". Evidencia: `NewUserRegisterForm.handleSubmit`, `LoginPage`.
26. **Letrero de laboratorio**: "(28-07: Felipe entró al lab sin querer.)". Evidencia: `ES_LABORATORIO` en `Layout.tsx`.
27. **Toda pantalla detrás del login va con carga perezosa** (`React.lazy`); landing, login y recuperación van en el paquete inicial. Evidencia: comentario "Regla para pantallas nuevas" en `App.tsx`.

## 7. Conexiones con otros módulos

**Todos lo usan.** Cada controller del motor depende de `AuthGuard`, `RolesGuard`, `CurrentUser` y del `company_id` de la sesión. En la app, todo servicio pasa por `services/api.ts` (token y reintento en 401), toda pantalla de adentro por `Layout` y `PermissionGuard`, y muchas leen `useAuth()`.

**A quién usa este módulo:**
- **Supabase Auth**: sesiones, contraseñas, correo de recuperación y lista de usuarios.
- **Correos (mapa 12)**: `EmailService.sendEmail` para `NEW_ACCOUNT`, `SUPER_ADMIN_NEW_LEAD` y `SUPER_ADMIN_NEW_COMPANY`.
- **Encuestas (mapa 14)**: `CustomerSatisfactionSurveyService.createTemplate` en el alta.
- **Storage e infraestructura (mapa 16)**: `POST /storage/upload` para logo y banner; `cache/memoria.ts`; `ThrottlerGuard`; CORS y `validate-env` en `main.ts`.

**Quién lee lo de este módulo:**
- **Correos internos y al cliente (mapa 12)**: `EmailService.shouldSendEmail` (interruptores) y `EmailService.getBranding` (marca, datos de cobro, responder-a). Los avisos al equipo salen a `UsersService.findAll(companyId, ADMINISTRADOR)`: si una empresa no tiene administradores, esos avisos no salen (`if (!adminEmails.length) continue` en `QuotationsCronService` y `PaymentsCronService`).
- **Envío de cotizaciones (mapa 02)**: `EnvioCotizacionService` lee la empresa para el correo y el PDF.
- **Consultas y formularios públicos (mapa 11)**: `ConsultasService` lee la marca; `CreateQuotationPublic` usa `GET /companies/public/:id`.
- **Marketing (mapa 10)**: `MarketingController` y `MarketingCronService` leen WhatsApp, redes, sitio y banner.
- **Pagos y portal (mapa 03)**: `bank_details` en los correos de cobranza y en el portal.
- **Cotizador y tablero (mapas 01 y 02)**: `company.colors`, `logo_url`, `currency`, `high_value_threshold` (el 💎 del tablero) y los topes por cargo (`puedeEditar`, `puedeVerMargen`).
- **Dashboard (mapa 13)**: `NewAccount` (solo administrador) usa `company.id`.
- **Encuestas (mapa 14)**: `PublicSurvey` usa `getCompanyById` (cara pública).
- **Personas (mapas 07 y 08)**: su sección es solo de administrador en la app, pero no en el motor (sección 8).
- **Base de datos (mapa 18)** y **despliegue (mapa 19)**: `SUPER_ADMIN_EMAILS`, `SUPABASE_PASSWORD_RECOVERY_REDIRECT_URL` y el resto de variables viven en Railway; el letrero de laboratorio depende de `VITE_SUPABASE_URL`.
- **Kit de la casa (mapa 17)**: `PermissionGuard`, `PageSkeleton`, `SelectWithSearch`, `Toast`, `NumberInput`.

**Pantallas que leen la empresa desde `useAuth()`** (se ven afectadas si cambia la forma del perfil): `QuotationViewer`, `ClientDetailPage`, `RequestsPage`, `pages/analytics/index.tsx`, `Calendar`, `AnswersView`, `TemplateView`, `DashboardPage`, `NewAccount`, `InventarioPage`, `NewUserRegisterForm`, `LogisticaPage`, `ComprasTab`, `PersonasPage`, `CocinaTab`, `FichaCocinaSection`, `GestionTab`, `PostVentaPage`, `ServiciosTab`, `NegocioPage`, `QuotationForm`, `QuotationsPage`, `ServicesPage`, `FixedServiceForm`, `VariableServiceForm`. Los campos más leídos: `company?.id` (58 usos), `name` (20), `currency` (17), `colors` (13) y `logo_url` (11).

**Efectos automáticos.** No hay relojes en este módulo. Correos: `NEW_ACCOUNT` al administrador en el alta; `SUPER_ADMIN_NEW_LEAD` y `SUPER_ADMIN_NEW_COMPANY` a la lista de super-admins; el de recuperación lo manda Supabase. No hay cascadas en el código.

## 8. Zonas de riesgo: si tocas esto, cuidado con aquello

1. **Si tocas** los campos de la empresa (agregas uno a `CompanyConfiguration` o a `companies`), **se afecta** la configuración de empresa, **porque** la pantalla parte del perfil de sesión y guarda `campo.trim() || null`: si el campo no viene en la lista explícita de `companies(...)` de `UsersRepository.findOne`, se muestra vacío y al guardar se pisa con null. **Ya pasó tres veces**: el 30-07 con `tagline` y `bank_details` (commit `54ddd91`), el 04-08 con el umbral, que "quedó NULL" (`c4ba476`), y el 26-08 con los canales, "el clásico" (`7dbe678`). También hay que agregarlo al armado campo a campo de `updateCompany` en `services/companies.service.ts`, a `CreateCompanyDto` (si no, `forbidNonWhitelisted` lo rechaza) y a `Company` en `company.entity.ts` y `types/companies.types.ts`. El 04-08 el umbral cayó dentro de `colors` en la entidad y solo lo pilló el build de Railway (`5a3ca54`).
2. **Si tocas** los decoradores de `super-admin.controller.ts`, **se afecta** toda el área super-admin, **porque** un `@Public()` hace que `AuthGuard` no cargue al usuario y `user.email` truena con 500. Pasó en la Fase 3 y se descubrió el 10-08: "la página no se abría desde entonces" (`1384c04`). Además, cada ruta nueva del área debe llamar `assertSuperAdmin` a mano: no hay guard ni decorador que lo haga.
3. **Si tocas** `ROLE_PERMISSIONS` o `SECTION_ROLES`, **se afecta** lo que ve cada cargo, **porque** son dos listas que deben coincidir y hoy no coinciden en dos lugares: el vendedor puede abrir `/calendar` por dirección aunque el menú no se lo muestre, y `plans` es solo de administrador en el menú pero de todos en la ruta. `Sidebar` y `Layout` usan `canAccessSection`; `App.tsx` y los botones usan `SECTION_ROLES`.
4. **Si tocas** un `@Roles` en el motor o una sección en `permissions.ts` sin el espejo, **se afecta** la experiencia por cargo, **porque** aparece un botón que termina en 403 (19 casos cerrados el 12-08, `b0d0965`) o, al revés, una pantalla cerrada con el motor abierto. Hoy el motor no pide cargo en las 44 rutas de `people` (RUT y datos bancarios), aunque la pantalla es "SOLO de administrador"; tampoco en `consultas`, `calendar`, `clients` ni en crear, editar o borrar cotizaciones.
5. **Si cambias el cargo** de un usuario, **se afecta** el motor hasta por 1 hora, **porque** `UsersService.update` no llama `olvidarPerfil` y `AuthGuard` sigue usando el perfil guardado en `cachePerfiles`. La pantalla lo refleja antes (revalidación de `profileQuery`), así que el usuario puede ver un botón nuevo que el motor todavía le niega, o conservar en el motor un permiso que ya le quitaron.
6. **Si eliminas** un usuario, **se afecta** la seguridad por hasta 1 hora, **porque** `UsersService.remove` llama `olvidarPerfil(id)` con el id de `user_profiles`, mientras que `cachePerfiles` está indexado por el id de Auth (`AuthGuard.canActivate`). Su perfil y su pase (`cacheTokens`) siguen en memoria hasta vencer. Además `removeAuthUser` pasa ese mismo id de perfil a `auth.admin.deleteUser`, lo más probable es que ahí nazca el "TODO: check because it's not working". Y el orden importa: según la foto `0_initial_models.sql`, `user_profiles_user_id_fkey` no tiene `ON DELETE`, así que borrar primero en Auth chocaría con el perfil.
7. **Si tocas** `UsersRepository.createAuthUser`, **puede afectarse todo el motor**, **porque** llama `auth.signUp` sobre el cliente compartido de `SupabaseService`. En supabase-js 2.57, `GoTrueClient.signUp` guarda la sesión cuando Supabase la devuelve (`_saveSession`), y `SupabaseClient._getAccessToken` pasa a usar ese token en vez de la llave de servicio. Si el proyecto confirma los correos automáticamente, las consultas siguientes de ese proceso irían como el usuario nuevo y chocarían con la migración 40. `AuthService` usa un cliente aparte y no se contagia. No verificado en ejecución: ver pregunta 1.
8. **Si tocas** `AuthGuard`, `AuthService.validateToken` o el orden de `APP_GUARD`, **se afectan** todas las rutas y la velocidad de todas las pantallas, **porque** la memoria de pases y perfiles es la que ahorra "~0,5s" por petición (`83ef01a`), y `RolesGuard` "DEBE ir después de AuthGuard" para encontrar el cargo en `request.user`.
9. **Si tocas** `GET /users/:id` o `UsersRepository.findOne`, **se afectan** el inicio de sesión y el cargo en toda la app (`AuthContext`, `AuthGuard`). Ojo: no filtra por empresa, así que cualquier sesión que conozca el id de Auth de otra persona puede leer su perfil y la ficha embebida de su empresa, con datos de cobro. Esta puerta está en el **Sprint 4** ("Fichas de empresa y de usuarios") de `22_AISLAMIENTO_ENTRE_EMPRESAS.md`, pendiente; ese capítulo anota además que `AuthGuard` usa este mismo `findOne` sin empresa para poblar la sesión, así que el arreglo no puede tocarlo a la ligera.
10. **Si tocas** `PATCH /users/:id` o `GET /companies/:id`, cuidado con el aislamiento entre empresas: `UsersRepository.update` filtra solo por `id`, así que un administrador de otra empresa que tenga el UUID podría cambiar nombre y cargo de un usuario ajeno. `CompaniesRepository.findOne` también filtra solo por `id`, y los ids de empresa son correlativos: cualquier sesión puede leer la ficha completa de otra empresa (notificaciones y datos de cobro incluidos). Las dos puertas están en el **Sprint 4** de `22_AISLAMIENTO_ENTRE_EMPRESAS.md`, pendiente; el capítulo pide que el arreglo de `GET /companies/:id` vaya en esa ruta privada, sin tocar `CompaniesRepository.findOne`, del que dependen los correos y la ruta pública.
11. **Si tocas** `/plans/confirmation`, **se afecta** el cobro, **porque** cualquier usuario con sesión y de cualquier cargo que abra esa dirección deja su empresa en `is_premium = true`, sin que nada verifique un pago en Mercado Pago (`ConfirmationPage` y `PlansRepository.confirmPlan`).
12. **Si tocas** las puertas públicas de acceso, **se afecta** la protección contra abuso, **porque** `POST /auth/password/recovery`, `POST /auth/password/reset` y `POST /users/signup` no tienen `@Throttle` propio (solo el global de 300 por minuto). `/users/signup` crea empresa y administrador igual que `/super-admin/suscription`, que sí tiene 10 por minuto.
13. **Si tocas** `PATCH /super-admin/companies/:id`, **se afecta** lo que la Torre puede cambiarle a una empresa, incluido su plan. **Corregido el 14-09-2026** (§5.8): el body ya es una clase DTO (`ActualizarEmpresaDto`, en `api-rest/src/super-admin/dto/actualizar-empresa.dto.ts`), así que el `ValidationPipe` global —`whitelist` y `forbidNonWhitelisted`— rechaza cualquier campo que no esté declarado; antes se declaraba como tipo TypeScript y `SuperAdminRepository.updateCompanyById` actualizaba lo que viniera. Lo que hay que cuidar ahora es otra cosa: un campo nuevo en el DTO es un campo que la Torre puede escribir, y `updateCompanyById` estampa `plan_cambiado_en` y olvida la memoria de los derechos de la empresa y el perfil de todos sus usuarios **solo cuando vienen `plan` o `estado_plan`**. Quién entra sigue dependiendo solo de la lista de correos (`assertSuperAdmin`).
14. **Si tocas** `ConfigurationPage.handleSaveNotifications` o agregas llaves a `notifications`, **se afecta** la configuración de correos, **porque** `PATCH /companies` reemplaza el JSON entero con `{ emails, replyTo }`. Una llave nueva que esa pantalla no reenvíe se borra. `CompanyConfiguration` manda `notifications: undefined` a propósito para no pisarlo.
15. **Si tocas** `SUPER_ADMIN_EMAILS` en Railway, **se afecta** quién entra a la Torre y quién recibe las alertas de leads y empresas nuevas. Vacía: nadie entra y no sale ninguna alerta, en silencio (prueba "sin SUPER_ADMIN_EMAILS configurado no intenta enviar nada").
16. **Si agregas un cargo**, **se afectan** el CHECK de `user_profiles.role`, `UserRole` del motor, los grupos de `roles.decorator.ts`, `UserRole`, `ROLE_PERMISSIONS`, `ROLE_GROUPS` y `SECTION_ROLES` en `permissions.ts`, el segundo enum en `constants/users.ts` y la lista `roles` de `UserManagementPage` (con colores y la tarjeta informativa).
17. **Si tocas** `createSuscription`, recuerda que no se deshace nada: si falla el usuario, la empresa ya quedó creada. `createCompanyOnly` crea una empresa solo con nombre: sin notificaciones, sin moneda y sin plantilla de encuesta.

## 9. Pruebas que lo protegen

| Archivo | Qué cubre |
|---|---|
| `api-rest/src/auth/tests/roles.guard.spec.ts` | 5 pruebas reales: ruta pública pasa; sin `@Roles` basta sesión; cargo correcto pasa; cargo insuficiente da 403; sin cargo da 403 |
| `api-rest/src/auth/tests/derechos.spec.ts` (14-09-2026) | Los tres planes por los cuatro estados, los bordes del cupo, y que Valle del Sol conserva todo: los 14 derechos de Opera y Crece más `personal` y `marketing` (§5.8) |
| `api-rest/src/auth/tests/derechos.guard.spec.ts` (14-09-2026, renombrada desde `modulos-propios.spec.ts`) | El cuarto guardián: ruta pública pasa, empresa bloqueada solo entra a `@SinPlan`, `@Derecho(null)` abre una ruta dentro de un controller cerrado |
| `api-rest/src/auth/tests/matriz-de-derechos.spec.ts` (14-09-2026) | Lee los decoradores reales de 13 controllers y falla si una ruta queda sin decidir. Hermana de `matriz-de-cargos.spec.ts` (mapa 23) |
| `api-rest/src/quotations/tests/unit/derechos-del-plan.spec.ts` (14-09-2026) | 15 pruebas de las revisiones que viven dentro de los servicios: cupo del mes, `varios_dias`, encuesta, embudo, portal, segundo contacto, tope de usuarios |
| `api-rest/src/auth/tests/auth.guard.spec.ts` | solo que la clase se construye |
| `api-rest/src/auth/tests/auth.service.spec.ts` | se construye, y se niega a construirse sin configuración de Supabase |
| `api-rest/src/users/tests/users.controller.spec.ts`, `users.service.spec.ts` | solo construcción |
| `api-rest/src/companies/tests/companies.controller.spec.ts`, `companies.service.spec.ts` | solo construcción |
| `api-rest/src/plans/tests/plans.controller.spec.ts`, `plans.service.spec.ts` | solo construcción |
| `api-rest/src/super-admin/tests/super-admin.controller.spec.ts` | construcción, y que `GET torre` pasa por `assertSuperAdmin` antes de `getTorre` |
| `api-rest/src/super-admin/tests/super-admin.service.spec.ts` | la torre cruza por correo, ordena con los nulos al final y arma las tarjetas; `registerLead` avisa a la lista del `ConfigService`; si Resend falla el lead queda igual; `createCompanyOnly` avisa y el correo caído no bota la empresa; sin `SUPER_ADMIN_EMAILS` no intenta enviar |
| `api-rest/src/super-admin/tests/stats-mensuales.spec.ts` | ventana de 6 meses, bordes de mes con huecos en 0, totales de 30 días |
| `api-rest/src/super-admin/tests/paginacion.spec.ts` | `getTorreBase` junta todas las páginas de Auth; `getStatsLastMonth` recorre con `.range()` |
| `api-rest/src/config/validate-env.spec.ts` | críticas faltantes o en blanco lanzan; importantes solo advierten |
| `api-rest/test/app.e2e-spec.ts` | plantilla de Nest que espera `GET /` = "Hello World!"; no corresponde a este sistema |

**La app sí tiene pruebas (corrección: el borrador decía "no tiene")**: `frontend/package.json` trae `"test": "vitest run"` y hay 19 archivos `*.test.ts`/`*.test.tsx` (en `utils/`, `components/` y `pages/`). Pero ninguno cubre este módulo: no hay pruebas de `permissions.ts`, `AuthContext`, `PermissionGuard`, `Layout.canAccess`/`Sidebar.canAccess` ni de las pantallas de login, usuarios, empresa, planes o super-admin.

**Lo importante que NO está cubierto:**
- `AuthGuard.canActivate`: memoria de perfiles, perfil inexistente, cargo y correo en `request.user`.
- `AuthService.validateToken`: memoria por huella y `vidaRestante`.
- La recuperación de contraseña, ninguno de sus dos endpoints.
- `UsersService.create`, `update` y `remove`: ids de perfil contra ids de Auth, `olvidarPerfil`, orden del borrado.
- `assertSuperAdmin` en sí (mayúsculas, espacios, lista vacía).
- Que `CompaniesController.findOnePublic` no filtre campos privados.
- `PATCH /companies` y la lista de campos permitidos.
- `PlansService.confirmPlan`.
- **Ninguna prueba compara** la matriz del motor (`roles.decorator.ts` y los `@Roles`) con la de la app (`permissions.ts`), ni `ROLE_PERMISSIONS` con `SECTION_ROLES`.
- `PermissionGuard`.

## 10. Deuda y rarezas conocidas

- **Archivos grandes**: `frontend/src/pages/superAdmin/Index.tsx` tiene 846 líneas y cuenta dentro del techo de 27 archivos sobre 800 que vigila `frontend/scripts/portero-kit-de-la-casa.sh`; no está entre los 7 gigantes congelados. `UserManagementPage.tsx` tiene 697.
- **Modales a mano** en `UserManagementPage` (crear/editar y confirmar eliminación, ambos `fixed inset-0`) en vez de `components/Modal`. No aparecen en la lista de deuda de `CLAUDE.md`.
- **Tarjeta "Permisos por Rol" desactualizada** en `UserManagementPage`: texto fijo que no refleja `permissions.ts` (a recepción le faltan Cotizaciones y Calendario, a operaciones Logística; no distingue ver de editar).
- **Dos enums de cargo en la app**: el tipo `UserRole` de `constants/permissions.ts` y el enum de `constants/users.ts` (este último lo usan `LoginPage`, `DashboardPage`, `ServiciosTab`, `QuotationForm`). En el motor, `UserRole` lleva "TODO: set real roles".
- **`any` en el módulo**: `section as any` en `Layout.canAccess` y `Sidebar.canAccess`; `error?: any` en `AuthContext.signIn`; `data?: any`, `params?: any` en `api.ts`; `userRole as any` en `RequestsPage` y `QuotationsPage`. `UsersService.create` devuelve `Promise<any>` y hace `throw new Error(error)` con un objeto.
- **Código muerto o dormido**: métodos comentados en `CompaniesController`, `CompaniesService`, `SuperAdminController` y `SuperAdminService`; `SuperAdminRepository.createSuscription` solo registra en el log y no hace nada; la clase vacía `super-admin.entity.ts`; el botón "Crear nueva empresa" comentado; `updateCompany` de `services/superAdmin.service.tsx` sin llamador; `signup` de `services/users.service.ts` sin llamador vivo; `POST /users/signup` y `POST /super-admin/suscription` sin uso desde la app.
- **TODOs**: `UsersRepository.removeAuthUser` ("check because it's not working"), ruta super-admin ("add authentication"), `services/users.service.ts` ("mange the error better"), `services/api.ts` ("move to supabase service").
- **Tres reglas de contraseña distintas** (sección 6, regla 17).
- **`UsersRepository.findAll(companyId | undefined)`**: si llega `undefined` devuelve usuarios de todas las empresas. Hoy todos los llamadores pasan empresa.
- **`API_ROUTES` del motor** (`api-rest/src/constants/api.routes.ts`) solo tiene `AUTH` y `USERS`; los demás controllers escriben la ruta a mano.
- **Lo que queda a medio camino** (releído el 16-09-2026): `Plans.tsx` ya muestra los tres planes firmados con sus precios reales (la versión de $10.000 con el enlace de Mercado Pago escrito a fuego se retiró), pero **contratar sigue siendo humano**: el botón abre WhatsApp, porque el cobro automático es el sprint B de `PLAN_VENTA_AUTOMATICA.md` (suscripción por empresa con `external_reference`, webhook con firma, `pagado_hasta`). `companies.is_active` sigue sin lectores. `docs/mapa-programacion-planes.md` (24-07) quedó superado por ese plan.
  - **Corregido en parte el 14-09-2026** (§5.8): el candado por plan **sí existe** en el motor, con las columnas `plan` y `estado_plan` de la migración 112 y un reloj que vence las pruebas de 7 días. Lo que sigue pendiente: el cobro (paso 5 del roadmap), el precio y el enlace escritos a fuego en `Plans.tsx`, `is_premium` ya sin nadie que lo lea en la app (el banner pasó a `estado_plan`; la columna sigue en la base y la sigue escribiendo `/plans/confirmation`) y `is_active` sin lector. La columna que la 112 trae se llama `estado_plan`, no `subscription_status`.
  - **Y la pantalla ya sabe de derechos** desde el mismo 14-09-2026, unas horas después (§5.8, "En la app"): menú con candado, `PermissionGuard` con `derecho`, Dashboard en tres niveles, pestañas de Post-Venta y del catálogo, el campo "Último día" y la Torre con la tabla de planes.
- **Detalles de pantalla**: `UserManagementPage.formatDate` usa `es-ES`; los montos del super-admin usan `es-MX` con 2 decimales; al crear un usuario no hay toast de éxito (al editar sí).
- **Portero del kit**: este módulo no suma a las reglas de `<select>`, `alert()`, `confirm()` ni `type="number"`.

## 11. Contradicciones entre documento y código

1. **`CLAUDE.md` dice** que cada método de repositorio "takes `companyId` and filters/scopes queries by `company_id`". **El código**: `UsersRepository.findOne(id)`, `UsersRepository.update(id, dto)` y `UsersRepository.updatePassword` no reciben empresa; `UsersRepository.removeAuthUser(id, companyId)` la recibe y no la usa; `UsersRepository.findAll` la trata como opcional; `CompaniesRepository.findOne(id)` y `update(id)` usan el id de la empresa sin compararlo con la sesión (en `update` sí viene de la sesión).
2. **`CLAUDE.md` dice** que `AuthGuard` "attaches `{ id, company_id }` to `request.user`" y que el usuario se lee "via the `@User()` decorator". **El código**: `AuthGuard.canActivate` adjunta `{ id, company_id, role, email }`, y el decorador se llama `CurrentUser` (`api-rest/src/auth/user.decorator.ts`, exportado en `auth/index.ts`).
3. **`CLAUDE.md` dice** "Gate UI with `PermissionGuard`". **El código**: en `App.tsx`, las rutas `customer-satisfaction-survey`, `customer-satisfaction-survey/template` y `customer-satisfaction-survey/answers` están dentro de `Layout` sin `PermissionGuard`, y `/superAdminqweasdzxc` no tiene ninguna guardia.
4. **`docs/password-recovery.md` dice** que `POST /auth/password/recovery` "always responds with `202 Accepted`". **El código**: `AuthService.requestPasswordRecovery` lanza `BadRequestException(error.message)` si Supabase devuelve error, y entonces responde 400 con el mensaje de Supabase.
5. **`docs/password-recovery.md` dice** que `/reset-password` lee `access_token` y `type=recovery` "from the query string". **El código**: `ResetPasswordPage` lee la query **o** el hash (`location.hash`).
6. **Comentarios de `api-rest/src/auth/auth.guard.ts` y `api-rest/src/cache/memoria.ts`** (y el mensaje del commit `83ef01a`) dicen que "editar un usuario lo hace olvidar AL INSTANTE (users.service llama olvidarPerfil)". **El código**: `UsersService.update` no llama `olvidarPerfil`, y `UsersService.remove` lo llama con el id de `user_profiles`, que no es la llave de `cachePerfiles`.
7. **Comentario de `app.module.ts`**: "los accesos PÚBLICOS llevan techos más estrictos con @Throttle en sus controllers". **El código**: no tienen `@Throttle` `POST /auth/password/recovery`, `POST /auth/password/reset`, `POST /users/signup`, `GET /companies/public/:id`, `GET /clients/types/public/:company_id`, `GET /quotations/:id` ni `GET /customer-satisfaction-survey/template` y `/answered`.
8. **Texto del modal de `UserManagementPage`**: "El usuario permanecerá en el sistema de autenticación". **El código**: `UsersService.remove` sí intenta borrarlo de Auth con `removeAuthUser` (aunque, por el id, probablemente falle).
9. **`CLAUDE.md` dice** "There is no frontend test suite". **El código**: `frontend/package.json` tiene `"test": "vitest run"` y 19 archivos `*.test.ts`/`*.test.tsx` bajo `utils/`, `components/` y `pages/` (ninguno de este módulo).

## 12. Preguntas abiertas

1. ¿El proyecto de Supabase (producción y laboratorio) tiene activa la confirmación de correo? Define si `auth.signUp` en `UsersRepository.createAuthUser` deja una sesión pegada en el cliente compartido (riesgo 7) y si un usuario recién creado puede entrar sin confirmar.
2. ¿`auth.admin.deleteUser` con el id de `user_profiles` responde error? Si es así, `DELETE /users/:id` borra el perfil y luego falla, y la pantalla muestra "No se pudo eliminar el usuario" aunque el perfil ya no esté. No se probó.
3. ¿Es intencional que `/plans/confirmation` marque `is_premium` sin verificar el pago? ¿Mercado Pago tiene esa dirección configurada como retorno? ¿Qué empresas tienen hoy `is_premium = false` y ven el banner de 7 días?
4. ¿`people` (44 rutas) debe exigir `ADMIN_ONLY` en el motor, como la pantalla? ¿Quedan a propósito solo con sesión `consultas`, `calendar`, `clients` y crear/editar/borrar cotizaciones?
5. ¿El vendedor debe ver el Calendario? El menú dice que no y la ruta dice que sí.
6. ¿Recepción, vendedor y operaciones deben poder abrir `/plans`? Hoy el banner de prueba los lleva ahí.
7. ¿Se va a reactivar el registro por cuenta propia? Si no, `POST /users/signup` (público, sin techo propio) y `POST /super-admin/suscription` quedan abiertos sin uso.
8. ¿`GET /users/:id` y `GET /companies/:id` deben acotarse a la empresa de la sesión? ¿Y `PATCH /users/:id`?
9. Al llegar a `/reset-password` con el token en el hash, ¿el cliente Supabase del navegador (`lib/supabase.ts`, `detectSessionInUrl` por defecto) abre sesión antes de cambiar la contraseña? No verificado.
10. ¿`companies.is_active` debería bloquear el acceso de una empresa? Hoy nadie lo lee.
11. ¿Las tres rutas de encuestas sin `PermissionGuard` son intencionales? (mapa 14).

## 13. Archivos clave

**Motor**
- `api-rest/src/app.module.ts` — orden de `AuthGuard`, `ThrottlerGuard` y `RolesGuard`; redacción de encabezados en el log
- `api-rest/src/main.ts` — `validateEnv`, `trust proxy`, CORS, `ValidationPipe`
- `api-rest/src/auth/auth.guard.ts` — `AuthGuard.canActivate`
- `api-rest/src/auth/roles.guard.ts` — `RolesGuard`
- `api-rest/src/auth/roles.decorator.ts` — `Roles`, `ADMIN_ONLY`, `OPERATIONS_AND_UP`, `SALES_AND_UP`, `RECEPTION_AND_UP`
- `api-rest/src/auth/derechos.ts` — `DERECHOS_POR_PLAN`, `derechosDe`, `assertDerecho`, `assertCupo`, `NOMBRE_DEL_PLAN`, `PLAN_MINIMO` (§5.8)
- `api-rest/src/auth/derecho.decorator.ts` — `Derecho`, `SinPlan` (antes `modulo-propio.decorator.ts`)
- `api-rest/src/auth/derechos.guard.ts` — `DerechosGuard`, el cuarto guardián (antes `modulos-propios.guard.ts`)
- `api-rest/src/auth/derechos.service.ts`, `api-rest/src/auth/derechos.module.ts` — los derechos de una empresa sin sesión, con memoria de 5 minutos
- `api-rest/src/plans/plan-cron.service.ts` — el reloj de las 11:00 que vence las pruebas
- `api-rest/src/utils/dates.ts` — `inicioDelMesEnChile`, el mes del tope de cotizaciones
- `api-rest/src/auth/public.decorator.ts`, `api-rest/src/auth/user.decorator.ts` (`CurrentUser`), `api-rest/src/auth/index.ts`
- `api-rest/src/auth/auth.service.ts` — `validateToken`, `vidaRestante`, `requestPasswordRecovery`, `resetPasswordWithToken`
- `api-rest/src/auth/auth.controller.ts`, `api-rest/src/auth/dto/`
- `api-rest/src/cache/memoria.ts` — `cacheTokens`, `cachePerfiles`, `olvidarPerfil`
- `api-rest/src/users/users.controller.ts`, `users.service.ts`, `users.repository.ts`, `entities/user.entity.ts`, `dto/`, `types/index.ts`
- `api-rest/src/companies/companies.controller.ts` (`findOnePublic`), `companies.service.ts`, `companies.repository.ts`, `entities/company.entity.ts`, `dto/create-company.dto.ts`
- `api-rest/src/plans/plans.controller.ts`, `plans.service.ts`, `plans.repository.ts`
- `api-rest/src/super-admin/super-admin.controller.ts`, `super-admin.service.ts` (`createSuscription`, `assertSuperAdmin`, `getTorre`, alertas), `super-admin.repository.ts` (`armarStatsMensuales`, `getTorreBase`, `listarTodosLosUsuarios`), `dto/`
- `api-rest/src/config/validate-env.ts`
- `api-rest/src/logging/log-safe.ts`
- `api-rest/src/supabase/supabase.service.ts` — el cliente compartido
- `api-rest/src/storage/storage.service.ts` — `company-logo`, `company-banner`
- `docs/migrations/0_initial_models.sql`, `39_leads_solo_por_backend.sql`, `40_cerrar_acceso_directo.sql`, `41_barrida_final_anon.sql`, `42_storage_candado.sql`, `46_datos_cobro_empresa.sql`, `60_umbral_alto_valor.sql`, `95_contacto_de_marca.sql`, `96_banner_de_correos.sql`, `111_modulos_propios.sql`, `112_derechos_por_plan.sql`
- `docs/password-recovery.md`, `docs/mapa-programacion-planes.md`

**App**
- `frontend/src/App.tsx` — rutas, `PermissionGuard` por sección, carga perezosa
- `frontend/src/constants/permissions.ts` — `UserRole`, `Section`, `ROLE_PERMISSIONS`, `canAccessSection`, `ROLE_GROUPS`, `SECTION_ROLES`
- `frontend/src/constants/users.ts` — segundo enum `UserRole`
- `frontend/src/components/PermissionGuard.tsx`
- `frontend/src/contexts/AuthContext.tsx` — `AuthProvider`, `profileQuery`, `signIn`, `signOut`, `useAuth`
- `frontend/src/lib/supabase.ts`, `frontend/src/services/api.ts`
- `frontend/src/layout/Layout.tsx`, `frontend/src/layout/Sidebar.tsx`
- `frontend/src/pages/LoginPage.tsx`
- `frontend/src/pages/auth/ForgotPasswordPage.tsx`, `frontend/src/pages/auth/ResetPasswordPage.tsx`
- `frontend/src/pages/UserManagementPage.tsx`
- `frontend/src/pages/configuration/ConfigurationPage.tsx`, `constants.ts`, `types.ts`
- `frontend/src/pages/configuration/companyConfiguration/CompanyConfiguration.tsx`
- `frontend/src/pages/plans/Plans.tsx`, `frontend/src/pages/plans/ConfirmationPage.tsx`
- `frontend/src/pages/superAdmin/Index.tsx`
- `frontend/src/pages/landingPage/RegisterPage.tsx`, `NewUserRegisterForm.tsx`
- `frontend/src/services/auth.service.ts`, `users.service.ts`, `companies.service.ts`, `plans.service.ts`, `superAdmin.service.tsx`, `registerLeads.service.ts`, `storage.service.ts` (`uploadCompanyLogo`, `uploadCompanyBanner`)
- `frontend/src/types/users.types.ts`, `frontend/src/types/companies.types.ts`, `frontend/src/types/superAdmin.types.ts` (`TorreEmpresa`)
- `frontend/src/constants/api.routes.ts` — `USERS*`, `COMPANIES`, `PLAN_CONFIRMATION`, `SUPER_ADMIN*`
- Los derechos por plan en la app (§5.8, 14-09-2026): `frontend/src/constants/permissions.ts` (`Derecho`, `SECTION_DERECHO`, `tieneDerecho`, `estaBloqueada`, `PLAN_MINIMO`, `NOMBRE_DEL_PLAN`, `NOMBRE_DEL_DERECHO`), `frontend/src/constants/derechos.test.ts`, `frontend/src/components/MejoraTuPlan.tsx` y su `MejoraTuPlan.test.tsx`, `frontend/src/components/SoloConDerecho.tsx`, `frontend/src/components/PermissionGuard.tsx` (prop `derecho`), `frontend/src/layout/Sidebar.tsx` (el candado del menú), `frontend/src/layout/Layout.tsx` (el banner de la prueba), `frontend/src/services/api.ts` (los tres códigos del 403) y `frontend/src/services/superAdmin.service.tsx` (`cambiarPlanDeEmpresa`)

### 5.7 Módulos propios (14-09-2026, rama `pruebas`)

Personal y Marketing son de Valle del Sol y no entran en los planes. La
columna `companies.modulos_propios` (`text[]`, migración 111, `'{}'` por
defecto; la empresa 1 con `personal` y `marketing`) viaja embebida en el
perfil (`UsersRepository.findOne` → `GET /users/:id` → `useAuth().company`)
y en `request.user.modulos_propios` (`AuthGuard`). Cuatro piezas:

1. `auth/modulo-propio.decorator.ts`: `@ModuloPropio('personal' | 'marketing' | null)`.
2. `auth/modulos-propios.guard.ts`: cuarto guardián global, después de `RolesGuard`; 403 "Este módulo no está disponible para tu empresa" si la empresa no lo tiene; `null` en una ruta la abre aunque el controller esté cerrado; `@Public` no pasa por acá.
3. `constants/permissions.ts`: `SECTION_MODULO` y `tieneModulo`; `Sidebar.canAccess` y `PermissionGuard` (prop `modulo`) esconden menú y pantalla.
4. Migración 111 **antes** del deploy en producción: el motor recuerda perfiles una hora y sin la columna cerraría Personal y Marketing a Valle del Sol.

Pruebas: `auth/tests/modulos-propios.spec.ts` (el guardián, las 7 rutas abiertas de Personal, todo Marketing cerrado) y `constants/modulosPropios.test.ts` en la app.

**Desde el mismo 14-09-2026, este mecanismo es el del candado por plan** (§5.8). Personal y Marketing pasaron a ser **dos derechos más** de la misma lista: se siguen dando solo por `modulos_propios` y no los trae ningún plan, pero ya no tienen piezas propias. El decorador `@ModuloPropio` se llama ahora `@Derecho`, el guardián `ModulosPropiosGuard` es `DerechosGuard` y la prueba `modulos-propios.spec.ts` es `derechos.guard.spec.ts`. Lo que cambia son los nombres; el comportamiento es idéntico. En la app pasó lo mismo unas horas después: `SECTION_MODULO` y `tieneModulo` se llaman ahora `SECTION_DERECHO` y `tieneDerecho`, y la prueba `constants/modulosPropios.test.ts` es `constants/derechos.test.ts`. Personal y Marketing se preguntan exactamente igual que los otros catorce derechos ("En la app", al final de §5.8).

### 5.8 Los derechos por plan (14-09-2026, rama `pruebas`)

**La idea, y es lo único que hay que entender.** Una empresa no "tiene un plan": tiene una **lista de derechos**. El plan solo rellena esa lista. El código pregunta siempre por el derecho (`calendario`, `post_venta`, `varios_dias`…) y **nunca** por el plan. Por eso cambiar precios, renombrar un paquete o mover una función de un plan a otro es tocar **una tabla**, y no salir a buscar `if (plan === 'gestiona')` por todo el sistema. Es el patrón que la industria usa para esto (*entitlements*), y está escrito así en la cabecera de `api-rest/src/auth/derechos.ts`. Los módulos propios de la migración 111 (§5.7) pasaron a ser **dos derechos más** del mismo mecanismo: no los da ningún plan, los da la columna `modulos_propios`.

**La migración 112** (`docs/migrations/112_derechos_por_plan.sql`, con su reversa) le agrega cuatro columnas a `companies`:

| Columna | Qué guarda | Default y candado |
|---|---|---|
| `plan` | `cotiza`, `gestiona` o `crece` | `cotiza`; CHECK `companies_plan_check` |
| `estado_plan` | `prueba`, `activo`, `gratis`, `moroso` o `bloqueado` | `prueba`; CHECK `companies_estado_plan_check` (`gratis` lo agregó la migración 113) |
| `prueba_vence` | Cuándo termina la prueba gratis (`timestamptz`) | NULL si no está en prueba |
| `plan_cambiado_en` | Última vez que cambió el plan o el estado, para la Torre | `now()` |

En la **misma** migración, las tres empresas vivas (1 Valle del Sol, 51 MDS Hoteles, 52 la demo Vivo Corriendo) quedan en `crece` + `activo` + sin vencimiento, **antes** de que exista ningún candado: el día que se encienda, a ninguna le cambia nada. Aplicada en el laboratorio el 14-09-2026; en producción **pendiente**, y va **antes** del deploy del motor, igual que la 111, porque el perfil se recuerda una hora y sin las columnas el motor trataría a todos como recién llegados.

**Los 16 derechos.** Los planes son acumulativos: cada uno incluye entero al anterior.

| Derecho | Qué abre | Lo trae |
|---|---|---|
| `base` | Requerimientos, formulario público, cotizador de un día, catálogo, clientes básico, envío por correo, Dashboard nivel 1 y Configuración | Cotiza |
| `varios_dias` | Eventos con fecha de término | Gestiona y Cobra |
| `post_venta` | Plan de pagos, abonos, reembolsos y comprobantes del portal | Gestiona y Cobra |
| `portal` | El portal del cliente | Gestiona y Cobra |
| `clientes_360` | Escribir los tipos de cliente y tener más de un contacto por cliente | Gestiona y Cobra |
| `calendario` | El Calendario | Gestiona y Cobra |
| `dashboard_2` | Ingresos y Caja, y la sección Análisis | Gestiona y Cobra |
| `logistica` | Proveedores, inventario, recetas, costos y compras | Opera y Crece |
| `gestion_y_cocina` | Gestión y Cocina de Post-Venta | Opera y Crece |
| `dashboard_3` | Los márgenes | Opera y Crece |
| `consultas` | El embudo con brochure automático y administrar tipos de evento | Opera y Crece |
| `correos_automaticos` | El seguimiento de los 7 y 14 días | Opera y Crece |
| `encuestas` | Las encuestas de satisfacción | Opera y Crece |
| `movil` | Eventia Móvil | Opera y Crece |
| `personal` | El módulo Personal | `modulos_propios`, ningún plan |
| `marketing` | El módulo Marketing | `modulos_propios`, ningún plan |

Topes de cantidad, que no son derechos de sí o no y por eso se cuentan en el servicio: **Cotiza**, 1 usuario y 20 cotizaciones al mes; **Gestiona y Cobra**, 3 usuarios y cotizaciones sin tope; **Opera y Crece**, sin topes.

Dos de los 16 están declarados pero **todavía no los pregunta nadie**: `gestion_y_cocina` y `dashboard_3`. Hoy los cubre `logistica`, que es de donde salen sus datos — cerrar Logística cierra también el nivel 3 del Dashboard y el margen del cotizador, y así lo dice el comentario de `logistics.controller.ts`.

**Los cuatro estados.**

| Estado | Qué derechos tiene | Por qué |
|---|---|---|
| `prueba` | Los de **Opera y Crece** durante 7 días | Decisión de Felipe: el que prueba todo compra más arriba |
| `activo` | Los de su plan | Pagó |
| `gratis` | Los de su plan, **exactamente los mismos que `activo`** | Cortesía (migración 113, 15-09-2026). Es la propia Valle del Sol, la demo que se le muestra a los interesados, o el cliente al que Felipe decidió regalarle el sistema. Lo que cambia no son los derechos: es que el cobro automático del paso 5 **no la persigue** — no le pide medio de pago, no la pasa a morosa y no la bloquea nunca. Y el reloj de las 11:00 tampoco la toca, porque solo mira las que están en `prueba` |
| `moroso` | Conserva **todo**; solo recibe avisos | Es la gracia. Queda definido pero todavía no lo usa nadie: es para el paso 5 (el cobro) |
| `bloqueado` | **Ninguno**. Solo entra a lo marcado `@SinPlan()` | Terminó la prueba y no pagó. No se le borra ni un dato: cuando active su plan, encuentra todo donde lo dejó |

Lo que una empresa bloqueada sí puede abrir, marcado con `@SinPlan()`: su propio perfil (`GET /users/:id`), la ficha y la edición de su empresa (`GET /companies/:id`, `PATCH /companies`) y la puerta de la pantalla de Planes (`POST /plans/confirmation`, hoy apagada con un 410). **Bajar de plan no borra nada**: los datos quedan, lo que se cierra es la pantalla.

**Las cuatro piezas del motor.**

| Pieza | Qué hace |
|---|---|
| `api-rest/src/auth/derechos.ts` | El corazón: `DERECHOS_POR_PLAN` (la tabla), `derechosDe(empresa)`, `assertDerecho`, `assertCupo` y los textos de los avisos. El 403 lleva un cuerpo fijo `{ codigo: 'SIN_DERECHO' \| 'SIN_CUPO' \| 'PLAN_BLOQUEADO', ... }` que la app reconoce para mostrar "mejora tu plan" en vez de un error rojo; por eso el formato no se cambia sin tocar también la app |
| `api-rest/src/auth/derechos.guard.ts` (antes `modulos-propios.guard.ts`) | El **cuarto** guardián global, después de `AuthGuard`, `ThrottlerGuard` y `RolesGuard`. `@Derecho('x')` de clase cierra todas las rutas del controller, `@Derecho(null)` abre una ruta dentro de un controller cerrado, y una ruta `@Public` no pasa por él |
| `api-rest/src/auth/derechos.service.ts` + `DerechosModule` (`@Global`) | Responde los derechos de una empresa **sin sesión**, con memoria de 5 minutos. Lo usan las puertas públicas (el portal, el formulario público) y los cinco relojes, que solo tienen el `company_id` a mano. Si la empresa no se puede leer, responde como empresa en prueba: un problema de lectura no puede apagarle el portal a un cliente que sí pagó |
| `api-rest/src/auth/auth.guard.ts` | Cuelga de la sesión `derechos`, `usuarios_max`, `cotizaciones_mes`, `plan` y `estado_plan`, calculados **una** vez con la empresa que viene embebida en el perfil. El perfil (`GET /users/:id`) los entrega ya calculados, así que **la app no tiene copia de la tabla de planes**: cambiar lo que trae un plan no obliga a publicar la web de nuevo |

El cargo y el derecho son dos preguntas distintas y las dos tienen que decir que sí: `RolesGuard` responde "¿este cargo puede?" y `DerechosGuard` responde "¿la empresa pagó por esto?".

**Qué controller lleva qué candado.**

| Controller | Derecho | Rutas abiertas a propósito y por qué |
|---|---|---|
| `calendar` | `calendario` | — |
| `payments` | `post_venta` | `GET /payments`: la pide el cotizador para avisar que hay un plan de pagos vivo; en una empresa de Cotiza viene vacía |
| `portal-receipts` | `post_venta` | `GET /portal-receipts`: la cuenta la fila "para actuar hoy" del Dashboard, que está en todos los planes |
| `refunds` | `post_venta` | — |
| `logistics` | `logistica` | — (es el que alimenta los márgenes) |
| `consultas` | `consultas` | — |
| `event-types` | `consultas` | `GET /event-types`: la pide el cotizador en todo plan |
| `customer_satisfaction_survey` | `encuestas` | Sus tres puertas `@Public` no pasan por el guardián (ver divergencias) |
| `movil` | `movil` | — |
| `people` | `personal` | Las 7 de siempre, las que usan Post-Venta y el Dashboard (§5.7) |
| `marketing` | `marketing` | — |
| `analytics` | `dashboard_2` solo en `GET /analytics/complete` | `GET /analytics/dashboard` **no lleva candado**: la misma respuesta sirve a los dos niveles y el servicio devuelve los bloques de caja vacíos si la empresa no tiene `dashboard_2` |
| `clients` | `clientes_360` solo en las **escrituras** de tipos (`POST types`, `DELETE types/:id`, `PATCH types/reorder`) | `GET /clients/types` y `GET /clients/:id/summary` quedan abiertas: medido, el cotizador pide los tipos al montar, y la ficha 360 **es** la pantalla de Clientes, que Cotiza vende |

**Lo que se revisa dentro de los servicios**, porque depende de los datos y la puerta no sabe contar:

| Dónde | Qué revisa | Detalle que importa |
|---|---|---|
| `QuotationsService.create` | El tope de cotizaciones del mes y `varios_dias` | Va **antes** de pedir el número de cotización: ese contador es atómico y no se devuelve, así que un rechazo posterior quemaría un número para siempre |
| `QuotationsService.update` | `varios_dias` otra vez | Solo si el parche **cambia** la fecha de término: quien bajó de plan sigue editando los eventos de varios días que ya tenía |
| `QuotationsService.markEventDone` | `encuestas` | Marcar el evento como realizado lo puede hacer cualquier plan; lo que no sale es el correo al cliente |
| `QuotationsService.createPublic` | `consultas` | Una empresa sin el derecho recibe la **misma** solicitud, pero como requerimiento normal y sin brochure. El formulario público sigue funcionando en todos los planes |
| `QuotationsService`, las tres puertas del portal | `portal` | Acá no hay sesión: la empresa se resuelve desde el token |
| `ClientContactsController.create` | `clientes_360` | Solo al **segundo** contacto: sin una persona a quien mandarle la cotización no se puede vender |
| `UsersService.create` | El tope de usuarios | Se cuenta **antes** de crear nada en Auth, para no dejar una cuenta huérfana sin perfil. Bajar de plan no bloquea a nadie que ya exista: solo impide agregar uno más |

**Los relojes, ahora filtrados.** Detalle en los mapas 16 (todos los relojes) y 12 (los correos).

| Reloj | Exige | Nota |
|---|---|---|
| Seguimiento de los 7 y 14 días | `correos_automaticos` | — |
| Resumen del lunes | Solo `base`, o sea **todos los planes** salvo empresa bloqueada | Decisión de Felipe: es barato y engancha |
| Brochure del embudo | `consultas` | El filtro va **antes** de tomar la fila |
| Cobranza | `post_venta` | — |
| Campañas programadas | `marketing` | El filtro va **antes** de tomar la fila |

En los relojes que "toman" una fila (embudo y campañas) el filtro va antes de tomarla: tomarla y descartarla después la dejaría marcada como despachada sin que hubiera salido nada.

**Reloj nuevo**: `api-rest/src/plans/plan-cron.service.ts`, todos los días a las 11:00, pasa a `bloqueado` toda empresa en `prueba` con `prueba_vence` cumplido, y olvida su memoria para que rija al instante (si no, seguiría entrando hasta cinco minutos más). Todavía **no manda correos**: ese aviso tiene sentido cuando exista el cobro (paso 5) y pueda llevar el enlace para pagar.

**La Torre de Control es por donde Felipe vende a mano** mientras el cobro automático no exista. `PATCH /super-admin/companies/:id` ahora acepta `plan`, `estado_plan` y `prueba_vence` con una clase DTO de verdad (`ActualizarEmpresaDto`, en `api-rest/src/super-admin/dto/actualizar-empresa.dto.ts`), estampa `plan_cambiado_en` y —esto es lo importante— **olvida la memoria de los derechos de la empresa y el perfil de todos sus usuarios**: sin eso, el cliente que acaba de pagar seguiría viendo su plan viejo hasta una hora. De dónde salen esos datos en la pantalla: `GET /super-admin/companies` entrega la fila completa de la empresa (`select('*')`), con plan, estado, vencimiento y módulos propios incluidos, y `GET /super-admin/torre` agrega el campo `empresas` (`TorreEmpresa[]`): una fila por empresa con plan, estado, vencimiento, módulos propios, cuántos usuarios tiene y los dos topes. Los topes los calcula `derechosDe`, **la misma tabla que aplica los candados**, así que la Torre no puede mostrar un plan distinto del que rige de verdad. Medido el 14-09-2026.

**La empresa nueva** nace en `cotiza` + `prueba` con 7 días (`SuperAdminService.createSuscription`).

**Cómo se protege.**

| Archivo | Qué cubre |
|---|---|
| `api-rest/src/auth/tests/derechos.spec.ts` | Los tres planes por los cuatro estados, los bordes del cupo, y una prueba que verifica que Valle del Sol conserva **todo**: los 14 derechos de Opera y Crece más `personal` y `marketing` |
| `api-rest/src/auth/tests/derechos.guard.spec.ts` (renombrada desde `modulos-propios.spec.ts`) | El guardián: público pasa, bloqueado no salvo `@SinPlan`, `@Derecho(null)` abre |
| `api-rest/src/auth/tests/matriz-de-derechos.spec.ts` | Lee los decoradores **reales** de 13 controllers y falla si una ruta queda sin decidir. Hermana de `matriz-de-cargos.spec.ts` (mapa 23) |
| `api-rest/src/quotations/tests/unit/derechos-del-plan.spec.ts` | 15 pruebas de las revisiones que viven dentro de los servicios |

El motor pasa de 505 a **534 pruebas en 76 archivos**, eslint queda en su techo de 19 y el build compila.

**Divergencias anotadas a propósito.**

1. **Las tres puertas públicas de la encuesta** (`GET template`, `GET answered`, `POST answer`) quedan **abiertas**. Si el correo ya salió, cortarle la respuesta al cliente final sería peor que permitir una encuesta de más.
2. **`GET /event-documents` y sus hermanas quedan abiertas**: la ficha del negocio, que es de Cotiza, las usa, y cerrarlas rompería esa pantalla.
3. **El tope de 20 no es a prueba de carreras**: dos cotizaciones creadas en el mismo segundo podrían pasar ambas. Es un tope **comercial**, no un candado de seguridad —nadie ve datos de otra empresa por esto— y está dicho así en el código.
4. **El mes del tope se cuenta en hora de Chile** (`inicioDelMesEnChile`, en `api-rest/src/utils/dates.ts`), no en UTC: una cotización del día 31 a las 22:30 pertenece a ese mes, que es el que el cliente tiene en la cabeza. Es la única cuenta del sistema que no va en UTC, y es a propósito.

**En la app: la otra mitad del candado** (medido el 14-09-2026, el mismo día, rama `pruebas`). Lo que este mapa decía hasta hoy —"el candado vive solo en el motor" y "una empresa de Cotiza ve el menú completo y recibe el 403 al tocar"— **ya no es cierto**: la pantalla también esconde, muestra con candado y ofrece mejorar. Dos cosas que conviene no confundir nunca:

1. **La app NO tiene copia de la tabla de planes.** El motor calcula la lista de derechos de la empresa y la manda ya hecha en el perfil: `company.derechos`, junto con `plan`, `estado_plan`, `prueba_vence`, `usuarios_max` y `cotizaciones_mes` (`frontend/src/types/companies.types.ts`). Mover una función de un plan a otro es tocar `DERECHOS_POR_PLAN` en el motor y nada más: **no obliga a publicar la web de nuevo**. Es la misma razón por la que el código pregunta por el derecho y nunca por el plan.
2. **Todo esto es ayuda visual, no seguridad.** El motor niega igual, con el mismo derecho. La pantalla esconde para no ofrecer lo que no se puede usar, y **muestra con candado** donde ver lo que falta es justamente lo que hace subir de plan.

Lo que la app sabe vive entero en `frontend/src/constants/permissions.ts`: el tipo `Derecho` (los mismos 16), `SECTION_DERECHO` (qué sección del menú pide qué derecho), `tieneDerecho(company, derecho)` —una sección sin derecho pedido siempre pasa—, `estaBloqueada`, `PLAN_MINIMO` (el plan más barato que trae cada derecho; Personal y Marketing van en `null` porque no se venden) y `NOMBRE_DEL_DERECHO` (cómo se le nombra la función al cliente).

**Las cuatro piezas nuevas de la app.**

| Pieza | Para qué sirve |
|---|---|
| `frontend/src/components/MejoraTuPlan.tsx` (85 líneas) | El aviso. Dos variantes: `pantalla`, para una sección entera, y `recuadro`, para una pestaña o un bloque dentro de una pantalla que sí se abre. Dice en qué plan está la función, tranquiliza con que los datos no se pierden ("al cambiar de plan aparece todo donde lo dejaste") y lleva a `/plans`. Para Personal y Marketing **no ofrece mejorar**, porque no se venden: solo avisa que no está disponible |
| `frontend/src/components/SoloConDerecho.tsx` (33 líneas) | Envuelve una pieza de pantalla —una pestaña, un bloque— y la cambia por el recuadro de mejora si falta el derecho. Va **por fuera** por dos razones: así las consultas de esa pieza ni siquiera salen (el motor las negaría con 403 y solo llenarían el registro de errores que nadie mira), y porque un `if` adentro obligaría a devolver antes de los hooks, que es justo lo que el lint prohíbe |
| `frontend/src/pages/services/components/SoloConLogistica.tsx` (18 líneas) | El mismo portero, con el nombre de negocio que se usa en el catálogo: recetas y costos son logística. La mecánica vive en `SoloConDerecho`; acá queda solo el nombre que se entiende leyendo la pantalla |
| `frontend/src/pages/quotations/CampoUltimoDia.tsx` (52 líneas) | El campo "Último día", sacado del cotizador. Se sacó a su propio archivo porque `QuotationForm` está congelado en su tamaño por el portero del kit: quedó en 3.919 líneas, por debajo del techo de 3.936 |

Las protegen `frontend/src/components/MejoraTuPlan.test.tsx` (7 casos; el que más importa es que Personal y Marketing **nunca** muestren el botón de mejorar, porque no se pueden comprar) y `frontend/src/constants/derechos.test.ts` (9 casos, renombrada desde `modulosPropios.test.ts`: incluye que las secciones del plan más barato no lleven candado y que todo derecho del menú tenga su plan definido).

**Dónde quedó cada candado en la app.**

| Dónde | Qué pasa | Por qué así |
|---|---|---|
| `layout/Sidebar.tsx` | Los ítems fuera del plan se muestran **con candado** (icono `Lock`, texto gris, globo "No está incluido en tu plan"), no escondidos. Al pinchar, la pantalla de mejora (salvo Encuestas: ver la costura de más abajo) | Ver lo que uno se está perdiendo es lo que hace subir de plan; esconderlo deja al cliente sin saber que existe. El precalentado por cursor no se dispara en un ítem con candado: descargaría una pantalla que no se va a abrir |
| `components/PermissionGuard.tsx` | La prop `modulo` pasó a llamarse `derecho`, y el aviso "Módulo no disponible" pasó a ser `MejoraTuPlan`. `App.tsx` marca cinco secciones en nueve rutas: `payments` → `post_venta` (2), `logistics` → `logistica` (2), `calendar` → `calendario` (1), `people` → `personal` (2) y `marketing` → `marketing` (2) | El cargo y el derecho siguen siendo dos preguntas distintas: primero "¿tu cargo puede?" y después "¿tu empresa pagó por esto?" |
| Post-Venta (`pages/postventa/PostVentaPage.tsx`) | Las pestañas Gestión y Cocina no aparecen sin `gestion_y_cocina`; si igual se llega (la pestaña venía guardada, o la dirección escrita a mano), sale la invitación en vez del contenido. El precalentado que dispara las consultas de logística al abrir cualquier evento ahora exige `logistica` | No se nombra lo que no se puede abrir, pero tampoco se deja una pantalla en blanco para el que llegó por un camino viejo (mapa 04) |
| Catálogo (`pages/services/`) | Las pestañas Receta y Costo no aparecen sin `logistica`, y su contenido va envuelto en `SoloConLogistica`. Las dos consultas de costos de la lista (`recipeCosts` y `fixedCosts`) quedaron condicionadas con `enabled` | El plan Cotiza vende el catálogo con sus precios; lo que cuesta producirlos es logística y se vende aparte (mapa 05) |
| Cotizador (`pages/quotations/CampoUltimoDia.tsx`) | Un solo cambio: el campo "Último día". Sin `varios_dias` no se muestra; **pero si la cotización ya tiene fecha de término se muestra igual** | Bajar de plan no esconde lo ya vendido. Es la misma regla que el motor aplica en `QuotationsService.update`, que solo revisa el derecho cuando el parche **cambia** la fecha de término (mapa 01) |
| Dashboard (`pages/dashboard/`) | Tres niveles: nivel 1 (la fila HOY y los KPIs) en todos los planes; nivel 2 con `dashboard_2` (Ingresos y Caja, Pipeline y la sección Análisis); nivel 3 con `dashboard_3` **y** `logistica` (la tarjeta Margen del período y las filas de costo y margen). Siete consultas quedaron condicionadas con `enabled` | El nivel 3 exige también `logistica` porque el costo sale de esas consultas: sin ellas el margen se calcularía contra costo cero (mapa 13) |
| Gestión de usuarios (`pages/UserManagementPage.tsx`) | El botón "Crear Usuario" se apaga al llegar al tope del plan, con el texto de cuántos incluye y el enlace a los planes | El motor rechaza igual, pero es mejor decirlo antes de que alguien escriba una cuenta entera. Bajar de plan **no** bloquea a nadie que ya exista: solo impide agregar uno más |
| Clientes (`pages/ClientsPage.tsx`) | El panel "Gestionar tipos…" solo aparece con `clientes_360`. **Leer** los tipos sigue abierto en todos los planes | El cotizador pide la lista de tipos cada vez que se monta: cerrarla rompería la pantalla que Cotiza sí vende (mapa 09) |
| `layout/Layout.tsx` | El banner de la prueba ahora mira `estado_plan === "prueba"` y dice cuántos días quedan; el día del vencimiento dice "termina hoy" | Antes miraba `is_premium`, que **nadie vencía nunca**: una empresa quedaba "en prueba" para siempre. Ahora calza con el reloj de las 11:00 que la bloquea a los 7 días. `is_premium` sigue en la base y se retira cuando ya nadie lo lea |
| `services/api.ts` | El interceptor de respuestas reconoce los códigos `SIN_DERECHO`, `SIN_CUPO` y `PLAN_BLOQUEADO` de un 403 y muestra en un aviso el mensaje que **ya viene escrito del motor**, en vez del error rojo genérico | El mensaje del motor nombra la función y el plan al que hay que subirse; el error genérico no le dice nada a nadie. Por eso el cuerpo fijo del 403 no se cambia sin tocar también la app |
| `services/logistics.service.ts` | `getBaseCatalogo` era la única función de logística sin `try/catch`; ahora devuelve vacío al fallar, como todas sus hermanas | Desde que Logística entra solo con Opera y Crece, esa puerta responde 403 a los planes menores. Sin red, la consulta quedaba en error y el margen del cotizador no se pintaba sin decir por qué; ahora simplemente no hay margen |
| Torre de Control (`pages/superAdmin/Index.tsx`) | Tabla nueva "Planes de cada empresa": plan, estado (con punto de color), vencimiento, usuarios usados/máximo, cotizaciones del mes y módulos propios, con listas del kit (`SelectWithSearch`) para cambiar plan y estado. Al pasar a activo se le saca el vencimiento, porque ya contrató | Es por donde se vende a mano mientras el cobro automático no exista: el cliente paga por transferencia y acá se le deja el plan. El cambio rige en su siguiente clic, porque el motor olvida su memoria al guardar |

**Una costura anotada, medida el 14-09-2026**: `SECTION_DERECHO` tiene **seis** secciones con candado y `App.tsx` marca **cinco**. La que sobra es Encuestas: el menú le pone el candado (`customer_satisfaction_survey` → `encuestas`), pero sus tres rutas nunca tuvieron `PermissionGuard` —les basta la sesión que exige `Layout`, ver el mapa 17 §2.2—, así que al pinchar se abre la pantalla de verdad y lo que se ve es el mensaje del motor que muestra el interceptor de `api.ts`, no la invitación a mejorar. No es un agujero de seguridad: el motor niega igual con el derecho `encuestas`.

**Un hallazgo que vale la pena tener escrito.** En `pages/dashboard/IngresosYCaja.tsx`, sin el derecho de logística las consultas de costo quedan apagadas; la tabla seguía pintando sus filas con costo cero y mostraba **Margen = Ventas y 100 %**. Una cifra falsa es peor que no mostrar nada, y esa en particular es la que el dueño mira. Ahora las filas de costo y margen están marcadas `nivel3` y se filtran, con **una sola** invitación al pie, justo donde la tabla se corta: se ven las ventas del mes y se corta antes de decir cuánto quedó. La misma regla explica que la tarjeta Margen del período desaparezca entera de los KPIs (un aviso de venta entre cinco cifras se lee como un dato roto) y que el análisis de proveedores salga de la lista en vez de quedarse "Cargando análisis…".

**Lo que no se hizo, y está decidido así**: no hay aviso preventivo de "usaste tus 20 cotizaciones del mes" **antes** de empezar a cotizar. El perfil no trae cuántas lleva la empresa en el mes y contarlas en cada carga de pantalla sería caro para un aviso. Hoy el aviso llega **al guardar**, con el mensaje que manda el motor (`SIN_CUPO`) por el interceptor de `api.ts`.

**Los gates del 14-09-2026.** App: 269 pruebas en 23 archivos (antes 262), eslint en 87 que es su techo exacto, portero del kit OK con los siete gigantes por debajo de su techo y build que compila. Motor: 534 pruebas, eslint 19, build ok.

### 5.9 El cobro con Mercado Pago (16-09-2026, sprint B, migración 114)

El diseño completo y las 7 decisiones firmadas viven en
`atlas_pendiente/PLAN_VENTA_AUTOMATICA.md`. Lo esencial:

1. Felipe creó **tres planes** en Mercado Pago (montos CON IVA). El
   motor conoce sus identificadores (variables `MP_PLAN_*`, con los
   reales de respaldo en `mercadopago.service.ts`).
2. `Plans.contratar` → `POST /pagos/suscribir`: el motor pide a
   Mercado Pago la suscripción PROPIA de la empresa
   (`external_reference` = su id) y el navegador viaja al checkout.
   **Un enlace fijo no identifica quién pagó**: por eso jamás se
   publican los enlaces cortos de los planes.
3. El cliente paga y vuelve a `/plans/confirmation`, que pregunta
   `GET /pagos/estado` cada 3 segundos. La verdad NO viene con el
   navegador: llega por `POST /pagos/webhook` (firma HMAC verificada,
   fail-closed), que consulta el estado real en Mercado Pago y recién
   ahí activa: plan + `activo` + `pagado_hasta` + memoria olvidada
   para que rija al instante.
4. La idempotencia vive en la base: `avisos_de_pago` con
   `unique (proveedor, aviso_id)` — el proveedor reenvía cada aviso
   cada 15 minutos hasta ver un 200.
5. Pago rechazado → `moroso` con **7 días de gracia** (decisión 2) y
   correo `PAGO_FALLIDO`. Cancelación → conserva el plan hasta
   `pagado_hasta` (decisión 5; la marca es `pago_suscripcion_id` en
   NULL con el proveedor puesto).
6. El reloj (`plan-cron`, 11:00–11:10) cosecha lo que el webhook no
   alcanzó: canceladas cumplidas → bloqueadas; pago vencido con
   suscripción viva → morosas con gracia; gracia vencida → bloqueadas.
   Además avisa `PRUEBA_POR_VENCER` a los 2 días del vencimiento.
7. **`gratis` no existe para esta máquina**: ni el webhook ni el reloj
   la tocan (Valle del Sol y la demo). Las pruebas
   `pagos/tests/maquina-de-cobros.spec.ts` y
   `plans/tests/reloj-del-cobro.spec.ts` lo juran.
8. **El cambio de plan** (18-09, migración 115, decisión de Felipe del
   17-09 que mejora la decisión 4): desde Mi empresa → Plan, en dos
   tiempos (cotizar y mostrar; confirmar y cambiar). **Subir** rige al
   instante: se cobra hoy el proporcional de la diferencia por los
   días que quedan del mes pagado (mes de 30) con un pago único cuya
   referencia es `cambio:empresa:plan`; su aviso `payment` aplica el
   plan y sube el monto de la suscripción (PUT /preapproval). **Bajar**
   rige al terminar lo pagado: queda en `plan_programado`, el monto de
   la suscripción baja desde ya, y lo aplica el aviso del siguiente
   cobro o el reloj de las 11:10 (paso 0 de la cosecha). Lo jura
   `pagos/tests/cambio-de-plan.spec.ts`. Ojo con el webhook de Mercado
   Pago: el pago único llega por el tema **Pagos**, que hay que tener
   marcado además de "Planes y suscripciones".
9. **Cancelar mi plan** (18-09, términos §9; ley 21.398: dar de baja
   por el mismo medio por el que se contrató, recomendación aceptada
   por Felipe): botón en Mi empresa → Plan con `ConfirmInline`.
   `POST /pagos/cancelar` cancela la suscripción en Mercado Pago y deja
   la marca de "canceló" (suscripción NULL, proveedor puesto,
   `plan_programado` NULL): la empresa conserva todo hasta
   `pagado_hasta` y el reloj de las 11:10 (paso 1) la pausa; nada se
   borra. `GET /pagos/estado` devuelve `suscripcion_viva` y `cancelada`
   para que la pestaña lo diga y esconda los botones de cambio. Una
   morosa también puede cancelar (el paso 3 la pausa al vencer su
   gracia); en prueba no hay botón, la prueba simplemente termina. Lo
   jura `pagos/tests/cancelar-plan.spec.ts`.

Variables en Railway: `MP_ACCESS_TOKEN` y `MP_WEBHOOK_SECRET` (las dos
secretas, las administra Felipe), `MP_PLAN_COTIZA` / `MP_PLAN_GESTIONA`
/ `MP_PLAN_CRECE` (opcionales). Sin el token, `POST /pagos/suscribir`
responde 503 y la pantalla de planes cae con honestidad al WhatsApp.
