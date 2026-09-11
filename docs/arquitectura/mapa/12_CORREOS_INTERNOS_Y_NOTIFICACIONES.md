# Mapa: Correos internos, avisos y notificaciones

> **Estado: verificado una vez contra el código** (commit 0de0ddb, 11-09-2026). Falta la etapa de completar lo que no quedó escrito. Parte del atlas de docs/arquitectura/mapa; el índice es 00_MAPA_DEL_SISTEMA.md.

## 1. Qué hace

Es la oficina de correos del motor. Casi todos los correos automáticos pasan por una sola puerta, `EmailService.sendEmail` (`api-rest/src/email/email.service.ts`): viste el correo con la marca de la empresa, revisa los interruptores que dejó el administrador en **Configuración → Notificaciones** y lo manda por Resend.
- **Al cliente (el mandante)**: acuse de solicitud, cotización enviada, seguimiento a los 7 y 14 días, plan de pagos, pago recibido, cobranza y encuesta. Salen con el nombre de la empresa, su "Responder a" y el botón a su portal. Se apagan uno por uno.
- **Al equipo**: nueva solicitud, comprobante del portal, encuesta respondida, avisos de cuota al administrador, resumen semanal y alertas de la Torre de Control. No tienen interruptor.

Acompaña al evento de punta a punta, desde que llega la solicitud hasta la encuesta. Completan el módulo el push de Eventia Móvil (dormido sin llaves VAPID) y el silenciador del laboratorio (`EMAILS_SILENCED`). Tres correos más (cotización con PDF, brochure del embudo y marketing) salen por Resend directo, sin pasar por esta puerta; se describen en sus mapas.

## 2. Pantallas y rutas de la app

| Ruta de la app | Componente principal | Archivo | Qué hace el usuario ahí | Rol que la ve |
|---|---|---|---|---|
| `/configuration`, tarjeta "Notificaciones por Email" | `ConfigurationPage` | `frontend/src/pages/configuration/ConfigurationPage.tsx`; la lista sale de `frontend/src/pages/configuration/constants.ts` (`emailCategories`, `equipoEmails`) | Marca o desmarca 8 casillas de correos al cliente: 6 en "Para Clientes" y 2 en "Ciclo de cobranza". Ve la lista informativa "Para el equipo — siempre activos" (4 correos), escribe el "Responder a" y aprieta "Guardar" (`handleSaveNotifications`). Abajo se lee "Enviados desde: {empresa} <hola@eventi-app.com>" y el calendario de cobranza | La ruta es para todos los roles (`SECTION_ROLES.configuration`), pero la tarjeta solo se pinta para `administrador` (`esAdministrador` con `ROLE_GROUPS.ADMIN_ONLY`) |
| `/configuration`, resto | `ConfigurationPage` | idem | Cambiar contraseña y ver el correo del usuario (mapa 15) | Todos |
| `/company-configuration` | `CompanyConfiguration` | `frontend/src/pages/configuration/companyConfiguration/CompanyConfiguration.tsx` | Nombre, subtítulo (`tagline`), logo, colores y datos de cobro (`bank_details`). **Es lo que viste los correos**, pero la pantalla es del mapa 15 | `administrador` (`SECTION_ROLES.company_configuration`) |
| Sin pantalla en esta app: Eventia Móvil | `src/lib/push.ts` | En la carpeta hermana `eventia-movil`, **fuera de este repositorio** | Pide permiso de notificaciones, registra el teléfono y manda un push de prueba (mapa 16) | Con sesión |

Se llega a Configuración desde el menú de usuario de `frontend/src/layout/Layout.tsx` (`canAccess("configuration")`).

Los botones de los correos llevan a pantallas de otros mapas: `/requests` (mapa 11), `/customer-satisfaction-survey/answers` y `/customer-satisfaction-survey/:companyId/:quotationId` (mapa 14), y `/portal/:token` (mapa 03).

## 3. Endpoints del motor

**Propios del módulo**

| Método y ruta | Controller y método | Service | Quién lo llama desde la app | Roles o @Public |
|---|---|---|---|---|
| `POST /email-previews` | `EmailPreviewsController.sendPreviews` | `EmailService.sendPreviewBatch` | Nadie en la app (la búsqueda de `email-previews` solo encuentra el módulo). Es herramienta de laboratorio y se llama a mano | `@Public`. En producción responde 404 (`NODE_ENV === 'production'`) |
| `GET /companies/:id` | `CompaniesController.findOne` | `CompaniesService.findOne` | `companies.service.getCompany` ← `ConfigurationPage` (`companyQuery`, clave `["company", id]`) | Con sesión, sin `@Roles` |
| `PATCH /companies` | `CompaniesController.update` | `CompaniesService.update` → `CompaniesRepository.update` | `companies.service.updateCompany(name, logo_url, colors, { emails, replyTo })` ← `ConfigurationPage.handleSaveNotifications` | `@Roles(...ADMIN_ONLY)` |
| `GET /movil/push/clave-publica` | `MovilController.clavePublica` | `MovilService.clavePublica` | App Eventia Móvil (`eventia-movil/src/lib/push.ts`) | Con sesión |
| `POST /movil/push/dispositivos` | `MovilController.registrar` | `MovilService.registrarDispositivo` | idem | Con sesión |
| `POST /movil/push/probar` | `MovilController.probar` | `MovilService.probar` | idem | Con sesión |

**Disparadores** (los endpoints son de otros mapas; aquí solo importa qué correo sueltan)

| Método y ruta | Controller y método | Service | Quién lo llama desde la app | Roles o @Public |
|---|---|---|---|---|
| `POST /quotations/public/:company_id` | `QuotationsController.createPublic` | `QuotationsService.createPublic` → `NEW_PUBLIC_QUOTATION_CLIENT` y `NEW_PUBLIC_QUOTATION_ADMIN` | `createQuotationPublic` ← `CreateQuotationPublic.tsx` (mapa 11) | `@Public` con `@Throttle` 10 por minuto |
| `PATCH /quotations/:id` (paso a `enviada`) | `QuotationsController.update` | `QuotationsService.update` → `QUOTATION_IS_SENT` | `updateQuotation` ← chip de estado de `NegocioPage.cambiarEstado` y tablero (mapa 02) | Sin `@Roles` |
| `POST /quotations/:id/realizado` | `QuotationsController.markEventDone` | `QuotationsService.markEventDone` → `CUSTOMER_SATISFACTION_SURVEY` | `markEventDone` ← `PostVentaPage` (`doMarkDone`, mapa 04) | `OPERATIONS_AND_UP` |
| `POST /portal/:token/comprobante` | `PortalController.submitReceipt` (`api-rest/src/quotations/portal.controller.ts`) | `QuotationsService.submitPortalReceipt` → `PORTAL_RECEIPT_ADMIN` | `PortalPage.enviarComprobante` (mapa 03) | `@Public` con `@Throttle` |
| `POST /payments/plan` | `PaymentsController.createPaymentPlan` | `PaymentsService.createPaymentPlan` → `PAYMENT_PLAN_CREATED` | `createPaymentPlan` ← `QuotationsPage`, `NegocioPage` (mapa 03) | `OPERATIONS_AND_UP` |
| `POST /payments/transactions/overflow` | `PaymentsController.createOverflowPaymentTransaction` | `PaymentsService.createOverflowPaymentTransaction` → un solo `PAYMENT_RECEIVED` | `createOverflowPayment` ← `PostVentaPage` (mapa 03) | `OPERATIONS_AND_UP` |
| `POST /payments/transactions` | `PaymentsController.createPaymentTransaction` | `PaymentsService.createPaymentTransaction` → `createOrUpdatePaymentTransaction` (solo al crear) → `PAYMENT_RECEIVED` | Ninguna pantalla llama a este endpoint (el único `POST` de `paymentTransactions.service.ts` es `createOverflowPayment`, que apunta a `/payments/transactions/overflow`, no a este). La usa por dentro `PortalReceiptsController.confirm` (`POST /portal-receipts/:id/confirmar`, bandeja de `PostVentaPage`) | `OPERATIONS_AND_UP` |
| `POST /customer-satisfaction-survey/answer` | `CustomerSatisfactionSurveyController.createAnswer` (`customer_satisfaction_survey/controller.ts`) | `CustomerSatisfactionSurveyService.createAnswer` → `NEW_ANSWER_CUSTOMER_SATISFACTION_SURVEY` | `createAnswer` ← `PublicSurvey.tsx` (mapa 14) | `@Public` con `@Throttle` |
| `POST /super-admin/lead` | `SuperAdminController.registerLead` | `SuperAdminService.registerLead` → `alertNuevoLead` → `SUPER_ADMIN_NEW_LEAD` | `registerLead` ← `NewUserRegisterForm` (dentro de `RegisterPage`) | `@Public` |
| `POST /super-admin/companies` | `SuperAdminController.createCompany` | `SuperAdminService.createCompanyOnly` → `alertNuevaEmpresa` → `SUPER_ADMIN_NEW_COMPANY` | `createCompany` ← `frontend/src/pages/superAdmin/Index.tsx` | Con sesión + `assertSuperAdmin` (`SUPER_ADMIN_EMAILS`) |
| `POST /super-admin/suscription` y `POST /users/signup` | `SuperAdminController.createSuscription`; `UsersController.signup` → `UsersService.signup` | `SuperAdminService.createSuscription` → `NEW_ACCOUNT` y `SUPER_ADMIN_NEW_COMPANY` | Ninguna: la llamada a `signup` está comentada en `NewUserRegisterForm` | `@Public` (la de `suscription` con `@Throttle`) |

