# Mapa: Embudo de consultas y formularios públicos

> **Estado: verificado una vez contra el código** (commit 0de0ddb, 11-09-2026). Falta la etapa de completar lo que no quedó escrito. Parte del atlas de docs/arquitectura/mapa; el índice es 00_MAPA_DEL_SISTEMA.md.

Documento que manda: `docs/arquitectura/12_MODULO_DE_CONSULTAS.md`. El recorrido completo con sus casos borde está en `docs/arquitectura/mapa/flujos/01_CONSULTA_PUBLICA_A_COTIZACION.md`; este mapa no lo repite entero.

## 1. Qué hace

Es la puerta de entrada de los clientes nuevos, al principio de la vida de un evento. Un interesado llena el formulario público de la empresa (`/public-quotation/:company_id`, enlazado desde la web) y **el tipo de evento que elige decide qué pasa**. Si el tipo entra como **cotización**, el cliente nace o se reconoce por correo y queda un **requerimiento** en estado 'solicitada' que el equipo ve en **Requerimientos** (`/requests`). Si entra como **consulta** (matrimonios, paseos de curso, graduaciones: *"entran por cientos, enviamos la cotización tipo y solo algunos contestan"*, Felipe, 05-09-2026), no se crea cliente ni cotización. Queda una consulta liviana y, **10 minutos después**, un reloj del motor le manda el brochure con la marca de la empresa. Cuando el interesado contesta (eso se ve en Outlook), alguien aprieta **Convertir** en la bandeja **Consultas** (`/consultas`) y se abre el cotizador con todo puesto. En esa misma página se administra el catálogo de tipos de evento y el correo de cada tipo. Requerimientos sirve además para que recepción anote las solicitudes que llegan por teléfono.

## 2. Pantallas y rutas de la app

| Ruta de la app | Componente principal | Archivo | Qué hace el usuario ahí | Rol que la ve |
|---|---|---|---|---|
| `/public-quotation/:company_id` | `CreateQuotationPublic` | `frontend/src/pages/quotations/CreateQuotationPublic.tsx` | Un visitante sin sesión pide cotización: sus datos (la persona de contacto), tipo de cliente, nombre de la organización si no es particular, tipo de evento, fecha, adultos, niños, presupuesto estimado y comentarios. Ve la marca de la empresa (banner o logo, colores, `PieDeMarcaPublico`) y, al enviar, la pantalla de gracias con "Volver a nuestra web" y "Enviar otra solicitud" | Público: la ruta vive fuera del `Layout` y sin `PermissionGuard` (`frontend/src/App.tsx`) |
| `/consultas` (bandeja) | `ConsultasPage` | `frontend/src/pages/consultas/ConsultasPage.tsx` | Lista de consultas con búsqueda (`matchesSearch` sobre nombre, correo, teléfono y tipo), filtro por estado y chip de correo ("Sale a las HH:MM", "Sin brochure", "Respondida", "Convertida", "Descartada"). Botones Convertir y Descartar, ambos con `ConfirmInline` | `SECTION_ROLES.quotations` = recepción, vendedor, operaciones y administrador. En el `Sidebar` es el ítem "Consultas" con `section: "quotations"` |
| `/consultas` (botón "Tipos de evento") | `ConfiguracionDelEmbudo` y `FilaDeTipo` | mismo archivo | Agregar un tipo, elegir su entrada (Cotización o Consulta), activarlo o inactivarlo y eliminarlo (solo sin uso). Un tipo 'consulta' sin brochure se marca en ámbar | mismo rol |
| (fila expandida de un tipo 'consulta') | `PanelDeCorreo` | `frontend/src/pages/consultas/PanelDeCorreo.tsx` | Subir hasta 2 PDF, quitarlos y escribir el texto del correo con `{nombre}` (vacío = el texto de la casa) | mismo rol |
| `/requests` | `RequestsPage` | `frontend/src/pages/RequestsPage.tsx` | Ver los requerimientos en 'solicitada' (sello "creada desde link publico" cuando `user_id` es nulo), buscar por número o cliente, abrir "Enlace Público" para copiar el link, crear o editar un requerimiento, "Crear Cotización" y eliminar | `SECTION_ROLES.requests` = los cuatro roles. "Crear Cotización" solo aparece con `quotations_edit` (vendedor para arriba); el basurero solo aparece para administrador |
| (dentro de `/requests`) | `RequestForm` | `frontend/src/components/RequestForm.tsx` | Formulario interno del requerimiento: cliente existente o nuevo (modal), persona de contacto, tipo de evento del catálogo (solo activos), fecha con aviso de choque, personas y observaciones | mismo rol que `/requests` |

Cómo se llega y adónde se sale:

- **Entradas:** el `Sidebar` ("Requerimientos" y "Consultas"); `LoginPage`, que manda a `/requests` a todo rol que no sea administrador; la tarjeta de requerimientos de `DashboardPage`; el botón ámbar con el conteo de requerimientos en `QuotationsPage`; el estado vacío de `NewAccount` (dashboard), y el botón del correo interno de nueva solicitud (`api-rest/src/email/templates/newPublicQuotationCreated/forAdmin.ts`, fijo a `https://www.eventi-app.com/requests`).
- **Salidas al cotizador** (mapa 01): desde Consultas, `navigate("/quotation-form", { state: { clientId, desdeConsulta } })`; desde Requerimientos, `/quotation-form/${request.id}`.
- `frontend/src/pages/landingPage` **no** contiene el formulario de cotización. Ahí viven la portada de Eventia (`LandingPage`) y el registro de cuentas nuevas (`RegisterPage` y `NewUserRegisterForm` → `registerLead` → `POST /super-admin/lead`), que son del mapa 15.

## 3. Endpoints del motor

### 3.1 Propios del módulo (`api-rest/src/consultas`)

| Método y ruta | Controller y método | Service | Quién lo llama desde la app | Roles o @Public |
|---|---|---|---|---|
| `GET /consultas` | `ConsultasController.listar` | `ConsultasService.listar` → `ConsultasRepository.listar` (las 500 más nuevas) | `getConsultas` (`frontend/src/services/consultas.service.ts`) en `ConsultasPage`, query `["consultas"]` | Autenticado, sin `@Roles` |
| `GET /consultas/config` | `ConsultasController.configs` | `ConsultasService.configs` | `getConfigsDeConsulta`, query `["consultas","config"]` | Autenticado, sin `@Roles` |
| `PUT /consultas/config/:eventType` | `ConsultasController.guardarConfig` | `ConsultasService.guardarConfig` (máximo 2 brochures, candado de dueño) → `ConsultasRepository.guardarConfig` (upsert) | `guardarConfigDeConsulta` desde `PanelDeCorreo` | Autenticado, sin `@Roles` |
| `POST /consultas/:id/convertir` | `ConsultasController.convertir` | `ConsultasService.convertir` → `ClientsService.findMatch` / `ClientsService.create` / `ClientContactsRepository` | `convertirConsulta` desde `ConsultasPage` | Autenticado, sin `@Roles` |
| `POST /consultas/:id/descartar` | `ConsultasController.descartar` | `ConsultasService.descartar` | `descartarConsulta` desde `ConsultasPage` | Autenticado, sin `@Roles` |
| `GET /event-types` | `EventTypesController.listar` | `EventTypesService.listar` | `getEventTypes` en `ConfiguracionDelEmbudo` (query `["eventTypes","admin"]`, sin respaldo) y `eventTypesQueryOptions` (query `["eventTypes"]`, con respaldo del enum) en `QuotationForm` y `RequestForm` | Autenticado |
| `GET /event-types/public/:companyId` | `EventTypesController.listarPublico` | `EventTypesService.listarPublico` → `EventTypesRepository.listarPublico` (solo activos, solo `name`) | `getEventTypesPublic` desde `CreateQuotationPublic` | `@Public()` + `@Throttle` 30 por minuto |
| `POST /event-types` | `EventTypesController.crear` | `EventTypesService.crear` (nombre repetido → 400) | `createEventType` | Autenticado |
| `PATCH /event-types/:id` | `EventTypesController.actualizar` | `EventTypesService.actualizar` (`entrada` y/o `activo`) | `actualizarEventType` desde `FilaDeTipo` | Autenticado |
| `DELETE /event-types/:id` | `EventTypesController.eliminar` | `EventTypesService.eliminar` (`usosDe` cuenta cotizaciones y consultas) | `deleteEventType` desde `FilaDeTipo` | Autenticado |

