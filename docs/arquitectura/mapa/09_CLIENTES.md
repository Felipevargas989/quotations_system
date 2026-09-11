# Mapa: Clientes y contactos

> **Estado: verificado una vez contra el código** (commit 0de0ddb, 11-09-2026). Falta la etapa de completar lo que no quedó escrito. Parte del atlas de docs/arquitectura/mapa; el índice es 00_MAPA_DEL_SISTEMA.md.

## 1. Qué hace

Es la libreta comercial de la empresa. Separa dos cosas: **el cliente**, que es quien compra (un colegio, una empresa, una iglesia o una persona particular), y **sus personas de contacto**, que son quienes hablan por él. Cada evento parte acá: al cotizar se elige el cliente y el **mandante**, que es la persona que encarga ESE evento.

La usan todos los cargos. Recepción busca teléfonos y mira el historial para atender el mostrador. Los vendedores crean clientes y cotizan desde la ficha. Administración mira la **ficha 360**: total cotizado y vendido, conversión, ticket promedio, saldo pendiente, satisfacción y aviso de "cliente dormido". Los **tipos de cliente** (Particulares, Empresas, "Club Adulto Mayor", etc.) son un catálogo que arma cada empresa.

Desde el 30-07-2026 rige "correos a personas y punto": la correspondencia de cotizaciones, pagos, encuestas y seguimiento se le escribe a la persona, no a la ficha. Cada persona que crea el motor nace además con su enlace secreto al portal (`portal_token`).

## 2. Pantallas y rutas de la app

| Ruta de la app | Componente principal | Archivo | Qué hace el usuario ahí | Rol que la ve |
|---|---|---|---|---|
| `/clients` | `ClientsPage` | `frontend/src/pages/ClientsPage.tsx` | Lista con buscador (por nombre, tipo, el espejo de la ficha y todas las personas con sus correos, vía `matchesSearch`), filtro de **segmento comercial** (`MultiSelect`) y **chips de tipo con su conteo** (cada chip filtra). Columnas fijas: Cliente con su contacto (`principalDe`), Tipo, Contacto (correo y teléfono), N° de cotizaciones. Al pinchar la fila se abre la ficha. Los filtros de tipo y segmento quedan guardados por usuario en `localStorage`; la búsqueda también se guarda, pero con una clave común (`eventia_clients_search`), no por usuario | todos (`SECTION_ROLES.clients` = `ALL_ROLES`) |
| `/clients` (vista "Nuevo Cliente", estado `showForm`) | `ClientsPage` | mismo archivo | Formulario **solo para crear**: nombre, tipo (`SelectWithSearch`), persona principal con correo y teléfono, notas. Abajo del tipo va el panel "Gestionar tipos…": crear, subir y bajar con ↑↓, y eliminar los que no tienen clientes (`ConfirmInline`) | todos |
| `/clients/:id` | `ClientDetailPage` | `frontend/src/pages/ClientDetailPage.tsx` | **Ficha 360**: seis indicadores, un lápiz para nombre y tipo, notas editables, personas (agregar, editar, eliminar, estrella de principal, clic que **copia** el correo o el teléfono), historial de cotizaciones con visor (`QuotationViewer`), botón **Eliminar cliente** (solo si no tiene cotizaciones) | ver, editar ficha y personas, eliminar: todos. "Nueva cotización", y el lápiz y el duplicar de cada cotización: `SECTION_ROLES.quotations_edit` (vendedor en adelante), con la variable `puedeEditar` |

Pantallas de otros mapas que crean o leen clientes y personas:

| Ruta | Componente | Qué toca de este módulo | Mapa |
|---|---|---|---|
| `/quotation-form`, `/quotation-form/:id` | `QuotationForm` | Selector de cliente (`clientsQueryOptions`), modal para crear cliente (`createClient`), selector de mandante con "+ Nuevo contacto" (`getClientContacts`, `createClientContact`) | 01 |
| `/requests` | `RequestsPage` → `RequestForm` | Selector y modal para crear cliente, persona de contacto del cliente elegido (`getClientContacts`) | 01 |
| `/public-quotation/:company_id` | `CreateQuotationPublic` | Tipos de la empresa sin sesión (`getClientTypesPublic`); si el tipo no incluye "particular", pide el nombre de la organización | 01 y 11 |
| `/quotations`, `/negocio/:id` | `QuotationsPage` (`contactOf`), `NegocioPage` (`contactoDe`) | Muestra el contacto del mandante; WhatsApp y copiar datos; el mensaje de confirmación de "Enviar cotización" | 02 |
| `/post-venta` | `PostVentaPage.fetchEvents` | `getClients` para tipo y contacto de cada evento | 04 |
| `/consultas` | `ConsultasPage` | "Convertir" crea o encuentra al cliente y refresca `["clients"]` | 11 |
| `/dashboard` y analítica | `DashboardPage`, `NewAccount`, `TopClientsBy*Stats`, `RecurringClientsStats`, `RevenueByClientTypeStats` | `getClientTypeColor`; `NewAccount` usa `getClients` para saber si ya hay clientes | 13 |

## 3. Endpoints del motor

Todas las rutas pasan por `AuthGuard` y `RolesGuard` globales (`api-rest/src/app.module.ts`). Ninguna ruta del módulo lleva `@Roles`, y la regla de `RolesGuard` para una ruta sin `@Roles` es que "basta la sesión".

| Método y ruta | Controller y método | Service | Quién lo llama desde la app | Roles o @Public |
|---|---|---|---|---|
| `GET /clients/types` | `ClientsController.findTypes` | `ClientsService.findTypes` → `ClientsRepository.findTypes` | `getClientTypes` vía `clientTypesQueryOptions` (`services/clientTypes.service.ts`) ← `ClientsPage`, `ClientDetailPage`, `QuotationForm`, `RequestForm` | solo sesión |
| `GET /clients/types/public/:company_id` | `ClientsController.findTypesPublic` | `ClientsService.findTypes` | `getClientTypesPublic` ← `CreateQuotationPublic` | `@Public`, sin `@Throttle` propio: solo el techo general del `ThrottlerGuard` global (300 por minuto por IP, `app.module.ts`) |
| `POST /clients/types` | `ClientsController.createType` | `ClientsService.createType` → `ClientsRepository.createType` | `createClientType` ← `ClientsPage.handleCreateType` | solo sesión |
| `DELETE /clients/types/:id` | `ClientsController.removeType` | `ClientsService.removeType` → `ClientsRepository.removeType` | `deleteClientType` ← `ClientsPage.handleDeleteType` | solo sesión |
| `PATCH /clients/types/reorder` | `ClientsController.reorderTypes` | `ClientsService.reorderTypes` → `ClientsRepository.reorderTypes` | `reorderClientTypes` ← `ClientsPage.moveType` | solo sesión |
| `POST /clients` | `ClientsController.create` | `ClientsService.create` (siembra a la persona principal) | `createClient` (`services/clients.service.ts`) ← `ClientsPage.handleSubmit`, `QuotationForm.handleCreateClient`, `RequestForm.handleCreateClient` | solo sesión |
| `GET /clients` | `ClientsController.findAll` | `ClientsService.findAll` → `ClientsRepository.findAll` | `getClients` / `clientsQueryOptions` ← `ClientsPage`, `QuotationForm`, `RequestForm`, `PostVentaPage.fetchEvents`, `NewAccount` | solo sesión |
| `GET /clients/:id/summary` | `ClientsController.findSummary` | `ClientsService.findSummary` → `ClientsRepository.findSummary` | `getClientSummary` ← `ClientDetailPage` (queryKey `["clientSummary", id]`) | solo sesión |
| `PATCH /clients/:id` | `ClientsController.update` | `ClientsService.update` → `ClientsRepository.update` | `updateClient` ← `ClientDetailPage.saveHeader`, `saveNotes`, `syncPrimaryMirror` | solo sesión |
| `DELETE /clients/:id` | `ClientsController.remove` | `ClientsService.remove` → `ClientsRepository.remove` | `deleteClient` ← `ClientDetailPage.handleDeleteClient` | solo sesión |
| `GET /client-contacts?clientId=` | `ClientContactsController.findByClient` | sin service: `ClientContactsRepository.findByClient` | `getClientContacts` (`services/clientContacts.service.ts`) ← `QuotationForm`, `RequestForm` | solo sesión |
| `POST /client-contacts` | `ClientContactsController.create` | `ClientContactsRepository.create` (le pone `portal_token`) | `createClientContact` ← `ClientDetailPage.addContact`, `QuotationForm.addClientContact` | solo sesión |
| `PATCH /client-contacts/:id` | `ClientContactsController.update` | `ClientContactsRepository.update` | `updateClientContact` ← `ClientDetailPage.saveContactEdit` | solo sesión |
| `DELETE /client-contacts/:id` | `ClientContactsController.delete` | `ClientContactsRepository.delete` | `deleteClientContact` ← `ClientDetailPage.removeContact` | solo sesión |
| `POST /client-contacts/:id/primary` (body `client_id`) | `ClientContactsController.setPrimary` | `ClientContactsRepository.setPrimary` | `setPrimaryContact` ← `ClientDetailPage.makePrimary`, `ClientDetailPage.removeContact` | solo sesión |

