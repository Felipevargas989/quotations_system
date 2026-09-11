# Mapa: Acceso, empresa, usuarios, roles y planes

> **Estado: verificado una vez contra el código** (commit 0de0ddb, 11-09-2026). Falta la etapa de completar lo que no quedó escrito. Parte del atlas de docs/arquitectura/mapa; el índice es 00_MAPA_DEL_SISTEMA.md.

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
| `/register` | `RegisterPage` → `NewUserRegisterForm` | `frontend/src/pages/landingPage/RegisterPage.tsx` | Hoy **solo guarda un lead** (`registerLead`). Crear empresa y usuario (`signup`) y el inicio de sesión automático están comentados ("TEMP: Self-service registration is disabled") | público |
| `/admin/users` | `UserManagementPage` | `frontend/src/pages/UserManagementPage.tsx` | Lista de usuarios de la empresa (queryKey `["users"]`). Crear (correo, nombre, contraseña, cargo con `SelectWithSearch`), editar nombre y cargo (el correo no se cambia), eliminar (no a sí mismo). Tarjeta informativa "Permisos por Rol" y conteo por cargo | administrador (`SECTION_ROLES.user_management`). El enlace del menú de usuario usa `canAccess("admin")` |
| `/configuration` | `ConfigurationPage` | `frontend/src/pages/configuration/ConfigurationPage.tsx` | **Todos**: cambiar su contraseña y ver su correo. **Solo administrador** (`esAdministrador`): tarjeta "Notificaciones por Email" con los interruptores de `emailCategories`, la lista informativa `equipoEmails` y "Responder a" | todos (`SECTION_ROLES.configuration`) |
| `/company-configuration` | `CompanyConfiguration` | `frontend/src/pages/configuration/companyConfiguration/CompanyConfiguration.tsx` | Nombre, subtítulo (60 caracteres), WhatsApp, sitio web, Instagram, Facebook, moneda (solo lectura), logo y banner (JPG/PNG/WebP, 5 MB, "Quitar banner"), colores primario y secundario, datos de cobro (6 campos) y umbral de alto valor (`NumberInput`). Guarda y refresca el perfil (`loadUserProfile`) | administrador (`SECTION_ROLES.company_configuration`) |
| `/plans` | `Plans` | `frontend/src/pages/plans/Plans.tsx` | Tarjeta "Eventia Profesional", $10.000 CLP/mes. "Suscribirse Ahora" abre un checkout de Mercado Pago en otra pestaña; enlaces a Calendly y WhatsApp | ruta: todos (`SECTION_ROLES.plans`). Se llega desde el banner de prueba de `Layout` |
| `/plans/confirmation` | `ConfirmationPage` | `frontend/src/pages/plans/ConfirmationPage.tsx` | Al abrirse llama `confirmPlan()` y navega a `/dashboard`. Si falla, un toast fijo | ruta: todos |
| `/superAdminqweasdzxc` | `SuperAdminPage` con `TorreDeControl` | `frontend/src/pages/superAdmin/Index.tsx` | Torre de Control (6 tarjetas y la tabla "Quién ha entrado"), barras mensuales de cotizaciones por empresa (6 meses), "Actividad de Usuarios" (30 días) y lista de empresas. El botón "Crear nueva empresa" está comentado | ruta **fuera** de `Layout` y **sin** `PermissionGuard` ("TODO: add authentication"). La protege el motor con `SUPER_ADMIN_EMAILS` |
| todas las de adentro | `Layout` | `frontend/src/layout/Layout.tsx` | Sin sesión manda a `/login`. Menú de usuario con nombre, cargo, Gestión de Usuarios, Configuración, Configuración de la Compañía y Cerrar Sesión. Banner "período de prueba gratuito de 7 días" si `company.is_premium === false`. Letrero ámbar "LABORATORIO" si `VITE_SUPABASE_URL` es el del laboratorio | cada enlace con `canAccessSection` |
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

Todas las rutas pasan por tres guardias globales, en este orden (`api-rest/src/app.module.ts`): `AuthGuard` (sesión), `ThrottlerGuard` (300 peticiones por minuto por IP) y `RolesGuard` (cargo).