Los relojes (sin endpoint) se describen en la sección 5.3.

## 4. Tablas de la base de datos

| Tabla | Qué guarda | Lee o escribe | Migración que la crea o modifica |
|---|---|---|---|
| `companies` | `notifications` (jsonb): `emails` es un mapa `{ <clave de EmailStructure>: boolean }` y `replyTo` el "Responder a". También `name`, `logo_url`, `colors` (`primary`), `tagline` y `bank_details`, que arman la marca (`EmailService.getBranding`) | `EmailService` lee (`shouldSendEmail`, `getBranding`). Escriben `PATCH /companies` (reemplaza `notifications` entero) y `SuperAdminService.createSuscription` (todo en `true`). `createCompanyOnly` inserta solo `name`, así que `notifications` queda NULL (= todo encendido) | `0_initial_models.sql` (`notifications`, `name`, `logo_url`, `colors`); `46_datos_cobro_empresa.sql` (`tagline`, `bank_details`) |
| `user_profiles` | `email`, `role` y `company_id`: los destinatarios internos son **todos** los `administrador` de la empresa | Lee (`UsersService.findAll` → `UsersRepository.findAll`, sin filtro de activo) | `0_initial_models.sql` (mapa 15) |
| `client_contacts` | El mandante: `name`, `email`, `portal_token` | Lee (`QuotationsRepository.findContactById`, `findContactByName`, `findContactPortalToken`; embebido `mandante` en `PaymentsRepository.findAllPaymentsWithTransactions`) | `34_client_contacts.sql` (crea la tabla), `48_portal_del_mandante.sql` (agrega `portal_token` acá, el vínculo real con `quotations` y el botón del portal), `50_correos_a_personas.sql` (mapa 09). Ojo: `47_portal_token.sql` puso un `portal_token` en `quotations`, no en `client_contacts` — la propia migración 48 dice que esa columna "queda sin uso" |
| `quotations` | `client_contact_id` (a quién escribir), `sent_at` (reloj del seguimiento), `survey_sent_at` (encuesta una vez), `quotation_status`, `event_date`, `event_type` | Lee; escribe `survey_sent_at` (`markEventDone`) y `sent_at` (`update` al pasar a `enviada`) | `26_event_done_survey.sql`, `51_seguimiento_sent_at.sql` (mapas 02 y 04) |
| `payments`, `payment_transactions` | Cuotas (`due_date` tipo `date`, `status`) y abonos | Lee el reloj de cobranza; `updateOverduePayments` escribe `status` | `0_initial_models.sql` (mapa 03) |
| `portal_receipts` | Comprobante subido desde el portal | Lo escribe `submitPortalReceipt` antes del aviso | `49_comprobantes_portal.sql` (mapa 03) |
| `push_devices` | Suscripción Web Push por teléfono: `user_id`, `company_id`, `endpoint` (único), `p256dh`, `auth` | `MovilService` escribe (upsert por `endpoint`), lee y borra las muertas (404/410) | `45_movil_push.sql` (reversa `45_movil_push_reversa.sql`) |
| `notifications` | **Bitácora de avisos push ya empujados**, no correos: `dedupe_key` único, `tipo`, `titulo`, `detalle`, `destino` | `MovilService.cicloAvisos` inserta; si el insert falla, se salta el aviso | `45_movil_push.sql` |
| Tablas de la encuesta, `leads` y `companies` de la Torre | Plantilla y respuestas; interesados | Solo como disparadores | Mapas 14 y 15 |

**No existe tabla de correos enviados** para `EmailService`: la búsqueda en `docs/migrations` no encontró nada. El único rastro es la bitácora pino del motor. Marketing tiene su propio registro (mapa 10).

## 5. Flujos principales

### 5.0 Catálogo: todo lo que el sistema puede enviar

"Bandera" = la clave en `companies.notifications.emails` que se apaga desde Configuración. Todo lo que pasa por `EmailService.sendEmail` se apaga además con `EMAILS_SILENCED=1`.

