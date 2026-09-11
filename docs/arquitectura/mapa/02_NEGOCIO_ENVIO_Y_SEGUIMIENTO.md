# Mapa: Ficha del negocio, envío de cotizaciones y seguimiento

> **Estado: verificado una vez contra el código** (commit 0de0ddb, 11-09-2026). Falta la etapa de completar lo que no quedó escrito. Parte del atlas de docs/arquitectura/mapa; el índice es 00_MAPA_DEL_SISTEMA.md.

## 1. Qué hace

Es todo lo que le pasa a una cotización **después de armada y antes de ganarse o perderse**. Incluye:

- **El tablero del embudo**: Solicitada, Enviada y En negociación, con las rechazadas plegadas abajo.
- **La ficha del negocio** de cada cotización.
- **El botón "Enviar cotización"**, que manda un correo tipo con el PDF generado por el motor.
- **Los cambios de estado**, con motivo de pérdida al rechazar y plan de pagos al aceptar.
- **La bitácora de seguimiento**: notas con próximo contacto que pintan el semáforo.
- **La bandeja de requerimientos**: pedidos todavía sin cotizar.

Lo usan vendedores, operaciones y administración. Recepción mira el tablero y la ficha y anota seguimiento, pero no edita. Por detrás corren dos relojes: los toques automáticos al cliente a los 7 y 14 días de enviada, y el resumen semanal de los lunes. Cuando la cotización se acepta, la vida del evento sigue en Post-Venta (mapa 04), que monta la misma bitácora.

## 2. Pantallas y rutas de la app

| Ruta de la app | Componente principal | Archivo | Qué hace el usuario ahí | Rol que la ve |
|---|---|---|---|---|
| `/quotations` | `QuotationsPage` | `frontend/src/pages/quotations/QuotationsPage.tsx` | Tablero único de 3 columnas con la suma por columna. Ahí se puede:<br>• cambiar el estado con el menú de la tarjeta o arrastrándola<br>• ordenar por monto, urgencia, fecha o N°<br>• filtrar "Requieren seguimiento"<br>• buscar, que también encuentra cerradas y rechazadas plegadas<br>• ver el aviso de requerimientos pendientes<br>• abrir la ficha o el visor PDF | `SECTION_ROLES.quotations` (recepción, vendedor, operaciones, administrador). Cambiar estado, arrastrar y "nueva cotización": solo `quotations_edit` |
| `/negocio/:id` | `NegocioPage` | `frontend/src/pages/quotations/NegocioPage.tsx` | Encabezado con cliente y mandante (copiar teléfono y correo), chip de estado, WhatsApp, **Enviar cotización** y PDF. Abajo `EventoCajitas` (fecha editable si el evento no está congelado). Pestaña Seguimiento: `HiloSeguimiento` + `AdjuntosComerciales`. Pestaña Servicios: `ServiciosTab`, el editor completo | `SECTION_ROLES.quotations`. Chip que cambia estado, fecha de las cajitas, pestaña Servicios y respaldos: solo `quotations_edit`. El botón Enviar cotización lo ve cualquiera que entre |
| `/imprimir/:token` | `ImprimirCotizacion` | `frontend/src/pages/quotations/ImprimirCotizacion.tsx` | Ninguna persona: la abre el navegador invisible del motor para imprimir el PDF. Pinta `buildQuotationPrintDoc` | Pública, fuera de `Layout`; solo con token firmado |
| `/requests` | `RequestsPage` | `frontend/src/pages/RequestsPage.tsx` y `frontend/src/components/RequestForm.tsx` | Lista y busca requerimientos; los crea o edita con `RequestForm`; los elimina con `ConfirmInline`; comparte el enlace del formulario público. "Cotizar" lleva a `/quotation-form/:id` (mapa 01) | `SECTION_ROLES.requests` (todos). Cotizar solo `quotations_edit` |

Piezas del módulo que no son ruta:
- `HiloSeguimiento` y `AdjuntosComerciales` (`frontend/src/pages/quotations/SeguimientoPanel.tsx`), montadas también en `/post-venta/:id`.
- `QuotationViewer` (`frontend/src/components/QuotationViewer.tsx`), el modal del PDF.
- `MotivoPerdida` y `EventoCajitas` (`frontend/src/components/`).
- `filtrosTablero.ts`: memoria de filtros por usuario en `sessionStorage`.
- El diccionario de estados `frontend/src/utils/estadoCotizacion.ts`.

Otras puertas a la ficha:
- `Calendar.handleNavigateToQuotation` (`frontend/src/pages/calendar/Calendar.tsx`) manda a `/negocio/:id` lo que está en juego y todo lo de recepción.
- La cosecha del mes de `DashboardPage` abre la ficha en pestaña nueva.

## 3. Endpoints del motor

| Método y ruta | Controller y método | Service | Quién lo llama desde la app | Roles o @Public |
|---|---|---|---|---|
| `GET /quotations` | `QuotationsController.findAll` | `QuotationsService.findAll` → `QuotationsRepository.findAll` (lista liviana `COLUMNAS_LISTA`, sin `items`) | `getQuotations` en tablero (llaves `embudo-y-rechazadas`, `cerradas-busqueda`, `requirements`), ficha (`ficha-lista`) y `RequestsPage` | Autenticado, sin `@Roles` |
| `GET /quotations/:id` | `QuotationsController.findOne` | `QuotationsService.findOne` → `QuotationsRepository.findOne` (`select *`) | `getQuotationById`: detalle de la ficha y visor del tablero | **`@Public`** (lo usa la encuesta pública; TODO en el controller) |
| `PATCH /quotations/:id` | `QuotationsController.update` | `QuotationsService.update` | `updateQuotation` en `NegocioPage.cambiarEstado`, `QuotationsPage.applyStatusChange`, `EventoCajitas`, `ServiciosTab`, `RequestForm` | Autenticado. En el service: recepción solo requerimientos; evento realizado congelado para todos |
| `POST /quotations/:id/enviar-correo` | `QuotationsController.enviarPorCorreo` | `EnvioCotizacionService.enviar` | `enviarCotizacionPorCorreo` desde `NegocioPage.enviarPorCorreo` | Autenticado, **sin `@Roles`** (recepción incluida) |
| `GET /quotations/imprimir/:token` | `QuotationsController.hojaParaImprimir` | `EnvioCotizacionService.hojaParaImprimir` | `getHojaParaImprimir` desde `ImprimirCotizacion` | `@Public`, `@Throttle` de 30 por minuto |
| `GET /quotations/check-conflicts` | `QuotationsController.checkConflictsWithExistingQuotations` | `QuotationsService.checkConflictsWithExistingQuotations` | `EventoCajitas` (con `exclude_id`); cotizador (mapa 01) | Autenticado |
| `POST /quotations` | `QuotationsController.create` | `QuotationsService.create` | `RequestForm` para requerimientos (el cotizador es del mapa 01) | Autenticado; recepción solo `request_type = requerimiento` |
| `DELETE /quotations/:id` | `QuotationsController.remove` | `QuotationsService.remove` (candado del realizado) → `QuotationsRepository.remove`, que corre `assertDeletable` | `deleteQuotation` en `RequestsPage` y `QuotationForm` | Autenticado |
| `GET /quotation-followups/map` | `QuotationFollowupsController.map` | `QuotationFollowupsService.mapByCompany` | `getFollowupsMap`: semáforo del tablero y aviso ámbar de Post-Venta | `RECEPTION_AND_UP` (en la clase) |
| `GET /quotation-followups/by-quotation/:quotationId` | `QuotationFollowupsController.findByQuotation` | `QuotationFollowupsService.findByQuotation` | `getFollowupsByQuotation` en `HiloSeguimiento` | `RECEPTION_AND_UP` |
| `POST /quotation-followups` | `QuotationFollowupsController.create` | `QuotationFollowupsService.create` | `createFollowup` en `HiloSeguimiento.guardar` y en el comentario de `MotivoPerdida`. Además lo usa por dentro `EnvioCotizacionService` | `RECEPTION_AND_UP` |
| `PATCH /quotation-followups/:id` | `QuotationFollowupsController.update` | `QuotationFollowupsService.update` | `updateFollowup`: editar nota y botón "Listo" | `RECEPTION_AND_UP` + autoría, salvo marcar cumplido |
| `DELETE /quotation-followups/:id` | `QuotationFollowupsController.remove` | `QuotationFollowupsService.remove` | `deleteFollowup` | `RECEPTION_AND_UP` + autoría |
| `GET /event-documents?quotationId=`, `POST /event-documents`, `DELETE /event-documents/:id` | `EventDocumentsController` (`api-rest/src/quotations/event-documents.controller.ts`) | `EventDocumentsRepository` (en el mismo archivo) | `AdjuntosComerciales` vía `documents.service.ts` (categoría `comercial`) | `OPERATIONS_AND_UP` (en la clase) |