| Método y ruta | Controller y método | Service | Quién lo llama desde la app | Roles o @Public |
|---|---|---|---|---|
| `POST /auth/password/recovery` | `AuthController.requestPasswordRecovery` | `AuthService.requestPasswordRecovery` (Supabase `resetPasswordForEmail` con `SUPABASE_PASSWORD_RECOVERY_REDIRECT_URL`) | `requestPasswordRecovery` (`services/auth.service.ts`) ← `ForgotPasswordPage` | `@Public`, responde 202. Sin `@Throttle` propio |
| `POST /auth/password/reset` | `AuthController.resetPassword` | `AuthService.resetPasswordWithToken` (`auth.getUser(accessToken)` y `auth.admin.updateUserById`) | `resetPasswordWithToken` ← `ResetPasswordPage` | `@Public`. Sin `@Throttle` propio |
| `GET /users` | `UsersController.findAll` | `UsersService.findAll` → `UsersRepository.findAll(companyId)` | `getUsers` (`services/users.service.ts`) ← `UserManagementPage` | solo sesión |
| `GET /users/:id` (id de **Auth**) | `UsersController.findOne` | `UsersService.findOne` → `UsersRepository.findOne` (perfil + 15 columnas de `companies`) | `getUser` ← `AuthContext` (`profileQuery` y `signIn`) | solo sesión. **No filtra por empresa** |
| `POST /users` | `UsersController.create` | `UsersService.create` → `UsersRepository.createAuthUser` (`auth.signUp`) + `UsersRepository.createUser` | `createUser` ← `UserManagementPage.createUser` | `ADMIN_ONLY` |
| `PATCH /users/password` | `UsersController.updatePassword` | `UsersService.updatePassword` → `UsersRepository.updatePassword` (`auth.admin.updateUserById`) | `updatePassword` ← `ConfigurationPage.handleSubmit` | solo sesión (cambia la del propio usuario) |
| `PATCH /users/:id` (id del **perfil**) | `UsersController.update` | `UsersService.update` → `UsersRepository.update` | `updateUser` ← `UserManagementPage.createUser` en modo edición | `ADMIN_ONLY`. No filtra por empresa |
| `DELETE /users/:id` (id del perfil) | `UsersController.remove` | `UsersService.remove` → `UsersRepository.remove` + `UsersRepository.removeAuthUser` | `deleteUser` ← `UserManagementPage.deleteUser` | `ADMIN_ONLY` |
| `POST /users/signup` | `UsersController.signup` | `UsersService.signup` → `SuperAdminService.createSuscription` | `signup` en `services/users.service.ts`; su único llamador (`NewUserRegisterForm.handleSubmit`) está comentado | `@Public`. Sin `@Throttle` propio |
| `GET /companies/public/:id` | `CompaniesController.findOnePublic` | `CompaniesService.findOne`; el controller recorta a 11 campos | `getCompanyPublic` ← `CreateQuotationPublic` (mapa 11); `getCompanyById` (`services/superAdmin.service.tsx`) ← `PublicSurvey` (mapa 14) | `@Public` |
| `GET /companies/:id` | `CompaniesController.findOne` | `CompaniesService.findOne` → `CompaniesRepository.findOne` (`select('*')`) | `getCompany` ← `ConfigurationPage` (queryKey `["company", id]`) | solo sesión. **No compara con la empresa de la sesión** |
| `PATCH /companies` | `CompaniesController.update` | `CompaniesService.update` → `CompaniesRepository.update` (empresa de la sesión) | `updateCompany` (`services/companies.service.ts`) ← `CompanyConfiguration.handleSubmit`, `ConfigurationPage.handleSaveNotifications` | `ADMIN_ONLY` |
| `POST /plans/confirmation` | `PlansController.confirmPlan` | `PlansService.confirmPlan` → `PlansRepository.confirmPlan` (`is_premium = true`) | `confirmPlan` (`services/plans.service.ts`) ← `ConfirmationPage` | solo sesión (**cualquier cargo**) |
| `POST /super-admin/suscription` | `SuperAdminController.createSuscription` | `SuperAdminService.createSuscription` | nadie en la app | `@Public` + `@Throttle` 10 por minuto |
| `POST /super-admin/lead` | `SuperAdminController.registerLead` | `SuperAdminService.registerLead` → `SuperAdminRepository.registerLead` + `alertNuevoLead` | `registerLead` (`services/registerLeads.service.ts`) ← `NewUserRegisterForm.handleSubmit` | `@Public` + `@Throttle` 10 por minuto |
| `GET /super-admin/companies` | `SuperAdminController.listCompanies` | `assertSuperAdmin` + `SuperAdminRepository.listCompanies` | `getAllCompanies` ← `SuperAdminPage.fetchCompanies` | sesión + correo en `SUPER_ADMIN_EMAILS` |
| `POST /super-admin/companies` | `SuperAdminController.createCompany` | `SuperAdminService.createCompanyOnly` → `SuperAdminRepository.createCompanyOnly` + `alertNuevaEmpresa` | `createCompany` ← `SuperAdminPage.handleCreateCompany` (su botón está comentado) | sesión + allowlist |
| `PATCH /super-admin/companies/:id` | `SuperAdminController.updateCompany` | `SuperAdminService.updateCompanyById` → `SuperAdminRepository.updateCompanyById` | `updateCompany` en `services/superAdmin.service.tsx`, sin llamador | sesión + allowlist. Body sin clase DTO |
| `GET /super-admin/stats/last-month` | `SuperAdminController.getStatsLastMonth` | `SuperAdminService.getStatsLastMonth` → `SuperAdminRepository.getStatsLastMonth` + `getUsersLastSignIns` | `getStatsLastMonth` ← `SuperAdminPage.fetchStatsLastMonth` | sesión + allowlist |
| `GET /super-admin/torre` | `SuperAdminController.getTorre` | `SuperAdminService.getTorre` → `SuperAdminRepository.getTorreBase` + `countLeads` (dos veces) | `getTorre` ← `TorreDeControl` (queryKey `["superAdmin", "torre"]`) | sesión + allowlist |

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
| Solo sesión, sin `@Roles` | `people` (**44 rutas**), `clients` (9 de sus 10 rutas — la décima, `GET /clients/types/public/:company_id`, es `@Public` y va en esa fila), `client-contacts` (5), `consultas` (5), `event-types` (4), `calendar` (1), `movil` (5), `storage` (3), `plans` (1); `GET /users`, `GET /users/:id`, `PATCH /users/password`, `GET /companies/:id`; 7 rutas de `quotations` (crear, editar, borrar, listar, conflictos, enviar por correo…); lecturas de `payments` (2: `GET` y `GET transactions`), `portal-receipts` (1), `service-groups` (1), `service-group-collections` (1) y `services` (3: `GET`, `GET used-codes`, `GET fixed-sections`); `GET /customer-satisfaction-survey/answers`; las 5 rutas con allowlist de `super-admin` | varios |
| Cargo revisado a mano, fuera de `RolesGuard` | `QuotationsController.create` (recepción solo crea requerimientos, 28-07) y `QuotationsService.update` (recepción no edita cotizaciones, 12-08); `SuperAdminService.assertSuperAdmin` (por correo, no por cargo) | 01, 15 |
| `@Public` | `auth` (2), `POST /users/signup`, `GET /companies/public/:id`, `POST /super-admin/suscription` y `/lead`, `GET /clients/types/public/:company_id`, `GET /event-types/public/:companyId`, `customer-satisfaction-survey` (`GET template`, `GET answered`, `POST answer`), `marketing` (3: webhook y baja), `portal` (3), `POST /quotations/public/:company_id`, `GET /quotations/imprimir/:token`, `GET /quotations/:id` (lo usa la encuesta pública), `GET /health`, `POST /email-previews` (404 en producción) | 01, 03, 10, 11, 14, 16 |

