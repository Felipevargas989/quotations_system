# Mapa: Pagos, reembolsos y portal del cliente

> **Estado: verificado una vez contra el código** (commit 0de0ddb, 11-09-2026). Falta la etapa de completar lo que no quedó escrito. Parte del atlas de docs/arquitectura/mapa; el índice es 00_MAPA_DEL_SISTEMA.md.

## 1. Qué hace

Es la caja de cada evento, desde que la cotización se acepta hasta que queda saldada. Al aceptar, el equipo arma el **plan de pagos**: cuotas con comentario, fecha y monto que deben sumar al peso el total de la cotización. Desde ahí el evento vive en **Post-Venta**. Operaciones y administración registran ahí los abonos con su comprobante (un pago grande se "derrama" solo a las cuotas siguientes), corrigen registros mal ingresados, mueven la fecha de una cuota sin plata y registran los **reembolsos**, que nacen solos cuando el total baja de lo ya pagado.

Cada persona que encarga un evento (el **mandante**) tiene un **portal** propio sin clave (`/portal/:token`). Ahí ve todas sus cotizaciones, su saldo, sus cuotas y los datos para transferir, abre la hoja de la cotización y avisa "Ya transferí" subiendo su comprobante, que el equipo confirma o rechaza. Dos relojes diarios marcan las cuotas vencidas y mandan los recordatorios. La cobranza no se congela: sigue abierta aunque el evento ya esté realizado.

## 2. Pantallas y rutas de la app

| Ruta de la app | Componente principal | Archivo | Qué hace el usuario ahí | Rol que la ve |
|---|---|---|---|---|
| `/post-venta` | `PostVentaPage` | `frontend/src/pages/postventa/PostVentaPage.tsx` | Tablero de eventos con plan: totales pendiente / vencido / pagado (neto de reembolsos) y la bandeja **Comprobantes por confirmar** del portal ("Confirmar y registrar pago" o "Rechazar" con motivo) | operaciones, administrador (`SECTION_ROLES.payments`) |
| `/post-venta/:id` | `PostVentaPage` → `EventModal` | mismo archivo | Ficha del evento: `RegistrarPagoPanel` (pago con derrame y comprobante), lápiz de la cuota (fecha y nota, solo sin plata), `EditRegistroModal` (rectificar abono), basurero del abono, `ReembolsosManager` / `RefundRow`, botón **Enlace de pagos** (copia `/portal/<token>`), **Anular evento** | operaciones, administrador; anular solo administrador (`canCancel`) |
| `/post-venta/:id`, pestaña Servicios | `ServiciosTab` + `AvisoPlanDePagos` | `frontend/src/pages/postventa/ServiciosTab.tsx` | Con plan vivo el guardado automático se apaga y el aviso ámbar lo dice | operaciones, administrador |
| `/quotations` | `QuotationsPage` + `PaymentPlanEditor` | `frontend/src/pages/quotations/QuotationsPage.tsx`, `frontend/src/components/PaymentPlanEditor.tsx` | Al pasar una cotización a "aceptada" sin cuotas previas se abre el editor del plan; guardar crea el plan y acepta | ver: recepción+; cambiar estado: vendedor+ (`quotations_edit`). Ojo con la zona de riesgo del cargo, en la sección 8 |
| `/negocio/:id` | `NegocioPage` + `PaymentPlanEditor` | `frontend/src/pages/quotations/NegocioPage.tsx` | El mismo flujo de aceptar, desde el menú de estado de la ficha del negocio (`cambiarEstado`, `guardarPlan`) | ver: recepción+; menú de estado: vendedor+ |
| `/quotation-form/:id` | `QuotationForm` + `AvisoPlanDePagos` | `frontend/src/pages/quotations/QuotationForm.tsx`, `frontend/src/components/AvisoPlanDePagos.tsx` | Editar una cotización aceptada con cuotas: el aviso ámbar anuncia qué hará la cascada si cambia el total | vendedor, operaciones, administrador |
| `/dashboard` (fila HOY) | `DashboardPage` | `frontend/src/pages/dashboard/DashboardPage.tsx` | Contador de comprobantes del portal por confirmar (misma queryKey `["postventa","comprobantes"]`) | administrador |
| `/portal/:token` | `PortalPage` | `frontend/src/pages/portal/PortalPage.tsx` | Página PÚBLICA del mandante: saldo total, eventos confirmados con sus cuotas y datos de transferencia, cotizaciones en conversación, historial, "Ver cotización", "Ya transferí — enviar mi comprobante", chip de encuesta | cliente sin sesión, con el enlace secreto |

## 3. Endpoints del motor

| Método y ruta | Controller y método | Service | Quién lo llama desde la app | Roles o @Public |
|---|---|---|---|---|
| `POST /payments/plan` | `PaymentsController.createPaymentPlan` | `PaymentsService.createPaymentPlan` | `createPaymentPlan` (`services/payments.service.ts`) ← `QuotationsPage.handlePaymentPlanSave`, `NegocioPage.guardarPlan` | `OPERATIONS_AND_UP` |
| `GET /payments?quotationId=` | `PaymentsController.findAllPaymensFromQuotation` | `PaymentsService.findAllPaymentsFromQuotation` | `getPaymentsByQuotationId` ← `QuotationsPage.applyStatusChange`, `NegocioPage.cambiarEstado`, `AvisoPlanDePagos`, `ServiciosTab` | solo sesión (sin `@Roles`) |
| `GET /payments/transactions` | `PaymentsController.findAllPaymentsWithTransactions` | `PaymentsService.findAllPaymentsWithTransactions` | `getPaymentsWithTransactions` (`services/paymentTransactions.service.ts`) ← `PostVentaPage.fetchEvents` | solo sesión |
| `POST /payments/transactions` | `PaymentsController.createPaymentTransaction` | `PaymentsService.createPaymentTransaction` → `createOrUpdatePaymentTransaction` | ninguna pantalla la llama; `PortalReceiptsController.confirm` no pasa por esta ruta, pero usa por dentro el mismo `PaymentsService.createPaymentTransaction` | `OPERATIONS_AND_UP` |
| `POST /payments/transactions/overflow` | `PaymentsController.createOverflowPaymentTransaction` | `PaymentsService.createOverflowPaymentTransaction` | `createOverflowPayment` ← `RegistrarPagoPanel` | `OPERATIONS_AND_UP` |
| `PATCH /payments/transactions/:id` | `PaymentsController.updatePaymentTransaction` | `PaymentsService.updatePaymentTransaction` → `createOrUpdatePaymentTransaction` (modo edición) | `updatePaymentTransaction` ← `EditRegistroModal` | `OPERATIONS_AND_UP` |
| `DELETE /payments/transactions/:id` | `PaymentsController.removePaymentTransaction` | `PaymentsService.removePaymentTransaction` | `deletePaymentTransaction` ← `EventModal.onDeleteTx` | `OPERATIONS_AND_UP` |
| `PATCH /payments/:id` | `PaymentsController.updatePaymentSchedule` | `PaymentsService.updatePaymentSchedule` | `updatePaymentSchedule` ← `EventModal.onSaveCuota` | `OPERATIONS_AND_UP` |
| `DELETE /payments/:id` | `PaymentsController.removePayment` | `PaymentsService.removePayment` | ninguna pantalla | `OPERATIONS_AND_UP` |
| `GET /refunds` | `RefundsController.findAll` | `RefundsService.findAll` | `getRefunds` existe en `services/refunds.service.ts` pero ninguna pantalla lo usa | `OPERATIONS_AND_UP` (del controller) |
| `GET /refunds/by-quotation?quotationId=` | `RefundsController.findByQuotation` | `RefundsService.findByQuotation` | `getRefundsByQuotation` ← `ReembolsosManager` | `OPERATIONS_AND_UP` |
| `GET /refunds/paid-map` | `RefundsController.paidMap` | `RefundsService.paidMapByCompany` | `getPaidRefundsByQuotation` ← `PostVentaPage.fetchEvents` | `OPERATIONS_AND_UP` |
| `PATCH /refunds/:id/register` | `RefundsController.register` | `RefundsService.registerPaid` | `registerRefund` ← `RefundRow` | `OPERATIONS_AND_UP` |
| `GET /portal/:token` | `PortalController.getPortal` | `QuotationsService.getPortalData` | `PortalPage.cargar` (llama `apiRequest` directo) | `@Public` |
| `GET /portal/:token/cotizacion/:quotationId` | `PortalController.getPortalQuotation` | `QuotationsService.getPortalQuotation` | `PortalPage.verCotizacion` | `@Public` |
| `POST /portal/:token/comprobante` (multipart: `file`, `payment_id`, `declared_amount`) | `PortalController.submitReceipt` | `QuotationsService.submitPortalReceipt` | `PortalPage.enviarComprobante` (llama `api.request` directo) | `@Public` + `@Throttle` 10 por minuto |
| `GET /portal-receipts` | `PortalReceiptsController.list` | sin service: `PortalReceiptsRepository.listPending` | `listPortalReceipts` (`services/portalReceipts.service.ts`) ← `PostVentaPage`, `DashboardPage` | solo sesión |
| `POST /portal-receipts/:id/confirmar` | `PortalReceiptsController.confirm` | `PortalReceiptsRepository.findOne` + `PaymentsService.createPaymentTransaction` + `PortalReceiptsRepository.review` | `confirmPortalReceipt` ← `PostVentaPage.actuarComprobante` | `OPERATIONS_AND_UP` |
| `POST /portal-receipts/:id/rechazar` | `PortalReceiptsController.reject` | `PortalReceiptsRepository.findOne` + `PortalReceiptsRepository.review` | `rejectPortalReceipt` ← `PostVentaPage.actuarComprobante` | `OPERATIONS_AND_UP` |