Endpoints vecinos que este módulo usa pero que documenta otro mapa:
- `POST /quotations/:id/realizado` y `POST /quotations/:id/volver-a-pendiente` (04).
- `POST /quotations/:id/cosecha` (13).
- El plan de pagos al aceptar (03).
- `GET /portal/:token/cotizacion/:quotationId`, que comparte la lista blanca de la hoja (03).

## 4. Tablas de la base de datos

| Tabla | Qué guarda | Lee o escribe | Migración que la crea o modifica |
|---|---|---|---|
| `quotations` | La cotización: `quotation_status`, `request_type`, `items`, montos, `contact_name`, `client_contact_id`, `sent_at`, `loss_reason`, `survey_sent_at`, `recontacted_at/by`, `harvest_status` | Lee y escribe | Base en `docs/migrations/0_initial_models.sql` (foto de contexto). Además: `26_event_done_survey.sql`, `33_quotation_contact_name.sql`, `38_numero_cotizacion_unico.sql`, `48_portal_del_mandante.sql` (`client_contact_id`), `51_seguimiento_sent_at.sql` (con relleno de las enviadas), `61_motivo_perdida.sql`, `62_recontacto.sql`, `63_estado_cosecha.sql`, `64_estado_cosecha_check.sql` |
| `quotation_followups` | La bitácora: `note`, `tipo` (llamada, correo, reunion, whatsapp, otro), `next_contact_date`, `next_contact_done_at`, `author_user_id` y `author_name` congelado | Lee y escribe | `59_bitacora_comercial.sql` (FK `ON DELETE CASCADE` a `quotations`, GRANT a `service_role`) y `65_seguimiento_cumplido.sql`. Cada una con su `_reversa` |
| `client_contacts` | El mandante: nombre, correo, teléfono, `portal_token` | Solo lee: destinatario del envío, toques 7/14, contacto del tablero | `34_client_contacts.sql` y siguientes, `48` (token del portal), `50_correos_a_personas.sql` (catastro). Mapa 09 |
| `clients` | Nombre, correo general (respaldo del destinatario del botón), `contact_person`, `phone` | Solo lee | Mapa 09 |
| `companies` | La marca (`name`, `logo_url`, `colors`) y `notifications`: `replyTo` más los interruptores `emails` | Solo lee | `0_initial_models.sql`; mapa 15 |
| `service_categories`, `category_sections`, `variable_service_categories` | La carta del catálogo, con la que la hoja agrupa por secciones | Solo lee (`QuotationsRepository.cartaDelCatalogo`) | Mapa 05 |
| `event_documents` | Respaldos comerciales: pantallazos, correos | Lee y escribe desde `AdjuntosComerciales` | Mapas 04 y 18 |
| `payments`, `payment_transactions`, `refunds`, `customer_satisfaction_survey_responses` | Plata y encuestas atadas a la cotización | Lee (guardias de borrado y de estados). Vía `PaymentsService` y `RefundsService`, borra el plan al volver de post-venta a pre-venta y ajusta cuotas y reembolsos si cambia el total de una aceptada | Mapas 03 y 14 |

## 5. Flujos principales

### 5.1 Enviar cotización (el botón de la ficha)

1. **Pantalla**: en `NegocioPage` se aprieta "Enviar cotización". `ConfirmInline` muestra el correo que calcula `contactoDe`, la regla de la app.
2. **App**: `enviarCotizacionPorCorreo` llama `POST /quotations/:id/enviar-correo`.
3. **Motor**: `EnvioCotizacionService.enviar` anota la cotización en `enviosEnCurso`, un `Set` en memoria, y rechaza un segundo envío simultáneo de la misma.
4. `enviarDeVerdad` lee `QuotationsRepository.findOne`. Si la cotización es de otra empresa, responde 404.
5. `correoDeDestino` pide `ClientContactsRepository.findByClient(company_id, client_id)`:
   - busca el contacto por `client_contact_id`, o por nombre (sin espacios sobrantes y en minúsculas);
   - usa su correo;
   - si no hay, usa `clients.email`.
6. **Portero**: `reparosDelPortero` (`correo-cotizacion.ts`) responde 400, con todos los reparos juntos, si:
   - no hay correo de destino;
   - el total es cero;
   - algún ítem variable o fijo tiene precio ≤ 0.

   En ese caso no se imprime nada.
7. `CompaniesRepository.findOne` entrega la fila de la empresa y `marcaDesdeFila` (`api-rest/src/marketing/marca.ts`) arma la marca.
8. **Número de versión**: `QuotationFollowupsService.findByQuotation` trae las notas y se cuentan las de `tipo = 'correo'` que empiezan con `MARCA_DE_ENVIO`. Si la lectura falla, sale como versión 1.
9. **PDF**: `generarPdf` hace, en orden:
   - firma el token con `firmarTokenImpresion` (HMAC, 15 minutos);
   - lanza `puppeteer-core` con `@sparticuz/chromium`, o con `PUPPETEER_EXECUTABLE_PATH` en local;
   - abre `FRONTEND_URL/imprimir/<token>` y espera la red quieta (hasta 45 s), el selector `.qv-hoja` (hasta 15 s) y las fuentes (tope de 10 s);
   - imprime con `page.pdf` en A4;
   - cierra el navegador en `finally`.

   Mientras tanto, dentro de ese navegador:
   - `ImprimirCotizacion` llama `GET /quotations/imprimir/:token`;
   - `hojaParaImprimir` valida con `validarTokenImpresion` y reúne `findOne`, la empresa (`name`, `logo_url`, `colors`) y `cartaDelCatalogo`;
   - `listaBlancaDeHoja` filtra los campos;
   - `buildQuotationPrintDoc` pinta la hoja.
10. **Correo**: `correoDeCotizacion` arma asunto, título y cuerpo, y `plantillaCampana` los viste sin línea de baja. Resend envía con:
    - `from`: `{empresa} <hola@eventi-app.com>`;
    - `to`: el destino;
    - `bcc`: el "Responder a" de la empresa, si es otro buzón;
    - `replyTo`: ese buzón, o el correo del vendedor;
    - adjunto: `Cotizacion_N{número}_{Empresa}.pdf`.

    Si Resend devuelve error, el endpoint responde 400.
11. **Bitácora**: `followups.create` inserta en `quotation_followups` "Cotización enviada por correo a X, con el PDF adjunto." con `tipo = 'correo'`; desde la versión 2 agrega "(versión N)" antes de la coma. Si falla, solo queda en el log.
12. **Estado**: si la cotización estaba `solicitada`, se llama `QuotationsRepository.update(id, { quotation_status: 'enviada' }, company_id)`. No pasa por `QuotationsService.update`, así que **no sella `sent_at` ni manda el aviso `QUOTATION_IS_SENT`**. Si falla, solo queda en el log.
13. **Respuesta**: el motor devuelve `{ enviado_a }`. La ficha muestra un toast e invalida `["followups", id]`, `["quotation", id]` y `["quotations", "ficha-lista"]`.