## 4. Tablas de la base de datos

| Tabla | Qué guarda | Lee o escribe | Migración que la crea o modifica |
|---|---|---|---|
| `user_profiles` | Perfil de cada usuario: `id` (uuid propio, **no** es el id de Auth), `user_id` (FK a `auth.users`, UNIQUE), `email`, `full_name`, `role` (CHECK con los 4 cargos, default `vendedor`), `company_id` (FK a `companies`, NOT NULL), `created_at`, `updated_at` | escribe `UsersRepository.createUser`, `update` y `remove`; lee `UsersRepository.findOne` (guardián y perfil), `UsersRepository.findAll` (gestión y destinatarios de avisos), `SuperAdminRepository.getTorreBase` | `0_initial_models.sql` (foto del esquema, no una migración real); `40_cerrar_acceso_directo.sql` le quita todo a `authenticated` |
| `companies` | La empresa: `name`, `logo_url`, `colors` (jsonb `primary` y `secondary`), `is_premium` (default false), `notifications` (jsonb `emails` + `replyTo`), `currency`, `is_active`, `created_at`; `tagline` y `bank_details`; `high_value_threshold`; `whatsapp`, `instagram`, `facebook`, `sitio_web`; `banner_url` | escribe `CompaniesRepository.update` y `create`, `PlansRepository.confirmPlan` (`is_premium`), `SuperAdminRepository.createCompanyOnly` y `updateCompanyById`; lee `CompaniesRepository.findOne` (correos, envío de cotizaciones, consultas, marketing), `UsersRepository.findOne` (embebida en el perfil), `SuperAdminRepository` (`listCompanies`, `getStatsLastMonth`, `getTorreBase`) | `0_initial_models.sql`; `41_barrida_final_anon.sql` (le quita todo a `anon`); `46_datos_cobro_empresa.sql`; `60_umbral_alto_valor.sql`; `95_contacto_de_marca.sql`; `96_banner_de_correos.sql`. `is_active` no tiene migración numerada: llegó con el commit `c3d0f5d` (04-11-2025) y está en la foto 0 |
| `leads` | Interesados de la landing: `nombre`, `telefono`, `email`, `nombre_empresa`, `personas_empresa`, `ventas_anuales`, `created_at` | escribe `SuperAdminRepository.registerLead`; lee `SuperAdminRepository.countLeads` | `0_initial_models.sql`; `39_leads_solo_por_backend.sql` (cierra el INSERT anónimo) |
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

