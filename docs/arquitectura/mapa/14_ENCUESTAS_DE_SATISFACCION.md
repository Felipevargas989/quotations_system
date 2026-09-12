# Mapa: Encuestas de satisfacción

> **Estado: verificado una vez contra el código** (commit bd6a0e1, 11-09-2026), actualizado el 11-09-2026 con las migraciones 107-109 y el estado del sprint 1. Parte del atlas de docs/arquitectura/mapa; el índice es 00_MAPA_DEL_SISTEMA.md.

## 1. Qué hace

Es la última conversación con el cliente, cuando el evento ya pasó. Cuando operaciones o administración marca un evento como **realizado** en Post-Venta, el motor le manda **un solo correo** al mandante con un enlace a una página pública. Ahí el cliente contesta 5 preguntas: tres de escala del 1 al 5 (organización, atención del personal y comida), una de sí o no ("¿nos recomendarías?") y una de texto libre, que es opcional.

Cada cotización acepta **una sola respuesta**. Cuando llega, los administradores de la empresa reciben un aviso interno con lo que contestó el cliente. El administrador revisa las respuestas una por una en el menú "Encuestas de Satisfacción" (pestañas Plantilla y Respuestas). La ficha 360 del cliente muestra un promedio de satisfacción, y el portal del cliente muestra "Encuesta pendiente" o "Encuesta respondida".

La "plantilla" no se edita: las 5 preguntas están escritas en el código (`CUSTOMER_SATISFACTION_SURVEY_QUESTIONS`) y se copian a la empresa cuando se crea por el camino de suscripción.

## 2. Pantallas y rutas de la app

| Ruta de la app | Componente principal | Archivo | Qué hace el usuario ahí | Rol que la ve |
|---|---|---|---|---|
| `/customer-satisfaction-survey` | `CustomerSatisfactionSurveysPage` | `frontend/src/pages/customerSatisfactionSurveys/index.tsx` | Nada: redirige de inmediato a `/customer-satisfaction-survey/template` (`navigate(..., { replace: true })`) | En el menú, solo `administrador` (`Sidebar`, sección `customer_satisfaction_survey` = `ADMIN_ONLY`). **La ruta no tiene `PermissionGuard`** |
| `/customer-satisfaction-survey/template` | `TemplateView` | `frontend/src/pages/customerSatisfactionSurveys/components/TemplateView.tsx` | Pestaña "Plantilla": ve las preguntas de su empresa con su tipo ("Escala numérica", "Sí/No", "Texto libre") y sus opciones. Solo lectura: no hay botón para crear ni editar | Igual que arriba: menú de admin, ruta sin guardia |
| `/customer-satisfaction-survey/answers` | `AnswersView` | `frontend/src/pages/customerSatisfactionSurveys/components/AnswersView.tsx` | Pestaña "Respuestas": elige una cotización con `SelectWithSearch` ("número - cliente (fecha)"), avanza o retrocede, ve cada respuesta junto a su pregunta, y con "Ver Cotización" abre `/quotation-form/:id` en otra pestaña | Igual que arriba |
| `/customer-satisfaction-survey/:companyId/:quotationId` | `CustomerSatisfactionSurveyPublicPage` | `frontend/src/pages/customerSatisfactionSurveys/PublicSurvey.tsx` | Página **pública**: logo, nombre y colores de la empresa; N° de cotización, tipo y fecha del evento; las 5 preguntas y "Enviar Encuesta". Si ya fue respondida, muestra "¡Gracias!" | Cliente sin sesión, que llega por el correo o por el portal |

Pantallas de otros mapas que tocan este módulo:

| Ruta | Componente | Qué toca de este módulo | Mapa |
|---|---|---|---|
| `/post-venta` | `PostVentaPage` (`doMarkDone`, `doUnmarkDone`) | Pregunta "¿Marcar como realizado? Se enviará la encuesta al contacto de la cotización." y aviso con el resultado del envío | 04 |
| `/portal/:token` | `PortalPage` | Chip "! Encuesta pendiente — cuéntanos cómo estuvo" (enlace a la página pública) o "✓ Encuesta respondida" | 03 |
| `/clients/:id` | `ClientDetailPage` | Indicador "Satisfacción" (`x/5`) y "N encuestas" | 09 |
| `/configuration` | `ConfigurationPage` (`emailCategories` y `equipoEmails` en `pages/configuration/constants.ts`) | Interruptor del correo al cliente "Encuesta". "Respuesta de encuesta" aparece como correo del equipo, siempre activo | 12 |
| `/` | `LandingPage` | Solo texto comercial ("Encuestas post-evento") | — |

Nota: la pieza de la casa `components/Estrellas` **no se usa en este módulo**. La importan solo las pantallas de Personas (`EvaluacionesDePersona`, `FichasTab`, `PersonaFichaPage`, `PersonasPage`; mapas 07, 08 y 17). La satisfacción del cliente se muestra como número.

## 3. Endpoints del motor

Controller `CustomerSatisfactionSurveyController` (`@Controller('customer-satisfaction-survey')`):

| Método y ruta | Controller y método | Service | Quién lo llama desde la app | Roles o @Public |
|---|---|---|---|---|
| `POST /customer-satisfaction-survey/template?companyId=` | `createTemplate` | `CustomerSatisfactionSurveyService.createTemplate` → `CustomerSatisfactionSurveyRepository.createTemplate` | **Nadie** (cerrado el 28-07 porque no tenía llamador) | `@Roles(...ADMIN_ONLY)` |
| `GET /customer-satisfaction-survey/template?companyId=` | `getTemplate` | `getTemplate` → `repository.getTemplate` (`.single()`) | `getTemplate` de `services/customerSatisfactionSurveys.service.ts`, usado por `PublicSurvey`, `TemplateView` y `AnswersView` | `@Public()` |
| `GET /customer-satisfaction-survey/answered?quotationId=` | `answered` | `hasAnswer` → `repository.hasAnswer` | `isSurveyAnswered` en `PublicSurvey` | `@Public()` |
| `POST /customer-satisfaction-survey/answer` | `createAnswer` (body `CreateAnswerDto`) | `createAnswer` | `createAnswer` en `PublicSurvey.handleSubmit` | `@Public()` + `@Throttle` de 10 por minuto |
| `GET /customer-satisfaction-survey/answers` | `findAllAnswersFromCompany` | `findAllAnswersFromCompany(user.company_id)` | `findAllAnswersFromCompany` en `AnswersView` | Con sesión, **sin `@Roles`** |

Endpoints de otros módulos de los que depende la encuesta:

