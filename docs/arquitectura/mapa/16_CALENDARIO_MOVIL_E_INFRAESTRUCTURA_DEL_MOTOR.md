# Mapa: Calendario, app móvil e infraestructura del motor

> **Estado: verificado una vez contra el código** (commit bd6a0e1, 11-09-2026), actualizado el 11-09-2026 con las migraciones 107-109 y el estado del sprint 1. Falta la etapa de completar lo que no quedó escrito. Parte del atlas de docs/arquitectura/mapa; el índice es 00_MAPA_DEL_SISTEMA.md.

Este módulo no tiene documento de arquitectura propio en `docs/arquitectura`. Lo tocan de lado `09_PLAN_DE_HOMOLOGACION.md` (el filtro del calendario, tandas B3 y C2), `11_MODULO_DE_MARKETING.md` y `12_MODULO_DE_CONSULTAS.md` (sus relojes) y `13_ENVIO_DE_COTIZACIONES.md` (la memoria del motor en Railway). La app móvil vive en otro repositorio, `eventia-movil`, al lado de este. Aquí solo se documenta lo que el motor le ofrece.

## 1. Qué hace

Son tres cosas distintas que comparten mapa:

- **Calendario** (`/calendar`). Muestra el mes con cada evento como una banda de color según su estado. Lo usa sobre todo el mostrador para contestar "¿tienen el 20 libre?", y también operaciones y administración para ver la carga del mes y la venta sin propina. Acompaña al evento desde que tiene fecha (solicitada o enviada) hasta después de realizado. Solo lee: no escribe nada en la base.
- **API de Eventia Móvil**. La app de terreno (una PWA, repo `eventia-movil`) usa el mismo motor. Este módulo le agrega cinco puertas (avisos push y checklist de cocina) y un reloj que cada 30 minutos empuja cuatro avisos: pago vencido, evento en 3 días, solicitud nueva y cotización fría. Sin llaves VAPID, el push queda dormido.
- **Infraestructura del motor**. Es la cañería que usan todos los módulos:
  - el arranque (`main.ts`: CORS, validación global, `/docs`, chequeo de configuración);
  - los guardias globales y la memoria en RAM (`app.module.ts`, `cache/`);
  - el cliente único de Supabase;
  - la puerta única de archivos (`storage/`);
  - el respaldo diario de la base (`backup/`);
  - `/health`;
  - los registros sin datos sensibles (`logging/`);
  - utilidades chicas.

  En la sección 7 está la tabla de **todos** los relojes del motor.

## 2. Pantallas y rutas de la app

| Ruta de la app | Componente principal | Archivo | Qué hace el usuario ahí | Rol que la ve |
|---|---|---|---|---|
| `/calendar` | `CalendarPage` (export por defecto) | `frontend/src/pages/calendar/Calendar.tsx` | Mira el mes con bandas por evento (hasta 3 por día, más "+N más"), cambia de mes y aprieta "Hoy". Filtra estados con el chip "Estados", que muestra el conteo del mes visible. Pincha un día y ve sus tarjetas. En el título ve el mes, el número de eventos y la venta sin propina según el filtro | Ruta: `SECTION_ROLES.calendar` = los cuatro roles (`PermissionGuard` en `frontend/src/App.tsx`). Menú lateral: solo recepción, operaciones y administrador. El `Sidebar` filtra con `canAccessSection`, que lee `ROLE_PERMISSIONS`, y ahí vendedor no tiene `calendar` |
| `/calendar?date=AAAA-MM-DD&filter=all` | mismo | mismo | Llega en pestaña nueva desde el aviso "Hay más eventos programados…" del cotizador (`QuotationForm`) y del formulario de requerimientos (`RequestForm`). Abre en ese día, ya seleccionado, con todos los estados menos rechazada y anulada | Mismo. Por este enlace también entra vendedor |
| (panel lateral del día) | `TarjetaEvento` | mismo archivo | Ve cliente, N°, personas y monto, tipo de evento y chips de categorías (sacados del detalle de la cotización). En aceptada, realizada o anulada ve además cuánto personal está asignado. Al pinchar, abre Post-Venta en pestaña nueva si el evento está en aceptada, realizada o anulada y el usuario puede editar cotizaciones. Si no, abre la ficha del negocio `/negocio/:id` en la misma pestaña | Mismo |
| App móvil (repo aparte): `/avisos`, `/leads`, `/evento/:id`, `/evento/:id/cocina` | rutas de `eventia-movil/src/App.tsx` | fuera de este monorepo | Son los destinos de los push y la pantalla del checklist de cocina | Cualquier usuario con sesión: `MovilController` no tiene `@Roles` |

**Cómo se llega al calendario:**
- el ítem "Calendario" del `Sidebar`, que precarga el archivo;
- el botón de `DashboardPage` (`navigate("/calendar")`, mapa 13);
- los dos avisos de choque de fecha (mapas 01 y 11);
- la precarga silenciosa de `App.tsx` (`importCalendar`).

El ícono de calendario de `frontend/src/layout/Layout.tsx` **no** es este módulo: es el enlace a la demo en Calendly.

**Páginas del motor sin pantalla en la app:** `GET /health` (sección 3) y la documentación automática `/docs`. `/docs` es Swagger, armado en `main.ts` con `SwaggerModule.setup`. Muestra la forma de las rutas, nunca datos.

## 3. Endpoints del motor

### 3.1 Propios del módulo (10)

| Método y ruta | Controller y método | Service | Quién lo llama desde la app | Roles o @Public |
|---|---|---|---|---|
| `GET /calendar/events` | `CalendarController.findAllEvents` | `CalendarService.findAllEvents` → `QuotationsService.findAll({ companyId })`, sin filtros (toda la historia) | **Nadie.** `findAllEvents` de `frontend/src/services/calendar.service.ts` existe, pero su import está comentado en `Calendar.tsx`. La app móvil tampoco lo usa | Sesión, sin `@Roles` |
| `GET /movil/push/clave-publica` | `MovilController.clavePublica` | `MovilService.clavePublica` (devuelve `VAPID_PUBLIC_KEY` o texto vacío) | `eventia-movil/src/lib/push.ts` | Sesión, sin `@Roles` |
| `POST /movil/push/dispositivos` | `MovilController.registrar` (`RegistrarDispositivoDto`: `endpoint`, `p256dh`, `auth`) | `MovilService.registrarDispositivo` | `eventia-movil/src/lib/push.ts` | Sesión |
| `POST /movil/push/probar` | `MovilController.probar` | `MovilService.probar` | `eventia-movil/src/lib/push.ts` | Sesión |
| `GET /movil/cocina/:quotationId/marcas` | `MovilController.marcas` | `MovilService.marcasCocina` | `getMarcas` en `eventia-movil/src/services/datos.ts` | Sesión |
| `POST /movil/cocina/:quotationId/marcas` | `MovilController.marcar` (`MarcarDto`: `clave`, `marcado`) | `MovilService.marcarCocina` | `marcar` en `eventia-movil/src/services/datos.ts` | Sesión |
| `POST /storage/upload` (multipart: `file`, `kind` y los ids que pida el tipo) | `StorageController.upload` con `FileInterceptor('file')` | `StorageService.upload` | `subir` en `frontend/src/services/storage.service.ts`, a través de: `uploadPaymentReceipt` y `uploadRefundReceipt` (`PostVentaPage`); `uploadEventDocument` (`PostVentaPage`, `SeguimientoPanel`); `uploadCompanyLogo` y `uploadCompanyBanner` (`CompanyConfiguration`); `uploadCampaignBanner` (`CampanaMarcaPropia`); `uploadFurniturePhoto` (`MobiliarioTab`); `uploadConsultaBrochure` (`PanelDeCorreo`) | Sesión, sin `@Roles` |
| `GET /storage/signed-url?src=` | `StorageController.signedUrl` (`SignedUrlDto`) | `StorageService.signedUrl` | `resolveStorageUrl`, desde `FileViewLink`, `PostVentaPage` y `SeguimientoPanel` | Sesión |
| `POST /storage/delete` | `StorageController.remove` (`SignedUrlDto`) | `StorageService.remove` | `deleteStorageFileByUrl` (y su alias `deletePaymentReceipt`), desde `PostVentaPage` | Sesión |
| `GET /health` | `HealthController.check` | Sin service. Responde `status`, `version` (7 caracteres de `RAILWAY_GIT_COMMIT_SHA` o "desarrollo"), `uptime_seconds` y `timestamp` | Nadie en el repo. Sirve a personas y al monitoreo (mapa 19) | `@Public()`, solo con el techo global |