### 3.2 Puertas públicas del formulario de cotización

| Método y ruta | Controller y método | Service | Quién lo llama desde la app | Roles o @Public |
|---|---|---|---|---|
| `POST /quotations/public/:company_id` | `QuotationsController.createPublic` | `QuotationsService.createPublic`: bifurca con `ConsultasService.embudoPara` y `ConsultasService.registrar` | `createQuotationPublic` (`frontend/src/services/quotations.service.ts`) | `@Public()` + `@Throttle` 10 por minuto |
| `GET /companies/public/:id` | `CompaniesController.findOnePublic` | `CompaniesService.findOne`; devuelve solo la cara visible (nombre, logo, banner, tagline, sitio, redes, colores, moneda) | `getCompanyPublic` | `@Public()`, solo el techo global de 300 por minuto |
| `GET /clients/types/public/:company_id` | `ClientsController.findTypesPublic` | `ClientsService.findTypes` | `getClientTypesPublic` | `@Public()`, solo el techo global |

El techo global es `ThrottlerModule.forRoot([{ ttl: 60_000, limit: 300 }])` con `ThrottlerGuard` como guardia global (`api-rest/src/app.module.ts`).

### 3.3 De otros módulos que estas pantallas consumen

| Método y ruta | Controller y método | Service | Quién lo llama desde la app | Roles o @Public |
|---|---|---|---|---|
| `POST /storage/upload` con `kind: 'consulta-brochure'` | `StorageController.upload` | `StorageService.upload`: arma la ruta `c{empresa}/consulta-brochures/{tipo}/{marca de tiempo}_{archivo}` en el balde privado `payment-receipts`; acepta imágenes o PDF, máximo 5 MB | `uploadConsultaBrochure` (`frontend/src/services/storage.service.ts`) desde `PanelDeCorreo` | Autenticado, sin `@Roles` (mapa 16) |
| `GET /quotations` con `request_type` requerimiento y `statuses` solicitada | `QuotationsController.findAll` | `QuotationsService.findAll` | `getQuotations` en `RequestsPage` y `QuotationsPage` (comparten la query `["requirements"]`) | Autenticado (mapa 02) |
| `POST /quotations` | `QuotationsController.create` | `QuotationsService.create` | `createQuotation` desde `RequestForm`, con `request_type` requerimiento y `quotation_status` solicitada | Autenticado; recepción solo puede crear requerimientos (mapa 01) |
| `PATCH /quotations/:id` | `QuotationsController.update` | `QuotationsService.update` | `updateQuotation` desde `RequestForm` | Autenticado; recepción solo edita requerimientos (mapa 01) |
| `DELETE /quotations/:id` | `QuotationsController.remove` | `QuotationsService.remove` | `deleteQuotation` desde `RequestsPage.handleDelete` | Autenticado, **sin `@Roles`**: el "solo administrador" vive solo en la pantalla (mapa 01) |
| `GET /quotations/check-conflicts` | `QuotationsController.checkConflictsWithExistingQuotations` | mismo nombre en el service | hook `useDateAvailability` en `RequestForm` | Autenticado (mapa 01) |
| Clientes, tipos de cliente y personas | controllers de `api-rest/src/clients` | `ClientsService` | `createClient`, `clientsQueryOptions`, `clientTypesQueryOptions` y `getClientContacts` desde `RequestForm` | mapa 09 |

### 3.4 Inventario de las demás puertas `@Public` (otros formularios y páginas públicas)

| Método y ruta | Controller | Qué atiende | Techo propio | Mapa |
|---|---|---|---|---|
| `GET /customer-satisfaction-survey/template`, `GET /customer-satisfaction-survey/answered` | `customer_satisfaction_survey/controller.ts` | la encuesta pública `/customer-satisfaction-survey/:companyId/:quotationId` | ninguno | 14 |
| `POST /customer-satisfaction-survey/answer` | `customer_satisfaction_survey/controller.ts` | responder la encuesta | 10 por minuto | 14 |
| `GET /quotations/:id` | `QuotationsController.findOne` | datos de la cotización para la encuesta (el comentario tiene un TODO para darle otra puerta) | ninguno | 02 y 14 |
| `GET /quotations/imprimir/:token` | `QuotationsController.hojaParaImprimir` | la hoja del PDF | 30 por minuto | 02 |
| `GET /portal/:token`, `GET /portal/:token/cotizacion/:quotationId`, `POST /portal/:token/comprobante` | `quotations/portal.controller.ts` | portal del cliente | el POST, 10 por minuto | 03 |
| `GET /marketing/baja`, `POST /marketing/baja`, `POST /marketing/webhook` | `marketing.controller.ts` | baja de campañas y avisos de Resend | baja 10 por minuto; webhook 1200 por minuto | 10 |
| `POST /super-admin/lead`, `POST /super-admin/suscription` | `super-admin.controller.ts` | lead de la landing y suscripción | 10 por minuto | 15 |
| `POST /users/signup`, `POST /auth/password/recovery`, `POST /auth/password/reset` | `users.controller.ts`, `auth.controller.ts` | alta y recuperación de contraseña | ninguno | 15 |
| `POST /email-previews` | `email/email-previews.controller.ts` | vista previa de correos | ninguno | 12 |
| `GET /health` | `health/health.controller.ts` | chequeo de vida | ninguno | 16 y 19 |

Ojo al buscar con grep: en `super-admin.controller.ts` hay un comentario que dice `@Public()` sobre `GET /super-admin/companies`, pero esa ruta **no** es pública (el comentario del 10-08 cuenta que se retiró).

## 4. Tablas de la base de datos