### 5.5 Alta de una empresa: lead hoy, suscripción dormida

1. `/register` → `NewUserRegisterForm.handleSubmit` → `registerLead` → `POST /super-admin/lead` (`@Public`, 10 por minuto) → `SuperAdminRepository.registerLead` (tabla `leads`) → `void alertNuevoLead` → `EmailService.sendEmail` a `SUPER_ADMIN_EMAILS` con `SUPER_ADMIN_NEW_LEAD`. La respuesta no espera a Resend.
2. Alta completa, hoy sin llamador en la app: `POST /users/signup` o `POST /super-admin/suscription` → `SuperAdminService.createSuscription`: `CompaniesRepository.create` (todas las notificaciones en `true`, `currency`, `is_active: true`; `is_premium` queda en su default `false`) → `UsersService.create` con cargo `administrador` → `CustomerSatisfactionSurveyService.createTemplate` → `void sendEmail(admin_email, NEW_ACCOUNT)` → `void alertNuevaEmpresa` (`SUPER_ADMIN_NEW_COMPANY`).
3. La empresa nueva ve el banner de prueba de 7 días (`Layout`), entra a `/plans`, paga en Mercado Pago (fuera del sistema) y `/plans/confirmation` llama `POST /plans/confirmation` → `PlansRepository.confirmPlan` → `is_premium = true`. Nada vence la prueba.

### 5.6 Torre de Control (super-admin)

