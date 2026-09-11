# Mapa: Cotizador

> **Estado: verificado una vez contra el código** (commit 0de0ddb, 11-09-2026). Falta la etapa de completar lo que no quedó escrito. Parte del atlas de docs/arquitectura/mapa; el índice es 00_MAPA_DEL_SISTEMA.md.

## 1. Qué hace

El cotizador es la hoja donde se arma el precio de un evento. Vendedor, operaciones o administrador eligen cliente y mandante (la persona que encarga), tipo de evento, fechas y asistentes (adultos y niños). Después llenan **casillas** de servicios variables (se cobran por persona: categoría, audiencia, personas y día) y los **servicios fijos** del evento (salón, audiovisual, decoración). La pantalla calcula en vivo subtotal, descuento, neto, IVA, propina y total. A operaciones y administrador les muestra además un margen estimado con las recetas de Logística. Se usa en la pre-venta (cotización nueva, requerimiento convertido, duplicado, consulta convertida) y, con restricciones, cuando ya está aceptada: ahí los cambios de total mueven solos el plan de pagos. Un evento realizado queda congelado. El módulo incluye también la puerta pública: el formulario web donde un cliente pide cotización y el motor crea un requerimiento (o una consulta del embudo).

## 2. Pantallas y rutas de la app

| Ruta de la app | Componente principal | Archivo | Qué hace el usuario ahí | Rol que la ve |
|---|---|---|---|---|
| `/quotation-form` | `QuotationForm` | `frontend/src/pages/quotations/QuotationForm.tsx` | Crea una cotización: de cero, con el cliente puesto desde la ficha 360 (`location.state.clientId`), duplicando otra (`duplicateFrom`) o convertida desde una consulta (`desdeConsulta`) | `SECTION_ROLES.quotations_edit` = vendedor, operaciones, administrador (`frontend/src/App.tsx` + `PermissionGuard`) |
| `/quotation-form/:id` | `QuotationForm` | mismo archivo | Edita una cotización o convierte un requerimiento en cotización. Aplica el modo restringido: aceptada sin rol suficiente, o realizada | mismo rol |
| `/public-quotation/:company_id` | `CreateQuotationPublic` | `frontend/src/pages/quotations/CreateQuotationPublic.tsx` | Un visitante sin sesión pide cotización (datos, organización, tipo, fecha, adultos, niños, presupuesto) | Público, sin guardia |
| (dentro del cotizador) | `MenusGuardados` | `frontend/src/pages/quotations/MenusGuardados.tsx` | Panel "Usar un menú guardado de esta categoría…": elegir, renombrar con lápiz, eliminar | igual al cotizador |
| (dentro del cotizador) | `SelectorDePaquetes` | `frontend/src/components/selects/SelectorDePaquetes.tsx` | "Partir de un paquete": buscar, cargar, eliminar, crear nuevo | igual |
| (dentro del cotizador) | Modal "Crear paquete" con `PkgMenusPicker`, `PkgFijosPicker` | `frontend/src/pages/quotations/PkgMenusPicker.tsx`, `PkgFijosPicker.tsx`, `paqueteFijos.ts` | Armar un paquete con menús, servicios sueltos y fijos | igual |
| (dentro del cotizador) | `FijoDeCategoria` / `QuitarFijo` | `frontend/src/components/FijoDeCategoria.tsx` | Sello «fijo» y la ✕ para quitar un fijo de categoría solo en esta cotización | igual |
| (dentro del cotizador) | `AvisoPlanDePagos` | `frontend/src/components/AvisoPlanDePagos.tsx` | Aviso ámbar: la cotización aceptada ya tiene cuotas y el guardado las ajustará | igual |

Entradas al cotizador desde otras pantallas: `QuotationsPage` (botón nueva, `navigate("/quotation-form")`), `ClientDetailPage` (nueva, duplicar, editar), `ConsultasPage` (convertir), `RequestsPage` (`/quotation-form/${request.id}`) y `AnswersView` de encuestas (lo abre en otra pestaña). El tablero, la ficha del negocio (`/negocio/:id`) y la hoja de impresión (`/imprimir/:token`) están en `02_NEGOCIO_ENVIO_Y_SEGUIMIENTO.md`.

## 3. Endpoints del motor

**Propios del cotizador** (`api-rest/src/quotations/quotations.controller.ts`):

| Método y ruta | Controller y método | Service | Quién lo llama desde la app | Roles o @Public |
|---|---|---|---|---|
| `POST /quotations` | `QuotationsController.create` | `QuotationsService.create` | `createQuotation` (`services/quotations.service.ts`) desde `QuotationForm.handleSubmit` | Autenticado. Recepción solo puede crear `request_type = requerimiento` (`ForbiddenException` en el controller) |
| `POST /quotations/public/:company_id` | `QuotationsController.createPublic` | `QuotationsService.createPublic` | `createQuotationPublic` desde `CreateQuotationPublic` | `@Public()` + `@Throttle` 10 por minuto |
| `GET /quotations/:id` | `QuotationsController.findOne` | `QuotationsService.findOne` → `QuotationsRepository.findOne` | `getQuotationById` al editar y al duplicar | **`@Public()`** (lo usa la encuesta pública; tiene un TODO para crear otra puerta) |
| `PATCH /quotations/:id` | `QuotationsController.update` | `QuotationsService.update` (candado, verificación de plata, guardia de estados, **cascada**) | `updateQuotation` desde `QuotationForm.handleSubmit`. Por la misma puerta pasan también `QuotationsPage`, `NegocioPage`, `ServiciosTab`, `PostVentaPage`, `EventoCajitas` y `RequestForm` | Autenticado. Recepción solo edita requerimientos (lo revisa el service). Sin `@Roles` |
| `DELETE /quotations/:id` | `QuotationsController.remove` | `QuotationsService.remove` (candado del realizado) → `QuotationsRepository.remove` → `assertDeletable` (privado) | `deleteQuotation` desde el botón Eliminar del cotizador (la pantalla lo muestra solo a administrador) | Autenticado, **sin `@Roles`** en el motor |
| `GET /quotations/check-conflicts` | `QuotationsController.checkConflictsWithExistingQuotations` | `QuotationsService.checkConflictsWithExistingQuotations` | `checkConflictsWithExistingQuotations` desde el hook `useDateAvailability` | Autenticado |

`GET /quotations` (`findAll`) y las rutas `realizado`, `volver-a-pendiente`, `cosecha`, `enviar-correo` e `imprimir/:token` están en el mismo controller, pero el cotizador no las llama: se documentan en 02, 04 y 14.

**De otros módulos que el cotizador consume:**