Usos dentro del motor, sin pasar por HTTP (`ClientsModule` exporta `ClientsService` y `ClientContactsRepository`):

| Pieza | La usa | Para qué |
|---|---|---|
| `ClientsService.findMatch` | `QuotationsService.createPublic`, `ConsultasService.convertir` | anti-duplicados, solo por correo |
| `ClientsService.create` | `QuotationsService.createPublic`, `ConsultasService.convertir` | crear cliente y sembrar a su persona |
| `ClientsService.findAll` | `AnalyticsService` (estadísticas del dashboard) | `totalClients = clients.length` |
| `ClientContactsRepository.findByClient` | `EnvioCotizacionService.correoDeDestino`, `ConsultasService.convertir` | destinatario del envío; ver si el consultante ya es persona del cliente |
| `ClientContactsRepository.create` | `ConsultasService.convertir` | agregar al consultante como persona no principal |

El módulo no tiene relojes ni manda correos propios.

## 4. Tablas de la base de datos

| Tabla | Qué guarda | Lee o escribe | Migración que la crea o modifica |
|---|---|---|---|
| `clients` | El cliente: `name`, `client_type` (el **nombre** del tipo, como texto), `notes`, `company_id`, `created_at`. **Espejo heredado**: `contact_person`, `email`, `phone` (ya no se muestran, pero siguen vivos). `address` es un dato muerto que se sacó del formulario | escribe `ClientsRepository` (`create`, `update`, `remove`); lee `ClientsRepository`, `MarketingRepository` (`clientesPorTipo`, `tiposDeCliente`, `clientesSegmentables`), `QuotationsRepository.findAll` y `findPortalContact` (embebido), `PaymentsRepository.findAllPaymentsWithTransactions`, y `clients(name)` en `logistics.repository.ts`, `people.repository.ts` y `movil.service.ts` | `0_initial_models.sql` (con un CHECK de 6 tipos fijos, ver sección 12); índice `idx_clients_company` en `66_indices_de_consultas_calientes.sql`; espejo leído por los rellenos de `35`, `50`, `52` y `56` |
| `client_contacts` | Personas del cliente: `client_id` (FK con **CASCADE**), `company_id`, `name`, `email`, `phone`, `is_primary`, `portal_token` (UNIQUE), `created_at`. `UNIQUE (client_id, name)` | escribe `ClientContactsRepository`; lee `ClientsRepository.findAll` y `findSummary` (embebido), `ClientsRepository.findMatch`, `QuotationsRepository` (`resolveContactId`, `findContactById`, `findContactByName`, `findContactPortalToken`, `findPortalContact`), `MarketingRepository.contactosDeClientes`, `PaymentsRepository` (embebido `mandante`) | `34_client_contacts.sql` (la crea); `35_contacts_fields_and_backfill.sql` (`email`, `phone` y relleno desde `contact_person`); `36_primary_contact.sql` (`is_primary` e índice único parcial `uniq_primary_contact_per_client`); `48_portal_del_mandante.sql` (`portal_token`); `50_correos_a_personas.sql` (siembra personas y tokens); `52_adopcion_completa.sql` (muda correo y teléfono de la ficha a la principal); `56_persona_principal_garantizada.sql` |
| `client_types` | Catálogo de tipos por empresa: `id`, `company_id`, `name`, `sort_order` (columnas deducidas del código) | lee y escribe `ClientsRepository` (`findTypes`, `createType`, `reorderTypes`, `removeType`) | **no hay migración en `docs/migrations`**. Nació en el commit `3b17b4d` del 21-07-2026 y `sort_order` llegó en `d9d31b8`. Ver secciones 11 y 12 |
| `quotations` (`client_id`, `client_contact_id`, `contact_name`, `quotation_status`) | Vínculo cotización ↔ cliente, y cotización ↔ mandante. `client_contact_id` va con **ON DELETE SET NULL**. `quotations.client_id` no tiene CASCADE, así que la base bloquea borrar un cliente con cotizaciones | lee `ClientsRepository.findAll` (embebido `quotations(id, quotation_status)`), `findSummary` y `remove` (conteo); lo escribe el cotizador (mapa 01) | `0_initial_models.sql`; `contact_name` en `33_quotation_contact_name.sql`; `client_contact_id` en `48` y `50`; índice `idx_quotations_company_client` en `66` (existe "para la ficha 360") |
| `payments` | Cuotas; la ficha suma las que están `pendiente` o `vencido` | lee `ClientsRepository.findSummary` | mapa 03 |
| `customer_satisfaction_survey_responses` | Respuestas de encuesta (`answers`) que dan el promedio de satisfacción | lee `ClientsRepository.findSummary` | mapa 14 |
| `consultas.client_type` | Tipo de cliente de las consultas del embudo | lee `ClientsRepository.removeType` (frena el borrado) | `104_modulo_consultas.sql` (mapa 11) |
| `portal_receipts.client_contact_id` | Qué persona subió un comprobante; FK con **ON DELETE SET NULL** | nadie de este módulo; le afecta borrar una persona | `49_comprobantes_portal.sql` (mapa 03) |

## 5. Flujos principales

### A. Crear un cliente con su persona principal (la "garantía de nacimiento")

1. En `ClientsPage.handleSubmit`, el portero de la app (`phoneProblem`, `emailProblem` de `utils/phone`) revisa el correo y el teléfono de la persona.
2. La app arma un solo envío: los datos de la ficha, más `email` y `phone` (que llenan el espejo de la ficha), más `contact_person`, `contact_email` y `contact_phone`. En Particulares sin nombre de persona, la persona se llama como el cliente.
3. `createClient` → `POST /clients` → `ClientsController.create`, que registra el envío con `logSafe` → `ClientsService.create`.
4. `ClientsService.create` separa `contact_email` y `contact_phone`, y `ClientsRepository.create` inserta en `clients` con el `company_id` de la sesión.
5. Luego `ClientContactsRepository.create` inserta la persona con `is_primary: true`. Nombre: `contact_person`, o el nombre del cliente. Correo: `contact_email`, o `email`. Teléfono: `contact_phone`, o `phone`. `portal_token` se genera con `randomBytes(32)`. **Si esta parte falla, solo se registra el error y el cliente queda creado igual** ("best-effort").
6. La app invalida `["clients"]`. En el motor, `PanelInvalidationInterceptor` borra de la memoria el panel de análisis de la empresa (pasa con cualquier POST, PATCH o DELETE exitoso).