| Tabla | Qué guarda | Lee o escribe | Migración que la crea o modifica |
|---|---|---|---|
| `consultas` | La consulta liviana: `name`, `email`, `phone`, `client_type`, `company_name`, `event_type` (texto), `event_date`, `people_count`, `children_count`, `observations` (con el presupuesto anexado), `estado` ('respondida', 'convertida', 'descartada'), `correo_enviado`, `correo_programado_para` y `client_id` (uuid **sin FK**) | Lee y escribe (`ConsultasRepository`). También la leen `EventTypesRepository.usosDe` y `ClientsRepository.removeType` | Crea: `docs/migrations/104_modulo_consultas.sql` (con GRANT a `service_role`). Modifica: `106_consulta_correo_programado.sql` (`correo_programado_para`, sin backfill) |
| `consulta_config` | Por `(company_id, event_type)`: `texto` (null = el de la casa) y `brochures` jsonb `[{nombre, path, bytes}]` | Lee y escribe (upsert) | `104_modulo_consultas.sql` |
| `event_types` | El catálogo por empresa: `name` (único por empresa), `entrada` ('cotizacion' o 'consulta'), `activo`, `sort_order`. Se sembró con los 8 tipos históricos como 'cotizacion' | Lee y escribe (`EventTypesRepository`) | `105_tipos_de_evento.sql` (con GRANT a `service_role`) |
| `quotations` | El requerimiento que crea la rama cotización (`request_type` requerimiento, estado 'solicitada', observaciones con el prefijo `[Desde formulario publico] ---`). `usosDe` la cuenta por `event_type` | Escribe (vía `QuotationsService.create`) y lee | Foto de contexto `0_initial_models.sql`, que muestra un **CHECK de `event_type` con los 8 nombres históricos** (ver sección 12). El resto, en el mapa 01 |
| `clients` | El cliente que nace o se reconoce al entrar por la rama cotización y al convertir | Lee y escribe vía `ClientsService` (`findMatch` carga todos los clientes de la empresa) | mapa 09 |
| `client_contacts` | La persona principal (garantía de nacimiento del 31-07) o la persona que se agrega al convertir; `findMatch` también busca acá | Lee y escribe | mapa 09 |
| `client_types` | Los tipos de cliente que muestra el formulario público; su borrado revisa `consultas.client_type` | Lee | mapa 09 |
| `companies` | La marca: nombre, logo, banner, colores, sitio, redes y `notifications.replyTo` | Lee (`CompaniesRepository.findOne` en el brochure; `findOnePublic` en el formulario) | mapas 10 y 15 |
| Balde de storage `payment-receipts` (privado) | Los PDF de los brochures en `c{empresa}/consulta-brochures/…` | Escribe (`StorageService.upload`) y descarga (`ConsultasRepository.descargarBrochure`) | No es tabla, no tiene migración |

## 5. Flujos principales

### 5.1 Preparar el embudo (tipos de evento y correo)

1. En `/consultas` se aprieta "Tipos de evento" (`ConsultasPage` → `ConfiguracionDelEmbudo`).
2. Agregar: `createEventType` → `POST /event-types` → `EventTypesService.crear` (recorta el nombre y lo rechaza si viene vacío) → `EventTypesRepository.crear`. Si el nombre ya existe, el error 23505 vuelve como 'duplicado' y el motor responde "Ese tipo de evento ya existe".
3. Cambiar la entrada o el estado: `FilaDeTipo` → `actualizarEventType` → `PATCH /event-types/:id` → `EventTypesService.actualizar` → tabla `event_types`. Se invalida la query `["eventTypes"]`, y así el cotizador y `RequestForm` ven el cambio.
4. Eliminar: `deleteEventType` → `DELETE /event-types/:id` → `EventTypesService.eliminar`. Si `usosDe` (cotizaciones + consultas con ese nombre) es mayor que 0, responde 400 con el conteo; la pantalla sugiere inactivar.
5. Correo del tipo 'consulta': `PanelDeCorreo`. Subir: `uploadConsultaBrochure` → `POST /storage/upload` devuelve la **ruta** → `guardarConfigDeConsulta` con la lista nueva → `PUT /consultas/config/:eventType` → `ConsultasService.guardarConfig` (máximo 2 y ruta con prefijo `c{empresa}/`) → upsert en `consulta_config`. Guardar el texto cierra el panel (Felipe, 06-09).

### 5.2 Solicitud pública: la puerta bifurca

1. `CreateQuotationPublic` carga en paralelo `getCompanyPublic`, `getClientTypesPublic` (respaldo: `CLIENT_TYPES`) y `getEventTypesPublic` (respaldo: el enum `EventType`).
2. Valida nombre, correo y teléfono chileno (`normalizePhone`, `+56` con 9 dígitos). Si el tipo de cliente no contiene "particular", exige la organización ("Cuéntanos por quién cotizas"). Suma adultos y niños en `people_count` (Felipe, 23-07) y manda `budget_estimate` si lo hay.
3. `createQuotationPublic` → `POST /quotations/public/:company_id` → `CreateQuotationPublicDto` (correo y teléfono obligatorios) → `QuotationsService.createPublic`.
4. `createPublic` antepone "Presupuesto estimado: $…" a `observations` y pregunta `ConsultasService.embudoPara` → `EventTypesService.entradaDe` → `event_types.entrada`. Un tipo que no está en el catálogo da `null` y sigue como cotización.
5. **Rama consulta:** `ConsultasService.registrar` busca con `ConsultasRepository.consultaReciente` si el mismo correo ya **recibió** este tipo en 14 días. Luego inserta en `consultas` con `estado` 'respondida', `correo_enviado` false y `correo_programado_para` = ahora + 10 minutos (o `null` si era repetida). Responde `{ tipo: 'consulta', id }`. **No** hay correo inmediato ni aviso interno.
6. **Rama cotización:** `ClientsService.findMatch(company, email, undefined)`; si no hay calce, `ClientsService.create` con `name` = organización o persona y `contact_person` = persona (nace la persona principal). Después `QuotationsService.create` con `request_type` requerimiento y estado 'solicitada'. Salen, sin esperar, `EmailService.sendEmail(NEW_PUBLIC_QUOTATION_CLIENT)` al interesado (con el token del portal si hay contacto) y `NEW_PUBLIC_QUOTATION_ADMIN` a todos los administradores (`UsersService.findAll(company, ADMINISTRADOR)`). Estos correos son del mapa 12.
7. La app muestra "¡Solicitud enviada!" en las dos ramas. Si falla, lo dice y deja reintentar (22-07).

### 5.3 El reloj despacha el brochure

1. `ConsultasCronService.despachar` corre cada minuto (`@Cron(CronExpression.EVERY_MINUTE)`), solo si `NODE_ENV === 'production'` (`ScheduleModule.forRoot` en `app.module.ts`).
2. `ConsultasService.despacharPendientes` → `ConsultasRepository.pendientesDeEnvio`: `correo_enviado` false, cita no nula y vencida, `created_at` de las últimas 24 horas, 20 por vuelta. Esta lectura es global, sin `company_id`.
3. Por cada una, `tomarEnvio` pone la cita en `null` solo si todavía no lo estaba; si otra vuelta ya se la llevó, sigue con la siguiente.
4. Relee `consulta_config` (`repo.config`) y llama `enviarBrochure`: marca con `marcaDesdeFila`, filtra los brochures cuya ruta no empieza con `c{empresa}/`, descarga cada PDF del balde, cambia `{nombre}` por el primer nombre (o usa `TEXTO_DE_LA_CASA`), escapa cada párrafo con `escaparHtml`, arma `plantillaCampana` sin link de baja ni botón de cotizar y envía por **Resend directo**: `from` `{empresa} <hola@eventi-app.com>`, asunto "{empresa}: valores para tu {tipo}" y `replyTo` solo si la empresa lo tiene.
5. Si sale bien, `actualizar` deja `correo_enviado` en true. Si falla, solo queda en el log; la consulta queda con `correo_enviado` false y sin cita, y la bandeja la muestra como "Sin brochure". Nadie reintenta.