Relojes (sin HTTP; `ScheduleModule` corre solo con `NODE_ENV === 'production'`, según `CLAUDE.md`):

| Horario | Dónde | Qué hace |
|---|---|---|
| `EVERY_DAY_AT_1AM` | `PaymentsService.updateOverduePayments` → `PaymentsRepository.updateOverduePayments` | cuotas `pendiente` con `due_date` <= ahora pasan a `vencido` |
| `EVERY_DAY_AT_11AM` | `PaymentsCronService.checkUpcomingOverduePayments` | cuotas `pendiente` que vencen en 3 días o hoy: `PAYMENT_REMINDER` al mandante + `PAYMENT_REMINDER_ADMIN` a administradores |
| `EVERY_DAY_AT_11AM` | `PaymentsCronService.checkOverduePayments` | cuotas `vencido` con 7 días de vencidas: `PAYMENT_OVERDUE` al mandante + `PAYMENT_OVERDUE_ADMIN` |

## 4. Tablas de la base de datos

| Tabla | Qué guarda | Lee o escribe | Migración que la crea o modifica |
|---|---|---|---|
| `payments` | Las cuotas: `quotation_id`, `payment_number`, `amount`, `due_date`, `status` (`pendiente` / `pagado` / `vencido`, con CHECK), `payment_type` (el comentario, p. ej. "Cuota 1"), `notes`; `paid_date` y `payment_method` son legado | lee y escribe `PaymentsRepository`; lee `QuotationsService` vía `PaymentsService`, `AnalyticsService`, `HoyRepository.alerts` (en `analytics/hoy.controller.ts`), `ClientsRepository.findSummary` (ficha 360°), `MovilService` | `0_initial_models.sql` (foto del esquema); índice `idx_payments_quotation` en `66_indices_de_consultas_calientes.sql` |
| `payment_transactions` | Los abonos o registros de pago: `payment_id`, `quotation_id`, `amount`, `payment_method`, `transaction_date`, `notes`, `receipt_photo_url`, `created_by`. FK a `payments` **sin** ON DELETE | lee y escribe `PaymentsRepository`; lee `HoyRepository.alerts`, `MovilService`, `QuotationsRepository` (freno del borrado) | `0_initial_models.sql`; índice en `66_...`; etiquetas de medio unificadas en `102_unificar-medios-de-pago.sql` |
| `refunds` | Reembolsos: `amount`, `quotation_id`, `is_paid`, `refund_date`, `payment_method`, `receipt_url`. Sin `company_id` propio (se acota vía la cotización) | lee y escribe `RefundsRepository` | `0_initial_models.sql`; columnas ricas en `7_refunds_rich_columns.sql` |
| `portal_receipts` | Comprobantes subidos desde el portal: `company_id`, `quotation_id` (CASCADE), `payment_id` (SET NULL), `client_contact_id`, `file_url`, `declared_amount`, `status` (`pendiente` / `confirmado` / `rechazado`), `review_note`, `reviewed_at` | lee y escribe `PortalReceiptsRepository` (vive en `portal-receipts.controller.ts`) | `49_comprobantes_portal.sql` (incluye los GRANT a `service_role`) |
| `client_contacts.portal_token` | El enlace secreto del mandante (64 hex) | lee `QuotationsRepository.findPortalContact`, `findContactById`, `findContactByName`, `findContactPortalToken` y `PaymentsRepository.findAllPaymentsWithTransactions` (embebido `mandante`); lo escribe `ClientContactsRepository.create` (mapa 09) | `48_portal_del_mandante.sql`; relleno en `50_correos_a_personas.sql` |
| `quotations.client_contact_id` | Vínculo real mandante ↔ cotización | lee; lo escribe `QuotationsService.create` / `update` vía `resolveContactId` (mapas 01 y 02) | `48_portal_del_mandante.sql`, `50_correos_a_personas.sql` |
| `quotations` (`total_amount`, `quotation_status`) | Total contra el que cuadra el portero; estado que el plan pasa a `aceptada` | lee; escribe `quotation_status` desde `createPaymentPlan` | mapa 18 |
| `quotations.portal_token` | Token por cotización, histórico | nadie (quedó solo el tipo en `quotation.entity.ts`) | creada en `47_portal_token.sql`, borrada en `58_limpia_portal_token_de_cotizaciones.sql` |
| `companies.bank_details`, `tagline`, `logo_url`, `colors` | Datos de cobro y marca que muestra el portal | lee `findPortalContact` | `tagline` y `bank_details` en `46_datos_cobro_empresa.sql`; `logo_url` y `colors` ya estaban en `0_initial_models.sql` |
| `customer_satisfaction_survey_responses` | Si la encuesta ya fue respondida (chip del portal) | lee `QuotationsRepository.answeredSurveys` | mapa 14 |
| Storage: balde `payment-receipts` | Archivos de comprobantes: `c<empresa>/payment-receipts/...`, `refund-receipts/...`, `portal-receipts/...` | escribe `StorageService.upload` (kinds `payment-receipt`, `refund-receipt`, `portal-receipt`); ver con enlace firmado `StorageService.signedUrl` | creado público en `9_storage_payment_receipts_bucket.sql`; hecho PRIVADO en `42_storage_candado.sql` |