Este mismo camino lo recorren el modal del cotizador y el de `RequestForm` (mapa 01), además de `QuotationsService.createPublic` y `ConsultasService.convertir` en el motor.

### B. La ficha 360

1. `ClientDetailPage` hace `useQuery(["clientSummary", id])` → `getClientSummary` → `GET /clients/:id/summary` → `ClientsService.findSummary` → `ClientsRepository.findSummary`.
2. Primera tanda en paralelo: `clients` con `client_contacts(...)` embebido, y las `quotations` del cliente ordenadas por `event_date` descendente.
3. Segunda tanda en paralelo, solo si hay cotizaciones: las `payments` en estado `pendiente` o `vencido`, y las `customer_satisfaction_survey_responses` de esas cotizaciones.
4. La app calcula todo lo demás:
   - vendidas = `aceptada` + `realizada`; consideradas = todas menos `solicitada`;
   - conversión = vendidas / consideradas; ticket promedio = vendido / vendidas;
   - saldo pendiente: suma de cuotas impagas, y "debe $" en cada cotización;
   - recencia: `created_at` más reciente; **dormido si pasan más de 180 días**;
   - satisfacción: promedio de los promedios de cada encuesta, contando solo las respuestas numéricas entre 1 y 5.
5. Pinchar una cotización → `queryClient.fetchQuery(["quotation", id])` → `QuotationViewer`. El lápiz lleva a `/quotation-form/:id`, el botón duplicar a `/quotation-form` con `state.duplicateFrom`, y "Nueva cotización" a `/quotation-form` con `state.clientId`.

### C. Personas y contacto principal (desde la ficha)

- **Agregar** (`addContact`): pasa por el portero de teléfono y correo → `createClientContact` (la primera persona queda como principal) → si es la primera, `syncPrimaryMirror` escribe `clients.contact_person` con `PATCH /clients/:id`.
- **Editar** (`saveContactEdit`): `PATCH /client-contacts/:id` con nombre, correo y teléfono. Si era la principal y cambió el nombre, se sincroniza el espejo. **Solo el nombre**: el correo y el teléfono de la ficha no se tocan.
- **Marcar principal** (`makePrimary`, estrella) → `POST /client-contacts/:id/primary` → `ClientContactsRepository.setPrimary` quita la marca a la principal actual del cliente y marca la nueva (dos UPDATE seguidos) → `syncPrimaryMirror`.
- **Eliminar** (`removeContact`) → `DELETE /client-contacts/:id`. Si era la principal, la app asciende a la siguiente con `setPrimaryContact` y actualiza el espejo; si no queda nadie, el espejo queda vacío.
- **Efecto en la base al borrar una persona**: `quotations.client_contact_id` y `portal_receipts.client_contact_id` quedan en NULL (migraciones 48 y 49). Sus cotizaciones pierden el mandante vinculado y su enlace de portal deja de existir.
- **Particulares = una sola persona**: con una persona, "Agregar contacto" desaparece. `saveHeader` no deja cambiar a Particulares una ficha con más de una persona.
- Tras cada cambio se invalidan `["clientSummary", id]` y `["clients"]`.

### D. Tipos de cliente

1. Las pantallas con sesión (`ClientsPage`, `ClientDetailPage`, `QuotationForm`, `RequestForm`) leen con `clientTypesQueryOptions` (queryKey `["clientTypes"]`). Si el motor no responde, se usan los 6 de `constants/clientTypes.ts` con ids negativos. `CreateQuotationPublic` usa `getClientTypesPublic` y, si falla, la misma lista fija.
2. **Crear** (`ClientsRepository.createType`): el nombre recortado no puede ir vacío. Si ya existe (sin distinguir mayúsculas), devuelve el existente. Si no, se agrega con `sort_order` = máximo + 1.
3. **Reordenar** (`moveType`): la app intercambia el orden en la caché al instante y manda los ids en el orden final. `reorderTypes` descarta los ids que no son de la empresa y guarda del 1 al N, un UPDATE por tipo. Si falla, la app vuelve a pedir el orden.
4. **Eliminar** (`removeType`): busca el tipo de la empresa y cuenta los `clients` con ese `client_type` (**por nombre**) → 409 "está en uso por N cliente(s)". Cuenta también las `consultas` con ese tipo → 409. Recién entonces lo borra. En pantalla, el basurero aparece deshabilitado si `typeUsage` es mayor que cero.
5. **Cambiar el tipo de un cliente**: lápiz de la ficha → `saveHeader` → `PATCH /clients/:id` con `client_type`.

### E. Anti-duplicados en el formulario público y al convertir consultas

1. `QuotationsService.createPublic` primero pregunta si el tipo de evento va al embudo (`consultasService.embudoPara`, mapa 11). Si no va, llama a `ClientsService.findMatch(company_id, email, undefined)`.
2. `ClientsRepository.findMatch` trae **todos** los `clients` de la empresa y compara el correo sin mayúsculas ni espacios, primero contra el **espejo de la ficha** (`clients.email`) y después contra **todas** las `client_contacts` de la empresa. Devuelve el primer calce o null.
3. Sin calce → `ClientsService.create`: el cliente toma el nombre de `company_name`, o el de la persona; `contact_person` es la persona. Todo sigue como en el flujo A.
4. La cotización nace con `contact_name` = la persona, y `QuotationsService.create` la vincula con `resolveContactId` (por nombre, ignorando solo mayúsculas y espacios en los extremos; mapa 01).
5. `ConsultasService.convertir` hace lo mismo. Si el cliente **ya existía** y el correo del consultante no está entre sus personas, lo agrega como persona **no principal**; si esto falla, solo se registra. Devuelve `contact_name` para que el cotizador lo marque de antemano.

### F. La regla de a quién se le escribe (y a quién se le muestra)

Hay **varias versiones** de la regla, repartidas entre la app y el motor. Esta tabla las junta todas:

| Dónde | Función | Qué usa | Sin persona o sin correo |
|---|---|---|---|
| App, lista de clientes | `ClientsPage.principalDe` | La persona `is_primary`, o la primera de `client_contacts` | espejo de la ficha (`contact_person`, `email`, `phone`) |
| App, tablero de cotizaciones | `QuotationsPage.contactOf` | Si hay `contact_name`: la persona del cliente con ese nombre (comparado con `normalizeText`, sin tildes), con **su** teléfono y correo | teléfono y correo vacíos si esa persona no los tiene; sin `contact_name`: espejo de la ficha |
| App, ficha del negocio | `NegocioPage.contactoDe` | Igual que `contactOf`. Alimenta WhatsApp, copiar datos y el texto del `ConfirmInline` de "Enviar cotización" | igual |
| App, Post-Venta | bloque en `PostVentaPage.fetchEvents` | Igual (mandante por nombre); el cliente se busca **por nombre** en `getClients` | espejo de la ficha |
| Motor, encuesta y "cotización enviada" | `QuotationsService.resolveRecipient` (`CUSTOMER_SATISFACTION_SURVEY`, `QUOTATION_IS_SENT`) | 1) la persona de `client_contact_id` (`findContactById`); 2) sin vínculo, calce por nombre (`findContactByName`, `ilike`) | **no se envía**; la ficha nunca es destino |
| Motor, correos de plata | `QuotationsService.mandanteOf` ← `PaymentsService` (`PAYMENT_PLAN_CREATED`, `PAYMENT_RECEIVED`) | la persona de `client_contact_id` | no se envía (queda un `warn` en el registro) |
| Motor, seguimiento a los 7 y 14 días | `QuotationsCronService.sendQuotationFollowUps` (`QUOTATION_FOLLOW_UP`) | `findContactById(client_contact_id)` | no se envía (queda un `warn`) |
| Motor, botón "Enviar cotización" | `EnvioCotizacionService.correoDeDestino` | la persona por `client_contact_id`, o por nombre (`toLowerCase` + `trim`), usando `ClientContactsRepository.findByClient` | **cae al correo de la ficha** (`clients.email`); sin ninguno, `BadRequest` antes de imprimir el PDF |
| Motor, confirmación del formulario público | `QuotationsService.createPublic` (`NEW_PUBLIC_QUOTATION_CLIENT`) | el correo escrito en el formulario, con el `portal_token` de la persona vinculada | — |
| Motor, marketing por segmento | `resolverSegmento` (`marketing/segmento.ts`) | el filtro decide por cliente; se escribe a **todas** sus personas con correo; un solo envío por correo | correo de la ficha |
| Motor, audiencia de marketing "por tipo" | `MarketingRepository.clientesPorTipo` ← `MarketingService.candidatosDeUna` | **solo el correo de la ficha** (`clients.email`) | — |