| Método y ruta | Controller y método | Service | Quién lo llama desde la app | Roles o @Public |
|---|---|---|---|---|
| `GET /services` | `ServicesController.findAll` | services | `findAllServices` vía hook `useServices` | Autenticado, sin `@Roles` (ver 05) |
| `GET /services/fixed-sections` | `ServicesController.listFixedSections` | services | `getFixedSections` (query `["fixedSections"]`) | Autenticado, sin `@Roles` |
| `GET /sections` | `sections.controller.ts` (`@Controller('sections')`) | sections | `getCategorySections` | `RECEPTION_AND_UP` |
| `GET/POST/PATCH/DELETE /service-groups` | `service-groups.controller.ts` (`findAll`, `create`, `rename`, `remove`) | service-groups | hook `useServiceGroups` (`saveGroup`, `renameGroup`, `removeGroup`) | GET sin `@Roles`; escritura `SALES_AND_UP` |
| `GET/POST/DELETE /service-group-collections` | `service-group-collections.controller.ts` | service-group-collections | hook `useServiceGroupCollections` | GET sin `@Roles`; escritura `SALES_AND_UP` |
| `GET /logistics/base-catalogo` | `LogisticsController.baseCatalogo` | logistics | `getBaseCatalogo` para el cuadro Margen y costos (solo lo pide con rol admin u operaciones) | `SALES_AND_UP` (ver 06) |
| `GET /event-types` y `GET /event-types/public/:companyId` | `event-types.controller.ts` (`listar`, `listarPublico`) | consultas | `eventTypesQueryOptions` (cotizador) y `getEventTypesPublic` (formulario público) | Autenticado / `@Public` + throttle 30 por minuto (ver 11) |
| `GET/POST /client-contacts`, `POST /clients`, `GET /clients` | controllers de clientes | clients | `getClientContacts`, `createClientContact`, `createClient`, `clientsQueryOptions` | ver 09 |
| `GET /payments?quotationId=` | payments | payments | `getPaymentsByQuotationId` dentro de `AvisoPlanDePagos` | ver 03 |

## 4. Tablas de la base de datos

| Tabla | Qué guarda | Lee o escribe | Migración que la crea o modifica |
|---|---|---|---|
| `quotations` | Cabecera de la cotización y la **foto** `items` (jsonb) con cajas variables y fijos | Lee y escribe | Crea: `0_initial_models.sql` (foto de contexto). Modifican: `6_discount_amount` (`discount_amount`), `27_multi_day_events` (`event_end_date`), `32_children_and_tip` (`children_count`, `tip_percentage`), `33_quotation_contact_name`, `37_tip_amount`, `38_numero_cotizacion_unico` (UNIQUE `company_id, quotation_number`), `48_portal_del_mandante` (`client_contact_id`), `50_correos_a_personas` (relleno), `51_seguimiento_sent_at` (`sent_at`), `61_motivo_perdida`. Otras columnas son de 02, 06 y 14 |
| `company_quotation_counters` + función `next_quotation_number` | Contador atómico de números por empresa | Escribe (vía RPC) | `38_numero_cotizacion_unico.sql` |
| `clients` | El cliente; `createPublic` lo crea si no calza por correo | Lee y escribe (vía `ClientsService`) | `0_initial_models.sql` (ver 09) |
| `client_contacts` | Mandantes del cliente; `resolveContactId` calza por nombre; lleva `portal_token` | Lee; el cotizador crea personas vía `/client-contacts` | `34_client_contacts`, `48_portal_del_mandante`, `50_correos_a_personas` |
| `variable_services`, `fixed_services` | Catálogo con precio, tipo de cálculo, `section_id` y `no_cost` | Lee | `4_service-active-flags`, `12_fixed_service_costs`, `53_secciones_servicios_fijos`, `57_servicios_sin_costo` (ver 05) |
| `service_categories`, `variable_service_categories` | Categorías y el vínculo servicio↔categoría con orden y `section_id` | Lee | `4_service-active-flags` (crea `service_categories`), `5_multicategory` (crea `variable_service_categories`), `24_category_sections` |
| `category_sections` | Secciones de una categoría; `is_default` marca la **sección fija** | Lee | `24_category_sections`, `25_default_section` |
| `fixed_service_sections` | Secciones de los servicios fijos | Lee | `53_secciones_servicios_fijos` |
| `service_groups`, `service_group_items` | Menús guardados (categoría + ítems con cantidad) | Lee y escribe desde el cotizador | `1_service-groups`, `2_add_constraint_name_company_id_on_service_group` |
| `service_group_collections`, `service_group_collection_items`, `service_group_collection_services`, `service_group_collection_fixed_services` | Paquetes: menús, servicios sueltos y fijos | Lee y escribe desde el cotizador | `3_service-group-collections`, `67_paquetes_con_servicios_sueltos`, `100_paquetes-con-fijos` |
| `event_types` | Catálogo vivo de tipos de evento con su `entrada` (cotización o consulta) | Lee | `105_tipos_de_evento` (ver 11) |
| `payments`, `refunds` | Cuotas y reembolsos: los mueve la cascada de `update` | Escribe (vía `PaymentsService` / `RefundsService`) | ver 03 y 18 |
| `payment_transactions`, `customer_satisfaction_survey_responses` | Se cuentan para decidir si la cotización se puede borrar; además la guardia de estados y la cascada leen los abonos (`payment_transactions`) de cada cuota | Lee (`assertDeletable`; `findAllPaymentsFromQuotation`) | ver 03 y 14 |
| `service_recipe_items`, `supplies`, `furniture_items`, costos de `fixed_services` | Recetas y costos para el cuadro Margen y costos | Lee (vía `/logistics/base-catalogo`) | `10_logistics_catalogs` (`supplies`), `11_service_recipes` (`service_recipe_items`, `furniture_items`), `12_fixed_service_costs` (ver 06) |
| `consultas` | Si el tipo de evento está en embudo, el formulario público crea una consulta en vez de una cotización | Escribe (vía `ConsultasService.registrar`) | `104_modulo_consultas` (ver 11) |

## 5. Flujos principales

### 5.1 Crear una cotización nueva en el cotizador

1. **Pantalla** `QuotationForm` en `/quotation-form`. Carga el catálogo: `useServices` (`GET /services`, arma `products` con una fila por par servicio-categoría), `getFixedSections`, `getCategorySections`, `useServiceGroups`, `useServiceGroupCollections`, `eventTypesQueryOptions`, clientes y tipos de cliente. `useDateAvailability` consulta `GET /quotations/check-conflicts` al cambiar fechas.
2. **Casillas variables**: al elegir categoría, `updateServiceBox` siembra los servicios de la sección fija (`defaultServicesFor`) y amarra la caja al id de la categoría (`selectedCategoryId`). Los ítems se agregan con `AgregadorDeItems` (`opcionesDe` los agrupa por sección y deja fuera los bloqueados). Audiencia (solo si hay niños), personas (manual o automático) y día (solo si el evento dura más de un día).
3. **Fijos**: `AgregadorDeItems` en la fila vacía que siempre queda al final. `handleFixedServiceSelect` resuelve el precio una sola vez con `calculatePrice` → `resolveFixedServicePrice` (`@dinero`).
4. **Totales en vivo**: `computeTotals` → `computeMoney(buildItemsSnapshot(), …)`; `calculateTotals` los pinta en `formData`.
5. **Guardar** (`handleSubmit`): exige el mandante (`contact_name`), vuelve a calcular con `computeTotals()`, arma `editableFields` y llama a `createQuotation` → `POST /quotations`.
6. **Motor**: el controller frena a recepción si no es requerimiento → `QuotationsService.create` → `assertMoneyMatches` (`verifyMoney`) → `QuotationsRepository.nextQuotationNumber` (RPC `next_quotation_number`) → `getEventDateUtc` (fecha a medianoche UTC) → `resolveContactId` (calce del mandante por nombre) → `QuotationsRepository.create` (insert en `quotations`). `payment_plan_type` se fuerza a `default`.
7. **Efectos**: ningún correo al crear. La app llama a `olvidarFiltrosTablero(user.id)` para que la tarjeta nueva se vea en el tablero, y a `volver()`.

### 5.2 Editar una cotización (incluye convertir un requerimiento)