Ninguna de estas rutas tiene `@Throttle` propio: todas quedan bajo el techo global de 300 peticiones por minuto por IP (`ThrottlerModule.forRoot` en `app.module.ts`).

### 3.2 Lo que la pantalla del calendario pide a otros módulos

| Método y ruta | Controller y método | Service | Quién lo llama | Roles |
|---|---|---|---|---|
| `GET /quotations?request_type=cotizacion&statuses=<los 7>` | `QuotationsController.findAll` | `QuotationsService.findAll` (orden por defecto: `quotation_number` ascendente) → `QuotationsRepository.findAll` (`COLUMNAS_LISTA` más `mandante` (`client_contacts`), `clients` y `companies`, sin paginar) | `getQuotations` (`frontend/src/services/quotations.service.ts`), en la query `["quotations","calendar"]` | Sesión (mapa 02) |
| `GET /quotations/:id` | `QuotationsController.findOne` | `QuotationsService.findOne` | `getQuotationById`, en el precalentado y en `TarjetaEvento`, con la query `["quotation", id]` | mapa 02 |
| Recursos del evento | varios de logística y post-venta | — | `recursosQueryOpts` (`frontend/src/pages/postventa/EventResourcesSection.tsx`): `getEventResources`, `getManagementResources`, `getSuppliers`, `getAllFixedServiceCostItems` | mapas 04 y 06 |

### 3.3 Usos del motor que no pasan por HTTP

- `QuotationsService.submitPortalReceipt` llama a `StorageService.upload` con `kind: 'portal-receipt'`. Es el comprobante que sube el cliente desde el portal (mapa 03). `StorageModule` exporta su service para ese caso.
- `ConsultasRepository.descargarBrochure` baja el PDF **directo** del balde `payment-receipts`, sin pasar por `StorageService` (mapa 11).

## 4. Tablas de la base de datos

| Tabla | Qué guarda | Lee o escribe | Migración que la crea o modifica |
|---|---|---|---|
| `push_devices` | Suscripciones Web Push por teléfono: `user_id`, `company_id`, `endpoint` (único), `p256dh`, `auth` | Escribe `MovilService.registrarDispositivo` (upsert por `endpoint`). Borra `MovilService.empujar` cuando el push responde 404 o 410. Leen `probar` (por `user_id`) y `cicloAvisos` (todas las empresas) | `45_movil_push.sql` (reversa `45_movil_push_reversa.sql`), "aplicada en LAB 29-07" |
| `notifications` | Registro de avisos ya empujados: `company_id`, `dedupe_key` (único), `tipo`, `titulo`, `detalle`, `destino` | Escribe `MovilService.cicloAvisos` (insert; si falla, lo toma como "ya enviado") | `45_movil_push.sql` |
| `kitchen_checklist_marks` | Qué ítem del retiro de bodega o de mobiliario ya está listo: `company_id`, `quotation_id`, `clave`, `marcado_por`, `created_at`. Único por (`quotation_id`, `clave`) | Lee `MovilService.marcasCocina` (filtra empresa y cotización). Escribe `marcarCocina` (upsert al marcar, delete al desmarcar) | `44_cocina_checklist.sql` (reversa `44_cocina_checklist_reversa.sql`), "aplicada en LAB 29-07" |
| `quotations` | Las cotizaciones y los eventos | La lee el calendario (vía `QuotationsRepository.findAll`), `MovilService.avisosDeEmpresa` y `StorageService.verificarDueno` (solo `company_id`, para rutas viejas) | `0_initial_models.sql` (foto del esquema). Sus columnas se detallan en los mapas 01, 02 y 18 |
| `companies` | `high_value_threshold`: el umbral de la estrella de alto valor | Solo lectura, en la app, desde `useAuth().company` | `60_umbral_alto_valor.sql` |
| `payments` y `payment_transactions` | Cuotas y abonos | Lee `MovilService.avisosDeEmpresa` para la regla de pago vencido | mapa 03 |
| `clients` | Nombre del cliente | Leída por join desde el calendario y los avisos | mapa 09 |
| Todas las tablas de `public` | — | Lee `BackupCronService.runBackup`, de a 1000 filas, con la lista que entrega la función SQL `get_backup_tables()` | La función **no** está en `docs/migrations` |

Baldes de Supabase Storage (no son tablas, pero viven en el mismo proyecto):

| Balde | ¿Público? | Qué guarda | Quién escribe o lee | Migración |
|---|---|---|---|---|
| `payment-receipts` | No, desde la migración 42 | Comprobantes de pago, de reembolso y del portal; documentos del evento; brochures de consultas | Escribe `StorageService.upload`. Se lee con enlace firmado. `ConsultasRepository.descargarBrochure` lo lee directo | `9_storage_payment_receipts_bucket.sql` lo creó público. `42_storage_candado.sql` lo cerró y borró todas las políticas de `storage.objects` (aplicada en producción el 28-07) |
| `furniture-photos` | Sí | Fotos de mobiliario | `StorageService.upload` | `20_furniture_inventory.sql`; sus políticas se borraron en la 42 |
| `company-logos` | Sí | Logo, banner de correos y banners de campaña | `StorageService.upload` | No hay migración que lo cree en `docs/migrations`; la 42 borra sus políticas `cl_*` |
| `backups` | No, según la cabecera de `BackupCronService` | `eventia_AAAA-MM-DD.json.gz`, 30 días | `BackupCronService` | Sin migración |

## 5. Flujos principales

### 5.1 Mirar el calendario

1. **Pantalla.** `CalendarPage`, ruta perezosa con `PermissionGuard` sobre `SECTION_ROLES.calendar`.
2. **Estados iniciales.** `getInitialStatuses`: con `filter=all` en la URL van solicitada, enviada, en negociación, aceptada y realizada; sin él, solo aceptada y realizada. Después, un `useEffect` restaura la memoria del usuario desde `localStorage` (`eventia_calendar_status_filter_<userId>`), pero solo si la URL no trae `filter`. Otro `useEffect` guarda cada cambio.
3. **Lectura.** `useQuery(["quotations","calendar"])` llama a `getQuotations(COTIZACION, los 7 estados de ESTADOS_COTIZACION)`. De ahí sigue `GET /quotations` → `QuotationsController.findAll` → `QuotationsService.findAll` → `QuotationsRepository.findAll` → tabla `quotations`, filtrada por `company_id`. Llega toda la historia en **una** llamada; el filtro por estado se aplica en el navegador y es instantáneo.
4. **Cálculos en el navegador.**
   - Se descartan las cotizaciones sin `event_date`.
   - `eventRange` compara `event_date` y `event_end_date` como texto `aaaa-mm-dd`: un evento de varios días se pinta en todos sus días.
   - `eventLanes` reparte las bandas en filas para que no se pisen.
   - `resumenMes` cuenta los eventos que tocan el mes visible y suma `total_amount − tip_amount`.
   - `conteoPorEstado` da los números del chip.
5. **Precalentado.** Un `useEffect` pide por detrás hasta 25 detalles (`GET /quotations/:id`, uno cada 120 ms, primero los del día seleccionado). Usa la clave `["quotation", id]`, la misma de la ficha y de Post-Venta.
6. **Día seleccionado.** Cada `TarjetaEvento` pide su detalle (las categorías salen de `items.variable_services`). Si el evento está en aceptada, realizada o anulada, también pide `recursosQueryOpts` para contar el personal asignado.
7. **Salida.** `handleNavigateToQuotation` abre `window.open('/post-venta/:id')` o `navigate('/negocio/:id')`.
8. **Efectos.** Ninguno en la base. El calendario se refresca cuando cualquier guardado invalida el prefijo `["quotations"]` (ver `flujos/04_ACEPTAR_COTIZACION_Y_PLAN_DE_PAGOS.md` y `flujos/08_MARCAR_EVENTO_REALIZADO.md`).

**Variante "choque de fecha".** `QuotationForm` y `RequestForm` muestran un aviso cuando el chequeo de choques encuentra otro evento el mismo día (mapas 01 y 11). El enlace abre `/calendar?date=…&filter=all` en pestaña nueva; `getInitialDate` interpreta la fecha con `parseISO` y la deja seleccionada.