Los correos de pago y el portal se ven en el mapa 03; el envío y la bitácora en el 02; el marketing en el 10.

## 6. Reglas de negocio acordadas

1. **Los tipos de cliente son un catálogo de cada empresa, no una lista fija** (definido con Felipe el 21-07-2026; ejemplo: "Club Adulto Mayor"). Evidencia: comentario en `ClientsRepository.findTypes` y `services/clientTypes.service.ts`.
2. **Toda la gestión de tipos vive en el panel "Gestionar tipos"**: crear, ordenar y eliminar. El desplegable solo sirve para elegir (decisión de Felipe, 21-07-2026). Evidencia: comentario en `ClientsPage`.
3. **Un tipo en uso no se elimina**, ni por clientes ni por consultas del embudo. La regla de consultas es del 05-09: si se borrara, convertir crearía clientes con un tipo huérfano. Evidencia: `ClientsRepository.removeType`.
4. **Crear un tipo repetido no duplica**: sin distinguir mayúsculas, devuelve el que ya existe. Evidencia: `ClientsRepository.createType`.
5. **Un cliente con cotizaciones no se elimina** (409 con mensaje claro; la FK de la base también lo bloquea). Evidencia: `ClientsRepository.remove`; botón deshabilitado en `ClientDetailPage`.
6. **La ficha 360 es la única puerta para editar y eliminar** (03-08). La lista solo busca, crea y entra. En la ficha, la pregunta de confirmación **reemplaza** al botón (Felipe, 18-08: "dos 'Eliminar' a la vista confunden cuál es el definitivo"). Evidencia: comentarios en `ClientsPage.handleSubmit` y en `ClientDetailPage`.
7. **Todo cliente nace con su persona principal, por cualquier camino** (garantía de nacimiento, regla de Felipe, 31-07). En la migración 56, Felipe: *"que haya SIEMPRE la persona principal; las personas cambian de trabajo y debo poder actualizarlas — no un dato en piedra"*. Evidencia: `ClientsService.create`, `56_persona_principal_garantizada.sql`.
8. **La persona es la fuente de verdad; el espejo de la ficha quedó jubilado para mostrar** (30 y 31-07). La ficha ya no captura ni muestra correo o teléfono propios (boceto de Felipe, 30-07), pero el espejo sigue "bajo el capó" para el anti-duplicados. Evidencia: `52_adopcion_completa.sql` (caso Paulina Smith / Abastible) y comentarios en `ClientsPage` y `ClientDetailPage`.
9. **Una sola principal por cliente.** La base lo asegura con el índice único parcial de la migración 36; la migración 56 fija la regla: "siempre exactamente una principal por cliente". Evidencia: `36_primary_contact.sql`, `ClientContactsRepository.setPrimary`.
10. **Particulares = UNA persona** (regla de Felipe, 30-07; medido: 0 de 134 tenían más). La base no tiene candado para esto. Evidencia: comentario en `ClientDetailPage` y `saveHeader` ("Puerta trasera cerrada").
11. **Si viene correo, tiene que ser un correo real** (candado del 03-08, pillada de Felipe: "payasoqlflojo@" había quedado guardado; "un correo inválido guardado hoy es un envío que rebota mañana"). El teléfono queda libre a propósito, por los formatos extranjeros. Evidencia: `dto/client-contact.dto.ts`, `dto/create-client.dto.ts`. En la app, `phoneProblem` y `emailProblem` (portero del 30-07).
12. **El anti-duplicados calza SOLO por correo** (22-07, afinado el 05-09). Regla de Felipe: la gente cambia de empresa o colegio y conserva su número, así que el teléfono engancharía la solicitud a la organización vieja; el correo acompaña a la organización. Evidencia: `QuotationsService.createPublic`, `ConsultasService.convertir`, `12_MODULO_DE_CONSULTAS.md`.
13. **"Tus datos" son la persona; el cliente es quien organiza** (05-09). La organización le da el nombre al cliente y la persona queda como su principal. Evidencia: `createPublic`, `convertir`, doc 12.
14. **El consultante queda como persona de contacto del cliente existente** (Felipe, 05-09: *"persona de contacto no me trajo a nadie"*), sin duplicar y sin tocar a la principal. Evidencia: `ConsultasService.convertir`; prueba "cliente existente: el consultante queda como persona de contacto".
15. **Correos a personas y punto** (30-07): el destinatario es el mandante vinculado. Persona sin correo = no se envía, "mejor silencio que un enlace de portal en una casilla desconocida". Evidencia: `50_correos_a_personas.sql`, `QuotationsService.resolveRecipient`, `PaymentsService`. Excepción escrita: el envío de cotización cae a la ficha (doc 13; ver sección 11).
16. **El portal es de la PERSONA** (migración 48, diseño de Felipe, 30-07): un enlace por persona, que ve todas sus cotizaciones y solo las suyas. Toda persona creada por `ClientContactsRepository.create` nace con su token. Las migraciones 48 y 50 solo dieron token a personas que ya tenían cotizaciones, y la 56 sembró personas sin token (ver pregunta 9). Evidencia: `ClientContactsRepository.create`, `48_portal_del_mandante.sql`, `50_correos_a_personas.sql`, `56_persona_principal_garantizada.sql`. El detalle está en el mapa 03.
17. **Renombrar o borrar una persona no reescribe las cotizaciones históricas**: `contact_name` es una foto. Evidencia: comentario de `34_client_contacts.sql`.
18. **Segmento comercial: cada cliente cae en UNO** (Felipe, 23-07): `efectivos` (al menos una aceptada o realizada), `en_proceso` (algo vivo), `sin_concretar` (cotizó y todo murió: hay que reactivarlo), `sin_cotizaciones`. Advertencia escrita: "vale lo que valga la disciplina de estados". Evidencia: `ClientsPage.clientSegment`.
19. **Los conteos son el filtro** (Felipe, 09-09: *"ocupan mucho espacio las cajas y dejan poco para la lista"*): chips de tipo con su cantidad. Las columnas quedan quietas (09-09: *"hoy bailan según qué busco"*). Se muestra "Cotizaciones" en vez de la fecha de registro (09-09: *"fecha de registro no dice nada"*). Evidencia: comentarios en `ClientsPage`.
20. **En la tarjeta, pinchar un correo o un teléfono lo COPIA** (decisión de Felipe, 29-07): antes eran `mailto:` y `tel:` y abrían el app de correo o FaceTime. Evidencia: `ClientDetailPage` con `useCopiarDato`.
21. **Recepción entra a la ficha a mirar, no a cotizar** (pillado por Felipe en el laboratorio, 12-08): el lápiz la mandaba a "Permisos Insuficientes". Evidencia: `puedeEditar` en `ClientDetailPage`.
22. **Colores de los tipos**: los 6 estándar mantienen su color histórico; los nuevos reciben un color estable calculado del nombre ("mismo nombre → mismo color, en cualquier sesión"). Evidencia: `utils/clientTypeColor.ts`.
23. **La dirección salió del formulario** (medición del 30-07: solo 6 de 291 clientes la tenían). La columna sigue en la base. Evidencia: comentario en `ClientsPage`.
24. **La fecha del evento se formatea en UTC** (13-08: salía un día antes en la tabla de la ficha). Evidencia: comentario en `ClientDetailPage` con `formatFechaEvento`.
25. **Mandante obligatorio para guardar una cotización** ("Falta el mandante"): sin él no hay destinatario de correos ni cruce de la cosecha. Evidencia: `QuotationForm` (mapa 01).