1. `/quotation-form/:id` → `getQuotationById`. `loadExistingItemsFromJSON` rehace las cajas. Un `people` guardado igual al total de su audiencia se toma como automático; distinto, como ajuste manual.
2. `isRestrictedEditing`: realizada = congelada para todos; aceptada = solo administrador u operaciones editan (esa regla es solo de pantalla). Si venía de requerimiento (`isFromRequirement`), se guarda con `request_type = cotizacion`. El estado se guarda tal como está en el formulario (`estadoAlGuardar`).
3. `updateQuotation` → `PATCH /quotations/:id` → `QuotationsService.update`, en este orden:
   1. `findOne(id)` (sin filtro de empresa).
   2. **Candado del evento realizado**: si el estado guardado es `realizada` → 400 `EVENTO_REALIZADO_CONGELADO`, incluso para el administrador.
   3. **Recepción**: si el rol es recepción y la fila no es requerimiento → 403.
   4. **Verificación de plata**: si el parche toca ítems, montos, personas o niños, `assertMoneyMatches` mezcla lo que llega con lo guardado y rechaza si no calza al peso.
   5. **Guardia de estados**: pasar de aceptada, realizada o cancelada a solicitada, enviada, en negociación o rechazada solo se permite sin plata registrada; en ese caso `PaymentsService.deletePaymentPlan` borra el plan completo.
   6. **Cascada del plan de pagos** si el estado guardado es `aceptada` (flujo 5.3).
   7. Si pasa a `enviada` desde otro estado: correo `QUOTATION_IS_SENT` al mandante (`resolveRecipient`; sin mandante con correo no sale nada).
   8. Si viene `contact_name`: se recalcula `client_contact_id`. Luego, si pasó a `enviada`, se sella `sent_at`.
   9. `QuotationsRepository.update` con `.eq('company_id', companyId)`.

### 5.3 La CASCADA del plan de pagos (dentro de `QuotationsService.update`)

Es la regla que mantiene cuadradas las cuotas cuando se cambia el total de una cotización **aceptada**. El detalle del plan, las cuotas y los reembolsos está en `03_PAGOS_REEMBOLSOS_Y_PORTAL.md`.

- **Cuándo corre**: si el estado **guardado** es `aceptada` y el parche trae `total_amount` distinto de cero y distinto del guardado. Solo mira cuotas `PENDIENTE` o `VENCIDO` (`paymentsService.findAllPaymentsFromQuotation([id], companyId, [PENDIENTE, VENCIDO])`).
- **Si el total baja** (`amountToReduce = viejo − nuevo`):
  - Sin cuotas pendientes → `refundsService.create({ amount, quotation_id })`: nace un reembolso por la diferencia.
  - Con cuotas pendientes → las recorre **desde la última** (`[...payments].reverse()`). Si lo pendiente de la cuota alcanza, la cuota baja en `amountToReduce` y termina. Si no, la cuota queda en lo ya abonado (`amount − pendiente`) y sigue con la anterior. Lo que sobre al final se convierte en reembolso.