| Correo (clave y asunto real) | Quién o qué lo dispara | A quién llega | Plantilla o archivo | Bandera que lo apaga | Estado |
|---|---|---|---|---|---|
| `NEW_PUBLIC_QUOTATION_CLIENT`: "Recibimos tu solicitud — {empresa}" | `QuotationsService.createPublic` (formulario público) | El correo escrito en el formulario (`createQuotationPublicDto.email`), no el contacto | `templates/newPublicQuotationCreated/forClient.ts` | `newPublicQuotationClient` aparece en pantalla, **pero no funciona** (riesgo 1) | Vivo |
| `NEW_PUBLIC_QUOTATION_ADMIN`: "Solicitud de cotización recibida desde link público" | `createPublic` | Todos los `administrador` de la empresa | `newPublicQuotationCreated/forAdmin.ts` | Ninguna | Vivo |
| `QUOTATION_IS_SENT`: "Tu cotización de {empresa} está lista — N° {n}" | `QuotationsService.update` cuando el estado pasa a `enviada` por `PATCH`. **No** lo manda el botón "Enviar cotización" (mapa 02) | Mandante vía `resolveRecipient` | `quotationIsSent/quotationIsSent.ts` | `quotationIsSent` | Vivo |
| `QUOTATION_FOLLOW_UP`: toque 1 "¿Pudiste revisar tu cotización? — {empresa}"; toque 2 "Seguimos disponibles para tu evento — {empresa}" | Reloj `QuotationsCronService.sendQuotationFollowUps` (`0 11 * * *`) y la palanca `RUN_FOLLOWUPS_ON_BOOT` | Mandante (`findContactById`) | `quotationFollowUp/template.ts` | `quotationFollowUp` | Vivo (reloj solo en producción) |
| `PAYMENT_PLAN_CREATED`: "Cotización aceptada - Plan de pagos" | `PaymentsService.createPaymentPlan`, si la cotización no estaba `aceptada` | Mandante (`mandanteOf`) | `paymentPlanCreated/paymentPlanCreated.ts` | `paymentPlanCreated` | Vivo |
| `PAYMENT_RECEIVED`: "Pago recibido ✓ — {empresa}" | `createOverflowPaymentTransaction` (uno por registro) y `createOrUpdatePaymentTransaction` al crear (confirmar comprobante del portal). Editar un abono no lo manda | Mandante (`mandanteOf`) | `paymentReceived/paymentReceived.ts` | `paymentReceived` | Vivo |
| `PAYMENT_REMINDER`: "Tu cuota vence pronto — {empresa}" o "Hoy vence tu cuota de $X — {empresa}" | `PaymentsCronService.checkUpcomingOverduePayments` (`EVERY_DAY_AT_11AM`): cuotas `pendiente` con vencimiento en 3 días o hoy | Mandante (embebido `mandante`) | `paymentReminder/paymentReminder.ts` | `paymentReminder` | Vivo; el toque "hoy" es dudoso (riesgo 8) |
| `PAYMENT_REMINDER_ADMIN`: "Recordatorio de Pago Pendiente" | El mismo reloj, una vez por cuota | Administradores | `paymentReminder/paymentReminderAmin.ts` | Ninguna | Vivo |
| `PAYMENT_OVERDUE`: "Cuota pendiente de tu evento — necesitamos regularizarla" | `PaymentsCronService.checkOverduePayments` (`EVERY_DAY_AT_11AM`): cuotas `vencido` que vencieron hace exactamente 7 días | Mandante | `paymentOverdue/paymentOverdue.ts` | `paymentOverdue` | Vivo |
| `PAYMENT_OVERDUE_ADMIN`: "Recordatorio de Pago Vencido" | El mismo reloj | Administradores | `paymentOverdue/paymentOverdueAdmin.ts` | Ninguna | Vivo |
| `CUSTOMER_SATISFACTION_SURVEY`: "¿Cómo estuvo tu evento, {nombre}?" | `QuotationsService.markEventDone`, una sola vez (`survey_sent_at`) | Mandante vía `resolveRecipient` | `customerSatisfactionSurvey/template.ts` | `customerSatisfactionSurvey` | Vivo |
| `NEW_ANSWER_CUSTOMER_SATISFACTION_SURVEY`: "Nueva respuesta de encuesta de satisfacción" | `CustomerSatisfactionSurveyService.createAnswer` | Administradores | `newAnswerCustomerSatisfactionSurvey/template.ts` | Ninguna | Vivo |
| `PORTAL_RECEIPT_ADMIN`: "💸 Comprobante por confirmar — {mandante} · cot. N° {n}" | `QuotationsService.submitPortalReceipt` | Administradores, si hay alguno | `portalReceipt/admin.ts` | Ninguna | Vivo |
| `WEEKLY_DIGEST`: "Tu semana en {empresa}: N eventos · M cotizaciones en curso" | `QuotationsCronService.sendWeeklyDigest` (`0 11 * * 1`), solo si hay algo que contar | Administradores | `weeklyDigest/template.ts` | Ninguna | Vivo (solo producción) |
| `NEW_ACCOUNT`: "Bienvenido a Eventia" | `SuperAdminService.createSuscription` | `admin_email` del registro | `newAccount.ts` | Ninguna | La puerta pública existe, pero ninguna pantalla la llama |
| `SUPER_ADMIN_NEW_LEAD`: "🔔 Nuevo interesado en Eventia: {empresa o nombre}" | `SuperAdminService.registerLead` → `alertNuevoLead` | Lista `SUPER_ADMIN_EMAILS` | `superAdminNewLead.ts` | Ninguna; sin la variable no sale | Vivo |
| `SUPER_ADMIN_NEW_COMPANY`: "🏢 Nueva empresa en Eventia: {nombre}" | `createCompanyOnly` y `createSuscription` → `alertNuevaEmpresa` | Lista `SUPER_ADMIN_EMAILS` | `superAdminNewCompany.ts` | Ninguna | Vivo |
| `SOON_EVENTS`: "Tienes estos eventos en 3 días" | Nadie | — | `soonEvents.ts` (con `baseLayout.ts`) | — | **Muerto** (fusionado en el resumen semanal el 29-07) |
| `QUOTATION_STATUS_CHECK`: "Resumen diario de tus cotizaciones" | Nadie | — | `quotationStatusCheck/template.ts` | — | **Muerto** (idem) |
| `WEEKLY_ANALYTICS`: "Análisis semanal de tus eventos" | Nadie | — | `weekly_analytics/weekly_analytics.ts` | — | **Muerto** |
| 16 muestras `[PRUEBA] …` | `POST /email-previews` → `sendPreviewBatch` | La casilla que se indique | Las mismas plantillas | No pasa por interruptores ni por el silenciador, a propósito | Vivo solo fuera de producción |
| Cotización con PDF adjunto | `EnvioCotizacionService.enviar` (botón "Enviar cotización") | Contacto (`correoDeDestino`) + copia oculta al "Responder a" | `plantillaCampana` + PDF | Ninguna; el silenciador no aplica | Vivo (mapa 02) |
| Brochure del embudo: "{empresa}: valores para tu {tipo}" | `ConsultasCronService.despachar` (cada minuto) → `ConsultasService.enviarBrochure` | Quien consultó | `plantillaCampana` + brochures | Configuración del embudo por tipo; el silenciador no aplica | Vivo (mapa 11) |
| Campañas: prueba, envío, reenvío a no abiertos, programadas | `MarketingService.enviarPrueba`, `enviarCampana`, `reenviarANoAbiertos`; `MarketingCronService.despacharProgramadas` | Audiencias | Mapa 10 | Bajas (mapa 10); el silenciador no aplica | Vivo (mapa 10) |
| Recuperar contraseña | `AuthService` con `supabase.auth.resetPasswordForEmail` | El usuario | Supabase Auth, fuera del motor | — | Vivo (mapa 15) |
| Push: pago vencido, evento en 3 días, solicitud nueva, cotización fría; y el push de prueba | `MovilService.cicloAvisos` (`*/30 * * * *`) y `probar` | Todos los teléfonos de la empresa en `push_devices` | `movil.service.ts` (`avisosDeEmpresa`) | Sin `VAPID_PUBLIC_KEY` y `VAPID_PRIVATE_KEY` el módulo duerme; `dedupe_key` evita repetir | Según el comentario de `movil.service.ts`, dormido en producción (mapa 16) |

### 5.1 La puerta única: qué hace `EmailService.sendEmail`

1. **Silenciador**: si `EMAILS_SILENCED === '1'`, anota "Correo SUPRIMIDO (laboratorio)" con clave y destinatario, y termina.
2. **Interruptor**: solo si la clave está en `EMAILS_SEND_TO_CLIENT` (`email/constants/index.ts`) **y** el 4º argumento (`companyId`) es un número. Entonces `shouldSendEmail` lee la empresa (`CompaniesRepository.findOne`):
   - error de lectura o empresa inexistente → no envía;
   - `notifications.emails` vacío → envía (todo encendido);
   - `emails[clave] === false` → no envía;
   - cualquier otro valor → envía.
3. `new Resend(RESEND_API_KEY)` en cada envío.
4. **Marca**: `brandCompanyId` sale del 4º argumento o, en los `NEW_PUBLIC_QUOTATION_*`, del 3º, convertido con `Number()` porque puede llegar como texto desde la URL pública. Solo para correos al cliente se llama `getBranding`: nombre, `tagline`, logo, color primario, `bank_details` y `replyTo`. Si falla, sale con la marca mínima.
5. **Portal**: si viene `portalToken` y el correo es al cliente, `branding.portalUrl = FRONTEND_URL/portal/<token>`. `brandEmailTemplate` pinta "Ingresar a mi portal", como botón principal o secundario si el correo ya trae el suyo.
6. **`switch` por clave**: asunto, destinatarios (`[to]` o la lista) y HTML. Los internos vivos piden la marca otra vez con `getBranding(companyId)` y usan `correoInternoTemplate`.
7. Si `to` viene vacío (`null` o `undefined`), anota "No email provided" y termina. Un arreglo vacío pasa igual.
8. **Remitente**: los correos al cliente salen como `{empresa} <hola@eventi-app.com>` y los internos como `EMAIL_FROM` (`Eventia <hola@eventi-app.com>`). `replyTo` solo va en los correos al cliente, si la empresa lo configuró.
9. `resend.emails.send`. Si Resend **devuelve** error, se anota "Resend devolvió error para …" y **no se lanza**: quien llamó no se entera.

### 5.2 El administrador apaga un correo o cambia el "Responder a"

1. `/configuration` → `ConfigurationPage` carga la empresa con `getCompany` → `GET /companies/:id` y copia `notifications.emails` y `replyTo` a estado local una vez por empresa (`useEffect` con `company?.id`).
2. Cada casilla se ve marcada salvo que su llave sea `false` (`!== false`). Al tocarla, `handleEmailNotificationChange` escribe `true` o `false` en esa llave.
3. "Guardar" → `handleSaveNotifications` → `updateCompany(company.name, company.logo_url, company.colors, { emails, replyTo: replyTo.trim() || null })` → `PATCH /companies` → `CompaniesController.update` (`ADMIN_ONLY`) → `CompaniesService.update` → `CompaniesRepository.update`, que hace un `.update(dto)` sobre `companies`, filtrado por la empresa del usuario.
4. Validación en el motor: `CreateCompanyDto.notifications` solo tiene `@IsObject` y `@IsOptional` — nada revisa las llaves ni los valores de adentro. El formato del correo en `replyTo` tampoco se revisa.
5. Efecto: el próximo `sendEmail` lee la empresa en vivo (no hay caché) y aplica el cambio. El mismo `replyTo` lo usan también el envío de cotización (`marcaDesdeFila` en `api-rest/src/marketing/marca.ts`), el brochure y marketing.
6. Aviso "Notificaciones guardadas." con `toast.success`. Si falla, el error se muestra en la caja roja de la tarjeta de contraseña (`setError`).