### 5.2 App móvil: registrar el teléfono, recibir avisos y marcar la cocina

1. **Registro.** `eventia-movil/src/lib/push.ts` pide `GET /movil/push/clave-publica`, suscribe el navegador y manda `POST /movil/push/dispositivos`. `MovilService.registrarDispositivo` hace upsert en `push_devices` por `endpoint`: un mismo teléfono queda con el último usuario que lo registró.
2. **Prueba.** `POST /movil/push/probar` → `MovilService.probar`. Sin llaves responde `{ enviados: 0, motivo: 'sin llaves VAPID' }`. Con llaves, empuja un aviso de prueba a los teléfonos de ese usuario, con destino `/avisos`.
3. **Reloj.** `MovilService.cicloAvisos` (`@Cron('*/30 * * * *')`) sale de inmediato si no hay llaves (`listo` en falso) o si no hay teléfonos. Para cada empresa con teléfonos llama a `avisosDeEmpresa`. Esa función lee `quotations` (solicitada, enviada, aceptada y realizada) y `payments` con `payment_transactions`, y arma estos avisos:

   | Aviso | Regla | `dedupe_key` | Destino en la app |
   |---|---|---|---|
   | Pago vencido | Cuota de un evento (cotización aceptada o realizada) con `status` distinto de `pagado`, `due_date` anterior a hoy, y lo abonado no cubre el monto | `vencido-<pago>-<vencimiento>` | `/evento/<cotización>` |
   | Evento próximo | Evento aceptado o realizado con `event_date` entre hoy y hoy + 3 días | `evento-<cotización>-<fecha>` | `/evento/<cotización>` |
   | Solicitud nueva | Requerimiento en `solicitada` | `solicitud-<cotización>` | `/leads` |
   | Cotización fría | Cotización `enviada` con `created_at` de hace más de 7 días | `frio-<cotización>` | `/evento/<cotización>` |

   "Hoy" se calcula en UTC (`new Date().toISOString()`).
4. **Una sola vez.** Cada aviso se inserta en `notifications`. Si el insert falla (por ejemplo, la clave ya existe), se salta. Si entra, `empujar` lo manda con `web-push` a **todos** los teléfonos de la empresa; si un teléfono responde 404 o 410, se borra de `push_devices`.
5. **La pantalla `/avisos` no depende del push.** Además del reloj del motor, la propia app calcula las MISMAS 4 reglas por su cuenta, en el navegador, con los datos que ya trae de `getEventos`, `getPagos` y `getLeads`: `calcularAvisos` (`eventia-movil/src/lib/avisos.ts`), usada por la pantalla `Avisos.tsx` y por el contador de la barra (`AppShell.tsx`). Sus ids (`vencido-<pago>-<fecha>`, `evento-<cotización>-<fecha>`, `solicitud-<cotización>`, `frio-<cotización>`) tienen la misma forma que el `dedupe_key` del motor, pero es una lista aparte: lo "leído" se guarda en `localStorage` (`eventia_avisos_leidos`), no en `notifications`. Así la lista se ve siempre, tenga o no el teléfono llaves VAPID o permiso de notificaciones; el push del motor solo agrega el aviso que llega con la app cerrada.
6. **Checklist de cocina.**
   - Leer: la pantalla de cocina de la app llama a `getMarcas` → `GET /movil/cocina/:quotationId/marcas` → `marcasCocina`, que lee `clave`, `marcado_por` y `created_at` filtrando por empresa y cotización.
   - Marcar: `marcar` → `POST …/marcas` con `{ clave, marcado }` → `marcarCocina`. Si `marcado` es verdadero, hace upsert por (`quotation_id`, `clave`) con `marcado_por` = correo del usuario. Si es falso, borra la marca.

   La ficha de cocina se calcula en logística (mapa 06); aquí solo se guardan las marcas.

### 5.3 Subir, ver y borrar un archivo (la puerta única)

1. **Pantalla.** Por ejemplo, un comprobante en `PostVentaPage`: `uploadPaymentReceipt` → `subir`. El navegador valida tipo y tamaño (`validateImageFile`) y manda un `FormData` a `POST /storage/upload`.
2. **Motor.** `StorageController.upload` → `StorageService.upload`. Exige un archivo JPG, PNG, WebP o PDF de máximo 5 MB. Arma la ruta según `kind`, con la empresa **de la sesión**, y sube con la llave de servicio (`cacheControl` 3600):

   | `kind` | Balde | Ruta que arma el motor | Campos que exige | Devuelve |
   |---|---|---|---|---|
   | `payment-receipt` | `payment-receipts` | `c<empresa>/payment-receipts/<cotización>/<pago>/<transacción o receipt>_<marca>.<ext>` | `quotation_id`, `payment_id` (`transaction_id` opcional) | la ruta |
   | `refund-receipt` | `payment-receipts` | `c<empresa>/refund-receipts/<cotización>/<reembolso>_<marca>.<ext>` | `quotation_id`, `refund_id` | la ruta |
   | `event-document` | `payment-receipts` | `c<empresa>/event-documents/<cotización>/<categoría>/<marca>_<archivo>` | `quotation_id` (`category` opcional) | la ruta |
   | `consulta-brochure` | `payment-receipts` | `c<empresa>/consulta-brochures/<tipo de evento>/<marca>_<archivo>` | `category` (sin él, usa "general") | la ruta |
   | `portal-receipt` | `payment-receipts` | `c<empresa>/portal-receipts/<cotización>/<marca>_<archivo>` | `quotation_id` | la ruta |
   | `furniture-photo` | `furniture-photos` | `<empresa>/<ítem>_<marca>.<ext>` | `item_id` | URL pública |
   | `company-logo` | `company-logos` | `<empresa>_logo.<ext>` (sobrescribe) | — | URL pública |
   | `company-banner` | `company-logos` | `<empresa>_banner.<ext>` (sobrescribe) | — | URL pública |
   | `campaign-banner` | `company-logos` | `<empresa>_campaign_banner_<marca>.<ext>` | — | URL pública |

3. **Guardar.** Cada pantalla guarda lo que recibió en su propia tabla: comprobantes, documentos y logos viven en los mapas 03, 04, 06, 10, 11 y 15.
4. **Ver.** `FileViewLink` (o la misma pantalla) llama a `resolveStorageUrl`. Si `esArchivoPrivado` reconoce la ruta (prefijo `c<n>/`, prefijos viejos o URL pública vieja del balde), pide `GET /storage/signed-url` → `extraerRuta` → `verificarDueno` → `createSignedUrl` por 300 segundos. Lo público se usa tal cual.
5. **Borrar.** `deleteStorageFileByUrl` → `POST /storage/delete` → el mismo candado de dueño → `remove`. Responde `{ deleted: !error }` y no lanza error.

### 5.4 El respaldo diario de la base

1. **Al arrancar** (solo con `NODE_ENV === 'production'`, que revisa su getter `enabled`): `onModuleInit` espera 20 segundos y llama a `backupIfMissingToday`. Esa función lista el balde `backups` (hasta 100 archivos) y respalda si falta `eventia_<fecha UTC de hoy>.json.gz`.
2. **Cada día**, `dailyBackup` (`@Cron('0 7 * * *')`) llama a `runBackup('cron diario')`.
3. **Qué hace `runBackup`:**
   1. `rpc('get_backup_tables')` entrega la lista de tablas.
   2. Por cada tabla, `select('*')` de a 1000 filas con `range`, acumulando todo en memoria.
   3. `JSON.stringify` de `{ generated_at, reason, tables }` y compresión con `gzipSync`.
   4. `upload` con `upsert`, y log `BACKUP OK` con filas, KB y milisegundos.
   5. `cleanupOld` borra los archivos con fecha de más de 30 días.