- **Si el total sube** (`amountToCharge = nuevo − viejo`):
  1. **Compensación (TAREA #42)**: primero consume los reembolsos **pendientes** de la cotización, del más antiguo al más nuevo (`findPendingByQuotation`; `updateAmount` si alcanza, `remove` si se agota). Así nunca conviven "te debo" y "me debes". Los reembolsos ya pagados no se tocan.
  2. Lo que queda: si hay cuotas pendientes, se agranda la **última**; si no hay, `paymentsService.createPayment` crea una cuota nueva con la nota `'Pago creado por diferencia de total_amount'` (vence 7 días después del evento, según `createPayment`).
- **Ejemplo**: total $1.000.000, cuotas pendientes #2 $300.000 y #3 $300.000, sin abonos. Si el total pasa a $900.000, #3 queda en $200.000. Si pasa a $500.000, #3 queda en $0 y #2 en $100.000.
- **Antes de guardar**: la cascada corre antes de `QuotationsRepository.update` y sin transacción.
- **Aviso en pantalla**: `AvisoPlanDePagos` la anuncia en el cotizador y en Post-Venta (caso 501, 06-09).
- **Quién la esquiva a propósito**: `EnvioCotizacionService` marca `enviada` directo con `quotationsRepository.update` para no dispararla (doc 13). El plan nace en `PaymentsService.createPaymentPlan`: exige que las cuotas calcen con el total actual y pone la cotización en `aceptada`, salvo que ya esté realizada (ver 03).

### 5.4 Menús guardados y paquetes dentro del cotizador

1. **Guardar como menú**: `openSaveGroupModal` → `confirmSaveGroup` traduce cada `codigo` a `variable_service_id` → `saveGroup` (`POST /service-groups`) con el nombre **vigente** de la categoría (`nomCat`).
2. **Usar un menú**: `MenusGuardados` muestra los menús de la categoría de la caja en orden alfabético, como "nombre · precio por persona" (`precioPorPersonaDe`). Elegir → `loadGroupIntoBox`: reemplaza los servicios de la caja, conserva día, audiencia y personas, y repone los fijos de sección que falten (`buildBoxFromGroup`). Renombrar → `PATCH /service-groups/:id`; eliminar → `DELETE` con `ConfirmInline`.
3. **Crear paquete**: modal `Modal` con `PkgMenusPicker` (menús), servicios sueltos (`SelectWithSearch`) y `PkgFijosPicker` → `confirmCreateCollection` → `saveCollection` (`POST /service-group-collections` con `items`, `services` y `fixed_services`). El botón exige al menos un menú, igual que el motor (`@ArrayNotEmpty()` en `items` de `CreateServiceGroupCollectionDto`).
4. **Aplicar paquete**: `SelectorDePaquetes` pide confirmación si ya hay servicios → `loadCollectionAsBoxes` **agrega** sin borrar:
   - una caja por menú, con precios vivos;
   - una caja por categoría para los sueltos;
   - los fijos con `fijosDelPaquete` (precio de hoy; si un fijo salió del catálogo, se salta).
   Borra solo las cajas en blanco y deja un chip por paquete aplicado (`paquetesAplicados`).

### 5.5 Cotización pública creada desde el formulario

1. `/public-quotation/:company_id` → `CreateQuotationPublic`. Tipos desde `getEventTypesPublic` (respaldo: `Object.values(EventType)`). Pide adultos y niños por separado y los suma en `people_count`. Pide la organización (obligatoria si el tipo de cliente no es particular) y un presupuesto opcional. Luego `createQuotationPublic` → `POST /quotations/public/:company_id`.
2. `QuotationsService.createPublic`:
   1. Anexa "Presupuesto estimado: $…" a las observaciones.
   2. `consultasService.embudoPara(company, event_type)`: si el tipo va al embudo, `consultasService.registrar` y responde `{ tipo: 'consulta', id }`, sin cliente ni cotización (ver 11).
   3. Si no: `clientsService.findMatch` **solo por correo**. Sin calce, crea el cliente con nombre = organización (o la persona) y `contact_person` = la persona.
   4. Arma un `CreateQuotationDto` como `requerimiento` / `solicitada`, con `contact_name` = la persona y observaciones con el prefijo `[Desde formulario publico] --- `.
   5. Llama a `this.create(…, userId undefined)`. Sin ítems ni montos, `hasMoneyToVerify` la deja pasar.
3. **Efectos**: correos `NEW_PUBLIC_QUOTATION_CLIENT` (con el `portal_token` del contacto vinculado) y `NEW_PUBLIC_QUOTATION_ADMIN` a todos los administradores, con los datos de la solicitud. Los dos van con `void`. El requerimiento aparece en `RequestsPage` y se convierte con el flujo 5.2.

### 5.6 El cuadro Margen y costos

1. Se ve solo si `puedeVerMargen` (administrador u operaciones). La query `["logistica","compras","base", company.id]` trae `getBaseCatalogo`, con caché compartido con Compras y el Dashboard.
2. `margenCotizador`: `buildConsolidationContext` + `consolidateEvent(buildItemsSnapshot(), people_count, ctx, acc)` → costo = `costoInsumos + costoFijos`. `sinReceta` = `acc.noRecipe` menos los servicios marcados sin costo (`nameIds.sinCostoVariable`).
3. En pantalla: venta = total − propina; margen y porcentaje; "margen sin descuento" si hay descuento; aviso ámbar si hay servicios sin receta. Es una estimación de catálogo: no escribe nada.

## 6. Reglas de negocio acordadas

1. **La cuenta es UNA** (Fase 1.2, 27-07-2026). La fórmula vive en `api-rest/src/quotations/utils/money.ts` (`computeMoney`) y la app la importa tal cual con el alias `@dinero` (`frontend/vite.config.ts`, `frontend/tsconfig.json`). Es la misma para el cotizador, Post-Venta y el motor:
   - variables = Σ por caja (Σ precio × cantidad) × personas de la caja;
   - fijos = Σ precio × cantidad;
   - descuento por % (tope 100) o por monto (tope el subtotal); solo el modo activo viaja con valor;
   - propina = variables × % (tope 100);
   - total = subtotal − descuento + propina.
   Cantidad 0 o ausente vale 1 (`qty`).
2. **La casa rehace la cuenta y rechaza lo que no calza al peso** (27-07). Evidencia: `QuotationsService.assertMoneyMatches`, `verifyMoney`. En modo % el `discount_amount` viaja en 0.
3. **Los totales se calculan al guardar, no se leen del estado** (25-07). Si se guardaba entre tecla y efecto, quedaba el % nuevo con el total viejo: "le pasó a la 248 de Valle del Sol, y a otras tres". Evidencia: comentario de `computeTotals` y de `handleSubmit`.
4. **`people_count` es el TOTAL; `children_count` es un subconjunto** (migración 32). Cada caja multiplica por **su** audiencia, o por su ajuste manual. Una caja vieja sin `people` usa el total del evento (regla anterior al Cotizador 2.0). Evidencia: `boxPeople` en `QuotationForm` y en `money.ts`.
5. **`value_per_person`** = valor por adulto de las cajas de adultos que cubren a todos los adultos (`computeMoney`).
6. **La propina pasa por la empresa pero no es venta ni margen** (Felipe, 24-07). Va sobre los variables, sin IVA, y se suma al final. **Se guarda el monto** (`tip_amount`, 25-07, migración 37): "el monto es el hecho". `tip_percentage = null` = sin propina. Evidencia: `api-rest/src/quotations/utils/tip.ts`, `frontend/src/utils/quotationMoney.ts`.
7. **Neto e IVA se calculan sobre el total sin propina** (total con IVA / 1,19). Evidencia: bloque "Total con IVA" del resumen en `QuotationForm`.
8. **Descuento máximo por rol**: administrador 40 %, vendedor y operaciones 15 %, recepción 0. El tope en pesos es el mismo % sobre el subtotal. Evidencia: `getMaxDiscountForRole`, `getMaxDiscountAmount`. Solo lo aplica la pantalla (ver sección 8).
9. **El mandante es obligatorio** (Felipe, 07-08). Sin él no se sabe a quién llamar, el seguimiento no tiene destinatario y "correos a personas y punto" (30-07). Evidencia: `handleSubmit`.
10. **Sección fija de categoría**: sus ítems entran solos al elegir la categoría y van con candado (`QuantitySelector` con `min=1`, `isLockedService`). **Excepción** (Felipe, 09-09, caso CCU #408): "el 99% de las veces" deben quedar; se quitan **solo en esta cotización**, con `ConfirmInline`, sin tocar el catálogo, y la próxima casilla los vuelve a traer. La ✕ va "donde mismo van las otras, al lado del dinero". Evidencia: `FijoDeCategoria.tsx`, `quitarFijo`.
11. **Una caja no cambia de categoría**: "se borra la caja y se hace otra". Evidencia: `disabled={box.selectedCategory !== "" …}` en el selector de Categoría.
12. **La caja apunta al id de la categoría, no al nombre** (Felipe, 06-08: "así no importa cómo la llame"). Orden de búsqueda: id → nombre exacto → nombre normalizado. Evidencia: `frontend/src/utils/categoriaCaja.ts`, `category_id` en `buildItemsSnapshot`.
13. **Categorías inactivas** no se ofrecen, salvo la ya elegida en la caja. Los servicios inactivos no se ofrecen. Evidencia: filtro `inactiveCategorySet`, `is_active !== false`.
14. **El precio de un fijo se resuelve al agregarlo y queda como hecho**, según su tipo: `fijo`, `fijo_variable` o `variable_con_limites`. Las fotos anteriores al 24-07 con precio 0 y tarifa por persona se resuelven al calcular. Evidencia: `resolveFixedServicePrice`, `fixedPrice` en `money.ts`.
15. **Fijos ordenados por la sección del catálogo**, con la fila de selección siempre al final (Felipe, 30-07). Evidencia: `fixedOrderOf`, efecto que llama a `addNewFixedServiceSlot`.
16. **Eventos de varios días**: `eventDaysCount` (máximo 60). Los variables parten en Día 1; los fijos en 0 = "todo el evento". Al guardar, el día se topa al rango. Evidencia: `buildItemsSnapshot`.
17. **El evento realizado se congela** (Felipe, 13-08): "El realizado es un estado de que YA SE HIZO". No se editan ítems, montos, propina, personas ni fecha, y no se borra, ni siquiera el administrador. La cobranza, el seguimiento, los documentos, la encuesta y la cosecha siguen vivos. Evidencia: `EVENTO_REALIZADO_CONGELADO` en `constants/constants.ts`, `QuotationsService.update` y `remove`, `frontend/src/utils/eventoCongelado.ts`.
18. **Aceptada**: en pantalla solo administrador y operaciones editan. Evidencia: `isRestrictedEditing` y el banner "Acceso Denegado".
19. **Recepción trabaja requerimientos, no cotizaciones**: al crear (28-07, controller) y al editar (12-08, service). La ruta del cotizador pide `quotations_edit` (12-08): "Recepción mira; no edita". Evidencia: `QuotationsController.create`, `QuotationsService.update`, `frontend/src/constants/permissions.ts`.
20. **Nadie fuerza "enviada" al guardar** (Felipe, 18-08): "debería quedar en solicitada hasta que se envíe". Evidencia: `estadoAlGuardar` en `frontend/src/utils/estadoCotizacion.ts`.
21. **El número lo entrega la base, atómico por empresa** (migración 38). Evidencia: `QuotationsRepository.nextQuotationNumber`.
22. **Choque de fechas por rango**: cuentan las solicitadas, enviadas, en negociación y aceptadas, sin contar la que se está editando (Felipe, 18-08: "el requerimiento se cuenta a él solo"). Evidencia: `QuotationsService.checkConflictsWithExistingQuotations` y el comentario de `exclude_id` en `check-conflicts-with-existing-quotations.dto.ts`.
23. **Un paquete es una plantilla que suma, no reemplaza** (Felipe, 14-08): "un grupo de quince días puede armarse con dos paquetes de siete y uno de tres". Lleva servicios sueltos (13-08, migración 67) y fijos con el precio de hoy (28-08, migración 100); lo elegido conserva el orden de selección (28-08). Evidencia: `loadCollectionAsBoxes`, `paqueteFijos.ts`.
24. **Menús guardados**: "el nombre, un punto y el precio" (Felipe, 09-09), orden alfabético, renombrar con lápiz. Evidencia: `MenusGuardados.tsx`.
25. **El margen solo lo ven operaciones y administrador** (Felipe, 24-07). Es un costo estimado de catálogo, sin propina. Los servicios "sin costo en Eventia" no cuentan como sin receta (Felipe, 09-09, #516). Evidencia: `puedeVerMargen`, `margenCotizador`.
26. **Formulario público**:
   - correo y teléfono obligatorios también en la API (30-07, `CreateQuotationPublicDto`);
   - calce anti-duplicados **solo por correo** (22-07, afinado 05-09: "la gente cambia de empresa o colegio y conserva su número");
   - la organización nombra al cliente y la persona queda como contacto (05-09);
   - el presupuesto va dentro de las observaciones (05-09);
   - el tipo de evento decide si entra al embudo (doc 12).
27. **Una cotización con plata no se borra** (26-07). Los mensajes van por orden de gravedad: transacciones, reembolsos, plan de pagos, encuesta respondida. Evidencia: `QuotationsRepository.assertDeletable`.
28. **Duplicar copia todo menos la fecha** y nace como cotización `solicitada`. Evidencia: rama `duplicateFrom` del efecto de carga.
29. **Las fechas de evento se guardan a medianoche UTC** (`getEventDateUtc`) y se leen en UTC. Leerlas en hora chilena las corre un día (bug #423). Evidencia: `frontend/src/utils/dates.ts`.

## 7. Conexiones con otros módulos

**A quién usa el cotizador:**
- **Catálogo** (`05_CATALOGO_DE_SERVICIOS.md`): `useServices`, secciones de categoría y de fijos, `useServiceGroups`, `useServiceGroupCollections`, `SelectorDePaquetes`.
- **Clientes** (`09_CLIENTES.md`): lista de clientes, modal "Crear Nuevo Cliente" (`createClient`), personas (`getClientContacts`, `createClientContact`); `createPublic` usa `ClientsService.findMatch` y `create`.
- **Logística** (`06_LOGISTICA_COMPRAS_E_INVENTARIO.md`): `getBaseCatalogo` y `utils/eventConsolidation.ts` para el margen.
- **Pagos** (`03_PAGOS_REEMBOLSOS_Y_PORTAL.md`): la cascada y la guardia de estados usan `PaymentsService` y `RefundsService`; `AvisoPlanDePagos` lee las cuotas.
- **Consultas** (`11_CONSULTAS_Y_FORMULARIOS_PUBLICOS.md`): tipos de evento vivos (`event_types`); `createPublic` bifurca con `ConsultasService.embudoPara`; la conversión llega al cotizador como `location.state.desdeConsulta`.
- **Correos** (`12_CORREOS_INTERNOS_Y_NOTIFICACIONES.md`): `QUOTATION_IS_SENT` (update a enviada), `NEW_PUBLIC_QUOTATION_CLIENT`, `NEW_PUBLIC_QUOTATION_ADMIN`.
- **Acceso** (`15_ACCESO_EMPRESA_USUARIOS_Y_PLANES.md`): `SECTION_ROLES`, `useAuth().userRole`, `getUser` para mostrar quién creó la cotización.
- **Calendario** (`16_CALENDARIO_MOVIL_E_INFRAESTRUCTURA_DEL_MOTOR.md`): el aviso de choque enlaza a `/calendar?date=…&filter=all`.
- **Kit de la casa** (`17_KIT_DE_LA_CASA_Y_BASE_DE_LA_APP.md`): `SelectWithSearch`, `AgregadorDeItems`, `NumberInput`, `QuantitySelector`, `ConfirmInline`, `Modal`, `toast`, `SectionChipSelect`, `humanizeApiError`.

**Quién usa al cotizador:**
- **Ficha, tablero, envío y seguimiento** (02):
  - `QuotationsPage` abre el cotizador y cambia estados por `PATCH /quotations/:id` (dispara la guardia, la cascada y el correo de enviada). Al aceptar sin plan, abre el editor del plan.
  - `NegocioPage` también hace `PATCH`.
  - `EnvioCotizacionService` usa `QuotationsRepository.findOne`, `cartaDelCatalogo` y `update`, esquivando la cascada a propósito.
  - `quotations-cron.service.ts` (seguimiento día 7 y 14) cuenta desde el `sent_at` que sella `update`.
- **Post-Venta** (04): `ServiciosTab` reutiliza `@dinero` (`computeMoney`, `resolveFixedServicePrice`), `FijoDeCategoria` / `QuitarFijo`, `AvisoPlanDePagos` y `useServiceGroups`, y guarda por el mismo `PATCH` (misma cascada). `PostVentaPage` y `EventoCajitas` también hacen `PATCH`.
- **Pagos** (03): `PaymentsService.createPaymentPlan` usa `quotationsService.findOne` y `quotationsRepository.update`; los correos de plata usan `mandanteOf`.
- **Clientes** (09): `ClientDetailPage` abre el cotizador para nueva, duplicar y editar.
- **Encuestas** (14): `customer_satisfaction_survey/service.ts` usa `findOne`; la página pública `PublicSurvey.tsx` llama a `getQuotationById` sin sesión (por eso `GET /quotations/:id` es público); `AnswersView` abre el cotizador.
- **Dashboard y analítica** (13) y **calendario** (16): `QuotationsService.findAll`.

**Efectos automáticos que nacen aquí:**
- La cascada del plan de pagos.
- El borrado del plan en la guardia de estados.
- El correo al pasar a enviada y el sello de `sent_at`.
- El vínculo `client_contact_id` por nombre.
- Los dos correos del formulario público.

El cotizador no tiene relojes propios.

## 8. Zonas de riesgo: si tocas esto, cuidado con aquello

1. **Si tocas** la fórmula de `computeMoney`, **se afecta** a la vez el cotizador, la pestaña Servicios de Post-Venta y la verificación del motor, **porque** la app importa ese mismo archivo por `@dinero`. Una cotización vieja abierta y guardada con la fórmula nueva cambia de total, y si está aceptada mueve las cuotas por la cascada. Evidencia: `api-rest/src/quotations/utils/money.ts`, `frontend/vite.config.ts`, `QuotationForm.computeTotals`, import en `ServiciosTab.tsx`.
2. **Si agregas** un campo nuevo a la cotización, **se afecta** su guardado silencioso, **porque** hay que ponerlo en cinco lugares:
   - el objeto `CreateQuotation` de `QuotationsService.create` (bug del 19-07: "si faltan en el insert, se botan en silencio");
   - `editableFields` de `handleSubmit` (bug del 20-07, niños, propina y contacto perdidos al editar);
   - `COLUMNAS_LISTA` de `QuotationsRepository.findAll` (28-07);
   - el DTO (la whitelist rechaza lo desconocido);
   - el `setQuotation` sintético del modo duplicar.
3. **Si tocas** `QuotationsService.update`, **se afectan** el cotizador, el tablero, la ficha, Post-Venta Servicios y la fecha de cabecera, **porque** es "la puerta ancha" por donde guardan todos. Un cambio de estado puro no debe gatillar plata. Evidencia: comentario del candado en `update`; `EnvioCotizacionService.enviar` la esquiva a propósito.
4. **Si mueves** el cálculo de totales a un efecto o lo lees de `formData` al guardar, **vuelve** el bug de la 248 (porcentaje nuevo con total viejo), **porque** el efecto corre después de pintar. Evidencia: comentarios de `computeTotals` y `handleSubmit`.
5. **Si tocas** `buildItemsSnapshot` o `loadExistingItemsFromJSON`, **se afecta** la distinción entre personas automáticas y manuales, **porque** al cargar, un `people` igual al total de la audiencia se reinterpreta como automático: una caja manual que casualmente coincide pasa a seguir a los contadores. Además la foto la leen Post-Venta, Logística, la hoja PDF y el portal.
6. **Si renombras** categorías o tocas `categoriaCaja.ts`, **se afectan** las cotizaciones guardadas (sin secciones en el documento y con el buscador de ítems vacío), **porque** las fotos viejas solo tienen el nombre (incidente del 06-08). Evidencia: `buscarCategoria`, `nombreVigente`.
7. **Si tocas** el aislamiento por empresa de `update`, **cuidado**: `QuotationsService.update` lee con `findOne(id)` sin comparar `company_id` (a diferencia de `markEventDone` y `setHarvestStatus`). Todo lo que mueve plata corre **antes** de `QuotationsRepository.update` (que sí filtra) y no filtra empresa: `refundsService.create`, `updateAmount` y `remove` (`refunds` no tiene `company_id` propio, comentario en `refunds.repository.ts`); `paymentsService.update` (`updatePayment`, solo `.eq('id')`); `deletePaymentPlan` (`deletePaymentsByQuotationId` recibe `companyId` pero solo filtra `quotation_id`); `createPayment` (lee la cotización con `findOne` sin comparar empresa). `findAllPaymentsFromQuotation` filtra `quotations.company_id` sobre un embebido sin `!inner` (`refunds.repository.ts` sí usa `quotations!inner`), así que no está claro que acote las cuotas. Un parche con el id de otra empresa podría mover su plan o sus reembolsos aunque el guardado final falle. Verificado leyendo el código, no probado.
8. **Si le quitas** `@Public()` a `GET /quotations/:id`, **se rompe** la encuesta pública (`PublicSurvey.tsx` llama a `getQuotationById` sin sesión); **si cambias** su respuesta, se rompen además el cotizador y las otras pantallas que usan `getQuotationById`. Si lo dejas como está, **cuidado**: devuelve `*` de `quotations`, costos internos incluidos (`provisioned_cost`), sin la lista blanca de `hoja-publica.ts`. Evidencia: `QuotationsController.findOne`, `QuotationsRepository.findOne`.
9. **Si confías** en los topes de rol del cotizador, **cuidado**: el descuento máximo por rol, la edición de aceptadas solo por administrador u operaciones, y el botón Eliminar solo para administrador existen **solo en la pantalla**. El motor no los valida (`CreateQuotationDto` solo pide `Min(0)`; `update` solo frena realizada y recepción; `remove` no tiene `@Roles`).
10. **Si usas** el modo restringido, **cuidado**: el selector de **Cliente** y "+ Nuevo cliente" no llevan `disabled={isRestrictedEditing}` y el botón Guardar sigue activo. Un vendedor puede cambiar el cliente de una cotización aceptada y guardarla (el motor no lo frena). Evidencia: JSX de "Cliente *" en `QuotationForm`.
11. **Si cambias** los asistentes después de agregar un fijo "por persona", **no se re-precia** el fijo, **porque** `handleFixedServiceSelect` resuelve `precio_calculado` una sola vez y ningún efecto lo recalcula. Evidencia: `handleFixedServiceSelect`, comentario de `resolveFixedServicePrice` ("de ahí en adelante es un hecho guardado").
12. **Si un mismo parche** pasa una aceptada a pre-venta **y** cambia el total, **se afecta** el plan recién borrado, **porque** la cascada evalúa el estado **guardado** (`aceptada`) después de `deletePaymentPlan` y crearía una cuota o un reembolso nuevo. Hoy ninguna pantalla manda esa combinación. Evidencia: orden de pasos en `QuotationsService.update`.
13. **Si la cascada** rebaja una cuota sin abonos por todo lo pendiente (lo que falta rebajar iguala o supera su monto), **queda una cuota en $0** en estado pendiente (con abonos, queda en lo abonado y también sigue pendiente), **porque** la rama `else` hace `amount − pendingAmountToBePaid` y `paymentsService.update` (`updatePayment`) solo cambia el monto: no normaliza el estado. Evidencia: `QuotationsService.update`, `PaymentsService.update`.
14. **Si agregas** más de 8 líneas a `QuotationForm.tsx`, **el portero rechaza** el commit, **porque** está congelado en 3936 líneas y hoy tiene 3928. Hay que extraer la pieza nueva a su propio archivo (patrón higuera). Evidencia: `congelar "src/pages/quotations/QuotationForm.tsx" 3936` en `frontend/scripts/portero-kit-de-la-casa.sh`.
15. **Si cambias** el orden del constructor de `QuotationsService`, **se rompen** las pruebas, **porque** lo arman por posición ("insertarla al medio rompió 34 de una", 05-09). Evidencia: comentario sobre `consultasService` en el constructor.

## 9. Pruebas que lo protegen

- `api-rest/src/quotations/tests/unit/money.spec.ts`:
  - `computeMoney`: sin ítems, cajas × personas + fijos, audiencia niños, descuento % y $, propina, propina null, caja vieja, cantidad ausente;
  - `verifyMoney`: total adulterado, descuento inventado, modo %, propina que no sale de su %;
  - `hasMoneyToVerify`;
  - fotos viejas de fijos por persona.
- `api-rest/src/quotations/tests/unit/quotations.service.spec.ts`:
  - `checkConflictsWithExistingQuotations` con y sin `exclude_id`;
  - `update`: errores de lectura, candado de recepción (cotización, requerimiento, sin rol);
  - aceptada: mismo total; baja sin cuotas → reembolso; sube sin cuotas → cuota nueva; sube con cuotas → agranda la última;
  - `setHarvestStatus`.
- `api-rest/src/quotations/tests/unit/candado-evento-realizado.spec.ts`: el realizado no se edita (propina, montos, fecha, también el administrador), la aceptada sí; las salidas de estado de un realizado se rechazan sin borrar el plan; el borrado (realizado no, en negociación sí, inexistente no revienta, error de lectura no borra, otra empresa); volver a aceptada y cosecha siguen vivos.
- `api-rest/src/quotations/tests/quotations.controller.spec.ts`: solo "should be defined".
- `frontend/src/pages/quotations/paqueteFijos.test.ts`: `fijosDelPaquete` (precio de hoy, fijo fuera del catálogo se salta, paquete viejo sin fijos).
- `frontend/src/utils/quotationMoney.test.ts`: `tipAmountOf` y `saleWithoutTip`.
- `frontend/src/utils/dates.test.ts`: `formatFechaEvento` (la fecha del evento no se corre un día), `formatMomento` (hora chilena), `hoyEnChile`, `hoyEnChileMas`.
- Relacionadas, de otros mapas: `api-rest/src/service-groups/tests/service-groups.service.spec.ts` (05); `SelectWithSearch.test.tsx` y `AgregadorDeItems.test.tsx` (17).

**Lo importante que NO está cubierto:**
- Cascada con cuotas pendientes cuando el total **baja**: el recorrido desde la última y el reembolso por lo que sobra.
- Compensación de reembolsos pendientes (TAREA #42): el mock de `findPendingByQuotation` siempre devuelve `[]`.
- Guardia de estados de post-venta a pre-venta: el 400 con plata y la llamada a `deletePaymentPlan` sin plata. Solo se prueba que **no** se llama con un realizado.
- `assertMoneyMatches` dentro de `update`, mezclando parche y fila guardada.
- `create`: número, `resolveContactId`, `payment_plan_type`. El freno de recepción del controller tampoco tiene prueba.
- `createPublic` completo: embudo, calce por correo, organización, presupuesto, correos.
- `assertDeletable` y sus mensajes (el repositorio va mockeado).
- Correo `QUOTATION_IS_SENT` y el sello de `sent_at`.
- Aislamiento por empresa de `update`.
- Todo `QuotationForm`: no hay pruebas de pantalla para `buildItemsSnapshot`, `loadExistingItemsFromJSON`, sección fija y su excepción, paquetes, margen ni modo restringido.

## 10. Deuda y rarezas conocidas

- **`QuotationForm.tsx` es un gigante**: 3928 líneas, congelado en 3936. Higueras ya extraídas:
  - `MenusGuardados.tsx` (09-09, techo 3945 → 3936);
  - `SelectorDePaquetes.tsx` (03-09);
  - `PkgFijosPicker.tsx`, `PkgMenusPicker.tsx` y `paqueteFijos.ts` (28-08).
- **`quotations.service.ts` tiene 1309 líneas**: mezcla el cotizador con el portal del mandante (`getPortalData`, `getPortalQuotation`, `submitPortalReceipt`), la cosecha y el realizado. Cuenta para el techo de 27 archivos sobre 800 líneas.
- **Modales hechos a mano** dentro de `QuotationForm` ("Crear Nuevo Cliente", "Guardar como grupo", "Nueva persona"), con `fixed inset-0`, pese a la regla del kit `Modal`. Solo "Crear paquete" está migrado. No figuran en la lista de deuda de modales de `CLAUDE.md`.
- **Tipos desactualizados**:
  - tres `TODO` ("use already defined types", "add type") para `SelectedService`, `SelectedFixedService` y `formData`;
  - cuatro `@ts-ignore` (contadores y descuento) y dos `eslint-disable react-hooks/exhaustive-deps`;
  - `quotation.entity.ts` (motor) y `quotations.types.ts` (app) no describen la foto real: faltan `audience`, `people`, `day` y `category_id` en las cajas, y `day` en los fijos.
- **Listener global `mousedown`** que cierra lo que quede fuera de `.dropdown-container`: el comentario de Categoría (13-08) dice que sirve a "los desplegables artesanales que quedan al lado", que ya migraron (14-08), pero sigue siendo lo único que cierra el panel de `MenusGuardados` al pinchar fuera (esa pieza no trae su propio cierre).
- **Parámetro muerto** `_desdeRequerimiento` en `estadoAlGuardar`.
- **`payment_plan_type`**: `create` lo fuerza a `default` e ignora el DTO. `requires_invoice` y `has_contract` viajan en el DTO, pero el cotizador no los edita (solo los copia al duplicar).
- **`CreateQuotationDto.event_type`** tiene `@IsNotEmpty()` repetido. El enum `EventType` sigue siendo el valor inicial del formulario aunque el catálogo es vivo.
- **`CreateQuotationPublicDto`** hereda campos de plata e ítems que `createPublic` ignora: se aceptan en la whitelist y no se usan. Si la API recibe `observations` ausente, el prefijo queda como `[Desde formulario publico] --- undefined`.
- **Correos del formulario público** con `void` dentro de un `try`: un rechazo de la promesa no lo atrapa ese `catch`.
- **Comentario desactualizado en `resolveRecipient`**: dice "cotización sin contacto -> correo del cliente", pero el código devuelve `null` sin respaldo (regla del 30-07). Lo mismo el comentario de `client_has_email` en `markEventDone`.
- **Dos caminos distintos para "enviada"**: el desplegable del tablero manda `QUOTATION_IS_SENT` vía `update`; el botón "Enviar cotización" manda el PDF y marca por repositorio, sin ese correo (doc 13).
- **Respuesta cruda de `GET /quotations/:id`**: devuelve el objeto de Supabase `{ data, error }`, por eso `getQuotationById` lee `response.data`, a diferencia de los demás endpoints.
- **Una cuota puede quedar en $0** tras la cascada (riesgo 13).
- **Neto e IVA a mano** con `/ 1.19` y montos con `toLocaleString`: parte de la tanda C4 del plan de homologación ("5 maneras distintas de redondear").

## 11. Contradicciones entre documento y código

1. **Formulario público, fecha mínima.**
   - Documento: `docs/arquitectura/09_PLAN_DE_HOMOLOGACION.md`, Tanda A1: el formulario público "bloquea el día equivocado" y la decisión de Felipe es que "el mínimo es **hoy + 2** … Usar `hoyEnChileMas(2)`".
   - Código: `CreateQuotationPublic.tsx` sigue con `min={new Date().toISOString().split("T")[0]}` (reloj de Londres, sin +2). `hoyEnChileMas` solo aparece en `utils/dates.ts` y su prueba.
2. **Listas plegables hechas a mano en el cotizador.**
   - Documentos: `09_PLAN_DE_HOMOLOGACION.md` (Tanda C1) lista `QuotationForm` 2908, 3270 y 3625 como listas plegables por migrar; `CLAUDE.md` ("Known debt") dice "`QuotationForm` ×3".
   - Código: Categoría usa `SelectWithSearch` e Ítem y fijos usan `AgregadorDeItems` (comentarios "Migrado a la pieza de la casa (14-08)"), y el portero tiene la regla "lista plegable con buscador a mano" con techo 0.
3. **Respaldo de los tipos de evento.**
   - Documento: `12_MODULO_DE_CONSULTAS.md`: "El cotizador y el formulario público leen el catálogo vivo … el enum del código queda solo como respaldo si el catálogo no responde".
   - Código: el formulario público sí parte con `Object.values(EventType)`; el cotizador no tiene respaldo (`tiposDeEvento = []` y el selector solo muestra `tiposDeEvento.filter(t => t.activo)`).
4. **Dónde vive la cuenta de los totales.**
   - Documento: `CLAUDE.md` presenta `utils/quotationMoney` como "the single source of truth for quotation totals".
   - Código: `frontend/src/utils/quotationMoney.ts` solo tiene la propina (`tipAmountOf`, `saleWithoutTip`); la cuenta de totales vive en `api-rest/src/quotations/utils/money.ts` y la app la importa por `@dinero`, como dicen los comentarios de `vite.config.ts` y `useServices.ts`.
5. **Pruebas del frontend.**
   - Documento: `CLAUDE.md` dice "There is no frontend test suite".
   - Código: `frontend/package.json` tiene `"test": "vitest run"`, existen `paqueteFijos.test.ts`, `quotationMoney.test.ts` y `dates.test.ts`, y `.github/workflows/ci.yml` corre "Pruebas (vitest)".

## 12. Preguntas abiertas

1. `0_initial_models.sql` declara un `CHECK` sobre `quotations.event_type` con los 8 tipos históricos, y ninguna migración de `docs/migrations` lo elimina. Con `event_types` vivo (105), ¿esa restricción sigue en producción? Si sigue, una cotización con un tipo nuevo fallaría al insertar. `0_initial_models` es solo una foto de contexto: hay que medirlo en la base.
2. ¿Cómo se ve y se cobra en Post-Venta una cuota que la cascada dejó en $0 y pendiente? No encontré prueba ni limpieza.
3. ¿Es intencional que el motor no valide el tope de descuento por rol, la edición de aceptadas por vendedor ni el rol para borrar (`DELETE` sin `@Roles`)? Hoy son reglas solo de pantalla.
4. ¿`QuotationsService.update` debería comparar `quotation.company_id` antes de la guardia y la cascada, como hacen `markEventDone` y `setHarvestStatus`? El riesgo 7 está verificado por lectura, no con una prueba.
5. ¿La encuesta pública necesita todas las columnas de `GET /quotations/:id`, o puede pasar a la lista blanca de `hoja-publica.ts`? El TODO del controller lo deja abierto.
6. ¿Es regla deseada que un fijo "por persona" no se re-precie al cambiar los asistentes, o es un descuido? `money.ts` lo trata como "hecho guardado".
7. ¿Cómo reparte `consolidateEvent` las personas: por caja (`people` de la foto) o por el `people_count` total que le pasa el cotizador? No leí su interior (`frontend/src/utils/eventConsolidation.ts`, ver 06).
8. ¿Es intencional que en modo restringido el Cliente siga editable y el botón Guardar activo (riesgo 10)?
9. ¿Algún flujo real manda en un mismo parche un cambio a pre-venta junto con un total distinto (riesgo 12)? No encontré ninguno en las pantallas.

## 13. Archivos clave

### Motor

- `api-rest/src/quotations/quotations.controller.ts` — `create`, `createPublic`, `findOne` (público), `update`, `remove`, `checkConflictsWithExistingQuotations`
- `api-rest/src/quotations/quotations.service.ts` — `create`, `createPublic`, `findOne`, `update` (candado, recepción, verificación, guardia, cascada, correo, `sent_at`), `remove`, `checkConflictsWithExistingQuotations`, `assertMoneyMatches`, `resolveRecipient`
- `api-rest/src/quotations/quotations.repository.ts` — `findOne`, `findAll` (`COLUMNAS_LISTA`), `nextQuotationNumber`, `create`, `update`, `remove`, `assertDeletable`, `resolveContactId`, `findContactPortalToken`, `cartaDelCatalogo`
- `api-rest/src/quotations/utils/money.ts` — `computeMoney`, `verifyMoney`, `hasMoneyToVerify`, `resolveFixedServicePrice` (alias `@dinero` en la app)
- `api-rest/src/quotations/utils/tip.ts` — `tipAmountOf`, `saleWithoutTip`
- `api-rest/src/quotations/constants/constants.ts` — `QuotationStatus`, `RequestType`, `PaymentPlanType`, `EVENTO_REALIZADO_CONGELADO`
- `api-rest/src/quotations/dto/create-quotation.dto.ts`, `update-quotation.dto.ts`, `create-quotation-public.dto.ts`, `check-conflicts-with-existing-quotations.dto.ts`
- `api-rest/src/quotations/entities/quotation.entity.ts`, `interfaces/quotations.interface.ts`, `hoja-publica.ts`
- `api-rest/src/quotations/quotations.module.ts`
- `api-rest/src/utils/dates.ts` — `getEventDateUtc`
- `api-rest/src/payments/payments.service.ts` — `deletePaymentPlan`, `update`, `createPayment`, `createPaymentPlan` (ver 03)
- `api-rest/src/refunds/refunds.service.ts` — `create`, `findPendingByQuotation`, `updateAmount`, `remove` (ver 03)
- Pruebas: `api-rest/src/quotations/tests/unit/money.spec.ts`, `quotations.service.spec.ts`, `candado-evento-realizado.spec.ts`, `api-rest/src/quotations/tests/quotations.controller.spec.ts`
- Migraciones: `docs/migrations/0_initial_models.sql`, `1_service-groups.sql`, `3_service-group-collections.sql`, `5_multicategory.sql`, `6_discount_amount.sql`, `24_category_sections.sql`, `25_default_section.sql`, `27_multi_day_events.sql`, `32_children_and_tip.sql`, `33_quotation_contact_name.sql`, `34_client_contacts.sql`, `37_tip_amount.sql`, `38_numero_cotizacion_unico.sql`, `48_portal_del_mandante.sql`, `50_correos_a_personas.sql`, `51_seguimiento_sent_at.sql`, `53_secciones_servicios_fijos.sql`, `57_servicios_sin_costo.sql`, `67_paquetes_con_servicios_sueltos.sql`, `100_paquetes-con-fijos.sql`, `105_tipos_de_evento.sql`

### App

- `frontend/src/pages/quotations/QuotationForm.tsx` — la hoja: `buildItemsSnapshot`, `computeTotals`, `calculateTotals`, `handleSubmit`, `loadExistingItemsFromJSON`, `updateServiceBox`, `defaultServicesFor`, `isLockedService`, `quitarFijo`, `handleFixedServiceSelect`, `loadGroupIntoBox`, `confirmSaveGroup`, `loadCollectionAsBoxes`, `confirmCreateCollection`, `margenCotizador`, `getMaxDiscountForRole`, `isRestrictedEditing`
- `frontend/src/pages/quotations/MenusGuardados.tsx`, `PkgFijosPicker.tsx`, `PkgMenusPicker.tsx`, `paqueteFijos.ts`, `paqueteFijos.test.ts`
- `frontend/src/pages/quotations/CreateQuotationPublic.tsx`
- `frontend/src/components/FijoDeCategoria.tsx`, `frontend/src/components/AvisoPlanDePagos.tsx`, `frontend/src/components/selects/SelectorDePaquetes.tsx`
- `frontend/src/hooks/useServices.ts`, `useServiceGroups.ts`, `useServiceGroupCollections.ts`, `useDateAvailability.ts`
- `frontend/src/services/quotations.service.ts` — `createQuotation`, `updateQuotation`, `getQuotationById`, `deleteQuotation`, `createQuotationPublic`, `checkConflictsWithExistingQuotations`
- `frontend/src/services/serviceGroups.service.ts`, `serviceGroupCollections.service.ts`, `services.service.ts` (`findAllServices`, `getFixedSections`), `sections.service.ts` (`getCategorySections`), `eventTypes.service.ts`, `clientContacts.service.ts`, `logistics.service.ts` (`getBaseCatalogo`)
- `frontend/src/utils/quotationMoney.ts`, `utils/dates.ts`, `utils/categoriaCaja.ts`, `utils/eventoCongelado.ts`, `utils/estadoCotizacion.ts` (`estadoAlGuardar`), `utils/eventConsolidation.ts`
- `frontend/src/types/quotations.types.ts` — `QuotationFormData`, `QuotationCreateData`, `QuotationFormDataUpdate`, `QuotationPublicFormData`
- `frontend/src/App.tsx` (rutas `quotation-form`, `quotation-form/:id`, `public-quotation/:company_id`), `frontend/src/constants/permissions.ts` (`quotations_edit`), `frontend/src/constants/api.routes.ts`
- `frontend/vite.config.ts` y `frontend/tsconfig.json` (alias `@dinero`), `frontend/scripts/portero-kit-de-la-casa.sh` (techo del gigante)