### 5.2 Cambiar el estado a mano (tablero o ficha)

1. **Pantalla**: se cambia desde el tablero (menú `estadoPill` o soltar la tarjeta en otra columna, ambos llaman `handleStatusChange`) o desde la ficha (`NegocioPage.cambiarEstado`).
2. **Reglas de pantalla**:
   - volver de post-venta a pre-venta pide confirmación con `pendingStatusChange` (solo en el tablero), pero `handleStatusChange` busca la tarjeta en `quotations`, que solo trae el embudo: en la práctica no se dispara (ver sección 8);
   - rechazar o anular abre `MotivoPerdida`;
   - aceptar consulta `getPaymentsByQuotationId`; si no hay plan, abre `PaymentPlanEditor` → `createPaymentPlan` (mapa 03) en vez de cambiar el estado.
3. **App**: `updateQuotation` llama `PATCH /quotations/:id` con `quotation_status`, más `loss_reason` si hubo motivo.
4. **Motor**: `QuotationsService.update` revisa, en orden:
   - candado de `realizada`: 400 con `EVENTO_REALIZADO_CONGELADO`;
   - recepción sobre una cotización: 403;
   - si el parche toca plata, corre `assertMoneyMatches`;
   - vuelta de post-venta a pre-venta: con dinero registrado, 400; sin dinero, `paymentsService.deletePaymentPlan`;
   - si la cotización actual es `aceptada` y cambia el total, corre la cascada de cuotas y reembolsos (mapa 03).
5. **Paso a enviada**: si la cotización pasa **a `enviada` desde otro estado**:
   - `resolveRecipient` busca el mandante vinculado (`findContactById`) y, si no hay vínculo, el contacto por nombre escrito (`findContactByName`, con `ilike`); nunca cae al correo del cliente, y un mandante vinculado sin correo no recibe nada;
   - `EmailService.sendEmail(QUOTATION_IS_SENT)` avisa al mandante;
   - se sella `sent_at` con la hora actual.
6. Si el parche trae `contact_name`, `resolveContactId` recalcula `client_contact_id`. Después se llama `QuotationsRepository.update`.
7. **Efectos en la app**: el comentario de `MotivoPerdida` se guarda con `createFollowup` como nota sin tipo. El tablero invalida `["quotations"]` y `["requirements"]`; la ficha, `["quotations"]` y `["quotation", id]`.

### 5.3 Anotar en la bitácora

1. **Pantalla**: `HiloSeguimiento`, en la ficha o en Post-Venta. Tiene tres modos según el estado:

   | Modo | Estados | Qué exige |
   |---|---|---|
   | Venta | `ESTADOS_VIVOS_SEGUIMIENTO` | Tipo y próximo contacto obligatorios |
   | Operación | `ESTADOS_OPERATIVOS_SEGUIMIENTO` | Todo opcional, pero una fecha puesta vence |
   | Archivo | rechazada, cancelada | Solo texto |

2. **App**: `createFollowup` llama `POST /quotation-followups`.
3. **Motor**: `QuotationFollowupsService.create` valida y guarda:
   - quita espacios sobrantes; una nota vacía responde 400;
   - `findOwnedQuotation(company_id, quotation_id)` verifica la empresa; una cotización ajena responde 403;
   - el autor es `user.id`, con el nombre congelado `full_name || email`;
   - `QuotationFollowupsRepository.create` inserta en `quotation_followups`.
4. **Editar o borrar**: `assertAuthor` compara `author_user_id`; en notas antiguas con autor nulo, compara `author_name` con el correo. **"Listo"** es un PATCH con solo `next_contact_done_at` y basta con que la nota sea de la empresa.
5. **Efectos**: el hilo invalida `["seguimientos", id]` y `["seguimientos", "map"]`. `mapByCompany` recalcula dos datos:
   - `last_at`: la nota más nueva;
   - el compromiso vigente: la nota más reciente con fecha y sin cumplir.

   Con eso se pintan el semáforo del tablero (`semaforoDe`) y el aviso ámbar de Post-Venta.
6. La línea gris "Cotización enviada al cliente" del hilo no es una fila: sale de `quotations.sent_at`.

### 5.4 Los relojes (`api-rest/src/quotations/quotations-cron.service.ts`)

1. `ScheduleModule` corre crons solo con `NODE_ENV === 'production'` (`api-rest/src/app.module.ts`).
2. **Toques de seguimiento**: `sendQuotationFollowUps` corre a diario (`0 11 * * *`, 11:00 UTC). Para 7 y para 14 días, `QuotationsRepository.findFollowUps(desde, hasta, hoy)` trae, de **todas las empresas**, las cotizaciones:
   - con estado `enviada`;
   - cuyo `sent_at` cayó justo ese día;
   - cuyo evento todavía no pasa.
3. Para cada una, `findContactById(client_contact_id)`:
   - sin correo: aviso en el log y se salta;
   - con correo: `EmailService.sendEmail(QUOTATION_FOLLOW_UP)`, toque 1 o 2, con el botón del portal.

   `EmailService` no lo manda si la empresa lo apagó en `notifications.emails`.
4. Con `RUN_FOLLOWUPS_ON_BOOT=1`, el toque corre una vez al arrancar (palanca de rescate del 31-07).
5. **Resumen semanal**: `sendWeeklyDigest` (`0 11 * * 1`) junta, por empresa, los eventos aceptados de la semana y el conteo de solicitadas, enviadas y en negociación, y lo envía a los administradores (`WEEKLY_DIGEST`). Detalle en el mapa 12.

### 5.5 Requerimientos

1. **Origen**: llegan del formulario público (`QuotationsService.createPublic`, mapa 11) como `request_type = requerimiento` y estado `solicitada`, o los registra el equipo en `RequestForm` (`POST /quotations`).
2. **Pantalla**: `RequestsPage` y el aviso del tablero comparten la llave `["requirements"]` (solo `solicitada`).
3. **Cotizar**: "Cotizar" abre `/quotation-form/:id` (mapa 01). Al guardar, `estadoAlGuardar` respeta el estado del formulario: nada fuerza `enviada`.

## 6. Reglas de negocio acordadas

### Envío por correo

- **Una sola plantilla**:
  - Qué: el motor no dibuja un segundo PDF; imprime la hoja pública, que es la misma del visor y del portal.
  - Evidencia: doc 13, "La regla de oro"; JSDoc de `EnvioCotizacionService`; comentario de `ImprimirCotizacion`.
- **Correo tipo determinista, sin LLM**:
  - Qué: ningún envío pasa por un LLM. Los correos finos siguen siendo artesanales con la skill.
  - Evidencia: doc 13.
- **Adiós al botón de Outlook**:
  - Qué: Felipe lo pidió validando en el lab el 05-09: "me gusta el botón pero eliminaria el botón correo".
  - Evidencia: doc 13; comentario en `NegocioPage`.
- **El portero frena solo tres cosas**:
  - Qué: sin correo, total cero, servicio en $0. No hay frenos por estado: "quien aprieta el botón decide".
  - Evidencia: `reparosDelPortero`; doc 13; `correo-cotizacion.spec.ts`.
- **Copia oculta al buzón de respuestas** (Felipe, 08-09):
  - Qué: nunca visible, y sin duplicar si el destino ya es ese buzón.
  - Evidencia: `enviarDeVerdad`; pruebas "copia OCULTA" y "no se manda copia duplicada".
- **Hilo único: asunto idéntico en todas las versiones** (Felipe, 05-09):
  - Cita: "puede estar bien que esté en el mismo hilo toda la conversación".
  - Qué: desde la versión 2 el correo abre con "Hemos actualizado tu cotización". Cada envío lleva al pie un sello con fecha y hora de Chile, para que Gmail no lo recorte.
  - Evidencia: `correoDeCotizacion` y `selloDeVersion`; prueba "el reenvío conserva el asunto".