## 5. Flujos principales

### A. Aceptar la cotización y armar el plan (con el portero de cuadratura)

1. Pantalla: en `QuotationsPage.applyStatusChange` o `NegocioPage.cambiarEstado` se elige "aceptada". La app pide `getPaymentsByQuotationId`. Si ya hay cuotas, solo hace `PATCH /quotations/:id` con el estado (aviso "el plan de pagos ya existía"). Si no hay, abre `PaymentPlanEditor`.
2. `PaymentPlanEditor` pide el total **fresco** con `getQuotationById` (`staleTime: 0`) y parte con "Cuota 1" por el total. Solo deja guardar si `diff === 0` y cada fila tiene monto > 0, fecha y comentario.
3. La página arma `CreatePayment[]` (`payment_number` = posición + 1, `status: "pendiente"`, montos redondeados) y llama `createPaymentPlan` → `POST /payments/plan`.
4. `PaymentsService.createPaymentPlan`:
   - trae la cotización con `QuotationsService.findOne`; si es de otra empresa, 404;
   - **portero**: si la suma redondeada de las cuotas no es igual al `total_amount` redondeado, 400 con "recarga la página y arma el plan de nuevo";
   - `deletePaymentsByQuotationId` y luego `createPaymentPlan` (insert);
   - si el estado previo no era `aceptada`, envía `PAYMENT_PLAN_CREATED` al mandante (`QuotationsService.mandanteOf`) con su token de portal. Sin correo, solo deja un aviso en el log;
   - si el estado no es `realizada`, `QuotationsRepository.update` lo deja `aceptada`. Va directo al repositorio: sin cascada ni candado.
5. Efecto: el evento aparece en Post-Venta, porque `fetchEvents` arma las filas **desde las cuotas**, y en el portal bajo "Tus eventos confirmados".

### B. Registrar un pago con derrame y la regla de cuadratura

1. `PostVentaPage` → `EventModal` → `RegistrarPagoPanel`. Calcula las cuotas con saldo (`amount - paid_amount`), muestra una vista previa del reparto y pone como tope el saldo total. El comprobante (imagen o PDF de hasta 5 MB) se sube antes con `uploadPaymentReceipt`, y la ruta usa la primera cuota pendiente.
2. `createOverflowPayment` → `POST /payments/transactions/overflow`.
3. `PaymentsService.createOverflowPaymentTransaction`:
   - trae las cuotas `pendiente` / `vencido` en orden de `payment_number` y calcula cuánto le falta a cada una con `Number()`;
   - si el monto supera el saldo total, lanza error;
   - reparte: una `payment_transaction` por cuota tocada, y cada cuota que se llena pasa a `pagado`;
   - manda **un** correo `PAYMENT_RECEIVED` al mandante;
   - si la última cuota tocada quedó a medias, llama `normalizePaymentAfterTransactions`.
4. `normalizePaymentAfterTransactions` (regla del 20-07):
   - sin abonos: la cuota vuelve a `pendiente` o `vencido` según su fecha;
   - abono igual o mayor al monto: `pagado`;
   - abono parcial: las cuotas posteriores corren su número en +1, la cuota queda en `amount = abonado` y `pagado`, y nace una cuota nueva por el remanente con la misma `due_date`, `payment_type` y `notes`.
5. La app llama `refreshAfterSave`, que invalida `["quotations"]`, `["clientSummary"]`, `["quotation"]` y `["postventa"]`.

### C. Rectificar o eliminar un abono y mover una cuota

- **Rectificar**: `EditRegistroModal` → `PATCH /payments/transactions/:id` → `createOrUpdatePaymentTransaction` en modo edición. Busca el registro (`findPaymentTransactionById`, sin filtro de empresa) y su cuota (`findPaymentById`, con `!inner` a la empresa) e impide pasarse del monto de la cuota: para un pago mayor hay que eliminar el registro y volver a registrarlo, así derrama. Después actualiza y re-cuadra.
- **Eliminar**: basurero → `DELETE /payments/transactions/:id` → `removePaymentTransaction`. Borra el registro y re-cuadra la cuota; la cuota nunca se borra.
- **Mover la cuota (Nivel A)**: el lápiz solo aparece si la cuota no tiene registros y no está pagada. `PATCH /payments/:id` → `updatePaymentSchedule` rechaza si hay plata. Una fecha nueva anterior a hoy deja la cuota `vencido`; si no, `pendiente`.

### D. Cambiar el total de un evento aceptado: la cascada (vive en `QuotationsService.update`, mapa 01)

1. Aviso previo: `AvisoPlanDePagos` en `QuotationForm` y en `ServiciosTab`. En la pestaña Servicios, además, el guardado automático se apaga.
2. `PATCH /quotations/:id` → `QuotationsService.update`, en este orden:
   - candado del evento realizado (400);
   - freno de recepción;
   - `assertMoneyMatches`;
   - **guardia de estados**: pasar de post-venta a pre-venta con plata registrada da 400 ("usa Anular evento"); sin plata, `PaymentsService.deletePaymentPlan` borra el plan.