4. **Si falla** una tabla, se registra `logger.error` y sigue con la siguiente: el respaldo termina "OK" con esa tabla incompleta. Si falla todo, queda `BACKUP FALLÓ` en el log, sin correo ni aviso.
5. **Restaurar** es a mano: bajar el `.json.gz` desde Storage y reinsertar las filas (cabecera del archivo).
6. **El RPC del paso 3.1 tiene candado desde el 11-09-2026.** `get_backup_tables()` es `SECURITY DEFINER`; hasta esa fecha cualquiera con la llave pública podía llamarla por `/rest/v1/rpc/get_backup_tables` y ver el nombre de todas las tablas de `public` (sin leer datos). La migración `109_candado_get_backup_tables.sql` (`docs/migrations`) revocó el `EXECUTE` de `PUBLIC` y de `anon`/`authenticated`, y confirmó el de `service_role` — el mismo rol que usa este cron para llamarla. Aplicada en lab y producción. La función en sí (su cuerpo, dónde se creó) sigue sin estar versionada en `docs/migrations` — sigue abierta la pregunta 5 de la sección 12.

### 5.5 El recorrido de una petición por la cañería común

1. **CORS** (`main.ts`, `app.enableCors`).
   - Orígenes: `FRONTEND_URL`, `MOVIL_URL`, `https://www.eventi-app.com`, `https://eventia-dev.netlify.app` y cuatro localhost.
   - `credentials: true` y `maxAge` de 24 horas.
2. **Proxy.** `trust proxy` en 1, para que el límite de frecuencia vea la IP real detrás de Railway.
3. **Registro.** `LoggerModule` (pino) tapa `req.headers.authorization` y `req.headers.cookie`.
4. **Guardias globales**, en el orden de `providers` de `app.module.ts`:
   - **`AuthGuard`.** Valida el token con `AuthService.validateToken`, que recuerda los pases por su huella SHA-256 en `cacheTokens` hasta que vencen (tope 1 hora). Carga el perfil desde `cachePerfiles` (1 hora). Deja en `request.user` los campos `id`, `company_id`, `role` y `email`.
   - **`ThrottlerGuard`.** 300 peticiones por minuto por IP; las rutas públicas tienen techos más duros con `@Throttle` (mapa 11).
   - **`RolesGuard`.** Aplica `@Roles`; en rutas sin `@Roles` basta con la sesión.
5. **Validación.** `ValidationPipe` global con `whitelist`, `forbidNonWhitelisted` y `transform`. Un campo desconocido, o sin decorador en el DTO, recibe un 400.
6. **Controller → service → repository → `SupabaseService.client`.** El cliente usa la llave de servicio y salta RLS: el aislamiento por `company_id` lo hace el código.
7. **Después de responder.** `PanelInvalidationInterceptor` (global) actúa si el método no es GET, hay `request.user.company_id` y la respuesta salió bien. Entonces llama a `invalidarPanelEmpresa`, que borra toda la memoria del panel de análisis de esa empresa.

**Al arrancar el servidor.** `validateEnv` (`api-rest/src/config/validate-env.ts`) revisa la configuración:
- Detiene el arranque si faltan `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` o `PORT`.
- Solo advierte en el log si faltan `FRONTEND_URL`, `RESEND_API_KEY`, `SUPABASE_PASSWORD_RECOVERY_REDIRECT_URL`, `SUPER_ADMIN_EMAILS`, `PUBLIC_API_URL`, `RESEND_WEBHOOK_SECRET` o `MARKETING_BAJA_SECRET`.

`rawBody: true` queda activo para verificar la firma del webhook de Resend (mapa 10).

## 6. Reglas de negocio acordadas

**Calendario**
- **Aceptada + Realizada por defecto.** "decisión de Felipe 29-07: el calendario no debe olvidar los eventos ya hechos". Evidencia: comentario de `getInitialStatuses` en `Calendar.tsx`; `flujos/08_MARCAR_EVENTO_REALIZADO.md`.
- **Recepción ve el calendario.** Sin él "no puede responder '¿tienen el 20 libre?'", y "no escribe nada en la base, es solo-mirar por naturaleza" (12-08). Evidencia: comentario de `ROLE_PERMISSIONS` en `frontend/src/constants/permissions.ts`.
- **Venta sin propina.** La venta del mes se mide así ("regla de la casa 24-07"): `total_amount − tip_amount`. Evidencia: `resumenMes`.
- **Clic con destino (12-08).** "nunca más al cotizador". Aceptada, realizada y anulada van a Post-Venta, que abre "en PESTAÑA NUEVA (pedido de Felipe 12-08)". Lo que sigue en juego va a la ficha del negocio. Recepción, que no edita, siempre llega a la ficha. Evidencia: `handleNavigateToQuotation`.
- **Estilo "Google", elegido por Felipe (12-08).** Bandas continuas; día seleccionado con marco azul y fondo suave; hoy como moneda azul; sin mancha de "tiene eventos"; filas de altura uniforme para ver el mes entero en un notebook. Evidencia: comentarios del bloque `<style>` y de `tileContent`.
- **"Hoy" también mueve el mes visible** ("pillada de Felipe 29-07"). Evidencia: `handleGoToToday`.
- **El filtro se recuerda por usuario**, con el mismo patrón de Post-Venta, y la URL manda sobre la memoria. Evidencia: `CAL_FILTER_KEY` y los dos `useEffect`.
- **Estrella de alto valor**, con la misma regla del tablero: umbral 0 o vacío = sin estrellas. Evidencia: `umbralAltoValor`; `60_umbral_alto_valor.sql`.
- **"Anulada" es la palabra oficial** (Felipe, 12-08); el valor técnico `cancelada` no se toca. Nombres y colores salen del diccionario `frontend/src/utils/estadoCotizacion.ts` ("acá vivía una copia con sus propias etiquetas y colores", comentario en `Calendar.tsx`).
- **Tarjeta con la jerarquía de Felipe (12-08), sin comentarios.** Commit `c0c61a5`: "tarjeta sin comentarios (decisión de Felipe)".

**App móvil**
- **Al backend "SOLO SE AGREGA".** Las puertas del móvil son aditivas, y el desarrollo apunta al laboratorio hasta el visto bueno de Felipe. Evidencia: comentario de `MovilController`; `eventia-movil/README.md`; commit `edf3ad3`.
- **El push se estrena en el laboratorio.** Sin llaves VAPID "el módulo duerme". Evidencia: cabecera de `movil.service.ts`.
- **Cada aviso se empuja una sola vez** (`dedupe_key` único) y solo a empresas con teléfonos registrados. Evidencia: `cicloAvisos`; `45_movil_push.sql`.
- **Las suscripciones muertas se limpian solas** (404 o 410). Evidencia: `empujar`.
- **El checklist guarda "SOLO los checks"**; la ficha sigue siendo calculada. Evidencia: `44_cocina_checklist.sql`.

**Infraestructura**
- **Los relojes corren solo en producción.** Evidencia: `ScheduleModule.forRoot({ cronJobs: process.env.NODE_ENV === 'production' })` en `app.module.ts`, desde el commit `50f31de` (21-10-2025). Lo repiten los documentos 11 y 12.
- **Respaldo automático diario, "pedido por Felipe" (23-07-2026).** A las 07:00 UTC, más uno al arrancar si falta el del día; 30 días de retención; las tablas nuevas entran solas. Evidencia: cabecera de `backup-cron.service.ts`.
- **Una sola puerta para archivos (misión storage, 28-07).** "el navegador NUNCA elige la ruta final". El balde de comprobantes es privado (antes "cualquiera con el enlace veía un comprobante bancario"). El enlace firmado dura 5 minutos, "corto a propósito". Evidencia: cabeceras de `storage.service.ts` y `upload-file.dto.ts`; `42_storage_candado.sql`.
- **Sin configuración crítica, el servidor no parte.** La lección: "RESEND_API_KEY faltó 5 días y el servidor partió igual, fallando después en silencio". Evidencia: `validate-env.ts`.
- **Registros sin datos sensibles (Fase 3, 28-07).** "Ante la duda, un campo se tapa: la verbosidad se recupera fácil; una contraseña filtrada, no". Evidencia: `logging/log-safe.ts` y el `redact` de `app.module.ts`.
- **Memoria de 1 hora, pedida por Felipe** ("se usa mucho de dejar ahí y volver"). Se concedió con seguros: el panel se borra con cualquier escritura de la empresa ("borrar de más es gratis, mostrar números viejos no"). Evidencia: commit `83ef01a`; `cache/memoria.ts`; `panel-invalidation.interceptor.ts`.
- **Techo de frecuencia holgado por IP** para el uso normal, y techos estrictos en lo público (Fase 3, 28-07). Evidencia: comentario de `ThrottlerModule.forRoot`.
- **CORS acepta siempre el dominio productivo y el alias de Netlify**, "para que el switchover de DNS (Plan B) no corte a nadie". El `maxAge` es de 24 horas porque "desde Chile un viaje al servidor cuesta ~430 ms" (12-08). Evidencia: `main.ts`.
- **`/health` y `/docs` no exponen datos.** `/health` "no toca la base ni expone datos"; `/docs` "solo describe la forma de la API — nunca datos ni llaves". Evidencia: `health.controller.ts`; `main.ts`.