- **Nunca el neto solo**:
  - Qué: siempre Neto + IVA + TOTAL. La propina se descuenta del total antes de calcular el IVA; neto = total con IVA / 1,19.
  - Evidencia: `totalesDeCotizacion`; pruebas de "la matemática de la hoja, calcada".
- **Fecha y condiciones**:
  - Qué: el día de semana se calcula de la fecha, formateada en UTC. Condiciones neutras, sin prometer bloqueo de fecha; sin guion largo ni "no dudes" en el cuerpo.
  - Evidencia: `fechaLargaDelEvento`; prueba "sin guion largo ni promesas de bloqueo".
- **El estado se mueve solo en la primera salida** (Felipe, 10-09):
  - Cita: "cuando alguien aprieta el botón enviar cotización debería cambiarse automáticamente el estado a enviada… si ya está enviada no hacer nada, si aparece en negociación y es un correo de ajuste o actualización mantenerse en el estado que está".
  - Qué: Solicitada pasa a Enviada; cualquier otro estado queda igual.
  - Evidencia: `ESTADO_ANTES_DE_ENVIAR` y `ESTADO_TRAS_ENVIAR`; doc 13; pruebas "una SOLICITADA que se envía queda ENVIADA" y "un reenvío NO mueve el estado".
- **El botón no se toca** (Felipe, 10-09):
  - Cita: "el botón no hay que tocarlo… es la única acción que debe tener el apretar el botón".
  - Qué: el commit `912c912` deshizo el intento del `5a0d714` de esconderlo en las cerradas. Hoy aparece en todos los estados.
  - Evidencia: `git show 912c912`; doc 13.
- **Token de impresión**:
  - Qué: HMAC-SHA256 con el mismo secreto de las bajas de marketing y 15 minutos de vida. Vencido o adulterado responde 404 sin pistas.
  - Evidencia: `firma-impresion.ts`; `EnvioCotizacionService.secreto`; pruebas del token en `correo-cotizacion.spec.ts`.
- **Una sola lista blanca para las puertas públicas**:
  - Qué: el portal y la impresión usan la misma lista; jamás salen costos internos.
  - Evidencia: `listaBlancaDeHoja` (`hoja-publica.ts`), usada por `hojaParaImprimir` y `QuotationsService.getPortalQuotation`.
- **Arreglos de la revisión del 06-09**:
  - Qué: candado contra doble envío (`enviosEnCurso`), tope de 10 s a la espera de fuentes, solo colores `#rrggbb` dentro del HTML y escape canónico con `escaparHtml`.
  - Evidencia: comentarios en `envio-cotizacion.service.ts` y `correo-cotizacion.ts`.
- **La letra viaja con la hoja** (05-09):
  - Qué: Inter declarada dentro de la hoja (`@font-face` que baja los archivos de Google Fonts), y la fecha de emisión en hora de Chile.
  - Evidencia: `INTER_FONT_FACES` y `emittedLabel` en `quotationPrintDoc.ts`.

### Estados

- **Nadie fuerza "enviada" al guardar** (Felipe, 18-08):
  - Cita: "debería quedar en solicitada hasta que se envíe".
  - Evidencia: `estadoAlGuardar` y su prueba en `estadoCotizacion.test.ts`.
- **Anulada y Realizada son destinos exclusivos de lo aceptado** (Felipe, 04-08):
  - Qué: anular solo lo ofrece a administradores y desde Aceptada. La rechazada se puede revivir desde la ficha (pillada del 04-08).
  - Evidencia: `QuotationsPage.statusOptionsFor`; `ESTADOS_VIVOS_FICHA` en `NegocioPage`.
- **Candado del evento realizado** (13-08):
  - Cita: "El realizado es un estado de que YA SE HIZO".
  - Qué: queda congelado para todos. El tablero ya no ofrece salidas; antes se des-realizaba de un clic.
  - Evidencia: `EVENTO_REALIZADO_CONGELADO` en `api-rest/src/quotations/constants/constants.ts`; `QuotationsService.update` y `remove`; `statusOptionsFor`; `candado-evento-realizado.spec.ts`.
- **Vuelta de post-venta a pre-venta**:
  - Qué: sin dinero registrado se borra el plan de pagos. Con dinero, el camino es "Anular evento" en Post-Venta.
  - Evidencia: bloque GUARDIA DE ESTADOS en `QuotationsService.update`.
- **Motivo de pérdida obligatorio al rechazar o anular** (06-08):
  - Por qué: el ticket promedio de las ganadas ($3.025.652) y el de las perdidas ($3.028.883) eran casi iguales; el precio no explica las derrotas.
  - Qué: el comentario viaja como nota al hilo.
  - Evidencia: `61_motivo_perdida.sql`; `MotivoPerdida.tsx`.
- **La palabra oficial es "Anulada"** (Felipe, 12-08):
  - Qué: se muestra así aunque la base guarde `cancelada`. Nombres y colores viven solo en el diccionario.
  - Evidencia: `estadoCotizacion.ts` y su prueba.
- **Recepción trabaja requerimientos, no cotizaciones** (28-07 al crear, 12-08 al editar):
  - Qué: igual ve el tablero y la ficha, y anota seguimiento.
  - Cita del 12-08: "llamar y anotar en qué quedó la conversación es literalmente su pega".
  - Evidencia: `QuotationsController.create`; `QuotationsService.update`; comentario de `QuotationFollowupsController`; `frontend/src/constants/permissions.ts`.

### Seguimiento

- **Un negocio vivo siempre tiene próximo paso** (regla de Close de Felipe, 04-08):
  - Qué: en un evento ganado todo es opcional, pero una fecha puesta vence (07-08). En rechazada o anulada "muere el deal y mata todo seguimiento".
  - Evidencia: cabecera de `SeguimientoPanel.tsx`.
- **Un solo hilo para toda la vida del evento**:
  - Cita (Felipe, 07-08): "Si algo se olvida uno va a seguimiento y está todo".
  - Evidencia: `SeguimientoPanel.tsx`.
- **Solo el autor edita o borra su nota**:
  - Qué: la empresa sale de la sesión, nunca del body, y el nombre del autor queda congelado.
  - Evidencia: `QuotationFollowupsService.assertAuthor`; `59_bitacora_comercial.sql`.
- **"Listo" cierra un pendiente aunque la nota sea de otro** (07-08):
  - Por qué: las notas eran de Camila y Felipe recibía 403.
  - Qué: no borra la fecha ("la casa no reescribe la historia"). En pantalla, "Listo" aparece solo en evento ganado (reafirmado por Felipe el 12-08).
  - Evidencia: `QuotationFollowupsService.update`; `65_seguimiento_cumplido.sql`; `HiloSeguimiento`.
- **Semáforo del tablero**:
  - Qué: verde con menos de 3 días sin gestión, ámbar de 3 a 7, rojo con más de 7. Próximo contacto vigente = verde; vencido = rojo. "Requieren seguimiento" = vencido o 3 días o más sin gestión.
  - Evidencia: `QuotationsPage.semaforoDe` y `requiereSeguimiento`.
- **Dos toques automáticos y después silencio** (Felipe, 30-07):
  - Qué: día 7 y día 14 exactos desde `sent_at`, solo en `enviada`, solo si el evento no pasó, al mandante con su portal. Se puede apagar por empresa.
  - Evidencia: `QuotationsCronService.sendQuotationFollowUps`; `51_seguimiento_sent_at.sql`.
- **Un resumen semanal en vez de dos diarios** (plan anti-spam, 29-07):
  - Qué: sale solo si hay algo que contar.
  - Evidencia: cabecera de `quotations-cron.service.ts`.

### Tablero, ficha y borrado

- **El tablero es la única vista**:
  - Qué: la Lista se jubiló el 04-08. Orden por monto por defecto (06-08). Los filtros se recuerdan por usuario en la pestaña (05-08) y se olvidan al crear una cotización.
  - Evidencia: `QuotationsPage`; `filtrosTablero.ts`.
- **Estados honestos**:
  - Qué: cargando = rueda; error = mensaje con reintento (pillada del 04-08).
  - Evidencia: `NegocioPage`.