### 5.3 Los relojes de la mañana

Todos corren solo con `NODE_ENV === 'production'` (`ScheduleModule.forRoot({ cronJobs })` en `app.module.ts`). Las horas son del servidor; los comentarios las dan en UTC.

1. **1 AM** — `PaymentsService.updateOverduePayments` → `PaymentsRepository.updateOverduePayments`: las cuotas `pendiente` con `due_date <= ahora` pasan a `vencido` (mapa 03).
2. **11 AM, cobranza** — `PaymentsCronService.checkUpcomingOrOverduePayments(status, días, plantilla)`:
   - `checkUpcomingOverduePayments`: `pendiente` con `due_date` en hoy+3 u hoy (`UPCOMING_OVERDUE_PAYMENTS_DAYS_NOTIFICATION = [3, 0]`);
   - `checkOverduePayments`: `vencido` con `due_date` = hoy−7 (`OVERDUE_PAYMENTS_DAYS_NOTIFICATION = [-7]`);
   - consulta `PaymentsRepository.findAllPaymentsWithTransactions(undefined, …)` **de todas las empresas**, sin filtrar el estado de la cotización;
   - por cada cuota: si el mandante tiene correo, `PAYMENT_REMINDER` o `PAYMENT_OVERDUE` con su portal; si no, "Cobranza sin destinatario" en el log;
   - **siempre** después: `PAYMENT_REMINDER_ADMIN` o `PAYMENT_OVERDUE_ADMIN` a los administradores (`usersService.findAll(company, ADMINISTRADOR)`);
   - un error dentro del ciclo cae al `catch`, que registra y **re-lanza**: las cuotas que faltaban ese día quedan sin aviso.
3. **11:00 UTC, seguimiento** — `QuotationsCronService.sendQuotationFollowUps`:
   - para 7 días (toque 1) y 14 días (toque 2), `QuotationsRepository.findFollowUps` trae las `enviada` cuyo `sent_at` cayó en ese día y cuyo `event_date` es de hoy en adelante, de todas las empresas;
   - mandante con `findContactById`; sin correo, "Seguimiento sin destinatario";
   - `QUOTATION_FOLLOW_UP` con portal y la bandera `quotationFollowUp`;
   - un error corta el resto del ciclo (el `catch` está fuera de los dos bucles), pero no re-lanza.
4. **Lunes 11:00 UTC, "07:00 de Chile (horario de invierno)"** — `sendWeeklyDigest`:
   - junta por empresa los eventos `aceptada` de tipo cotización de lunes a domingo (`findAll` día por día) y cuenta el pipeline (`solicitada`, `enviada`, `en_negociacion`);
   - salta las empresas sin nada que contar o sin administradores;
   - manda `WEEKLY_DIGEST` sin `companyId`: sin marca de la empresa, con el azul Eventia de su propia plantilla.
5. **Palanca `RUN_FOLLOWUPS_ON_BOOT=1`** (31-07): `onApplicationBootstrap` corre el seguimiento una vez al encender, **sin mirar `NODE_ENV`**.

### 5.4 Avisos inmediatos al equipo

1. **Solicitud por link público**: `createPublic` crea el cliente y la cotización `solicitada` y luego, sin esperar (`void`):
   - `NEW_PUBLIC_QUOTATION_CLIENT` al correo del formulario, con el `portal_token` del contacto recién creado;
   - `NEW_PUBLIC_QUOTATION_ADMIN` a los administradores, con la solicitud a la vista: organización, persona, personas, evento, fecha, teléfono, correo, presupuesto y comentario, todo escapado con `limpio`. Botón "Ver la solicitud".
2. **Comprobante del portal**: `submitPortalReceipt` valida el token y la cuota, sube el archivo e inserta en `portal_receipts`. **Después**, con `await` dentro de `try/catch`, manda `PORTAL_RECEIPT_ADMIN` con la marca de la empresa. Si el correo falla, el comprobante queda igual.
3. **Encuesta respondida**: `createAnswer` rechaza una segunda respuesta, guarda y manda `NEW_ANSWER_CUSTOMER_SATISFACTION_SURVEY` a los administradores con cada pregunta y respuesta. Si falla, queda en el log.
4. **Torre de Control**: `registerLead` y `createCompanyOnly` guardan primero y avisan sin esperar (`void this.alertNuevoLead` y `void this.alertNuevaEmpresa`). Esas funciones atrapan su propio error.

### 5.5 Push de Eventia Móvil

1. El teléfono (app `eventia-movil`, fuera del repo) pide `GET /movil/push/clave-publica`, se suscribe con `pushManager.subscribe` y registra `POST /movil/push/dispositivos` → `MovilService.registrarDispositivo` (upsert en `push_devices` por `endpoint`).
2. Cada 30 minutos, `cicloAvisos`:
   - si faltan las llaves, sale (`listo`);
   - lee **todos** los `push_devices` y, por cada empresa con teléfonos, `avisosDeEmpresa` arma 4 reglas:
     - cuota vencida con saldo (`vencido-<cuota>-<fecha>`);
     - evento `aceptada` o `realizada` en los próximos 3 días (`evento-<id>-<fecha>`);
     - requerimiento `solicitada` (`solicitud-<id>`);
     - cotización `enviada` creada hace más de 7 días (`frio-<id>`).
3. Cada aviso se inserta en `notifications`. Si la inserción falla (clave repetida u otro error), se salta. Si entra, se empuja a todos los teléfonos de la empresa con `webPush.sendNotification`. Una suscripción 404 o 410 se borra sola.
4. `POST /movil/push/probar` empuja "Eventia Móvil 🎉" a los teléfonos del propio usuario.

### 5.6 Laboratorio: silenciador y probador

1. En el servidor del lab, `EMAILS_SILENCED=1` hace que ningún correo de `EmailService.sendEmail` salga; solo queda anotado qué habría salido y para quién.
2. `POST /email-previews` con `{ to, company_id, portal_token?, solo? }` → `sendPreviewBatch`:
   - arma 16 muestras con la marca real de la empresa: 10 al cliente (incluidos los dos toques de seguimiento, tres de cobranza y la encuesta), 5 avisos internos y el resumen semanal;
   - las manda una por una a esa casilla con el mismo `replyTo`;
   - con `solo: 'seguimiento'` manda solo los dos toques; con `portal_token` el botón lleva al portal real.
3. El probador **no** pasa por el silenciador ni por los interruptores (comentario de `sendEmail`: "sus muestras van al propio Felipe").

## 6. Reglas de negocio acordadas

### Quién recibe y quién apaga
- **Sin configuración, todo encendido** (decisión de Felipe, 29-07). Antes, una empresa sin configurar tenía mudos todos los correos al cliente "contradiciendo su propio mensaje de log". Evidencia: comentario en `EmailService.shouldSendEmail`, casilla `!== false` en `ConfigurationPage` ("Sin llave = encendido (regla del 29-07)"), commit `7289f91`.
- **Correos a personas y punto** (30-07, regla de Felipe): lo que va al cliente va **solo al mandante**, la persona. Si no tiene correo, no sale nada al cliente y queda en el log. El correo general de la ficha dejó de ser destinatario. Evidencia: comentarios en `PaymentsCronService.checkUpcomingOrOverduePayments` y en `PaymentsService.createPaymentPlan`, `createOverflowPaymentTransaction` y `createOrUpdatePaymentTransaction`; `docs/migrations/50_correos_a_personas.sql`.
- **Los correos al equipo no se apagan**: "solo informan hacia adentro; apagarlos sería esconderse noticias propias" (`frontend/src/pages/configuration/constants.ts`). En el motor, `shouldSendEmail` solo se consulta para `EMAILS_SEND_TO_CLIENT`.
- **La tarjeta de notificaciones es solo del administrador** (12-08): para los demás cargos, "Guardar" terminaba en un 403 (`ConfigurationPage`, `CompaniesController.update` con `ADMIN_ONLY`).
- **Alertas de la Torre a la allowlist del `ConfigService`, "jamás correos escritos a fuego"** (05-08, `SuperAdminService.superAdminRecipients`). Sin `SUPER_ADMIN_EMAILS` no se intenta enviar (`super-admin.service.spec.ts`).