| Método y ruta | Controller y método | Service | Quién lo llama | Roles o @Public | Mapa |
|---|---|---|---|---|---|
| `POST /quotations/:id/realizado` | `QuotationsController.markEventDone` | `QuotationsService.markEventDone` (+ `resolveRecipient`, `EmailService.sendEmail`) | `markEventDone` de `frontend/src/services/quotations.service.ts`, desde `PostVentaPage` | `@Roles(...OPERATIONS_AND_UP)` | 04 |
| `POST /quotations/:id/volver-a-pendiente` | `QuotationsController.unmarkEventDone` | `QuotationsService.unmarkEventDone` | `unmarkEventDone`, desde `PostVentaPage` | `@Roles(...ADMIN_ONLY)` | 04 |
| `GET /quotations/:id` | `QuotationsController.findOne` | `QuotationsService.findOne` → `QuotationsRepository.findOne` | `getQuotationById` en `PublicSurvey` (además del cotizador) | `@Public()`, con un TODO: "maybe create public endpoint for this" | 01 |
| `GET /companies/public/:id` | `CompaniesController.findOnePublic` | `CompaniesService.findOne` | `getCompanyById` (`services/superAdmin.service.tsx`) → `getCompanyPublic` (`services/companies.service.ts`) | `@Public()` | 15 |
| `GET /portal/:token` | `portal.controller.ts` | `QuotationsService.getPortalData` (usa `QuotationsRepository.answeredSurveys`) | `PortalPage` | `@Public()` | 03 |
| `GET /clients/:id/summary` | `ClientsController.findSummary` | `ClientsRepository.findSummary` | `ClientDetailPage` | Con sesión | 09 |
| `POST /users/signup` y `POST /super-admin/suscription` | `UsersController.signup`, `SuperAdminController.createSuscription` | `SuperAdminService.createSuscription` → `createTemplate` | **Nadie**: el registro está desactivado en `NewUserRegisterForm` ("TEMP: registration disabled") | `@Public()` (suscripción con `@Throttle` 10/min) | 15 |
| `POST /email-previews` | `EmailPreviewsController.sendPreviews` | `EmailService.sendPreviewBatch` (trae muestras de los dos correos de encuesta) | Herramienta del laboratorio; en producción responde 404 | `@Public()` | 12 |

## 4. Tablas de la base de datos

| Tabla | Qué guarda | Lee o escribe | Migración que la crea o modifica |
|---|---|---|---|
| `customer_satisfaction_survey_templates` | Una fila por empresa: `company_id` y `questions` (jsonb con `id`, `question`, `type` `number`/`boolean`/`text`, `options`) | Escribe `CustomerSatisfactionSurveyRepository.createTemplate`; lee `getTemplate` | Solo en la foto `docs/migrations/0_initial_models.sql`. Ninguna migración numerada la crea, la modifica ni la rellena |
| `customer_satisfaction_survey_responses` | Una fila por cotización respondida: `quotation_id` (uuid, `UNIQUE` en la foto), `template_id`, `answers` (jsonb `[{id, answer}]`), `created_at` | Escribe `repository.createAnswer`. Leen `repository.hasAnswer`, `repository.findAllAnswersFromCompany`, `QuotationsRepository.answeredSurveys` (portal), `QuotationsRepository.assertDeletable` (freno del borrado) y `ClientsRepository.findSummary` (ficha 360) | `0_initial_models.sql` (foto) |
| `quotations` | `survey_sent_at` (cuándo salió el correo) y `quotation_status` = `realizada` | `markEventDone` lee (`findOne`) y escribe ambas columnas; `createAnswer` lee `company_id` (`QuotationsService.findOne`); la página pública lee la cotización completa | `26_event_done_survey.sql` (agrega `survey_sent_at`) |
| `client_contacts` | El destinatario: `name`, `email`, `portal_token` | Lee `QuotationsRepository.findContactById` y `findContactByName` (desde `resolveRecipient`) | Mapa 09 |
| `companies` | Nombre, logo y colores (página pública y marca del correo), y `notifications.emails` (interruptor del correo "Encuesta") | Lee `CompaniesController.findOnePublic`, `EmailService.shouldSendEmail` y `getBranding` | Mapa 15 |
| `users` | Los administradores de la empresa, que reciben el aviso interno | Lee `UsersService.findAll(companyId, UserRole.ADMINISTRADOR)` | Mapa 15 |

## 5. Flujos principales

### Flujo 1: marcar realizado y enviar la encuesta

1. **Pantalla**: `/post-venta`, ficha del evento en `PostVentaPage`. El botón abre la pregunta en línea `confirmDone`: "¿Marcar como realizado? Se enviará la encuesta al contacto de la cotización." Si el evento no tiene factura cargada en Documentos, agrega un aviso (`sinFactura`, 28-08).
2. "Sí, realizado" llama a `doMarkDone` → `markEventDone(quotationId)` (`frontend/src/services/quotations.service.ts`) → `POST /quotations/:id/realizado`.
3. **Motor**: `QuotationsController.markEventDone` (operaciones o administrador) → `QuotationsService.markEventDone(id, user.company_id)`:
   - `QuotationsRepository.findOne(id)`. Exige que sea de la misma empresa y que esté `aceptada`; si no, lanza `Error('Only accepted events can be marked as done')`.
   - `QuotationsRepository.update` deja `quotation_status = realizada`. Escribe directo en el repositorio, no pasa por `QuotationsService.update`.
   - `alreadySurveyed = Boolean(survey_sent_at)`.
   - `resolveRecipient(quotation)`: la persona de `client_contact_id` (`findContactById`), y si no tiene correo devuelve `null`. Si no hay vínculo, busca por el nombre escrito (`findContactByName`). **Nunca** usa el correo de la ficha del cliente.
   - Si la encuesta no se había enviado y hay destinatario: `EmailService.sendEmail(email, EmailStructure.CUSTOMER_SATISFACTION_SURVEY, { clientName, companyName, companyId, quotationId }, company_id, portalToken)`. Después marca `surveySent = true` y escribe `survey_sent_at = now()`.
   - Si el envío lanza un error, lo anota en la bitácora y el evento queda realizado igual.
   - Devuelve `{ quotation_status, survey_sent, survey_already_sent, client_has_email }`.
4. **Dentro de `EmailService.sendEmail`**:
   - Con `EMAILS_SILENCED=1` (solo en el laboratorio) sale sin enviar.
   - Como `CUSTOMER_SATISFACTION_SURVEY` está en `EMAILS_SEND_TO_CLIENT`, consulta `shouldSendEmail`: si `companies.notifications.emails.customerSatisfactionSurvey === false`, sale sin enviar.
   - Arma la marca con `getBranding`, y el botón del portal si viene `portalToken` y existe `FRONTEND_URL`.
   - Asunto `¿Cómo estuvo tu evento, {clientName}?`. HTML de `customerSatisfactionSurveyTemplate`, con el botón "Responder la encuesta (2 min)" que apunta a `https://www.eventi-app.com/customer-satisfaction-survey/{companyId}/{quotationId}`.
   - Remitente `"{Empresa}" <hola@eventi-app.com>`, con "Responder a" de la empresa.
   - Si Resend devuelve error, **solo lo anota**.