- **Una cotización con plata colgando no se borra**:
  - Qué: el mensaje dice la salida real (Felipe se topó con el error crudo el 26-07).
  - Evidencia: `QuotationsRepository.assertDeletable`.

## 7. Conexiones con otros módulos

**A quién usa este módulo**

- **01 Cotizador**:
  - `QuotationForm` crea y edita las cotizaciones.
  - `ServiciosTab` es la pestaña Servicios de la ficha.
  - `api-rest/src/quotations/utils/money.ts` valida montos en cada PATCH que toca plata.
- **03 Pagos, reembolsos y portal**:
  - Aceptar exige plan: `PaymentPlanEditor` y `createPaymentPlan`.
  - La vuelta a pre-venta llama `paymentsService.deletePaymentPlan`.
  - El portal comparte `buildQuotationPrintDoc` y `listaBlancaDeHoja`, y muestra las `enviada` y `en_negociacion` como "en conversación".
- **05 Catálogo**: `cartaDelCatalogo` agrupa la hoja por secciones.
- **09 Clientes**: `ClientContactsRepository.findByClient`, `client_contact_id` y `resolveContactId`.
- **10 Marketing**: `marcaDesdeFila`, `plantillaCampana`, `esClaro` y `textoSobre`, y el secreto `MARKETING_BAJA_SECRET`.
- **12 Correos internos**: `EmailService` con `QUOTATION_IS_SENT`, `QUOTATION_FOLLOW_UP` y `WEEKLY_DIGEST`, y los interruptores `notifications.emails`.
- **15 Acceso**: `RolesGuard`, `api-rest/src/auth/roles.decorator.ts` y `frontend/src/constants/permissions.ts`.
- **17 Kit de la casa**: `ConfirmInline`, `Toast`, `estadoCotizacion`, `humanizeApiError` y `useCopiarDato`.
- **19 Despliegue**: Chromium en Railway, `FRONTEND_URL` y la memoria que consume cada impresión.

**Quién usa este módulo**

- **04 Post-Venta**:
  - monta `HiloSeguimiento` y `AdjuntosComerciales`;
  - lee `getFollowupsMap` para el aviso ámbar de la pestaña Seguimiento;
  - comparte `EventoCajitas`.
- **13 Dashboard**:
  - la cosecha del mes abre `/negocio/:id`;
  - `loss_reason` alimenta "Por qué perdimos";
  - `tendencias.ts` usa el diccionario de estados.
- **16 Calendario**: `Calendar` navega a `/negocio/:id`.
- **11 Consultas**: `ConsultasPage` vive bajo `SECTION_ROLES.quotations`, y el formulario público crea requerimientos.
- **09 Clientes**: `ClientDetailPage` pinta los chips con `estadoCotizacion`.

**Efectos automáticos**

- **Enviar**: sale un correo con PDF al cliente, con copia oculta al buzón de respuestas. Queda una nota en la bitácora y, si la cotización estaba solicitada, pasa a enviada.
- **Pasar a `enviada` a mano**: sale el correo `QUOTATION_IS_SENT` al mandante y se sella `sent_at`, que arranca el reloj de los días 7 y 14.
- **Aceptar**: se crea el plan de pagos y su correo al cliente (mapa 03).
- **Borrar una cotización**: su bitácora se borra en cascada (`ON DELETE CASCADE`, migración 59).
- **Relojes**: a diario los toques de los días 7 y 14; los lunes, el resumen a los administradores.

## 8. Zonas de riesgo: si tocas esto, cuidado con aquello

- **Si tocas** el marcado de estado dentro de `EnvioCotizacionService.enviarDeVerdad`, **se afecta** el reloj de seguimiento, **porque** hoy escribe por el repositorio solo `{ quotation_status: 'enviada' }` y no sella `sent_at`.
  - Una cotización enviada con el botón desde Solicitada nunca recibe los toques de los días 7 y 14, porque `findFollowUps` filtra por `sent_at`.
  - Tampoco muestra la línea "Cotización enviada al cliente" en el hilo.
  - Pasarla por `QuotationsService.update` sellaría la fecha, pero mandaría además `QUOTATION_IS_SENT`: un segundo correo al cliente.
  - Evidencia: `enviarDeVerdad`; `QuotationsService.update`; `QuotationsRepository.findFollowUps`; la prueba "una SOLICITADA que se envía queda ENVIADA" exige ese payload exacto.
- **Si tocas** la clase `.qv-hoja` o lo que `ImprimirCotizacion` pinta mientras carga, **se afecta** todo envío, **porque** el motor espera ese selector para imprimir.
  - Si la clase no aparece, el envío muere a los 15 s.
  - Si aparece antes de que lleguen los datos, imprime una hoja incompleta.
  - Evidencia: `EnvioCotizacionService.generarPdf`; comentario de `ImprimirCotizacion`.
- **Si tocas** el orden de las rutas en `QuotationsController`, **se afecta** el aviso de choque de fechas, **porque** `GET check-conflicts` es un tramo fijo que debe ir antes de `GET :id`, o `findOne` (público) se la come.
  - Los comentarios de ambos controllers piden lo mismo para `imprimir/:token` y para `map`, pero `:id` captura un solo tramo de la ruta: `imprimir/:token` tiene dos, y `QuotationFollowupsController` no tiene `GET :id` (sus `:id` son `PATCH` y `DELETE`).
  - Evidencia: orden de `checkConflictsWithExistingQuotations`, `hojaParaImprimir` y `findOne` en `quotations.controller.ts`; comentarios en ambos controllers; `@nestjs/platform-express` en `api-rest/package.json`.
- **Si tocas** `MARCA_DE_ENVIO`, o el texto o el tipo de la nota de envío, **se afecta** el número de versión, **porque** se cuenta por ese prefijo y por `tipo = 'correo'`.
  - Las notas históricas dejarían de contar y un reenvío saldría como "¡Gracias por cotizar!".
  - Pasa lo mismo si alguien borra o edita su nota de envío, que es editable por su autor.
  - Evidencia: `enviarDeVerdad`; comentario "no tocar sin migrar los textos".
- **Si tocas** la matemática o las filas de `buildQuotationPrintDoc`, **se afecta** el cuerpo del correo, **porque** `correo-cotizacion.ts` calca esa matemática en el motor, a mano ("Si la hoja cambia, este archivo cambia con ella"), y ninguna prueba compara las dos.
  - Evidencia: JSDoc de `correo-cotizacion.ts`; `frontend/src/utils/quotationPrintDoc.ts`.
- **Si agregas** un campo a la hoja, **se afectan** el portal y la impresión, **porque** los dos salen de `listaBlancaDeHoja`.
  - Se agrega una sola vez ahí, y jamás un costo interno.
  - Si la ficha lo lee de la lista, también va en `COLUMNAS_LISTA` ("columna nueva en la tabla ⇒ agregarla acá").
  - Evidencia: `hoja-publica.ts`; `QuotationsRepository.findAll`.
- **Si tocas** la regla del destinatario en un solo lado, **se afecta** lo que la confirmación promete, **porque** ya hay tres copias que no calzan:

  | Función | Busca primero | Tildes | Respaldo |
  |---|---|---|---|
  | `NegocioPage.contactoDe` | nombre escrito | normalizadas | datos del cliente, solo si no hay mandante escrito |
  | `EnvioCotizacionService.correoDeDestino` | `client_contact_id` | sin normalizar | `clients.email` |
  | `QuotationsService.resolveRecipient` | contacto vinculado; sin vínculo, nombre escrito (`ilike`) | sin normalizar | nunca el cliente ("correos a personas y punto", 30-07) |

  - Caso concreto: un mandante escrito que no calza con ningún contacto. La ficha pregunta sin mostrar dirección y el motor envía al correo general del cliente.