### 5.4 Convertir o descartar una consulta

1. En la bandeja, "Convertir" → `ConfirmInline` → `convertirConsulta` → `POST /consultas/:id/convertir` → `ConsultasService.convertir`.
2. Si ya está 'convertida' con `client_id`, devuelve lo mismo (idempotente).
3. `ClientsService.findMatch` solo por correo. **Si existe**, `ClientContactsRepository.findByClient` y, si el correo no está entre sus personas, `ClientContactsRepository.create` con `is_primary: false` (mejor esfuerzo: si falla, solo va al log). **Si no existe**, `ClientsService.create` con la organización o la persona como nombre y `client_type` o 'Particulares'.
4. `ConsultasRepository.actualizar` pone `estado` 'convertida' y `client_id`. Responde `{ consulta, client_id, contact_name }`.
5. La app invalida `["consultas"]` y `["clients"]` y navega a `/quotation-form` con `clientId` y `desdeConsulta` (tipo, fecha, personas, niños y contacto). `QuotationForm` precarga esos campos una sola vez al montar; la cotización nace recién al guardar (mapa 01).
6. "Descartar" → `descartarConsulta` → `POST /consultas/:id/descartar` → `ConsultasService.descartar`: 404 si no existe, 400 si ya está convertida y, si no, `estado` 'descartada'.

### 5.5 Requerimiento: del formulario público o del teléfono a la cotización

1. `RequestsPage` pide `getQuotations(REQUERIMIENTO, [SOLICITADA])` con la query `["requirements"]`, la misma de `QuotationsPage`.
2. "Nuevo Requerimiento" abre `RequestForm`. Si el cliente es nuevo: `createClient`. Al guardar: `createQuotation` con `request_type` requerimiento y estado solicitada → `POST /quotations` → `QuotationsController.create` (recepción no puede crear otra cosa, 28-07).
3. Editar: `updateQuotation` → `PATCH /quotations/:id`. `RequestForm` conserva `contact_name` (Felipe, 05-09).
4. "Crear Cotización" (solo con `quotations_edit`) → `/quotation-form/:id`, que ya es el cotizador (mapa 01).
5. "Eliminar" (solo administrador en pantalla) → `ConfirmInline` → `deleteQuotation` → `DELETE /quotations/:id`.
6. "Enlace Público" muestra y copia `https://www.eventi-app.com/public-quotation/{company.id}`, siempre con el dominio productivo (Felipe, 23-07).

## 6. Reglas de negocio acordadas

1. **Separar la CONSULTA (cientos, costo cero) de la COTIZACIÓN (decenas, la atención de verdad).** Doc 12, acordado con Felipe el 05-09-2026.
2. **La entrada la declara el tipo de evento en su catálogo, no la existencia de brochure.** Segunda vuelta de Felipe, 05-09: *"ahí mismo se puede marcar como cotización o consulta como una categoría, agregar o eliminar"*. Evidencia: doc 12 punto 1, `ConsultasService.embudoPara` y la prueba "la categoría decide".
3. **Tipo de CLIENTE (quién compra) y tipo de EVENTO (qué celebran) son ejes separados;** el embudo solo mira el tipo de evento. Evidencia: doc 12 y los comentarios de `EventTypesService` y de `ConfiguracionDelEmbudo`.
4. **Un tipo en uso no se elimina: se inactiva y deja de ofrecerse. Renombrar no existe en v1** (el histórico guarda el texto). Evidencia: doc 12, migración 105, `EventTypesService.eliminar` y `EventTypesRepository.listarPublico` (solo activos).
5. **Un tipo que no está en el catálogo entra como cotización.** Evidencia: comentario de `EventTypesRepository.entradaDe` ("tipo histórico").
6. **El cotizador y el formulario público leen el catálogo vivo; el enum solo es respaldo.** Evidencia: doc 12, `eventTypesQueryOptions` y `CreateQuotationPublic`. El administrador de tipos, en cambio, va **sin respaldo**: un respaldo con ids falsos hacía fallar el switch (comentario de `ConfiguracionDelEmbudo`, 05-09).
7. **La respuesta automática espera 10 minutos.** Felipe, 05-09: *"un delay de 10 min para las respuestas automáticas"*; una respuesta instantánea delata al robot. Evidencia: `RETRASO_DEL_CORREO_MS`, migración 106 y la prueba "el delay del embudo".
8. **El reloj es del motor porque Resend no programa correos con adjuntos.** Evidencia: doc 12 y `consultas-cron.service.ts`.
9. **La configuración del tipo se relee al enviar:** si cambió el brochure en esos 10 minutos, sale el nuevo. Evidencia: doc 12 y `despacharPendientes` (revisión 06-09: antes se leía la config sin usarla).
10. **Jamás reintentos infinitos.** Si el envío falla, queda a la vista como no enviada; el reloj solo mira las últimas 24 horas. Evidencia: doc 12, `pendientesDeEnvio`, `tomarEnvio` y la prueba "si el envío del reloj falla".
11. **Regla de una vez:** el mismo correo con el mismo tipo dentro de 14 días queda registrado, pero no recibe el brochure de nuevo. Evidencia: doc 12 punto 4, `DIAS_SIN_REPETIR` y `consultaReciente`. En el código solo cuentan los envíos que **salieron** (ver sección 11).
12. **Máximo 2 brochures por tipo, y siempre de la empresa.** El balde es compartido entre empresas; el candado de dueño está en `guardarConfig` y hay un segundo cinturón en `enviarBrochure` (revisión 06-09). Evidencia: esas funciones y sus dos pruebas.
13. **Un tipo 'consulta' sin brochure manda el correo solo con texto;** la pantalla lo advierte en ámbar. Evidencia: doc 12 y `FilaDeTipo`.
14. **El brochure lleva la marca completa de marketing, sin link de baja ni botón de cotizar.** Felipe, 05-09: *"aprovechemos esa configuración que ya la hicimos"*. Es respuesta a una consulta, no campaña; lo que se busca es que responda. Evidencia: `enviarBrochure` y el JSDoc de `plantillaCampana`.
15. **Convertir es un clic humano; no se lee el buzón** (frágil y fuera de alcance). Evidencia: doc 12 punto 6 y la cabecera de `consultas.service.ts`.
16. **Al convertir, quien consultó queda como persona de contacto.** Felipe, 05-09: *"persona de contacto no me trajo a nadie"*. Evidencia: `convertir` y la prueba "cliente existente: el consultante queda como persona de contacto".
17. **Convertir trae al cotizador la fecha, las cantidades y el nombre.** Felipe, 05-09: *"no trajo la fecha y tampoco el nombre del cliente"*. Un 0 legítimo también viaja (revisión 06-09). Evidencia: `ConsultasPage` y el efecto `desdeConsulta` de `QuotationForm`.
18. **Convertir es idempotente y una consulta convertida no se descarta.** Evidencia: `convertir`, `descartar` y sus pruebas.
19. **"Tus datos" son SIEMPRE la persona de contacto; el CLIENTE es la organización si la hay.** Doc 12, "La persona y el cliente" (05-09). Evidencia: `createPublic` y `convertir` (`company_name || name`), y la caja obligatoria de `CreateQuotationPublic` con etiqueta según el tipo de cliente.
20. **El match anti-duplicados es SOLO POR CORREO.** Regla de Felipe: la gente cambia de empresa o colegio y conserva su número. Rige en el formulario público y al convertir. Evidencia: doc 12, y `createPublic` y `convertir` pasan `undefined` como teléfono a `findMatch`.
21. **El presupuesto estimado viaja dentro de las observaciones;** si algún día se quiere filtrar, se vuelve columna. Evidencia: doc 12 y `createPublic`.
22. **Un tipo de cliente usado por consultas no se puede eliminar,** porque al convertir nacerían clientes con tipo huérfano. Evidencia: comentario del 05-09 en `ClientsRepository.removeType`.
23. **El CRM no se ensucia con curiosos, no se manda el brochure dos veces en 14 días y las consultas no entran en analytics ni en el pipeline.** Evidencia: doc 12, "Lo que a propósito NO hace". El grep confirma que `analytics` no lee `consultas`.
24. **Correo y teléfono obligatorios también en el servidor.** Regla de Felipe del 30-07. Evidencia: `CreateQuotationPublicDto` ("hoyo pillado el 30-07").
25. **El formulario público nunca finge éxito.** Evidencia: `CreateQuotationPublic.handleSubmit` (bug histórico corregido el 22-07).
26. **Recepción registra requerimientos y convertirlos en cotización es pega de venta.** Evidencia: `QuotationsController.create` (28-07) y `RequestsPage.puedeCotizar` (12-08).
27. **El enlace público lleva siempre el dominio eventi-app.com.** Felipe, 23-07. Evidencia: `RequestsPage.getPublicQuotationLink`.
28. **Descartar una consulta NO cancela el brochure ya citado.** Felipe, 12-09-2026, al ver que su consulta de prueba recibió el correo tres minutos después de descartarla: *"no es un error, está bien que si lo descarto, se envíe el correo igual, sino dejaría un cliente sin respuesta"*. Descartar dice que ese evento no es negocio para la casa, no que a la persona se le deje de responder. Evidencia: `ConsultasService.descartar` solo cambia `estado`; `pendientesDeEnvio` mira `correo_enviado` y `correo_programado_para`.

