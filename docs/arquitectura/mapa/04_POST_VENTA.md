# Mapa: Post-Venta

> **Estado: verificado una vez contra el código** (commit 0de0ddb, 11-09-2026). Falta la etapa de completar lo que no quedó escrito. Parte del atlas de docs/arquitectura/mapa; el índice es 00_MAPA_DEL_SISTEMA.md.

## 1. Qué hace

Post-Venta es donde vive el evento **ya ganado**. Un evento entra cuando su cotización tiene plan de pagos: crear el plan la deja en `aceptada`. Se queda ahí hasta después de realizado, porque la cobranza puede seguir. Lo usan **operaciones y administrador** (sección `payments`).

Tiene dos partes:
- **La lista de eventos cerrados** (`/post-venta`): totales de plata, filtros por estado del evento y por estado de la plata, y la bandeja de comprobantes que suben los clientes desde el portal.
- **La ficha del evento** (`/post-venta/:id`): una página con seis pestañas (Seguimiento, Pagos, Documentos, Servicios, Gestión y Cocina).

Desde la ficha se hacen los cambios de estado:
- **Marcar realizado**: manda la encuesta y congela el evento.
- **Volver a aceptada**: solo si fue un error, y solo el administrador.
- **Anular**: solo el administrador, y con motivo.

Mientras el evento está aceptado, editar sus servicios mueve el plan de pagos solo. Una vez realizado, la cotización queda congelada como historia; solo siguen abiertos la cobranza, el seguimiento y los documentos.

## 2. Pantallas y rutas de la app

| Ruta de la app | Componente principal | Archivo | Qué hace el usuario ahí | Rol que la ve |
|---|---|---|---|---|
| `/post-venta` | `PostVentaPage` (vista lista) | `frontend/src/pages/postventa/PostVentaPage.tsx` | Ve **una fila por evento que tenga cuotas**. Arriba, 4 totales: Pendiente, Pagado, Vencido y Total general (sin anulados). Puede buscar por N°, cliente o mandante; filtrar por Evento (vigentes, realizados, anulados) y por Pago (pendiente, vencido, pagado); ordenar por N° o fecha (por defecto, "próximos primero"). También abre la bandeja "💸 Comprobantes" para confirmar o rechazar | `operaciones`, `administrador` (`PermissionGuard` con `SECTION_ROLES.payments` en `App.tsx`) |
| `/post-venta?plata=vencido` | `PostVentaPage` | idem | Llega desde el Dashboard con el filtro de plata puesto; lo que viene en la dirección manda sobre los filtros guardados | idem |
| `/post-venta/:id` | `EventModal` (dentro de `PostVentaPage.tsx`; pese al nombre es página, no modal) | idem | Encabezado con Marcar realizado, píldora ✓ REALIZADO (volver), Anular evento, Enlace de pagos (copia `/portal/<token>`) y PDF (`QuotationViewer`). Debajo, `EventoCajitas` con fecha editable y pestañas pegajosas con chip de saldo | idem; "Anular" y "volver a pendiente" solo `administrador` |
| pestaña Seguimiento | `HiloSeguimiento` + `AdjuntosComerciales` | `frontend/src/pages/quotations/SeguimientoPanel.tsx` | Hilo de notas y respaldos comerciales (ver mapa 02). La pestaña se pinta ámbar (roja si venció) y vibra cuando hay un compromiso para hoy o atrasado | idem |
| pestaña Pagos | `RegistrarPagoPanel`, `EditRegistroModal`, `ReembolsosManager`, `DocViewerPanel` | `PostVentaPage.tsx` | Calendario de cuotas; registrar, rectificar y eliminar abonos; editar fecha y nota de una cuota sin plata; reembolsos (ver mapa 03) | idem |
| pestaña Documentos | `DocumentosTab` + `DocViewerPanel` | `PostVentaPage.tsx` | Sube un documento: categoría, archivo (imagen o PDF, máximo 5 MB) y un comentario de hasta 80 caracteres que sirve de etiqueta. Lo ve embebido, lo descarga o lo elimina | idem |
| pestaña Servicios | `ServiciosTab` | `frontend/src/pages/postventa/ServiciosTab.tsx` | Edita adultos y niños, cajas de servicios por categoría y día, fijos, descuento (% o $), propina y comentarios. Ve el resumen y el margen. Guarda solo o con "Guardar cambios" | idem; margen solo `operaciones` y `administrador`; tope de descuento por rol |
| pestaña Gestión | `GestionTab` → `GrillaPersonal`, `EventResourcesSection` | `GestionTab.tsx`, `GrillaPersonal.tsx`, `EventResourcesSection.tsx` | Rentabilidad (venta sin propina, costo y margen), personal preliminar (sillas), arriendos, insumos (modal y CSV) y mobiliario contra stock (ver mapas 06 y 07) | idem |
| pestaña Cocina | `CocinaTab` → `FichaCocinaSection` | `CocinaTab.tsx`, `FichaCocinaSection.tsx` | Horarios por servicio, notas, platos e impresión (ver mapa 06) | idem |
| `/negocio/:id`, pestaña "cotizacion" | `ServiciosTab` (la misma pieza, con `paidAmount={0}`) | `frontend/src/pages/quotations/NegocioPage.tsx` | Editar la cotización en pre-venta (ver mapa 02) | `SECTION_ROLES.quotations_edit` |

Formas de llegar a Post-Venta:
- el menú lateral "Post‑Venta" (`frontend/src/layout/Sidebar.tsx`, sección `payments`);
- el botón "→ Post-Venta" del tablero, para `aceptada` y `realizada` (`QuotationsPage`, solo si el rol tiene `payments`);
- el Calendario, que abre `/post-venta/:id` en pestaña nueva para `aceptada`, `realizada` y `cancelada` si el rol tiene `quotations_edit` (`Calendar.handleNavigateToQuotation`, `puedeEditar`). La condición no es `payments`, así que un vendedor llega a una ruta que `PermissionGuard` no le deja ver;
- el bloque "Para actuar hoy" del Dashboard (`DashboardPage`).

## 3. Endpoints del motor

**Propios del módulo**

| Método y ruta | Controller y método | Service | Quién lo llama desde la app | Roles o @Public |
|---|---|---|---|---|
| `GET /event-documents?quotationId=` | `EventDocumentsController.findByQuotation` | sin service: `EventDocumentsRepository.findByQuotation` (mismo archivo) | `documents.service.getDocumentsByQuotation` ← `DocumentosTab` (`docsQueryOpts`), aviso de factura de `EventModal`, `AdjuntosComerciales` | `OPERATIONS_AND_UP` (en la clase) |
| `POST /event-documents` | `EventDocumentsController.add` | `EventDocumentsRepository.add` | `addDocument` ← `DocumentosTab.onUpload`, `AdjuntosComerciales.subir` | `OPERATIONS_AND_UP` |
| `DELETE /event-documents/:id` | `EventDocumentsController.delete` | `EventDocumentsRepository.delete` | `deleteDocument` ← `DocumentosTab.onDelete`, `AdjuntosComerciales.borrar` | `OPERATIONS_AND_UP` |
| `POST /storage/upload` (`kind=event-document`) | `StorageController.upload` | `StorageService.upload` | `storage.service.uploadEventDocument` | sin `@Roles` (basta la sesión) |
| `GET /storage/signed-url?src=` | `StorageController.signedUrl` | `StorageService.signedUrl` | `resolveStorageUrl` ← `DocViewerPanel`, `AdjuntosComerciales.abrirVisor` | sin `@Roles` |
| `POST /storage/delete` | `StorageController.remove` | `StorageService.remove` | `deleteStorageFileByUrl` ← `DocumentosTab.onDelete` | sin `@Roles` |
| `POST /quotations/:id/realizado` | `QuotationsController.markEventDone` | `QuotationsService.markEventDone` | `quotations.service.markEventDone` ← `EventModal.doMarkDone` | `OPERATIONS_AND_UP` |
| `POST /quotations/:id/volver-a-pendiente` | `QuotationsController.unmarkEventDone` | `QuotationsService.unmarkEventDone` | `unmarkEventDone` ← `EventModal.doUnmarkDone` | `ADMIN_ONLY` |
| `PATCH /quotations/:id` | `QuotationsController.update` | `QuotationsService.update` | `updateQuotation` ← `ServiciosTab.save`, `EventModal.doCancelEvent`, `EventoCajitas.guardar` | sin `@Roles`; el service frena a `recepcion` si no es requerimiento |
| `GET /quotations/:id` | `QuotationsController.findOne` | `QuotationsService.findOne` | `getQuotationById` ← `EventModal` (clave `["quotation", id]`) | `@Public` |
| `GET /quotations/check-conflicts` | `QuotationsController.checkConflictsWithExistingQuotations` | `QuotationsService.checkConflictsWithExistingQuotations` | `EventoCajitas.revisarChoques` | sin `@Roles` |