## 7. Conexiones con otros módulos

**Quién usa la infraestructura**
- **`SupabaseService`.** Es global (`SupabaseModule` con `@Global()`) y lo inyectan todos los repositorios. Fuera de la capa repository también lo importan `movil.service.ts`, `storage.service.ts`, `backup-cron.service.ts`, `analytics/analytics.service.ts`, `analytics/hoy.controller.ts`, `services/sections.controller.ts`, `clients/client-contacts.controller.ts`, `quotations/event-documents.controller.ts`, `quotations/portal-receipts.controller.ts` y `quotation-followups/quotation-followups.module.ts`.
- **`cache/memoria.ts`.**
  - Mapa 15: `AuthService.validateToken` (`cacheTokens`), `AuthGuard` (`cachePerfiles`) y `UsersService.remove` (`olvidarPerfil`).
  - Mapa 13: `AnalyticsService` (`cachePanel`, con claves `<empresa>:dash:…` y `<empresa>:stats:…`).
- **`logSafe`.** Lo usan clientes (09), la encuesta (14), super-admin y usuarios (15), personas (07) y cotizaciones (01 y 02).
- **`utils/dates.ts`.** `normalizeDateToUtc` en `PaymentsCronService` (03) y `QuotationsCronService` (02); `getEventDateUtc` en `QuotationsService`, al crear y al revisar choques de fecha (01).
- **`constants/api.routes.ts`.** Solo `AuthController` y `UsersController` (15).
- **`testing/mocks.ts`** (`mockPinoLogger`, `provideMock`). Pruebas de todo el motor.
- **`StorageService`.**
  - Pantallas: Post-Venta (04), Seguimiento de la ficha (02), configuración de empresa (15), Mobiliario (06), campañas (10) y Consultas (11).
  - Motor: el portal del cliente (03).
  - El visor compartido `FileViewLink` es del kit (17).
- **`rawBody` y `validateEnv`.** Atienden el webhook y las variables de marketing (10). La versión que muestran `/health` y `/docs` sale de `RAILWAY_GIT_COMMIT_SHA` (19).

**A quién usa este módulo**
- **Calendario:** `QuotationsService.findAll` y `GET /quotations/:id` (02); `recursosQueryOpts` (04 y 06); `utils/estadoCotizacion` (17); `useAuth` y `company.high_value_threshold` (15).
- **Móvil:** lee directo `quotations`, `payments`, `payment_transactions` y `clients`, sin pasar por sus módulos (02, 03 y 09). La app móvil también consume puertas de otros mapas; según `eventia-movil/src`:
  - `/logistics/furniture`, `/logistics/kitchen/times`, `/logistics/supplies`, `/logistics/base-catalogo` y `/logistics/purchasing/accepted-events` (06);
  - `/payments/plan`, `/payments/transactions` y `/payments/transactions/overflow` (03);
  - `/quotations/:id` (02);
  - `/sections/menu-order` (05);
  - `/users/:id` (15).

**Efectos automáticos y pantallas afectadas**
- Cualquier escritura con sesión borra la memoria del panel de análisis de la empresa (Dashboard y Analytics, mapa 13).
- El calendario se refresca solo cuando otra pantalla invalida `["quotations"]`: cotizador, ficha o Post-Venta.
- El push del móvil depende de los estados de cotización y de cuotas: cambiar las reglas de pagos (03) o de estados (02 y 04) cambia los avisos.

### Todos los relojes del motor

Ningún `@Cron` declara `timeZone`: los horarios suponen que el servidor corre en UTC. Así lo dicen los comentarios, por ejemplo "Lunes 11:00 UTC = 07:00 de Chile (horario de invierno)". En el horario de verano de Chile, todo sale una hora más tarde en hora local.

| Horario (expresión) | Hora de Chile (invierno / verano) | Archivo y método | Qué hace | Mapa |
|---|---|---|---|---|
| Cada minuto (`CronExpression.EVERY_MINUTE`) | — | `api-rest/src/consultas/consultas-cron.service.ts`, `ConsultasCronService.despachar` → `ConsultasService.despacharPendientes` | Manda el brochure de las consultas cuya hora citada ya llegó (10 minutos después de entrar) | 11 |
| Cada minuto (`CronExpression.EVERY_MINUTE`) | — | `api-rest/src/marketing/marketing-cron.service.ts`, `MarketingCronService.despacharProgramadas` | Despacha las campañas programadas cuya hora llegó, con el candado `tomarProgramada` | 10 |
| Cada 30 minutos (`'*/30 * * * *'`) | — | `api-rest/src/movil/movil.service.ts`, `MovilService.cicloAvisos` | Calcula y empuja los 4 avisos push; dormido sin llaves VAPID | 16 |
| 01:00 UTC diario (`CronExpression.EVERY_DAY_AT_1AM`) | 21:00 / 22:00 del día anterior | `api-rest/src/payments/payments.service.ts`, `PaymentsService.updateOverduePayments` | Las cuotas `pendiente` con `due_date` ya cumplida pasan a `vencido` | 03 |
| 07:00 UTC diario (`'0 7 * * *'`) | 03:00 / 04:00 | `api-rest/src/backup/backup-cron.service.ts`, `BackupCronService.dailyBackup` | Respaldo completo de la base al balde `backups` | 16 |
| 11:00 UTC diario (`CronExpression.EVERY_DAY_AT_11AM`) | 07:00 / 08:00 | `api-rest/src/payments/payments-cron.service.ts`, `PaymentsCronService.checkUpcomingOverduePayments` | Recordatorio de cuotas pendientes que vencen en 3 días o hoy, al mandante y a los administradores | 03 y 12 |
| 11:00 UTC diario (`CronExpression.EVERY_DAY_AT_11AM`) | 07:00 / 08:00 | mismo archivo, `PaymentsCronService.checkOverduePayments` | Aviso de cuotas con 7 días de vencidas, al mandante y a los administradores | 03 y 12 |
| 11:00 UTC diario (`'0 11 * * *'`) | 07:00 / 08:00 | `api-rest/src/quotations/quotations-cron.service.ts`, `QuotationsCronService.sendQuotationFollowUps` | Seguimiento de cotizaciones enviadas: dos toques al mandante, a los 7 y a los 14 días desde `sent_at` | 02 y 12 |
| Lunes 11:00 UTC (`'0 11 * * 1'`) | lunes 07:00 / 08:00 | mismo archivo, `QuotationsCronService.sendWeeklyDigest` | Resumen semanal a los administradores: eventos aceptados de la semana y embudo vigente. Solo sale si hay algo que contar | 02 y 12 |

**Candado del 11-09-2026 sobre el RPC del respaldo.** `get_backup_tables()`, la función que le entrega a `dailyBackup` la lista de tablas, tenía `EXECUTE` abierto a `PUBLIC` (cualquiera con la llave pública veía el nombre de todas las tablas de `public`, sin datos). La migración `109_candado_get_backup_tables.sql` lo revocó de `PUBLIC` y de `anon`/`authenticated`, y confirmó el de `service_role` — el rol con el que este mismo reloj la llama. Aplicada en lab y producción; detalle en el punto 5.4 y en la pregunta abierta 5 de este mapa.

Tareas automáticas que **no** son `@Cron`:
- **`BackupCronService.onModuleInit`.** 20 segundos después de arrancar, respalda si falta el respaldo del día. Solo en producción.
- **`QuotationsCronService.onApplicationBootstrap`.** Con `RUN_FOLLOWUPS_ON_BOOT=1`, corre el seguimiento al encender el servidor, en **cualquier** ambiente. Es una palanca del 31-07 para "rescates puntuales, como el de Marcia".

## 8. Zonas de riesgo: si tocas esto, cuidado con aquello