5. **Pantalla**: `setDoneNotice` muestra uno de tres mensajes ("Se envió la encuesta…", "ya se había enviado antes, no se reenvió", "No hay correo para el contacto… Puedes agregarle correo en Gestión de Clientes"), más el saldo por cobrar. Después celebra (`setCelebrar`) y refresca (`onDataChanged`).
6. **Volver atrás**: la píldora "✓ REALIZADO" solo es botón para `administrador` → `doUnmarkDone` → `POST /quotations/:id/volver-a-pendiente` → `unmarkEventDone`, que deja el evento `aceptada`. `survey_sent_at` no se toca, así que si se vuelve a marcar, la encuesta no se reenvía (lo explica el toast).

### Flujo 2: el cliente responde

1. **Entradas**: el botón del correo, o el chip del portal. `QuotationsService.getPortalData` arma `encuestaPath = /customer-satisfaction-survey/{companyId}/{id}` solo para cotizaciones `realizada` sin respuesta, usando `QuotationsRepository.answeredSurveys`.
2. **`PublicSurvey` al abrir** pide cuatro cosas en paralelo (`Promise.all`):
   - `getTemplate(companyId)` → `GET /customer-satisfaction-survey/template`
   - `getQuotationById(quotationId)` → `GET /quotations/:id`
   - `getCompanyById(companyId)` → `GET /companies/public/:id`
   - `isSurveyAnswered(quotationId)` → `GET /customer-satisfaction-survey/answered`

   Si ya fue respondida, muestra "¡Gracias!". Si falla cualquiera de las otras tres, muestra "Error al cargar los datos de la encuesta". `isSurveyAnswered` se traga sus errores y devuelve `false`.
3. **Formulario**: la cabecera lleva los colores de la empresa (por defecto `#3b82f6` y `#1e40af`), el N° de cotización, el tipo y la fecha con `formatFechaEvento(event_date, "largoSinDia")`. Las preguntas `number` son 5 círculos rotulados "Muy mal … Muy bien"; las `boolean`, "Sí" y "No"; las `text`, un cuadro de texto.
4. **Validación en pantalla** (`isFormValid`): todas son obligatorias **menos la última por posición**. El botón queda deshabilitado hasta completarlas.
5. `handleSubmit` → `createAnswer({ quotationId, answers })`, sin las respuestas vacías → `POST /customer-satisfaction-survey/answer`. Aplica el `ValidationPipe` global con `CreateAnswerDto` y el techo de 10 por minuto.
6. **Motor**, `CustomerSatisfactionSurveyService.createAnswer`:
   - Candado: `repository.hasAnswer(quotationId)`. Si ya existe, `BadRequestException('Esta encuesta ya fue respondida. ¡Gracias por tu opinión!')`.
   - `quotationsService.findOne` para saber el `company_id`.
   - `repository.getTemplate(companyId)`.
   - `repository.createAnswer(quotation.id, template.id, answers)`, que inserta en `customer_satisfaction_survey_responses`.
7. **Efecto automático**: `usersService.findAll(companyId, UserRole.ADMINISTRADOR)` y luego `sendEmail(correos, NEW_ANSWER_CUSTOMER_SATISFACTION_SURVEY, { templateId, answers }, companyId)`.
   - HTML de `newAnswerCustomerSatisfactionSurveyTemplate`: rotula cada respuesta con la **constante del código**, escapa `<` y `>` con `limpio`, y usa `correoInternoTemplate` con el título "Encuesta respondida" y el botón "Ver respuestas" a `https://www.eventi-app.com/customer-satisfaction-survey/answers`.
   - Este correo no pasa por el interruptor de la empresa. Si falla, solo se anota. Se espera (`await`) antes de responderle al cliente.
8. **Pantalla**: `setSubmitted(true)` muestra "¡Gracias!". Cualquier error, incluido el 400 del candado, muestra "Error al enviar la encuesta. Por favor, inténtalo de nuevo."

### Flujo 3: el administrador revisa las respuestas

1. En el menú, "Encuestas de Satisfacción" (`Sidebar`, ícono `MessageCircle`, precarga `index.tsx`) lleva a `/customer-satisfaction-survey`, que redirige a `/template`.
2. `TemplateView`: `useQuery(["surveys", "template", company.id])` → `getTemplate(company.id)` → lista de preguntas.
3. `AnswersView`: `useQuery(["surveys", "answers", company.id])` → `Promise.all([findAllAnswersFromCompany(), getTemplate(company.id)])`.
   - `GET /customer-satisfaction-survey/answers` → `repository.findAllAnswersFromCompany(companyId)`.
   - La consulta pide `*, quotations(id, quotation_number, event_date, event_type, company_id, clients(name))` con `.eq('quotations.company_id', companyId)`, sin orden.
4. **Pantalla**:
   - `getUniqueQuotations` arma el selector y descarta las respuestas con `quotations` nulo.
   - Se autoselecciona `surveyResponses[0].quotation_id`.
   - Hay navegación "Cotización Anterior / Siguiente" con el rótulo "Respuesta X de Y".
   - Cada respuesta es una tarjeta con su fecha (`formatISOUTCDateToString(created_at)`). La pregunta se busca por `id` en la plantilla; si no está, aparece "Pregunta no encontrada (ID: n)".
   - "Reintentar" invalida `["surveys", "answers"]`.
5. No hay promedios, gráficos ni exportación. El único promedio del sistema vive en la ficha del cliente (flujo 4).

### Flujo 4: la satisfacción en la ficha 360 del cliente (detalle en el mapa 09)

1. `ClientDetailPage` → `GET /clients/:id/summary` → `ClientsRepository.findSummary`. En la segunda tanda lee `quotation_id, answers` de `customer_satisfaction_survey_responses` para las cotizaciones de ese cliente, ya filtradas por `company_id`.
2. En pantalla (`surveyAverages`), para cada encuesta aplica `parseFloat` a **todas** las respuestas y se queda con las que están entre 1 y 5. Promedia por encuesta y después hace el promedio simple entre encuestas. Muestra "4,3/5" y "N encuestas", o "—" y "sin encuestas".

### Flujo 5: de dónde sale la plantilla de cada empresa

1. `POST /users/signup` (`UsersService.signup`) o `POST /super-admin/suscription` → `SuperAdminService.createSuscription`: crea la empresa y el usuario administrador, llama a `customerSatisfactionSurveyService.createTemplate(companyData.id)`, que inserta `questions = CUSTOMER_SATISFACTION_SURVEY_QUESTIONS`, y manda `NEW_ACCOUNT`.
2. **Hoy la app no usa ese camino**: `NewUserRegisterForm` solo guarda leads ("TEMP: Self-service registration is disabled").
3. El panel super-admin (`pages/superAdmin/Index.tsx`, `handleCreateCompany`) crea empresas con `POST /super-admin/companies` → `SuperAdminService.createCompanyOnly` → `SuperAdminRepository.createCompanyOnly`, que **solo inserta en `companies`**: no crea plantilla.
4. La puerta manual `POST /customer-satisfaction-survey/template` (administrador) no tiene botón en ninguna pantalla.