**Conexiones** (se documentan a fondo en el mapa indicado)

| Método y ruta | Controller y método | Service | Quién lo llama desde la app | Roles o @Public |
|---|---|---|---|---|
| `GET /payments/transactions` | `PaymentsController.findAllPaymentsWithTransactions` | `PaymentsService.findAllPaymentsWithTransactions` | `getPaymentsWithTransactions` ← `PostVentaPage.fetchEvents` (mapa 03) | sin `@Roles` |
| `GET /payments?quotationId=` | `PaymentsController.findAllPaymensFromQuotation` | `PaymentsService.findAllPaymentsFromQuotation` | `getPaymentsByQuotationId` ← `ServiciosTab` (`planVivo`), `AvisoPlanDePagos` (mapa 03) | sin `@Roles` |
| `PATCH /payments/:id` | `PaymentsController.updatePaymentSchedule` | ver mapa 03 | `updatePaymentSchedule` ← `EventModal.onSaveCuota` | `OPERATIONS_AND_UP` |
| `POST /payments/transactions/overflow`, `PATCH` y `DELETE /payments/transactions/:id` | `createOverflowPaymentTransaction`, `updatePaymentTransaction`, `removePaymentTransaction` | ver mapa 03 | `RegistrarPagoPanel`, `EditRegistroModal`, `EventModal.onDeleteTx` | `OPERATIONS_AND_UP` |
| `GET /refunds/paid-map`, `GET /refunds/by-quotation`, `PATCH /refunds/:id/register` | `RefundsController.paidMap`, `findByQuotation`, `register` | ver mapa 03 | `fetchEvents`, `ReembolsosManager` (`getRefundsByQuotation`), `RefundRow` (`registerRefund`) | `OPERATIONS_AND_UP` (en la clase) |
| `GET /portal-receipts`, `POST /portal-receipts/:id/confirmar` y `/rechazar` | `list`, `confirm`, `reject` en `api-rest/src/quotations/portal-receipts.controller.ts` | ver mapa 03 | `receiptsQuery` y `actuarComprobante` de `PostVentaPage` | GET sin `@Roles`; POST `OPERATIONS_AND_UP` |
| `GET /quotation-followups/map` | `QuotationFollowupsController.map` | ver mapa 02 | `getFollowupsMap` ← lista y `EventModal` | `RECEPTION_AND_UP` |
| `GET /clients` | `ClientsController.findAll` | `ClientsService.findAll` | `getClients` ← `fetchEvents` (mapa 09) | sin `@Roles` |
| `GET /logistics/purchasing/accepted-events`, `GET /logistics/purchasing/provisioning/:quotationId` | `LogisticsController.acceptedEvents`, `quotationProvisioning` | `LogisticsService.findAcceptedEvents` y `quotationProvisioning` (mapa 06) | `gestionQueryOpts`; `ServiciosTab` solo pide el aprovisionamiento (`getQuotationProvisioning`) | `OPERATIONS_AND_UP` (en la clase) |
| `GET`/`POST /logistics/event-resources`, `PATCH`/`DELETE /logistics/event-resources/:id` | `eventResources`, `addEventResources`, `updateEventResource`, `deleteEventResource` | ver mapa 06 | `recursosQueryOpts`, `EventResourcesSection` | `OPERATIONS_AND_UP` |
| `/logistics/kitchen/times`, `/logistics/kitchen/notes`, `/logistics/kitchen/day-prints` | `serviceTimes`, `setServiceTime`, `kitchenNotes`, `addKitchenNote`, `deleteKitchenNote`, `dayPrints`, `markDaysPrinted` | ver mapa 06 | `FichaCocinaSection` | `OPERATIONS_AND_UP` |
| `GET /people/staff?evento=`, `POST /people/staff`, `PATCH`/`DELETE /people/staff/:id`, `GET /people/sheets` | `PeopleController.findStaff`, `addStaff`, `updateStaff`, `removeStaff`, `findSheets` | `PeopleService` (mapa 07) | `GrillaPersonal`, `ServiciosTab` (`sillasEvento`) | sin `@Roles` |
| `GET /services/fixed-sections`, `GET /sections`, `GET /sections/menu-order` y lo que traen `useServices`, `useServiceGroups` y `useBaseLogistica` | ver mapas 05 y 06 | ver mapas 05 y 06 | `ServiciosTab`, `GestionTab`, `CocinaTab`, `FichaCocinaSection` | ver mapas 05 y 06 |

## 4. Tablas de la base de datos

| Tabla | Qué guarda | Lee o escribe | Migración que la crea o modifica |
|---|---|---|---|
| `quotations` | La cotización-evento: `quotation_status`, `items`, montos, propina, `people_count` y `children_count`, `event_date` y `event_end_date`, `observations`, `has_contract`, `contact_name`, `survey_sent_at`, `loss_reason`, `provisioned_at` y `provisioned_cost` | Lee y escribe | `0_initial_models.sql`; `15_provisioning.sql`; `26_event_done_survey.sql`; `27_multi_day_events.sql`; `32_children_and_tip.sql` (`children_count`, `tip_percentage`); `33_quotation_contact_name.sql`; `37_tip_amount.sql`; `61_motivo_perdida.sql` |
| `event_documents` | Documentos por cotización. `category` puede ser `contratos`, `ordenes_compra`, `facturas`, `otros` o `comercial` (lo restringe `AddDocumentDto`; en la base es texto libre); `file_name` guarda el comentario, `file_url` la ruta en el balde, y además `uploaded_at`. **No tiene `company_id`**: la pertenencia se verifica a través de la cotización. Se borra en cascada con `quotations` (`ON DELETE CASCADE`) | Lee y escribe | `8_event_documents.sql`; índice `idx_event_documents_quotation` en `66_indices_de_consultas_calientes.sql`; el acceso directo a todas las tablas se cerró en `40_cerrar_acceso_directo.sql` y `41_barrida_final_anon.sql` |
| Balde de Storage `payment-receipts` (no es tabla) | Archivos en `c<empresa>/event-documents/<cotización>/<categoría>/<fecha>_<nombre>`, más rutas viejas del tipo `event-documents/<cotización>/...` | Solo el motor escribe, firma enlaces y borra | `9_storage_payment_receipts_bucket.sql` (nace público); `42_storage_candado.sql` (pasa a privado) |
| `payments`, `payment_transactions` | Cuotas y abonos; de aquí sale la lista | Lee; escriben la cascada de `update` y la pestaña Pagos | `0_initial_models.sql` (mapa 03) |
| `refunds` | Reembolsos; se crean solos cuando baja el total | Lee; escribe la cascada | `0_initial_models.sql` (mapa 03) |
| `portal_receipts` | Comprobantes del portal por confirmar | Lee y confirma o rechaza | `49_comprobantes_portal.sql` (mapa 03) |
| `quotation_followups` | Hilo de seguimiento y `next_contact_date` | Lee (mapa de compromisos) | `59_bitacora_comercial.sql` (mapa 02) |
| `clients`, `client_contacts` | Nombre y tipo del cliente; mandante con teléfono, correo y `portal_token` | Lee | `0_initial_models.sql`; `34_client_contacts.sql`; `48_portal_del_mandante.sql`, que pone `portal_token` en `client_contacts` (mapa 09). La `47_portal_token.sql` lo había puesto en `quotations`, y la 48 deja esa columna sin uso |
| `event_resources` | Arriendos y servicios externos del evento | Lee y escribe (Gestión) | `17_event_resources_and_provision_snapshot.sql` (mapa 06) |
| `event_staff`, `staff_sheets` | Sillas de personal del evento; fichas de liquidación (`closed_at`) | Escribe sillas; lee fichas | `71_asignacion_de_personas_por_dia.sql`, `84_las_sillas.sql`; `77_ciclo_propinas_nomina.sql` (mapas 07 y 08) |
| `event_service_times`, `event_kitchen_notes`, `event_day_prints` | Ficha de cocina | Lee y escribe (Cocina) | `22_kitchen_sheet.sql`, `28_multi_day_kitchen.sql` (mapa 06) |
| Catálogo de logística y servicios (`supplies`, `service_recipe_items`, `furniture_items`, `management_resources`, `suppliers`, `fixed_services`, `variable_services`…) | Recetas, stock y costos | Solo lee | Ver mapas 05, 06 y 18 |