1. **Si tocas** `NODE_ENV` o la condición `cronJobs` de `ScheduleModule`, **se afectan** los nueve relojes de la sección 7 (brochures, campañas, cobranza, seguimiento, resumen, vencidos, push y respaldo), **porque** todos cuelgan de esa bandera. El respaldo, además, revisa `NODE_ENV` por su cuenta. En el laboratorio nada de esto se ve funcionando. Evidencia: `app.module.ts`; `BackupCronService.enabled`.
2. **Si cambias** el cargo de un usuario desde Gestión de usuarios (`PATCH /users/:id`), **se afecta** lo que esa persona puede hacer durante hasta 1 hora, **porque** el motor sigue usando el perfil guardado en `cachePerfiles`. `UsersService.update` no llama a `olvidarPerfil`; solo lo hace `UsersService.remove`, aunque los comentarios de `cache/memoria.ts` y de `AuthGuard` digan que editar un usuario lo olvida al instante. Un cambio de rol hecho directo en la base ya obligó a reiniciar el laboratorio el 12-08 (`api-rest/REINICIOS.md`).
3. **Si el motor corre en más de una instancia**, **se afecta** la memoria de pases, perfiles y panel, **porque** "La memoria vive en el proceso": una escritura borra el panel solo en la instancia que la atendió. Evidencia: `cache/memoria.ts`.
4. **Si agregas** una escritura en una ruta `@Public` o en un reloj, **se afecta** el Dashboard, que puede mostrar cifras de hasta 1 hora antes, **porque** `PanelInvalidationInterceptor` solo borra la memoria cuando existe `request.user.company_id`. En las rutas públicas `AuthGuard` no deja usuario, y los relojes no pasan por HTTP. Ya ocurre con `POST /quotations/public/:company_id`, `POST /portal/:token/comprobante` y `PaymentsService.updateOverduePayments`.
5. **Si reordenas** los `APP_GUARD` de `app.module.ts`, **se rompe** `RolesGuard`, **porque** necesita el `role` que deja `AuthGuard` ("DEBE ir después de AuthGuard").
6. **Si agregas** un campo a un DTO sin decorador de `class-validator`, **se afecta** esa ruta, que responde 400, **porque** el `ValidationPipe` global usa `whitelist` y `forbidNonWhitelisted`. Ya pasó con `tip_amount` (`docs/pendiente-despliegue.md`).
   - Caso vivo: `MarcarDto.marcado` en `movil.controller.ts` es el **único** campo sin decorador en todo el motor (barrido de todos los DTO), y la app móvil lo manda (`marcar` en `eventia-movil/src/services/datos.ts`).
   - Lo esperable es que el POST del checklist responda 400. No se probó en ejecución (ver preguntas abiertas).
7. **Si quitas** un origen de `enableCors`, o cambias `FRONTEND_URL` o `MOVIL_URL`, **se afectan** la app web, la móvil y la hoja de impresión del PDF, **porque** el navegador bloquea las respuestas a orígenes que no están en la lista. Evidencia: `main.ts`; `flujos/03_ENVIAR_COTIZACION_POR_CORREO.md`.
8. **Si quitas** `trust proxy`, **se afecta** a todos los usuarios con errores 429, **porque** detrás del proxy de Railway todas las peticiones parecerían venir de la misma IP. Evidencia: comentario en `main.ts`.
9. **Si cambias** la forma de las rutas de archivos, **se afectan** los comprobantes ya guardados, **porque** tres lecturas dependen de esa forma. Las pruebas de `storage.service.spec.ts` cubren la regla del dueño.
   - `StorageService.verificarDueno`: acepta el prefijo `c<empresa>` o, en archivos viejos, `payment-receipts/`, `refund-receipts/` o `event-documents/` con la cotización en el segundo tramo.
   - `esArchivoPrivado` en `frontend/src/services/storage.service.ts`: la misma regla, escrita otra vez.
   - `ConsultasRepository.descargarBrochure`.
10. **Si agregas** un tipo de archivo, **tienes que tocar** tres lugares o falla: `KINDS` en `upload-file.dto.ts`, el `switch` de `StorageService.upload` y una función nueva en el `storage.service.ts` del frontend.
11. **Si pones** llaves VAPID en producción (con la migración 45 aplicada), **se afectan** todos los teléfonos registrados, **porque** `notifications` parte vacía y `avisosDeEmpresa` no acota por fecha tres de sus cuatro reglas. El primer ciclo empujaría de golpe todas las solicitudes en `solicitada`, todas las cotizaciones enviadas con más de 7 días y todas las cuotas vencidas de la historia. Evidencia: `MovilService.avisosDeEmpresa`.
12. **Si falla** el insert en `notifications` por cualquier motivo (tabla ausente, permiso), **se afecta** el push en silencio, **porque** `cicloAvisos` toma todo error como "ya enviado" (`if (error) continue`) y no deja registro.
13. **Si tocas** `marcarCocina`, **ojo con** el aislamiento entre empresas, **porque** no verifica que la cotización sea de la empresa de la sesión. El upsert es por (`quotation_id`, `clave`), única en toda la tabla: con un `quotation_id` ajeno se reescribe la marca de otra empresa. La lectura sí filtra por `company_id`. Evidencia: `MovilService.marcarCocina`; `44_cocina_checklist.sql`.
14. **Si una empresa supera** el tope de filas por consulta de Supabase, **se afectan** el calendario y los avisos del móvil, **porque** `QuotationsRepository.findAll` no pagina y el calendario no manda `event_date_from`. Con el orden por defecto (`quotation_number` ascendente, en `QuotationsService.findAll`), quedarían fuera las cotizaciones **más nuevas**, sin aviso. El propio `BackupCronService.runBackup` pagina porque "supabase-js entrega máximo 1000 filas por consulta".
15. **Si la base crece**, **se afecta** la memoria del motor durante el respaldo, **porque** `runBackup` junta todas las filas de todas las tablas en memoria antes de comprimir. `docs/arquitectura/13_ENVIO_DE_COTIZACIONES.md` ya pide vigilar la memoria del motor en Railway por Chromium. Además, una tabla que falla queda incompleta y el log igual dice `BACKUP OK`.
16. **Si borras o renombras** la función `get_backup_tables()` o el balde `backups`, **se detiene** el respaldo sin más aviso que una línea en el log, **porque** nadie revisa el resultado. Sus permisos sí quedaron versionados desde el 11-09-2026 (migración `109_candado_get_backup_tables.sql`: `EXECUTE` solo para `service_role`), pero la función en sí —su cuerpo, dónde se creó— sigue sin estar en `docs/migrations`. **Ojo con tocar esos permisos de nuevo:** si alguien le revoca el `EXECUTE` a `service_role` (el mismo candado que ahora se lo niega a `anon`/`authenticated`), el respaldo se detiene igual de silencioso. Además queda abierta una segunda entrada de permisos por defecto a nombre de `supabase_admin` (rol de plataforma) que la 109 no tocó: las **funciones nuevas** siguen naciendo con `EXECUTE` para `anon`; la 109 solo cerró esta función puntual.
17. **Si pones** `RUN_FOLLOWUPS_ON_BOOT=1` en el laboratorio, **salen** correos de seguimiento reales, **porque** `onApplicationBootstrap` no mira `NODE_ENV`. Además, "cada reinicio con ella puesta re-evalúa el día". Evidencia: `QuotationsCronService`.
18. **Si cambias** la zona horaria del servidor o agregas `timeZone` a un `@Cron`, **se corren** todos los horarios de la sección 7, **porque** están escritos pensando en UTC.
19. **Si cambias** los nombres técnicos de estado (`aceptada`, `realizada`, `cancelada`, `enviada`, `solicitada`), **se rompen** en silencio el destino del clic y el conteo de personal del calendario, y las cuatro reglas del push, **porque** son listas escritas a mano en `handleNavigateToQuotation`, en `TarjetaEvento` y en `avisosDeEmpresa`. Evidencia: `Calendar.tsx`; `movil.service.ts`; `flujos/08_MARCAR_EVENTO_REALIZADO.md`.
20. **Si cambias** la clave `["quotations","calendar"]`, **se afecta** el refresco del calendario después de guardar en otras pantallas, **porque** esas pantallas invalidan por el prefijo `["quotations"]`.
21. **Si alguien sube** un archivo muy grande, **se afecta** la memoria del motor, **porque** `FileInterceptor('file')` no tiene `limits`: el archivo entero llega a memoria (`file.buffer`) antes de que `StorageService.upload` revise los 5 MB.
22. **Si un vendedor** llega al calendario por el enlace del cotizador y pincha un evento aceptado, **ve** "Permisos Insuficientes" en la pestaña nueva, **porque** `puedeEditar` usa `SECTION_ROLES.quotations_edit` (que incluye vendedor), mientras la ruta `/post-venta/:id` exige `SECTION_ROLES.payments` (operaciones y administrador). Evidencia: `handleNavigateToQuotation`; `frontend/src/App.tsx`; `PermissionGuard.tsx`.
23. **Si tocas** `Calendar.tsx`, **te detiene** el portero, **porque** el archivo tiene 897 líneas (cuenta para el techo de 27 archivos sobre 800) y su filtro de estados es un panel flotante hecho a mano, contado en el techo 13. Migrarlo a `MultiSelect` espera la tanda B3 de `09_PLAN_DE_HOMOLOGACION.md`.
24. **Si quitas** `logSafe` de un log o el `redact` de pino, **vuelven** a los registros de Railway contraseñas, datos de clientes o el token de sesión completo, **porque** esas dos capas son lo único que los tapa, y los registros "viven 30+ días".