## 7. Conexiones con otros módulos

**A quién usa:**

- **Clientes (mapa 09):** `ClientsService.findMatch` y `ClientsService.create` (con la garantía de nacimiento de la persona principal), y `ClientContactsRepository.findByClient`/`create`. `ClientsModule` exporta `ClientContactsRepository` justamente para el embudo.
- **Empresa (mapa 15):** `CompaniesRepository.findOne` para la marca del brochure, y `GET /companies/public/:id` para el formulario.
- **Marketing (mapa 10):** `marcaDesdeFila` (`api-rest/src/marketing/marca.ts`) y `plantillaCampana` (`api-rest/src/marketing/plantilla.ts`). Un cambio en la plantilla de campañas cambia el brochure.
- **Storage (mapa 16):** `StorageService.upload` (kind `consulta-brochure`) y la descarga directa del balde `payment-receipts` en `ConsultasRepository.descargarBrochure`.
- **Correos (mapa 12):** solo la rama cotización usa `EmailService.sendEmail` (`NEW_PUBLIC_QUOTATION_CLIENT` y `NEW_PUBLIC_QUOTATION_ADMIN`). El brochure sale por Resend directo y **no** pasa por `EmailService`, así que el silenciador `EMAILS_SILENCED` (que solo vive en `email.service.ts`) no lo apaga.
- **Variables de entorno que lee el módulo:** `RESEND_API_KEY` y `FRONTEND_URL` (para los íconos del correo).

**Quién lo usa:**

- **Cotizador (mapa 01):** `QuotationsModule` importa `ConsultasModule`. `QuotationsService.createPublic` llama `embudoPara` y `registrar`. `QuotationForm` y `RequestForm` leen el catálogo de tipos con `eventTypesQueryOptions`, y `QuotationForm` recibe `desdeConsulta`. El mapa 01 también describe la puerta pública desde el lado del cotizador.
- **Clientes (mapa 09):** `ClientsRepository.removeType` cuenta `consultas.client_type` antes de borrar un tipo de cliente.
- **Envío de cotizaciones (doc 13, mapa 02):** tomó de `consultas.service.ts` el patrón de adjuntos por Resend.
- **A futuro (doc 12, no construido):** las consultas no convertidas como audiencia de remarketing del mapa 10.

**Efectos automáticos:**

- **Reloj:** `ConsultasCronService.despachar`, cada minuto y solo en producción.
- **Correos:** el brochure (rama consulta, a los 10 minutos o en la vuelta siguiente); "Recibimos tu solicitud" y el aviso interno (rama cotización, al instante). Convertir y descartar no mandan correos por sí mismos, y descartar tampoco cancela el brochure ya citado: es una regla del negocio, no un descuido (sección 6).
- **Cascadas en código:** crear un cliente crea su persona principal; convertir sobre un cliente existente agrega a la persona si su correo no está.
- **Caché del panel:** `PanelInvalidationInterceptor` (`api-rest/src/cache/panel-invalidation.interceptor.ts`) no invalida cuando no hay `req.user`. Por eso el requerimiento que entra por la puerta pública no refresca el panel del Dashboard (mapa 13) hasta la siguiente escritura con sesión o hasta que expire el caché.

**Pantallas de otros módulos que se ven afectadas:** el tablero de cotizaciones (botón ámbar con el conteo de `["requirements"]`), la tarjeta de requerimientos del Dashboard, el selector de tipos del cotizador y la ficha 360 del cliente (el cliente y la persona que nacen al convertir o al entrar por la rama cotización).

## 8. Zonas de riesgo: si tocas esto, cuidado con aquello