## 7. Conexiones con otros módulos

**Quién lo usa:**

- **Cotizador (01_COTIZADOR.md)**: `QuotationForm` y `RequestForm` crean clientes y personas y eligen el mandante. `QuotationsService.create` y `update` vinculan `client_contact_id` con `resolveContactId`; `createPublic` usa `findMatch` y `create`.
- **Ficha del negocio y envío (02_NEGOCIO_ENVIO_Y_SEGUIMIENTO.md)**: `NegocioPage.contactoDe`, `QuotationsPage.contactOf`, `EnvioCotizacionService.correoDeDestino` (inyecta `ClientContactsRepository`). `QuotationsCronService.sendQuotationFollowUps` le escribe al mandante vinculado.
- **Pagos y portal (03_PAGOS_REEMBOLSOS_Y_PORTAL.md)**: `client_contacts.portal_token` y `quotations.client_contact_id` son la llave del portal. `PaymentsService` usa `mandanteOf`. La ficha 360 lee `payments`, y su saldo solo cuadra gracias a la regla de cuadratura (`PaymentsService.normalizePaymentAfterTransactions`: toda cuota queda 100 % pagada o 100 % pendiente).
- **Post-Venta (04_POST_VENTA.md)**: `PostVentaPage.fetchEvents` usa `getClients` y saca el enlace al portal del embebido `mandante` (vía `client_contact_id`).
- **Marketing (10_MARKETING.md)**: lee `clients` y `client_contacts` (`clientesSegmentables`, `contactosDeClientes`, `clientesPorTipo`, `tiposDeCliente`). Regla del doc 11: "Marketing LEE el CRM, jamás le escribe".
- **Consultas (11_CONSULTAS_Y_FORMULARIOS_PUBLICOS.md)**: `ConsultasModule` importa `ClientsModule`, y `convertir` usa `ClientsService.findMatch` y `create`, y `ClientContactsRepository.findByClient` y `create`. `removeType` revisa `consultas.client_type`. `CreateQuotationPublic` usa el endpoint público de tipos.
- **Correos internos (12_CORREOS_INTERNOS_Y_NOTIFICACIONES.md)**: los correos al cliente usan `portal_token` para el botón "Ingresar a mi portal" (`findContactPortalToken`, `findContactById`).
- **Dashboard y analítica (13_DASHBOARD_Y_ANALITICA.md)**: `AnalyticsModule` importa `ClientsModule` y `AnalyticsService` llama `ClientsService.findAll`. `DashboardPage` y cuatro componentes de analítica usan `getClientTypeColor`. Las funciones SQL de `db_functions_analytics_23_07.sql` agrupan por `clients.client_type`.
- **Encuestas (14_ENCUESTAS_DE_SATISFACCION.md)**: la ficha lee `customer_satisfaction_survey_responses`, y la encuesta llega al mandante vía `resolveRecipient`.
- **Logística (06), Personas (07) y móvil (16)**: solo leen `clients(name)` embebido para rotular eventos.
- **Acceso y roles (15_ACCESO_EMPRESA_USUARIOS_Y_PLANES.md)**: `SECTION_ROLES.clients`, `PermissionGuard` en `App.tsx`, `AuthGuard` y `RolesGuard`.

**A quién usa:** `SupabaseService` (llave de servicio, sin RLS). En la app, las piezas del kit (17_KIT_DE_LA_CASA_Y_BASE_DE_LA_APP.md): `SelectWithSearch`, `MultiSelect`, `ConfirmInline`, `Toast`, `QuotationViewer`, `useCopiarDato`, `utils/phone`, `utils/searchMatch`, `utils/dates` y `utils/estadoCotizacion`.

**Efectos automáticos:**

- `PanelInvalidationInterceptor` (`api-rest/src/cache/panel-invalidation.interceptor.ts`): cualquier escritura exitosa de este módulo borra de la memoria el panel de análisis de la empresa.
- Cascadas de la base:
  - borrar un cliente → se borran sus `client_contacts` (CASCADE, migración 34);
  - borrar una persona → `quotations.client_contact_id` y `portal_receipts.client_contact_id` quedan en NULL (migraciones 48 y 49).
- Cachés de React Query compartidas: `["clients"]` (lista, cotizador, `RequestForm`; `ConsultasPage` la invalida al convertir), `["clientTypes"]`, `["clientSummary", id]` y `["quotation", id]` (visor).
- El módulo no tiene relojes ni manda correos propios.

## 8. Zonas de riesgo: si tocas esto, cuidado con aquello

1. **Si tocas** el nombre de una persona desde la ficha 360, **se afecta** el vínculo del mandante en todas sus cotizaciones, **porque** `QuotationForm` siempre manda `contact_name` al guardar y `QuotationsService.update` lo vuelve a resolver con `resolveContactId`, que calza por nombre (solo ignora mayúsculas y espacios en los extremos). El nombre viejo guardado ya no calza, así que `client_contact_id` queda en null. Consecuencias: el portal de la persona deja de ver esa cotización, y `resolveRecipient` y `mandanteOf` no encuentran destinatario, así que los correos al cliente se dejan de enviar sin aviso. `SelectWithSearch` sigue mostrando la etiqueta guardada, por lo que nadie lo nota en pantalla. Evidencia: `QuotationsRepository.resolveContactId`, `QuotationsService.update`, `QuotationForm` (envío con `contact_name`). Sale de leer el código; no hay incidente registrado.
2. **Si tocas** `ClientContactsRepository.create` (por ejemplo, quitar el `portal_token`), **se afecta** el portal y el botón "Ingresar a mi portal" de los correos, **porque** toda persona debe nacer con su enlace (migración 48), y `findContactById` y `findContactPortalToken` lo leen de ahí. Evidencia: comentario "todo contacto nace con su enlace secreto listo".
3. **Si tocas** el borrado de personas, **se afecta** Post-Venta y el portal, **porque** la FK deja en NULL el mandante (`client_contact_id`) de sus cotizaciones y de sus comprobantes, y Post-Venta saca de ese vínculo el enlace al portal que muestra (`portalToken` desde el embebido `mandante` de `PaymentsRepository.findAllPaymentsWithTransactions`). Además, `ClientDetailPage.removeContact` no revisa el `{ error }` que devuelve `deleteClientContact`: si el borrado falla y era la principal, igual asciende a otra persona. Evidencia: `48_portal_del_mandante.sql`, `49_comprobantes_portal.sql`, `PostVentaPage.fetchEvents`, `services/clientContacts.service.ts`.
4. **Si tocas** el espejo de la ficha (`clients.email`, `phone`, `contact_person`) creyendo que es un dato muerto, **se afecta**:
   - el anti-duplicados (`findMatch` busca primero en la ficha);
   - el respaldo del envío de cotización (`correoDeDestino`);
   - la audiencia de marketing por tipo (`clientesPorTipo`) y el respaldo del segmento;
   - el conteo `conCorreo` de `tiposDeCliente`;
   - lo que muestran `contactOf`, `contactoDe` y Post-Venta cuando no hay `contact_name`.

   **Porque** el espejo sigue vivo. Y al revés: **ya se desfasa**, porque `syncPrimaryMirror` solo copia el nombre; editar el correo o teléfono de la persona deja el viejo en la ficha. Evidencia: `ClientDetailPage.syncPrimaryMirror` y `saveContactEdit`, comentario "el espejo interno sigue bajo el capó".