## 9. Pruebas que lo protegen

| Archivo | Qué cubre |
|---|---|
| `api-rest/src/storage/tests/storage.service.spec.ts` | 10 pruebas de la regla del dueño: firma una ruta nueva de la misma empresa; rechaza una de otra empresa; firma una ruta vieja si la cotización es de la empresa y la rechaza si es ajena; acepta la URL pública vieja; rechaza URLs de otro sitio y prefijos desconocidos; borrar exige el mismo candado; subir rechaza tipos no permitidos y arma la ruta con `c<empresa>` |
| `api-rest/src/config/validate-env.spec.ts` | Sin variable crítica no parte; una crítica en blanco cuenta como faltante; con todo presente no advierte; una importante ausente se reporta sin detener |
| `api-rest/src/calendar/tests/calendar.controller.spec.ts` y `calendar.service.spec.ts` | Solo "should be defined": que la clase se pueda construir con sus dependencias simuladas |
| `frontend/src/utils/estadoCotizacion.test.ts` | Prueba el diccionario de estados del que el calendario saca nombres y colores (vitest, corre en CI) |
| `api-rest/test/app.e2e-spec.ts` | Nada útil: espera `GET /` con "Hello World!", una ruta que no existe. Es el esqueleto original de NestJS. No corre con `jest` ni en CI, porque `roots` apunta a `src` en `api-rest/package.json`; solo corre con `npm run test:e2e` |

**Lo importante que NO está cubierto:**
- **Móvil.** Nada de `MovilService`: las cuatro reglas de avisos, la deduplicación, la limpieza de teléfonos muertos, el checklist y su validación.
- **Respaldo.** Nada de `BackupCronService`: arranque, paginado, retención, tablas que fallan.
- **Memoria.** Ni `CacheMemoria` (vencimiento, tope de entradas, borrado por prefijo) ni `PanelInvalidationInterceptor`, ni el uso de la memoria en `AuthGuard` y `AuthService`.
- **Infraestructura.** `HealthController`, `logSafe`, el orden de los guardias, CORS y los techos de frecuencia.
- **Storage a medias.** `StorageService.upload` solo se prueba con `payment-receipt`; los otros ocho tipos y el camino exitoso de `remove` no tienen prueba.
- **Relojes.** Ninguna prueba cubre los horarios ni su efecto (el seguimiento ya está anotado en el mapa 02).
- **Calendario.** `Calendar.tsx` no tiene pruebas: filas de bandas, eventos de varios días, memoria del filtro, resumen de venta y destino del clic.

## 10. Deuda y rarezas conocidas

**Calendario**
- **Backend muerto.**
  - `CalendarRepository` está vacío.
  - `CalendarService` tiene comentados `blockedDays` y todo el CRUD, con el TODO "change name to model bcs logic has changed".
  - `GET /calendar/events` no tiene quién lo llame.
  - En el frontend, `calendar.service.ts`, `types/calendar.types.ts` y `API_ROUTES.CALENDAR_EVENTS` solo se usan entre sí.
- **Archivo grande.** `Calendar.tsx` tiene 897 líneas: página, `TarjetaEvento` y unas 170 líneas de CSS en un bloque `<style>`, todo junto.
- **Filtro a mano.** El filtro de estados es un multiselect hecho a mano: deuda nombrada en `CLAUDE.md` y en la tanda C2 del plan de homologación. `getStatusColor` y `getStatusLabel` vuelven a buscar en `statusOptions` lo que el diccionario ya entrega.
- **Cliente sin `?.`.** `TarjetaEvento` usa `q.clients.name`, mientras el tooltip usa `q.clients?.name`: una cotización sin cliente rompería la tarjeta.
- **Comentario viejo.** La cabecera de `TarjetaEvento` dice "comentarios plegados", pero la tarjeta ya no muestra comentarios (commit `c0c61a5`).
- **Carga pesada.** El calendario trae toda la historia con los 7 estados y precalienta hasta 25 detalles cada vez que cambian las cotizaciones o el día seleccionado.

**Móvil**
- **Sin capas.** `MovilService` habla directo con Supabase, sin repository, y los DTO viven dentro del controller. `MarcarDto.marcado` no tiene decorador.
- **Errores mal manejados.** `registrarDispositivo` lanza el error crudo de Supabase; `marcasCocina` ignora los errores.
- **"Hoy" en UTC.** Es el mismo "reloj de Londres" que la tanda A1 del plan de homologación lista solo para el frontend.
- **Cotización fría.** Se mide desde `created_at`, no desde `sent_at` como el seguimiento (`51_seguimiento_sent_at.sql`).

**Storage y respaldo**
- **Saltan la capa repository.** `StorageService` y `BackupCronService` usan Supabase directo.
- **`portal-receipt` entra por la puerta normal.** El comentario de `upload-file.dto.ts` dice que ese tipo "No se sube por /storage/upload", pero `KINDS` lo incluye y `@IsIn(KINDS)` lo acepta: un usuario con sesión puede usar ese tipo por la puerta normal.
- **Logo huérfano.** `company-logo` y `company-banner` sobrescriben por un nombre que lleva la extensión: cambiar de PNG a JPG deja el archivo anterior huérfano.
- **Borrado mudo.** `StorageService.remove` devuelve `{ deleted: false }` sin detalle y sin registrar el error.
- **Listas cortas en el respaldo.** Busca el archivo del día entre los primeros 100 del balde y la limpieza lista hasta 200 (alcanza con 30 días de retención).

**Utilidades y configuración**
- **`normalizeDateToUtc` modifica su argumento.** Cambia la fecha que recibe (`date.setUTCHours`) en vez de copiarla.
- **`constants/api.routes.ts` casi vacío.** Solo tiene `AUTH` y `USERS`; el resto de los controllers escribe su ruta a mano.
- **Variables fuera de `.env.example`.** El código lee variables que no están en `api-rest/.env.example`: `MOVIL_URL`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `RAILWAY_GIT_COMMIT_SHA`, `RUN_FOLLOWUPS_ON_BOOT` y las tres de marketing de `validateEnv`.

**Techos vigentes que tocan este mapa**
- Lint del motor: 19. Lint del frontend: 87 (`.github/workflows/ci.yml`).
- Portero: panel flotante a mano, 13; archivos sobre 800 líneas, 27 (`frontend/scripts/portero-kit-de-la-casa.sh`).

## 11. Contradicciones entre documento y código

1. **Dónde viven los relojes.**
   - `CLAUDE.md`, sección Cron: "Scheduled jobs live in `*-cron.service.ts` (e.g. `quotations-cron.service.ts`, `analyitics-cront.service.ts`)".
   - Código: no existe `analyitics-cront.service.ts` (`api-rest/src/analytics` no tiene reloj). Además, dos relojes viven fuera de un `*-cron.service.ts`: `PaymentsService.updateOverduePayments` y `MovilService.cicloAvisos`.
2. **Quién toca Supabase.**
   - `CLAUDE.md`: "Repository — the ONLY layer that touches Supabase".
   - Código: `MovilService`, `StorageService` y `BackupCronService` usan `SupabaseService.client` directo. Fuera de este mapa también lo hacen, entre otros, `AnalyticsService` y `hoy.controller.ts`.