## 5. Flujos principales

### 5.1 Abrir Post-Venta y la ficha de un evento
1. `PostVentaPage` ejecuta `fetchEvents` (React Query `["postventa","events"]`, `staleTime: 0`), que pide en paralelo:
   - `getPaymentsWithTransactions` → `GET /payments/transactions` → `PaymentsService.findAllPaymentsWithTransactions` → `PaymentsRepository.findAllPaymentsWithTransactions`. Trae `payments` + `quotations!inner` filtrado por `quotations.company_id` + `payment_transactions`; el service suma `paid_amount` por cuota.
   - `getClients` → `GET /clients`.
   - `getPaidRefundsByQuotation` → `GET /refunds/paid-map`.
2. Agrupa las cuotas por `quotation_id`: queda **una fila por evento con cuotas**.
   - Saldo = total − (pagado − reembolsado).
   - Plata `pagado` si el saldo es ≤ 0. `vencido` si alguna cuota ya venció según `cuotaStatus`, que compara con la fecha de hoy sin esperar al cron. Si no, `pendiente`.
3. Contacto que se muestra: el mandante (`contact_name`), buscado por nombre normalizado en `client_contacts`. Si no hay mandante, el contacto de la ficha del cliente, que se busca **por nombre** en `clientByName`.
4. Filtros por usuario en `localStorage`: `eventia_postventa_event_filter_<id>` y `eventia_postventa_money_filter_<id>`. La clave vieja `eventia_postventa_status_filter_` se migra una vez y se borra. La búsqueda queda en `eventia_pv_search`, y `?plata=` pisa lo guardado.
5. Clic en una fila → `openEvent` → pestaña `seguimiento` y `navigate('/post-venta/:id')`. La ficha se arma con la misma fila de la lista (`selected`). Si el id no está en la lista, muestra "No se encontró ese evento en Post-Venta".
6. `EventModal` carga `GET /quotations/:id` y **precalienta** en paralelo `gestionQueryOpts`, `recursosQueryOpts` y `docsQueryOpts`.
7. `PostVentaPage` mantiene además `GET /portal-receipts` (`["postventa","comprobantes"]`, fresco 2 min, sondeo cada 5) y `GET /quotation-followups/map` (`["seguimientos","map"]`). `EventModal` reusa esa misma clave para el aviso ámbar o rojo de la pestaña Seguimiento.

### 5.2 Subir, ver y borrar un documento del evento
1. En `DocumentosTab`, la tarjeta "Subir documento" pide:
   - la categoría (`SelectWithSearch` con `DOCUMENT_CATEGORIES`, que excluye `comercial`);
   - el archivo, arrastrado o elegido (`recibirDocumento` exige imagen o PDF de hasta 5 MB);
   - un comentario opcional.
2. `uploadEventDocument` → `POST /storage/upload` (multipart, `kind=event-document`) → `StorageService.upload`:
   - valida el tipo de archivo y los 5 MB;
   - arma la ruta `c<empresa>/event-documents/<q>/<cat>/<fecha>_<nombre>` y sube al balde privado `payment-receipts`;
   - devuelve **la ruta**, no una URL.
3. `addDocument` → `POST /event-documents` → `EventDocumentsRepository.add`: `assertQuotationOfCompany` comprueba que la cotización sea de la empresa y luego inserta en `event_documents`. `file_name` queda con el comentario o, si no hay, con el nombre del archivo.
4. Se invalida `["postventa","docs",quotationId]`. Esa misma clave la usan `AdjuntosComerciales` y el aviso de factura, así que los tres se refrescan juntos.
5. Ver: el botón "Ver" alimenta `DocViewerPanel` → `resolveStorageUrl` → `GET /storage/signed-url` → `StorageService.signedUrl`.
   - `extraerRuta` y `verificarDueno` revisan que el primer tramo sea `c<empresa>`; en las rutas viejas buscan la empresa de la cotización.
   - Se firma un enlace de 300 s y se muestra en un `iframe` (PDF) o un `img`.
   - "Descargar" agrega `download=` al enlace.
6. Borrar: `ConfirmInline` → `deleteStorageFileByUrl` (`POST /storage/delete` → `StorageService.remove`) → `deleteDocument` (`DELETE /event-documents/:id` → `EventDocumentsRepository.delete`, que verifica la pertenencia con `quotations!inner(company_id)`).

### 5.3 Marcar realizado y volver a aceptada
1. "Marcar realizado" aparece si el evento no está anulado ni realizado, y abre una pregunta en línea. Si `facturasQuery` no trae ningún documento `facturas`, agrega "Ojo: este evento no tiene ninguna factura cargada en Documentos". Avisa, pero no bloquea.
2. `markEventDone` → `POST /quotations/:id/realizado` → `QuotationsService.markEventDone`: lee con `QuotationsRepository.findOne`, verifica `company_id`, exige estado `aceptada` y actualiza a `realizada`.
3. Encuesta:
   - Si `survey_sent_at` está vacío y `resolveRecipient` encuentra destinatario (el contacto vinculado **con correo**; solo si no hay vínculo, el contacto que calce con `contact_name`), llama `EmailService.sendEmail(EmailStructure.CUSTOMER_SATISFACTION_SURVEY)` y estampa `survey_sent_at`.
   - Si el contacto no tiene correo, no se envía.
   - Si el correo falla, el estado igual queda realizado.
4. La respuesta `{ survey_sent, survey_already_sent, client_has_email }` produce:
   - un aviso verde (ámbar si queda saldo por cobrar);
   - la animación `CelebracionRealizada`;
   - `refreshAfterSave`, que invalida `["quotations"]`, `["clientSummary"]`, `["quotation"]` y `["postventa"]`.
5. Efectos del congelamiento:
   - `esEventoCongelado` pasa a verdadero: Servicios, la fecha de `EventoCajitas` y `FichaCocinaSection` quedan de solo lectura. `GrillaPersonal` y `EventResourcesSection` también, pero por otra vía: `GestionTab` les pasa `congelado={quote.quotation_status === "realizada"}` sin usar `esEventoCongelado`.
   - El motor rechaza `update`, `remove` y las escrituras de logística (`LogisticsRepository.assertEventosEditables`).
   - El evento sale de Compras, porque `LogisticsRepository.findAcceptedEvents` solo trae `aceptada`.