1. `/superAdminqweasdzxc` → `TorreDeControl` → `getTorre` → `GET /super-admin/torre` → `AuthGuard` (sesión) → `SuperAdminController.getTorre` → `assertSuperAdmin(user.email)`: compara en minúsculas contra `SUPER_ADMIN_EMAILS` y responde 403 "Solo super-administradores." si no está.
2. `SuperAdminService.getTorre` → en paralelo `SuperAdminRepository.getTorreBase` (`listarTodosLosUsuarios` + `user_profiles` + `companies`) y `countLeads()` + `countLeads(inicio de mes UTC)`. Cruza Auth con perfiles **por correo**, ordena por último inicio de sesión (los que nunca entraron al final) y arma las 6 tarjetas.
3. Al mismo tiempo, `SuperAdminPage` pide `GET /super-admin/companies` y `GET /super-admin/stats/last-month` → `armarStatsMensuales` (6 meses con huecos en 0 y totales de 30 días) + `getUsersLastSignIns`.

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
9. **Si tocas** `GET /users/:id` o `UsersRepository.findOne`, **se afectan** el inicio de sesión y el cargo en toda la app (`AuthContext`, `AuthGuard`). Ojo: no filtra por empresa, así que cualquier sesión que conozca el id de Auth de otra persona puede leer su perfil y la ficha embebida de su empresa, con datos de cobro.
10. **Si tocas** `PATCH /users/:id` o `GET /companies/:id`, cuidado con el aislamiento entre empresas: `UsersRepository.update` filtra solo por `id`, así que un administrador de otra empresa que tenga el UUID podría cambiar nombre y cargo de un usuario ajeno. `CompaniesRepository.findOne` también filtra solo por `id`, y los ids de empresa son correlativos: cualquier sesión puede leer la ficha completa de otra empresa (notificaciones y datos de cobro incluidos).
11. **Si tocas** `/plans/confirmation`, **se afecta** el cobro, **porque** cualquier usuario con sesión y de cualquier cargo que abra esa dirección deja su empresa en `is_premium = true`, sin que nada verifique un pago en Mercado Pago (`ConfirmationPage` y `PlansRepository.confirmPlan`).
12. **Si tocas** las puertas públicas de acceso, **se afecta** la protección contra abuso, **porque** `POST /auth/password/recovery`, `POST /auth/password/reset` y `POST /users/signup` no tienen `@Throttle` propio (solo el global de 300 por minuto). `/users/signup` crea empresa y administrador igual que `/super-admin/suscription`, que sí tiene 10 por minuto.
13. **Si tocas** `PATCH /super-admin/companies/:id`, **se afecta** cualquier columna de `companies`, **porque** el body se declara como tipo TypeScript y no como clase DTO: `ValidationPipe` no lo filtra y `SuperAdminRepository.updateCompanyById` actualiza lo que venga. Hoy lo protege solo la lista de correos.
14. **Si tocas** `ConfigurationPage.handleSaveNotifications` o agregas llaves a `notifications`, **se afecta** la configuración de correos, **porque** `PATCH /companies` reemplaza el JSON entero con `{ emails, replyTo }`. Una llave nueva que esa pantalla no reenvíe se borra. `CompanyConfiguration` manda `notifications: undefined` a propósito para no pisarlo.
15. **Si tocas** `SUPER_ADMIN_EMAILS` en Railway, **se afecta** quién entra a la Torre y quién recibe las alertas de leads y empresas nuevas. Vacía: nadie entra y no sale ninguna alerta, en silencio (prueba "sin SUPER_ADMIN_EMAILS configurado no intenta enviar nada").
16. **Si agregas un cargo**, **se afectan** el CHECK de `user_profiles.role`, `UserRole` del motor, los grupos de `roles.decorator.ts`, `UserRole`, `ROLE_PERMISSIONS`, `ROLE_GROUPS` y `SECTION_ROLES` en `permissions.ts`, el segundo enum en `constants/users.ts` y la lista `roles` de `UserManagementPage` (con colores y la tarjeta informativa).
17. **Si tocas** `createSuscription`, recuerda que no se deshace nada: si falla el usuario, la empresa ya quedó creada. `createCompanyOnly` crea una empresa solo con nombre: sin notificaciones, sin moneda y sin plantilla de encuesta.

## 9. Pruebas que lo protegen

| Archivo | Qué cubre |
|---|---|
| `api-rest/src/auth/tests/roles.guard.spec.ts` | 5 pruebas reales: ruta pública pasa; sin `@Roles` basta sesión; cargo correcto pasa; cargo insuficiente da 403; sin cargo da 403 |
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
- **Planes a medio camino**: precio ($10.000) y enlace de Mercado Pago escritos a fuego en `Plans.tsx`; `is_premium` solo decide el banner; nada vence la "prueba de 7 días"; `companies.is_active` no lo lee nadie (ni `AuthGuard`). `docs/mapa-programacion-planes.md` (24-07) describe 3 planes, columnas `plan`/`subscription_status`, webhook y candado por plan: nada de eso existe en el código.
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
- `docs/migrations/0_initial_models.sql`, `39_leads_solo_por_backend.sql`, `40_cerrar_acceso_directo.sql`, `41_barrida_final_anon.sql`, `42_storage_candado.sql`, `46_datos_cobro_empresa.sql`, `60_umbral_alto_valor.sql`, `95_contacto_de_marca.sql`, `96_banner_de_correos.sql`
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
- `frontend/src/types/users.types.ts`, `frontend/src/types/companies.types.ts`
- `frontend/src/constants/api.routes.ts` — `USERS*`, `COMPANIES`, `PLAN_CONFIRMATION`, `SUPER_ADMIN*`