- **Si mueves** una cotización a Enviada a mano (chip o arrastre), **se afecta** lo que recibe el cliente, **porque** `QuotationsService.update` manda `QUOTATION_IS_SENT`.
  - Ese correo dice "revisa también el correo con el documento adjunto", aunque nadie haya apretado el botón.
  - Volver de En negociación a Enviada lo manda de nuevo y reinicia `sent_at`.
  - Evidencia: `api-rest/src/email/templates/quotationIsSent/quotationIsSent.ts`; la condición de `sent_at` en `update`.
- **Si cambias** a Aceptada una **rechazada** desde su franja plegada del tablero, **se afecta** el plan de pagos, **porque** `applyStatusChange` busca la cotización en `quotations` y esa lista excluye las rechazadas.
  - Al no encontrarla, se salta la revisión de pagos y el `PaymentPlanEditor` y acepta directo.
  - Pasa algo parecido con las cerradas que aparecen en la búsqueda: `handleStatusChange` tampoco las encuentra y no pide la confirmación de volver a pre-venta. La guardia del motor sigue frenando si hay dinero.
  - Evidencia: `QuotationsPage.handleStatusChange` y `applyStatusChange`; `estadoPill(q)` usado en las franjas de rechazadas y cerradas.
- **Si tocas** los permisos de la ficha, **se afecta** la subida de respaldos, **porque** `AdjuntosComerciales` se muestra con `quotations_edit` (vendedor incluido), pero `EventDocumentsController` es `OPERATIONS_AND_UP`: un vendedor recibe 403.
  - El archivo alcanza a subir al balde (`POST /storage/upload` no tiene `@Roles`) y después `POST /event-documents` lo rebota; la lista le sale vacía porque `getDocumentsByQuotation` se traga el error.
  - Es la misma quemadura del 12-08 que se tapó solo para recepción.
  - Evidencia: `NegocioPage` (`puedeEditar` y su comentario del 12-08); `AdjuntosComerciales.subir`; `event-documents.controller.ts`; `api-rest/src/storage/storage.controller.ts`; `documents.service.ts`; `roles.decorator.ts`.
- **Si tocas** las invalidaciones de `NegocioPage`, **se afecta** la bitácora, **porque** tras enviar y tras `MotivoPerdida` se invalida `["followups", id]`, pero el hilo usa `["seguimientos", id]`.
  - La nota nueva aparece recién cuando la ventana recupera el foco o el hilo se vuelve a montar.
  - Evidencia: `NegocioPage.enviarPorCorreo`; `HiloSeguimiento`; `frontend/src/lib/queryClient.ts`.
- **Si escalas** el motor a más de una instancia o sube el volumen de envíos, **se afectan** la memoria y el doble envío, **porque** `enviosEnCurso` vive en la memoria de un solo proceso y solo frena la misma cotización.
  - Dos cotizaciones distintas levantan dos Chromium a la vez (~300 a 400 MB cada uno, según el doc 13).
  - Evidencia: `EnvioCotizacionService.enviar`; doc 13.
- **Si tocas** `QuotationsService.update`, **se afectan** todas las pantallas que guardan una cotización, **porque** es "LA puerta ancha del sistema": el comentario nombra la pestaña Servicios, el cotizador, la fecha de la cabecera y el desplegable del tablero (y dice "las cinco"); además la usan el chip de la ficha y `RequestForm`.
  - Concentra el candado, la guardia de estados, la cascada de pagos, el aviso de enviada y `sent_at`.
  - Evidencia: comentario del candado en `update`; `updateQuotation` en `ServiciosTab`, `QuotationForm`, `EventoCajitas`, `QuotationsPage`, `NegocioPage` y `RequestForm`; `candado-evento-realizado.spec.ts`.
- **Si agregas** un parámetro al constructor de `QuotationsService`, **se afectan** las pruebas, **porque** se arman por posición.
  - Insertar uno al medio rompió 34 de una vez (05-09); los nuevos van al final.
  - Evidencia: comentario en el constructor.
- **Si usas** `user.user_id` en vez de `user.id` al escribir notas, **se afecta** la autoría, **porque** la sesión solo trae `{ id, company_id, role, email }`.
  - Pasó el 07-08: las 38 notas de producción tenían el autor en null y nadie podía editar ni su propia nota.
  - Evidencia: `QuotationFollowupsService.create`; prueba "inserta con empresa y autor de la SESIÓN".
- **Si abres** el visor con la fila de la lista, **se afecta** el PDF, **porque** la lista viaja sin `items`.
  - La ficha mezcla el detalle por id (quemadura del 05-08, cotización 436: el PDF salía sin servicios).
  - Evidencia: render de `QuotationViewer` en `NegocioPage`; `COLUMNAS_LISTA`.
- **Si cambias** `FRONTEND_URL` o publicas motor y app por separado, **se afecta** el PDF adjunto, **porque** el motor imprime la hoja que esté publicada en esa dirección.
  - Un frontend viejo imprime la hoja vieja, y sin la ruta `/imprimir/:token` no hay envío.
  - Evidencia: `EnvioCotizacionService.frontendUrl` y `generarPdf`.
- **Si cambias** el secreto de las bajas de marketing, **se afecta** también la impresión, **porque** las dos comparten `MARKETING_BAJA_SECRET` (con respaldo en `RESEND_API_KEY`).
  - Evidencia: `EnvioCotizacionService.secreto`.
- **Si creas** una tabla nueva ligada a la cotización, **se afectan** el borrado y los permisos, **porque** hay dos trampas:
  - si apunta a `quotations` sin CASCADE, hay que sumarla a `assertDeletable`;
  - si nace sin GRANT, la API recibe "permission denied" (quemadura del 04-08 con `quotation_followups`).
  - Evidencia: `QuotationsRepository.assertDeletable`; `59_bitacora_comercial.sql`.

## 9. Pruebas que lo protegen

Motor (Jest, corre en CI con `npx jest --silent`):

- **`api-rest/src/quotations/tests/unit/envio-cotizacion.service.spec.ts`**: la orquestación del envío, con Chromium y Resend simulados.
  - Circuito feliz: PDF, destinatario, asunto con día de semana, nombre del archivo, `replyTo` del vendedor y nota de tipo correo.
  - Respaldo al correo del cliente.
  - Copia oculta al "Responder a", y sin duplicar si el destino es ese buzón.
  - El portero frena antes de imprimir.
  - Cotización de otra empresa: 404.
  - La versión 2 abre con "Hemos actualizado".
  - Si fallan la bitácora o el marcado de estado, el envío no se rompe.
  - Solicitada queda Enviada, con el payload exacto.
  - Un reenvío no mueve enviada, en negociación, aceptada ni rechazada.
  - Token basura: 404.
- **`api-rest/src/quotations/tests/unit/correo-cotizacion.spec.ts`**: el correo y el token.
  - Los tres frenos del portero.
  - Neto + IVA = total, y la propina restada antes del IVA.
  - Asunto, saludo y la estructura de la hoja, con y sin propina.
  - Asunto idéntico y sello de versión en hora de Chile.
  - Sin guion largo, sin "bloquea", sin "no dudes".
  - Token válido, vencido y adulterado.
- **`api-rest/src/quotation-followups/tests/quotation-followups.service.spec.ts`**: la bitácora.
  - Autor y empresa salen de la sesión, y el correo queda como firma.
  - Nota vacía: 400. Cotización ajena: 403.
  - Solo el autor edita o borra.
  - `updated_at` lo sella el servidor.
  - `mapByCompany` toma la última nota y el compromiso vigente.
  - "Listo" funciona sobre la nota de otro; el texto sigue exigiendo autoría.
- **`api-rest/src/quotations/tests/unit/candado-evento-realizado.spec.ts`**: un realizado no se edita, no sale a otros estados y no se borra; volver a aceptada y la cosecha siguen funcionando.
- **`api-rest/src/quotations/tests/unit/quotations.service.spec.ts`**: `update` (errores, candado de recepción, cascada en aceptada), `checkConflictsWithExistingQuotations` con `exclude_id` y `setHarvestStatus`.
- **`quotations.controller.spec.ts` y `quotation-followups.controller.spec.ts`**: solo "should be defined".