6. Volver: la píldora "✓ REALIZADO" solo funciona como botón para `administrador` → `unmarkEventDone` → `POST /quotations/:id/volver-a-pendiente` → `QuotationsService.unmarkEventDone`, que exige `realizada` y deja `aceptada`. No borra `survey_sent_at`, así que si se vuelve a marcar, la encuesta no se reenvía.

### 5.4 Anular un evento
1. "Anular evento" se ve solo si `userRole === "administrador"` (`canCancel`), el evento no está realizado y no se está confirmando el realizado.
2. `MotivoPerdida` con `tipo="anulacion"` (`MOTIVOS_ANULACION`) → `doCancelEvent(motivo)` → `updateQuotation({ quotation_status: 'cancelada', loss_reason })` → `PATCH /quotations/:id` → `QuotationsService.update`, que:
   - pasa el candado (el evento no está realizado) y el filtro de recepción;
   - no rehace la cuenta, porque el cambio no toca plata;
   - no aplica la guardia post-venta → pre-venta;
   - no corre la cascada del plan, porque no viaja `total_amount`;
   - termina en `QuotationsRepository.update`.
3. Cuotas, abonos y comprobantes quedan como historia. `onDataChanged` y `onClose` devuelven a la lista, donde el evento queda oculto por defecto (visible con "Anulados") y fuera de los totales.
4. El comentario que pide `MotivoPerdida` se pierde en esta pantalla (ver sección 10).

### 5.5 Editar servicios: guardado automático y su freno
1. `ServiciosTab` recibe la cotización (`["quotation", id]`) y copia a estado local las cajas (`varGroups`), fijos, adultos, niños, descuento, propina y comentarios. Al cargar descarta las filas fantasma sin `codigo`.
2. La cuenta se hace en vivo con `computeMoney` de `@dinero` (alias a `api-rest/src/quotations/utils/money.ts`) sobre `buildItemsSnapshot()`.
3. Reloj de guardado:
   - cambios de estructura → espera 1,5 s;
   - comentarios → al salir del campo (`onBlur`) o, como respaldo, a los 20 s.
   Ambos caminos llaman a `autoRef.current` (`autoGuardar`).
4. `autoGuardar` **no guarda** si:
   - el evento está `congelado`;
   - hay plan vivo (`planVivo`: la cotización está `aceptada` y `GET /payments?quotationId` trae cuotas);
   - ya hay un guardado en vuelo (queda `pendienteRef` y sale otro al terminar);
   - es la primera huella;
   - la huella (`huellaActual`) no cambió.
5. `save()`:
   - Si el evento está provisionado, bajan las personas y el rol no es administrador, muestra el mensaje y no guarda.
   - Si no, `PATCH /quotations/:id` con personas, descuentos, `value_per_person`, `fixed_value`, `subtotal_amount`, `total_amount`, `tip_percentage`, `tip_amount`, `observations` e `items`.