1. **Si tocas** el orden de los parámetros del constructor de `QuotationsService` (por ejemplo, subir `consultasService`), **se afectan** decenas de pruebas de una vez, **porque** las specs arman el servicio por posición. Evidencia: comentario del constructor en `api-rest/src/quotations/quotations.service.ts`: *"insertarla al medio rompió 34 de una (05-09)"*.
2. **Si tocas** las migraciones creando una tabla nueva del embudo sin `GRANT` a `service_role`, **se afecta** todo el módulo, que responde "permission denied", **porque** el motor entra con service_role. Evidencia: `104_modulo_consultas.sql` y `105_tipos_de_evento.sql` ("quemadura del 05-09 en el lab").
3. **Si tocas** el escape de comodines de `ConsultasRepository.consultaReciente`, **se afectan** interesados nuevos que se quedan sin brochure, **porque** un `_` en ILIKE calza con correos ajenos que difieren en un carácter. Evidencia: comentario de la revisión 06-09 ("ana_soto@…").
4. **Si tocas** el candado de dueño (prefijo `c{empresa}/`) en `ConsultasService.guardarConfig` o en `enviarBrochure`, **se afecta** la privacidad entre empresas: el correo de una podría adjuntar PDF de otra, **porque** el balde `payment-receipts` es compartido y el `path` viaja como texto libre en el body. Evidencia: esos comentarios y las pruebas "el candado de dueño" y "el reloj tampoco adjunta rutas ajenas".
5. **Si tocas** `ConsultasRepository.tomarEnvio` para que no limpie la cita (o para "reintentar"), **se afecta** el interesado, que recibiría un correo por minuto con un brochure roto o con Resend caído, **porque** limpiar la cita es la única barrera. Evidencia: doc 12 ("jamás reintentos infinitos") y las pruebas del reloj.
6. **Si tocas** la validación de `event_type` en `api-rest/src/quotations/dto/create-quotation.dto.ts` volviendo al enum, **se afectan** el formulario público y el cotizador, que rechazan los tipos creados en pantalla, **porque** el catálogo es administrable. Evidencia: comentario del DTO (05-09). Riesgo gemelo en la base: ver pregunta 1 de la sección 12.
7. **Si tocas** el nombre de un tipo directamente en la base, **se afectan** `consulta_config`, `consultas` y `quotations`, que quedan huérfanas del catálogo, **porque** todas guardan el nombre como texto (la PK de `consulta_config` es `(company_id, event_type)`). Evidencia: doc 12 ("renombrar NO existe en v1") y migraciones 104 y 105.
8. **Si tocas** `createPublic` o `convertir` pasando el teléfono a `findMatch`, **se afectan** las solicitudes, que se enganchan a la organización vieja de la persona, **porque** `ClientsRepository.findMatch` sí sabe calzar por los últimos 9 dígitos. Evidencia: regla de Felipe del 05-09 en ambos métodos y en el doc 12.
9. **Si tocas** `NODE_ENV` o la condición de `ScheduleModule` en `app.module.ts`, **se afectan** todas las consultas: quedan citadas y el brochure no sale nunca, **porque** el reloj solo corre en producción; pasadas 24 horas, `pendientesDeEnvio` ya no las mira y `textoEstado` las deja para siempre en "Sale a las HH:MM". Evidencia: `app.module.ts`, `pendientesDeEnvio` y `ConsultasPage.textoEstado`.
10. **Si "arreglas" que descartar frene el brochure, rompes una regla del negocio.** Felipe, 12-09-2026: *"está bien que si lo descarto, se envíe el correo igual, sino dejaría un cliente sin respuesta"*. Descartar es una decisión comercial de la casa; la persona que escribió igual merece su respuesta. `pendientesDeEnvio` no filtra por `estado` A PROPÓSITO. Lo que sigue siendo cierto, y conviene saber: tampoco frena el envío cambiar la entrada del tipo ni inactivarlo, porque el reloj no vuelve a mirar `event_types`. Evidencia: `ConsultasRepository.pendientesDeEnvio`, `ConsultasService.despacharPendientes`, y la regla 19 de la sección 6.
11. **Si tocas** la regla de una vez (`consultaReciente`) sin mirar la cita, **se afecta** quien envía dos veces el formulario dentro de 10 minutos, que recibe **dos** brochures, **porque** la búsqueda exige `correo_enviado = true` y el primero aún no sale. Evidencia: `ConsultasRepository.consultaReciente` y `ConsultasService.registrar`.
12. **Si tocas** `CreateQuotationPublicDto` heredando `email` y `phone` de `CreateClientDto`, **se afecta** la API, que vuelve a aceptar solicitudes sin correo, **porque** se arrastra su `ValidateIf`. Evidencia: comentario "hoyo pillado el 30-07" en `create-quotation-public.dto.ts`.
13. **Si tocas** `convertir.onSuccess` en `ConsultasPage` quitando la invalidación de `["clients"]`, **se afecta** el cotizador, que abre sin el cliente puesto, **porque** busca el `clientId` en la lista cacheada y el cliente puede haber nacido recién. Evidencia: comentario en `ConsultasPage`.
14. **Si tocas** los campos de `desdeConsulta` o su filtro `!= null`, **se afecta** la precarga del cotizador (sin fecha, sin nombre o perdiendo un 0), **porque** el efecto de `QuotationForm` copia campo por campo y solo al montar. Evidencia: comentarios del 05-09 y del 06-09 en `QuotationForm` y `ConsultasPage`.
15. **Si tocas** `PanelDeCorreo.subirArchivo` para usar la lista del render en vez de `guardar.data`, **se afecta** el primer PDF, que queda pisado al subir el segundo rápido, **porque** la query todavía no se refrescó. Evidencia: comentario de la revisión 06-09 en `PanelDeCorreo`.
16. **Si tocas** `enviarBrochure` pensando que un correo más del embudo es inofensivo en el laboratorio, **se afectan** destinatarios reales, **porque** `EMAILS_SILENCED` solo apaga `EmailService.sendEmail` y el brochure va por Resend directo. Evidencia: grep de `EMAILS_SILENCED` en `api-rest/src/email/email.service.ts`.
17. **Si tocas** la forma de la respuesta de `createPublic` (hoy `{ tipo: 'consulta', id }` en una rama y la cotización creada en la otra), **se afecta** cualquier pantalla que lea `data`, **porque** `createQuotationPublic` la trata siempre como `Quotation`. Hoy `CreateQuotationPublic` solo mira el error. Evidencia: `QuotationsService.createPublic` y `frontend/src/services/quotations.service.ts`.
18. **Si tocas** los permisos del menú o de la ruta `/consultas` (hoy `section: "quotations"`, que incluye recepción), **se afecta** quién administra tipos, brochures y conversiones, **porque** el motor no tiene `@Roles` en `ConsultasController` ni en `EventTypesController`: la pantalla es la única barrera. Evidencia: `frontend/src/App.tsx`, `frontend/src/layout/Sidebar.tsx` y los dos controllers.

## 9. Pruebas que lo protegen

**`api-rest/src/consultas/tests/consultas.service.spec.ts`** (Resend y el repositorio simulados):

- la categoría decide (tipo 'cotizacion' no filtra; 'consulta' sí) y el veredicto no lee la config;
- `registrar` cita a +10 minutos y no envía;
- una consulta repetida queda sin cita;
- el reloj relee la config, envía y marca `correo_enviado`;
- si otro reloj se la llevó (`tomarEnvio` false), no envía;
- si el envío falla, no se marca como enviada;
- `convertir` encuentra al cliente existente y es idempotente;
- con cliente existente, el consultante queda como contacto, sin duplicarlo si el correo ya está (sin distinguir mayúsculas);
- el candado de dueño en `guardarConfig`;
- el reloj no adjunta rutas ajenas;
- una consulta convertida no se descarta.

**`api-rest/src/quotations/tests/unit/quotations.service.spec.ts`** y **`candado-evento-realizado.spec.ts`** solo simulan `ConsultasService.embudoPara` (devuelve `null`) para poder armar `QuotationsService`. No prueban el embudo.

**Lo importante que NO está cubierto:**

- `QuotationsService.createPublic`: 0 pruebas (grep de `createPublic` en los specs). Queda sin cubrir la bifurcación, el presupuesto en observaciones, el cliente nombrado por la organización, el prefijo "[Desde formulario publico]" y los dos correos.
- `EventTypesService` y `EventTypesRepository`: sin pruebas (duplicado, eliminar en uso, `listarPublico` solo activos, `entradaDe` nulo).
- `ConsultasRepository` real: ni el escape de ILIKE, ni la ventana de 24 horas, ni el límite de 20, ni el candado atómico contra la base.
- El contenido de `enviarBrochure`: asunto, `from`, `replyTo`, `{nombre}` y escape HTML.
- `ClientsRepository.findMatch`: sin pruebas.
- Los casos de las zonas de riesgo 10 y 11 (descartar dentro de los 10 minutos, doble brochure), la conversión concurrente y la conversión de una descartada.
- El frontend sí tiene suite (`vitest`, `npm run test` en `frontend/package.json`; CLAUDE.md está desactualizado en ese punto), pero ninguno de sus specs toca este módulo (grep de los cinco nombres en `*.test.ts(x)` sin resultados): nada protege `CreateQuotationPublic`, `ConsultasPage`, `PanelDeCorreo`, `RequestsPage` ni `RequestForm`.
- E2E: `api-rest/test/app.e2e-spec.ts` solo prueba `GET /`.