3. Si la cotización está `aceptada`, trae sus cuotas `pendiente` / `vencido`:
   - **El total baja**: sin cuotas pendientes, `RefundsService.create` crea un reembolso por la diferencia. Con cuotas, descuenta desde la **última** hacia atrás, y lo que no cupo se vuelve reembolso.
   - **El total sube** (tarea #42): primero consume los reembolsos **pendientes**, del más antiguo al más nuevo, achicándolos (`updateAmount`) o borrándolos (`remove`). El resto se suma a la última cuota pendiente o, si no hay, a una cuota nueva (`PaymentsService.createPayment`: vence 7 días después del evento, u hoy si la cotización no tiene fecha; nota "Pago creado por diferencia de total_amount").
4. Recién ahí `QuotationsRepository.update` guarda la cotización.

### E. Portal del mandante y "Ya transferí"

1. **El enlace llega por dos vías**:
   - todo correo al cliente de `EMAILS_SEND_TO_CLIENT` lleva el botón "Ingresar a mi portal" cuando quien llama pasa el token del mandante (`EmailService.sendEmail` arma `FRONTEND_URL/portal/<token>`);
   - el botón "Enlace de pagos" de la ficha de Post-Venta copia `window.location.origin/portal/<token>`.
2. **Ver el portal**: `PortalPage` → `GET /portal/:token` → `getPortalData`.
   - Un token de menos de 40 caracteres da 404.
   - `findPortalContact` trae el contacto, su cliente y la marca de la empresa.
   - `findAllByContact` trae sus cotizaciones en estado `enviada`, `en_negociacion`, `aceptada` o `realizada`.
   - Para las aceptadas y realizadas calcula las cuotas. El estado pasa a `vencido` si la cuota no está pagada y `vence < hoy` (fecha UTC), y en las pagadas `pagadaEl` es el máximo de `transaction_date`. `pendingPaymentIds` marca las cuotas "en revisión" y `paidMapByCompany` resta los reembolsos pagados.
   - Arma tres grupos: `confirmados`; `historial` (realizado y con saldo ≤ 0); `enConversacion`.
3. **Ver la cotización**: `GET /portal/:token/cotizacion/:id` → `getPortalQuotation`. Solo sirve si la cotización es del mandante; responde `listaBlancaDeHoja` más `cartaDelCatalogo`, y la app la pinta con `buildQuotationPrintDoc` (mapa 02).
4. **"Ya transferí"**: `POST /portal/:token/comprobante` → `submitPortalReceipt`.
   - valida que el monto sea mayor que cero, que la cuota sea del mandante, que no esté pagada y que el monto no supere lo pendiente;
   - sube el archivo (`kind: 'portal-receipt'`);
   - inserta en `portal_receipts` con estado `pendiente`;
   - avisa a los administradores con `PORTAL_RECEIPT_ADMIN`.
5. **El equipo lo revisa** en la bandeja de `PostVentaPage` (el `DashboardPage` muestra el contador):
   - **Confirmar** → `POST /portal-receipts/:id/confirmar` → `PaymentsService.createPaymentTransaction` con el monto declarado, medio 'Transferencia bancaria' (el que usa si no llega `payment_method`, y `confirmPortalReceipt` no lo manda), fecha de hoy (UTC), nota fija y el archivo como comprobante. Re-cuadra la cuota y marca el comprobante `confirmado`.
   - **Rechazar** → lo deja `rechazado` con la nota.

### F. Relojes de cobranza

1. 1 AM: `updateOverduePayments` pasa a `vencido` las cuotas `pendiente` con `due_date` <= ahora.
2. 11 AM: `PaymentsCronService.checkUpcomingOrOverduePayments` calcula las fechas objetivo (`normalizeDateToUtc`) y usa `findAllPaymentsWithTransactions` sin empresa. Por cada cuota manda correo al mandante (con portal) y un correo aparte a los administradores (`PAYMENT_REMINDER_ADMIN` o `PAYMENT_OVERDUE_ADMIN`). Mandante sin correo: aviso en el log y el correo al cliente no sale.
3. Cualquier empresa puede apagar un tipo de correo al cliente (los de `EMAILS_SEND_TO_CLIENT`: plan creado, pago recibido, recordatorio y vencido) en su configuración de notificaciones (`EmailService.shouldSendEmail`, mapa 12). Los avisos a administradores no pasan por ese filtro.

## 6. Reglas de negocio acordadas

1. **El portero del plan (caso 501, 06-09)**: la suma de las cuotas debe calzar **al peso** con el total ACTUAL guardado en la base, no con el que muestra la pantalla. La cuota de la 501 nació doblada porque la lista mostraba un total viejo. Evidencia: comentario en `PaymentsService.createPaymentPlan`; prueba "createPaymentPlan: el portero de cuadratura" en `payments.service.spec.ts`; en la app, total fresco en `PaymentPlanEditor`.
2. **Cuadratura de la cuota (Felipe, 20-07-2026)**: después de cualquier registro, toda cuota queda 100 % pagada o 100 % pendiente. Un pago parcial divide la cuota, el remanente hereda la fecha (si estaba vencida nace vencida) y las cuotas siguientes corren su número. Evidencia: `normalizePaymentAfterTransactions`.
3. **Al peso y como número (24-08)**: los montos se suman con `Number()`. Supabase entregaba texto, "0" + "20800" daba "020800" y un pago exacto parió una cuota fantasma de $0, vencida (cuota 12 de la #486, Quillón, 20-08 a las 15:57). Evidencia: comentario en `normalizePaymentAfterTransactions`; pruebas `normalizePaymentAfterTransactions` con montos como texto.
4. **Derrame**: un pago se reparte desde la cuota más próxima (menor número) hacia adelante, con una transacción por cuota y un solo correo, y nunca más allá del saldo total. Evidencia: `CreateOverflowTransactionDto`, `createOverflowPaymentTransaction`.
5. **Rectificar no derrama**: editar un registro no puede pasarse de su cuota; para un monto mayor se elimina y se registra de nuevo. Evidencia: mensaje en `createOrUpdatePaymentTransaction`.
6. **Eliminar un registro nunca elimina la cuota**; la cuota se re-cuadra. Evidencia: comentario en `removePaymentTransaction`.
7. **Calendario de pagos, Nivel A (29-07)**: por `PATCH /payments/:id` solo se editan la fecha y la nota de una cuota **sin dinero**; el monto y la estructura no se tocan ahí. Evidencia: `UpdatePaymentScheduleDto`, `updatePaymentSchedule`; seis pruebas en `payments.service.spec.ts`.
8. **La fecha de pago es la del ÚLTIMO abono (28-08)**: antes se tomaba el primero. Medido en producción: 38 de 52 cuotas pagadas de a poco mostraban la fecha equivocada (cotización 114: 149 días de diferencia). Evidencia: `fechaDelUltimoAbono` y sus pruebas. También la usa `AnalyticsService`.
9. **Hitos anti-spam (Felipe, 29-07)**: como máximo 3 toques por cuota (3 días antes, el día del vencimiento y 7 días después); antes eran hasta 6. Evidencia: `UPCOMING_OVERDUE_PAYMENTS_DAYS_NOTIFICATION` y `OVERDUE_PAYMENTS_DAYS_NOTIFICATION` en `payments/constants/index.ts`.
10. **Correos a personas y punto (30-07)**: la plata le escribe al MANDANTE vinculado. Sin persona con correo no sale nada al cliente (queda en el log); en los relojes el aviso a administradores sale igual (al crear el plan o registrar un pago no hay aviso a administradores). Evidencia: `PaymentsCronService`, `createPaymentPlan`, `createOverflowPaymentTransaction`; `50_correos_a_personas.sql`.
11. **El portal es de la PERSONA (migración 48, diseño de Felipe, 30-07)**: un contacto tiene un enlace, ve todas sus cotizaciones y solo las suyas; áreas distintas de un mismo cliente no se ven entre sí. Todo contacto nace con su token (`randomBytes(32)`); un token inválido da 404 sin pistas. Evidencia: `48_portal_del_mandante.sql`, `ClientContactsRepository.create`, `getPortalData`.
12. **Lista blanca**: los costos internos jamás salen por el portal; la misma lista sirve para `/imprimir`. Evidencia: `getPortalQuotation` y `EnvioCotizacionService.hojaParaImprimir` usan `listaBlancaDeHoja`; `docs/arquitectura/13_ENVIO_DE_COTIZACIONES.md`.
13. **La plata nunca se registra sola (Fase 2b, 30-07)**: lo que sube el cliente queda pendiente hasta que el equipo lo confirma, y confirmar registra el pago por la puerta de siempre. Evidencia: comentario de `portal-receipts.controller.ts`; `49_comprobantes_portal.sql`.
14. **Tope al monto declarado**: el cliente no puede declarar más de lo pendiente de su cuota; se valida en la pantalla y en el motor. Evidencia: `submitPortalReceipt`, `PortalPage.enviarComprobante`.
15. **Compensación (tarea #42)**: nunca conviven "te debo" y "me debes". Si sube el total, los reembolsos pendientes se consumen antes de crear deuda; los ya pagados no se tocan ("esa plata ya salió"). Evidencia: `QuotationsService.update`, `RefundsService.findPendingByQuotation`.
16. **Si baja el total**, se descuenta desde la última cuota pendiente y lo que no cabe se vuelve reembolso. Evidencia: `QuotationsService.update`, texto de `AvisoPlanDePagos`.
17. **Guardia de estados**: un evento con plata no vuelve a pre-venta (se anula); sin plata vuelve y su plan se borra entero, sin dejar cuotas huérfanas. Una cotización con abonos, reembolsos o plan no se puede borrar. Evidencia: `QuotationsService.update`; `QuotationsRepository` (`cuantasHay`).
18. **Candado del evento realizado (Felipe, 13-08)**: la cotización se congela, pero "Puede faltar cobrar": los pagos y reembolsos siguen vivos. Rehacer el plan de un realizado está permitido, pero ya no lo devuelve a "aceptada" (puerta de atrás tapada el 13-08). Evidencia: `quotations/constants/constants.ts`, `createPaymentPlan`, `candado-evento-realizado.spec.ts`.
19. **Con plan vivo, la pestaña Servicios no guarda sola (Felipe, 06-09)**, y el aviso ámbar anuncia la cascada ("un aviso ámbar como el de evento provisionado"). Evidencia: `ServiciosTab` (`planVivo`), `AvisoPlanDePagos`.
20. **Reembolsos: terreno de operaciones y administración (Mudanza #7, 28-07)**; anular un evento es solo del administrador. Evidencia: `RefundsController`, `EventModal` (`canCancel`).
21. **Medios de pago**: cinco opciones (Transferencia, Efectivo, Cheque, Tarjeta, Otro). Las etiquetas viejas se unificaron el 28-08 por decisión de Felipe (Depósito pasó a Otro). Evidencia: `PAYMENT_METHODS` en `PostVentaPage.tsx`; `102_unificar-medios-de-pago.sql`.
22. **Saldo neto**: Post-Venta y portal calculan saldo = total − (pagado − reembolsos pagados). Evidencia: `PostVentaPage.fetchEvents`, `getPortalData`.
23. **Plan sin plantillas**: parte con una cuota por el total y el % es solo informativo ("rara vez le achuntaban a la realidad"). Evidencia: comentario de cabecera de `PaymentPlanEditor`.
24. **Fechas de evento y de cuota en UTC (12-08 y 13-08)**: se muestran con `formatISOUTCDateToString` / `formatFechaEvento`; `new Date()` las corría un día. Evidencia: `fmtDate` en `PostVentaPage` (12-08); la fecha del evento en `PaymentPlanEditor` con `formatFechaEvento` (13-08).
25. **Comprobantes privados (misión storage, 28-07)**: se ven con un enlace firmado que caduca. Evidencia: `storage.service.ts`, `FileViewLink`, `42_storage_candado.sql`.

## 7. Conexiones con otros módulos

**A quién usa este módulo**
- Cotizador y ficha del negocio (mapas 01 y 02): `QuotationsService.findOne` y `mandanteOf`, `QuotationsRepository.update` para el estado, `listaBlancaDeHoja` y `buildQuotationPrintDoc` para la hoja del portal. Dependencia circular resuelta con `forwardRef` en `payments.module.ts` y `quotations.module.ts`.
- Correos (mapa 12): `EmailService.sendEmail` con plantillas `paymentPlanCreated`, `paymentReceived`, `paymentReminder` (+ admin), `paymentOverdue` (+ admin) y `portalReceipt/admin`; el botón del portal se arma en `brandLayout.ts`.
- Clientes y contactos (mapa 09): `client_contacts.portal_token` y el vínculo `client_contact_id`.
- Acceso, empresa y usuarios (mapa 15): `UsersService.findAll(companyId, ADMINISTRADOR)` para los avisos; `companies.bank_details` y marca para el portal (se editan en la configuración de empresa); `RolesGuard` y `SECTION_ROLES`.
- Infraestructura del motor (mapa 16): `StorageService` (balde privado, enlaces firmados), `ThrottlerModule`, `ScheduleModule`.
- Encuestas (mapa 14): el portal enlaza `/customer-satisfaction-survey/:companyId/:quotationId` y usa `answeredSurveys`.

**Quién usa este módulo**
- `QuotationsService.update` (mapa 01): cascada del plan, compensación y guardia de estados. `QuotationsRepository` frena el borrado si hay pagos, reembolsos o plan.
- `EnvioCotizacionService` (mapa 02): mueve el estado por el REPOSITORIO precisamente para **no** disparar la cascada (doc 13). `QuotationsCronService` (seguimiento) usa el token del mandante.
- Post-Venta (mapa 04): la ficha del evento aloja todas las pantallas de plata; "Anular evento" deja pagos y comprobantes como historia.
- Dashboard y analítica (mapa 13): `AnalyticsService` usa `findAllPaymentsFromQuotation` y `fechaDelUltimoAbono`; `HoyRepository.alerts` (servido por `HoyController`) calcula "por cobrar" restando abonos y dejando fuera los reembolsos (07-08); `DashboardPage` muestra el contador de comprobantes.
- Clientes (mapa 09): `ClientsRepository.findSummary` trae las cuotas `pendiente` / `vencido` y `ClientDetailPage` las suma a monto completo como saldo vivo de la ficha 360°. Solo cuadra gracias a la regla de cuadratura: una cuota pendiente no trae abonos.
- App móvil (mapa 16): `MovilService` genera avisos "Pago vencido" con destino `/evento/:id`.
- Personas (mapa 08): el "cajón" de `docs/arquitectura/10_MODULO_DE_PERSONAS.md` tiene pendiente que la liquidación avise si los pagos del evento traen propinas anotadas; hoy `people` no lee estas tablas.

**Efectos automáticos**
- Relojes: 1 AM (vencidas) y 11 AM (recordatorios), solo en producción.
- Correos al mandante: al crear el plan (si la cotización no estaba ya `aceptada`; rehacer el plan de una realizada lo manda de nuevo), al registrar un pago (crear, no editar; también al confirmar un comprobante del portal), en los recordatorios y vencidos. A administradores: recordatorios, vencidos y cada comprobante del portal.
- Cascadas: la división de cuotas; la cascada de total en `QuotationsService.update`; `portal_receipts.payment_id` pasa a NULL si se borra la cuota.
- Cachés de la app: `refreshAfterSave` invalida cotizaciones, `clientSummary`, la cotización individual y `["postventa"]`; `["payments", id]` es compartida por `AvisoPlanDePagos` y `ServiciosTab`.

## 8. Zonas de riesgo: si tocas esto, cuidado con aquello

- **Si tocas** cualquier suma de montos, **se afecta** la cuadratura de cuotas, los saldos del portal y la cascada, **porque** el 24-08 una suma de texto parió una cuota fantasma de $0 (#486). El arreglo con `Number()` vive solo en `normalizePaymentAfterTransactions` y `createOverflowPaymentTransaction`. Siguen sumando con `+ t.amount` sin convertir: `createOrUpdatePaymentTransaction` (`current_paid`), `findAllPaymentsWithTransactions` (`paid_amount`), `getPortalData` y `submitPortalReceipt` (`abonado`) y la cascada de `QuotationsService.update` (`alreadyPaidAmount`, `lastPayment.amount + amountToCharge`). Evidencia: esas funciones. No verifiqué si en esos caminos el monto llega como texto.
- **Si tocas** el `.order('payment_number')` de `PaymentsRepository.findAllPaymentsFromQuotation`, **se afecta** el derrame (de la más próxima hacia adelante), la "última cuota" de la cascada y el número de la cuota nueva de `createPayment`, **porque** los tres dependen de ese orden. Evidencia: comentario "be careful when changing this" en el repositorio.
- **Si tocas** `createPaymentPlan`, **se afecta** la integridad del plan, **porque**:
  - borra e inserta en dos pasos, sin transacción y sin mirar el resultado del borrado ni del insert;
  - no revisa abonos: `payment_transactions.payment_id` no tiene ON DELETE, así que con abonos el borrado falla en silencio y el insert duplica el plan;
  - `PaymentPlanEditor` no bloquea el doble clic, lo que da dos planes (doc 09, Tanda A3);
  - rehacer el plan deja los comprobantes pendientes con `payment_id` NULL, y confirmar los rechaza como "no válido".
  Evidencia: `PaymentsService.createPaymentPlan`, `PaymentsRepository.deletePaymentsByQuotationId`, `0_initial_models.sql`, `49_comprobantes_portal.sql`, `PortalReceiptsController.confirm`.
- **Si tocas** el cambio de estado dentro de `createPaymentPlan`, **se afecta** el candado y la cascada, **porque** hoy va directo por `QuotationsRepository.update`: no pasa por el candado ni recalcula el plan recién creado. Si alguien lo "limpia" a `QuotationsService.update`, la cascada corre sobre el plan nuevo. Además, sobre una cotización `cancelada` la revive a `aceptada`. Evidencia: `createPaymentPlan`.
- **Si tocas** `EnvioCotizacionService` para que use `QuotationsService.update`, **se afecta** el plan de pagos, **porque** ese camino dispara la cascada; por eso va por el repositorio. Evidencia: `docs/arquitectura/13_ENVIO_DE_COTIZACIONES.md`.
- **Si tocas** las reglas de "vencido", **se afecta** qué recordatorios salen, **porque** hay cuatro criterios distintos para el "vence hoy":
  - `PaymentsRepository.updateOverduePayments` usa `due_date <= ahora`;
  - `updatePaymentSchedule`, `getPortalData` y `cuotaStatus` (app) usan `< hoy` (los dos del motor con la fecha UTC; `cuotaStatus` con la fecha local del navegador);
  - `normalizePaymentAfterTransactions` usa `new Date(due_date) < new Date()`;
  - el recordatorio del "día del vencimiento" busca a las 11 AM cuotas que sigan `pendiente` con `due_date = hoy`.
  Si el reloj de la 1 AM ya las pasó a `vencido`, ese toque podría no salir nunca. No confirmado: depende de la zona horaria del servidor y de cómo Postgres compara fecha contra texto. Evidencia: esas funciones; `payments/constants/index.ts`.
- **Si tocas** los repositorios de pagos y reembolsos, **se afecta** el aislamiento entre empresas, **porque** varias puertas no acotan por `company_id` como pide `CLAUDE.md`:
  - `removePaymentTransaction` busca y borra el registro por id sin validar la empresa (solo el re-cuadre posterior, vía `findPaymentById`, filtra), y `removePayment` no recibe empresa;
  - `findAllTransactionsByPaymentId`, `updatePayment`, `findPendingByQuotation`, `updateAmount` y `remove` no filtran;
  - `deletePaymentsByQuotationId` recibe `companyId` y no lo usa;
  - `findAllPaymentsFromQuotation` y `RefundsRepository.findAll` filtran `quotations.company_id` sobre un embebido **sin** `!inner`; en PostgREST eso filtra el hijo, no la fila, a diferencia de `findPaymentById` y `findByQuotation`, que sí usan `!inner`;
  - `QuotationsService.update` corre la cascada tras `QuotationsRepository.findOne(id)`, que no filtra empresa;
  - `CreatePaymentPlanDto.payments` usa `@IsArray` sin `@ValidateNested`, así que el `quotation_id` de cada cuota no se compara con el del DTO.
  No encontré un abuso real: es una puerta a revisar. Evidencia: `payments.repository.ts`, `refunds.repository.ts`, `quotations.service.ts`, `create-payment-plan.dto.ts`.
- **Si tocas** los mensajes de error de pagos, **se afecta** lo que ve el usuario, **porque**:
  - `createOverflowPaymentTransaction` y `createOrUpdatePaymentTransaction` relanzan todo como `new Error(error)` y no encontré filtro global de excepciones, así que el motor respondería 500 genérico;
  - `apiRequest` relanza el error de axios tal cual;
  - `RegistrarPagoPanel`, `EditRegistroModal`, `QuotationsPage.handlePaymentPlanSave` y `NegocioPage.guardarPlan` muestran `error.message` y no `response.data.message`.
  Es probable que textos como el del portero ("recarga la página") o "El monto excede esta cuota…" no lleguen a la pantalla. Evidencia: esas funciones; `frontend/src/services/api.ts`.
- **Si tocas** los permisos de aceptar, **se afecta** al vendedor, **porque** la app le deja elegir "aceptada" (`quotations_edit` = vendedor+ en `NegocioPage` y `QuotationsPage`), pero `POST /payments/plan` exige `OPERATIONS_AND_UP` y `RolesGuard` responde 403 "Tu cargo no tiene permiso para esta función". Solo acepta sin error si el plan ya existía. `roles.decorator.ts` dice que la matriz espejo se cambia a ambos lados. Evidencia: `permissions.ts`, `payments.controller.ts`, `roles.guard.ts`.
- **Si tocas** `getPaymentsByQuotationId`, **se afecta** `AvisoPlanDePagos`, `ServiciosTab`, `QuotationsPage` y `NegocioPage`, **porque** el 06-09 la doble envoltura `{data:{data}}` hizo que "el plan ya existía" nunca se detectara y que el freno del autoguardado de Servicios no se activara. Evidencia: comentario en `payments.service.ts` (app).
- **Si tocas** `RegistrarPagoPanel`, **se afecta** la pantalla entera, **porque** el `return null` cuando no queda saldo debe ir DESPUÉS de todos los hooks: un return entre hooks dio pantalla blanca justo al registrar el pago que deja el saldo en cero. Evidencia: comentario en `RegistrarPagoPanel`. (La pantalla blanca del 01-09 "subiendo un comprobante" tuvo otra causa, una pieza perezosa perdida tras publicar; ver `RedDeSeguridad.tsx`, mapa 17.)
- **Si tocas** la forma de la respuesta de `getPortalData`, **se afecta** la página pública, **porque** `PortalPage` declara a mano su interfaz `PortalData` y no hay tipos compartidos ni pruebas: renombrar un campo rompe al cliente en silencio. Lo mismo vale para `listaBlancaDeHoja`, que comparten portal, PDF e impresión. Evidencia: `quotations.service.ts`, `PortalPage.tsx`, doc 13.
- **Si tocas** `fetchEvents` o `deletePaymentPlan`, **se afecta** la visibilidad del evento en Post-Venta, **porque** las filas nacen de las cuotas: una cotización aceptada sin cuotas no aparece. Evidencia: `PostVentaPage.fetchEvents`.
- **Si tocas** `PostVentaPage.tsx` (3168 líneas, congelado en 3180), `ServiciosTab.tsx` (2265 / 2285) o `QuotationForm.tsx` (3928 / 3936), **se afecta** el paso por el portero, **porque** están congelados por tamaño: la pieza nueva va en su propio archivo. Evidencia: `frontend/scripts/portero-kit-de-la-casa.sh`.

## 9. Pruebas que lo protegen

| Archivo | Qué cubre |
|---|---|
| `api-rest/src/payments/tests/payments.service.spec.ts` | Portero del plan: rechaza el descuadre sin borrar nada y da 404 si es de otra empresa. `updatePaymentSchedule`: seis casos (pagada, con abonos, fecha futura → pendiente, fecha pasada → vencido, solo nota, 404). `normalizePaymentAfterTransactions` con montos como texto: el pago exacto no pare cuota de $0 y el parcial divide bien. `fechaDelUltimoAbono`: cuatro casos |
| `api-rest/src/payments/tests/payments.controller.spec.ts` | Solo que el controller se construya |
| `api-rest/src/refunds/tests/refunds.controller.spec.ts`, `refunds.service.spec.ts` | Solo que se construyan ("should be defined") |
| `api-rest/src/quotations/tests/unit/quotations.service.spec.ts` | Cascada con cotización aceptada: error al leer cuotas; total igual; baja sin cuotas pendientes → reembolso; sube sin cuotas → cuota nueva; sube con cuotas → agranda la última. Los reembolsos pendientes están simulados como lista vacía |
| `api-rest/src/quotations/tests/unit/candado-evento-realizado.spec.ts` | Un realizado no cambia montos ni fecha y no sale a aceptada, cancelada, en negociación ni rechazada, sin llamar `deletePaymentPlan`; no se borra |
| `api-rest/src/analytics/tests/por-cobrar.spec.ts` | "Por cobrar" descuenta abonos (mapa 13) |

**Lo importante que NO está cubierto**:
- Pagos: el derrame (`createOverflowPaymentTransaction`), el tope y la edición de registros (`createOrUpdatePaymentTransaction`), `removePaymentTransaction`, la división cuando hay cuotas posteriores que renumerar y los relojes (`updateOverduePayments`, `PaymentsCronService`).
- Cascada: la baja de total CON cuotas pendientes (descuento desde la última y reembolso del sobrante) y la compensación de la tarea #42 con reembolsos reales.
- Guardia de estados: no encontré prueba de la guardia con plata registrada en una aceptada.
- Portal completo: `getPortalData`, `getPortalQuotation`, `submitPortalReceipt` y confirmar o rechazar comprobantes. Tampoco `RefundsService.registerPaid` ni `paidMapByCompany`.
- App: no hay suite de pruebas, así que `PaymentPlanEditor`, `AvisoPlanDePagos`, `PortalPage` y las pantallas de Post-Venta no tienen ninguna.

## 10. Deuda y rarezas conocidas

- **Gigantes**: `PostVentaPage.tsx` 3168 líneas, `ServiciosTab.tsx` 2265, `QuotationForm.tsx` 3928 (congelados). Sobre 800 y dentro del techo de 27: `quotations.service.ts` 1309, donde viven el portal y la cascada, y `payments.service.ts` 858.
- **El portal vive en `quotations/`**, no en `payments/`. `PortalReceiptsRepository` y la lógica de confirmar están dentro de `portal-receipts.controller.ts`, sin service propio.
- **`PaymentsModule` ↔ `QuotationsModule` circular** (`forwardRef`); las pruebas construyen `PaymentsService` a mano por eso.
- **Sin uso desde la app**: `DELETE /payments/:id` (`removePayment`), `GET /refunds` + `getRefunds`, `POST /payments/transactions`. Además `UpdateRefundDto`, `PaymentsService.update` (lo usa solo la cascada, sin validación), y endpoints y métodos comentados en `payments.controller.ts`, `refunds.controller.ts` y `refunds.service.ts`.
- **TODOs**: en `Payment` (`entities/payment.entity.ts`) y en `frontend/src/types/payments.types.ts` ("add status enum", "check if necessary now bcs the payment_transactino contains that info" para `paid_date`, `payment_type` y `payment_method`); "TODO: Move this to the types folder" dos veces en `paymentTransactions.service.ts`.
- **Columnas legadas**: `payments.paid_date` (solo se limpia, nadie la escribe) y `payments.payment_method`.
- **El reloj de la 1 AM vive en `PaymentsService`** y no en `PaymentsCronService`. Su comentario interno dice "Update status of overdue payments to PENDIENTE", pero hace lo contrario (a `vencido`).
- **Comentario viejo**: el de `cuotaStatus` dice que el estado "solo pasa a vencido mediante un cron", pero también lo escriben `updatePaymentSchedule` y `normalizePaymentAfterTransactions`.
- **Medio por defecto**: confirmar un comprobante del portal registra 'Transferencia bancaria', la etiqueta vieja que la migración 102 unificó a 'Transferencia'. Vuelve a partir los informes por medio de pago.
- **La app sin su capa de servicios**: `PortalPage` llama `apiRequest` y `api.request` directo. Los tipos del portal están duplicados a mano entre motor y app.
- **Modales hechos a mano**: `PaymentPlanEditor` (con `<input type="date">` nativo), `EditRegistroModal` y la bandeja de comprobantes. Según doc 09, Tanda A3, el de reembolso deja libre Cancelar mientras guarda.
- **Sin paginar**: `findAllPaymentsWithTransactions` trae todas las cuotas de la empresa en una consulta (todo Post-Venta).
- **Formateador repetido**: `clp` está en `PortalPage`, `PaymentPlanEditor` y `PostVentaPage`.
- **Bandeja abierta a todos**: `GET /portal-receipts`, `GET /payments` y `GET /payments/transactions` no llevan `@Roles`; cualquier cargo con sesión puede leerlos. Las pantallas sí se limitan por rol.
- **Cuota de $0 en la cascada**: si la reducción cubre todo lo pendiente de una cuota sin abonos (igual o más), la cuota queda en `amount = 0` con su estado `pendiente` o `vencido` (no se borra ni se marca pagada). Los relojes podrían cobrarla. Visto en `QuotationsService.update`, rama `else`; no medido en la base.

## 11. Contradicciones entre documento y código

1. **`CLAUDE.md` (aislamiento)** dice que todo método de repositorio recibe `companyId` y acota por `company_id`. El código no lo cumple en `PaymentsRepository.removePayment`, `removePaymentTransaction`, `findAllTransactionsByPaymentId`, `findPaymentTransactionById`, `updatePayment`, `deletePaymentsByQuotationId` (recibe `companyId` y no lo usa), ni en `RefundsRepository.findPendingByQuotation`, `updateAmount` y `remove`, entre otros.
2. **`CLAUDE.md` (llamadas al motor)** dice que todo va por `src/services/*.service.ts`. En el código, `PortalPage.tsx` llama `apiRequest` y `api.request` directamente.
3. **`CLAUDE.md` (kit de la casa, `Modal`)** lista como deuda conocida `PostVentaPage.EditRegistroModal`, pero no menciona `PaymentPlanEditor` ni la bandeja "Comprobantes por confirmar" de `PostVentaPage`. En el código, ambos también son modales a mano (`fixed inset-0`).
4. **`docs/arquitectura/09_PLAN_DE_HOMOLOGACION.md`, Tanda A4**, dice que en `PaymentPlanEditor` "por redondeo tardío el plan puede quedar $1 sobre el total". Desde el 06-09, `PaymentsService.createPaymentPlan` rechaza cualquier suma distinta del total, así que hoy el síntoma sería un guardado rechazado, no un plan descuadrado. El documento quedó desfasado.
5. **`docs/arquitectura/09_PLAN_DE_HOMOLOGACION.md`, Tanda A0**, dice "HECHA, sin publicar… Falta que Felipe la valide" (commit `55f56ff`). Ese commit está en la historia de `0de0ddb` y el arreglo vive en `PaymentPlanEditor` (`formatFechaEvento`, comentario del 13-08). No puedo confirmar desde el código si está en producción.
6. **`58_limpia_portal_token_de_cotizaciones.sql`** afirma que "el código no la referencia en ninguna parte". Pero `api-rest/src/quotations/entities/quotation.entity.ts` todavía declara `portal_token` (con comentario "SIN USO desde la 48"). Es solo el tipo; no hay lecturas.

## 12. Preguntas abiertas

1. ¿En qué zona horaria corren los relojes en Railway? `EVERY_DAY_AT_1AM` y `EVERY_DAY_AT_11AM` no fijan `timeZone`. Ningún `@Cron` del motor lo fija (los `America/Santiago` que hay son cálculos de fecha, no relojes); solo `backup-cron.service.ts` anota que su hora es UTC. De eso depende a qué hora chilena salen los recordatorios.
2. ¿Sale de verdad el recordatorio "el día del vencimiento"? El reloj de la 1 AM marca `vencido` con `due_date <= ahora` antes de que el de las 11 AM busque cuotas `pendiente` con `due_date = hoy`. Hay que medirlo con correos reales o logs.
3. ¿Supabase entrega `amount` como texto en todos los caminos (comentario del 24-08) o solo en algunos? Si es en todos, las sumas sin `Number()` de la sección 8 están expuestas al mismo error.
4. ¿El vendedor debe poder aceptar una cotización y armar su plan? Hoy la app se lo ofrece y el motor lo rechaza con 403.
5. ¿El filtro de empresa sobre embebidos sin `!inner` (`findAllPaymentsFromQuotation`, `RefundsRepository.findAll`) deja pasar cuotas o reembolsos de otra empresa si se entrega un id ajeno? Hay que probarlo en el laboratorio ("Cotizador"), nunca en "Cotizador-dev", que es producción. **11-09-2026:** la documentación de Supabase (guía *Querying Joins and Nested tables*) confirma el mecanismo: por defecto el embebido es un left join, las filas padre vuelven aunque la tabla relacionada no calce, y solo `!inner` las descarta. En `QuotationsService.update` eso importa: con el UUID de una cotización ajena, la cascada ve las cuotas de la otra empresa. Los ids de `payments` y `quotations` son UUID aleatorios en producción.
6. ¿Los mensajes del motor ("recarga la página", "El monto excede esta cuota…") llegan a la pantalla, o el usuario ve "Request failed with status code…"? No encontré filtro global de excepciones ni traducción en `api.ts`.
7. ¿Existen en producción cuotas `pendiente` de $0 creadas por la cascada al bajar un total?
8. ¿Qué debe pasar con los comprobantes del portal pendientes si se rehace el plan (quedan con `payment_id` NULL y no se pueden confirmar)?
9. El pendiente 4 del cajón de Personas (avisar propinas anotadas en los pagos del evento) no está construido: `people` no lee estas tablas. ¿Sigue vigente?

## 13. Archivos clave

**Motor**
- `api-rest/src/payments/payments.controller.ts`
- `api-rest/src/payments/payments.service.ts` (`createPaymentPlan`, `createOverflowPaymentTransaction`, `createOrUpdatePaymentTransaction`, `normalizePaymentAfterTransactions`, `updatePaymentSchedule`, `fechaDelUltimoAbono`, `updateOverduePayments`)
- `api-rest/src/payments/payments.repository.ts`
- `api-rest/src/payments/payments-cron.service.ts`
- `api-rest/src/payments/constants/index.ts` (estados e hitos anti-spam)
- `api-rest/src/payments/dto/` (`create-payment-plan`, `create-payment-transaction`, `create-overflow-transaction`, `update-payment-schedule`, `update-payment-transaction`, `create-payment`, `update-payment`)
- `api-rest/src/payments/interfaces/payments.types.ts`, `api-rest/src/payments/entities/payment.entity.ts`
- `api-rest/src/refunds/refunds.controller.ts`, `refunds.service.ts`, `refunds.repository.ts`, `dto/register-refund.dto.ts`
- `api-rest/src/quotations/portal.controller.ts`
- `api-rest/src/quotations/portal-receipts.controller.ts` (controller y `PortalReceiptsRepository`)
- `api-rest/src/quotations/quotations.service.ts` (`getPortalData`, `getPortalQuotation`, `submitPortalReceipt`, `mandanteOf`, cascada y guardia en `update`)
- `api-rest/src/quotations/quotations.repository.ts` (`findPortalContact`, `findAllByContact`, `answeredSurveys`, `findContactById`, `findContactPortalToken`, freno del borrado)
- `api-rest/src/quotations/hoja-publica.ts` (`listaBlancaDeHoja`)
- `api-rest/src/clients/client-contacts.controller.ts` (nacimiento de `portal_token`)
- `api-rest/src/storage/storage.service.ts` (kinds de comprobantes, balde privado)
- `api-rest/src/email/email.service.ts`, `api-rest/src/email/templates/brandLayout.ts`, `api-rest/src/email/templates/payment*/`, `api-rest/src/email/templates/portalReceipt/admin.ts`
- Pruebas: `api-rest/src/payments/tests/`, `api-rest/src/refunds/tests/`, `api-rest/src/quotations/tests/unit/quotations.service.spec.ts`, `api-rest/src/quotations/tests/unit/candado-evento-realizado.spec.ts`
- Migraciones: `docs/migrations/7_refunds_rich_columns.sql`, `9_storage_payment_receipts_bucket.sql`, `42_storage_candado.sql`, `46_datos_cobro_empresa.sql`, `47_portal_token.sql`, `48_portal_del_mandante.sql`, `49_comprobantes_portal.sql`, `50_correos_a_personas.sql`, `58_limpia_portal_token_de_cotizaciones.sql`, `66_indices_de_consultas_calientes.sql`, `102_unificar-medios-de-pago.sql`

**App**
- `frontend/src/components/PaymentPlanEditor.tsx`
- `frontend/src/components/AvisoPlanDePagos.tsx`
- `frontend/src/services/payments.service.ts`
- `frontend/src/services/paymentTransactions.service.ts`
- `frontend/src/services/refunds.service.ts`
- `frontend/src/services/portalReceipts.service.ts`
- `frontend/src/services/storage.service.ts` (`uploadPaymentReceipt`, `uploadRefundReceipt`)
- `frontend/src/types/payments.types.ts`, `frontend/src/types/refunds.types.ts`
- `frontend/src/pages/portal/PortalPage.tsx`
- `frontend/src/pages/postventa/PostVentaPage.tsx` (`fetchEvents`, `cuotaStatus`, bandeja de comprobantes, `EventModal`, `RegistrarPagoPanel`, `EditRegistroModal`, `ReembolsosManager`, `RefundRow`)
- `frontend/src/pages/postventa/ServiciosTab.tsx` (`planVivo`)
- `frontend/src/pages/quotations/QuotationsPage.tsx` (`applyStatusChange`, `handlePaymentPlanSave`)
- `frontend/src/pages/quotations/NegocioPage.tsx` (`cambiarEstado`, `guardarPlan`)
- `frontend/src/pages/quotations/QuotationForm.tsx` (aviso ámbar)
- `frontend/src/pages/dashboard/DashboardPage.tsx` (fila HOY)
- `frontend/src/constants/api.routes.ts` (`PAYMENTS*`, `REFUNDS*`, `PORTAL`, `PORTAL_RECEIPTS`), `frontend/src/constants/permissions.ts` (`SECTION_ROLES.payments`)
- `frontend/src/App.tsx` (rutas `/portal/:token`, `post-venta`, `post-venta/:id`)