6. En el motor, `QuotationsService.update` pasa por el candado de realizado, el filtro de recepción y `assertMoneyMatches` (recalcula y exige que cuadre). Si la cotización está `aceptada`, corre la **cascada**:
   - **Si baja el total**: se descuenta de las cuotas `pendiente` o `vencido`, empezando por la última. Lo que no alcanza, o todo si no hay cuotas, se crea como `refunds`.
   - **Si sube el total**: primero se consumen los reembolsos pendientes (tarea #42). El resto agranda la última cuota pendiente o crea una cuota "Pago creado por diferencia de total_amount".
   Al final, `QuotationsRepository.update`.
7. En pantalla: el aviso `notice` (subió, bajó, reembolso) aparece solo fuera de pre-venta. Luego corre `onSaved` (en Post-Venta es `refreshAfterSave`) y se actualiza la huella.
8. "Guardar cambios" (`guardarManual`) guarda siempre, aunque nada haya cambiado y aunque haya plan vivo. Con plan vivo es la única forma de guardar, y `AvisoPlanDePagos` lo anuncia (`conGuardadoManual`).

### 5.6 Gestión al abrir, y cambio de fecha
1. `GestionTab` usa `gestionQueryOpts` (`GET /logistics/purchasing/provisioning/:id` + `GET /logistics/purchasing/accepted-events`) y `useBaseLogistica` (catálogo compartido). `consolidateEvent` suma insumos y calcula el máximo simultáneo de mobiliario. Los eventos aceptados cuyas fechas se topan compiten por el mismo stock.
2. Margen = `saleWithoutTip(quote)` − costo de insumos − costo de recursos. El costo de insumos es `provisioned_cost` si el evento está provisionado; si no, el que sale de las recetas.
3. `EventResourcesSection`: si el evento no tiene recursos y vendió fijos que traen arriendo, **los importa solo al abrir** (`importFromFixed` → `POST /logistics/event-resources`), salvo que esté `congelado`. Es la única escritura del sistema que ocurre por el solo hecho de abrir una pantalla.
4. Fecha: `EventoCajitas.revisarChoques` consulta `GET /quotations/check-conflicts` con `exclude_id` igual al propio evento (avisa, no bloquea). Luego `guardar` → `PATCH /quotations/:id` con `event_date` y `event_end_date`, y el toast avisa que "las cuotas del plan de pagos y los servicios de temporada no se mueven solos".

## 6. Reglas de negocio acordadas

### El evento realizado
- **Un evento realizado queda congelado** (13-08-2026). Felipe: *"El realizado es un estado de que YA SE HIZO. Puede faltar cobrar, facturar, etc., pero ya se hizo."*
  - Se congelan ítems, montos, propina, personas, fecha y el borrado.
  - Siguen abiertos pagos, reembolsos, hilo, documentos, encuesta y cosecha del mes.
  - La única salida es volver a `aceptada`, y existe solo para deshacer un error. Un realizado no se anula.
  - Evidencia: `api-rest/src/quotations/constants/constants.ts` (`EVENTO_REALIZADO_CONGELADO`), `QuotationsService.update` y `remove`, `candado-evento-realizado.spec.ts`.
- **El candado vive en el servidor; la pantalla solo lo refleja**, "para que nadie edite veinte minutos y se entere al guardar" (`frontend/src/utils/eventoCongelado.ts`). En logística se cierran recursos y cocina, pero reimprimir la ficha y provisionar siguen abiertos (`LogisticsRepository.assertEventosEditables`, `candado-logistica.spec.ts`).
- **En el tablero, un realizado no ofrece ninguna salida.** Antes del 13-08, elegir "Aceptada" lo des-realizaba de un clic, sin confirmación y con rol de vendedor bastaba (`QuotationsPage.statusOptionsFor`).
- **Volver a pendiente es solo del administrador** (05-08, pedido de Felipe) y no reenvía la encuesta, porque manda `survey_sent_at` (`QuotationsController.unmarkEventDone` con `ADMIN_ONLY`, `26_event_done_survey.sql`).
- **La encuesta sale solo al marcar realizado, y una sola vez.** Se eliminó el cron que la mandaba "a ciegas 3 días después" (`26_event_done_survey.sql`). Va a la persona: el contacto vinculado con correo (si no hay vínculo, el que calce por nombre); si no tiene correo, no se envía. Son las reglas del 20-07 y del 30-07, "correos a personas y punto" (`QuotationsService.resolveRecipient`).
- **Aviso de factura** (Felipe, 28-08): marcar realizado sin factura en Documentos avisa, pero no bloquea (`EventModal`, `sinFactura`).
- **Marcar realizado no es automático.** Si la fecha ya pasó, la ficha solo sugiere "cuando corresponda, márcalo como realizado" (`EventModal`).

### Anular y volver atrás
- **Anular pide motivo obligatorio** (migración 61, 06-08). Nació de medir que el ticket promedio de ganadas y perdidas es casi igual: el precio no explica las derrotas. Rechazo y anulación tienen listas distintas porque "duelen distinto" (`MotivoPerdida.tsx`, `61_motivo_perdida.sql`).
- **Cancelada y Realizada son destinos exclusivos de lo aceptado** (Felipe, 04-08: "lo que nunca se ganó se rechaza, no se cancela"). Cancelar es solo del administrador (`QuotationsPage.statusOptionsFor`, `EventModal.canCancel`). En pantalla la palabra oficial es "Anulada" (12-08, `utils/estadoCotizacion.test.ts`).
- **Volver de post-venta a pre-venta solo si no hay plata.** Si hay abonos, el motor pide usar "Anular evento" en Post-Venta; si no, borra el plan completo (`QuotationsService.update`, guardia de estados).
- **Una cotización con pagos no se borra**: "Si el evento no se hizo, anúlala desde Post-Venta" (26-07, `QuotationsRepository.assertDeletable`).

### Servicios y plata
- **Con plan de pagos vivo, Servicios no guarda sola** (caso 501, 06-09). Felipe: *"guarda automática cambia las cuotas mientras estoy en proceso de aplicar el descuento"* (`ServiciosTab.autoGuardar`, `AvisoPlanDePagos.tsx`, commit `77e13a6`).
- **Ritmo del guardado automático** (`ServiciosTab`):
  - 1,5 s después de un cambio de estructura (05-08);
  - el texto, al salir del campo, con respaldo de 20 s (07-08);
  - solo si hubo un cambio real (07-08: *"guardar cada 1,5 s es una tontera, solo cuando hay modificación"*);
  - el botón manual guarda siempre (13-08).
- **Cascada del plan cuando cambia el total de una aceptada** (`QuotationsService.update`):
  - si baja, se descuenta desde la última cuota pendiente y el sobrante se vuelve reembolso;
  - si sube, primero se consumen los reembolsos pendientes (tarea #42: nunca conviven "te debo" y "me debes") y después se agranda la última cuota o se crea una.
- **Evento provisionado: solo el administrador baja personas** (`ServiciosTab.save`).
- **El margen se mide sin propina** (24-07). Doc 10: *"es plata que entra y sale, somos intermediarios"* (`GestionTab` con `saleWithoutTip` y `tipAmountOf`; texto del margen en `ServiciosTab`).
- **Solo operaciones y administrador ven el costo** en Servicios; el vendedor puede descontar sin ver el margen. Topes de descuento: administrador 40 %, vendedor y operaciones 15 %, recepción 0 (`ServiciosTab.puedeVerMargen`, `getMaxDiscountForRole`).
- **Una sola cuenta de dinero** para cotizador, Post-Venta y motor (27-07, alias `@dinero` en `frontend/vite.config.ts`). El motor la vuelve a verificar (`assertMoneyMatches`).
- **Un fijo de sección se puede quitar solo en esta cotización**, con confirmación (Felipe, 09-09, caso CCU #408). La pieza `FijoDeCategoria` es la misma en el cotizador y en Servicios (CLAUDE.md, commit `5bb21d7`).

### Documentos y archivos
- **Documentos es el archivador contractual.** Los respaldos `comercial` viven pegados al hilo de Seguimiento (07-08). El 30-08 Felipe pilló que el selector aún ofrecía "comercial" y lo subido desaparecía de la vista (`documents.service.ts`, `DOCUMENT_CATEGORIES`).
- **Los archivos pasan por una sola puerta.** El navegador no toca el balde y el comprobante bancario dejó de ser público (28-07, `StorageService`, `42_storage_candado.sql`).
- **El visor no carga solo** (regla de Felipe: mirar es opcional, "no un peaje de navegación", `DocumentosTab`).

### La lista y la ficha
- **Dos filtros que se cruzan** (Felipe, 29-07): estado del evento y estado de la plata. Antes, un realizado con deuda desaparecía al filtrar "Vencido". Lo que viene en la dirección manda (07-08), y el orden por defecto es "próximos primero" (28-07) (`PostVentaPage`).
- **Fechas de evento y de cuota en UTC** (12-08: la #423 decía 13-17 en la lista y 14-18 en la ficha) (`PostVentaPage.fmtDate`).
- **La ficha es página propia, no modal** (03-08): volver conserva los filtros, el botón atrás funciona y el enlace se puede compartir.
- **Seguimiento va primero** (07-08: *"si algo se olvida uno va a seguimiento y está todo"*). Solo alarma un compromiso de hoy o atrasado; uno futuro no.
- **Cambiar la fecha avisa choques pero no bloquea** ("los dobles eventos deliberados existen en el rubro"), no choca consigo misma (21-08) y no mueve cuotas ni servicios de temporada (`EventoCajitas`).

### Gestión
- **Gestión → Personal tiene dos candados**: evento realizado o ficha liquidada. Felipe, 18-08: *"se debería bloquear solo cuando se marca como realizado o bien se liquidan los pagos"* (`GrillaPersonal`, doc 10).
- **El modal de insumos es solo informativo**: cantidades y precios se trabajan en Compras (15-08, `GestionTab`, doc 10).

## 7. Conexiones con otros módulos

### Quién lleva a Post-Venta
- **01 Cotizador y 02 Negocio, envío y seguimiento**: el tablero (`QuotationsPage`) muestra "→ Post-Venta" para aceptada y realizada. `NegocioPage` monta las mismas piezas: `ServiciosTab`, `EventoCajitas` y `AdjuntosComerciales`.
- **03 Pagos, reembolsos y portal**: el plan de pagos es la puerta de entrada. `createPaymentPlan` (`POST /payments/plan` → `PaymentsService.createPaymentPlan`) deja la cotización en `aceptada`, y desde el 13-08 no des-realiza un evento realizado. El editor del plan es `PaymentPlanEditor`, que vive en el tablero y en la ficha del negocio. Sin cuotas, el evento no aparece en Post-Venta.
- **13 Dashboard**: "Para actuar hoy" lleva a `/post-venta` (comprobantes) o a `/post-venta?plata=vencido`, y comparte la clave `["postventa","comprobantes"]`.
- **16 Calendario**: abre la ficha en pestaña nueva para aceptada, realizada y cancelada si el rol tiene `quotations_edit`, e importa `recursosQueryOpts` de `EventResourcesSection`.

### A quién usa Post-Venta
- **03**: la lista (`/payments/transactions`, `/refunds/paid-map`), toda la pestaña Pagos, la bandeja de comprobantes y el enlace del portal (`mandante.portal_token`).
- **02**: `HiloSeguimiento`, `AdjuntosComerciales` (sube a `event_documents` con categoría fija `comercial`) y el mapa de compromisos.
- **01**: `QuotationViewer` (PDF), `@dinero`, `FijoDeCategoria` y el mismo `PATCH /quotations/:id`. `QuotationForm` también usa `esEventoCongelado`.
- **05 Catálogo**: `useServices`, `useServiceGroups` (menús guardados), `getFixedSections`, `getCategorySections` y `getMenuOrder`.
- **06 Logística**: `useBaseLogistica`, aprovisionamiento, eventos aceptados, recursos del evento, ficha de cocina y `utils/eventConsolidation`. `InsumosTab` y `RecipeTab` invalidan `["postventa"]`.
- **07 Personas**: `GrillaPersonal` escribe sillas en `event_staff`, y `ServiciosTab` suma esas sillas al costo. `ResumenDelDia` invalida `["postventa","cocina"]`.
- **08 Liquidación**: una ficha cerrada (`staff_sheets.closed_at`) bloquea la grilla de Personal. `HistoricoTab` importa `clp` desde `PostVentaPage.tsx`.
- **09 Clientes**: `GET /clients`; `refreshAfterSave` invalida `["clientSummary"]`, que es el saldo de la ficha 360°.
- **14 Encuestas**: `markEventDone` dispara el correo `CUSTOMER_SATISFACTION_SURVEY`, y la encuesta pública lee `GET /quotations/:id` (`@Public`).
- **15 Acceso**: `SECTION_ROLES.payments`, los decoradores `@Roles` y `RolesGuard` (en rutas sin `@Roles` basta la sesión).
- **17 Kit de la casa**: `MultiSelect`, `SelectWithSearch`, `AgregadorDeItems`, `ConfirmInline`, `Toast`, `NumberInput`, `QuantitySelector`, `EventoCajitas`, `MotivoPerdida`, `AvisoPlanDePagos`, `FileViewLink`, `HoraInput` y `GrillaDeDias`.

### Efectos automáticos
- **Marcar realizado**: correo de encuesta (una vez) y congelamiento en el motor y en las pantallas.
- **Guardar Servicios con el evento aceptado**: la cascada mueve cuotas y crea o consume reembolsos. Se nota en el portal, el Dashboard y la ficha del cliente.
- **Abrir Gestión en un evento sin recursos**: importa solos los arriendos de sus fijos.
- **Crons que tocan eventos de Post-Venta** (ver mapas 03 y 12). Según CLAUDE.md, solo corren con `NODE_ENV === 'production'`.
  - `PaymentsService.updateOverduePayments` (1 AM) marca cuotas vencidas. La lista no lo espera: usa `cuotaStatus`.
  - `PaymentsCronService.checkUpcomingOverduePayments` y `checkOverduePayments` (11 AM) mandan recordatorios.
  - `QuotationsCronService.sendWeeklyDigest` (los lunes) lista los eventos aceptados de la semana.
- **Borrar una cotización**: la base borra en cascada sus filas de `event_documents`, pero no los archivos del balde (ver sección 10).
- **Otros módulos que leen estos estados**: `analytics/hoy.controller.ts` excluye canceladas del por cobrar (mapa 13); `marketing/segmento.ts` usa realizada y cancelada (mapa 10); `movil/movil.service.ts` arma avisos con aceptadas y realizadas (mapa 16).

## 8. Zonas de riesgo: si tocas esto, cuidado con aquello

1. **Si tocas** el orden del inicio de `QuotationsService.update`, **se afecta** el congelamiento de Servicios, del cotizador, de la fecha de la cabecera y del desplegable del tablero, **porque** el candado de realizado es "LA puerta ancha": va antes que todo y rige incluso para el administrador. Evidencia: `api-rest/src/quotations/quotations.service.ts` `update`; `candado-evento-realizado.spec.ts` ("si alguien reordena update() o remove(), acá se entera").
2. **Si tocas** `planVivo`, `autoGuardar` o la forma en que `getPaymentsByQuotationId` entrega la lista, **se afecta** el plan de pagos, **porque** cada guardado automático dispara la cascada a medio editar. Ya pasó en el caso 501 (06-09): el guardado automático movía las cuotas mientras Felipe aplicaba un descuento (commit `77e13a6`), y la "doble envoltura" de la respuesta dejaba el freno sin activarse. `ServiciosTab` y `AvisoPlanDePagos` leen `data.data`, así que la forma `{ data: lista }` que hoy devuelve el servicio es parte del freno. Evidencia: `ServiciosTab.autoGuardar` y `planVivo`, comentario de `getPaymentsByQuotationId` en `frontend/src/services/payments.service.ts`, commit `77e13a6`. La cuota "doblada" de la 501 es otra falla del mismo caso: según el comentario de `PaymentsService.createPaymentPlan`, nació de un plan cuadrado contra un total viejo.
3. **Si tocas** la cascada de `update` (cuando baja o sube el total), **se afecta** cuotas, reembolsos, portal y por cobrar del Dashboard, además de los textos de `AvisoPlanDePagos` y del `notice` de `ServiciosTab`, **porque** esos textos describen la cascada al pie de la letra. Evidencia: `QuotationsService.update`, `AvisoPlanDePagos.tsx`, `ServiciosTab.save`.
4. **Si tocas** el payload de `ServiciosTab.save` o `buildItemsSnapshot` sin tocar `money.ts`, **se afecta** todo guardado de Servicios y del cotizador, **porque** `assertMoneyMatches` recalcula y rechaza lo que no cuadra; el guardado automático solo mostrará "No se pudo guardar". Evidencia: `frontend/vite.config.ts` (`@dinero`), `QuotationsService.update`.
5. **Si mueves** a `update()` una escritura legítima sobre un realizado (`unmarkEventDone`, `setHarvestStatus`, pagos), **se afecta** esa operación, **porque** el candado la bloquea. Evidencia: el bloque "lo posterior al evento sigue vivo" de `candado-evento-realizado.spec.ts`; la "PUERTA DE ATRÁS TAPADA" (13-08) de `PaymentsService.createPaymentPlan`.
6. **Si agregas** un efecto que escriba al abrir una pestaña, **se afecta** la vista de los eventos realizados, **porque** el motor lo rechaza y queda un error permanente. `EventResourcesSection` ya tuvo que frenarse con `congelado` el 13-08. Evidencia: efecto de importación automática en `EventResourcesSection`.
7. **Si cambias** cómo `fetchEvents` arma la lista, **se afecta** también la ficha `/post-venta/:id`, **porque** la ficha sale de las filas. Un evento sin cuotas, como una cancelada sin plan abierta desde el Calendario, cae en "No se encontró ese evento". Evidencia: `PostVentaPage` (`selected`), `Calendar.handleNavigateToQuotation`.
8. **Si cambias** la clave `["postventa","docs",id]` o el filtro de `comercial`, **se afecta** Documentos, los respaldos de Seguimiento (en Post-Venta y en `NegocioPage`) y el aviso de factura, **porque** comparten la misma consulta. Ya pasó el 30-08: lo subido desaparecía. Evidencia: `docsQueryOpts`, `AdjuntosComerciales`, `documents.service.ts`.
9. **Si tocas** las rutas de `StorageService.upload` para `event-document`, o `verificarDueno` o `esArchivoPrivado`, **se afecta** la vista de documentos nuevos y viejos, **porque** conviven rutas `c<empresa>/...` con prefijos antiguos `event-documents/...` que se verifican buscando la cotización. Evidencia: `api-rest/src/storage/storage.service.ts`, `frontend/src/services/storage.service.ts`.
10. **Si confías** en que la pantalla restringe la anulación, **se afecta** la integridad del ciclo de vida del evento, **porque** `PATCH /quotations/:id` no tiene `@Roles` y `update` no revisa el estado de destino. El motor aceptaría `cancelada` desde cualquier rol que no sea recepción, o `realizada` directo sin pasar por `markEventDone` ni la encuesta; solo el tablero y la ficha lo impiden. Evidencia: `QuotationsController.update`, `QuotationsService.update`, `EventModal.canCancel`. Verificado leyendo el código, no probado en vivo.
11. **Si tocas** `AdjuntosComerciales` o el `@Roles` de `EventDocumentsController`, **se afecta** el vendedor en la ficha del negocio, **porque** `NegocioPage` le muestra los respaldos (`quotations_edit`) pero `/event-documents` exige `OPERATIONS_AND_UP`, y `getDocumentsByQuotation` se traga el error y devuelve la lista vacía. Evidencia: `NegocioPage` (`puedeEditar && <AdjuntosComerciales/>`), `event-documents.controller.ts`, `documents.service.ts`.
12. **Si tocas** el candado de `GrillaPersonal`, **se afecta** la protección del personal de un evento realizado, **porque** es solo de pantalla: en `api-rest/src/people` no hay chequeo de evento realizado (la búsqueda no encontró nada). Evidencia: `GrillaPersonal` (`soloLectura`), `PeopleController` sin `@Roles`.
13. **Si tocas** `esEventoCongelado`, **se afectan** a la vez `ServiciosTab`, `FichaCocinaSection`, `EventoCajitas` (a través de `PostVentaPage` y `NegocioPage`) y `QuotationForm`, **pero no** `GrillaPersonal` ni `EventResourcesSection`: `GestionTab` les pasa una comparación directa con `"realizada"`, así que un cambio en la regla quedaría a medias. Evidencia: búsqueda de `eventoCongelado` en `frontend/src`; `GestionTab` (`congelado={quote.quotation_status === "realizada"}`).
14. **Si editas** `PostVentaPage.tsx` o `ServiciosTab.tsx`, **se afecta** el commit, **porque** el portero los congela por nombre en 3180 y 2285 líneas (hoy tienen 3168 y 2265). Lo nuevo va en archivo propio. Evidencia: `frontend/scripts/portero-kit-de-la-casa.sh` (`congelar`).
15. **Si tocas** `GET /quotations/:id`, **se afectan** todos los que llaman a `getQuotationById`: `EventModal` de Post-Venta (que le pasa la cotización a `ServiciosTab`), `NegocioPage`, `QuotationForm`, `QuotationsPage`, `Calendar`, `ClientDetailPage`, `ResumenDelDia`, `PaymentPlanEditor` y la encuesta pública (`PublicSurvey`). Además es `@Public` y `QuotationsRepository.findOne` no filtra por empresa; el propio controller lo marca con un TODO. Evidencia: `QuotationsController.findOne`, `QuotationsRepository.findOne`, búsqueda de `getQuotationById` en `frontend/src`.

## 9. Pruebas que lo protegen

| Archivo | Qué cubre |
|---|---|
| `api-rest/src/quotations/tests/unit/candado-evento-realizado.spec.ts` | `update` rechaza cambiar propina, montos, fecha y personas de un realizado, también al administrador; una aceptada se edita normal. Un realizado no pasa a aceptada, cancelada, en_negociacion ni rechazada, y no se borra su plan. `remove` no borra realizados, tolera `PGRST116` y no borra si falla la lectura. Ante un realizado de otra empresa, el candado no actúa y deja que conteste el repositorio. `unmarkEventDone` y `setHarvestStatus` siguen funcionando |
| `api-rest/src/logistics/tests/candado-logistica.spec.ts` | Candado de realizado en recursos del evento y ficha de cocina |
| `api-rest/src/quotations/tests/unit/quotations.service.spec.ts` | En `update`: candado de recepción y cascada de una aceptada cuando el total queda igual, cuando baja sin cuotas (reembolso), cuando sube sin cuotas (cuota nueva) y cuando sube con cuotas (agranda la última). Además `checkConflictsWithExistingQuotations` con `exclude_id` |
| `api-rest/src/quotations/tests/unit/money.spec.ts` | La fórmula de `money.ts` que `ServiciosTab` usa a través de `@dinero` |
| `api-rest/src/payments/tests/payments.service.spec.ts` | El control del plan del caso 501: rechaza cuotas que no calzan con el total actual |
| `frontend/src/utils/quotationMoney.test.ts`, `costoDeRecursos.test.ts`, `dates.test.ts`, `estadoCotizacion.test.ts` | Venta sin propina, costo de recursos (Gestión y Servicios), fechas UTC y "Anulada" como palabra oficial |

**Lo importante que NO está cubierto** (la búsqueda en las pruebas no encontró nada):
- `QuotationsService.markEventDone`: el estado previo, la encuesta una sola vez y el contacto sin correo.
- `EventDocumentsRepository` y su controller (pertenencia a través de la cotización, borrado), y el `kind=event-document` de `StorageService`.
- La cascada cuando el total baja habiendo cuotas (descuento desde la última y sobrante a reembolso), y el consumo de reembolsos pendientes de la tarea #42.
- Que `createPaymentPlan` no des-realice un evento realizado.
- La anulación (`cancelada` con `loss_reason`) y la falta de filtro por rol.
- Toda la pantalla: no hay pruebas de componentes para el guardado automático, el freno `planVivo`, los filtros, el aviso de factura ni el precalentado.

## 10. Deuda y rarezas conocidas

### Archivos gigantes y estructura
- `PostVentaPage.tsx` tiene 3168 líneas (techo 3180) y reúne 8 componentes: `PostVentaPage`, `EventModal`, `RegistrarPagoPanel`, `EditRegistroModal`, `ReembolsosManager`, `RefundRow`, `DocumentosTab` y `DocViewerPanel`.
- `ServiciosTab.tsx` tiene 2265 líneas (techo 2285), con 31 `any` (en 29 líneas) y 3 `eslint-disable`.
- Sobre 800 líneas pero sin congelar por nombre: `FichaCocinaSection.tsx` (1213), `GestionTab.tsx` (865) y `EventResourcesSection.tsx` (835). Cuentan para el techo global de 27 archivos.
- `EventModal` se llama modal, pero es página desde el 03-08.
- `event-documents.controller.ts` rompe las cuatro capas: DTO, repository y controller en un solo archivo y sin service ("Mudanza #7, 28-07"). Como la tabla no tiene `company_id`, cada operación hace una lectura extra: listar y agregar consultan `quotations` (`assertQuotationOfCompany`), y borrar lee antes la fila de `event_documents` con `quotations!inner(company_id)`.

### Piezas hechas a mano
- Modales a mano: la bandeja de comprobantes de `PostVentaPage`, `EditRegistroModal`, el modal de insumos de `GestionTab`, `CelebracionRealizada`, `PhotoPopup` y `FileViewLink`. Todos figuran como deuda en CLAUDE.md, salvo la bandeja.
- `ServiciosTab` conserva mecánica heredada del cotizador: un listener global de clic afuera con `.dropdown-container` y un contenedor flotante a mano (`absolute left-0 z-20`) para "+ Desde un menú guardado".

### Borrados que dejan basura
- `DocumentosTab.onDelete` borra el archivo y después la fila, sin revisar si alguno de los dos falló.
- `AdjuntosComerciales.borrar` borra solo la fila; el archivo queda en el balde.
- Borrar la cotización borra las filas en cascada, pero no los archivos.

### Duplicaciones
- `clp` se exporta desde `PostVentaPage` (y lo usan `ServiciosTab` y `personas/HistoricoTab`), pero hay copias locales que redondean distinto en `GrillaPersonal` y `EventResourcesSection`, más `fmtMoney` en `GestionTab`.
- El cálculo de "compromiso pendiente" está dos veces: `pendienteDe` y `pendienteAqui`.

### Datos que se cruzan mal
- **El cliente se cruza por nombre**, no por id (`clientByName` en `fetchEvents`): dos clientes con el mismo nombre se confunden en tipo y contacto.
- **`paidAmount` llega bruto** (`event.paid`, sin restar reembolsos) al cálculo del aviso de reembolso de `ServiciosTab`.

### Textos y comentarios que no calzan
- El aviso de reembolso manda a "la pestaña Comprobantes", pero la pestaña se llama Pagos.
- El toast de `doUnmarkDone` dice "volvió a pendiente", pero el estado real es `aceptada`.
- Un comentario habla de `/postventa/:id`; la ruta es `/post-venta/:id`.
- `constants.ts` dice que la cancelada "sale de Post-Venta", pero sigue en la lista con el filtro "Anulados".

### Errores del motor
- `markEventDone` y `unmarkEventDone` lanzan un `Error` genérico (no `BadRequestException`) cuando el estado no corresponde, así que llegan como error interno.
- `client_has_email` se devuelve, pero la pantalla no lo usa.

### Pendientes del plan de homologación que siguen en el código
- `ordered` usa el "hoy" en UTC (`new Date().toISOString()`): entre las 21:00 y medianoche, un evento de hoy cae en "pasados". `hoyEnChile` ya existe en `utils/dates` (Tanda A1).
- `MotivoPerdida` en Post-Venta descarta el comentario (Tanda A4); en el tablero sí se usa.

### TODO relevante
- `QuotationsController.findOne`: "maybe create public endpoint for this".

## 11. Contradicciones entre documento y código

1. **`EventoCajitas` y los choques de fecha.** `docs/arquitectura/09_PLAN_DE_HOMOLOGACION.md` (13-08), Tanda A4, dice que `EventoCajitas` "avisa 'ese día ya tiene eventos' contra sí misma". En el código, `EventoCajitas.revisarChoques` pasa el propio id ("EXCEPTO YO (Felipe, 21-08)") y `QuotationsService.checkConflictsWithExistingQuotations` descarta `params.exclude_id` (18-08), con prueba en `quotations.service.spec.ts`. El documento lo sigue dando como pendiente.
2. **El botón "Agregar servicio".** El mismo documento, Tanda B1, dice que el botón "Agregar servicio" de Post-Venta "no podría abrirla" porque la pieza no se abre desde afuera. En el código, `ServiciosTab` usa `AgregadorDeItems` con `abierto` y `onAbiertoChange` controlados (`openItemPicker`, `openFixedPicker`).
3. **El campo de hora.** `docs/arquitectura/10_MODULO_DE_PERSONAS.md`, en la tabla de piezas, dice "Campo de hora: hay uno hecho a mano en la ficha de cocina de Post-Venta" y pone el techo de `type="time"` en 1. En el código, `FichaCocinaSection` importa `HoraInput` de `components/inputs`, no hay ningún `type="time"` en `pages/postventa` y el portero tiene ese techo en 0.
4. **El resumen de insumos.** Doc 10, sección "El modal de insumos", describe un resumen de Gestión de dos líneas ("34 insumos · 3 con cantidad por confirmar [revisar]") y dice más abajo que el precio "actualiza el catálogo a propósito". En el código, `GestionTab` muestra "N insumos · ⚠ N servicios sin receta" y "Ver detalle"; el modal es de solo lectura y no cambia cantidades ni precios. Esto coincide con la decisión final del 15-08 que cita el mismo documento, que mezcla la versión del 14-08 con la del 15-08.
5. **Listas plegables hechas a mano.** `CLAUDE.md`, en la deuda medida el 13-08, dice "6 hand-rolled dropdowns with search — QuotationForm ×3, ServiciosTab ×3". En el código, el portero tiene techo 0 para "lista plegable con buscador a mano", y `ServiciosTab` usa `SelectWithSearch` y `AgregadorDeItems`. Además, `CLAUDE.md` pone el techo del panel flotante en 15 y el script lo tiene en 13 (ver mapa 17).

## 12. Preguntas abiertas

1. ¿Puede quedar una cotización en `aceptada` sin plan de pagos, por ejemplo cambiando el estado desde el tablero? Si pasa, no aparece en Post-Venta y su ficha dice "No se encontró". No verifiqué qué hace el tablero al elegir "aceptada".
2. ¿Es intencional que el motor no restrinja por rol el paso a `cancelada`, ni impida pasar a `realizada` por `PATCH`, sin encuesta?
3. ¿Debería existir en el motor el candado de Personal? La liquidación escribe `event_staff` después del evento, así que un candado general podría romperla. No lo confirmé.
4. En un evento `cancelada`, `ServiciosTab` sigue editable y con guardado automático, y la cascada del plan no corre (solo corre en `aceptada`): el total cambia sin tocar las cuotas. ¿Es lo que se quiere?
5. ¿Los crons de cuotas vencidas y de recordatorios excluyen los eventos anulados? No lo revisé (ver mapa 03).
6. ¿Existe alguna limpieza de archivos huérfanos del balde (respaldos comerciales borrados, cotizaciones borradas)? No la encontré.
7. ¿Un vendedor recibe 403 al ver o subir respaldos en la ficha del negocio? El código lo sugiere (riesgo 11), pero no lo probé en vivo.
8. `AVISO_EVENTO_CONGELADO` dice que no se editan "personas": ¿se refiere solo al número de personas o también al personal asignado? Hoy el motor solo congela `people_count` a través de `update`.
9. ¿Se planea un endpoint público restringido para la encuesta, en vez de dejar abierto `GET /quotations/:id`?

## 13. Archivos clave

**Motor**
- `api-rest/src/quotations/quotations.controller.ts`: `markEventDone`, `unmarkEventDone`, `update`, `findOne`, `checkConflictsWithExistingQuotations`
- `api-rest/src/quotations/quotations.service.ts`: `markEventDone`, `unmarkEventDone`, `resolveRecipient`, `update` (candado, guardia de estados, cascada), `remove`
- `api-rest/src/quotations/quotations.repository.ts`: `findOne`, `update`, `remove`, `assertDeletable`
- `api-rest/src/quotations/constants/constants.ts`: `QuotationStatus`, `EVENTO_REALIZADO_CONGELADO`
- `api-rest/src/quotations/event-documents.controller.ts`: `AddDocumentDto`, `EventDocumentsRepository`, `EventDocumentsController`
- `api-rest/src/quotations/quotations.module.ts`: registra el controller de documentos
- `api-rest/src/storage/storage.controller.ts`, `api-rest/src/storage/storage.service.ts`
- `api-rest/src/quotations/utils/money.ts`: la cuenta compartida (`@dinero`)
- `api-rest/src/payments/payments.service.ts`: `createPaymentPlan`, `findAllPaymentsWithTransactions`, `updateOverduePayments` (conexión)
- `api-rest/src/logistics/logistics.repository.ts`: `assertEventosEditables`, `findAcceptedEvents` (conexión)
- `api-rest/src/auth/roles.decorator.ts`, `api-rest/src/auth/roles.guard.ts`
- Pruebas: `api-rest/src/quotations/tests/unit/candado-evento-realizado.spec.ts`, `api-rest/src/quotations/tests/unit/quotations.service.spec.ts`, `api-rest/src/quotations/tests/unit/money.spec.ts`, `api-rest/src/logistics/tests/candado-logistica.spec.ts`
- Migraciones: `docs/migrations/8_event_documents.sql`, `9_storage_payment_receipts_bucket.sql`, `26_event_done_survey.sql`, `42_storage_candado.sql`, `61_motivo_perdida.sql`, `66_indices_de_consultas_calientes.sql`

**App**
- `frontend/src/App.tsx`: rutas `post-venta` y `post-venta/:id`
- `frontend/src/pages/postventa/PostVentaPage.tsx`: lista, `EventModal`, Pagos, `DocumentosTab`, `DocViewerPanel`
- `frontend/src/pages/postventa/ServiciosTab.tsx`
- `frontend/src/pages/postventa/GestionTab.tsx`, `GrillaPersonal.tsx`, `EventResourcesSection.tsx`
- `frontend/src/pages/postventa/CocinaTab.tsx`, `FichaCocinaSection.tsx`
- `frontend/src/utils/eventoCongelado.ts`
- `frontend/src/services/documents.service.ts`, `storage.service.ts`, `quotations.service.ts`, `payments.service.ts`
- `frontend/src/components/AvisoPlanDePagos.tsx`, `EventoCajitas.tsx`, `MotivoPerdida.tsx`, `CelebracionRealizada.tsx`
- `frontend/src/pages/quotations/SeguimientoPanel.tsx`: `HiloSeguimiento`, `AdjuntosComerciales`
- `frontend/src/constants/permissions.ts`, `frontend/src/constants/api.routes.ts`
- `frontend/scripts/portero-kit-de-la-casa.sh`: techos de los gigantes