## 6. Reglas de negocio acordadas

1. **La encuesta sale al declarar el evento realizado, no a ciegas.** Se eliminó el cron que la mandaba "a ciegas 3 días después de la fecha del evento". Evidencia: `docs/migrations/26_event_done_survey.sql`; comentario de `QuotationStatus.REALIZADA` en `api-rest/src/quotations/constants/constants.ts` ("Al marcarse se envía la encuesta de satisfacción"); commit `bd23fca` del 19-07 ("survey fires on declare (not blind)").
2. **Solo se marca realizado un evento `aceptada`, de la misma empresa.** Evidencia: `QuotationsService.markEventDone`.
3. **La encuesta sale una sola vez por evento.** `survey_sent_at` se escribe después del envío y bloquea reenvíos aunque el evento se vuelva a marcar. Evidencia: comentario sobre `resolveRecipient` y `markEventDone` ("survey_sent_at se estampa solo cuando el correo salió bien"); `QuotationsController.unmarkEventDone` ("si se re-marca, no se reenvia: survey_sent_at manda"); migración 26 ("para que NUNCA se envíe dos veces"). Ver riesgo 3: "salió bien" no siempre es cierto.
4. **Un correo fallido no deshace el realizado.** Evidencia: `markEventDone` ("El estado ya quedó realizado; un correo fallido no lo revierte").
5. **Volver a pendiente es solo del administrador** (05-08, pedido de Felipe), y "la encuesta ya enviada no se puede des-enviar". Evidencia: `QuotationsController.unmarkEventDone` con `ADMIN_ONLY`; `QuotationsService.unmarkEventDone`; la píldora de `PostVentaPage` es botón solo si `userRole === "administrador"`.
6. **La encuesta le llega a la persona, no a la ficha** (reglas del 20-07 y del 30-07, "correos a personas y punto"). Si la persona no tiene correo, no se envía: "mejor silencio que un enlace de portal en una casilla desconocida". Evidencia: comentario de `QuotationsService.resolveRecipient`; mensaje de `PostVentaPage.doMarkDone`.
7. **Una respuesta por cotización** ("Candado (30-07, pedido de Felipe): UNA respuesta por cotización"). Evidencia: `CustomerSatisfactionSurveyService.createAnswer`; `hasAnswer`; `PublicSurvey` muestra el agradecimiento si ya existe (commit `a60bdb8`). La foto `0_initial_models.sql` declara además `quotation_id ... UNIQUE`.
8. **El texto del correo al cliente lo aprobó Felipe** (rediseño 29-07): agradece la confianza y pide 2 minutos. Evidencia: `api-rest/src/email/templates/customerSatisfactionSurvey/template.ts`.
9. **El correo "Encuesta" tiene interruptor por empresa, y sin configuración queda encendido** (decisión de Felipe, 29-07: antes estaban mudos los correos al cliente de las empresas sin configurar). Evidencia: `EmailService.shouldSendEmail`; `emailCategories` en `frontend/src/pages/configuration/constants.ts` ("Regla del interruptor: sin llave = encendido").
10. **El aviso interno "Respuesta de encuesta" no se puede apagar**: "Correos al EQUIPO: siempre activos, sin interruptor (… apagarlos sería esconderse noticias propias)". Evidencia: `equipoEmails`; en el motor, `NEW_ANSWER_CUSTOMER_SATISFACTION_SURVEY` no está en `EMAILS_SEND_TO_CLIENT`. Lleva la marca de la casa desde el 02-09 (`newAnswerCustomerSatisfactionSurveyTemplate`).
11. **Lo que escribe el cliente se neutraliza antes de ir al HTML del aviso.** Evidencia: `limpio` en `newAnswerCustomerSatisfactionSurvey/template.ts`.
12. **Los correos al cliente salen con el nombre de la empresa como remitente, y la respuesta llega a la casilla real de la empresa** (30-07). Evidencia: `EmailService.sendEmail` (`from`, `replyTo`).
13. **Escritura pública con techo estricto** (Fase 3): 10 respuestas por minuto; el techo global es 300 por minuto. Evidencia: `@Throttle` en `CustomerSatisfactionSurveyController.createAnswer`; `ThrottlerModule.forRoot` en `api-rest/src/app.module.ts`.
14. **Crear plantilla dejó de ser público** el 28-07: "era una escritura abierta a internet sin uso". Evidencia: comentario de `createTemplate` en el controller.
15. **La fecha del evento en la encuesta pública no se corre un día** (13-08): "Es la cara pública: la ve el cliente". Evidencia: `PublicSurvey` con `formatFechaEvento(..., "largoSinDia")`; `frontend/src/utils/dates.test.ts` ("EL BUG DE LA #423": se arregló tres veces en 323 días y volvió las tres); `docs/arquitectura/09_PLAN_DE_HOMOLOGACION.md`, Tanda A0.
16. **La página pública solo ve la cara pública de la empresa** (Mudanza #7, 28-07; banner y redes desde el 05-09). Evidencia: `CompaniesController.findOnePublic`; comentario de `getCompanyById` en `services/superAdmin.service.tsx`.
17. **El evento realizado se congela, pero la encuesta sigue viva** porque no pasa por `update()` (Felipe, 13-08). Evidencia: `EVENTO_REALIZADO_CONGELADO` en `quotations/constants/constants.ts`; cabecera de `candado-evento-realizado.spec.ts`.
18. **Una cotización con encuesta respondida no se borra** (26-07), con su propio mensaje: "No se puede eliminar: esta cotización tiene una encuesta de satisfacción respondida." Un evento realizado tampoco se borra (13-08). Evidencia: `QuotationsRepository.assertDeletable`; `QuotationsService.remove`.
19. **El portal invita solo a eventos realizados sin respuesta, y agradece si ya respondieron.** Evidencia: `QuotationsService.getPortalData` ("Encuestas ya respondidas: el portal agradece en vez de invitar").
20. **El módulo en el menú es solo del administrador.** Evidencia: `SECTION_ROLES.customer_satisfaction_survey = ROLE_GROUPS.ADMIN_ONLY` en `frontend/src/constants/permissions.ts`.
21. **Satisfacción en la ficha 360 = promedio simple de las respuestas numéricas** (ficha definida con Felipe el 21-07). Evidencia: comentario de `ClientsRepository.findSummary`; `ClientDetailPage` ("Satisfacción: promedio de las respuestas numéricas de las encuestas").

## 7. Conexiones con otros módulos

**A quién usa este módulo:**
- **01 Cotizador**: `QuotationsService.findOne` (en `createAnswer`) y `GET /quotations/:id` público (lo usa la encuesta pública). `AnswersView` abre `/quotation-form/:id`.
- **12 Correos internos y notificaciones**: `EmailService.sendEmail`, las dos plantillas, `EMAIL_SUBJECTS`, `EMAILS_SEND_TO_CLIENT`, el silenciador `EMAILS_SILENCED`, el probador `POST /email-previews` (`sendPreviewBatch` trae "[PRUEBA] ¿Cómo estuvo tu evento, María Fernanda?" y "[PRUEBA] Encuesta respondida — aviso interno") y los interruptores de `/configuration`.
- **15 Acceso, empresa, usuarios y planes**: `UsersService.findAll` (administradores), `GET /companies/public/:id`, `AuthGuard` con `@Public()`, `RolesGuard` con `ADMIN_ONLY`/`OPERATIONS_AND_UP`, y `SuperAdminService.createSuscription`, que crea la plantilla.
- **17 Kit de la casa**: `SelectWithSearch` en `AnswersView`; `formatFechaEvento` y `formatISOUTCDateToString` de `utils/dates`.

**Quién usa este módulo:**
- **04 Post-Venta**: `markEventDone` dispara el correo; `unmarkEventDone` no lo des-envía; `PostVentaPage` traduce `survey_sent`/`survey_already_sent` a un aviso.
- **03 Pagos, reembolsos y portal**: `getPortalData` arma `encuestaPath` y `encuestaRespondida` con `QuotationsRepository.answeredSurveys`, que duplica a propósito una consulta de este módulo para no crear un ciclo. `PortalPage` pinta los chips. El correo de encuesta lleva el botón "Ingresar a mi portal" si el mandante tiene `portal_token`.
- **09 Clientes**: `ClientsRepository.findSummary` lee las respuestas para el promedio; `resolveRecipient` depende de `client_contacts`.
- **02 Negocio, envío y seguimiento**: `resolveRecipient` es la misma función del correo `QUOTATION_IS_SENT`; `survey_sent_at` viaja en `COLUMNAS_LISTA` de `QuotationsRepository.findAll`.
- **01 Cotizador**: `QuotationsRepository.assertDeletable` cuenta respuestas antes de dejar borrar una cotización.

**Efectos automáticos:**
- Al marcar realizado: correo al mandante y escritura de `survey_sent_at`.
- Al responder: correo interno a todos los administradores de la empresa.
- **No hay relojes**: el cron de la encuesta se eliminó (migración 26).

**Sin conexión (para no buscar donde no hay):**
- **13 Dashboard y analítica**: no lee encuestas (ningún archivo de analytics ni del Dashboard las menciona).
- **10 Marketing**: guarda en `marketing_contacts` una "satisfacción del Forms" (`docs/arquitectura/11_MODULO_DE_MARKETING.md`). Es otra fuente, sin relación con estas tablas.
- **07 y 08 Personas**: sus "estrellas" (`person_reviews`, migración 77, componente `Estrellas`) evalúan al personal, no al cliente.

**Módulos de Nest:** `CustomerSatisfactionSurveyModule` importa `EmailModule` y `forwardRef(() => QuotationsModule)`, y exporta el service. `SuperAdminModule` lo importa con `forwardRef`. Está registrado en `app.module.ts`.

## 8. Zonas de riesgo: si tocas esto, cuidado con aquello

Primero lo que ya causó incidentes según comentarios y documentos:

1. **Si tocas** la fecha que muestra `PublicSurvey` (o escribes `new Date(event_date)` a mano), **se afecta** lo que ve el cliente, **porque** las fechas de evento se guardan a medianoche UTC y leerlas en hora chilena las corre un día hacia atrás. Es el bug #423: "se arregló TRES veces en 323 días y volvió las tres". Evidencia: comentario del 13-08 en `PublicSurvey.tsx`; `frontend/src/utils/dates.test.ts`.
2. **Si tocas** `EmailService.shouldSendEmail`, **se afecta** que la encuesta salga en todas las empresas, **porque** antes del 29-07 esa función devolvía `false` sin configuración y tenía mudos los correos al cliente de todas las empresas sin configurar. Evidencia: comentario en `shouldSendEmail`.
3. **Si tocas** `EmailService.sendEmail`, o una empresa apaga el correo "Encuesta", **se afecta** la veracidad de `survey_sent_at` y del aviso de Post-Venta, **porque** `sendEmail` vuelve sin error en tres casos: interruptor apagado, `EMAILS_SILENCED=1`, o error devuelto por Resend (cura 05-08: se anota y nada más). En los tres, `markEventDone` marca `surveySent = true`, escribe `survey_sent_at` y la pantalla dice "Se envió la encuesta de satisfacción al cliente" aunque no salió nada. Como esa marca bloquea los reenvíos, re-marcar el evento tampoco la manda. Evidencia: `EmailService.sendEmail`, `QuotationsService.markEventDone`. Verificado leyendo, no probado en vivo.
4. **Si agregas** otra tabla que apunte a `quotations` sin CASCADE, o cambias la llave de `customer_satisfaction_survey_responses`, **se afecta** el borrado de cotizaciones, **porque** `assertDeletable` traduce a mano cada llave que bloquea; sin ella vuelve el mensaje "mentiroso" con el que Felipe se topó el 26-07. Evidencia: comentario "OJO SI SE AGREGA OTRA TABLA" en `QuotationsRepository.assertDeletable`.
5. **Si inyectas** `CustomerSatisfactionSurveyService` dentro de `QuotationsModule`, **se afecta** el arranque y las pruebas, **porque** ya hay importaciones circulares con `forwardRef`. Por eso `QuotationsRepository.answeredSurveys` duplica la consulta, y los specs construyen el service a mano ("dejan el token de QuotationsService irreconocible… aparece como Object"). Evidencia: `module.ts`, `tests/customer_satisfaction_survey.service.spec.ts`, comentario de `answeredSurveys`.
6. **Si reabres** `POST /customer-satisfaction-survey/template` como público, **se afecta** la integridad de las plantillas de todas las empresas, **porque** era una escritura abierta a internet (cerrada el 28-07). Evidencia: comentario en el controller.

Luego, lo verificado leyendo el código:

7. **Si tocas** `CustomerSatisfactionSurveyRepository.findAllAnswersFromCompany`, **se afecta** el aislamiento entre empresas, **porque** el filtro `.eq('quotations.company_id', companyId)` va sobre la tabla embebida y sin `!inner`. En PostgREST eso filtra la cotización anidada, no las filas de respuestas: el motor puede devolver respuestas de otras empresas con `quotations: null`. `AnswersView.getUniqueQuotations` las saca del selector, pero la autoselección toma `surveyResponses[0].quotation_id` sin revisar `quotations`, y el bloque de respuestas filtra solo por `quotation_id`, así que podría mostrar respuestas ajenas sin encabezado. Contradice la regla de `CLAUDE.md` sobre `company_id` en los repositorios. Evidencia: `repository.ts`, `AnswersView.tsx`. Leído, no probado en vivo. La documentación de Supabase confirma el mecanismo (left join por defecto; solo `!inner` descarta filas padre), consultada el 11-09-2026. Esta puerta está inventariada como `GET /customer-satisfaction-survey/answers` en el **Sprint 2** ("Los filtros que no filtran") de `22_AISLAMIENTO_ENTRE_EMPRESAS.md`: pendiente, falta el `quotations!inner`. **Cerrado en la rama `pruebas` el 11-09-2026 (sprint 2 de [22_AISLAMIENTO_ENTRE_EMPRESAS.md](22_AISLAMIENTO_ENTRE_EMPRESAS.md)); TODAVÍA NO EN PRODUCCIÓN.**
8. **Si confías** en que solo el administrador ve las respuestas, **se afecta** la privacidad de las opiniones, **porque** `GET /customer-satisfaction-survey/answers` no tiene `@Roles` y las tres rutas de la sección en `frontend/src/App.tsx` no están envueltas en `PermissionGuard` (todas las demás secciones sí lo están). Solo el `Sidebar` las oculta, así que recepción, vendedor u operaciones las abren escribiendo la URL. Evidencia: `controller.ts`, `App.tsx`.
9. **Si creas** una empresa desde el panel super-admin, **se afecta** toda la encuesta de esa empresa, **porque** `createCompanyOnly` no crea la fila en `customer_satisfaction_survey_templates` y `getTemplate` usa `.single()`. Sin plantilla: la página pública muestra "Error al cargar los datos de la encuesta", `createAnswer` falla y `TemplateView`/`AnswersView` muestran error. El correo igual sale al marcar realizado, porque no mira la plantilla. El único camino que crea plantilla (`createSuscription`) no tiene llamador vivo, y no hay migración de relleno. Evidencia: `SuperAdminRepository.createCompanyOnly`, `CustomerSatisfactionSurveyRepository.getTemplate`, `NewUserRegisterForm.tsx`.
10. **Si llamas** a `POST /customer-satisfaction-survey/template` para una empresa que ya tiene plantilla, **se rompe** su encuesta, **porque** `createTemplate` no revisa si ya existe y `getTemplate` con `.single()` falla con dos filas. Además toma `companyId` de la query (`@Query('companyId')` en `controller.ts`) y no de la sesión: un administrador de una empresa puede crearle plantilla a otra. Evidencia: `controller.ts`, `service.ts`, `repository.ts`. Esta puerta también está en el **Sprint 2** de `22_AISLAMIENTO_ENTRE_EMPRESAS.md`, pendiente: el capítulo pide que `companyId` salga de la sesión, no del query string. Hoy la puerta manual no tiene botón en ninguna pantalla (sección 5, flujo 5), pero sigue abierta a quien arme la petición.
11. **Si cambias** `CUSTOMER_SATISFACTION_SURVEY_QUESTIONS` (orden, `id` o tipos), **se afectan** cinco cosas:
    - las empresas nuevas, porque la plantilla se copia al crearlas;
    - el aviso interno, que rotula con la constante y no con la plantilla guardada (`newAnswerCustomerSatisfactionSurveyTemplate`);
    - las respuestas viejas, que se guardan por `id` y en `AnswersView` saldrían como "Pregunta no encontrada";
    - `PublicSurvey.isFormValid`, que decide la pregunta opcional por posición (la última) y no por tipo;
    - los rótulos "Muy mal…Muy bien", que asumen 5 opciones por índice.

    Evidencia: esos archivos.
12. **Si cambias** el formato de `answers`, **se afecta** el promedio de la ficha 360, **porque** `ClientDetailPage` aplica `parseFloat` a todas las respuestas sin mirar el tipo de pregunta: un comentario libre que empiece con un número del 1 al 5 ("3 cosas por mejorar") entra al promedio. Evidencia: `surveyAverages` en `ClientDetailPage.tsx`.
13. **Si cierras o cambias** `GET /quotations/:id`, **se rompe** la página pública (`getQuotationById`). Si lo dejas, **cuidado**: entrega la cotización completa, sin filtro de empresa, a quien tenga el UUID. Evidencia: TODO en `QuotationsController.findOne`; mapas 01 y 04.
14. **Si cambias** `QuotationsService.resolveRecipient`, **se afectan** a la vez la encuesta y el correo "cotización enviada", **porque** los dos usan la misma función. Evidencia: `markEventDone` y `update` en `quotations.service.ts`; `flujos/03_ENVIAR_COTIZACION_POR_CORREO.md`.
15. **Si agregas** otro camino para dejar una cotización `realizada`, **se pierde** la encuesta, **porque** el envío vive solo en `markEventDone`. El mapa 04 (riesgo 10) anota que `PATCH /quotations/:id` hoy aceptaría `realizada` sin pasar por ahí. `markEventDone` escribe con `QuotationsRepository.update`, igual que `unmarkEventDone` y `setHarvestStatus`; el spec del candado protege esos dos por no pasar por `update()`, pero **no tiene prueba para `markEventDone`**. Evidencia: `candado-evento-realizado.spec.ts`.
16. **Si cambias** el dominio o las rutas de la app, **se rompen** los enlaces de ambos correos, **porque** están escritos a mano como `https://www.eventi-app.com/...` y no usan `FRONTEND_URL` (que sí usa el botón del portal). Desde el laboratorio, el enlace apunta a producción. Evidencia: las dos plantillas y `EmailService.sendEmail`.
17. **Si confías** en el motor para validar respuestas, **cuidado**:
    - `CreateAnswerDto` solo pide `answer` no vacío (sin `@IsString` ni largo máximo) e `id` numérico;
    - `createAnswer` no revisa que el evento esté `realizada`, que se haya enviado la encuesta, que vengan las obligatorias ni que los `id` existan en la plantilla;
    - `hasAnswer` ignora el error de la consulta (devuelve `false`), así que si la lectura falla, la última barrera es el `UNIQUE` de la base.

    Evidencia: `dto/create-answer.dto.ts`, `service.ts`, `repository.ts`.

## 9. Pruebas que lo protegen

| Archivo | Qué cubre |
|---|---|
| `api-rest/src/customer_satisfaction_survey/tests/customer_satisfaction_survey.controller.spec.ts` | Solo que el controller se construye con el service simulado ("should be defined"; esqueleto reparado en la Fase 2 Bloque B) |
| `api-rest/src/customer_satisfaction_survey/tests/customer_satisfaction_survey.service.spec.ts` | Solo que el service se construye (a mano, por las importaciones circulares) |
| `api-rest/src/quotations/tests/unit/candado-evento-realizado.spec.ts` | El candado del evento realizado: no se edita, no sale por `update()`, no se borra; `unmarkEventDone` vuelve a `aceptada`. **No prueba `markEventDone` ni la encuesta** |
| `api-rest/src/super-admin/tests/super-admin.service.spec.ts` | Construye `SuperAdminService` con el service de encuestas vacío; no revisa que `createSuscription` cree la plantilla |
| `frontend/src/utils/dates.test.ts` (vitest) | "largoSinDia es el que usa la encuesta pública": la fecha pública dice el día correcto |

**Lo importante que NO está cubierto:**
- `markEventDone`: estado previo `aceptada`, envío único, contacto sin correo, escritura de `survey_sent_at` y el caso del correo apagado (riesgo 3).
- El candado de una respuesta (`createAnswer` + `hasAnswer`) y el mensaje de la encuesta en `assertDeletable`.
- El filtro por empresa de `findAllAnswersFromCompany` (riesgo 7).
- La falta de plantilla (riesgo 9) y la plantilla duplicada (riesgo 10).
- Las dos plantillas de correo, incluido el escape de `limpio`.
- `answeredSurveys` y `encuestaPath` del portal.
- Las pantallas `PublicSurvey`, `AnswersView` y `TemplateView`, y el promedio de `ClientDetailPage`.

## 10. Deuda y rarezas conocidas

- **Dos componentes de navegación**: se usa `components/navigatino.tsx` (con error de tipeo en el nombre). `components/Navigation.tsx` no lo importa nadie: código muerto.
- `index.tsx` pinta la navegación y redirige de inmediato; `TemplateView` y `AnswersView` no muestran las pestañas mientras cargan o cuando fallan.
- **Código muerto en el motor**:
  - `dto/create-customer_satisfaction_survey.dto.ts` es una clase vacía y `dto/update-customer_satisfaction_survey.dto.ts` hereda de ella; ninguna se usa.
  - `findOne`, `update` y `remove` están comentados en el controller.
  - `CustomerSatisfactionSurveyRepository.answeredSet` no tiene llamadores: su comentario dice "para el portal", pero el portal usa `QuotationsRepository.answeredSurveys`.
  - El comentario del constructor del service ("hasAnswer se expone… para el portal") también quedó viejo.
- **La plantilla "por empresa" no se puede editar**: no hay pantalla ni endpoint de edición, y todas las empresas tienen las mismas 5 preguntas del código.
- **El aviso interno no dice qué cliente ni qué cotización respondió**: `NewAnswerCustomerSatisfactionSurveyParams` solo trae `templateId` (que la plantilla no usa) y `answers`.
- Las respuestas de sí o no se muestran crudas ("true"/"false") en `AnswersView` y en el aviso interno.
- **`AnswersView`**:
  - "Respuesta X de Y" en realidad cuenta cotizaciones;
  - la consulta no tiene `.order`, así que el orden no está garantizado;
  - hay 5 `any`, más 2 en `customerSatisfactionSurveys.service.ts`; el lint del frontend tiene `@typescript-eslint/no-explicit-any` apagado, así que no suman al techo 87.
- **Tipos desalineados**:
  - `template_id: string` en la entidad y en el tipo de la app, mientras la base es `bigint`;
  - el tipo de la app declara `templates: SurveyTemplate`, que el motor nunca devuelve;
  - la entidad `Quotation` no declara `survey_sent_at`, de ahí los `as { survey_sent_at?: string | null }` y `as unknown as UpdateQuotationDto` en `markEventDone` (ya anotado en el mapa 02).
- **Comentarios viejos en `QuotationsService`**: el punto 3 de `resolveRecipient` (regla del 20-07, "correo del cliente") y el de `client_has_email` en `markEventDone` ("o cliente con correo cuando no hay contacto asociado") hablan de un respaldo a la ficha que el código ya no hace desde la regla del 30-07.
- **Mensaje equivocado en Post-Venta**: `doMarkDone` no mira `client_has_email`. Si el envío lanza un error, la pantalla dice "No hay correo para el contacto" aunque sí lo había.
- `EMAIL_SUBJECTS[CUSTOMER_SATISFACTION_SURVEY]` ("Encuesta de satisfacción evento") no se usa: el `case` del correo escribe su propio asunto.
- **Errores genéricos**: el service lanza `Error` genérico, que responde 500, en vez de excepciones de Nest; solo el candado usa `BadRequestException`. Una empresa sin plantilla recibe un 500 en `GET template`.
- `PublicSurvey.tsx` (470 líneas) repite `answers.find(...)` en cada botón y usa estilos en línea; `AnswersView.tsx` tiene 418. Ninguno pasa de 800 líneas, así que están fuera del techo de gigantes del portero.
- **Sin vista de conjunto**: el módulo no tiene promedios por pregunta, porcentaje de recomendación ni exportación.
- **Historia**: el módulo nació entre el 22 y el 27-10-2025 (`git log`: "create basic structure for customer satisfaction survey") y se endureció entre el 19-07 y el 02-09-2026.

## 11. Contradicciones entre documento y código

1. **`CLAUDE.md` dice "There is no frontend test suite."** Pero `frontend/package.json` tiene `"test": "vitest run"`, y `frontend/src/utils/dates.test.ts` protege, entre otras cosas, la fecha de la encuesta pública.
2. **`CLAUDE.md`, tabla del kit: `components/Estrellas` figura en "2" pantallas.** El código lo importa en 4 archivos, todos de Personas (`EvaluacionesDePersona.tsx`, `FichasTab.tsx`, `PersonaFichaPage.tsx`, `PersonasPage.tsx`), y en ninguno de encuestas, aunque el alcance de este mapa lo nombraba. La ficha del cliente muestra la satisfacción como texto "x/5".
3. **`CLAUDE.md` dice que cada método de repositorio recibe `companyId` y filtra por `company_id`.** En `CustomerSatisfactionSurveyRepository`, `hasAnswer`, `answeredSet` y `createAnswer` no reciben empresa (sirven a puertas públicas), y `findAllAnswersFromCompany` filtra sobre la tabla embebida (riesgo 7).
4. **`docs/mapa-programacion-planes.md` (hoja de ruta, 24-07)** pone `customer_satisfaction_survey` solo en el plan Crece y dice "Email automático (… encuestas …) = Crece". El código no tiene ese candado: `SECTION_ROLES` filtra solo por rol, y la búsqueda en `api-rest/src/plans`, `frontend/src/hooks` y `frontend/src/contexts` no encuentra la sección. Es una hoja de ruta, así que puede ser trabajo pendiente y no un error.
5. **Matiz sobre `26_event_done_survey.sql`** ("ahora la encuesta sale solo al marcar REALIZADO en Post-Venta"). Es cierto para el correo. Pero el portal ofrece la página pública para cualquier evento `realizada` sin respuesta, aunque nunca se haya enviado el correo (por ejemplo, un contacto sin correo), y el motor acepta respuestas para cualquier cotización sin mirar su estado (`QuotationsService.getPortalData`, `CustomerSatisfactionSurveyService.createAnswer`).

## 12. Preguntas abiertas

1. ¿Existe en la base de producción el `UNIQUE` de `customer_satisfaction_survey_responses.quotation_id`? Solo aparece en la foto `0_initial_models.sql`; no hay migración numerada.
2. ¿Todas las empresas vivas tienen su fila en `customer_satisfaction_survey_templates`? Las creadas con `createCompanyOnly` no la reciben y no hay migración de relleno.
3. ¿`GET /customer-satisfaction-survey/answers` devuelve en vivo respuestas de otras empresas con `quotations: null`? La lectura del código dice que sí; falta probarlo.
4. ¿Es intencional que recepción, vendedor y operaciones puedan abrir `/customer-satisfaction-survey/answers` por URL, y que el motor no tenga `@Roles` en esa puerta?
5. Cuando una empresa apaga el correo "Encuesta", ¿se quiere que `survey_sent_at` quede escrito y que Post-Venta diga "Se envió la encuesta"?
6. ¿El motor debería aceptar respuestas solo para eventos `realizada`, o solo con `survey_sent_at`?
7. ¿La plantilla debería poder editarse por empresa? La tabla lo permite, pero no hay pantalla y el aviso interno usa las preguntas del código.
8. ¿El aviso interno debería decir qué cliente y qué cotización respondió?
9. ¿Se quiere una vista de conjunto (promedio por pregunta, porcentaje que recomienda), o basta el promedio de la ficha del cliente?
10. ¿Se va a encender el candado del plan Crece para este módulo, como dice la hoja de ruta de planes?
11. ¿La Tanda A0 de `09_PLAN_DE_HOMOLOGACION.md` (fecha de la encuesta pública) ya está en producción? El documento todavía dice "HECHA, sin publicar… Falta que Felipe la valide", y el commit `55f56ff` está en la historia de `pruebas`.

## 13. Archivos clave

**Motor**
- `api-rest/src/customer_satisfaction_survey/module.ts`
- `api-rest/src/customer_satisfaction_survey/controller.ts`
- `api-rest/src/customer_satisfaction_survey/service.ts`
- `api-rest/src/customer_satisfaction_survey/repository.ts`
- `api-rest/src/customer_satisfaction_survey/constants/questions.ts` (las 5 preguntas)
- `api-rest/src/customer_satisfaction_survey/dto/create-answer.dto.ts` (los otros dos DTO están vacíos y sin uso)
- `api-rest/src/customer_satisfaction_survey/entities/customer_satisfaction_survey_template.entity.ts` y `customer_satisfaction_survey_response.entity.ts`
- `api-rest/src/customer_satisfaction_survey/tests/customer_satisfaction_survey.controller.spec.ts` y `customer_satisfaction_survey.service.spec.ts`
- `api-rest/src/email/templates/customerSatisfactionSurvey/template.ts` y `types.ts` (correo al cliente)
- `api-rest/src/email/templates/newAnswerCustomerSatisfactionSurvey/template.ts` y `types.ts` (aviso interno)
- `api-rest/src/email/email.service.ts` (`sendEmail`, `shouldSendEmail`, `getBranding`, `sendPreviewBatch`), `api-rest/src/email/constants/index.ts`, `api-rest/src/email/types/index.ts`, `api-rest/src/email/email-previews.controller.ts`
- `api-rest/src/quotations/quotations.service.ts` (`markEventDone`, `unmarkEventDone`, `resolveRecipient`, `getPortalData`, `remove`)
- `api-rest/src/quotations/quotations.controller.ts` (`markEventDone`, `unmarkEventDone`, `findOne`) y `api-rest/src/quotations/portal.controller.ts`
- `api-rest/src/quotations/quotations.repository.ts` (`answeredSurveys`, `assertDeletable`, `findContactById`, `findContactByName`)
- `api-rest/src/quotations/constants/constants.ts` (`QuotationStatus.REALIZADA`, `EVENTO_REALIZADO_CONGELADO`)
- `api-rest/src/quotations/tests/unit/candado-evento-realizado.spec.ts`
- `api-rest/src/clients/clients.repository.ts` (`findSummary`)
- `api-rest/src/super-admin/super-admin.service.ts` (`createSuscription`, `createCompanyOnly`), `super-admin.repository.ts`, `super-admin.module.ts`
- `api-rest/src/users/users.service.ts` (`signup`, `findAll`)
- `api-rest/src/companies/companies.controller.ts` (`findOnePublic`)
- `api-rest/src/app.module.ts` (registro del módulo, `ThrottlerModule`)
- `docs/migrations/0_initial_models.sql` (foto de las dos tablas), `docs/migrations/26_event_done_survey.sql`

**App**
- `frontend/src/pages/customerSatisfactionSurveys/index.tsx`
- `frontend/src/pages/customerSatisfactionSurveys/PublicSurvey.tsx`
- `frontend/src/pages/customerSatisfactionSurveys/components/TemplateView.tsx`
- `frontend/src/pages/customerSatisfactionSurveys/components/AnswersView.tsx`
- `frontend/src/pages/customerSatisfactionSurveys/components/navigatino.tsx` (en uso) y `components/Navigation.tsx` (muerto)
- `frontend/src/services/customerSatisfactionSurveys.service.ts`
- `frontend/src/types/customerSatisfactionSurveys.types.ts`
- `frontend/src/constants/api.routes.ts` (`CUSTOMER_SATISFACTION_SURVEY*`)
- `frontend/src/App.tsx` (rutas), `frontend/src/layout/Sidebar.tsx`, `frontend/src/constants/permissions.ts`
- `frontend/src/pages/postventa/PostVentaPage.tsx` (`doMarkDone`, `doUnmarkDone`)
- `frontend/src/services/quotations.service.ts` (`markEventDone`, `unmarkEventDone`, `getQuotationById`)
- `frontend/src/pages/portal/PortalPage.tsx` (chips de encuesta)
- `frontend/src/pages/ClientDetailPage.tsx` (indicador Satisfacción)
- `frontend/src/services/superAdmin.service.tsx` (`getCompanyById`), `frontend/src/services/companies.service.ts` (`getCompanyPublic`)
- `frontend/src/pages/configuration/constants.ts`, `frontend/src/types/notifications.ts`
- `frontend/src/pages/landingPage/NewUserRegisterForm.tsx` (registro desactivado), `frontend/src/pages/superAdmin/Index.tsx` (`handleCreateCompany`)
- `frontend/src/utils/dates.ts` (`formatFechaEvento`), `frontend/src/utils/dates.test.ts`
- `frontend/src/components/Estrellas.tsx` (pieza de la casa; no se usa en este módulo, vive en Personas)