5. **Si tocas** la forma de `GET /clients` (`ClientsRepository.findAll`), **se afecta**:
   - `ClientsPage`: segmentos (`quotation_statuses`), `principalDe` (`client_contacts` embebido), `typeUsage` y la columna de cotizaciones;
   - los selectores de `QuotationForm` y `RequestForm`;
   - `PostVentaPage.fetchEvents`, que arma un mapa **por nombre** (`clientByName`: dos clientes con el mismo nombre se pisan);
   - `NewAccount`, y `AnalyticsService` (`totalClients`).

   **Porque** todos consumen la misma respuesta con los embebidos. Evidencia: el comentario de `findAll` y los consumidores listados en la sección 3.
6. **Si tocas** `findMatch` o sus llamadas, **se afectan** los duplicados del formulario público y del embudo, **porque** la regla es SOLO por correo (05-09). El repositorio todavía compara teléfonos (últimos 9 dígitos), pero ambos llamadores pasan `undefined` a propósito; pasarle el teléfono "para mejorar" reabre el enganche a la organización vieja. Evidencia: `QuotationsService.createPublic`, `ConsultasService.convertir`.
7. **Si renombras o eliminas el tipo "Particulares"**, **se afecta**:
   - `ClientsPage.isEmpresa`;
   - la regla de una persona en `ClientDetailPage` (compara el texto exacto);
   - el valor por defecto `'Particulares'` de `ConsultasService.convertir`;
   - el valor inicial del formulario de `ClientsPage`;
   - `CLIENT_TYPES` y `DEFAULT_CLIENT_TYPE`.

   **Porque** el nombre está escrito a mano en el código, y `removeType` deja borrarlo si nadie lo usa. (`CreateQuotationPublic` busca "particular" dentro del nombre, así que tolera variantes.)
8. **Si agregas** "renombrar tipo", **se afecta** todo lo que guarda el tipo **como texto**: `clients.client_type`, `consultas.client_type`, `tipos_cliente` de las campañas de marketing y las funciones SQL de analítica, **porque** nada apunta al id de `client_types`. Evidencia: `removeType` cuenta por `name`, `MarketingRepository.clientesPorTipo` filtra con `.in('client_type', tipos)`.
9. **Si tocas** `setPrimary`, **se afecta** la regla de una sola principal, **porque** son dos UPDATE sin transacción y no se verifica que la persona sea del `client_id` recibido. Si el segundo falla (por ejemplo, por el índice único parcial al marcar una persona de otro cliente), el cliente queda **sin principal**. Evidencia: `ClientContactsRepository.setPrimary`, `36_primary_contact.sql`.
10. **Si agregas** una persona con un nombre que ya existe en ese cliente, **se afecta** el guardado, **porque** `UNIQUE (client_id, name)` (migración 34) rechaza el insert, y `ClientDetailPage.addContact` no revisa el error: cierra el formulario como si hubiera guardado. En `ConsultasService.convertir`, ese choque solo queda en el registro. Evidencia: `34_client_contacts.sql`, `addContact`.
11. **Si cambias** `contactoDe` o `contactOf` en la app, o `correoDeDestino` en el motor, **se afecta** la confianza en "Enviar cotización", **porque** la confirmación de `NegocioPage` muestra `contacto.email` y no siempre es el destino real:
    - la app calza solo por nombre y sin tildes;
    - el motor calza primero por `client_contact_id`, después por nombre distinguiendo tildes (`toLowerCase` + `trim`), y cae a `clients.email`;
    - si la persona no tiene correo, la app pregunta "¿Enviar la cotización por correo?" sin nombrar destino y el motor le escribe a la ficha.

    Evidencia: `NegocioPage.contactoDe`, `EnvioCotizacionService.correoDeDestino`, doc 13 ("se replica en el motor").
12. **Si tocas** `findSummary`, **se afecta** la velocidad de la ficha, **porque** en fila india tardaba ~800 ms (medido el 12-08) y hoy va en dos tandas paralelas apoyadas en `idx_quotations_company_client`. Evidencia: comentario en `ClientsRepository.findSummary`, `66_indices_de_consultas_calientes.sql`.
13. **Si reactivas** `GET :id` en `ClientsController` (hoy comentado) y lo declaras antes de `GET types`, **se rompe** la lista de tipos, **porque** `"types"` se leería como id de cliente. Hoy el orden no rompe nada: `GET :id` está comentado, y las otras rutas de tipos (`types/:id`, `types/reorder`, `types/public/:company_id`) tienen más tramos que `PATCH :id` y `DELETE :id`, así que no se confunden. El comentario "IMPORTANTE" del controller pide igual mantenerlas arriba. Evidencia: `ClientsController` (orden de las rutas y `findOne` comentado).
14. **Si mandas** `contact_email` o `contact_phone` en un `PATCH /clients/:id`, **falla** la escritura, **porque** `UpdateClientDto` (`PartialType(CreateClientDto)`) los acepta, pero `ClientsService.update` no los separa (solo `create` lo hace) y la tabla `clients` no tiene esas columnas. Hoy ninguna pantalla los manda. Evidencia: `dto/update-client.dto.ts`, `ClientsService.update`.
15. **Si tocas** `ClientContactsRepository.create` o `update`, **cuidado con el aislamiento entre empresas**: `create` pone el `company_id` de la sesión pero **no verifica que `client_id` sea de esa empresa**. El embebido `client_contacts(...)` de `findSummary` y `findAll` no filtra por empresa, así que una persona colgada de un cliente ajeno se vería en la ficha del otro. Requiere conocer el UUID. Evidencia: `ClientContactsRepository.create`, `ClientsRepository.findSummary`.

## 9. Pruebas que lo protegen

| Archivo | Qué cubre |
|---|---|
| `api-rest/src/clients/tests/clients.controller.spec.ts` | Esqueleto: el controller se construye con el service simulado ("should be defined") |
| `api-rest/src/clients/tests/clients.service.spec.ts` | Esqueleto: el service se construye con sus dependencias simuladas. El comentario dice "las pruebas de comportamiento se agregan cuando se toque este módulo" |
| `api-rest/src/consultas/tests/consultas.service.spec.ts` | "convertir matchea al cliente existente y es idempotente"; "cliente existente: el consultante queda como persona de contacto" (no la duplica si el correo ya está, sin distinguir mayúsculas) |
| `api-rest/src/quotations/tests/unit/envio-cotizacion.service.spec.ts` | "el circuito feliz: PDF adjunto, correo al contacto y bitácora"; "sin contacto con correo cae al correo del cliente"; "el portero frena ANTES de imprimir: sin correo ninguno" |
| `api-rest/src/marketing/tests/segmento.spec.ts` | "a personas: uno a cada contacto del cliente": varios contactos, un correo a cada uno con su nombre; cliente sin contactos con correo, respaldo al correo de la ficha |
| `api-rest/src/quotations/tests/unit/quotations.service.spec.ts`, `api-rest/src/quotations/tests/unit/candado-evento-realizado.spec.ts`, `api-rest/src/analytics/tests/analytics.service.spec.ts` | Solo simulan `ClientsService`; no prueban clientes |