App (Vitest, corre en CI con `npm run test`):

- **`frontend/src/utils/estadoCotizacion.test.ts`**: "Anulada", un color por estado, el orden del ciclo de vida, estado desconocido y `estadoAlGuardar`.

**Lo importante que NO está cubierto:**

- **Relojes**: `QuotationsCronService` no tiene prueba. Nada cubre la ventana de 7/14 días, la omisión de mandantes sin correo, `RUN_FOLLOWUPS_ON_BOOT` ni el resumen semanal.
- **Paso a enviada en `QuotationsService.update`**: no encontré prueba del aviso `QUOTATION_IS_SENT`, del sellado de `sent_at` ni de la guardia de post-venta a pre-venta con borrado del plan.
- **Envío**:
  - `generarPdf` real (Chromium va simulado);
  - `hojaParaImprimir` con un token válido;
  - el candado `enviosEnCurso`;
  - el calce del destinatario solo por nombre;
  - los reparos por ítems variables en $0 (solo se prueba un fijo).
- **Paridad hoja-correo**: ninguna prueba compara la matemática de `quotationPrintDoc.ts` con la de `correo-cotizacion.ts`.
- **Pantallas**: `NegocioPage`, `QuotationsPage`, `SeguimientoPanel`, `ImprimirCotizacion`, `RequestsPage`, el semáforo (`semaforoDe`) y `filtrosTablero.ts` no tienen pruebas.

## 10. Deuda y rarezas conocidas

- **Tamaño**:
  - `api-rest/src/quotations/quotations.service.ts` (1309 líneas), `QuotationsPage.tsx` (1206) y `SeguimientoPanel.tsx` (1076) están entre los archivos de más de 800 líneas.
  - El portero tiene techo 27 y hoy hay exactamente 27, contados con su misma regla: cualquier archivo nuevo que cruce las 800 lo deja en rojo.
  - Ninguno de los tres está congelado por nombre. `ServiciosTab.tsx` sí lo está (2265 líneas, techo 2285) y se monta en la ficha.
- **Paneles flotantes hechos a mano** que cuentan en el techo 13 del portero: uno en `NegocioPage` (menú de estado) y dos en `QuotationsPage` (estado y orden). `ChipDeEstado` dice haber nacido en la ficha de cotización, pero la ficha no lo usa: hoy solo lo importa `PersonaFichaPage`.
- **`IconoWhatsApp` copiado a mano** dentro de `NegocioPage` y de `SeguimientoPanel`, con la pieza `components/IconoWhatsApp` al lado; solo `PersonaFichaPage` la importa.
- **Reglas copiadas**:
  - tres copias de la regla de contacto (ver la sección 8);
  - dos del menú de estados y del ritual de aceptar: `NegocioPage.cambiarEstado`/`guardarPlan` y `QuotationsPage.applyStatusChange`/`handlePaymentPlanSave`;
  - la matemática de la hoja, en `quotationPrintDoc.ts` y en `correo-cotizacion.ts`.
- **La ficha pide la lista completa** de cotizaciones, en los 7 estados, solo para encontrar una fila (`ficha-lista`). Un id de requerimiento cae en "No se encontró esta cotización", porque esa lista filtra `COTIZACION`.
- **`GET /quotations/:id` es `@Public`**, sin filtro de empresa y con `select *`, así que incluye los costos provisionados. Hay un TODO en el controller ("maybe create public endpoint for this"). La ficha depende de él.
- **Repositorios dentro de archivos de controller**: `ClientContactsRepository` (`api-rest/src/clients/client-contacts.controller.ts`), `EventDocumentsRepository` y `PortalReceiptsRepository`.
- **Entidad desactualizada**: la entidad `Quotation` del motor no declara `sent_at`, `survey_sent_at` ni `harvest_status`, y `UpdateQuotationDto` (un `PartialType` de `CreateQuotationDto`) tampoco. Por eso `update` escribe `sent_at` con `as unknown as { sent_at?: string }`, y `markEventDone`, `unmarkEventDone` y `setHarvestStatus` castean su parche `as unknown as UpdateQuotationDto`. El tipo `GrupoVariable` de `correo-cotizacion.ts` reconoce que el tipo de la entidad es viejo.
- **Comentario huérfano**: el JSDoc de `MARCA_DE_ENVIO` quedó encima de `ESTADO_ANTES_DE_ENVIAR`, en `envio-cotizacion.service.ts`.
- **Código muerto**: `estadoAlGuardar` conserva un parámetro `_desdeRequerimiento` que ya no se usa, y la entidad `Quotation` sigue declarando `portal_token`, sin uso desde la migración 48 y cuya columna borró `58_limpia_portal_token_de_cotizaciones.sql`.
- **Nombre del PDF adjunto**: se llama `Cotizacion_N42_ValledelSol.pdf`, con el nombre de la empresa propia. El visor usa `nombreArchivo` ("470 - Cliente"), que Felipe pidió el 06-08 justamente para no repetir el nombre propio.
- **Toast técnico**: el tablero dice "Estado actualizado a en_negociacion" con el valor de la base, no con la etiqueta del diccionario.
- **Notas antiguas sin lápiz**: en el hilo, editar y borrar solo aparecen si `author_user_id === user.id`. Las notas con autor nulo, que el motor sí deja editar comparando el correo, no muestran los botones.
- **Consultas sin límite**:
  - `mapByCompany` lee todas las notas de la empresa en cada carga del tablero ("volúmenes chicos, sin RPC");
  - `findFollowUps` y el resumen semanal consultan sin `company_id`: es un cron global, a propósito, pero fuera de la regla de `CLAUDE.md`.
- **WhatsApp a mano**: `wspHref` agrega el 56 si el número tiene 9 dígitos, en vez de usar `utils/phone`.

## 11. Contradicciones entre documento y código

1. **Asunto del reenvío.**
   - Doc 13, cabecera: el reenvío con "Hemos actualizado tu cotización" lleva **"asunto propio y sello de versión"**.
   - Código: el asunto es **idéntico** en todas las versiones (`correoDeCotizacion`: "Asunto IDÉNTICO… decisión de Felipe 05-09"; prueba "el reenvío conserva el asunto").
   - Historia: el commit `e2afb75` reemplazó al `84d93cb`, que daba asunto propio.
2. **Por qué el marcado de estado va por el repositorio.**
   - Doc 13, "El estado se mueve SOLO en la primera salida": pasar por `quotations.service.update` "dispara la cascada del plan de pagos".
   - Código: `QuotationsService.update` corre la cascada solo si la cotización actual está `aceptada` o sale de post-venta. En Solicitada → Enviada no hay cascada. Lo que sí haría es mandar `QUOTATION_IS_SENT` y sellar `sent_at`.
   - Consecuencia no mencionada en el doc: el envío por botón no sella `sent_at`, del que dependen la migración 51 y el cron de los días 7 y 14.
3. **Refresco al enviar.**
   - Doc 13: "Al enviar se refrescan la bitácora, la ficha y la lista".
   - Código: `NegocioPage.enviarPorCorreo` invalida `["followups", id]`, pero `HiloSeguimiento` usa `["seguimientos", quotation.id]`, así que esa invalidación no refresca la bitácora. La lista que se invalida es `["quotations", "ficha-lista"]`, no la del tablero (`["quotations", "embudo-y-rechazadas"]`).
4. **"Un envío a la vez".**
   - Doc 13, paso 4 del circuito: "un envío a la vez".
   - Código: `enviosEnCurso` es un `Set` por id de cotización, en memoria. Solo impide duplicar la misma; dos cotizaciones distintas imprimen en paralelo.