3. **Qué deja el guardia y cómo se lee.**
   - `CLAUDE.md`: `AuthGuard` "attaches `{ id, company_id }`", y el usuario se lee con "the `@User()` decorator".
   - Código: `AuthGuard` deja `id`, `company_id`, `role` y `email`, y el decorador se llama `CurrentUser` (`api-rest/src/auth/user.decorator.ts`).
4. **Variables de entorno.**
   - `CLAUDE.md`, "Backend env", lista 7 variables, igual que `api-rest/.env.example`.
   - Código: `validateEnv` exige o advierte 10, y además se leen `MOVIL_URL`, `VAPID_*`, `RAILWAY_GIT_COMMIT_SHA` y `RUN_FOLLOWUPS_ON_BOOT`.
5. **Techo del panel flotante.**
   - `CLAUDE.md`, tabla del portero: "hand-rolled floating panel (any) | 15". El mismo `CLAUDE.md`, más abajo, dice que el techo bajó de 14 a 13.
   - Script: `revisar "panel flotante a mano (cualquiera)" 13`.
6. **Etiquetas del calendario.**
   - `docs/arquitectura/09_PLAN_DE_HOMOLOGACION.md`, tanda B5: "El calendario se contradice consigo mismo" (Cancelada contra Anulada).
   - Código: `Calendar.tsx` ya no tiene etiquetas propias. Todas salen de `etiquetaEstado` en `frontend/src/utils/estadoCotizacion.ts`, que dice "Anulada", desde el commit `811ae6f` del 14-08.
7. **Editar un usuario y la memoria.**
   - Comentarios de `api-rest/src/cache/memoria.ts` y de `AuthGuard`: "si alguien edita un usuario se olvida su ficha AL INSTANTE (users.service llama olvidarPerfil)".
   - Código: solo `UsersService.remove` llama a `olvidarPerfil`; `UsersService.update` no. El mensaje del commit `83ef01a`, que creó la memoria, solo prometía que "eliminar un usuario lo hace olvidar al instante".
   - No es un documento de arquitectura, pero es la frase que un programador va a creer.
8. **Pruebas del frontend.**
   - `CLAUDE.md`: "There is no frontend test suite".
   - Código: `frontend/package.json` tiene `"test": "vitest run"`, hay archivos `*.test.ts` en `frontend/src/utils` y `frontend/src/components/selects`, y CI los corre (`.github/workflows/ci.yml`).

## 12. Preguntas abiertas

1. ¿Producción tiene aplicadas las migraciones 44 y 45 y configuradas las llaves VAPID? Los commits `596c2ab` y `23efab6`, y la cabecera de `movil.service.ts`, dicen "aplicada en LAB" y "prod aún no las tiene". La misma pregunta está en `flujos/06_REGISTRAR_ABONO_Y_COMPROBANTE.md`.
2. ¿El POST del checklist de cocina responde 400 por `marcado`? Conviene probarlo en el laboratorio, desde la app, antes de confiar en el checklist.
3. ¿El motor corre en UTC en Railway? No hay `TZ` ni `timeZone` en el repo, y todos los horarios lo suponen.
4. ¿Cuál es el tope de filas por consulta ("Max rows") del proyecto Supabase de producción? De ese número depende cuándo el calendario y los avisos empiezan a perder cotizaciones.
5. ¿Dónde se crearon `get_backup_tables()` y los baldes `backups` y `company-logos`? La función sigue sin estar en `docs/migrations` (sus permisos sí, desde la migración 109 del 11-09-2026), y tampoco se puede confirmar que `backups` sea privado.
6. ¿Alguien revisa que el respaldo diario salió bien? ¿Se probó alguna vez restaurar uno?
7. ¿El laboratorio corre con `NODE_ENV = 'production'`? De eso depende si allá corren los relojes y el respaldo (la misma pregunta está en los mapas 10 y 11).
8. ¿El motor de producción corre en una sola instancia? Si son varias, la memoria de sesión y del panel no se comparte entre ellas.
9. ¿Vendedor debe ver el calendario? La ruta lo deja pasar (`SECTION_ROLES.calendar`), el menú no lo muestra (`ROLE_PERMISSIONS.vendedor`), llega por el enlace del cotizador y, al pinchar un evento aceptado, termina en "Permisos Insuficientes".
10. ¿Se conservan `GET /calendar/events` y su servicio del frontend, o se entierran?
11. ¿La "cotización fría" del móvil debería contarse desde `sent_at`, como el seguimiento, en vez de `created_at`?
12. ¿Quién o qué consulta `GET /health`? No hay llamador en el repo (mapa 19).

## 13. Archivos clave

**Motor**
- `api-rest/src/main.ts`: CORS, `trust proxy`, `ValidationPipe`, Swagger `/docs`, `validateEnv` y `rawBody`.
- `api-rest/src/app.module.ts`: `ScheduleModule`, `ThrottlerModule`, `LoggerModule`, guardias e interceptor globales.
- `api-rest/src/config/validate-env.ts` y `api-rest/src/config/validate-env.spec.ts`.
- `api-rest/src/calendar/calendar.controller.ts`, `calendar.service.ts`, `calendar.repository.ts`, `calendar.module.ts`, `types/index.ts` y `tests/`.
- `api-rest/src/movil/movil.controller.ts`, `movil.service.ts` y `movil.module.ts`.
- `api-rest/src/storage/storage.controller.ts`, `storage.service.ts`, `storage.module.ts`, `dto/upload-file.dto.ts` y `tests/storage.service.spec.ts`.
- `api-rest/src/backup/backup-cron.service.ts` y `backup.module.ts`.
- `api-rest/src/health/health.controller.ts`.
- `api-rest/src/cache/memoria.ts` y `panel-invalidation.interceptor.ts`.
- `api-rest/src/supabase/supabase.service.ts` y `supabase.module.ts`.
- `api-rest/src/logging/log-safe.ts`.
- `api-rest/src/utils/dates.ts`.
- `api-rest/src/constants/api.routes.ts`.
- `api-rest/src/testing/mocks.ts`.
- `api-rest/src/auth/auth.guard.ts`, `auth.service.ts` y `roles.guard.ts`: son del mapa 15, pero están aquí por la memoria y el orden de los guardias.
- Relojes documentados en otros mapas: `api-rest/src/consultas/consultas-cron.service.ts`, `api-rest/src/marketing/marketing-cron.service.ts`, `api-rest/src/payments/payments-cron.service.ts`, `api-rest/src/payments/payments.service.ts` y `api-rest/src/quotations/quotations-cron.service.ts`.
- `api-rest/REINICIOS.md` y `api-rest/test/app.e2e-spec.ts`.
- Migraciones: `docs/migrations/9_storage_payment_receipts_bucket.sql`, `20_furniture_inventory.sql`, `42_storage_candado.sql` (y su reversa), `44_cocina_checklist.sql` (y su reversa), `45_movil_push.sql` (y su reversa) y `60_umbral_alto_valor.sql`.

**App**
- `frontend/src/pages/calendar/Calendar.tsx`.
- `frontend/src/services/calendar.service.ts` y `frontend/src/types/calendar.types.ts` (sin uso).
- `frontend/src/services/storage.service.ts`.
- `frontend/src/services/quotations.service.ts` (`getQuotations`, `getQuotationById`).
- `frontend/src/constants/permissions.ts` y `frontend/src/constants/api.routes.ts`.
- `frontend/src/App.tsx` y `frontend/src/layout/Sidebar.tsx`.
- `frontend/src/utils/estadoCotizacion.ts`.
- `frontend/src/pages/postventa/EventResourcesSection.tsx` (`recursosQueryOpts`).
- `frontend/src/components/FileViewLink.tsx`.
- `frontend/scripts/portero-kit-de-la-casa.sh` y `.github/workflows/ci.yml`.

**App móvil (repo `eventia-movil`, fuera de este monorepo)**
- `eventia-movil/src/lib/push.ts`, `eventia-movil/src/lib/avisos.ts` (`calcularAvisos`, el cálculo propio de la app), `eventia-movil/src/services/datos.ts`, `eventia-movil/src/pages/Avisos.tsx`, `eventia-movil/src/App.tsx` y `eventia-movil/README.md`.