**Lo importante que NO está cubierto:**

- la garantía de nacimiento de `ClientsService.create` (persona principal, nombres y correos de respaldo, error silenciado);
- `ClientsRepository.findMatch` (normalización, ficha antes que personas);
- `removeType` (frenos por clientes y por consultas), `createType` (no duplica), `reorderTypes`;
- `ClientsRepository.remove` (409 con cotizaciones) y `findSummary`;
- `setPrimary` y la regla de una principal; el aislamiento por empresa de `ClientContactsRepository`;
- `QuotationsRepository.resolveContactId`, `QuotationsService.resolveRecipient` y `mandanteOf` (sin pruebas en ningún spec);
- en la app, `clientSegment`, `principalDe`, `contactOf` y `contactoDe` (según `CLAUDE.md`, el frontend no tiene suite de pruebas).

## 10. Deuda y rarezas conocidas

- **Tamaño**: `ClientDetailPage.tsx` tiene 1123 líneas y `ClientsPage.tsx` 909. Ambos cuentan para el techo de 27 archivos sobre 800 líneas de `frontend/scripts/portero-kit-de-la-casa.sh`, pero no están entre los 7 gigantes congelados por nombre.
- **Panel flotante a mano**: la tarjeta del lápiz de `ClientDetailPage` (`absolute ... z-20 ... bg-white ... shadow-lg`, con un fondo `fixed inset-0` para cerrarla) calza con la regla "panel flotante a mano (cualquiera)" del portero (techo 13). Adentro, el selector de tipo es una lista de botones hecha a mano, no `SelectWithSearch`.
- **La regla del contacto está copiada**:
  - en la app, tres veces (`QuotationsPage.contactOf`, `NegocioPage.contactoDe`, un bloque en `PostVentaPage.fetchEvents`) más `ClientsPage.principalDe`;
  - en el motor, cuatro variantes (`resolveRecipient`, `mandanteOf` y el reloj, `correoDeDestino`, `resolverSegmento`) que no dicen lo mismo (sección 5F).
- **Comentario que no calza con el código**: en `QuotationsPage.contactOf`, el comentario dice "sin mandante guardado → el contacto principal del cliente", pero el código devuelve el espejo de la ficha (`contact_person`, `phone`, `email`), no la persona `is_primary`. `PostVentaPage` dice lo mismo y hace lo mismo.
- **Espejo a medio jubilar**: `contact_person` se sincroniza desde la app (`syncPrimaryMirror`, una llamada aparte que puede fallar en silencio); `email` y `phone` nunca. `QuotationForm.addClientContact`, al crear la primera persona como principal, no sincroniza el espejo.
- **Código muerto**: `ClientsService.findOne` y `ClientsRepository.findOne` no tienen llamadas (el `GET :id` está comentado en el controller). `UsersRepository` está declarado como proveedor en `ClientsModule` y ninguna clase del módulo lo usa.
- **`findMatch` dormido y pesado**: la comparación por teléfono no la usa nadie, y cada llamada (solicitud pública que no va al embudo, o conversión de consulta) lee **todos** los clientes de la empresa y, si no calza en la ficha, **todas** sus personas, para comparar en memoria.
- **Capas saltadas**: `ClientContactsRepository` vive dentro de `client-contacts.controller.ts` (repositorio y controller en el mismo archivo, sin service). `ClientsService.create` y `ConsultasService.convertir` le pasan datos con `as never`, sin pasar por el DTO.
- **Registros con datos personales**: `ClientsRepository.create` y `update` registran `JSON.stringify(...)` con nombre, correo, teléfono y notas, aunque `logSafe` existe justamente para eso ("los logs guardaban ... datos personales de clientes"). El controller sí usa `logSafe`.
- **Deuda ya anotada en `09_PLAN_DE_HOMOLOGACION.md` y todavía presente**:
  - Tanda A2: `ClientsPage` no revisa si la carga falló (usa `isPending`, sin `isError`), así que una caída de red se ve igual que "No se encontraron clientes".
  - Tanda A3: el botón "Crear Cliente" no se bloquea mientras guarda (dos clics = dos clientes).
- **Errores tragados**: `clientContacts.service.ts` devuelve `{ error }` en vez de lanzar, y `getClientContacts` devuelve `[]` ante cualquier error. `addContact`, `saveContactEdit`, `removeContact` y `makePrimary` de la ficha no revisan ese `{ error }` ni muestran `Toast` si algo falla.
- **`any`**: `catch (error: any)` en los handlers de tipos de `ClientsPage`, y `useState<any>` para el visor en `ClientDetailPage`.
- **Lista fija que sobrevive**: `constants/clientTypes.ts` (`CLIENT_TYPES`) sigue como respaldo en `clientTypesQueryOptions`, `QuotationForm`, `RequestForm` y `CreateQuotationPublic`. El respaldo usa ids negativos, así que reordenar o eliminar con el catálogo caído opera sobre ids falsos.
- **`reorderTypes`** hace un UPDATE por tipo en fila; **`setPrimary`** son dos UPDATE sin transacción.
- **Tablas sin migración**: `client_types` no tiene migración (va contra la regla de `CLAUDE.md`), y ninguna migración quita el CHECK de 6 tipos de `clients.client_type` que muestra `0_initial_models.sql`.
- **Choque de nombres**: "Personas" es el módulo del personal (mapas 07 y 08, `people`); acá "personas" son los contactos del cliente (`client_contacts`). Son tablas distintas.

## 11. Contradicciones entre documento y código

1. **Doc 13 dice que el destinatario se decide con "la regla `contactoDe` de la ficha (se replica en el motor)".** Tabla "Las piezas" y sección "El destinatario" de `docs/arquitectura/13_ENVIO_DE_COTIZACIONES.md`: "el contacto de la cotización (`contact_name` buscado en los contactos del cliente) y su correo; si no hay, el correo del cliente". El código no replica esa regla:
   - `EnvioCotizacionService.correoDeDestino` busca primero por el vínculo real `client_contact_id` y después por nombre (`toLowerCase` + `trim`);
   - `NegocioPage.contactoDe` nunca usa el vínculo, compara sin tildes (`normalizeText`) y, sin `contact_name`, devuelve el espejo de la ficha.
2. **"El correo general de la ficha deja de ser destinatario" (migración 50) contra "si no hay, el correo del cliente" (doc 13).**
   - Lado migración: `docs/migrations/50_correos_a_personas.sql` (30-07) y el comentario de `QuotationsService.resolveRecipient` ("el correo general de la ficha DEJÓ de ser destino").
   - Lado doc 13: el envío de cotización cae a `clients.email`, y lo confirma la prueba "sin contacto con correo cae al correo del cliente" (`envio-cotizacion.service.spec.ts`).

   Las dos reglas conviven en el código.
3. **Doc 11 dice que las audiencias de la base resuelven a personas; la audiencia por tipo usa la ficha.** Sección "A personas, no a fichas (26-08)" de `docs/arquitectura/11_MODULO_DE_MARKETING.md`: "Las audiencias de la base resuelven a **PERSONAS**". En el código, solo la audiencia `segmento` pasa por `resolverSegmento` (personas). La rama final de `MarketingService.candidatosDeUna`, la audiencia por tipo que el mismo doc describe como "Clientes por tipo ... solo con correo", usa `MarketingRepository.clientesPorTipo`, que lee `clients.email` (la ficha) y no `client_contacts`.
4. **`CLAUDE.md` exige que todo cambio de base quede como migración ("Every DB change MUST be recorded as a migration").** La tabla `client_types` (con `sort_order`) la usa `ClientsRepository` desde el commit `3b17b4d` (21-07-2026) y no tiene archivo en `docs/migrations/`.
5. **La migración 36 dice que el espejo lo sincroniza la aplicación.** `docs/migrations/36_primary_contact.sql`: "El campo antiguo clients.contact_person queda como espejo del nombre del principal (lo sincroniza la aplicación)". Solo lo sincroniza `ClientDetailPage` (`syncPrimaryMirror`). `QuotationForm.addClientContact` y `ClientsService.create` para empresas sin nombre de persona (la persona toma el nombre del cliente y `contact_person` queda vacío) no lo hacen.