## 10. Deuda y rarezas conocidas

- **Comentarios y textos viejos que contradicen al código:** dicen que el embudo lo activa tener brochure, o que el correo sale "al tiro". Aparecen en el JSDoc de `ConsultasController` ("cuando el tipo de evento tiene brochures configurados"), en la cabecera de `consultas.service.ts` ("El embudo se activa por configuración: un tipo de evento filtra cuando tiene brochure(s)"), en el comentario del embudo en `QuotationsService.createPublic` ("recibe el brochure al tiro"), en el JSDoc de `ConsultasPage` ("brochure enviado al tiro"), en su texto vacío ("Llegarán solas cuando un tipo de evento tenga brochure configurado") y en la explicación de la pestaña de tipos ("recibe el correo con brochure al tiro"). El código y el doc 12 dicen: categoría y 10 minutos.
- **El estado 'respondida' nace antes de responder:** `registrar` crea con `estado` 'respondida' y `correo_enviado` false. La pantalla lo compensa con chips, pero "Sin brochure" no distingue una repetida de una fallida; solo el tooltip lo aclara.
- **La bandeja no muestra `observations`, `company_name` ni `client_type`,** y la interfaz `Consulta` de `frontend/src/services/consultas.service.ts` ni siquiera trae `company_name`.
- **Una consulta queda 'convertida' al apretar Convertir, aunque la cotización nunca se guarde,** y `consultas` no guarda el id de la cotización.
- **Una consulta descartada se puede convertir:** `ConsultasPage` muestra "Convertir" para todo estado distinto de 'convertida' y `convertir` no revisa 'descartada'.
- **`consultas.client_id` es uuid sin FK** (migración 104): borrar un cliente deja la referencia colgando; `ClientsRepository.remove` no revisa `consultas`.
- **Basura que no se limpia:** quitar un brochure en `PanelDeCorreo` no borra el PDF del storage; eliminar un tipo (`EventTypesRepository.eliminar`) no borra su fila de `consulta_config`; `PUT /consultas/config/:eventType` no valida que el tipo exista en el catálogo.
- **Solo la pantalla exige PDF:** `PanelDeCorreo` revisa `application/pdf`, pero `StorageService.upload` acepta también imágenes para `consulta-brochure`.
- **Valores escritos a mano en el código:** `nombreNatural` conoce solo 5 tipos (el resto va en minúsculas tal cual); el `from` `hola@eventi-app.com` y el respaldo `https://www.eventi-app.com` de `FRONTEND_URL` están fijos en `enviarBrochure`; el link público y el botón del aviso interno llevan el dominio fijo.
- **Métodos del repositorio sin `company_id`:** `ConsultasRepository.pendientesDeEnvio` y `descargarBrochure` rompen la regla de CLAUDE.md ("Every repo method takes `companyId`"). Tiene motivo: el reloj es global, lo dice el comentario, y el candado y los envíos sí filtran por empresa.
- **Rarezas de clientes que el embudo hereda:** `ClientContactsRepository` vive dentro de `client-contacts.controller.ts`; `convertir` le pasa el contacto con `as never`; `ClientsRepository.findMatch` trae todos los clientes y personas de la empresa a memoria y no revisa el `error` de Supabase (mapa 09).
- **Las puertas públicas de lectura no tienen techo propio:** `GET /companies/public/:id` y `GET /clients/types/public/:company_id` solo llevan el techo global de 300 por minuto.
- **`createPublic` con `observations` vacío por API directa** guarda "`[Desde formulario publico] --- undefined`" (plantilla de texto). El formulario web siempre manda texto.
- **`RequestsPage`:** el modal "Enlace Público" está hecho a mano (`fixed inset-0`), no con `components/Modal`, y no figura en la lista de deuda de modales de CLAUDE.md. El envoltorio de la confirmación del basurero (`absolute … z-20 bg-white … shadow-lg`) calza con el patrón del portero "panel flotante a mano" (techo 13). Tiene dos `userRole as any`, `console.error` y emojis en los textos de estado. Su explicación del enlace dice "Cada solicitud se creará automáticamente como un nuevo requerimiento aquí" y "Recibirás notificación de cada nueva solicitud", lo que ya no es cierto para los tipos 'consulta'.
- **`RequestForm`:** el doc 09 (Tanda A4) anota que "editar un requerimiento sin fecha deja la pantalla en blanco". El código sigue haciendo `request.event_date.split("T")[0]` sin resguardo. `CreateQuotationDto` exige fecha, así que el caso vendría de datos viejos (no verificado).
- **`CreateQuotationPublic`:** la fecha mínima es `new Date().toISOString()` (hora universal), pendiente de la Tanda A1 del doc 09 (ver sección 11). El tipo inicial es `EventType.ALMUERZO_O_CENA`, venga o no en el catálogo vivo, y tiene `event_date: formData.event_date as any`.
- **Tamaños:** `CreateQuotationPublic.tsx` 771 líneas, `RequestForm.tsx` 723, `ConsultasPage.tsx` 666, `RequestsPage.tsx` 629, `consultas.service.ts` 362. Ninguno pasa las 800 del portero (techo de 27 archivos) ni está en la lista de gigantes congelados. `CreateQuotationPublic` está cerca del borde. `QuotationForm.tsx` (congelado en 3936) es el que recibe `desdeConsulta`: lo nuevo del embudo que toque el cotizador debe ir en archivo propio.
- **Límites silenciosos:** la bandeja trae 500 consultas; el reloj despacha 20 por minuto.
- **Sin TODOs en los archivos del módulo:** el único calce de grep es la frase "HONESTIDAD ANTE TODO" en `CreateQuotationPublic`.

## 11. Contradicciones entre documento y código

1. **Regla de una vez.** Doc 12 punto 4: *"el mismo correo consultando el mismo tipo dentro de 14 días queda registrado pero NO recibe el brochure de nuevo"*. Código: `ConsultasRepository.consultaReciente` solo cuenta consultas con `correo_enviado = true`. Una segunda consulta dentro de los 10 minutos de la primera, o después de un envío fallido, **sí** recibe brochure.
2. **"respondida (brochure enviado)".** Doc 12 punto 5 define *respondida* como brochure enviado. Código: `ConsultasService.registrar` crea todas las consultas con `estado` 'respondida' y `correo_enviado` false, antes de cualquier envío (y también las repetidas, que nunca lo reciben).
3. **replyTo.** Doc 12 punto 3: el reloj envía con *"replyTo a la casilla de la empresa"*. Código: `enviarBrochure` pone `replyTo` solo si `marcaDesdeFila` encuentra `notifications.replyTo`; si no, las respuestas van a `hola@eventi-app.com`.
4. **Presupuesto visible en consultas.** Doc 12, "La persona y el cliente": el presupuesto viaja en observaciones, *"visible en requerimientos y consultas"*. Código: `ConsultasPage` no muestra `observations` en ninguna parte.
5. **El enum solo como respaldo.** Doc 12 punto 1: *"el enum del código queda solo como respaldo si el catálogo no responde"*. Código: `CreateQuotationPublic` arranca siempre con `event_type: EventType.ALMUERZO_O_CENA` del enum, aunque el catálogo vivo haya cargado y ese tipo esté inactivo o no exista. `entradaDe` no filtra `activo`.
6. **El texto de `RequestsPage` contra la bifurcación.** Doc 12 punto 2: con un tipo en embudo *"NO se crea cliente ni cotización"*. Código: el modal "Enlace Público" de `RequestsPage` promete que *"Cada solicitud se creará automáticamente como un nuevo requerimiento aquí"* y que habrá notificación de cada una.
7. **Fecha mínima del formulario público.** Doc 09, Tanda A1: *"Decisión de Felipe sobre el formulario público: el mínimo es hoy + 2"*, con `hoyEnChileMas(2)` ya escrito. Código: `CreateQuotationPublic` usa `min={new Date().toISOString().split("T")[0]}` (hoy en hora universal), y `hoyEnChileMas` existe en `frontend/src/utils/dates.ts` pero no lo usa ninguna pantalla. Es una tanda pendiente del plan, no un retroceso.