5. **Railway (el doc se contradice a sí mismo).**
   - Cabecera del doc 13: el motor necesita librerías declaradas en Railway (`RAILPACK_DEPLOY_APT_PACKAGES`).
   - Sección "Chromium en Railway": `@sparticuz/chromium` "trae el binario y sus librerías empaquetadas — no hay que tocar la imagen de Nixpacks ni agregar configuración a Railway".
   - El repo no tiene archivo de configuración de Railway que lo resuelva.
6. **"La regla `contactoDe` de la ficha, se replica en el motor".**
   - Doc 13, tabla de piezas, dice que la regla es la misma en los dos lados.
   - Código: la réplica no es igual. `correoDeDestino` busca primero por `client_contact_id`, no normaliza tildes y cae a `clients.email`. `contactoDe` busca solo por nombre normalizado y cae a los datos generales del cliente solo cuando no hay mandante escrito.
7. **Falsa alarma de `EventoCajitas`.**
   - Doc 09, Tanda A4: la anota como pendiente ("avisa 'ese día ya tiene eventos' contra sí misma").
   - Código: `EventoCajitas` ya pasa su propio `quotationId` como exclusión ("EXCEPTO YO (Felipe, 21-08)").
8. **Pruebas del frontend.**
   - `CLAUDE.md`: "There is no frontend test suite".
   - Código: existe Vitest (`npm run test`), el CI lo corre y hay pruebas como `estadoCotizacion.test.ts`.

## 12. Preguntas abiertas

1. **`sent_at` al enviar con el botón.** ¿Es intencional que no se selle al pasar de Solicitada a Enviada? Hoy eso deja esas cotizaciones sin toques automáticos de los días 7 y 14 y sin la línea de sistema en el hilo.
2. **Recepción y el botón.** ¿Recepción debe poder apretar "Enviar cotización"? El endpoint no tiene `@Roles` y el botón se ve sin revisar el rol.
3. **El botón en las cerradas.** ¿Debe funcionar en aceptadas, realizadas, rechazadas y anuladas? El motor no frena por estado y el botón quedó visible en todas desde el `912c912`.
4. **Pie del PDF del motor.** ¿Lleva "Página N de M"?
   - Ese pie vive en `@page` con `@bottom-left` y `@bottom-right`, pensados para `paged.polyfill.js`, que solo carga `openQuotationPrintWindow`.
   - `ImprimirCotizacion` no carga esa pieza, y `page.pdf` pasa márgenes propios (10 y 8 mm) distintos a los 12 mm de `@page`.
   - No se puede saber sin imprimir.
5. **Railway.** ¿Railway tiene hoy declarado `RAILPACK_DEPLOY_APT_PACKAGES`, y es necesario? El doc 13 se contradice y el repo no lo muestra.
6. **Instancias del motor.** ¿Cuántas corren en producción? De eso depende que el candado `enviosEnCurso` sirva.
7. **`observations` en las puertas públicas.** `listaBlancaDeHoja` lo incluye y `buildQuotationPrintDoc` lo pinta en el bloque "Observaciones", así que sale en el PDF adjunto y en el portal. En lo que nace del formulario público, `QuotationsService.createPublic` lo guarda con "[Desde formulario publico] ---" y puede traer "Presupuesto estimado". ¿Es aceptable?
8. **Pendientes del doc 09.** No re-verifiqué dos pendientes de la Tanda A4: `QuotationViewer`, que sale con la lista plana sin avisar si falla la red, y `RequestForm`, que deja la pantalla en blanco al editar un requerimiento sin fecha.
9. **Interruptores de correos.** El correo del botón va directo a Resend y no pasa por los interruptores `notifications.emails`. ¿Es lo esperado?
10. **Nombre del PDF adjunto.** ¿Debe seguir la regla `nombreArchivo` del 06-08 ("470 - Cliente")?
11. **Nota automática de envío.** ¿Debe protegerse contra edición o borrado? Hoy su autor puede tocarla, y eso altera el conteo de versiones.

## 13. Archivos clave

### Motor

- `api-rest/src/quotations/envio-cotizacion.service.ts`: el circuito del botón y la puerta de impresión.
- `api-rest/src/quotations/correo-cotizacion.ts`: portero, totales, fecha y correo tipo.
- `api-rest/src/quotations/firma-impresion.ts`: token de impresión.
- `api-rest/src/quotations/hoja-publica.ts`: lista blanca de la hoja.
- `api-rest/src/quotations/quotations.controller.ts`
- `api-rest/src/quotations/quotations.service.ts`: `update`, `resolveRecipient`, `remove`, `findAll`, `findOne`.
- `api-rest/src/quotations/quotations.repository.ts`: `findAll` (`COLUMNAS_LISTA`), `findOne`, `update`, `findFollowUps`, `findContactById`, `cartaDelCatalogo`, `assertDeletable`.
- `api-rest/src/quotations/quotations-cron.service.ts`
- `api-rest/src/quotations/constants/constants.ts`: `QuotationStatus` y `EVENTO_REALIZADO_CONGELADO`.
- `api-rest/src/quotations/quotations.module.ts`
- `api-rest/src/quotations/event-documents.controller.ts`
- `api-rest/src/quotation-followups/`:
  - `quotation-followups.controller.ts`
  - `quotation-followups.service.ts`
  - `quotation-followups.repository.ts`
  - `quotation-followups.module.ts`
  - `dto/`, `entities/`, `types/`
- Dependencias directas:
  - `api-rest/src/marketing/marca.ts`
  - `api-rest/src/marketing/plantilla.ts`
  - `api-rest/src/clients/client-contacts.controller.ts`
  - `api-rest/src/email/templates/quotationIsSent/quotationIsSent.ts`
  - `api-rest/src/email/templates/quotationFollowUp/template.ts`
  - `api-rest/src/auth/roles.decorator.ts`
- Pruebas:
  - `api-rest/src/quotations/tests/unit/envio-cotizacion.service.spec.ts`
  - `api-rest/src/quotations/tests/unit/correo-cotizacion.spec.ts`
  - `api-rest/src/quotations/tests/unit/candado-evento-realizado.spec.ts`
  - `api-rest/src/quotations/tests/unit/quotations.service.spec.ts`
  - `api-rest/src/quotation-followups/tests/quotation-followups.service.spec.ts`
- Migraciones, cada una con su reversa:
  - `docs/migrations/51_seguimiento_sent_at.sql`
  - `docs/migrations/59_bitacora_comercial.sql`
  - `docs/migrations/61_motivo_perdida.sql`
  - `docs/migrations/65_seguimiento_cumplido.sql`

### App

- `frontend/src/pages/quotations/NegocioPage.tsx`
- `frontend/src/pages/quotations/QuotationsPage.tsx`
- `frontend/src/pages/quotations/SeguimientoPanel.tsx`
- `frontend/src/pages/quotations/ImprimirCotizacion.tsx`
- `frontend/src/pages/quotations/filtrosTablero.ts`
- `frontend/src/pages/RequestsPage.tsx`
- `frontend/src/components/RequestForm.tsx`
- `frontend/src/utils/quotationPrintDoc.ts`: `buildQuotationPrintDoc`, `nombreArchivo`, `openQuotationPrintWindow`.
- `frontend/src/utils/estadoCotizacion.ts`, con su prueba `estadoCotizacion.test.ts`.
- `frontend/src/components/QuotationViewer.tsx`
- `frontend/src/components/MotivoPerdida.tsx`
- `frontend/src/components/EventoCajitas.tsx`
- `frontend/src/services/quotations.service.ts`: `getQuotations`, `getQuotationById`, `updateQuotation`, `enviarCotizacionPorCorreo`, `getHojaParaImprimir`.
- `frontend/src/services/quotationFollowups.service.ts`
- `frontend/src/services/documents.service.ts`
- `frontend/src/constants/api.routes.ts`
- `frontend/src/constants/permissions.ts`
- `frontend/src/App.tsx`: las rutas `quotations`, `negocio/:id`, `requests` e `/imprimir/:token`.
- `frontend/public/paged.polyfill.js`

### Documento que manda

- `docs/arquitectura/13_ENVIO_DE_COTIZACIONES.md`