## 12. Preguntas abiertas

1. **¿Dónde está el DDL de `client_types`?** No se sabe si tiene `UNIQUE (company_id, name)`, FK a `companies` ni permisos. **¿Se quitó en la base el CHECK de 6 tipos** de `clients.client_type` que muestra `0_initial_models.sql`? Si siguiera, crear un cliente con un tipo nuevo fallaría. No es verificable desde el código.
2. **¿Tiene permisos el rol anónimo sobre `client_contacts`?** La migración 34 dio `GRANT ALL` sobre `client_contacts` a `anon` y `authenticated`. La 40 revoca todo a `authenticated`; la 41 revoca a `anon` solo en `companies` y `company_quotation_counters`, aunque afirma "CERO privilegios y CERO políticas para anon/authenticated en el esquema public". La tabla guarda `portal_token`, así que conviene confirmar en Supabase que `anon` no tiene permisos sobre ella.
3. **¿La caída al correo de la ficha en "Enviar cotización" es una excepción acordada** a "correos a personas y punto", o una diferencia que quedó sin querer (sección 11, puntos 1 y 2)?
4. **¿La audiencia de marketing "por tipo" (`clientesPorTipo`) sigue en uso?** Si sigue, ¿debería expandirse a personas como el segmento?
5. **¿Es lo acordado que recepción pueda crear, editar y eliminar clientes, personas y tipos?** Hoy puede: sin `@Roles` en el motor y sin guardia en la app. El acuerdo del 12-08 ("recepción mira; no edita") está escrito para cotizaciones (`constants/permissions.ts`).
6. **¿Se acepta que renombrar una persona rompa el vínculo del mandante al siguiente guardado** de la cotización (sección 8, punto 1), o hace falta propagar el nombre o calzar por `client_contact_id`?
7. **¿Se mantiene "siempre exactamente una principal"?** La migración 56 lo declara, pero borrar a la última persona deja al cliente sin ninguna, y la base no lo impide.
8. **¿Se borra o se conserva la comparación por teléfono de `findMatch`**, que hoy nadie usa?
9. **¿Quedan personas sin `portal_token` en la base?** Las migraciones 48 y 50 solo dieron token a personas con cotizaciones, la 56 sembró personas sin token, y ningún camino del motor lo genera después (solo `ClientContactsRepository.create`, al nacer). Una persona así, vinculada después a una cotización, recibiría los correos sin el botón del portal (`findContactPortalToken` devuelve null). No es verificable desde el código.

## 13. Archivos clave

**Motor**

- `api-rest/src/clients/clients.module.ts`
- `api-rest/src/clients/clients.controller.ts`
- `api-rest/src/clients/client-contacts.controller.ts` (`ClientContactsController` y `ClientContactsRepository`)
- `api-rest/src/clients/clients.service.ts`
- `api-rest/src/clients/clients.repository.ts`
- `api-rest/src/clients/dto/create-client.dto.ts`, `update-client.dto.ts`, `client-contact.dto.ts`, `create-client-type.dto.ts`, `reorder-client-types.dto.ts`
- `api-rest/src/clients/entities/client.entity.ts`, `api-rest/src/clients/interfaces/clients.interfaces.ts`
- `api-rest/src/clients/tests/clients.controller.spec.ts`, `api-rest/src/clients/tests/clients.service.spec.ts`
- Usuarios fuera del módulo:
  - `api-rest/src/quotations/quotations.service.ts` (`createPublic`, `resolveRecipient`, `mandanteOf`, `update`)
  - `api-rest/src/quotations/quotations.repository.ts` (`resolveContactId`, `findContactById`, `findContactByName`, `findContactPortalToken`, `findPortalContact`)
  - `api-rest/src/quotations/envio-cotizacion.service.ts` (`correoDeDestino`)
  - `api-rest/src/quotations/quotations-cron.service.ts` (`sendQuotationFollowUps`)
  - `api-rest/src/consultas/consultas.service.ts` (`convertir`)
  - `api-rest/src/marketing/marketing.repository.ts`, `api-rest/src/marketing/segmento.ts`, `api-rest/src/marketing/audiencias.service.ts`, `api-rest/src/marketing/marketing.service.ts`
  - `api-rest/src/analytics/analytics.service.ts`, `api-rest/src/payments/payments.service.ts`
- Transversales: `api-rest/src/auth/roles.guard.ts`, `api-rest/src/cache/panel-invalidation.interceptor.ts`, `api-rest/src/logging/log-safe.ts`
- Migraciones:
  - `docs/migrations/0_initial_models.sql`, `33_quotation_contact_name.sql`, `34_client_contacts.sql`, `35_contacts_fields_and_backfill.sql`, `36_primary_contact.sql`
  - `40_cerrar_acceso_directo.sql`, `41_barrida_final_anon.sql`
  - `48_portal_del_mandante.sql`, `49_comprobantes_portal.sql`, `50_correos_a_personas.sql`, `52_adopcion_completa.sql`, `56_persona_principal_garantizada.sql`
  - `66_indices_de_consultas_calientes.sql`, `104_modulo_consultas.sql`
- Documentos: `docs/arquitectura/11_MODULO_DE_MARKETING.md`, `12_MODULO_DE_CONSULTAS.md`, `13_ENVIO_DE_COTIZACIONES.md`, `09_PLAN_DE_HOMOLOGACION.md`

**App**

- `frontend/src/pages/ClientsPage.tsx`
- `frontend/src/pages/ClientDetailPage.tsx`
- `frontend/src/services/clients.service.ts`, `frontend/src/services/clientContacts.service.ts`, `frontend/src/services/clientTypes.service.ts`
- `frontend/src/utils/clientTypeColor.ts`
- `frontend/src/types/clients.types.ts`, `frontend/src/constants/clientTypes.ts`, `frontend/src/constants/api.routes.ts` (`CLIENTS`, `CLIENT_TYPES`, `CLIENT_TYPES_PUBLIC`, `CLIENT_CONTACTS`)
- `frontend/src/constants/permissions.ts`, `frontend/src/App.tsx` (rutas `clients` y `clients/:id`), `frontend/src/layout/Sidebar.tsx`
- Consumidores:
  - `frontend/src/pages/quotations/QuotationForm.tsx`, `frontend/src/components/RequestForm.tsx`, `frontend/src/pages/quotations/CreateQuotationPublic.tsx`
  - `frontend/src/pages/quotations/NegocioPage.tsx` (`contactoDe`), `frontend/src/pages/quotations/QuotationsPage.tsx` (`contactOf`)
  - `frontend/src/pages/postventa/PostVentaPage.tsx` (`fetchEvents`), `frontend/src/pages/consultas/ConsultasPage.tsx`
  - `frontend/src/pages/dashboard/DashboardPage.tsx`, `frontend/src/pages/dashboard/components/NewAccount.tsx`, `frontend/src/pages/analytics/components/TopClientsByQuotationsStats.tsx`, `TopClientsByRevenueStats.tsx`, `RecurringClientsStats.tsx`, `RevenueByClientTypeStats.tsx`
- Utilidades usadas: `frontend/src/utils/phone.ts`, `frontend/src/utils/searchMatch.ts`, `frontend/src/hooks/useCopiarDato.ts`, `frontend/scripts/portero-kit-de-la-casa.sh` (techos)