## 12. Preguntas abiertas

1. **¿Sigue vivo en producción el CHECK de `quotations.event_type` con los 8 nombres históricos?** La foto `docs/migrations/0_initial_models.sql` lo muestra; ninguna migración posterior lo quita (grep de `event_type` y `DROP CONSTRAINT`), y la foto se declara "for context only". Si sigue vivo, un tipo nuevo creado en pantalla con entrada 'cotizacion' pasaría el DTO y fallaría al insertar el requerimiento o la cotización. Las consultas no tienen ese CHECK. No se verificó en la base (fuera de alcance).
2. **¿Recepción debe administrar tipos de evento y brochures, y convertir consultas?** Hoy ve `/consultas` (`section: "quotations"`), el motor no tiene `@Roles` y `/quotation-form` la rebota después de que el cliente ya nació y la consulta quedó convertida.
3. **¿Descartar o convertir dentro de los 10 minutos debería frenar el brochure?** Y **¿se quiere evitar el doble brochure** cuando el mismo correo envía dos veces en esa ventana?
4. **¿Una consulta descartada debe poder convertirse?** ¿Y debería quedar 'convertida' recién al guardar la cotización, guardando su id?
5. **¿Es a propósito que la rama consulta no avise internamente** ni mande un "recibimos tu consulta" inmediato? El doc 12 no lo dice.
6. **¿El laboratorio corre con `NODE_ENV = 'production'`?** Si no, el reloj no despacha; si sí, `EMAILS_SILENCED` no apaga el brochure. No se puede ver desde el código.
7. **¿Todas las empresas tienen `notifications.replyTo`?** Si no, las respuestas al brochure llegan a `hola@eventi-app.com`.
8. **¿Eliminar un tipo de evento debe limpiar su `consulta_config` y sus PDF?** ¿Y quitar un brochure debe borrar el archivo?
9. **¿El presupuesto y la organización deben verse en la bandeja, o se corrige el doc 12?**
10. **¿Qué responde `POST /quotations/public/:company_id` con una empresa inexistente o con texto en el id?** No se ejecutó nada para verificarlo.
11. **¿`GET /companies/public/:id` y `GET /clients/types/public/:company_id` necesitan techo propio,** como sus hermanas de escritura?
12. **¿Existen en la base requerimientos sin `event_date`** que hagan reaparecer la pantalla en blanco de `RequestForm` que anota el doc 09?
13. **Remarketing de consultas no convertidas** (doc 12 punto 7): no está construido; ¿entra en el plan de marketing?

## 13. Archivos clave

**Motor**

- `api-rest/src/consultas/consultas.module.ts`: importa `ClientsModule` y `CompaniesModule` y exporta `ConsultasService`.
- `api-rest/src/consultas/consultas.controller.ts`, `consultas.service.ts`, `consultas.repository.ts`, `consultas-cron.service.ts`.
- `api-rest/src/consultas/event-types.controller.ts`, `event-types.service.ts`, `event-types.repository.ts`.
- `api-rest/src/consultas/dto/consultas.dto.ts`.
- `api-rest/src/consultas/tests/consultas.service.spec.ts`.
- `api-rest/src/quotations/quotations.controller.ts` (`createPublic`) y `quotations.service.ts` (`createPublic`, constructor).
- `api-rest/src/quotations/dto/create-quotation-public.dto.ts` y `dto/create-quotation.dto.ts` (`event_type` como texto).
- `api-rest/src/quotations/quotations.module.ts` (importa `ConsultasModule`).
- `api-rest/src/clients/clients.repository.ts` (`findMatch`, `removeType`), `clients.service.ts` (`create`, garantía de nacimiento), `clients.controller.ts` (`findTypesPublic`), `client-contacts.controller.ts` (`ClientContactsRepository`), `clients.module.ts`.
- `api-rest/src/companies/companies.controller.ts` (`findOnePublic`).
- `api-rest/src/storage/storage.service.ts` y `storage/dto/upload-file.dto.ts` (kind `consulta-brochure`).
- `api-rest/src/marketing/marca.ts` y `marketing/plantilla.ts`.
- `api-rest/src/email/email.service.ts` y `email/templates/newPublicQuotationCreated/forAdmin.ts`.
- `api-rest/src/email/templates/utils/index.ts` (`escaparHtml`).
- `api-rest/src/app.module.ts` (`ScheduleModule`, `ThrottlerModule`, `ThrottlerGuard`).
- `api-rest/src/cache/panel-invalidation.interceptor.ts`.
- `docs/migrations/104_modulo_consultas.sql`, `105_tipos_de_evento.sql`, `106_consulta_correo_programado.sql` y `0_initial_models.sql` (foto con el CHECK de `event_type`).

**App**

- `frontend/src/pages/consultas/ConsultasPage.tsx` (`ConsultasPage`, `ConfiguracionDelEmbudo`, `FilaDeTipo`) y `frontend/src/pages/consultas/PanelDeCorreo.tsx`.
- `frontend/src/pages/quotations/CreateQuotationPublic.tsx`.
- `frontend/src/pages/RequestsPage.tsx` y `frontend/src/components/RequestForm.tsx`.
- `frontend/src/services/consultas.service.ts`, `eventTypes.service.ts` (`eventTypesQueryOptions`, `getEventTypesPublic`), `quotations.service.ts` (`createQuotationPublic`), `companies.service.ts` (`getCompanyPublic`), `clientTypes.service.ts` (`getClientTypesPublic`), `storage.service.ts` (`uploadConsultaBrochure`).
- `frontend/src/pages/quotations/QuotationForm.tsx` (efecto `desdeConsulta`).
- `frontend/src/App.tsx`, `frontend/src/layout/Sidebar.tsx`, `frontend/src/constants/permissions.ts`, `frontend/src/constants/api.routes.ts` (`CONSULTAS`, `EVENT_TYPES`, `QUOTATIONS_PUBLIC`, `CLIENT_TYPES_PUBLIC`).
- `frontend/src/types/quotations.types.ts` (`EventType`, `QuotationPublicFormData`).
- `frontend/src/components/PieDeMarcaPublico.tsx`, `frontend/src/utils/phone.ts`, `frontend/src/utils/urls.ts`, `frontend/src/utils/dates.ts` (`hoyEnChileMas`).