### Cómo se ve y desde dónde sale
- **Punto medio del remitente** (30-07): sale del dominio verificado de Eventia con el **nombre de la empresa** como remitente, y la respuesta del cliente llega a la casilla real de la empresa (`replyTo`). Evidencia: `EmailService.sendEmail`, commit `b249838`.
- **Marca de la empresa en los correos al cliente** (rediseño 29-07, "galería aprobada por Felipe"): cabecera blanca con franja del color primario, logo sin caja, una sola familia de color derivada del primario (`mixWithWhite`, "sin rgba, que Outlook no respeta") y estilos en línea, "Gmail y Outlook no respetan otra cosa". La cobranza usa ámbar como "semáforo universal". Evidencia: `api-rest/src/email/templates/brandLayout.ts`.
- **Botón del portal en todos los correos al cliente con contacto vinculado** (pedido de Felipe, 30-07). Si el correo trae su propio botón, el del portal baja a contorno (`brandEmailTemplate`).
- **Correos internos con la cabecera de la casa** (Felipe, 02-09): banda del color primario, nombre de la empresa (o "Eventia") y el **título del correo como subtítulo**, "en un correo interno lo que sirve es saber qué pasó de un vistazo". Sin portal y con el pie "No respondas a este correo". Nació con el aviso del link público (PR #80), después de que la plantilla genérica llegara a Outlook "como bloque blanco". Evidencia: `correoInternoTemplate`, `newPublicQuotationCreated/forAdmin.ts`, commit `cd2c3f4`.
- **El aviso de solicitud trae los datos a la vista** (Felipe, 01-09: "debería ver cantidad de personas y nombre"); organización y presupuesto se sumaron el 05-09 (`NewPublicQuotationAdminParams`).

### Cuándo y cuántos
- **Plan anti-spam** (29-07): los dos correos diarios al equipo ("eventos en 3 días" y "resumen de cotizaciones") se fusionaron en **un resumen semanal los lunes**, "y solo si hay algo que contar". La cobranza sigue siendo inmediata. Evidencia: comentario de clase en `QuotationsCronService`, `weeklyDigest/types.ts`, commit `1ae1fe3`.
- **Cobranza: máximo 3 avisos por cuota**: 3 días antes, el día del vencimiento y 7 días después, "única insistencia" (`payments/constants/index.ts`, textos de `constants.ts` y `ConfigurationPage`). El primer toque es azul, el del día ámbar y el vencido "firme y respetuoso, con la puerta abierta a conversar" (`paymentReminder.ts`, `paymentOverdue.ts`).
- **Seguimiento comercial** (diseño de Felipe, 30-07): dos toques amables a las `enviada` sin respuesta, **día 7 y día 14 exactos desde `sent_at`**, solo si el evento aún no pasa, al mandante con su portal y apagable por empresa. Después del día 14, silencio. "Puro positivo: nunca se invita al no (corrección de Felipe al copy)". Evidencia: `sendQuotationFollowUps`, `quotationFollowUp/template.ts`, `51_seguimiento_sent_at.sql`.
- **Encuesta: solo al marcar realizado y una sola vez**. Se eliminó el cron que la mandaba "a ciegas 3 días después" (`26_event_done_survey.sql`; detalle en los mapas 04 y 14).
- **Un push por aviso**: `dedupe_key` único, "misma forma que usa la app", y solo para empresas con teléfonos (`movil.service.ts`).

### Robustez y laboratorio
- **Un correo caído nunca rompe el negocio**: "el lead vale más que el correo" (`alertNuevoLead`); "El estado ya quedó realizado; un correo fallido no lo revierte" (`markEventDone`); "si el correo falla, el comprobante queda igual" (`submitPortalReceipt`); "payments were already created" (`PaymentsService`).
- **Los errores de Resend se anotan** (cura 05-08): "Resend DEVUELVE el error en vez de lanzarlo… sin esta bitácora, los envíos caídos morían mudos" (`sendEmail`).
- **Cura de inyección** (revisión 05-08): todo dato del visitante que entra al HTML pasa por `escaparHtml`, y los asuntos con datos del visitante por `sanearAsunto` (sin CR/LF, tope de 120). Evidencia: `templates/utils/index.ts`, `escapar-html.spec.ts`.
- **`RESEND_API_KEY` es variable importante**: "faltó 5 días y el servidor partió igual, fallando después en silencio". Desde entonces, al arrancar se advierte en el log (`api-rest/src/config/validate-env.ts`, `main.ts`).
- **Silenciador de laboratorio** (03-08, pedido de Felipe): vive solo en el servidor del lab; en producción el bloque queda dormido (`sendEmail`, commit `b08cf67`).
- **Probador solo fuera de producción** (29-07) y con el mismo "Responder a" que los correos reales ("pillada de Felipe 30-07: las pruebas iban sin él y respondían a hola@"). Evidencia: `EmailPreviewsController`, `sendPreviewBatch`, commit `ce83bc6`.
- **Palanca de rescate `RUN_FOLLOWUPS_ON_BOOT`** (31-07): nació con el caso de Marcia, cuando la llave de configuración bloqueó el ciclo de las 07:00. "Retirar la variable tras usarla: cada reinicio con ella puesta re-evalúa el día" (`QuotationsCronService.onApplicationBootstrap`).

## 7. Conexiones con otros módulos

### Quién usa este módulo (le pide correos)
- **01 Cotizador**: `QuotationsService.update` a `enviada` → `QUOTATION_IS_SENT`.
- **02 Negocio, envío y seguimiento**: el reloj de seguimiento y el resumen semanal viven en `quotations-cron.service.ts`. El envío con PDF usa el `replyTo` de `companies.notifications` pero **no** esta puerta. `sent_at` lo sella `update`.
- **03 Pagos, reembolsos y portal**: plan, pago recibido, relojes de cobranza, comprobante del portal y botón del portal (`portal_token`).
- **04 Post-Venta**: marcar realizado → encuesta. La bandeja de comprobantes confirma → `PAYMENT_RECEIVED`.
- **11 Consultas y formularios públicos**: `createPublic` → acuse al cliente y aviso interno. El brochure sale por Resend directo con el mismo `replyTo`.
- **14 Encuestas**: la invitación y el aviso de respuesta. El botón lleva a `/customer-satisfaction-survey/:companyId/:quotationId`.
- **15 Acceso, empresa, usuarios y planes**: `createSuscription` (`NEW_ACCOUNT`), la Torre (`SUPER_ADMIN_*`), `SUPER_ADMIN_EMAILS`, `PATCH /companies` y la marca de `CompanyConfiguration`.
- **16 Calendario, app móvil e infraestructura**: `MovilService` y la app `eventia-movil`.

### A quién usa este módulo
- **09 Clientes**: `client_contacts` (mandante, correo, `portal_token`). Sin persona con correo no hay correo al cliente.
- **15**: `CompaniesRepository.findOne` (marca e interruptores) y `UsersService.findAll` (administradores).
- **10 Marketing**: `marcaDesdeFila` (`marketing/marca.ts`) también lee `notifications.replyTo`. `plantillaCampana` viste el envío de cotización y el brochure.
- **19 Despliegue y operación**: `RESEND_API_KEY`, `FRONTEND_URL`, `EMAILS_SILENCED`, `VAPID_*`, `RUN_FOLLOWUPS_ON_BOOT`, `SUPER_ADMIN_EMAILS` y `NODE_ENV`, que enciende los relojes.

### Efectos automáticos
- **Relojes**: 1 AM vencidas; 11 AM cobranza; 11:00 UTC seguimiento; lunes 11:00 UTC resumen; cada 30 min push. En el mapa 11 corre además el embudo, cada minuto.
- **Cascadas de correo**: un solo registro de pago con derrame manda **un** `PAYMENT_RECEIVED`; confirmar un comprobante manda otro. Crear el plan sobre una cotización ya `aceptada` no reenvía el plan.
- **Pantallas afectadas**: el aviso verde de `PostVentaPage.doMarkDone` ("Se envió la encuesta…") depende de `survey_sent`. La bandeja "💸 Comprobantes" de Post-Venta es el destino del aviso del portal. `RequestsPage` es el destino del aviso de solicitud.
- **13 Dashboard**: el resumen semanal duplica, en correo, parte del pipeline que muestra el Dashboard, con su propia cuenta (`sendWeeklyDigest`, sin compartir código con `analytics`).

## 8. Zonas de riesgo: si tocas esto, cuidado con aquello

1. **Si tocas** el interruptor "Recibimos tu solicitud" (`newPublicQuotationClient`) o confías en él, **se afecta** lo que recibe quien llena el formulario, **porque** hoy no apaga nada. `createPublic` llama `sendEmail(email, NEW_PUBLIC_QUOTATION_CLIENT, company_id, undefined, portalToken)`: la empresa viaja en el 3º argumento, y la puerta de `sendEmail` exige `typeof companyId === 'number'` en el **4º**. `shouldSendEmail` nunca se consulta y el correo sale aunque la casilla esté desmarcada. Evidencia: `QuotationsService.createPublic`, bloque "Check if email should be sent" de `EmailService.sendEmail`. Verificado leyendo el código, no probado en vivo.
2. **Si tocas** el orden de los argumentos de `sendEmail` o sus sobrecargas, **se afectan** la marca, el interruptor y los datos del aviso de solicitud, **porque** las posiciones no son homogéneas:
   - en `NEW_PUBLIC_QUOTATION_*` la empresa va en la 3ª posición y la solicitud en la 4ª;
   - en el resto, la empresa va en la 4ª;
   - la empresa puede llegar como texto desde la URL pública.
   Ya costó un arreglo el 29-07 ("La marca del correo carga aunque el companyId llegue como texto", commit `37eea00`). Evidencia: comentarios "herencia histórica" y "paramsAsId" en `sendEmail`.
3. **Si tocas** la encuesta o sus interruptores, **se afecta** que el cliente la reciba alguna vez, **porque** `markEventDone` estampa `survey_sent_at` cuando `sendEmail` termina sin lanzar. Y `sendEmail` termina sin lanzar también cuando no envió nada: la casilla `customerSatisfactionSurvey` está apagada, `EMAILS_SILENCED=1`, o Resend devolvió error. Efecto: la pantalla dice "Se envió la encuesta de satisfacción al cliente.", y como `survey_sent_at` quedó puesto, nunca más se manda. Evidencia: `QuotationsService.markEventDone`, `EmailService.sendEmail`, `PostVentaPage.doMarkDone`. Verificado leyendo el código.
4. **Si falta** `RESEND_API_KEY` (ya pasó 5 días), **se afecta** más que el correo, **porque** `new Resend(undefined)` lanza "Missing API key" (`node_modules/resend`) dentro de `sendEmail`, y ese error viaja distinto según quién llamó:
   - en las llamadas sin esperar (`void this.emailService.sendEmail` en `createPublic`, `update`, `createPaymentPlan`, los dos registros de pago y `createSuscription`) el rechazo escapa del `try/catch`, y `main.ts` no registra ningún manejador de `unhandledRejection`;
   - en los relojes de cobranza y del resumen, el `catch` re-lanza y corta el resto del día;
   - en el seguimiento se corta el ciclo.
   Evidencia: esas funciones y `validate-env.ts`. El efecto real sobre el proceso de Node no está probado.
5. **Si agregas** un correo al cliente y no lo sumas a `EMAILS_SEND_TO_CLIENT`, **se afecta** su cara y su control, **porque** esa lista decide a la vez el interruptor, la marca de la empresa, el botón del portal, el remitente con nombre de la empresa y el `replyTo`. Fuera de la lista sale como "Eventia", sin portal ni "Responder a", y sin poder apagarse. Evidencia: `email/constants/index.ts`, `sendEmail`.
6. **Si renombras** un valor de `EmailStructure` (por ejemplo `'paymentReminder'`), **se afecta** la configuración guardada de cada empresa, **porque** esos textos son las llaves de `companies.notifications.emails`: la empresa que lo había apagado vuelve a recibirlo (sin llave = encendido). El enum además está copiado a mano en `frontend/src/types/notifications.ts` y en `constants.ts`. Evidencia: `api-rest/src/email/types/index.ts`, `company.entity.ts`, `ConfigurationPage`.
7. **Si tocas** el guardado de notificaciones, **se afectan** el "Responder a" y la marca, **porque**:
   - `PATCH /companies` reemplaza `notifications` completo: una pantalla futura que mande solo `emails` borra `replyTo`, que usan también el envío de cotización, el brochure y marketing;
   - `handleSaveNotifications` reenvía `name`, `logo_url` y `colors` tal como se cargaron, así que si alguien cambió el logo en otra pestaña, lo pisa;
   - el motor no valida el formato de `replyTo` (`CreateCompanyDto` solo tiene `@IsObject`) y el `<input type="email">` no está dentro de un `<form>`, así que el navegador tampoco lo valida. Un "Responder a" mal escrito viajaría en cada correo al cliente y como copia oculta del envío de cotización.
   Evidencia: `ConfigurationPage.handleSaveNotifications`, `companies.service.updateCompany`, `CompaniesRepository.update`, `EnvioCotizacionService.enviarDeVerdad`. No se probó si Resend rechaza el envío.
8. **Si tocas** los relojes de cobranza, **se afecta** qué avisos reciben clientes y administradores, **porque**:
   - `findAllPaymentsWithTransactions` no filtra el estado de la cotización, y un evento **anulado** conserva sus cuotas (mapa 04). Por lo leído en el código, sus cuotas `pendiente` o `vencido` siguen recibiendo cobranza;
   - la 1 AM marca `vencido` con `due_date <= ahora`, y `due_date` es `date`: el toque "vence hoy" de las 11 AM busca `pendiente` con `due_date = hoy` y probablemente no encuentra nada (ver también el riesgo del mapa 03);
   - el aviso al administrador dice "Al cliente ya le mandamos su recordatorio automático" aunque el cliente no tenga correo o la casilla esté apagada (comentario: "el aviso admin de abajo va igual").
   Evidencia: `PaymentsRepository.findAllPaymentsWithTransactions` y `updateOverduePayments`, `PaymentsCronService`, `paymentReminderAmin.ts`, `paymentOverdueAdmin.ts`. No probado en vivo.
9. **Si pruebas** en el laboratorio confiando en el silenciador, **se afecta** a clientes reales, **porque**:
   - `EMAILS_SILENCED` solo existe en `EmailService.sendEmail` (la búsqueda no lo encuentra en otro archivo): el envío de cotización con PDF, el brochure del embudo y las campañas de marketing salen de verdad;
   - el probador lo salta a propósito;
   - `RUN_FOLLOWUPS_ON_BOOT=1` corre el seguimiento al encender aunque `NODE_ENV` no sea `production`.
   Evidencia: `EnvioCotizacionService`, `ConsultasService.enviarBrochure`, `MarketingService`, `QuotationsCronService.onApplicationBootstrap`.
10. **Si reinicias** el motor cerca de las 11:00 UTC o dejas puesta `RUN_FOLLOWUPS_ON_BOOT`, **se afectan** los recordatorios, **porque** los relojes buscan fechas **exactas** (hoy+3, hoy, hoy−7; día 7 y día 14) y no hay registro de lo enviado. Un día sin reloj pierde ese toque sin rastro, y una corrida doble lo duplica. Evidencia: `PaymentsCronService`, `sendQuotationFollowUps`, ausencia de tabla de envíos en `docs/migrations`.
11. **Si cambias** roles de usuario, **se afecta** quién recibe los avisos internos, **porque** van a **todos** los `user_profiles` con rol `administrador` de la empresa, sin noción de activo ni de preferencia personal (`UsersRepository.findAll`). `createPublic` y `createAnswer` no revisan si la lista viene vacía: un arreglo vacío pasa el `if (!to)` y termina en error de Resend, solo registrado. Evidencia: `sendEmail`, `QuotationsService.createPublic`, `CustomerSatisfactionSurveyService.createAnswer`.
12. **Si pruebas** los botones de un correo en el laboratorio, **se afecta** producción, **porque** varios enlaces están escritos a fuego a `https://www.eventi-app.com` (encuesta, `/requests`, respuestas, bienvenida), mientras que el botón del portal usa `FRONTEND_URL`. Evidencia: `customerSatisfactionSurvey/template.ts`, `newPublicQuotationCreated/forAdmin.ts`, `newAnswerCustomerSatisfactionSurvey/template.ts`, `newAccount.ts`.
13. **Si tocas** `EmailService.sendEmail`, **se afecta** el portero de tamaño, **porque** `email.service.ts` tiene 916 líneas y ya cuenta en el techo de 27 archivos sobre 800 (`frontend/scripts/portero-kit-de-la-casa.sh`). No está congelado por nombre, pero cada correo nuevo lo engorda: conviene extraer piezas a archivos propios.

## 9. Pruebas que lo protegen

| Archivo | Qué cubre |
|---|---|
| `api-rest/src/email/tests/email.service.spec.ts` | Solo que `EmailService` se construye con sus dependencias mockeadas ("las pruebas de comportamiento se agregan cuando se toque este módulo") |
| `api-rest/src/email/tests/escapar-html.spec.ts` | `escaparHtml` (& < > comillas y apóstrofe; null y undefined) y `sanearAsunto` (CR/LF y tope de 120) |
| `api-rest/src/super-admin/tests/super-admin.service.spec.ts` | `registerLead` y `createCompanyOnly` mandan `SUPER_ADMIN_NEW_LEAD` y `SUPER_ADMIN_NEW_COMPANY` a la allowlist; si Resend falla, el lead y la empresa quedan igual; sin `SUPER_ADMIN_EMAILS` no se intenta enviar |
| `api-rest/src/config/validate-env.spec.ts` | Una variable importante ausente (`RESEND_API_KEY`) se advierte sin detener el arranque |
| `api-rest/src/quotations/tests/unit/envio-cotizacion.service.spec.ts` | Del correo con PDF (mapa 02): copia oculta al "Responder a", sin duplicar si el destino es ese buzón |
| `api-rest/src/consultas/tests/consultas.service.spec.ts` | Del brochure (mapa 11): la espera de 10 minutos y el candado de dueño |

`payments.service.spec.ts`, `quotations.service.spec.ts`, `candado-evento-realizado.spec.ts` y `customer_satisfaction_survey.service.spec.ts` inyectan `EmailService` vacío o mockeado, pero no afirman nada sobre correos. En `quotations.service.spec.ts` el `sendEmail: jest.fn()` está comentado.

**Lo importante que NO está cubierto** (la búsqueda en las pruebas no encontró nada):
- `shouldSendEmail`: todo encendido sin configuración, `false` apaga, empresa inexistente o con error no envía.
- El silenciador `EMAILS_SILENCED`, el remitente con nombre de la empresa, el `replyTo` y el botón del portal.
- Las posiciones de argumentos por sobrecarga: una prueba habría pillado el riesgo 1.
- `PaymentsCronService`: fechas objetivo, mandante sin correo, aviso al administrador y eventos anulados.
- `sendQuotationFollowUps`, `sendWeeklyDigest` y `RUN_FOLLOWUPS_ON_BOOT`.
- Los correos de `createPublic`, `update` a `enviada`, `createPaymentPlan`, `PAYMENT_RECEIVED`, `submitPortalReceipt` y `createAnswer`.
- `markEventDone` y el sello de `survey_sent_at` cuando no salió nada.
- `EmailPreviewsController` y su 404 en producción.
- `MovilService` completo: `cicloAvisos`, dedupe y limpieza de suscripciones muertas.
- Las plantillas (ninguna prueba de render) y `ConfigurationPage`, porque la app no tiene pruebas de componentes.

## 10. Deuda y rarezas conocidas

### Tamaño y forma
- `email.service.ts` tiene 916 líneas: 17 sobrecargas de `sendEmail` (18 firmas si se cuenta la implementación), un `switch` y `params?: any` con `eslint-disable`. Cuenta en el techo de archivos sobre 800.
- La marca de la empresa se lee hasta **tres veces** por correo (`shouldSendEmail`, `getBranding` y otra vez `getBranding` en los internos), y se crea un `new Resend()` por envío.
- `MovilService` habla con Supabase directo, sin repository, rompiendo las 4 capas. Además `registrarDispositivo` hace upsert por `endpoint`, así que un mismo teléfono cambia de usuario o empresa si otro se registra con él.
- `analytics.module.ts` importa `EmailModule` sin usarlo (en `api-rest/src/analytics` no aparece `EmailService`).

### Código muerto
- `SOON_EVENTS` (`soonEvents.ts`), `QUOTATION_STATUS_CHECK` (`quotationStatusCheck/`) y `WEEKLY_ANALYTICS` (`weekly_analytics/`) no tienen disparador. Con ellos queda muerto `templates/baseLayout.ts`, que solo usan esas tres plantillas y que trae estilos en `<style>` que Outlook descarta ("llegaba a medio vestir", comentario de `newAccount.ts`).
- En `EMAIL_SUBJECTS` casi la mitad de los asuntos no se usan, porque el `switch` los arma en vivo: `NEW_PUBLIC_QUOTATION_CLIENT`, `PAYMENT_REMINDER`, `PAYMENT_OVERDUE`, `QUOTATION_IS_SENT`, `PAYMENT_RECEIVED`, `CUSTOMER_SATISFACTION_SURVEY`, `WEEKLY_DIGEST` y `PORTAL_RECEIPT_ADMIN`.
- `NEW_ACCOUNT` solo se alcanza por dos puertas `@Public` sin pantalla (`POST /users/signup`, `POST /super-admin/suscription`); el `signup` está comentado en `NewUserRegisterForm` (mapa 15).
- `SUPER_ADMIN_NOTIFICATION` se jubiló el 05-08 junto con la puerta `POST /super-admin/new-lead`, y solo queda el comentario (`types/index.ts`).

### Duplicaciones
- El enum `EmailStructure` está copiado a mano en `frontend/src/types/notifications.ts`, incompleto (sin los avisos admin, `PORTAL_RECEIPT_ADMIN`, `WEEKLY_DIGEST` ni `SUPER_ADMIN_*`) y con los muertos `SOON_EVENTS` y `WEEKLY_ANALYTICS`.
- Dos escapes distintos:
  - `limpio` (solo `<` y `>`) en `forAdmin.ts` y `newAnswerCustomerSatisfactionSurvey/template.ts`;
  - `escaparHtml` (completo) en los de la Torre;
  - las plantillas al cliente y `portalReceipt/admin.ts` interpolan nombres de contacto sin escapar, y esos nombres pueden venir del formulario público.
- `hola@eventi-app.com` está escrito a fuego en `EMAIL_FROM`, `sendEmail`, `sendPreviewBatch`, `EnvioCotizacionService`, `ConsultasService`, `MovilService` (`VAPID_SUBJECT` por defecto) y marketing.
- Tres reglas distintas de "a quién escribirle":
  - `resolveRecipient`, con respaldo por nombre (enviada y encuesta);
  - `mandanteOf` / `findContactById`, solo el vínculo (plan, pago, seguimiento);
  - el embebido `mandante`, en la cobranza.
  Además está `correoDeDestino` del envío con PDF (mapa 02).
- El push "cotización fría" mide 7 días desde `created_at`; el correo de seguimiento, desde `sent_at`.

### Textos que no calzan con el código
- `constants.ts` dice "7 al cliente", pero la pantalla muestra 8 casillas (6 más 2 de cobranza).
- "Resumen semanal — Lunes 11:00" en pantalla es 11:00 **UTC**; el propio cron dice "07:00 de Chile (horario de invierno)".
- La lista "Para el equipo — siempre activos" muestra 4 correos y omite los avisos de cuota por vencer y vencida al administrador.
- `weeklyDigest/template.ts` es el único correo interno vivo que no usa `correoInternoTemplate`: sale siempre con el azul de Eventia y sin la marca de la empresa.
- `sendPreviewBatch` no revisa el `error` que devuelve Resend en cada muestra.
- `.env.example` y la lista de variables de `CLAUDE.md` no nombran `EMAILS_SILENCED`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` ni `RUN_FOLLOWUPS_ON_BOOT`.
- En `QuotationsCronService`, `onApplicationBootstrap` está declarado antes del constructor.

## 11. Contradicciones entre documento y código

1. **Dónde viven los relojes.**
   - Documento: `CLAUDE.md` (sección Backend, "Cron") dice "Scheduled jobs live in `*-cron.service.ts` (e.g. `quotations-cron.service.ts`, `analyitics-cront.service.ts`)".
   - Código: no existe ningún archivo `analyitics-cront.service.ts` (la búsqueda con `find` en `api-rest/src` no devuelve nada). Hay relojes fuera de un `*-cron.service.ts`: `PaymentsService.updateOverduePayments` (`EVERY_DAY_AT_1AM`) y `MovilService.cicloAvisos` (`*/30 * * * *`).
2. **Un solo canal de correo.**
   - Documento: `CLAUDE.md` presenta el correo como "**Email**: `EmailModule` uses Resend (`RESEND_API_KEY`)".
   - Código: además de `EmailModule`, instancian Resend directo `EnvioCotizacionService.enviarDeVerdad`, `ConsultasService.enviarBrochure` y `MarketingService` (`enviarPrueba`, `enviarCampana`, `reenviarANoAbiertos`). Esos correos no respetan los interruptores de `companies.notifications.emails` ni el silenciador `EMAILS_SILENCED`. Los documentos 11, 12 y 13 sí describen su propio envío por Resend; la contradicción es solo con `CLAUDE.md`.

## 12. Preguntas abiertas

1. ¿El interruptor "Recibimos tu solicitud" debe funcionar? Hoy no apaga nada (riesgo 1). Arreglarlo cambia lo que reciben los interesados de las empresas que lo tengan desmarcado.
2. ¿`survey_sent_at` debe sellarse cuando la encuesta está apagada, silenciada o Resend falló? Hoy se sella y la encuesta no sale nunca más (riesgo 3).
3. ¿Los eventos anulados deben seguir recibiendo cobranza automática? El código no los excluye (riesgo 8, y pregunta 5 del mapa 04).
4. ¿Sale alguna vez el toque "Hoy vence tu cuota"? Se puede confirmar buscando ese asunto en la bitácora de producción (riesgo 8 y mapa 03).
5. ¿Tiene producción las llaves VAPID? El comentario del 29-07 dice que no, pero la configuración de Railway no se ve desde el código.
6. ¿Qué hace el proceso de Node del motor en Railway ante un rechazo de promesa sin manejar (riesgo 4)? Depende de la versión y de sus opciones de arranque; no se pudo verificar.
7. ¿Resend rechaza un `replyTo` mal escrito o lo ignora (riesgo 7)?
8. ¿El aviso de cuota al administrador debería salir, o cambiar su texto, cuando al cliente no se le mandó nada?
9. ¿La lista "Para el equipo" de la pantalla debería incluir los avisos de cuota al administrador?
10. ¿Se jubilan los tres correos muertos y `baseLayout.ts`, o se piensa revivir alguno con el molde `correoInternoTemplate`?
11. ¿`supabase.auth.signUp` (`UsersRepository.createAuthUser`) manda un correo de confirmación de Supabase? Depende de la configuración del proyecto Supabase, no del código.
12. ¿El laboratorio corre hoy con `EMAILS_SILENCED=1`? No se ve desde el código.
13. ¿Debe el resumen semanal llevar la marca de la empresa, como el resto de los internos desde el 02-09?

## 13. Archivos clave

**Motor**
- `api-rest/src/email/email.service.ts`: `sendEmail` (sobrecargas, silenciador, interruptor, marca, portal, `switch`, remitente, `replyTo`), `shouldSendEmail`, `getBranding`, `sendPreviewBatch`
- `api-rest/src/email/email-previews.controller.ts`: `EmailPreviewsController`, `SendEmailPreviewsDto`
- `api-rest/src/email/email.module.ts`
- `api-rest/src/email/types/index.ts`: `EmailStructure`
- `api-rest/src/email/constants/index.ts`: `EMAIL_SUBJECTS`, `EMAILS_SEND_TO_CLIENT`, `EMAIL_FROM`
- `api-rest/src/email/templates/brandLayout.ts`: `brandEmailTemplate`, `correoInternoTemplate`, `EmailBranding`, `cifraBox`, `datosCobroPanel`, `mixWithWhite`
- `api-rest/src/email/templates/utils/index.ts`: `escaparHtml`, `sanearAsunto`, `formatCurrency`, `formatDate`
- Plantillas vivas: `templates/newPublicQuotationCreated/`, `quotationIsSent/`, `quotationFollowUp/`, `paymentPlanCreated/`, `paymentReceived/`, `paymentReminder/`, `paymentOverdue/`, `customerSatisfactionSurvey/`, `newAnswerCustomerSatisfactionSurvey/`, `portalReceipt/admin.ts`, `weeklyDigest/`, `newAccount.ts`, `superAdminNewLead.ts`, `superAdminNewCompany.ts`
- Plantillas muertas: `templates/soonEvents.ts`, `quotationStatusCheck/`, `weekly_analytics/`, `baseLayout.ts`
- `api-rest/src/payments/payments-cron.service.ts`: `checkUpcomingOrOverduePayments`, `checkUpcomingOverduePayments`, `checkOverduePayments`
- `api-rest/src/payments/constants/index.ts`: `UPCOMING_OVERDUE_PAYMENTS_DAYS_NOTIFICATION`, `OVERDUE_PAYMENTS_DAYS_NOTIFICATION`
- `api-rest/src/payments/payments.service.ts`: `createPaymentPlan`, `createOverflowPaymentTransaction`, `createOrUpdatePaymentTransaction`, `updateOverduePayments`
- `api-rest/src/quotations/quotations-cron.service.ts`: `sendQuotationFollowUps`, `sendWeeklyDigest`, `onApplicationBootstrap`
- `api-rest/src/quotations/quotations.service.ts`: `createPublic`, `update` (paso a `enviada`), `markEventDone`, `submitPortalReceipt`, `resolveRecipient`, `mandanteOf`
- `api-rest/src/quotations/quotations.repository.ts`: `findFollowUps`, `findContactById`, `findContactPortalToken`
- `api-rest/src/customer_satisfaction_survey/service.ts`: `createAnswer`
- `api-rest/src/super-admin/super-admin.service.ts`: `createSuscription`, `registerLead`, `createCompanyOnly`, `alertNuevoLead`, `alertNuevaEmpresa`, `superAdminRecipients`
- `api-rest/src/companies/companies.controller.ts`, `companies.service.ts`, `companies.repository.ts`, `entities/company.entity.ts` (`notifications`), `dto/create-company.dto.ts`
- `api-rest/src/users/users.repository.ts`: `findAll` (destinatarios administradores)
- `api-rest/src/movil/movil.service.ts`, `movil.controller.ts`, `movil.module.ts`
- `api-rest/src/config/validate-env.ts`, `api-rest/src/app.module.ts` (`ScheduleModule`)
- Correos fuera de esta puerta: `api-rest/src/quotations/envio-cotizacion.service.ts` (mapa 02), `api-rest/src/consultas/consultas.service.ts` (mapa 11), `api-rest/src/marketing/marketing.service.ts` y `marca.ts` (mapa 10)
- Pruebas: `api-rest/src/email/tests/email.service.spec.ts`, `api-rest/src/email/tests/escapar-html.spec.ts`, `api-rest/src/super-admin/tests/super-admin.service.spec.ts`, `api-rest/src/config/validate-env.spec.ts`
- Migraciones: `docs/migrations/0_initial_models.sql`, `26_event_done_survey.sql`, `45_movil_push.sql`, `46_datos_cobro_empresa.sql`, `50_correos_a_personas.sql`, `51_seguimiento_sent_at.sql`

**App**
- `frontend/src/pages/configuration/ConfigurationPage.tsx`: tarjeta "Notificaciones por Email", `handleSaveNotifications`
- `frontend/src/pages/configuration/constants.ts`: `emailCategories`, `equipoEmails`
- `frontend/src/pages/configuration/types.ts`: `EmailCategory`
- `frontend/src/types/notifications.ts`: copia del enum `EmailStructure`
- `frontend/src/types/companies.types.ts`: `Company.notifications`
- `frontend/src/services/companies.service.ts`: `getCompany`, `updateCompany`
- `frontend/src/pages/configuration/companyConfiguration/CompanyConfiguration.tsx`: la marca que visten los correos (mapa 15)
- `frontend/src/App.tsx` (ruta `configuration`), `frontend/src/constants/permissions.ts` (`SECTION_ROLES.configuration`), `frontend/src/layout/Layout.tsx` (enlace del menú)
- Fuera del repo: `eventia-movil/src/lib/push.ts` (suscripción push, mapa 16)
