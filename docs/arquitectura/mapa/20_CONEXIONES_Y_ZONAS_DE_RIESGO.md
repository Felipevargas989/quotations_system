# Conexiones entre módulos y zonas de riesgo

> **Estado: verificado una vez contra el código** (commit 0de0ddb, 11-09-2026). Comprobado contra el código en ese commit. Parte del atlas de docs/arquitectura/mapa; el índice es 00_MAPA_DEL_SISTEMA.md.

## Cómo leer este documento

Cada mapa de módulo (01 a 19) documenta ese módulo por dentro. Este documento junta lo que queda ENTRE módulos: una tabla que dos módulos leen sin saberlo el uno del otro, un correo o un cambio de estado que se dispara solo, una pantalla que no se refresca cuando otra guardó, un servicio que un módulo le presta a otro sin que el organigrama lo diga, un permiso o un endpoint que no protege lo que se cree que protege, o una fórmula de dinero que vive copiada en dos lugares.

Las conexiones están agrupadas en 6 tipos, cada uno con su prefijo de id:

- **x1 — Tabla compartida.** Una misma tabla o columna la escriben o leen dos o más módulos por caminos distintos (consultas SQL directas, funciones RPC, repositorios separados), sin un contrato en común.
- **x2 — Efecto automático.** Un cron, una cascada de guardado o un correo se dispara solo, sin que la pantalla que lo originó lo muestre, y a veces sin candado que evite que se dispare dos veces o a medias.
- **x3 — Refresco de la app.** Una pantalla queda mostrando datos viejos porque otra pantalla guardó algo y no invalidó la caché correcta (React Query), o porque dos pantallas usan la misma llave de caché con reglas distintas.
- **x4 — Dependencia entre módulos.** Un módulo le presta código, un módulo de Nest, una plantilla o una tabla a otro sin que esa dependencia esté declarada donde se esperaría, o con un acoplamiento (`forwardRef`, orden de import) frágil a cambios futuros.
- **x5 — Permiso o endpoint público.** Una ruta del motor no exige el rol que se cree que exige, expone más de lo que promete, o dos rutas gemelas (una pública, otra con sesión) tienen candados distintos.
- **x6 — Cálculo de dinero.** Una fórmula de plata (propina, descuento, IVA, saldo, deuda) está duplicada entre el motor y el frontend, o entre dos pantallas del mismo lado, con la posibilidad real de que un mismo evento muestre dos totales distintos.

Cada conexión trae: qué conecta con qué, qué se rompe si se cambia sin saber que está ahí, y la evidencia exacta en el código (archivo y función/componente — **sin números de línea**, porque se mueven con cada commit). Todo lo escrito acá está `"confirmado": true` contra el código del commit 0de0ddb; no hay conexiones a medio verificar en este documento. Cuando dos conexiones describen el mismo mecanismo desde ángulos distintos (por ejemplo, el candado de borrado de una cotización aparece en x1-16, x2-17 y x4-03), se dejan separadas porque cada una trae evidencia y una consecuencia distinta, pero se referencian entre sí.

Los documentos de `docs/arquitectura/` (los que no están en la carpeta `mapa/`) mandan sobre la memoria de Claude cuando hay contradicción; si el código contradice a esos documentos, ambas evidencias quedan anotadas en la conexión correspondiente.

## Conexiones por tipo

### x1 — Tablas compartidas

#### x1-01 · `quotations.items`: el catálogo, los rankings y la fórmula de dinero lo leen sin pasar por TypeScript

`quotations.items` (jsonb, armado por `QuotationForm`/`computeTotals` y guardado por `QuotationsRepository`) lo leen sin pasar por TypeScript: la función SQL `used_service_codes` (`docs/migrations/54_codigos_en_uso.sql`, 3 `UNION`: `fixed_services`, `variable_services->items` y `variable_services` nivel superior), `get_variable_services_usage`/`get_fixed_services_usage` (`db_functions_analytics_23_07.sql`, agrupan por `item->>'nombre'` no por `'codigo'`, y de las 9 funciones del archivo son las 2 únicas sin `::date` en el filtro de fecha), `ServicesRepository.variableServiceUsage`/`fixedServiceUsage` (buscan con `.contains` por id y por code) y `money.ts` (replica a mano la fórmula de `computeTotals`, con el comentario "la de acá es la que manda"). Si se renombra `codigo`/`nombre`/`items` o cambia el anidado, ambas apps compilan igual: el basurero del catálogo deja de detectar servicios en uso, los rankings de Analítica quedan vacíos, y si la fórmula del total se toca solo en el frontend el backend empieza a rechazar guardados.

**Evidencia:**
- `docs/migrations/54_codigos_en_uso.sql` — `used_service_codes`, comentario de encabezado
- `db_functions_analytics_23_07.sql` — `get_variable_services_usage`/`get_fixed_services_usage` (`item->>'nombre'`, sin `::date`; 7 de 9 funciones sí usan `::date`)
- `api-rest/src/services/services.repository.ts` — `clavesDeServicio` (id+code), `variableServiceUsage`, `fixedServiceUsage`
- `api-rest/src/quotations/utils/money.ts` — encabezado "LA FÓRMULA ES LA MISMA de `computeTotals`"

#### x1-02 · Las 9 funciones de Analítica y el respaldo diario viven fuera de las migraciones

Las 9 funciones de `db_functions_analytics_23_07.sql` (archivo suelto en la raíz, fuera de `docs/migrations`) las consume `AnalyticsService` vía arreglo `CONSULTAS` + `.rpc(fn, params)`; `get_backup_tables()` (sin ninguna migración, solo mencionada en el comentario de `backup-cron.service.ts`) la llama `BackupCronService.runBackup` vía `rpc('get_backup_tables')` para armar la lista de tablas del respaldo diario. Contradice CLAUDE.md ("Every DB change MUST be recorded as a migration"). Si se rearma la base desde `docs/migrations` (laboratorio nuevo o restauración), Analítica responde 500 y el respaldo diario no tiene lista de tablas; un cambio de estado o columna que leen estas funciones no lo detecta nada porque no hay tipos ni pruebas.

**Evidencia:**
- `db_functions_analytics_23_07.sql` — encabezado y las 9 funciones, sin migración correspondiente
- `api-rest/src/analytics/analytics.service.ts` — `const CONSULTAS = [...]`, `this.supabase.client.rpc(fn, params)`
- `api-rest/src/backup/backup-cron.service.ts` — `rpc('get_backup_tables')`
- `grep get_backup_tables` en `docs/migrations/*.sql` — sin resultados

#### x1-03 · Guardar notificaciones en Configuración puede borrar llaves de `notifications` que otra pantalla no conoce

`ConfigurationPage.handleSaveNotifications` hace `PATCH /companies` con `{emails, replyTo}` y reenvía `name`/`logo_url`/`colors` ya cargados; `CompaniesRepository.update` hace `.update(updateCompanyDto)` sin mezclar, así que `notifications` (jsonb) se reemplaza completo. `EmailService` lee `notifications.emails` por `EmailStructure` (21 llaves en backend vs 13 en frontend, ausencia = correo encendido) y `marketing/marca.ts` lee `replyTo`. `CompanyConfiguration.tsx` guarda con `notifications=undefined` (no lo toca). Si otra pantalla escribe una llave nueva en `notifications`, el siguiente guardado desde Configuración la borra; una llave del backend sin casilla en el frontend queda siempre encendida sin forma de apagarla; si logo/colores cambiaron en otra pestaña, guardar notificaciones repone los valores que Configuración cargó al abrir.

**Evidencia:**
- `api-rest/src/companies/companies.repository.ts` — `update()` sin merge
- `frontend/src/pages/configuration/ConfigurationPage.tsx` — `handleSaveNotifications`
- `frontend/src/pages/configuration/companyConfiguration/CompanyConfiguration.tsx` — `updateCompany(... undefined ...)`
- `api-rest/src/email/email.service.ts` — comentario "Sin configuración de avisos = TODO ENCENDIDO"
- `api-rest/src/email/types/index.ts` (21 llaves) vs `frontend/src/types/notifications.ts` (13 llaves) — `EmailStructure`

#### x1-04 · `management_resources` es la misma tabla para cargos de Personas y recursos de Logística

`management_resources` (`type='personal'`=cargos) es compartida: `PeopleRepository` filtra `.eq('type','personal')` en sus escrituras y nunca borra (`deactivateRole` solo apaga); `LogisticsRepository.updateResource`/`deleteResource` operan por id+company_id sin filtrar por `type` (`UpdateManagementResourceDto.type` es opcional, sin validar). `resourcesUsage` —el candado antes de borrar— solo revisa `fixed_service_cost_items` y `event_resources`, nunca `event_staff` ni `people`. FKs `SET NULL`: `event_staff.role_id` (migración 71), `people.default_role_id` (migración 69). `PATCH`/`DELETE /logistics/resources/:id` puede editar o borrar un cargo aunque `RecursosTab` los esconda: si se borra, todas las jornadas y fichas que lo usan quedan sin cargo, sin aviso, sin vuelta atrás; si se cambia el `type`, el cargo desaparece de Personas.

**Evidencia:**
- `api-rest/src/people/people.repository.ts` — `.eq('type','personal')` en `findRoles`/`createRole`/`updateRole`
- `api-rest/src/people/people.service.ts` — `deactivateRole`
- `api-rest/src/logistics/logistics.repository.ts` — `updateResource`, `deleteResource`, `resourcesUsage` (sin `event_staff`/`people`)
- `api-rest/src/logistics/dto/create-catalog-items.dto.ts` — `UpdateManagementResourceDto.type` opcional
- `docs/migrations/71_asignacion_de_personas_por_dia.sql`, `69_cargos_fusionados_con_recursos.sql` — `ON DELETE SET NULL`

#### x1-05 · `client_types` se cruza por nombre en Clientes, Consultas, Marketing y Analítica

`client_types` se une por NOMBRE (no id) con `clients.client_type`, `consultas.client_type`, `FiltroSegmento.tipos_cliente` y `marketing_campaigns.tipos_cliente` (migración 91), y con `get_revenue_by_client_type`. `ClientsRepository.removeType` solo bloquea el borrado si hay `clients` o `consultas` con ese nombre (dos `.eq('client_type', type.name)`); no existe función de renombrar en el repositorio. `ConsultasService.convertir` usa `'Particulares'` como fallback sin validar el catálogo. Si se agrega un renombrar que solo toque `client_types`, quedan huérfanos clientes, consultas, segmentos de marketing y el gráfico de ingresos por tipo (todos comparan texto); borrar un tipo sin clientes que alguna audiencia use la deja contando cero sin aviso.

**Evidencia:**
- `api-rest/src/clients/clients.repository.ts` — `removeType` (chequeo contra `clients` y `consultas` por nombre; sin función renombrar)
- `api-rest/src/marketing/segmento.ts` — `FiltroSegmento.tipos_cliente`
- `docs/migrations/91_modulo_marketing.sql` — `tipos_cliente text[]`
- `db_functions_analytics_23_07.sql` — `get_revenue_by_client_type`
- `api-rest/src/consultas/consultas.service.ts` — `client_type ?? 'Particulares'`

#### x1-06 · `event_types` se cruza por nombre en Cotizador, Consultas, Marketing y Analítica

`event_types` (migración 105) se une por NOMBRE con `quotations.event_type`/`consultas.event_type`, `FiltroSegmento.tipos_evento`, `MarketingRepository.tiposDeEvento`, `get_event_type_conversion_stats`/`revenue_stats`, y con el enum `EventType` fijo del frontend (respaldo con ids negativos en `eventTypesQueryOptions`, en el `.catch` de `CreateQuotationPublic`, y valor inicial `EventType.ALMUERZO_O_CENA`). `EventTypesRepository.usosDe` solo cuenta `quotations`+`consultas`; `entradaDe` devuelve `null` si el tipo no está, y `ConsultasService.embudoPara` trata ese `null` como "no es consulta" (`entrada === 'consulta'` da `false`), así que la solicitud entra igual como cotización. Renombrar/limpiar tipos rompe histórico, Analítica y segmentos; si la API de tipos falla, el formulario público ofrece los 8 tipos fijos aunque la empresa los haya cambiado.

**Evidencia:**
- `api-rest/src/consultas/event-types.repository.ts` — `usosDe` (solo `quotations`+`consultas`), `entradaDe` (`null` si no existe)
- `api-rest/src/consultas/consultas.service.ts` — `embudoPara` (`entrada === 'consulta'`)
- `frontend/src/services/eventTypes.service.ts` — `eventTypesQueryOptions` (catch con ids negativos)
- `frontend/src/pages/quotations/CreateQuotationPublic.tsx`, `QuotationForm.tsx` — `EventType.ALMUERZO_O_CENA` por defecto

#### x1-07 · `client_contacts` sostiene encuesta, cobranza, seguimiento, plan de pagos y portal

`ClientContactsRepository` alimenta `quotations.client_contact_id` (SET NULL, migración 48), `portal_receipts.client_contact_id` (SET NULL, 49), `portal_token` de los botones de correo, y los joins de Payments/Quotations/MarketingRepository. `setPrimary` hace 2 UPDATE separados sin transacción y sin validar que `contactId` pertenezca a `clientId`; `delete` no revisa si la persona es principal ni si tiene cotizaciones/comprobantes; `portal_token` solo se genera en `create()`. Confirmado: la migración 56 insertó 24 personas con columnas (`company_id`, `client_id`, `name`, `email`, `phone`, `is_primary`) sin `portal_token`, y no hay relleno posterior en las migraciones. Borrar la persona principal deja al cliente y sus cotizaciones sin mandante (se apagan seguimientos, cobranza y portal, solo un log de aviso); si el segundo UPDATE de `setPrimary` falla, el cliente queda sin principal.

**Evidencia:**
- `api-rest/src/clients/client-contacts.controller.ts` — `ClientContactsRepository.create`/`delete`/`setPrimary`
- `docs/migrations/36_primary_contact.sql` — `uniq_primary_contact_per_client`
- `docs/migrations/56_persona_principal_garantizada.sql` — `INSERT` sin columna `portal_token`
- `docs/migrations/49_comprobantes_portal.sql` — `client_contact_id ON DELETE SET NULL`

#### x1-08 · El nombre del mandante se guarda como "foto" en `quotations.contact_name`

`QuotationForm` manda `contact_name` (comentario propio: "la cotizacion guarda el nombre como foto en contact_name") en cada guardado vía `editableFields`; `QuotationsRepository.resolveContactId` recalcula `quotations.client_contact_id` comparando el nombre exacto (case-insensitive) contra `client_contacts` del cliente y deja `null` si no calza. Ese campo lo leen `QuotationsCronService.sendQuotationFollowUps`, `PaymentsCronService` (join mandante) y el envío con token del portal. Si en Clientes se corrige el nombre de una persona (tilde, apellido), el siguiente guardado de cualquiera de sus cotizaciones la desvincula: dejan de salir seguimientos, recordatorios de pago y portal, sin nada visible en pantalla.

**Evidencia:**
- `frontend/src/pages/quotations/QuotationForm.tsx` — `editableFields.contact_name`, comentario de "foto"
- `api-rest/src/quotations/quotations.repository.ts` — `resolveContactId` (match exacto case-insensitive)
- `api-rest/src/payments/payments-cron.service.ts` — `checkUpcomingOrOverduePayments` (join mandante)

#### x1-09 · Cinco lectores calculan la deuda de un cliente con reglas distintas

`PaymentsRepository.updateOverduePayments` (cron diario 1AM, sin filtro de company ni `quotation_status`) pasa cuotas `pendiente`→`vencido` solo por fecha. 5 lectores calculan deuda distinto: `HoyRepository.alerts` resta `payment_transactions` y excluye `quotation_status='cancelada'` (`.neq` confirmado); `ClientsRepository.findSummary` trae cuotas SIN excluir `cancelada` y SIN restar `payment_transactions`, y `ClientDetailPage.saldoPendiente` suma `p.amount` completo sin descontar abonos; `MovilService.avisosDeEmpresa` y `QuotationsService.cuotasDe` usan aún otras reglas. Un mismo cliente muestra deuda distinta en Hoy/Dashboard, en su ficha y en la app móvil; cambiar el significado de `status` obliga a tocar 5 lectores fuera del módulo de pagos.

**Evidencia:**
- `api-rest/src/payments/payments.repository.ts` — `updateOverduePayments` (sin `company_id`, sin `quotation_status`)
- `api-rest/src/analytics/hoy.controller.ts` — `.neq('quotations.quotation_status','cancelada')` + resta de `payment_transactions`
- `api-rest/src/clients/clients.repository.ts` — `findSummary` (sin excluir cancelada, sin restar abonos)
- `frontend/src/pages/ClientDetailPage.tsx` — `saldoPendiente = suma de p.amount`

#### x1-10 · El comprobante confirmado desde el portal reintroduce un medio de pago ya unificado

`PortalReceiptsController.confirm` usa literalmente `dto.payment_method || 'Transferencia bancaria'` como `payment_method` del abono; `confirmPortalReceipt` del frontend hace POST con body `{}` (sin `payment_method`), así que todo comprobante confirmado desde el portal cae en ese fallback viejo. La migración 102 (28-08) había unificado 198 abonos de "Transferencia bancaria"→"Transferencia" porque el informe por medio de pago salía partido, y el selector de Post-Venta (`PAYMENT_METHODS`) ya no incluye "Transferencia bancaria". Cada comprobante de portal confirmado reintroduce el problema que resolvió la 102, y al editar ese abono en Post-Venta el selector arranca con un valor fuera de su lista.

**Evidencia:**
- `api-rest/src/quotations/portal-receipts.controller.ts` — `confirm()`: `payment_method: dto.payment_method || 'Transferencia bancaria'`
- `frontend/src/services/portalReceipts.service.ts` — `confirmPortalReceipt` (POST con `{}`)
- `docs/migrations/102_unificar-medios-de-pago.sql` — 198 filas migradas
- `frontend/src/pages/postventa/PostVentaPage.tsx` — `PAYMENT_METHODS` (sin "Transferencia bancaria")

#### x1-11 · Compras escribe 4 columnas de `quotations` que leen Dashboard y Post-Venta

Compras (`ComprasTab` vía `LogisticsRepository.markProvisioned`/`clearProvisioned`) escribe 4 columnas de la tabla del Cotizador (`quotations.provisioned_at`/`cost`/`people`/`services`), que leen `DashboardPage` (comentario propio "congela SOLO insumos"), `GestionTab` y `ServiciosTab` de Post-Venta. Confirmado en código: `markProvisioned` NO llama `assertEventosEditables`; `clearProvisioned` sí la llama — asimetría real y deliberada. Si se cambia `servicesSignature` o los nombres de `items` (ej. al renombrar un servicio y regrabar la cotización), Gestión muestra avisos falsos de "servicio agregado/quitado" en eventos ya provisionados; leer `provisioned_cost` como costo total del evento infla el margen; unificar el candado de evento realizado rompería la asimetría a propósito.

**Evidencia:**
- `api-rest/src/logistics/logistics.repository.ts` — `markProvisioned` (sin `assertEventosEditables`), `clearProvisioned` (con `assertEventosEditables`)
- `frontend/src/pages/logistica/components/ComprasTab.tsx` — `servicesSignature(ev.items)`
- `frontend/src/pages/dashboard/DashboardPage.tsx` — comentario "congela SOLO insumos"

#### x1-12 · El listado de cotizaciones usa una lista manual de columnas, no SELECT *

`QuotationsRepository.findAll` usa una lista manual de columnas (`COLUMNAS_LISTA`, con el comentario propio "OJO: columna nueva en la tabla ⇒ agregarla acá") en vez de `SELECT *`; ese listado es todo lo que ven Dashboard y tableros del listado de cotizaciones, aunque columnas como `provisioned_*` las escriba Logística, `survey_sent_at` la encuesta, y `sent_at`/`harvest_status`/`recontacted_at` el seguimiento. `findOne` sí trae todo. Una columna nueva funciona en el detalle pero llega vacía (`undefined`) a cualquier listado sin error visible; si se borra o renombra una columna y se olvida sacarla de `COLUMNAS_LISTA`, el listado completo cae con error de PostgREST por columna inexistente.

**Evidencia:**
- `api-rest/src/quotations/quotations.repository.ts` — `findAll`, `const COLUMNAS_LISTA` y su comentario de encabezado

#### x1-13 · Nadie sella `updated_at` de cotizaciones desde el código

Nadie sella `quotations.updated_at` desde el código (solo `DEFAULT now()` en `0_initial_models.sql`; los únicos triggers en migraciones son `people_touch_updated_at_trg`-68 y `event_staff_touch_updated_at_trg`-71, ninguno sobre `quotations`); `HoyRepository.alerts` arma la tarjeta "enviadas" filtrando `.lt('updated_at', hace7)` y calcula `oldestDays` desde ese campo, sin usar `sent_at` (que sí se sella al enviar, migración 51). Confirmado además: CLAUDE.md cita `frontend/databaseSchema/database_schema.sql` como foto del esquema y ese archivo no existe en el repo. Si no hay trigger en Supabase, "enviadas sin respuesta hace X días" cuenta desde la creación, no desde el envío; si hay un trigger no versionado, cualquier escritura de otro módulo sobre la cotización reinicia el contador. Pregunta abierta: si existe en Supabase un trigger sobre `updated_at` no registrado como migración.

**Evidencia:**
- `api-rest/src/analytics/hoy.controller.ts` — `alerts()`, `.lt('updated_at', hace7)`, `oldestDays`
- `docs/migrations/0_initial_models.sql` — `updated_at DEFAULT now()`, sin trigger
- `docs/migrations/68_personas.sql`, `71_asignacion_de_personas_por_dia.sql` — únicos `CREATE TRIGGER` del repo
- CLAUDE.md — cita `frontend/databaseSchema/database_schema.sql`, archivo inexistente en el repo

#### x1-14 · El orden del menú se escribe por 4 caminos sobre las mismas columnas

El orden del menú se escribe por 4 caminos sobre las mismas columnas (`section_id`/`sort_order`, `is_default`): `SectionsRepository` (`setLinkSection`/`delete`/`setDefault`), `ServicesRepository` (`updateLinkSortOrder`/`updateFixedServicePlacement`) y las RPC SQL `reorder_fixed_services`/`reorder_services_in_category` (migración 55, con su propio filtro de `company_id` embebido). `SectionsRepository.delete` borra la sección sin revisar si tiene servicios; las FK hacia `category_sections` (24) y `fixed_service_sections` (53) son `ON DELETE SET NULL`. `setDefault`, igual que `setPrimary` de contactos, hace 2 UPDATE separados sin transacción. Borrar una sección con servicios los manda en bloque a "Sin sección" sin aviso; una regla nueva agregada solo en TypeScript no se replica en las 2 funciones SQL, que la ignoran; si el segundo paso de `setDefault` falla, la categoría queda sin sección por defecto.

**Evidencia:**
- `api-rest/src/services/sections.controller.ts` — `SectionsRepository.delete` (sin chequeo de uso), `setDefault` (2 UPDATE)
- `api-rest/src/services/services.repository.ts` — `updateLinkSortOrder`, `updateFixedServicePlacement`
- `docs/migrations/55_reorden_en_un_viaje.sql` — `reorder_fixed_services`, `reorder_services_in_category`
- `docs/migrations/24_category_sections.sql`, `53_secciones_servicios_fijos.sql` — `ON DELETE SET NULL`

#### x1-15 · `next_quotation_number` es la única fuente de la numeración de cotizaciones

`next_quotation_number` (migración 38) es la única fuente que escribe `company_quotation_counters` (`INSERT...ON CONFLICT DO UPDATE` con `GREATEST` contra el MAX real), y el único llamador es `QuotationsRepository.nextQuotationNumber` desde `QuotationsService.create`. La tabla tiene RLS sin políticas y la función tiene `REVOKE EXECUTE` para `anon`/`authenticated` (confirmado literal), sostenida además por la `UNIQUE (company_id, quotation_number)`. Cualquier camino nuevo que inserte cotizaciones calculando "último+1" por su cuenta reintroduce la carrera que resolvió la 38, pero ahora termina en error por la UNIQUE; si al rearmar la base se pierden la UNIQUE o los permisos de la función, la garantía se pierde sin que el código lo note.

**Evidencia:**
- `docs/migrations/38_numero_cotizacion_unico.sql` — `company_quotation_counters`, `next_quotation_number` (`GREATEST`, `REVOKE EXECUTE`), `quotations_company_number_unique`
- `api-rest/src/quotations/quotations.repository.ts` — `nextQuotationNumber`
- `api-rest/src/quotations/quotations.service.ts` — `create` (única llamada)

#### x1-16 · El candado de borrado de una cotización no menciona las tablas que se van en cascada

`QuotationsRepository.remove`→`assertDeletable` solo revisa `payment_transactions`, `refunds`, `payments` y `customer_satisfaction_survey_responses` (las `NO ACTION` que bloquean el DELETE); las que tienen `ON DELETE CASCADE` hacia `quotations` (`event_documents`-8, `event_supply_provisions`-16, `event_resources`-17, `cocina`-22/28, `portal_receipts`-49, `quotation_followups`-59, `event_staff`-71, `staff_sheets`/`tip_pools`/`person_reviews`/`day_notes`-79) se borran en cascada sin que `assertDeletable` las mencione (comentario propio: "OJO SI SE AGREGA OTRA TABLA... hay que sumarla ACÁ TAMBIÉN"). `kitchen_checklist_marks` (44) tiene `quotation_id uuid NOT NULL` sin FK: queda huérfana, ni siquiera cae en cascada. La migración 79 trae en su encabezado "Aplicada en PRODUCCIÓN: pendiente (paquete 68→79)". Relajar `assertDeletable` pierde historia de Personas (`event_staff.payroll_id`) y Seguimiento sin aviso; una tabla hija nueva sin decidir su `ON DELETE` deja la cotización imposible de borrar con un 500 (ya ocurrió en laboratorio el 15-08 con `staff_sheets`). Pregunta abierta: si la migración 79 está aplicada en producción. Ver también x2-17, x4-03.

**Evidencia:**
- `api-rest/src/quotations/quotations.repository.ts` — `assertDeletable` (solo 4 tablas `NO ACTION`)
- `docs/migrations/79_cascada_de_las_tablas_nuevas.sql` — encabezado "Aplicada en PRODUCCIÓN: pendiente", 4 FK CASCADE
- `docs/migrations/44_cocina_checklist.sql` — `kitchen_checklist_marks.quotation_id uuid NOT NULL` sin `REFERENCES`

#### x1-17 · El correo de clientes viejos sigue viviendo en `clients.email`, no en las personas

`ClientsService.create` manda correo/teléfono de la persona a `client_contacts` (comentario propio en `clients.repository.ts`: "Fuente de verdad = las PERSONAS (31-07)... el espejo de la ficha quedó jubilado"); pero la rama por defecto de audiencias de Marketing (`MarketingService.candidatosDeUna` cuando `audiencia_tipo='clientes'`) sigue leyendo `MarketingRepository.clientesPorTipo`/`tiposDeCliente`, que consultan `clients.email` directamente (confirmado: `.select('email, name, client_type')` sobre `clients`), no `client_contacts`. Los segmentos nuevos (`AudienciasService.resolverSegmentoDe`) sí cruzan `client_contacts` vía `contactosDeClientes`. Una campaña antigua o programada con `audiencia_tipo='clientes'` no llega a clientes cuyo correo solo vive en la persona (creados después del 31-07), y el conteo "con correo" por tipo sale bajo; si se "limpia" `clients.email` creyéndolo muerto, esa rama queda sin destinatarios. No verificado qué manda hoy el formulario de clientes en el campo `email` de `clients`.

**Evidencia:**
- `api-rest/src/marketing/marketing.service.ts` — `candidatosDeUna` (rama final `clientesPorTipo`)
- `api-rest/src/marketing/marketing.repository.ts` — `clientesPorTipo`/`tiposDeCliente` (`.from('clients').select('email,...')`)
- `api-rest/src/clients/clients.repository.ts` — comentario "Fuente de verdad = las PERSONAS (31-07)"
- `api-rest/src/marketing/audiencias.service.ts` — `resolverSegmentoDe` (cruza `client_contacts`)

### x2 — Efectos automáticos

#### x2-01 · Apagar los relojes con NODE_ENV no apaga dos palancas de arranque

`ScheduleModule.forRoot({cronJobs: NODE_ENV==='production'})` en `app.module.ts` solo apaga los métodos `@Cron`. Fuera de esa llave: `BackupCronService.onModuleInit` (setTimeout de 20s con su propio getter `enabled` que repite el mismo chequeo de `NODE_ENV`) y `QuotationsCronService.onApplicationBootstrap` (corre `sendQuotationFollowUps` si `RUN_FOLLOWUPS_ON_BOOT=1`, sin mirar `NODE_ENV` en absoluto). Además 2 relojes `@Cron` viven fuera de archivos `*-cron.service.ts`: `PaymentsService.updateOverduePayments` (`payments.service.ts`) y `MovilService.cicloAvisos` (`movil.service.ts`). No hay `pg_cron`/`pg_net`/`cron.schedule`/`net.http_post` en ningún `.sql` del repo: todos los relojes viven en el proceso Nest. CLAUDE.md nombra `analyitics-cront.service.ts` como ejemplo de `*-cron.service.ts` y ese archivo no existe (solo `consultas-`, `payments-`, `marketing-`, `quotations-` y `backup-cron.service.ts`). Quien busque relojes por nombre de archivo no ve 2 de los 9; apagar el laboratorio cambiando `NODE_ENV` no apaga la palanca de arranque, que sigue viva y manda seguimientos a mandantes reales si `RUN_FOLLOWUPS_ON_BOOT` está puesto.

**Evidencia:**
- `api-rest/src/app.module.ts` — `ScheduleModule.forRoot({cronJobs: NODE_ENV==='production'})`
- `api-rest/src/backup/backup-cron.service.ts` — `onModuleInit`, getter `enabled` (`NODE_ENV`)
- `api-rest/src/quotations/quotations-cron.service.ts` — `onApplicationBootstrap` (`RUN_FOLLOWUPS_ON_BOOT`, sin chequeo de `NODE_ENV`)
- `api-rest/src/payments/payments.service.ts` — `updateOverduePayments @Cron(EVERY_DAY_AT_1AM)`, fuera de archivo `*-cron`
- `api-rest/src/movil/movil.service.ts` — `cicloAvisos @Cron('*/30 * * * *')`, fuera de archivo `*-cron`
- CLAUDE.md — sección Cron, menciona `analyitics-cront.service.ts` (inexistente)

#### x2-02 · Solo 2 de 5 relojes que mandan correo tienen candado atómico

De los relojes que envían correo/push, solo `MarketingRepository.tomarProgramada` y `ConsultasRepository.tomarEnvio` tienen candado atómico (UPDATE condicionado por estado, confirmado literal), y marcan ANTES de enviar sin reintento si falla. `PaymentsCronService.checkUpcomingOrOverduePayments` (cobranza), `QuotationsCronService.sendQuotationFollowUps` (seguimiento) y `sendWeeklyDigest` (resumen) no tienen candado ni registro de envío: confirmado que `sendQuotationFollowUps` solo filtra por ventana de fecha (`findFollowUps`) sin marcar nada, y `checkUpcomingOrOverduePayments` solo consulta por status/fecha y envía, sin ningún UPDATE de por medio. El envío con PDF (`EnvioCotizacionService.enviar`) se protege con un Set en memoria (`enviosEnCurso`), que no cruza instancias del proceso. Con dos instancias en Railway, o un reinicio que coincide con el tick de las 11:00 UTC teniendo `RUN_FOLLOWUPS_ON_BOOT` puesto, la cobranza, el seguimiento y el resumen semanal pueden salir duplicados a clientes reales.

**Evidencia:**
- `api-rest/src/marketing/marketing.repository.ts` — `tomarProgramada` (UPDATE condicional atómico)
- `api-rest/src/consultas/consultas.repository.ts` — `tomarEnvio` (UPDATE condicional atómico)
- `api-rest/src/payments/payments-cron.service.ts` — `checkUpcomingOrOverduePayments` (sin candado ni marca)
- `api-rest/src/quotations/quotations-cron.service.ts` — `sendQuotationFollowUps` (`findFollowUps` por ventana de fecha, sin marca), `sendWeeklyDigest` (sin marca)
- `api-rest/src/quotations/envio-cotizacion.service.ts` — `enviosEnCurso` (Set en memoria, por proceso)

#### x2-03 · Cambiar el total de una cotización aceptada mueve plata real, sin transacción

Cualquier `PATCH /quotations/:id` que traiga `total_amount` sobre una cotización "aceptada" (`QuotationsService.update`) dispara, sin transacción, una cascada sobre `payments` y `refunds` según el estado GUARDADO (no el nuevo): si baja el total descuenta cuotas pendientes desde la última o crea un reembolso; si sube, consume primero los reembolsos pendientes y luego agranda la última cuota o crea una nueva ("Pago creado por diferencia de total_amount"). Pasan por acá `ServiciosTab.save`, `QuotationForm`, `EventoCajitas`, `NegocioPage`, `QuotationsPage.applyStatusChange` y `RequestForm`. `total_amount=0` no activa la cascada (chequeo `d.total_amount && ...`), y si el mismo parche baja a pre-venta y cambia el total, primero se borra el plan de pagos (guardia de estados) y después nace un reembolso/cuota sobre una cotización que ya no es post-venta. Quien agregue una pantalla que mande el total con un peso de diferencia mueve plata real.

**Evidencia:**
- `api-rest/src/quotations/quotations.service.ts`: `QuotationsService.update` (`PRE_SALE_STATUSES`/`POST_SALE_STATUSES`, bloques 2.1 y 2.2, `void QUOTATION_IS_SENT`)
- `api-rest/src/payments/payments.service.ts`: `deletePaymentPlan`, `update`, `createPayment`
- `api-rest/src/refunds/refunds.service.ts`: `create`, `findPendingByQuotation`, `updateAmount`, `remove`
- `frontend/src/pages/quotations/QuotationForm.tsx`: `editableFields` (`quotation_status` + `total_amount` + `contact_name`)
- `frontend/src/pages/postventa/ServiciosTab.tsx`: `save`
- `frontend/src/components/AvisoPlanDePagos.tsx`

#### x2-04 · El freno del autoguardado de Servicios puede quedar apagado por una carrera de red

El freno `if (planVivo) return` de `ServiciosTab.autoGuardar` depende de `pagosQuery` (queryKey `['payments', quote.id]`, `enabled` solo si aceptada). Mientras esa consulta carga, reintenta (`retry:2` por defecto en `queryClient.ts`) o falla, `pagosQuery.data` es `undefined`, `planVivo` da `false` y el autoguardado queda ENCENDIDO aunque la cotización tenga cuotas — y `AvisoPlanDePagos` tampoco aparece (retorna `null` sin cuotas). `save` manda siempre `total_amount`. Con red lenta o un error del GET de pagos, editar una aceptada con plan de pagos dispara la cascada de x2-03 a medio editar, sin el aviso ámbar.

**Evidencia:**
- `frontend/src/pages/postventa/ServiciosTab.tsx`: `pagosQuery`, `planVivo`, `autoGuardar`, `save`
- `frontend/src/lib/queryClient.ts`: `defaultOptions.queries.retry = 2`
- `frontend/src/components/AvisoPlanDePagos.tsx`: retorna `null` si `cuotas.length === 0`

#### x2-05 · Rehacer el plan de pagos salta el candado de "realizada" y puede revivir una cancelada

`PaymentPlanEditor` → `PaymentsService.createPaymentPlan` graba "aceptada" directo por `QuotationsRepository.update`, saltándose el candado de "realizada" y la cascada de x2-03, y puede revivir una "cancelada". Antes de insertar borra con `deletePaymentsByQuotationId` sin revisar el resultado y sin filtrar por `company_id` en la query (solo `.eq('quotation_id', ...)`); como `payment_transactions_payment_id_fkey` no tiene `ON DELETE`, con abonos el borrado falla en silencio y el insert duplica las cuotas. El correo `PAYMENT_PLAN_CREATED` solo sale si la cotización NO estaba ya "aceptada", así que rehacer el plan de un evento ya aceptado no le avisa al cliente.

**Evidencia:**
- `api-rest/src/payments/payments.service.ts`: `createPaymentPlan` (portero de suma, pasos 1, 2, 4 y 5)
- `api-rest/src/payments/payments.repository.ts`: `deletePaymentsByQuotationId` (sin `.eq company_id`)
- `docs/migrations/0_initial_models.sql`: `payment_transactions_payment_id_fkey` sin `ON DELETE`
- `frontend/src/pages/quotations/QuotationsPage.tsx`: `applyStatusChange`

#### x2-06 · Los dos caminos a "enviada" no sellan lo mismo ni avisan igual

Hay dos caminos a "enviada" con comportamiento distinto: el desplegable (`QuotationsService.update`) manda el correo `QUOTATION_IS_SENT` y sella `sent_at`; el botón "Enviar cotización" (`EnvioCotizacionService.enviarDeVerdad`), desde el 10-09 a propósito (comentario fechado en el código), mueve el estado directo por el repositorio para no disparar la cascada de x2-03 — así que NO sella `sent_at` ni manda ese correo. `QuotationsRepository.findFollowUps` (seguimiento comercial días 7/14) exige `sent_at`, así que lo enviado con el botón —hoy el camino principal, tras dar de baja el botón de Outlook el 05-09— nunca entra al seguimiento comercial, aunque sí lo ve el push de "cotización fría" (que usa `created_at`).

**Evidencia:**
- `api-rest/src/quotations/envio-cotizacion.service.ts`: `enviarDeVerdad` (comentario 10-09-2026, `ESTADO_ANTES_DE_ENVIAR`/`ESTADO_TRAS_ENVIAR`)
- `api-rest/src/quotations/quotations.service.ts`: `update` (`QUOTATION_IS_SENT` y `sent_at`)
- `api-rest/src/quotations/quotations.repository.ts`: `findFollowUps` (`.gte`/`.lt sent_at`)
- `api-rest/src/movil/movil.service.ts`: `avisosDeEmpresa` (`created_at`)

#### x2-07 · El mandante de una cotización se fija por nombre exacto, no por correo

`quotations.client_contact_id` (de quien dependen encuesta, cobranza, seguimiento, plan de pagos y portal) lo fija `QuotationsRepository.resolveContactId` por NOMBRE EXACTO (trim + minúsculas; las tildes cuentan). `QuotationsService.createPublic` matchea al cliente existente solo por correo y NO agrega al solicitante como contacto; `ConsultasService.convertir` lo agrega solo si el correo no está ya entre los contactos del cliente. Si el correo ya existía con el nombre escrito distinto, el primer guardado en el cotizador (`resolveContactId`) no encuentra calce y la cotización nace sin mandante — sin error visible: no salen la encuesta, la cobranza ni el portal para esa persona.

**Evidencia:**
- `api-rest/src/quotations/quotations.repository.ts`: `resolveContactId`, `findContactPortalToken`
- `api-rest/src/quotations/quotations.service.ts`: `create` (`resolveContactId`), `createPublic`
- `api-rest/src/consultas/consultas.service.ts`: `convertir` (`yaEsta` por correo, `contact_name: c.name`)

#### x2-08 · La encuesta puede quedar "enviada" sin que el correo haya salido nunca

`QuotationsService.markEventDone` manda la encuesta `CUSTOMER_SATISFACTION_SURVEY` con `await` y estampa `survey_sent_at` si `EmailService.sendEmail` no lanzó excepción — pero `sendEmail` vuelve SIN lanzar cuando la casilla de notificación está apagada (`shouldSendEmail`), cuando no pudo leer la empresa, con `EMAILS_SILENCED=1`, o cuando Resend devolvió error (solo se loguea, `if (resendError) this.logger.error(...)`, sin throw). `unmarkEventDone` no borra el sello. Una respuesta pública en `customer_satisfaction_survey_responses` bloquea para siempre `QuotationsRepository.assertDeletable`, así que un correo que nunca llegó puede dejar un evento con la encuesta "enviada" sin reintento posible.

**Evidencia:**
- `api-rest/src/quotations/quotations.service.ts`: `markEventDone`, `unmarkEventDone`
- `api-rest/src/email/email.service.ts`: `sendEmail` (`EMAILS_SILENCED`, `shouldSendEmail`, `resendError` solo logueado)
- `api-rest/src/quotations/quotations.repository.ts`: `assertDeletable` (`customer_satisfaction_survey_responses`)

#### x2-09 · El cron de la 1 AM marca vencido antes de que el aviso de "vence hoy" pueda salir

`PaymentsService.updateOverduePayments` (`@Cron EVERY_DAY_AT_1AM`, sin zona horaria fijada) pasa a "vencido" TODA cuota "pendiente" vencida en TODAS las empresas: el repositorio solo filtra por `status` y `due_date`, sin `company_id` ni join al estado de la cotización. Los avisos de `PaymentsCronService` corren a las 11 AM sobre fechas exactas (hoy+3, hoy, hoy-7); como la 1 AM ya marcó "vencido" lo que vence hoy, el aviso de "vence hoy" probablemente nunca sale. Tocar la hora del cron o la regla de vencido cambia qué clientes reciben cobranza, y un motor caído a las 11:00 UTC pierde ese toque sin dejar rastro.

**Evidencia:**
- `api-rest/src/payments/payments.repository.ts`: `updateOverduePayments` (`.eq status pendiente`, `.lte due_date`, sin `company_id`)
- `api-rest/src/payments/payments.service.ts`: `@Cron(EVERY_DAY_AT_1AM) updateOverduePayments`
- `api-rest/src/payments/payments-cron.service.ts`: `@Cron(EVERY_DAY_AT_11AM) checkUpcomingOrOverduePayments`
- `api-rest/src/payments/constants/index.ts`: `UPCOMING_OVERDUE_PAYMENTS_DAYS_NOTIFICATION`, `OVERDUE_PAYMENTS_DAYS_NOTIFICATION`

#### x2-10 · El push de cobranza llega a Recepción aunque no vea esa sección

`MovilService.cicloAvisos` (`@Cron` cada 30 min) empuja a TODOS los `push_devices` de la empresa sin filtrar por rol: `destinos` filtra solo por `company_id` y `MovilController.registrar`/`registrarDispositivo` no tiene `@Roles`. Recepción, que en `frontend/src/constants/permissions.ts` no ve las secciones `payments` ni `dashboard`, recibe igual avisos tipo "Pago vencido". El insert en la tabla `notifications` va ANTES del envío push: si éste falla con un código distinto de 404/410 (que sí borra la suscripción muerta), el aviso queda marcado como enviado y no se reintenta.

**Evidencia:**
- `api-rest/src/movil/movil.service.ts`: `cicloAvisos` (`destinos` filtra solo por `company_id`), `empujar` (404/410 borra `push_devices`)
- `api-rest/src/movil/movil.controller.ts`: `MovilController` sin `@Roles`
- `frontend/src/constants/permissions.ts`: `recepcion` sin `payments` ni `dashboard`

#### x2-11 · El webhook de bajas solo protege a Marketing; brochures y PDFs no registran rebotes

El webhook de Resend (`BajasService.procesarEventoResend`) solo sella filas de `marketing_sends` buscándolas por `resend_id`, y la supresión que genera en `marketing_suppressions` solo la consultan los envíos de marketing (`repo.suprimidos`, usado únicamente dentro del módulo marketing). Los correos de `EmailService`, el brochure (`ConsultasService.enviarBrochure`) y los envíos con PDF no guardan `resend_id`, así que sus rebotes o quejas no quedan registrados en ninguna parte y esos flujos le siguen escribiendo a casillas que ya rebotaron o reclamaron. En producción, sin `RESEND_WEBHOOK_SECRET` el webhook rechaza todo (fail-closed) y `validateEnv` solo lo advierte en el log.

**Evidencia:**
- `api-rest/src/marketing/bajas.service.ts`: `verificarFirmaSvix`, `procesarEventoResend`
- `api-rest/src/marketing/marketing.repository.ts`: `marcarEvento` (filtra por `resend_id`), `suprimir`
- `api-rest/src/consultas/consultas.service.ts`: `enviarBrochure` (sin consultar supresiones)
- `api-rest/src/config/validate-env.ts`: `RESEND_WEBHOOK_SECRET` solo advertido

#### x2-12 · Marcar un tipo de evento como "consulta" apaga los correos y el push de solicitud nueva

Marcar un `event_types.entrada` como "consulta" (`EventTypesRepository.entradaDe`) hace que `QuotationsService.createPublic` retorne antes de crear cliente y cotización: no salen los correos `NEW_PUBLIC_QUOTATION_CLIENT` ni `NEW_PUBLIC_QUOTATION_ADMIN`, y el push de "Nueva solicitud" (que lee la tabla `quotations`) tampoco ve esa entrada. La consulta agenda el brochure a 10 minutos (`RETRASO_DEL_CORREO_MS`) y `ConsultasCronService.despachar` solo toma consultas de las últimas 24 horas (`pendientesDeEnvio`, límite 20/min); un motor caído más de 24 horas, o un fallo de Resend, deja consultas marcadas "respondida" que nunca recibieron nada, sin reintento.

**Evidencia:**
- `api-rest/src/quotations/quotations.service.ts`: `createPublic` (rama `esConsulta`)
- `api-rest/src/consultas/event-types.repository.ts`: `entradaDe`
- `api-rest/src/consultas/consultas.repository.ts`: `pendientesDeEnvio` (`gte created_at 24h`, `limit 20`)
- `api-rest/src/consultas/consultas-cron.service.ts`: `despachar` (`EVERY_MINUTE`)

#### x2-13 · El despacho de campañas programadas deja la campaña en borrador si algo falla a medio camino

`MarketingCronService.despacharProgramadas` (`@Cron` cada minuto) toma campañas "programada" vencidas y, vía `tomarProgramada`, las deja en "borrador" con `programada_para` limpio ANTES de despachar. Después llama al mismo `MarketingService.enviarCampana` que usa el botón manual, que recalcula la audiencia en ese instante (restando supresiones y ya-enviados) y agrega copia para quien programó. Si `companies.findOne` falla con un error distinto de `PGRST116`, el catch deja la campaña en "borrador" SIN enviar nada (no hay envío con marca genérica). Un deploy a mitad de un despacho deja la campaña en "borrador" con envíos parciales y sin aviso en pantalla.

**Evidencia:**
- `api-rest/src/marketing/marketing-cron.service.ts`: `despacharProgramadas`
- `api-rest/src/marketing/marketing.repository.ts`: `programadasVencidas`, `tomarProgramada`
- `api-rest/src/marketing/marketing.service.ts`: `enviarCampana` (`suprimidos`, `yaEnviados`, `copiaPara`)

#### x2-14 · El respaldo diario bloquea el proceso entero justo en los reinicios

`BackupCronService` respalda TODAS las tablas de `get_backup_tables()` (función SQL que no vive en `docs/migrations`) a las 07:00 UTC y además 20s después de cada arranque si falta el respaldo de hoy, usando `JSON.stringify` + `gzipSync` SÍNCRONO, que bloquea el proceso (peticiones y crons de cada minuto) justo en los reinicios/deploys. Si una tabla falla al leerse, el bucle hace `break` solo para esa tabla, pero el respaldo igual se anota "BACKUP OK". `cleanupOld` borra permanentemente los archivos que calcen con el patrón de nombre y tengan más de 30 días.

**Evidencia:**
- `api-rest/src/backup/backup-cron.service.ts`: `onModuleInit` (+20s), `dailyBackup` (`@Cron 0 7 * * *`), `runBackup`, `cleanupOld`
- `docs/migrations/`: `get_backup_tables` no aparece en ningún archivo

#### x2-15 · La caché del panel no se borra en crons, rutas públicas ni con más de una instancia

`PanelInvalidationInterceptor` (global vía `APP_INTERCEPTOR`) solo borra `cachePanel` (`memoria.ts`, TTL de 1 hora vía `HORA_MS`, en RAM del proceso) cuando un POST/PATCH/DELETE con `req.user.company_id` termina bien — si el método es GET o no hay `req.user` (rutas `@Public` y crons), no invalida nada. NO lo borran: el cron de la 1 AM que vence cuotas, `createPublic`, la respuesta pública de la encuesta, los comprobantes del portal, el webhook de Resend, ni los crons de consultas/marketing/push. Con más de una instancia tampoco se comparte: una escritura borra el panel solo en la instancia que la recibió. Agregar una escritura nueva en un cron o ruta pública deja el Dashboard mostrando cifras de hasta una hora antes.

**Evidencia:**
- `api-rest/src/cache/panel-invalidation.interceptor.ts`: `intercept` (solo con `req.user.company_id`, no en GET)
- `api-rest/src/cache/memoria.ts`: `cachePanel`, `HORA_MS`, `invalidarPanelEmpresa` (Map en proceso)
- `api-rest/src/analytics/analytics.service.ts`: `cachePanel.set(..., HORA_MS)`

#### x2-16 · Abrir una ficha de evento inserta planta; cambiar la fecha del evento no la mueve

Abrir una ficha de evento no cerrada en `FichasTab` (queryFn con `staleTime 0`) llama a `traerPlantaAlEvento` e inserta filas "planta" confirmadas en `event_staff` para los días del evento — repitiéndose con `retry:2` y `refetchOnWindowFocus:true` (config global de `queryClient.ts`). `SemanaTab` proyecta toda la planta una sola vez por sesión del navegador (`sessionStorage 'planta-proyectada'`); crear o editar una persona reproyecta sus turnos vía `proyectarSiCorresponde`. `QuotationsService.update` NO toca `event_staff` cuando cambia la fecha del evento, así que cambiar la fecha después de abrir la ficha deja filas de planta colgando en los días viejos.

**Evidencia:**
- `frontend/src/pages/personas/FichasTab.tsx`: `useQuery ['people','staff-evento', evento.id]`, `staleTime 0`, llama `traerPlantaAlEvento` si `!cerrada`
- `frontend/src/pages/personas/SemanaTab.tsx`: `useEffect` con `proyectarPlanta` y `sessionStorage 'planta-proyectada'`
- `api-rest/src/people/people.service.ts`: `traerPlantaAlEvento`, `proyectarTodaLaPlanta`, `proyectarSiCorresponde`, `cerrarFicha`

#### x2-17 · El candado de borrado cuenta 4 tablas; el resto se va por cascada sin aviso

`QuotationsRepository.assertDeletable`, el candado de `DELETE /quotations/:id`, solo cuenta `payment_transactions`, `refunds`, `payments` y `customer_satisfaction_survey_responses`. Todo lo demás se va por `ON DELETE CASCADE` de la base: documentos, provisiones/recursos, cocina, comprobantes del portal, bitácora comercial y —clave— `staff_sheets`, `tip_pools`, `person_reviews` y `day_notes`, cuyo CASCADE lo agregó recién la migración 79, cuyo encabezado dice literalmente "Aplicada en PRODUCCIÓN: pendiente". Si esa migración no corrió en producción, borrar una cotización con ficha de personal abierta falla con un 500 crudo; si corrió, se borra sin preguntar si hay jornadas o propinas ya selladas en nómina.

**Evidencia:**
- `api-rest/src/quotations/quotations.repository.ts`: `assertDeletable` (4 tablas contadas)
- `docs/migrations/79_cascada_de_las_tablas_nuevas.sql`: header "Aplicada en PRODUCCIÓN: pendiente"; agrega CASCADE a `staff_sheets`, `tip_pools`, `person_reviews`, `day_notes`
- `docs/migrations/71_asignacion_de_personas_por_dia.sql`: `event_staff.quotation_id` ya con `ON DELETE CASCADE` desde origen
- `docs/migrations/77_ciclo_propinas_nomina.sql`: `event_staff.payroll_id`, `tip_payroll_id`

### x3 — Refresco de la app

#### x3-01 · Servicios no se resincroniza si `quote` cambia después de montar la pantalla

`ServiciosTab` copia `quote` a estado local (`varGroups`, `fixed`, `adultsN`, `kidsN`) SOLO en el inicializador de `useState`, sin ningún efecto que lo recopie cuando `quote` cambia (sus únicos efectos son provisión, clic-afuera y autoguardado). `PostVentaPage` y `NegocioPage` lo montan sin prop `key`, leyendo la cotización desde `['quotation', id]` con `staleTime 0` pero con `qLoading = quoteQuery.isPending` (falso si ya hay caché, aunque esté refrescando en segundo plano). `QuotationForm.handleSubmit` no invalida `['quotation', id]` en ningún punto de su flujo de guardado: editar en el cotizador y volver a Servicios dentro del `gcTime` de 30 min puede pisar cambios de otra pantalla al guardar, y `assertMoneyMatches` no lo detecta porque solo exige que el payload cuadre consigo mismo, no contra la base.

**Evidencia:**
- `frontend/src/pages/postventa/ServiciosTab.tsx`: `useState(() => deep(quote.items...))` sin efecto de resync
- `frontend/src/pages/postventa/PostVentaPage.tsx`: `quoteQuery ['quotation', event.quotationId]` `staleTime 0`, `qLoading = isPending`, `<ServiciosTab>` sin `key`
- `frontend/src/pages/quotations/NegocioPage.tsx`: `<ServiciosTab quote={detalle}>` sin `key`
- `frontend/src/pages/quotations/QuotationForm.tsx`: `handleSubmit` sin `invalidateQueries(['quotation',...])`

#### x3-02 · Cocina puede mostrar una hora "deshecha" hasta recargar la pantalla

`FichaCocinaSection` copia horas/notas/impresiones del día a estado local UNA vez por evento, en un `useEffect` con deps `[quotationId, cocinaLoaded]`; `saveTime`/`addNote`/`removeNote` escriben al motor pero nunca llaman `invalidateQueries` ni `setQueryData` sobre la caché. `CocinaTab` se desmonta al cambiar de pestaña en `PostVentaPage` (`{tab === 'cocina' && ...}`); al volver, el efecto de montaje copia lo que haya en caché en ese instante y, aunque la consulta (`staleTime 0`) traiga después la versión buena, `cocinaLoaded` ya es `true` y el efecto no vuelve a correr. La hora recién guardada aparece "deshecha" hasta recargar o hasta vencer el `gcTime` de 30 min; la invalidación que hace `ResumenDelDia.guardarHora` llega a la caché pero no repinta la pantalla ya montada.

**Evidencia:**
- `frontend/src/pages/postventa/FichaCocinaSection.tsx`: `cocinaQuery ['postventa','cocina',companyId,quotationId]`, `useEffect` deps `[quotationId, cocinaLoaded]`, `saveTime`/`addNote`/`removeNote` sin invalidación
- `frontend/src/pages/postventa/PostVentaPage.tsx`: `{tab === 'cocina' && <CocinaTab quote={quote} />}`
- `frontend/src/pages/personas/ResumenDelDia.tsx`: `guardarHora` invalida `['postventa','cocina']`
- `frontend/src/lib/queryClient.ts`: `gcTime 30*60_000`

#### x3-03 · La sincronía Cocina↔Resumen del día solo funciona en un sentido

`FichaCocinaSection.saveTime` (`setEventServiceTime`) no invalida ninguna query. Solo `ResumenDelDia.guardarHora` invalida `['people','horarios-servicios', id]` y `['postventa','cocina']` — la sincronía pedida por Felipe el 15-08 ("lo que pongo en Cocina se ve en el Resumen, y viceversa") solo funciona en un sentido. La query de `['people','horarios-servicios', id]` en `ResumenDelDia` no fija `staleTime` pese al comentario "Sin caché" junto a ella, así que hereda los 30s globales de `queryClient.ts`: una hora cambiada en Cocina puede tardar hasta 30s en verse en el Resumen del día, y más si la hoja sigue abierta sin recuperar el foco.

**Evidencia:**
- `frontend/src/pages/personas/ResumenDelDia.tsx`: `useQueries ['people','horarios-servicios', evento.id]` sin `staleTime` propio (comentario "Sin caché"); `guardarHora.onSuccess`
- `frontend/src/pages/postventa/FichaCocinaSection.tsx`: `saveTime → setEventServiceTime`, sin invalidación
- `frontend/src/lib/queryClient.ts`: `staleTime 30_000` por defecto

#### x3-04 · El Resumen del día lee la cotización por una llave que nadie invalida

`ResumenDelDia` pide la cotización completa bajo su propia llave `['people','evento-items', evento.id]` (`staleTime` 5 min) con `getQuotationById` SIN desenvolver el resultado, leyendo `detalle.data?.data?.items` — distinto del objeto `Quotation` ya desenvuelto que `NegocioPage`, `PostVentaPage` y `Calendar` guardan en `['quotation', id]`. Las invalidaciones tras editar servicios (`refreshAfterSave`: `['quotation']`, `['quotations']`, `['clientSummary']`, `['postventa']`; o el `onSaved` de `NegocioPage`: `['quotation', id]`, `['quotations']`) no tocan esta llave: la hoja de ruta del día puede mostrar servicios/menús viejos hasta 5 minutos tras un cambio, y no se relee mientras la pantalla sigue abierta.

**Evidencia:**
- `frontend/src/pages/personas/ResumenDelDia.tsx`: `['people','evento-items', evento.id] → getQuotationById` sin destructurar, `staleTime` 5 min, `serviciosDelDia(detalle.data?.data?.items)`
- `frontend/src/pages/postventa/PostVentaPage.tsx`: `refreshAfterSave` invalida `['quotation']`, `['quotations']`, `['clientSummary']`, `['postventa']`
- `frontend/src/pages/quotations/NegocioPage.tsx`: `ServiciosTab onSaved` invalida `['quotation', id]` y `['quotations']`

#### x3-05 · Guardar notificaciones puede pisar el logo o los colores que cambiaron en otra pestaña

`CompanyConfiguration.tsx` guarda marca/logo/colores con `updateCompany` y solo refresca `["profile", userId]` (`loadUserProfile`) — nunca invalida `["company", id]`. `ConfigurationPage.handleSaveNotifications` lee la empresa desde su propia query cacheada (`companyQuery`, `["company", id]`) y `updateCompany` siempre reenvía `company.name`/`logo_url`/`colors` (`companies.repository.ts update` hace `.update(dto)` con lo que llegue). Si alguien cambia logo/colores en Empresa y, dentro de esa ventana de caché, guarda notificaciones en Configuración, se pisan silenciosamente el logo/nombre/colores con los valores viejos — sin error visible, hasta que sale un PDF o correo con la marca anterior.

**Evidencia:**
- `frontend/src/pages/configuration/ConfigurationPage.tsx` — `companyQuery ["company", userCompany.id]`; `handleSaveNotifications → updateCompany(company.name, company.logo_url, company.colors, ...)`
- `frontend/src/pages/configuration/companyConfiguration/CompanyConfiguration.tsx` — `updateCompany(...) + loadUserProfile()`, sin import de `queryClient` ni `invalidateQueries`
- `frontend/src/services/companies.service.ts` — `updateCompany` envía siempre `name`/`logo_url`/`colors`
- `api-rest/src/companies/companies.repository.ts` — `update(): .update(updateCompanyDto)`

#### x3-06 · El radar de conflictos de Mobiliario no se limpia al cambiar el stock

`MobiliarioTab.saveStock`/`doDelete` invalidan solo `["logistica","mobiliario"]` (`load()`), pero el radar de conflictos de la MISMA pestaña calcula `stockById` desde `baseRadar.data.furniture`, que viene de `useBaseLogistica` (`["logistica","compras","base", companyId]`, `staleTime` 5 minutos — la despensa compartida que también usan Compras, Cocina y Gestión). Cambiar el stock no limpia esa despensa: el radar sigue mostrando el conflicto viejo hasta 5 minutos, invitando a corregir dos veces o a comprar/arrendar de más.

**Evidencia:**
- `frontend/src/pages/logistica/components/MobiliarioTab.tsx` — `stockById = furniture.map(f => [f.id, f.stock])`; `load()` invalida solo `["logistica","mobiliario"]`
- `frontend/src/hooks/useBaseLogistica.ts` — queryKey `["logistica","compras","base", companyId]`, `staleTime 5*60_000`

#### x3-07 · Confirmar un comprobante del portal no refresca el saldo del cliente en otras pantallas

`PostVentaPage.actuarComprobante` (confirmar/rechazar comprobante del portal, que registra un pago real vía `PortalReceiptsController.confirm → PaymentsService.createPaymentTransaction`) invalida solo `["postventa"]`. Solo `refreshAfterSave` invalida además `["quotations"]`, `["clientSummary"]` y `["quotation"]` (comentario: "un pago cruza módulos"), y `actuarComprobante` no la llama. Tras confirmar un comprobante, el saldo pendiente en la ficha 360 del cliente y en Negocio queda desactualizado hasta 30s o remount.

**Evidencia:**
- `frontend/src/pages/postventa/PostVentaPage.tsx` — `actuarComprobante: invalidateQueries(["postventa"])` solamente; `refreshAfterSave`: invalida `["quotations"]`, `["clientSummary"]`, `["quotation"]`, `["postventa"]`
- `frontend/src/pages/ClientDetailPage.tsx` — `summaryQuery ["clientSummary", id]`

#### x3-08 · Toda invalidación `people` a secas vacía el módulo completo de Personas

`peopleQueryOptions` usa la llave raíz `["people"]`, prefijo de todas las llaves del módulo Personas (`staff-semana`, `staff-evento`, `pools`, `sheets`, `catalogo-recursos`, etc.). `PersonaFichaPage` (guardar/borrar/cambiarEstado/guardarMotivo), `PersonasPage.invalidar`, `CargosModal.refrescar` y `HistoricoTab.refrescar` invalidan literalmente `["people"]` a secas, vaciando el módulo entero. Varias pantallas dependen de este efecto ancho sin nombrarlo (comentario de `FichasTab.pintarStaff`: "'people' a secas también guarda personas"). Afinar esa llave raíz rompería el refresco de staff-evento, liquidación y calendario de personas tras cada edición.

**Evidencia:**
- `frontend/src/services/people.service.ts` — `peopleQueryOptions.queryKey = ["people"]`
- `frontend/src/pages/personas/PersonaFichaPage.tsx` — guardar/borrar/cambiarEstado/guardarMotivo → `invalidateQueries(["people"])`
- `frontend/src/pages/personas/PersonasPage.tsx`, `CargosModal.tsx`, `HistoricoTab.tsx` — invalidan `["people"]`

#### x3-09 · La misma llave de caché tiene dos recetas distintas según la pantalla

La misma llave `["people","staff-evento", id]` tiene dos recetas de queryFn distintas: en `FichasTab` (Liquidación) hace `POST /people/sheets/:id/traer-planta` y LUEGO `getStaff`, con `staleTime 0` (se repite en cada montaje, cambio de foco e invalidación de la raíz `["people"]`); en `GrillaPersonal`, `EventResourcesSection` y `ServiciosTab` (Post-Venta) el queryFn es solo `getStaff`. `staffQueryOptions` (`["people","staff", id]`) existe pero nadie lo usa. Si alguien centraliza la llave reusando solo `getStaff`, la planta deja de "entrar" al evento al liquidar, sin error visible.

**Evidencia:**
- `frontend/src/pages/personas/FichasTab.tsx` — `FichaAbierta`: queryKey `["people","staff-evento", evento.id]`, queryFn: `traerPlantaAlEvento` + `getStaff`, `staleTime 0`
- `frontend/src/pages/postventa/GrillaPersonal.tsx`, `EventResourcesSection.tsx`, `ServiciosTab.tsx` — misma llave, queryFn: `getStaff` solamente
- `frontend/src/services/people.service.ts` — `staffQueryOptions` definido, sin usos en todo `frontend/src`

#### x3-10 · Evaluar en Liquidación no actualiza el promedio de estrellas en Staff

`FichasTab.EvaluacionesModal.cerrar` crea las evaluaciones (`createReview` por persona) y llama `onCerrado → refrescar()` (invalida solo `staff-evento`/`pools`/`sheets`). Nadie invalida `["people","reviews"]`, la query que vive en `PersonasPage` (contenedor que sigue montado al cambiar entre las pestañas de Personas) y alimenta `promedioDe` (estrellas del listado Staff). Solo `EvaluacionesDePersona` invalida ese prefijo. Tras evaluar en Liquidación, Staff sigue mostrando el promedio anterior hasta recargar, e invita a evaluar de nuevo — `createReview` inserta (no hace `upsert`), así que se duplican evaluaciones y se distorsiona el promedio.

**Evidencia:**
- `frontend/src/pages/personas/FichasTab.tsx` — `EvaluacionesModal.cerrar` (`createReview`) → `onCerrado → refrescar()`; ninguna invalidación de `["people","reviews"]` en el archivo
- `frontend/src/pages/personas/PersonasPage.tsx` — `useQuery(["people","reviews"]) → promedioDe`; contenedor de las 5 pestañas (incluida `FichasTab`)
- `frontend/src/pages/personas/EvaluacionesDePersona.tsx` — `invalidateQueries(["people","reviews"])`

#### x3-11 · Proveedores y recursos se cachean bajo 4 prefijos distintos sin invalidación cruzada

`getSuppliers` y `getManagementResources` están cacheados bajo llaves sin prefijo común: `["logistica","proveedores"]`, `["gestion","proveedores"]` (`GestionTab`), dentro de `["logistica","insumos"]` y `["logistica","recursos"]`, en `recursosQueryOpts` (compartida por Calendar/EventResourcesSection/GrillaPersonal/ServiciosTab/PostVentaPage) y en `["people","catalogo-recursos"]` (`SemanaTab`). `ProveedoresTab.load` y `RecursosTab.load` invalidan solo su propia llave de logística. Renombrar un proveedor o cambiar el valor sugerido de un cargo deja a Gestión y a la sábana de Planificación con el dato viejo hasta que se vuelvan a montar; invalidar "por prefijo logística" no cubre `gestion/` ni `people/`.

**Evidencia:**
- `frontend/src/pages/postventa/GestionTab.tsx` — `["gestion","proveedores", companyId] → getSuppliers`
- `frontend/src/pages/logistica/components/ProveedoresTab.tsx` — `["logistica","proveedores", companyId]`; `load()` invalida solo esa llave
- `frontend/src/pages/logistica/components/RecursosTab.tsx` — `["logistica","recursos", companyId]` incluye `getSuppliers`; `load()` invalida solo esa llave
- `frontend/src/pages/personas/SemanaTab.tsx` — `["people","catalogo-recursos"] → getManagementResources`
- `frontend/src/pages/postventa/EventResourcesSection.tsx` — `recursosQueryOpts`, reusado en Calendar/GrillaPersonal/ServiciosTab/PostVentaPage

#### x3-12 · La llave `['quotation', id]` la usan 4 pantallas con reglas de caché distintas

La llave `["quotation", id]` la comparten 4 lugares con reglas distintas: `NegocioPage` y `PostVentaPage` (`staleTime 0`, guardan `Quotation | null`), `Calendar` (`prefetchQuery` a 60s + tarjeta a 30s por defecto) y `ClientDetailPage.openViewer` (`fetchQuery` SIN `staleTime` propio, puede devolver la copia precargada por Calendar sin red). Bajo el mismo prefijo, `PaymentPlanEditor` usa la subllave `["quotation","fresca", id]` con la respuesta ENVUELTA (`frescoQuery.data?.data?.total_amount`) — `invalidateQueries(["quotation", id])` de `NegocioPage` no la alcanza porque el segundo elemento difiere ("fresca" vs id). `QuotationForm` no invalida ninguna `["quotation",...]` al guardar. El visor "ojo" puede mostrar totales de hasta 30s atrás, y un futuro `setQueriesData` que asuma la forma `Quotation` rompería `PaymentPlanEditor`.

**Evidencia:**
- `frontend/src/pages/quotations/NegocioPage.tsx` — `detalleQuery ["quotation", id]` `staleTime 0`; `invalidateQueries(["quotation", id])`
- `frontend/src/pages/calendar/Calendar.tsx` — `prefetchQuery(["quotation", q.id])` `staleTime 60_000`; `DetalleTarjeta useQuery(["quotation", q.id])`
- `frontend/src/pages/ClientDetailPage.tsx` — `openViewer: fetchQuery(["quotation", quotationId])` sin `staleTime`
- `frontend/src/components/PaymentPlanEditor.tsx` — `["quotation","fresca", quotation.id] → frescoQuery.data?.data?.total_amount`
- `frontend/src/pages/quotations/QuotationForm.tsx` — sin `invalidateQueries` de `["quotation",...]` al guardar (solo invalida `["clients"]` y, al borrar, `["quotations"]`/`["requirements"]`)

#### x3-13 · Dos estilos de invalidación conviven en NegocioPage; uno de ellos no llega al tablero

Dentro de `NegocioPage` hay dos estilos de invalidación tras cambiar el estado de una cotización: `refrescarEstado` invalida el prefijo `["quotations"]` (llega al tablero de `QuotationsPage`, llave `["quotations","embudo-y-rechazadas"]`); pero `enviarPorCorreo` y la confirmación de `MotivoPerdida` invalidan solo la subllave `["quotations","ficha-lista"]` — el tablero no se entera. Ambas además invalidan la llave muerta `["followups", id]` (nadie la lee; el hilo real de seguimiento usa `["seguimientos", id]` en `SeguimientoPanel`). Volver al tablero antes de 30s tras enviar puede mostrar la tarjeta todavía en SOLICITADA y permitir reenviar el correo o arrastrarla de nuevo.

**Evidencia:**
- `frontend/src/pages/quotations/NegocioPage.tsx` — `enviarPorCorreo` invalida `["followups", id]`, `["quotation", id]`, `["quotations","ficha-lista"]`; `refrescarEstado` invalida `["quotations"]`; `MotivoPerdida.onConfirmar` invalida también `["followups", id]`
- `frontend/src/pages/quotations/QuotationsPage.tsx` — `quotationsQuery ["quotations","embudo-y-rechazadas"]`
- `frontend/src/pages/quotations/SeguimientoPanel.tsx` — `["seguimientos", quotation.id]` / `["seguimientos","map"]`

#### x3-14 · Búsquedas y filtros en localStorage no se limpian al cerrar sesión

`localStorage`/`sessionStorage` mezcla dos criterios: claves con sufijo de usuario (`EVENT_FILTER_KEY(user.id)`, `TYPE_FILTER_KEY(user.id)`, filtro del tablero) y claves SIN usuario ni empresa (`eventia_pv_search`, `eventia_clients_search`, `eventia_personal_busqueda`, `eventia_personal_pestana`, `eventia_fixed_services_open`, `eventia_open_categories`, y en `sessionStorage` `mk.pestana`/`mk.busca`/`mk.sortCol`/`mk.sortDir`/`mk.ficha.<id>.filtro` y `planta-proyectada`). `AuthContext.signOut` solo hace `queryClient.clear()` — no borra ninguna de esas claves. Otra persona que entra en el mismo navegador ve las búsquedas/filtros del usuario anterior, y con `planta-proyectada` una segunda empresa en la misma pestaña puede quedar sin proyectar su planta esa sesión.

**Evidencia:**
- `frontend/src/pages/postventa/PostVentaPage.tsx` — `localStorage "eventia_pv_search"`; `EVENT_FILTER_KEY(user.id)`
- `frontend/src/pages/ClientsPage.tsx` — `"eventia_clients_search"`; `TYPE_FILTER_KEY(user.id)`
- `frontend/src/pages/personas/PersonasPage.tsx` — `"eventia_personal_busqueda"`, `"eventia_personal_pestana"`
- `frontend/src/pages/marketing/MarketingPage.tsx`, `CampanaFichaPage.tsx` — `sessionStorage "mk.*"`
- `frontend/src/pages/personas/SemanaTab.tsx` — `sessionStorage "planta-proyectada"`
- `frontend/src/contexts/AuthContext.tsx` — `signOut()`: solo `supabase.auth.signOut()` + `queryClient.clear()`

#### x3-15 · Cambiar el cargo de un usuario puede tardar hasta 5 minutos en aplicarse en pantalla

Rol, nombre y empresa de toda la app (menú, `PermissionGuard`, texto de WhatsApp en `NegocioPage`) salen de una sola query `["profile", user.id]` (`staleTime` 5 min, con copia persistida en `localStorage`). `UserManagementPage.handleSubmit` edita cualquier usuario — incluido uno mismo, el botón Editar no tiene `disabled`, solo Eliminar lo tiene (`disabled={userProfile.user_id === user?.id}`) — vía `updateUser` y solo invalida `["users"]` (`loadUsers`); nadie invalida `["profile"]`. Un administrador que se cambia el cargo sigue viendo permisos/nombre viejos hasta 5 min o recargar, mientras el motor ya aplica el cargo nuevo, mostrando botones que terminan en 403.

**Evidencia:**
- `frontend/src/contexts/AuthContext.tsx` — `profileQuery ["profile", user.id]`, `staleTime 5*60_000`, `writeCachedProfile`/`localStorage`
- `frontend/src/pages/UserManagementPage.tsx` — `handleSubmit(isEditing) → updateUser + loadUsers()` (`["users"]`); botón Editar sin `disabled`; Eliminar con `disabled` para sí mismo
- `frontend/src/pages/configuration/companyConfiguration/CompanyConfiguration.tsx` — único lugar que sí llama `loadUserProfile()`

### x4 — Dependencias entre módulos

#### x4-01 · Consultas entra a la aplicación solo porque el Cotizador lo importa

`ConsultasModule` no está en los imports de `app.module.ts`; entra a la aplicación solo porque `quotations.module.ts` lo importa para inyectar `ConsultasService` en `QuotationsService.createPublic` (`embudoPara`/`registrar`). Ese import arrastra también `ConsultasController`, `EventTypesController` y el cron `ConsultasCronService.despachar` (`@Cron EVERY_MINUTE`, despacha los brochures automáticos). Si alguien saca el embudo de `QuotationsService` y de paso quita el import de `ConsultasModule` en `QuotationsModule`, el motor compila y arranca igual, pero desaparecen sin aviso las pantallas de Consultas y Tipos de evento (404) y deja de salir el brochure automático.

**Evidencia:**
- `api-rest/src/app.module.ts` — imports no incluye `ConsultasModule`
- `api-rest/src/quotations/quotations.module.ts` — imports: `ConsultasModule`
- `api-rest/src/consultas/consultas.module.ts` — controllers `ConsultasController`, `EventTypesController`; provider `ConsultasCronService`
- `api-rest/src/consultas/consultas-cron.service.ts` — `@Cron(EVERY_MINUTE) despachar()`

#### x4-02 · UsersModule es global: tres módulos dependen de él sin importarlo

`UsersModule` está marcado `@Global()` y por eso tres módulos usan sus piezas sin importarlo explícitamente: `AuthModule` tiene `imports:[]` pero `AuthGuard` (guardián de sesión global) inyecta `UsersRepository`; `PaymentsModule` solo importa `EmailModule` y `QuotationsModule` pero `PaymentsCronService` inyecta `UsersService`; `CustomerSatisfactionSurveyModule` tampoco lo importa y su service inyecta `UsersService` con `forwardRef`. Si se le quita `@Global()` a `UsersModule`, Nest no puede resolver esas dependencias al arrancar: cae el guardián de sesión de todas las rutas y dos crons, y ni tsc ni el build lo detectan — se ve recién al levantar en Railway.

**Evidencia:**
- `api-rest/src/users/users.module.ts` — `@Global()`, exports `[UsersService, UsersRepository]`
- `api-rest/src/auth/auth.module.ts` — `imports: []`; `auth.guard.ts` inyecta `UsersRepository`
- `api-rest/src/payments/payments.module.ts` — imports `EmailModule`, `forwardRef(QuotationsModule)`; `payments-cron.service.ts` inyecta `UsersService`
- `api-rest/src/customer_satisfaction_survey/module.ts` y `service.ts` — `@Inject(forwardRef(() => UsersService))`

#### x4-03 · 12 archivos fuera de Cotizaciones leen la tabla `quotations` directo

Doce archivos fuera de `quotations.repository.ts` (logistics, analytics/`HoyRepository`, movil, marketing, people, clients, consultas/event-types, quotation-followups, services, storage, super-admin, quotations/event-documents) leen la tabla `quotations` directo con Supabase y comparan estados como texto suelto ("aceptada", "solicitada", etc.) en vez de pasar por `QuotationsService`. Los más delicados: `LogisticsRepository.markProvisioned`/`clearProvisioned` ESCRIBEN columnas `provisioned_*` de la cotización, y `HoyRepository`/`MovilService` recalculan saldos con joins `quotations!inner`. Renombrar una columna o un estado de cotizaciones compila limpio, pero rompe en silencio el panel Hoy, los avisos push, Compras, la segmentación de campañas y la planificación de personal.

**Evidencia:**
- `api-rest/src/logistics/logistics.repository.ts` — `markProvisioned`, `clearProvisioned` escriben columnas de `quotations`
- `api-rest/src/analytics/hoy.controller.ts` — `HoyRepository`: `'quotations!inner(company_id, quotation_status)'`
- `api-rest/src/marketing/marketing.repository.ts` — `cotizacionesSegmentables`, `tiposDeEvento` leen `quotations`
- `api-rest/src/people/people.repository.ts` — `esCotizacionDeLaEmpresa`, `diasDeEvento` leen `quotations`

#### x4-04 · Plan de pagos y envío de cotización escriben el estado saltándose el motor

`PaymentsService.createPaymentPlan` y `EnvioCotizacionService.enviarDeVerdad` escriben `quotation_status` directo con `QuotationsRepository.update`, a propósito, sin pasar por `QuotationsService.update` (que dispara el guardia de estados, la cascada de pagos/reembolsos y el correo `QUOTATION_IS_SENT`). El plan de pagos deja la cotización en ACEPTADA (con candado para no des-realizar una REALIZADA, comentario "PUERTA DE ATRÁS TAPADA 13-08"); el envío la pasa de SOLICITADA a ENVIADA para no disparar la cascada del plan de pagos. Por esto `QuotationsModule` exporta `QuotationsRepository` además del service: cualquier regla nueva agregada en `QuotationsService.update` no correrá en estos dos caminos.

**Evidencia:**
- `api-rest/src/payments/payments.service.ts` — `createPaymentPlan: quotationsRepository.update(..., { quotation_status: ACEPTADA })`
- `api-rest/src/quotations/envio-cotizacion.service.ts` — `enviarDeVerdad: ESTADO_ANTES_DE_ENVIAR/ESTADO_TRAS_ENVIAR` vía `quotationsRepository.update`
- `api-rest/src/quotations/quotations.service.ts` — `update`: GUARDIA DE ESTADOS, correo `QUOTATION_IS_SENT`
- `api-rest/src/quotations/quotations.module.ts` — `exports: [QuotationsService, QuotationsRepository]`

#### x4-05 · `quotations.items` es un contrato JSON sin tipos compartidos

La columna JSON `quotations.items` es un contrato sin tipos compartidos entre frontend y backend. `ServicesRepository` cuenta el uso de un servicio con `.contains('items', ...)` buscando tanto por id nuevo como por código de catálogo viejo (comentario medido: de 424 referencias, 120 por id y 42 por código); `money.ts` rehace los totales del backend desde las mismas cajas que arma `buildItemsSnapshot` en el frontend (`QuotationForm`/`ServiciosTab`, vía `eventConsolidation`) para validarlos con `assertMoneyMatches`; y `LogisticsRepository` lee `items` para las compras. Cambiar cómo el cotizador guarda un ítem puede dejar borrar servicios vendidos, rechazar guardados legítimos, y descuadrar Compras y el Dashboard.

**Evidencia:**
- `api-rest/src/services/services.repository.ts` — `.contains('items', ...)` y comentario 13-08 (424/120/42)
- `api-rest/src/quotations/utils/money.ts` — `SnapshotItem`, `VariableBox`, comentario "la misma foto que arma `buildItemsSnapshot`"
- `api-rest/src/quotations/quotations.service.ts` — `assertMoneyMatches`
- `frontend/src/pages/postventa/ServiciosTab.tsx` — `buildItemsSnapshot`; `QuotationForm.tsx` — `eventConsolidation`

#### x4-06 · El comentario promete borrar la caché del perfil al editar un usuario; el código no lo hace

`AuthGuard` cachea el perfil de cada usuario (incluido su cargo) por 1 hora en `cachePerfiles`, y `RolesGuard` decide permisos con ese cargo cacheado. Los comentarios de `auth.guard.ts` y `memoria.ts` prometen que "`users.service` llama `olvidarPerfil`" al editar un usuario, pero en el código `UsersService.update` pasa directo a `UsersRepository.update` SIN llamar `olvidarPerfil` — solo `UsersService.remove` lo hace. Como `UpdateUserDto` permite cambiar `role`, quitarle a alguien el cargo de administrador puede tardar hasta 1 hora en aplicarse (o hasta el próximo redeploy). El comentario contradice al código.

**Evidencia:**
- `api-rest/src/users/users.service.ts` — `update()` sin `olvidarPerfil`; `remove()` sí lo llama
- `api-rest/src/users/dto/update-user.dto.ts` — permite cambiar `role` (hereda de `CreateUserDto` sin omitirlo)
- `api-rest/src/auth/auth.guard.ts` — `cachePerfiles`, comentario "`users.service` llama `olvidarPerfil`"
- `api-rest/src/cache/memoria.ts` — comentario "se olvida su ficha AL INSTANTE"

#### x4-07 · La invalidación del panel promete cubrir "cualquier cambio"; no cubre los crons

`PanelInvalidationInterceptor` (`APP_INTERCEPTOR` global) es lo único que borra el cache de 1 hora del panel de análisis (`cachePanel`, usado por `AnalyticsService.getDashboardStats`/`getCompleteStats`), y solo tras una escritura HTTP (POST/PATCH/DELETE) de un usuario con sesión: si `req.method === 'GET' || !req.user?.company_id`, no borra nada. El comentario de `memoria.ts` promete que "CUALQUIER cambio de cotización, pago o reembolso borra el panel", pero eso no aplica a escrituras fuera de HTTP con sesión, como el cron `PaymentsService.updateOverduePayments` (`@Cron EVERY_DAY_AT_1AM`), que cambia pagos a vencido sin invalidar el cache. El panel Hoy (`HoyController`) no usa esta memoria.

**Evidencia:**
- `api-rest/src/cache/panel-invalidation.interceptor.ts` — `intercept`: GET o sin `user.company_id`, no invalida
- `api-rest/src/cache/memoria.ts` — `cachePanel`, `invalidarPanelEmpresa`, comentario "CUALQUIER cambio ... borra el panel"
- `api-rest/src/app.module.ts` — `APP_INTERCEPTOR: PanelInvalidationInterceptor`
- `api-rest/src/payments/payments.service.ts` — `@Cron(EVERY_DAY_AT_1AM) updateOverduePayments`, sin invalidar `cachePanel`

#### x4-08 · La ruta pública de una cotización alimenta 4 flujos con reglas de empresa distintas

La ruta pública "GET /quotations/:id" (`QuotationsController.findOne`, marcada `@Public()` con el comentario "This is public becaue it is used to display the quotation details in the public customer satisfaction survey") llama a `QuotationsService.findOne(id)`, que no recibe `companyId`, y `QuotationsRepository.findOne` trae la fila entera con `select('*, clients(name,email), companies(name)')`. La usan `PublicSurvey.tsx`, `ResumenDelDia.tsx` (Personas), `CustomerSatisfactionSurveyService.createAnswer` (sin sesión) y `PaymentsService.createPaymentPlan`, que recién después compara `quotation.company_id !== companyId` a mano. Si se le exige sesión a la ruta se rompe la encuesta pública; si se le agrega `companyId` a la firma de `findOne` se rompen `createAnswer` y el plan de pagos. Mientras siga así, cualquier columna nueva de `quotations` sale por esa puerta pública gracias al `*`.

**Evidencia:**
- `api-rest/src/quotations/quotations.controller.ts` — `findOne` con `@Public()` y el comentario citado, más el TODO
- `api-rest/src/quotations/quotations.service.ts` — `findOne(id)` delega en el repositorio sin `companyId`
- `api-rest/src/quotations/quotations.repository.ts` — `findOne` con `select('*, clients(...), companies(...)')`
- `frontend/src/pages/customerSatisfactionSurveys/PublicSurvey.tsx` — usa `getQuotationById`
- `frontend/src/pages/personas/ResumenDelDia.tsx` — usa `getQuotationById`
- `api-rest/src/customer_satisfaction_survey/service.ts` — `createAnswer` llama `quotationsService.findOne`
- `api-rest/src/payments/payments.service.ts` — `createPaymentPlan` llama `findOne` y compara `quotation.company_id !== companyId` después

#### x4-09 · El PDF de una cotización es un circuito motor→frontend→motor sin red de seguridad

El PDF adjunto de una cotización lo genera un navegador invisible (`EnvioCotizacionService.generarPdf`) que abre `${frontendUrl}/imprimir/${token}`, espera hasta 15s el selector `.qv-hoja` y hasta 10s a que carguen las fuentes. Esa página del frontend (ruta `/imprimir/:token`, fuera de login/`PermissionGuard`) pide a su vez "GET /quotations/imprimir/:token" (`hojaParaImprimir`, `@Public`, declarada ANTES de `:id` a propósito o esa ruta se la come). Es un circuito motor → frontend → motor que ningún build detecta si se rompe. Renombrar la clase `.qv-hoja`, mover la ruta `/imprimir`, ponerle login/guard, o reordenar las rutas del controller dejan fallando por timeout el botón "Enviar cotización" sin error de compilación.

**Evidencia:**
- `api-rest/src/quotations/envio-cotizacion.service.ts` — `generarPdf`: `page.goto(`${frontendUrl()}/imprimir/${token}`)`, `waitForSelector('.qv-hoja', 15000)`, espera de fuentes con tope de 10s
- `api-rest/src/quotations/quotations.controller.ts` — `@Public() @Get('imprimir/:token')` declarada antes de `:id`, con comentario "VA ANTES de :id o esa ruta se la come"
- `frontend/src/App.tsx` — `Route path='/imprimir/:token'` fuera del bloque con `PermissionGuard`
- `frontend/src/services/quotations.service.ts` — llama a `${API_ROUTES.QUOTATIONS}/imprimir/${token}`
- `frontend/src/utils/quotationPrintDoc.ts` — clase `.qv-hoja` en los estilos del documento

#### x4-10 · Una misma plantilla visual arma campañas, cotizaciones y brochures

La misma plantilla visual de marketing (`plantillaCampana` y `marcaDesdeFila`, en `api-rest/src/marketing/plantilla.ts` y `marca.ts`) arma también el correo de cotización con PDF (`EnvioCotizacionService` y `correo-cotizacion.ts`, que además importa los helpers de contraste `esClaro`/`textoSobre`) y el brochure automático del embudo (`ConsultasService.enviarBrochure`, que también toma `escaparHtml` del módulo email). `marcaDesdeFila` fija valores por defecto (`colorPrimario #134686`, `replyTo` desde `notifications.replyTo`) que heredan los tres flujos. `docs/arquitectura/13` lo documenta: la marca del correo es `plantillaCampana` + `marcaDesdeFila`, y la cotización usa la plantilla sin línea de baja. Un cambio pensado solo para campañas (volver obligatoria la línea de baja, cambiar parámetros requeridos de `plantillaCampana`, cambiar un color por defecto) altera a la vez el correo de cotización y el brochure, y ninguno de esos dos flujos tiene pruebas visuales que lo avisen.

**Evidencia:**
- `api-rest/src/marketing/plantilla.ts` — exporta `plantillaCampana`, `esClaro`, `textoSobre`, `MarcaEmpresa`
- `api-rest/src/marketing/marca.ts` — `marcaDesdeFila` con los valores por defecto citados
- `api-rest/src/quotations/envio-cotizacion.service.ts` — usa `marcaDesdeFila` y `plantillaCampana`
- `api-rest/src/quotations/correo-cotizacion.ts` — importa `esClaro` y `textoSobre` desde `src/marketing/plantilla`
- `api-rest/src/consultas/consultas.service.ts` — `enviarBrochure` usa `marcaDesdeFila`, `plantillaCampana` y `escaparHtml` (de `src/email/templates/utils`)
- `docs/arquitectura/13_ENVIO_DE_COTIZACIONES.md` — tabla "Marca del correo | `plantillaCampana` + `marcaDesdeFila`" y nota "`plantillaCampana` sin línea de baja"

#### x4-11 · CompaniesModule exporta solo el repositorio; SuperAdmin y Clientes declaran copias propias

`CompaniesModule` exporta SOLO `CompaniesRepository` (`CompaniesService` no se exporta), y `EmailService`, `ConsultasService`, `EnvioCotizacionService` y `MarketingController` lo inyectan directo para leer la fila completa de `companies`. `EmailService.shouldSendEmail` solo bloquea un correo cuando `notifications.emails[tipo]` es exactamente `false`; si la empresa no tiene `notifications.emails` configurado, todo sale encendido por defecto (decisión del 29-07). `SuperAdminModule` NO importa `CompaniesModule`: declara `CompaniesRepository` y `UsersRepository` como providers propios (segundas instancias). `ClientsModule` también declara un `UsersRepository` propio que ninguna clase de clients usa. Cambiar la forma de los JSON `notifications` o `colors`, o el retorno `{data,error}` de `CompaniesRepository.findOne`, afecta a la vez los correos al cliente, los brochures, el envío de cotizaciones y las campañas; y si `CompaniesRepository` o `UsersRepository` ganan una dependencia propia de su módulo dueño, `SuperAdminModule` o `ClientsModule` dejan de poder arrancar (segunda instancia sin ese proveedor).

**Evidencia:**
- `api-rest/src/companies/companies.module.ts` — `exports: [CompaniesRepository]`
- `api-rest/src/email/email.service.ts` — `shouldSendEmail`: si `!company.notifications?.emails` devuelve `true`; si `emailNotifications[emailStructure] === false`, bloquea
- `api-rest/src/super-admin/super-admin.module.ts` — providers propios `CompaniesRepository` y `UsersRepository`, sin importar `CompaniesModule` ni `UsersModule` para esos repos
- `api-rest/src/clients/clients.module.ts` — provider `UsersRepository` sin referencias en `clients.service.ts` ni `clients.repository.ts`
- `api-rest/src/marketing/marketing.controller.ts` — constructor inyecta `companies: CompaniesRepository` directo

#### x4-12 · ClientContactsRepository vive dentro de un controller y lo usan 5 módulos

`ClientContactsRepository` está definido dentro de `client-contacts.controller.ts`, y `ClientsModule` lo exporta explícitamente ("el embudo de consultas asegura al consultante como persona de contacto al convertir"). Lo usan sin pasar por `ClientsService`: `ConsultasService.convertir` (`findByClient` + `create` con `is_primary:false`) y `EnvioCotizacionService.correoDeDestino` (busca contacto por `client_contact_id` o por nombre). `QuotationsRepository` también lee `client_contacts` directo: join `client_contacts!quotations_client_contact_id_fkey`, más consultas del contacto por token y por nombre. `MarketingRepository` lee `client_contacts` para armar audiencias de correo, y `ClientsRepository.findMatch` también consulta esa tabla como fuente de verdad de la persona. Cambiar la firma de `findByClient`/`create`, el criterio de `is_primary` o el nombre de la FK `quotations_client_contact_id_fkey` rompe a la vez la conversión de consultas, el destinatario del correo de cotización, el listado de cotizaciones, el portal del mandante y las audiencias de marketing.

**Evidencia:**
- `api-rest/src/clients/client-contacts.controller.ts` — `export class ClientContactsRepository`
- `api-rest/src/clients/clients.module.ts` — `exports: [ClientsService, ClientContactsRepository]`
- `api-rest/src/consultas/consultas.service.ts` — `convertir`: `contactos.findByClient` y `contactos.create` con `is_primary:false`
- `api-rest/src/quotations/envio-cotizacion.service.ts` — `correoDeDestino`: `contactos.findByClient`
- `api-rest/src/quotations/quotations.repository.ts` — join `mandante:client_contacts!quotations_client_contact_id_fkey`
- `api-rest/src/marketing/marketing.repository.ts` — `from('client_contacts').select('client_id, name, email')`
- `api-rest/src/clients/clients.repository.ts` — `findMatch` consulta `client_contacts`

#### x4-13 · Cargos y recursos comparten tabla; Logística no filtra por tipo al editar o borrar

Desde la fusión del 14-08, los cargos de Personas y los recursos de Logística viven en la misma tabla `management_resources`. `PeopleRepository.findRoles`/`createRole` filtran `type='personal'`, y `updateRole` tiene el candado `.eq(type, personal)` para no renombrar un arriendo creyendo que es un cargo. `LogisticsRepository.findAllResources`, `updateResource` y `deleteResource` NO filtran por `type`: operan sobre toda la tabla. Y `resourcesUsage`, que decide si un recurso se puede borrar, solo cuenta `fixed_service_cost_items` y `event_resources` (no revisa `event_staff.role_id` ni `default_role_id` de las personas). En el frontend, `SemanaTab.tsx` (Personas) y `DashboardPage.tsx` obtienen los cargos llamando a `getManagementResources → '/logistics/resources'`. Desde la pantalla de Recursos se puede editar o borrar un cargo en uso en Planificación y el conteo de uso diría 0 falsamente; y si Logística empezara a filtrar por `type`, la semana de Personas y los costos del Dashboard quedarían sin cargos.

**Evidencia:**
- `api-rest/src/people/people.repository.ts` — comentario "Viven en `management_resources` con `type=personal` — la MISMA tabla que usa Recursos"; `findRoles` con `.eq('type','personal')`; `updateRole` con el mismo filtro como candado
- `api-rest/src/logistics/logistics.repository.ts` — `findAllResources`, `updateResource` y `deleteResource` sin filtro de `type`; `resourcesUsage` solo consulta `fixed_service_cost_items` y `event_resources`
- `frontend/src/services/logistics.service.ts` — `getManagementResources → API_ROUTES.LOGISTICS_RESOURCES`
- `frontend/src/pages/personas/SemanaTab.tsx` — llama a `getManagementResources(companyId)`
- `frontend/src/pages/dashboard/DashboardPage.tsx` — también llama a `getManagementResources`

#### x4-14 · El Resultado del Dashboard cruza 7 servicios de 4 módulos distintos

El panel de Resultado del Dashboard cruza varios módulos para armar la rentabilidad: importa `getCostoPersonal` y `getPagadoPersonalPorMes` (`people.service`), `getAllEventResources`, `getEventSupplyProvisions`, `getManagementResources`, `getWonEventsSince` y `getBaseCatalogo` (`logistics.service`), más `saleWithoutTip`. El cotizador (`QuotationForm.tsx`) usa `getBaseCatalogo` para el "costo ESTIMADO DE CATÁLOGO". El endpoint `/logistics/base-catalogo` está protegido con `@Roles(...SALES_AND_UP)`. `LogisticsRepository.findWonEventsSince` trae explícitamente `subtotal_amount`, `fixed_value`, `tip_percentage` y `tip_amount` "para que el panel calcule la venta SIN propina POR EVENTO" (comentario del 31-08). Personas también usa Logística (`getEventServiceTimes`/`setEventServiceTime` en `ResumenDelDia`). Cambiar las claves o columnas de esos endpoints rompe a la vez el costo estimado del cotizador y el Resultado del Dashboard; subir el `@Roles` de `base-catalogo` a Operaciones deja a los vendedores sin costo estimado; quitar las columnas de propina de `won-events` descuadra las ventas por evento.

**Evidencia:**
- `frontend/src/pages/dashboard/DashboardPage.tsx` — imports de `getCostoPersonal`, `getPagadoPersonalPorMes`, `getAllEventResources`, `getEventSupplyProvisions`, `getManagementResources`, `getWonEventsSince`, `getBaseCatalogo`, `saleWithoutTip`
- `frontend/src/pages/quotations/QuotationForm.tsx` — import `getBaseCatalogo` con comentario "Costo ESTIMADO DE CATÁLOGO"
- `api-rest/src/logistics/logistics.controller.ts` — `@Roles(...SALES_AND_UP) @Get('base-catalogo')`
- `api-rest/src/logistics/logistics.repository.ts` — `findWonEventsSince` con comentario "31-08" y select de `subtotal_amount`, `fixed_value`, `tip_percentage`, `tip_amount`
- `frontend/src/pages/personas/ResumenDelDia.tsx` — `getEventServiceTimes`, `setEventServiceTime`

#### x4-15 · Dos ciclos de módulos se resuelven con forwardRef, frágiles a cambios de orden

Hay dos ciclos de módulos resueltos con `forwardRef`. (1) `QuotationsModule` importa `PaymentsModule` y `UsersModule` con `forwardRef`; `PaymentsModule` importa `QuotationsModule` con `forwardRef`; `PaymentsService` inyecta `QuotationsRepository` directo y `QuotationsService` con `@Inject(forwardRef(() => QuotationsService))`; `PortalReceiptsController` (dentro de quotations) inyecta `PaymentsService` también con `forwardRef`. (2) El alta de cuenta cruza cuatro módulos: `UsersService.signup → SuperAdminService.createSuscription → CompaniesRepository.create + UsersService.create + CustomerSatisfactionSurveyService.createTemplate + EmailService.sendEmail`; `CustomerSatisfactionSurveyModule` importa `QuotationsModule` con `forwardRef`, y `QuotationsModule` importa `UsersModule` con `forwardRef`. `QuotationsService` tiene el comentario "AL FINAL a propósito: las pruebas arman este servicio por posición — insertarla al medio rompió 34 de una (05-09)", pero sus specs (`quotations.service.spec.ts`) usan `Test.createTestingModule` (inyección por token), mientras que `PaymentsService`, `ConsultasService` y `EnvioCotizacionService` sí se instancian con `new X(...)` por posición en sus specs. Inyectar estos servicios sin `forwardRef` deja la dependencia `undefined` o tumba el arranque por ciclo, solo visible al levantar el motor; agregar un parámetro al medio del constructor de `PaymentsService`, `ConsultasService` o `EnvioCotizacionService` rompe sus pruebas.

**Evidencia:**
- `api-rest/src/quotations/quotations.module.ts` — `forwardRef(() => PaymentsModule)`, `forwardRef(() => UsersModule)`
- `api-rest/src/payments/payments.module.ts` — `imports: [EmailModule, forwardRef(() => QuotationsModule)]`
- `api-rest/src/payments/payments.service.ts` — constructor con `QuotationsRepository` y `@Inject(forwardRef(() => QuotationsService))`
- `api-rest/src/quotations/portal-receipts.controller.ts` — `@Inject(forwardRef(() => PaymentsService))`
- `api-rest/src/users/users.service.ts` — `signup` llama `superAdminService.createSuscription`
- `api-rest/src/super-admin/super-admin.service.ts` — `createSuscription` llama `companiesRepository.create`, `usersService.create`, `customerSatisfactionSurveyService.createTemplate`, `emailService.sendEmail`
- `api-rest/src/customer_satisfaction_survey/module.ts` — `imports: [EmailModule, forwardRef(() => QuotationsModule)]`
- `api-rest/src/quotations/quotations.service.ts` — comentario "AL FINAL a propósito" sobre el orden del constructor
- `api-rest/src/payments/tests/payments.service.spec.ts`, `api-rest/src/consultas/tests/consultas.service.spec.ts`, `api-rest/src/quotations/tests/unit/envio-cotizacion.service.spec.ts` — `new X(...)` por posición
- `api-rest/src/quotations/tests/unit/quotations.service.spec.ts` — `Test.createTestingModule`

#### x4-16 · "Evento realizado = congelado" está repartida en 4 lugares sin una fuente única

La regla "evento realizado = congelado" está repartida en varios módulos. `quotations/constants/constants.ts` define `REALIZADA='realizada'` y el mensaje `EVENTO_REALIZADO_CONGELADO`. `LogisticsRepository` importa esa constante y consulta él mismo `quotation_status = realizada` en `assertEventosEditables` (usado por al menos 8 métodos, incluido `clearProvisioned`), lanzando esa misma excepción. `PaymentsService.createPaymentPlan` tiene su propio candado: si la cotización NO está REALIZADA, reescribe su estado a "aceptada"; el comentario dice explícitamente "PUERTA DE ATRÁS TAPADA (13-08): esta escritura era incondicional [...] des-realizaba en silencio". El frontend (`utils/eventoCongelado.ts`) refleja la regla comparando el texto "realizada" con su propio mensaje `AVISO_EVENTO_CONGELADO`, distinto en texto del backend, aclarando que "el servidor sigue siendo la autoridad". En `people.service.ts`/`people.repository.ts` no hay ninguna referencia a "realizada" ni a la constante. Cambiar el valor "realizada" o el alcance del candado obliga a tocar a mano `quotations`, `logistics`, `payments` y el frontend; olvidar uno deja una puerta trasera para editar un evento cerrado, como ya pasó en payments el 13-08.

**Evidencia:**
- `api-rest/src/quotations/constants/constants.ts` — `REALIZADA='realizada'` y `EVENTO_REALIZADO_CONGELADO`
- `api-rest/src/logistics/logistics.repository.ts` — import de `EVENTO_REALIZADO_CONGELADO`; `assertEventosEditables` con `.eq('quotation_status','realizada')`, usado en al menos 8 métodos
- `api-rest/src/payments/payments.service.ts` — `createPaymentPlan` con el comentario "PUERTA DE ATRÁS TAPADA (13-08)" y el `if quotation_status !== REALIZADA` antes de reescribir a ACEPTADA
- `frontend/src/utils/eventoCongelado.ts` — `esEventoCongelado` (`estado === realizada`) y `AVISO_EVENTO_CONGELADO` con texto distinto del backend
- `api-rest/src/people/people.service.ts` y `people.repository.ts` — sin referencias a "realizada"

#### x4-17 · Reembolsos y el update de pagos no reciben companyId en su firma

`RefundsService.create(createRefundDto)`, `findPendingByQuotation(quotationId)`, `updateAmount(id, amount)` y `remove(id)`, además de `PaymentsService.update(id, dto)` (→ `paymentsRepository.updatePayment`), no reciben `companyId` en su firma. `refunds.repository.ts` lo reconoce: "El refund no tiene company_id propio: se verifica vía su cotización", y sus otros métodos (`findByQuotation`, `paidMapByCompany`) sí filtran por `quotations.company_id`. `QuotationsService.update` llama a los cuatro métodos de refunds y a `paymentsService.update` dentro de su cascada de cambio de estado, confiando en que ya validó la cotización contra `companyId` antes. CLAUDE.md fija la regla de la casa: cada método de repositorio debe filtrar por `company_id`. Reusar esos métodos de refunds/payments desde otro módulo o controller sin validar antes la cotización rompería el aislamiento entre empresas.

**Evidencia:**
- `api-rest/src/refunds/refunds.service.ts` — `create`, `findPendingByQuotation`, `updateAmount`, `remove` sin parámetro `companyId`
- `api-rest/src/refunds/refunds.repository.ts` — comentario "El refund no tiene company_id propio: se verifica vía su cotización"
- `api-rest/src/payments/payments.service.ts` — `update(id, updatePaymentDto)` sin `companyId`
- `api-rest/src/quotations/quotations.service.ts` — `update()` llama `refundsService.create`/`findPendingByQuotation`/`updateAmount`/`remove` y `paymentsService.update`
- CLAUDE.md — "Every repo method takes companyId and filters/scopes queries by company_id"

#### x4-18 · Tipos de evento y de cliente se referencian por nombre, no por id

Los tipos de evento y de cliente se referencian por su nombre en texto, no por id. `EventTypesRepository.usosDe` cuenta filas de `quotations` y `consultas` con `event_type` igual al nombre. `ClientsRepository.removeType` cuenta `clients.client_type` y `consultas.client_type` iguales a `type.name` antes de permitir borrar. El embudo decide con `ConsultasService.embudoPara(companyId, eventType)` (llamado desde `QuotationsService` en la creación pública), y `despacharPendientes` busca la config con `repo.config(company_id, event_type)`. `MarketingRepository.tiposDeEvento` agrupa `quotations.event_type` por texto. Hoy `EventTypesService.actualizar` solo permite cambiar `{entrada, activo}`, nunca el nombre, y eliminar solo procede si `usosDe` da 0 — eso es lo único que mantiene la coherencia hoy. Si se agregara "renombrar tipo" sin propagar el cambio a `quotations`, `consultas`, la configuración de brochures y `clients`, el embudo dejaría de reconocer el tipo, el candado de borrado fallaría y la segmentación de campañas se partiría en dos.

**Evidencia:**
- `api-rest/src/consultas/event-types.repository.ts` — `usosDe(companyId, nombre)` sobre `quotations` y `consultas` por igualdad de texto
- `api-rest/src/consultas/event-types.service.ts` — `actualizar` acepta solo `{entrada?, activo?}`; `eliminar` exige `usosDe===0`
- `api-rest/src/clients/clients.repository.ts` — `removeType` compara `.eq('client_type', type.name)` en `clients`
- `api-rest/src/consultas/consultas.service.ts` — `despacharPendientes` usa `repo.config(c.company_id, c.event_type)`
- `api-rest/src/quotations/quotations.service.ts` — creación pública llama `consultasService.embudoPara(company_id, event_type)`
- `api-rest/src/marketing/marketing.repository.ts` — `tiposDeEvento` agrupa `quotations.event_type` por texto

#### x4-19 · Los dos caminos de alta de clientes buscan coincidencia solo por correo, nunca por teléfono

Los dos caminos de entrada de clientes nuevos —la creación pública de cotizaciones (`QuotationsService`) y `ConsultasService.convertir`— llaman a `ClientsService.findMatch(company_id, email, undefined)`, es decir, SIN pasar el teléfono, con el comentario explícito "Match SOLO por correo (regla de Felipe, 05-09): el teléfono viaja con la persona entre organizaciones; el correo no". `ClientsRepository.findMatch` sí sabe comparar por los últimos 9 dígitos del teléfono cuando se le pasa. Si no hay coincidencia, ambos flujos crean el cliente con `ClientsService.create` (que por la "garantía de nacimiento" crea también su contacto principal). Si alguien cambiara `findMatch` para buscar por teléfono cuando falta el correo, o pasara el teléfono en uno de los dos flujos, las solicitudes públicas y las consultas convertidas engancharían a la persona con su organización antigua — justo lo que la regla de Felipe descarta.

**Evidencia:**
- `api-rest/src/quotations/quotations.service.ts` — `findMatch(company_id, email, undefined)` con comentario sobre el teléfono viajando con la persona
- `api-rest/src/consultas/consultas.service.ts` — `convertir`: `this.clients.findMatch(companyId, c.email, undefined)` con comentario "Match SOLO por correo (regla de Felipe, 05-09)"
- `api-rest/src/clients/clients.repository.ts` — `findMatch` compara correo normalizado o `digits(phone).slice(-9)`

#### x4-20 · Las fórmulas de dinero existen duplicadas a mano entre motor y frontend

Las fórmulas de dinero (propina, total) existen duplicadas entre backend y frontend, sincronizadas a mano. `AnalyticsService` importa `saleWithoutTip` desde `api-rest/src/quotations/utils/tip.ts`; su espejo en el frontend es `utils/quotationMoney.ts`, con el comentario "El espejo de este archivo en el backend es .../tip.ts — si cambias uno, cambia el otro", y lo usa `DashboardPage.tsx`. La fórmula del total vive en `api-rest/src/quotations/utils/money.ts`, cuyo encabezado dice "LA FÓRMULA ES LA MISMA de `computeTotals` en `frontend/.../QuotationForm.tsx` [...] y la de acá es la que manda". CLAUDE.md, por su parte, llama a `frontend/utils/quotationMoney` "the single source of truth for quotation totals". Tocar la propina, el descuento o el redondeo en un solo lado hace que el motor y el Dashboard muestren ventas distintas, o que el motor rechace guardados que el cotizador calculó de otra forma.

**Evidencia:**
- `api-rest/src/analytics/analytics.service.ts` — `import { saleWithoutTip } from 'src/quotations/utils/tip'`
- `frontend/src/utils/quotationMoney.ts` — comentario "El espejo de este archivo en el backend es .../utils/tip.ts — si cambias uno, cambia el otro"
- `frontend/src/pages/dashboard/DashboardPage.tsx` — `import { saleWithoutTip } from '../../utils/quotationMoney'`
- `api-rest/src/quotations/utils/money.ts` — encabezado "LA FÓRMULA ES LA MISMA de `computeTotals` [...] la de acá es la que manda"
- CLAUDE.md — línea 176-177: "`utils/quotationMoney` (the single source of truth for quotation totals)"

#### x4-21 · El portal del mandante es sobre todo cobranza aunque vive en Cotizaciones

El portal del mandante vive en el módulo `quotations` pero es sobre todo cobranza. `PortalReceiptsController.confirm` registra el pago real llamando a `paymentsService.createPaymentTransaction`. `QuotationsService.getPortalData`/armar portal usa `paymentsService.findAllPaymentsFromQuotation`, `refundsService.paidMapByCompany`, `portalReceiptsRepository.pendingPaymentIds` y `storageService.upload`. `QuotationsRepository.answeredSurveys` duplica a propósito una consulta de `customer_satisfaction_survey_responses`, con el comentario "inyectarlo aquí crearía un ciclo de módulos". `CustomerSatisfactionSurveyService.hasAnswer` tiene el comentario "(`hasAnswer` se expone para el controller y para el portal)", pero una búsqueda en `quotations/` y `customer_satisfaction_survey/` confirma que el portal NO lo llama en ningún punto —solo lo usa el controller de encuestas—, así que ese comentario ya no describe el código. Cambiar el DTO de `createPaymentTransaction` o `normalizePaymentAfterTransactions` rompe la confirmación de comprobantes del portal; cambiar cómo se guarda una respuesta de encuesta obliga a tocar dos repositorios, y si se olvida `answeredSurveys` el portal vuelve a pedir una encuesta ya respondida.

**Evidencia:**
- `api-rest/src/quotations/portal-receipts.controller.ts` — `confirm()` llama `paymentsService.createPaymentTransaction`
- `api-rest/src/quotations/quotations.service.ts` — usa `paymentsService.findAllPaymentsFromQuotation`, `refundsService.paidMapByCompany`, `portalReceiptsRepository.pendingPaymentIds`, `storageService.upload`
- `api-rest/src/quotations/quotations.repository.ts` — `answeredSurveys` con comentario "Duplica una consulta del módulo de encuestas a propósito [...] crearía un ciclo de módulos"
- `api-rest/src/customer_satisfaction_survey/service.ts` — comentario "(`hasAnswer` se expone para el controller y para el portal)"; grep confirma que solo `customer_satisfaction_survey/controller.ts` llama `hasAnswer`, no el portal
- `api-rest/src/payments/payments.service.ts` — `normalizePaymentAfterTransactions`

#### x4-22 · La convención de rutas de archivos privados está duplicada entre motor y frontend

La convención de rutas de archivos privados está duplicada entre motor y frontend. `StorageService.upload` guarda en el bucket `BUCKET_PRIVADO='payment-receipts'` con rutas `c<empresa>/...`, salvo mobiliario que va al bucket público `furniture-photos`. `verificarDueno` acepta rutas `c<empresa>/...` o los prefijos viejos (`payment-receipts`, `refund-receipts`, `event-documents`). En el frontend, `storage.service.ts.esArchivoPrivado` repite la MISMA regex `^(c\d+|payment-receipts|refund-receipts|event-documents)/` y la marca `/object/public/payment-receipts/` para decidir si pide una URL firmada. Si se agrega un tipo de archivo con un prefijo nuevo que no empiece con `c<empresa>`, o se renombra el bucket, el frontend mostraría el enlace crudo roto en vez de pedir la URL firmada, y el motor respondería con ruta desconocida — hay que cambiar las dos apps a la vez.

**Evidencia:**
- `api-rest/src/storage/storage.service.ts` — `const BUCKET_PRIVADO='payment-receipts'`; `upload` con `switch(dto.kind)` y `bucket='furniture-photos'` para mobiliario; `extraerRuta`; `verificarDueno` con `prefijosViejos`
- `frontend/src/services/storage.service.ts` — `esArchivoPrivado` con la regex `/^(c\d+|payment-receipts|refund-receipts|event-documents)\//.test(src)` y el chequeo de `/object/public/payment-receipts/`

#### x4-23 · Crear una empresa desde la Torre de Control no le crea la plantilla de encuesta

Crear una empresa por el alta normal (`signup → SuperAdminService.createSuscription`) le crea la plantilla de encuesta llamando a `customerSatisfactionSurveyService.createTemplate(companyData.id)`. Crear una empresa desde la Torre de Control (`createCompanyOnly → SuperAdminRepository.createCompanyOnly`) inserta SOLO `{name}` en `companies`, sin plantilla. `CustomerSatisfactionSurveyService.createAnswer` lanza "Template not found" si `getTemplate(companyId)` no encuentra fila; la única otra vía de creación encontrada es el endpoint `POST /customer-satisfaction-survey/template`. El correo interno de respuesta (`newAnswerCustomerSatisfactionSurvey/template.ts`) busca el texto de cada pregunta en la constante `CUSTOMER_SATISFACTION_SURVEY_QUESTIONS` por id, no en la plantilla guardada de la empresa. Una empresa creada desde la Torre no puede recibir respuestas de encuesta hasta que alguien cree su plantilla a mano; y cambiar los id o textos de esa constante altera cómo se leen en el correo las respuestas antiguas.

**Evidencia:**
- `api-rest/src/super-admin/super-admin.service.ts` — `createSuscription` llama `customerSatisfactionSurveyService.createTemplate`; `createCompanyOnly` llama `superAdminRepository.createCompanyOnly` + `alertNuevaEmpresa`, sin plantilla
- `api-rest/src/super-admin/super-admin.repository.ts` — `createCompanyOnly`: `.from('companies').insert({name})`
- `api-rest/src/customer_satisfaction_survey/service.ts` — `createAnswer`: `throw new Error('Template not found')` si `!templateResult`
- `api-rest/src/customer_satisfaction_survey/controller.ts` — `@Post('template')`
- `api-rest/src/email/templates/newAnswerCustomerSatisfactionSurvey/template.ts` — `CUSTOMER_SATISFACTION_SURVEY_QUESTIONS.find((q) => q.id === answer.id)`

#### x4-24 · El token del PDF de cotización firma con el mismo secreto que las bajas de Marketing

El token de corta vida con que el navegador invisible abre la hoja de impresión se firma en `EnvioCotizacionService.secreto()` con `MARKETING_BAJA_SECRET`, y si esa variable no existe, con `RESEND_API_KEY` como respaldo (comentario "El mismo secreto de las bajas de marketing"). `BajasService` (marketing) lee exactamente la misma variable `MARKETING_BAJA_SECRET` para firmar las bajas de campañas. `validate-env.ts` la clasifica en IMPORTANTES (no en CRÍTICAS), así que el motor arranca igual sin ella, cayendo al respaldo. Mientras falte esa variable, las dos firmas dependen de `RESEND_API_KEY`, así que cualquier cambio en esa llave afecta a la vez los enlaces de baja ya enviados y la generación de PDFs de cotización; y separar los secretos o cambiar el respaldo en un solo servicio desalinea al otro.

**Evidencia:**
- `api-rest/src/quotations/envio-cotizacion.service.ts` — `secreto()`: `MARKETING_BAJA_SECRET ?? RESEND_API_KEY`, con comentario "El mismo secreto de las bajas de marketing (doc 11)"
- `api-rest/src/marketing/bajas.service.ts` — lee `this.config.get('MARKETING_BAJA_SECRET')`
- `api-rest/src/config/validate-env.ts` — `MARKETING_BAJA_SECRET` en el arreglo IMPORTANTES, no en CRITICAS

#### x4-25 · El Calendario es un envoltorio de Cotizaciones; Analítica importa dos módulos que no usa

`CalendarService.findAllEvents` devuelve tal cual al frontend el resultado de `quotationsService.findAll({companyId})` dentro de `{quotations}`; `CalendarRepository` es una clase vacía, sin métodos propios. `AnalyticsService.getDashboardStats` usa `quotationsService.findAll(...)`, `clientsService.findAll(companyId)` y `paymentsService.findAllPaymentsFromQuotation(...)`, e importa la función pura `fechaDelUltimoAbono` directamente desde `payments.service.ts`. `AnalyticsModule` importa `EmailModule` y `UsersModule` aunque un grep confirma que ni `AnalyticsService` ni `HoyController` usan `EmailService` ni `UsersService`. CLAUDE.md nombra `analyitics-cront.service.ts` como ejemplo de cron, pero ese archivo no existe en `api-rest/src/analytics`. Cambiar el objeto de filtros o las columnas de `findAll` (por ejemplo recortar `COLUMNAS_LISTA` para acelerar el listado) cambia a la vez lo que ve el Calendario y los números del Dashboard; mover `fechaDelUltimoAbono` fuera de `payments.service.ts` rompe la compilación de analytics.

**Evidencia:**
- `api-rest/src/calendar/calendar.service.ts` — `findAllEvents`: `const quotations = await this.quotationsService.findAll({companyId}); return {quotations}`
- `api-rest/src/calendar/calendar.repository.ts` — clase sin métodos
- `api-rest/src/analytics/analytics.service.ts` — usa `quotationsService.findAll`, `clientsService.findAll`, `paymentsService.findAllPaymentsFromQuotation`; `import { fechaDelUltimoAbono, PaymentsService } from 'src/payments/payments.service'`
- `api-rest/src/analytics/analytics.module.ts` — imports `EmailModule` y `UsersModule`; grep confirma que `EmailService`/`UsersService` no aparecen en `analytics.service.ts` ni `hoy.controller.ts`
- CLAUDE.md — línea 80 menciona `analyitics-cront.service.ts`; `find` confirma que no existe ningún archivo `*cron*` en `api-rest/src/analytics`

### x5 — Permisos y endpoints públicos

#### x5-01 · El portal reparte el UUID de TODAS las cotizaciones, y el endpoint público trae la fila completa

`QuotationsService.getPortalData` entrega en el JSON del portal el id de TODAS las cotizaciones del mandante (confirmadas e historial, función `base()`) y el link de encuesta (`encuestaPath`) con ese mismo id. `QuotationsController.findOne` (`GET /quotations/:id`) es `@Public()`, sin filtro de empresa ni throttle propio, y su repositorio hace `select(*)` — trae también `provisioned_cost`, `provisioned_people`, `provisioned_services`. Con el UUID que el propio portal reparte, cualquiera obtiene la fila completa de la cotización, saltándose la lista blanca de `hoja-publica.ts` que promete que "los costos internos jamás pasan por aquí".

**Evidencia:**
- `api-rest/src/quotations/quotations.controller.ts` — `findOne: @Public() @Get(':id')`, comentario "TODO: maybe create public endpoint for this"
- `api-rest/src/quotations/quotations.repository.ts` — `findOne: select('*, clients(...), companies(...)').eq('id', id)`, sin `company_id`
- `api-rest/src/quotations/quotations.service.ts` — `getPortalData`: `base()` retorna `id: q.id` para toda la lista; `encuestaPath` con `q.id`
- `api-rest/src/quotations/hoja-publica.ts` — `listaBlancaDeHoja`
- `docs/migrations/15_provisioning.sql`, `17_event_resources_and_provision_snapshot.sql` — `provisioned_cost`/`provisioned_people`/`provisioned_services`

#### x5-02 · `quotations.repository.findOne` no filtra por empresa en ningún punto

`QuotationsRepository.findOne(id)` no filtra por `company_id` (`.eq('id', id)` solamente), contra la regla de CLAUDE.md de que todo método de repositorio recibe `companyId` y filtra por él. La usan puertas públicas (`hojaParaImprimir`, `getPortalQuotation`, `createAnswer` de encuesta, el propio `findOne` público) y puertas con sesión que comparan la empresa DESPUÉS de leer (`enviarDeVerdad`: `q.company_id !== user.company_id`; `remove`/`markEventDone`/`unmarkEventDone`/`setHarvestStatus`: comparación explícita) — pero `QuotationsService.update` NO compara `company_id` en ningún punto de su cuerpo, solo lo pasa al final a la escritura del repositorio. Agregar un `.eq(company_id)` dentro de `findOne` rompería de una vez el PDF del correo, la hoja del portal y la encuesta pública; el cierre del aislamiento tiene que hacerse por llamador.

**Evidencia:**
- `api-rest/src/quotations/quotations.repository.ts` — `findOne(id): .eq('id', id).single()`, sin `companyId`
- `api-rest/src/quotations/envio-cotizacion.service.ts` — `enviarDeVerdad`: comparación `q.company_id !== user.company_id` tras `findOne`
- `api-rest/src/quotations/quotations.service.ts` — `update()`: `findOne(id)` sin comparar `company_id` en todo el cuerpo del método (solo se usa `companyId` aguas abajo, en `repository.update` y `payments`)
- CLAUDE.md — "Every repo method takes companyId and filters/scopes queries by company_id"

#### x5-03 · Cualquiera con el UUID puede responder la encuesta antes del evento

`POST /customer-satisfaction-survey/answer` es `@Public` (10/min) y `CustomerSatisfactionSurveyService.createAnswer` solo comprueba que no exista respuesta previa (`hasAnswer`), que la cotización exista y que la empresa tenga plantilla de encuesta — no mira `quotation_status` ni `survey_sent_at`, y `CreateAnswerDto` no lleva ningún token, solo `quotationId` y `answers`. Como el portal entrega el UUID también de cotizaciones NO realizadas (x5-01), cualquiera con ese UUID puede responder la encuesta antes del evento. Esa fila deja la cotización imborrable (`QuotationsRepository.assertDeletable` la bloquea), quema la única encuesta real del evento y dispara el correo `NEW_ANSWER_CUSTOMER_SATISFACTION_SURVEY` a los administradores.

**Evidencia:**
- `api-rest/src/customer_satisfaction_survey/controller.ts` — `createAnswer`: `@Throttle(10/60s) @Public()`
- `api-rest/src/customer_satisfaction_survey/service.ts` — `createAnswer`: solo `hasAnswer` + existencia de cotización + plantilla
- `api-rest/src/customer_satisfaction_survey/dto/create-answer.dto.ts` — `CreateAnswerDto`: solo `quotationId` y `answers`, sin token
- `api-rest/src/quotations/quotations.repository.ts` — `assertDeletable` (`customer_satisfaction_survey_responses`)

#### x5-04 · El token secreto del portal sale por 2 endpoints sin @Roles

El `portal_token` secreto del mandante (tabla `client_contacts`, migración 48) llega a cualquier cargo con sesión por dos caminos sin `@Roles`: `GET /client-contacts?clientId=` (`ClientContactsRepository.findByClient` hace `select('*')`) y `GET /payments/transactions` (`PaymentsRepository.findAllPaymentsWithTransactions` embebe mandante: `client_contacts(name, email, portal_token)` de TODOS los pagos de la empresa). Recepción no tiene la sección "payments" habilitada en el frontend (`permissions.ts` la reserva para lo que "solo sabe la empresa: márgenes, cobranza"), pero por API directa sí puede leer el token del portal de cualquier cliente — y cualquier columna nueva que se agregue a `client_contacts` sale automáticamente por el mismo `select(*)`.

**Evidencia:**
- `api-rest/src/clients/client-contacts.controller.ts` — `ClientContactsRepository.findByClient`: `select('*').eq('company_id',...).eq('client_id',...)`; `@Get() findByClient` sin `@Roles`
- `api-rest/src/payments/payments.repository.ts` — `findAllPaymentsWithTransactions`: `mandante: client_contacts(name, email, portal_token)`
- `api-rest/src/payments/payments.controller.ts` — `@Get('transactions') findAllPaymentsWithTransactions` sin `@Roles` (a diferencia de `@Post('plan')` con `@Roles(...OPERATIONS_AND_UP)`)
- `frontend/src/constants/permissions.ts` — `payments: ROLE_GROUPS.OPERATIONS_AND_UP`; comentario `recepcion` "nada de lo que solo sabe la empresa: márgenes, cobranza"

#### x5-05 · Recepción puede borrar o enviar una cotización formal por API directa

La regla "recepción crea/edita requerimientos, no cotizaciones" solo está aplicada en `QuotationsController.create` (`ForbiddenException` explícita) y en `QuotationsService.update` (parámetro `role` opcional con el candado RECEPCION). NO está en `remove` (`DELETE /quotations/:id`), en `enviarPorCorreo` (`POST /quotations/:id/enviar-correo`) ni en `setHarvestStatus` (`POST /quotations/:id/cosecha`) — ninguno de los tres tiene `@Roles` ni comprobación de rol propia. En el frontend, "solo administrador borra" (`RequestsPage.handleDelete`, `ROLE_GROUPS.ADMIN_ONLY`) vive solo en la pantalla, y el botón "Enviar cotización" de `NegocioPage` no está dentro del bloque condicionado por `puedeEditar`. Por API directa, recepción o vendedor pueden borrar una cotización formal o mandarle al cliente el correo con el PDF adjunto.

**Evidencia:**
- `api-rest/src/quotations/quotations.controller.ts` — `create()` con `ForbiddenException` de RECEPCION; `enviarPorCorreo`, `setHarvestStatus`, `remove` sin `@Roles` ni chequeo de rol
- `api-rest/src/quotations/quotations.service.ts` — `update()`: `role?` opcional (comentario "los llamados internos del propio backend ... no tienen rol"); `remove()` sin comparar cargo
- `frontend/src/pages/RequestsPage.tsx` — `handleDelete` con `ROLE_GROUPS.ADMIN_ONLY` (solo pantalla)
- `frontend/src/pages/quotations/NegocioPage.tsx` — botón "Enviar cotización" fuera del bloque `puedeEditar` (solo el chip de estado está condicionado)

#### x5-06 · El módulo de Personas no tiene NINGÚN @Roles en su controller

`PeopleController` no tiene NINGÚN `@Roles`, ni a nivel de clase ni de método (verificado: cero ocurrencias en el archivo) — a diferencia de `MarketingController`, que sí usa `@Roles(...ADMIN_ONLY)` a nivel de clase. El frontend marca la sección "people" como ADMIN_ONLY (`permissions.ts`), pero `GrillaPersonal`, `ServiciosTab` y `EventResourcesSection` (todas bajo la ruta `/post-venta`, `SECTION_ROLES.payments = OPERATIONS_AND_UP`) importan `getStaff` de `people.service` para mostrar la planta del evento, y `DashboardPage` también consume `people.service`. Cerrar el hueco de privacidad copiando el patrón de Marketing (un `@Roles` de clase) dejaría a operaciones con 403 en la planificación de personal de cada evento — el cierre tiene que separar las rutas de staff/sheets de las de ficha, pagos e histórico.

**Evidencia:**
- `api-rest/src/people/people.controller.ts` — sin `@Roles` en toda la clase (`findStaff`, `addStaff`, `updateStaff`, `removeStaff`, `findSheets`, `findAll`, `findOne`, `createPayroll`, etc.)
- `api-rest/src/marketing/marketing.controller.ts` — `@Roles(...ADMIN_ONLY)` a nivel de clase, como contraste
- `frontend/src/pages/postventa/GrillaPersonal.tsx`, `ServiciosTab.tsx`, `EventResourcesSection.tsx` — `getStaff` de `people.service`, bajo ruta post-venta
- `frontend/src/App.tsx` — ruta post-venta con `PermissionGuard allowedRoles={SECTION_ROLES.payments}`
- `frontend/src/constants/permissions.ts` — `people: ROLE_GROUPS.ADMIN_ONLY`
- `frontend/src/pages/dashboard/DashboardPage.tsx` — importa de `services/people.service`

#### x5-07 · GET /payments no tiene @Roles, a diferencia de las escrituras de pagos

`GET /payments?quotationId=` (`PaymentsController.findAllPaymensFromQuotation`) no tiene `@Roles`, mientras que `POST /payments/plan` (`createPaymentPlan`) exige `@Roles(...OPERATIONS_AND_UP)`. `QuotationsPage.applyStatusChange`, `NegocioPage` (antes de abrir `PaymentPlanEditor`) y `AvisoPlanDePagos` usan ese GET (`getPaymentsByQuotationId`) para decidir entre un PATCH de estado simple o abrir el editor del plan — pantallas accesibles a vendedor y recepción. Endurecer ese GET "por coherencia" con las escrituras de pagos rompería el cambio de estado desde el tablero y el aviso ámbar del plan de pagos.

**Evidencia:**
- `api-rest/src/payments/payments.controller.ts` — `@Get() findAllPaymensFromQuotation` sin `@Roles`; `@Post('plan') createPaymentPlan` con `@Roles(...OPERATIONS_AND_UP)`
- `frontend/src/pages/quotations/QuotationsPage.tsx` — `applyStatusChange` usa `getPaymentsByQuotationId`
- `frontend/src/pages/quotations/NegocioPage.tsx` — `getPaymentsByQuotationId` antes de abrir `PaymentPlanEditor`
- `frontend/src/components/AvisoPlanDePagos.tsx` — `getPaymentsByQuotationId`

#### x5-08 · El @Roles de 3 rutas de Logística ensancha el acceso al margen, pese al candado visual

`LogisticsController` tiene `@Roles(...OPERATIONS_AND_UP)` a nivel de clase, pero `baseCatalogo` (`GET base-catalogo`), `fixedServiceCosts` (`GET catalog/fixed-costs`) y `allRecipeItems` (`GET recipes/all`) llevan `@Roles(...SALES_AND_UP)` a nivel de método — y el comentario de `roles.guard.ts` confirma explícitamente que "el `@Roles` de un handler MANDA sobre el del controller" (usa `Reflector.getAllAndOverride`, handler antes que clase). Eso ENSANCHA el acceso al vendedor pese a que `QuotationForm.puedeVerMargen` (solo administrador/operaciones) oculta el costo en pantalla: el motor igual le entrega recetas, insumos con precio y costos fijos por esas 3 rutas — la protección del margen es solo visual, no del backend.

**Evidencia:**
- `api-rest/src/logistics/logistics.controller.ts` — `@Roles(...OPERATIONS_AND_UP)` en la clase; `baseCatalogo`, `fixedServiceCosts`, `allRecipeItems` con `@Roles(...SALES_AND_UP)` en el método
- `api-rest/src/auth/roles.guard.ts` — comentario "El `@Roles` de un handler MANDA sobre el del controller"; `getAllAndOverride(ROLES_KEY, [handler, class])`
- `api-rest/src/auth/roles.decorator.ts` — `SALES_AND_UP = [VENDEDOR, OPERACIONES, ADMINISTRADOR]`
- `frontend/src/pages/quotations/QuotationForm.tsx` — `puedeVerMargen = ADMINISTRADOR || OPERACIONES`; `marginBaseQuery enabled: ... && puedeVerMargen`

#### x5-09 · El @Roles de un método siempre gana sobre el de su clase, sin pruebas que lo cubran

`RolesGuard.canActivate` (`api-rest/src/auth/roles.guard.ts`) usa `getAllAndOverride`, así que el `@Roles` de un método siempre gana sobre el de su clase, y un `@Roles()` vacío en un método pasa igual que si no tuviera decorador (rama "basta sesión"). `@Public` gana siempre, en `AuthGuard` y en `RolesGuard`, incluso puesto a nivel de clase. `roles.guard.spec.ts` tiene 5 pruebas pero su mock de `Reflector` no distingue handler de class, así que ninguna cubre la sobrescritura método-clase ni el `@Roles()` vacío. Quien pegue un `@Public()` en el método equivocado o deje un `@Roles()` vacío de un refactor abre funciones de administrador sin error visible (ya pasó en `super-admin`, retirado el 10-08).

**Evidencia:**
- `api-rest/src/auth/roles.guard.ts` — `canActivate`
- `api-rest/src/auth/auth.guard.ts` — `getAllAndOverride(IS_PUBLIC_KEY, ...)`
- `api-rest/src/marketing/marketing.controller.ts` — `@Roles(...ADMIN_ONLY)` en la clase, 3 métodos `@Public`
- `api-rest/src/auth/tests/roles.guard.spec.ts` — mock de `Reflector` plano, no distingue handler/class
- `api-rest/src/super-admin/super-admin.controller.ts` — comentario del `@Public()` huérfano retirado el 10-08

#### x5-10 · El orden de las rutas de Cotizaciones puede tragarse un GET público nuevo

`QuotationsController` declara `check-conflicts` e `imprimir/:token` ANTES de `findOne(':id')`, que es `@Public`. Nest resuelve rutas por orden de declaración, así que cualquier GET nuevo de cotizaciones con palabra fija que se agregue después de `findOne` sería tragado por esa ruta pública: no pasa por `AuthGuard`, no da 401, y llega a `QuotationsRepository.findOne` con la palabra como id, fallando recién en Supabase. `ClientsController` y `PeopleController` tienen el mismo patrón de orden (`types`, `roles` antes de `:id`), pero ahí la ruta que traga sí exige sesión — el riesgo de puerta pública silenciosa es exclusivo de cotizaciones.

**Evidencia:**
- `api-rest/src/quotations/quotations.controller.ts` — orden: `check-conflicts`, `imprimir/:token`, `findOne(':id') @Public`
- `api-rest/src/clients/clients.controller.ts` — `types` (con sesión) antes de `:id`
- `api-rest/src/people/people.controller.ts` — `roles` (con sesión) antes de `:id`

#### x5-11 · Las firmas de baja e impresión comparten un secreto que puede quedar vacío sin frenar el arranque

`BajasService.secreto()` y `EnvioCotizacionService.secreto()` firman los tokens de baja e impresión con `config.get('MARKETING_BAJA_SECRET') ?? config.get('RESEND_API_KEY')`. En `validate-env.ts`, `MARKETING_BAJA_SECRET` está en la lista IMPORTANTES (no CRÍTICAS): si quedara definida en Railway con valor vacío, el servidor arranca igual (solo advertencia en el log) y el `??` NO cae al respaldo porque una cadena vacía no es `undefined`/`null` — las dos firmas seguirían usando una llave HMAC vacía. No se verificó el valor real en Railway; lo confirmado es el mecanismo de código que lo permitiría.

**Evidencia:**
- `api-rest/src/marketing/bajas.service.ts` — `secreto()`
- `api-rest/src/quotations/envio-cotizacion.service.ts` — `secreto()`
- `api-rest/src/config/validate-env.ts` — `MARKETING_BAJA_SECRET` en IMPORTANTES, `faltanCriticas.filter(v => !process.env[v]?.trim())`

#### x5-12 · El probador de correos queda abierto fuera de producción, sin candado propio

`EmailPreviewsController.sendPreviews` es `@Public`, sin `@Throttle` propio, y su único candado es `if (NODE_ENV === 'production') throw NotFoundException`. La misma variable `NODE_ENV` decide en `app.module.ts` si corren los cron jobs (`ScheduleModule.forRoot`). Fuera de production, este endpoint queda abierto a quien alcance la URL y dispara `EmailService.sendPreviewBatch` con la marca REAL de la empresa a cualquier casilla indicada, protegido solo por el techo global de 300/min. Cambiar `NODE_ENV` en un ambiente para "apagar los relojes" reabre sin querer este relay de correos.

**Evidencia:**
- `api-rest/src/email/email-previews.controller.ts` — `sendPreviews`, `NotFoundException` si production
- `api-rest/src/app.module.ts` — `ScheduleModule.forRoot({ cronJobs: NODE_ENV === 'production' })`, `ThrottlerModule.forRoot` 300/min
- `api-rest/src/email/email.service.ts` — `sendPreviewBatch`, comentario "la marca REAL de la empresa"

#### x5-13 · Swagger publica /docs sin condición de ambiente, anunciando toda ruta pública

`SwaggerModule.setup('docs', ...)` en `main.ts` se registra sin condición de ambiente y, al no ser un controller de Nest, no pasa por `AuthGuard`/`RolesGuard`. El documento generado lista todas las rutas y DTO, incluidas las `@Public`, así que cualquier puerta pública "olvidada" o pensada para no ser descubierta (como la encuesta, cerrada el 28-07 justo porque "nadie del frontend la llama") queda anunciada en `/docs` desde el deploy siguiente. No es fuga de datos (el propio código dice que `/docs` solo describe la forma), es descubrimiento de superficie de ataque.

**Evidencia:**
- `api-rest/src/main.ts` — `DocumentBuilder` y `SwaggerModule.setup('docs', ...)` sin guardia ni condición de ambiente
- `api-rest/src/customer_satisfaction_survey/controller.ts` — comentario 28-07 "NADIE del frontend la llama"

#### x5-14 · La única escritura de administrador donde la empresa viaja desde el navegador

`CustomerSatisfactionSurveyController.createTemplate` exige `@Roles(ADMIN_ONLY)` pero recibe `companyId` por `@Query`, no de la sesión, y lo pasa tal cual a `CustomerSatisfactionSurveyRepository.createTemplate`. Es la única escritura de administrador del repo donde la empresa viaja desde el navegador en vez de la sesión, contra la regla del mapa 15 ("company_id NO viaja desde el navegador", con `UsersController.create` y `CompaniesController.update` como contraejemplo correcto). Un administrador de la empresa A puede crear o pisar la plantilla de encuesta de la empresa B con solo cambiar el query param.

**Evidencia:**
- `api-rest/src/customer_satisfaction_survey/controller.ts` — `createTemplate`: `@Roles(...ADMIN_ONLY)`, `@Query('companyId')`
- `api-rest/src/customer_satisfaction_survey/repository.ts` — `createTemplate(companyId, ...)`
- `docs/arquitectura/mapa/15_ACCESO_EMPRESA_USUARIOS_Y_PLANES.md` — regla 10

#### x5-15 · El reseteo de contraseña no distingue el tipo de token

`POST /auth/password/reset` es `@Public`, sin `@Throttle` propio, y `AuthService.resetPasswordWithToken` solo valida el token con `supabase.auth.getUser(accessToken)` antes de llamar `auth.admin.updateUserById` con la password nueva — no verifica que el token sea de tipo `recovery` (esa distinción vive solo en el frontend, `ResetPasswordPage`). Cualquier access token de sesión normal filtrado (navegador compartido, captura de red) alcanza para fijar una contraseña nueva sin conocer la anterior, con solo el techo global de 300/min. `PATCH /users/password` (`UsersService.updatePassword`) tampoco pide la contraseña actual, solo la nueva.

**Evidencia:**
- `api-rest/src/auth/auth.controller.ts` — `resetPassword @Public`, sin `@Throttle`
- `api-rest/src/auth/auth.service.ts` — `resetPasswordWithToken`: `getUser` + `admin.updateUserById`, sin chequeo de tipo
- `api-rest/src/users/users.service.ts` — `updatePassword(userId, newPassword)` sin `oldPassword`

#### x5-16 · Recepción puede reclasificar un tipo de evento como "consulta", contra lo que dice el documento

`EventTypesController` (crear/actualizar/eliminar) y `ConsultasController.guardarConfig` no tienen `@Roles`, así que basta la sesión: cualquier cargo, recepción incluida, puede reclasificar un tipo de evento como "consulta" o cambiar su correo automático, aunque el doc 12 y el comentario del controller dicen "el administrador vive en la página Consultas" — contradicción código/documento confirmada. Además `App.tsx` da a `/consultas` el rol `quotations` (recepción incluida) pero a `/quotation-form` el rol `quotations_edit` (vendedor en adelante); el botón "convertir" de `ConsultasPage` ya crea el cliente y navega a `/quotation-form`, así que recepción termina en "Permisos Insuficientes" con la consulta ya consumida.

**Evidencia:**
- `api-rest/src/consultas/event-types.controller.ts` — crear/actualizar/eliminar sin `@Roles`
- `api-rest/src/consultas/consultas.controller.ts` — `guardarConfig` sin `@Roles`
- `frontend/src/App.tsx` — `consultas` con `SECTION_ROLES.quotations`, `quotation-form` con `quotations_edit`
- `frontend/src/constants/permissions.ts` — `quotations: RECEPTION_AND_UP`, `quotations_edit: SALES_AND_UP`
- `docs/arquitectura/12_MODULO_DE_CONSULTAS.md` — "El administrador vive en la página Consultas"

#### x5-17 · Cualquier sesión de la empresa puede borrar un comprobante bancario

`StorageController` (`upload`, `signed-url`, `delete`) y `PortalReceiptsController.list` no tienen `@Roles`: `StorageService` solo verifica que el archivo sea de la empresa (`verificarDueno`), no el cargo, así que cualquier sesión de la empresa —recepción incluida— puede ver o BORRAR un comprobante bancario del balde privado `payment-receipts`, aunque confirmar/rechazar sí exige `OPERATIONS_AND_UP`. `remove()` solo borra el objeto del balde y retorna `{ deleted: !error }`: `payment_transactions.receipt_photo_url` y `portal_receipts.file_url` quedan apuntando a un archivo inexistente, sin aviso — justo lo que se usa al cuadrar la caja.

**Evidencia:**
- `api-rest/src/storage/storage.controller.ts` — `upload`/`signed-url`/`delete` sin `@Roles`
- `api-rest/src/storage/storage.service.ts` — `verificarDueno`, `remove: return { deleted: !error }`
- `api-rest/src/quotations/portal-receipts.controller.ts` — `list` sin `@Roles`; `confirm`/`reject` con `@Roles(...OPERATIONS_AND_UP)`

#### x5-18 · El techo por IP depende de un salto de proxy fijo en el código

`main.ts` fija `set('trust proxy', 1)`, calzando con exactamente un salto de proxy (Railway), y de eso dependen todos los techos por IP de `ThrottlerGuard`: confirmados en el código 10/min (formulario público, comprobante portal, encuesta, baja, lead, suscripción), 30/min (imprimir, `event-types/public`), 1200/min (webhook) y 300/min global. Agregar una capa de proxy o CDN delante de la API sin ajustar ese número hace que Express vea la IP del proxy intermedio para todos los clientes, compartiendo un mismo balde — el propio comentario del código lo advierte.

**Evidencia:**
- `api-rest/src/main.ts` — `set('trust proxy', 1)` y comentario
- `api-rest/src/app.module.ts` — `ThrottlerModule.forRoot([{ ttl: 60000, limit: 300 }])`
- `api-rest/src/quotations/portal.controller.ts`, `quotations.controller.ts`, `marketing.controller.ts`, `super-admin.controller.ts`, `consultas/event-types.controller.ts`, `customer_satisfaction_survey/controller.ts` — `@Throttle` 10/30/1200

#### x5-19 · Una empresa desactivada sigue recibiendo solicitudes públicas y mandando correos con su marca

`POST /quotations/public/:company_id` (`@Public`, 10/min) llama `QuotationsService.createPublic`, que no verifica que la empresa exista ni esté activa (`companies.is_active` no aparece filtrado en ningún repositorio) antes de crear cliente, contacto con `portal_token`, requerimiento, y disparar dos correos con la marca de esa empresa. Como los id de empresa son correlativos y existen puertas públicas hermanas para recorrerlos (`companies/public/:id`, `clients/types/public/:company_id`, `event-types/public/:companyId`), desactivar una empresa desde super-admin no le corta las solicitudes públicas ni los correos salientes con su marca.

**Evidencia:**
- `api-rest/src/quotations/quotations.controller.ts` — `createPublic @Public`, `@Throttle` 10/min
- `api-rest/src/quotations/quotations.service.ts` — `createPublic`: sin chequeo de empresa antes de `embudoPara`/`findMatch`/`create`
- `api-rest/src/companies/companies.controller.ts`, `clients.controller.ts`, `event-types.controller.ts` — puertas `/public/:id` hermanas
- `grep 'is_active'` en `api-rest/src` — `companies.is_active` no aparece filtrado en ningún `.eq()`

#### x5-20 · El upsert de marcas de cocina no filtra por empresa en la escritura

`MovilService.marcarCocina` hace `upsert` en `kitchen_checklist_marks` con `onConflict: 'quotation_id,clave'`, una llave de conflicto que NO incluye `company_id`, aunque el payload sí trae `company_id` de la sesión. El repositorio nunca verifica que `quotationId` sea de la empresa de la sesión, así que otra empresa que conozca el UUID puede crear o SOBRESCRIBIR una marca existente (el upsert también pisa `company_id` y `marcado_por`), haciendo que la marca desaparezca de la vista del dueño real (`marcasCocina` filtra por `company_id`). Es el patrón a no copiar: filtro por `company_id` en lectura/borrado, pero no en la escritura del upsert.

**Evidencia:**
- `api-rest/src/movil/movil.service.ts` — `marcarCocina`: `upsert onConflict 'quotation_id,clave'`, sin verificar dueño
- `api-rest/src/movil/movil.controller.ts` — `marcar`, `marcas`
- CLAUDE.md — filtro por `company_id` en repositorios

### x6 — Cálculos de dinero

#### x6-01 · La hoja, el PDF y el correo recalculan la propina en vez de leer el monto guardado

La hoja (visor, PDF adjunto, portal) y el correo tipo NO leen `tip_amount` guardado: ambos recalculan la propina como `Math.round(variableTotal × tip_percentage/100)` —código prácticamente idéntico en `buildQuotationPrintDoc` (`frontend/src/utils/quotationPrintDoc.ts`, bajo el comentario obsoleto "Propina: se recalcula (no se guarda el monto)") y en `totalesDeCotizacion` (`api-rest/src/quotations/correo-cotizacion.ts`)—, sin el tope de 100% que sí aplican `computeMoney` y `tipAmountOf` (`api-rest/src/quotations/utils/tip.ts`, comentario "El monto guardado manda"). De ahí sacan `totalConIva = total_amount − propina_recalculada`, `neto = round(totalConIva/1.19)` e `iva = totalConIva − neto`. `listaBlancaDeHoja` (`api-rest/src/quotations/hoja-publica.ts`) no incluye `tip_amount` ni `discount_amount`, así que la hoja y el portal no podrían usar el monto guardado aunque quisieran. El TOTAL impreso siempre calza contra `total_amount`, pero Neto, IVA, Propina y Descuento se calculan con una fórmula distinta a la que fijó el monto guardado en la migración 37. Las pruebas (`correo-cotizacion.spec.ts`) fijan este comportamiento recalculando la propina en vez de leer `tip_amount`. Si mañana cambia la fórmula de propina en `computeMoney` (por ejemplo, calcularla después del descuento), las cotizaciones ya guardadas conservarían su `tip_amount` real, pero la hoja, el PDF y el correo mostrarían otra propina y otro Neto/IVA para el mismo total — un documento que no calzaría con lo cobrado. El cambio exige tocar a la vez `computeMoney`, `buildQuotationPrintDoc`, `totalesDeCotizacion` y `listaBlancaDeHoja`.

**Evidencia:**
- `frontend/src/utils/quotationPrintDoc.ts` — bloque bajo "Propina: se recalcula (no se guarda el monto)": `tipAmount = Math.round(variableTotal * (tipPct/100))`, sin tope de 100%
- `api-rest/src/quotations/correo-cotizacion.ts` — `totalesDeCotizacion` con la misma fórmula: `propina = Math.round(variableTotal * (tipPct/100))`
- `api-rest/src/quotations/hoja-publica.ts` — `listaBlancaDeHoja` no incluye `tip_amount` ni `discount_amount`
- `api-rest/src/quotations/utils/tip.ts` — `tipAmountOf` con tope `Math.min(Math.max(pct,0),100)` y comentario "El monto guardado manda"
- `frontend/src/utils/quotationMoney.ts` — mismo comentario "El monto guardado manda"
- `docs/arquitectura/13_ENVIO_DE_COTIZACIONES.md` — línea 161: "la propina se descuenta del total" (documenta el mismo cálculo replicado)
- `api-rest/src/quotations/tests/unit/correo-cotizacion.spec.ts` — test "la propina se descuenta del total antes del IVA, como la hoja", cotización base sin `tip_amount`

#### x6-02 · Las personas de una caja variable vieja se calculan distinto en el motor y en la hoja

`computeMoney.boxPeople` (`api-rest/src/quotations/utils/money.ts`) calcula las personas de una caja variable vieja sin `people` como el TOTAL del evento (adultos + niños). `quotationPrintDoc.groupPeople` (frontend) y `correo-cotizacion.personasDelGrupo` (backend) calculan lo mismo como solo los adultos o niños de la audiencia de la caja (`audienceTotal`). En una cotización vieja con niños, `total_amount` se cobró multiplicando por todos, pero la hoja y el correo muestran "Subtotal alimentación" multiplicando solo por adultos; también deja cajas viejas de adultos fuera de `value_per_person` en `money.ts`. Unificar una sola de las dos reglas sin tocar la otra cambia el total de cotizaciones viejas con niños al reabrirlas y guardarlas (y si están aceptadas, mueve cuotas o crea reembolsos).

**Evidencia:**
- `api-rest/src/quotations/utils/money.ts`: `computeMoney`, `const boxPeople = (box) => box.people == null ? peopleCount : n(box.people)`
- `frontend/src/utils/quotationPrintDoc.ts`: `buildQuotationPrintDoc`, `const groupPeople = (g) => typeof g.people === 'number' ? g.people : audienceTotal(g) || people_count`
- `api-rest/src/quotations/correo-cotizacion.ts`: `personasDelGrupo = publicoDelGrupo(g,q) || people_count`

#### x6-03 · El "Descuento" que ve el cliente se deduce por resta, no se lee de la base

El "Descuento" que ve el cliente en la hoja de cotización (`quotationPrintDoc.ts`) y en el correo (`correo-cotizacion.ts`) no se lee de `quotations.discount_amount`/`discount_percentage`: se deduce como `Math.max(0, subtotal - totalConIva)`. La propina que arma ese `totalConIva` se recalcula distinto que en el motor: `computeMoney` redondea `variableGrandTotal` ANTES de sacar la propina (`money.ts`), mientras `quotationPrintDoc`/`correo-cotizacion` suman `variableTotal` SIN redondear y solo redondean `tipAmount` al final. Con precios decimales (`NumberInput` acepta coma) esa diferencia de un peso aparece en el documento del cliente como un "Descuento" que el vendedor nunca dio, y nadie lo nota porque el Total sigue calzando.

**Evidencia:**
- `frontend/src/utils/quotationPrintDoc.ts`: `const discount = Math.max(0, subtotal - totalConIva)`; fila "Descuento"
- `api-rest/src/quotations/correo-cotizacion.ts`: `totalesDeCotizacion`, `const descuento = Math.max(0, subtotal - totalConIva)`
- `api-rest/src/quotations/utils/money.ts`: `variableGrandTotal = Math.round(...)` ANTES de `tipAmount = Math.round(variableGrandTotal * pct/100)`, vs `quotationPrintDoc.ts` `variableTotal` sin `Math.round`

#### x6-04 · Un servicio fijo "por persona" se re-resuelve siempre o se congela, según su antigüedad

Hay dos formas de fijar el precio de un servicio fijo "por persona". Las fotos viejas (`precio=0`, `precio_por_persona>0`, anteriores al 24-07) se re-resuelven CADA VEZ en `computeMoney.fixedPrice` (`money.ts`) usando el `people_count` actual. Las fotos nuevas congelan el precio al agregarlo: `QuotationForm.handleFixedServiceSelect` (`calculatePrice` con `formData.people_count`) y `ServiciosTab.resolveFixedServicePrice`. La hoja (`quotationPrintDoc`) y el correo (`correo-cotizacion`) usan `f.precio || 0` SIN resolver: un fijo viejo se ve en $0 ahí, y `reparosDelPortero` bloquea el envío del correo con "Hay servicios con precio $0". Quitar el respaldo de fotos viejas en `money.ts` cambia el total de esas cotizaciones al reabrirlas; hacer que las nuevas se re-resuelvan cambiaría precios ya negociados.

**Evidencia:**
- `api-rest/src/quotations/utils/money.ts`: `computeMoney.fixedPrice`, comentario "Un fijo con precio 0 y tarifa por persona > 0 solo puede ser una foto vieja"
- `frontend/src/pages/quotations/QuotationForm.tsx`: `handleFixedServiceSelect`, `calculatedPrice = calculatePrice(service, formData.people_count)`
- `frontend/src/pages/postventa/ServiciosTab.tsx`: `resolveFixedServicePrice(s, personas)`
- `api-rest/src/quotations/correo-cotizacion.ts`: `reparosDelPortero` (`if (!f.precio || f.precio <= 0) enCero...`) y `totalesDeCotizacion` con `f.precio || 0`

#### x6-05 · La prioridad del descuento (monto vs porcentaje) está al revés entre pantalla y motor

La prioridad del descuento está al revés en dos capas. `docs/migrations/6_discount_amount.sql` dice "si `discount_amount` > 0 se usa el monto; si no, `discount_percentage`", y las pantallas siguen esa regla al abrir: `QuotationForm` hace `setDiscType((quotation.discount_amount||0) > 0 ? '$' : '%')` y `ServiciosTab` usa `initDiscAmount > 0 ? '$' : '%'`. Pero `computeMoney` y `verifyMoney` (`money.ts`) hacen lo contrario: dan prioridad al PORCENTAJE y `verifyMoney` exige `discount_amount=0` en modo %. En una fila vieja con ambos campos > 0, el motor calcula por %, pero la pantalla se abre en modo $; el auto-guardado de `ServiciosTab` (1.5 s) reescribe `discount_percentage` en 0 y rehace el total con el monto, cambiándolo sin que nadie toque el descuento — si la cotización está aceptada, la cascada de `QuotationsService.update` mueve cuotas o crea reembolsos.

**Evidencia:**
- `docs/migrations/6_discount_amount.sql`: "Convención: si `discount_amount` > 0 se usa el monto"
- `api-rest/src/quotations/utils/money.ts`: `computeMoney` (`pct > 0 ? ... : discount_amount`) y `verifyMoney` (`pctMode ? 0 : t.discountAmount`)
- `frontend/src/pages/quotations/QuotationForm.tsx`: `setDiscType((quotation.discount_amount || 0) > 0 ? '$' : '%')`
- `frontend/src/pages/postventa/ServiciosTab.tsx`: `discType` inicial con `initDiscAmount`, auto-guardado en `save()`
- `api-rest/src/quotations/utils/tip.ts`: comentario "la misma convención del descuento, que guarda porcentaje y monto desde la migración 6"

#### x6-06 · Varias sumas de plata siguen usando "+" sin Number(), pese al incidente de la cuota fantasma

El propio código documenta (`normalizePaymentAfterTransactions`, incidente real del 24-08, cuota fantasma #486) que Supabase entrega los numeric como TEXTO, y aun así varias sumas de plata usan `+`/`+=` sin `Number()`: `QuotationsService.update` (`alreadyPaidAmount = sum + transaction.amount`; `lastPayment.amount + amountToCharge`, cascada 2.1/2.2), `QuotationsService.getPortalData` (`abonado = s + t.amount`, `pagadoBruto = s + c.abonado` — `saldo`/`saldoTotal` sí quedan protegidos porque usan resta, que JS coerciona a número), `PaymentsService.findAllPaymentsWithTransactions` (`paid_amount = sum + t.amount`), `AnalyticsService.getDashboardStats` (`acc[monthYear] += payment.amount`, `cobrado += payment.amount`, `ya.monto += l.monto` en `porEvento`) y `super-admin.repository.armarStatsMensuales` (`actual.monto + q.total_amount`). Cualquier módulo nuevo que copie una de estas sumas hereda el riesgo de concatenación.

**Evidencia:**
- `api-rest/src/payments/payments.service.ts`: `normalizePaymentAfterTransactions`, comentario "AL PESO Y COMO NÚMERO (24-08)"; `findAllPaymentsWithTransactions` (`paid_amount = transactions.reduce((sum,t)=>sum+t.amount,0)`)
- `api-rest/src/quotations/quotations.service.ts`: `update`, bloques 2.1/2.2 (`alreadyPaidAmount`, `lastPayment.amount + amountToCharge`) y `getPortalData` (`abonado`, `pagadoBruto` sin `Number()`)
- `api-rest/src/analytics/analytics.service.ts`: `getDashboardStats` (`acc[monthYear] += payment.amount`; `totalPaymentsDetailByMonth[key].cobrado += payment.amount`; `porEvento` con `ya.monto += l.monto`)
- `api-rest/src/super-admin/super-admin.repository.ts`: `armarStatsMensuales` (`actual.monto + (q.total_amount || 0)`)

#### x6-07 · Post-Venta puede anunciar un ajuste automático que el motor nunca ejecutó

`ServiciosTab.save()` (Post-Venta → Servicios) calcula `refund = Math.max(0, Math.round(paidAmount) - newTotal)` con `paidAmount` BRUTO (prop `event.paid`, sin restar reembolsos ya devueltos) y muestra el aviso ("se ajustó el plan", "se generó un reembolso de...") en cualquier estado que NO sea `solicitada`/`enviada`/`en_negociacion`/`rechazada` — es decir, también en "cancelada" y "realizada". El motor (`QuotationsService.update`) solo corre la cascada 2.1/2.2 que mueve cuotas o crea reembolsos cuando `quotation_status === 'aceptada'` exactamente. En un evento cancelado o realizado, Post-Venta puede anunciar un ajuste automático que el motor nunca ejecutó, o un monto de reembolso distinto del real.

**Evidencia:**
- `frontend/src/pages/postventa/ServiciosTab.tsx`: `save()`, `const enPreVenta = ['solicitada','enviada','en_negociacion','rechazada'].includes(...)`; `const refund = Math.max(0, Math.round(paidAmount) - newTotal)`
- `frontend/src/pages/postventa/PostVentaPage.tsx`: `paidAmount={event.paid}`
- `api-rest/src/quotations/quotations.service.ts`: `update`, `if (quotation.quotation_status === QuotationStatus.ACEPTADA) { ...bloques 2.1/2.2... }`
- `api-rest/src/quotations/constants/constants.ts`: `enum QuotationStatus` incluye CANCELADA y REALIZADA, ninguna en la lista `enPreVenta` de `ServiciosTab`

#### x6-08 · Los topes de descuento por rol están escritos dos veces, sobre bases distintas

Los topes de descuento por rol (administrador 40%, vendedor y operaciones 15%, recepción 0%) están escritos dos veces, idénticos, en `QuotationForm.getMaxDiscountForRole` y `ServiciosTab.getMaxDiscountForRole` — y calculados en pesos sobre bases distintas: `QuotationForm` usa `formData.subtotal_amount` (un estado de efecto), `ServiciosTab` usa el subtotal vivo de `computeMoney`. Ningún tope por rol vive en el motor: `create-quotation.dto.ts` (heredado por `UpdateQuotationDto` vía `PartialType`) solo valida `@Min(0)` en `discount_percentage`/`discount_amount`, y `computeMoney` solo limita a 100%/subtotal. Cambiar los topes exige tocar dos archivos a la vez, y un PATCH que no pase por esas dos pantallas puede guardar cualquier % de descuento sin que el motor lo rechace.

**Evidencia:**
- `frontend/src/pages/quotations/QuotationForm.tsx`: `getMaxDiscountForRole` (administrador 40, vendedor/operaciones 15, recepcion 0), `getMaxDiscountAmount` con `formData.subtotal_amount`
- `frontend/src/pages/postventa/ServiciosTab.tsx`: `getMaxDiscountForRole` (idéntico), `getMaxDiscountAmount` con subtotal vivo
- `api-rest/src/quotations/dto/create-quotation.dto.ts`: `discount_percentage` y `discount_amount` solo con `@Min(0)`
- `api-rest/src/quotations/dto/update-quotation.dto.ts`: `export class UpdateQuotationDto extends PartialType(CreateQuotationDto)`
- `api-rest/src/quotations/utils/money.ts`: `computeMoney`, pct limitado a `Math.min(pct,100)`, sin tope por rol

#### x6-09 · El IVA de 19% está a mano en 4 lugares, con 2 fórmulas de redondeo distintas

El IVA de 19% está escrito a mano en cuatro lugares y con DOS fórmulas de redondeo distintas. `QuotationForm` y `ServiciosTab` calculan `Neto = round(T/1.19)` e `IVA = round(T - T/1.19)` (T sin redondear). `quotationPrintDoc.ts` y `correo-cotizacion.ts` calculan `neto = round(T/1.19)` pero `iva = T - neto` (T menos el NETO ya redondeado) — fórmula distinta que solo coincide si T es entero. Además T no es el mismo dato en ambos lados: en pantalla es la propina VIVA (`formData`/`tipAmount`), en la hoja/correo es la propina RECALCULADA (x6-01/x6-03). No existe columna de tasa por empresa, aunque el Dashboard ya formatea multi-moneda con `company.currency`, así que una empresa de otro país o tasa obtendría documentos con IVA chileno.

**Evidencia:**
- `frontend/src/pages/quotations/QuotationForm.tsx`: `totalConIva = formData.total_amount - tipAmountUI`; `Neto = Math.round(totalConIva/1.19)`; `IVA = Math.round(totalConIva - totalConIva/1.19)`
- `frontend/src/pages/postventa/ServiciosTab.tsx`: mismo patrón con `totalConIva = total - tipAmount`
- `frontend/src/utils/quotationPrintDoc.ts`: `neto = Math.round(totalConIva / 1.19)`; `iva = totalConIva - neto`
- `api-rest/src/quotations/correo-cotizacion.ts`: `totalesDeCotizacion`, mismo patrón neto/iva
- `frontend/src/pages/dashboard/DashboardPage.tsx`: `formatCurrency(..., company?.currency || 'CLP')` en múltiples puntos

#### x6-10 · "Venta sin propina" tiene 3 fórmulas, una de ellas sin el respaldo de las otras dos

"Venta sin propina" tiene tres fórmulas. (1) `tipAmountOf`/`saleWithoutTip`, copiadas a mano y declaradas espejo entre `api-rest/src/quotations/utils/tip.ts` y `frontend/src/utils/quotationMoney.ts`, CON respaldo que reconstruye la propina desde `tip_percentage` si `tip_amount` llegó en 0 (ventana de la migración 37). (2) `Calendar.resumenMes` resta `Math.max(0, total_amount - tip_amount)` DIRECTO, sin ese respaldo. (3) El margen del cotizador/Servicios usa la propina viva del formulario. El alias `@dinero` (`vite.config.ts`, `tsconfig.json`) apunta solo a `money.ts`, no a `tip.ts`. En filas con `tip_amount=0` y `tip_percentage>0`, el Calendario muestra la venta CON propina mientras el Dashboard la muestra SIN, y un cambio a `tipAmountOf` no se refleja en el Calendario.

**Evidencia:**
- `frontend/src/pages/calendar/Calendar.tsx`: `resumenMes`, `s + Math.max(0, (q.total_amount||0) - (q.tip_amount||0))`
- `api-rest/src/quotations/utils/tip.ts`: `tipAmountOf` (respaldo de reconstrucción), `saleWithoutTip`, comentario "El espejo de este archivo en el frontend es `quotationMoney.ts`"
- `frontend/src/utils/quotationMoney.ts`: `tipAmountOf`, `saleWithoutTip` idénticos
- `frontend/vite.config.ts` / `frontend/tsconfig.json`: alias `@dinero` → `api-rest/src/quotations/utils/money.ts` (no incluye `tip.ts`)

#### x6-11 · Varias pantallas suman la venta CON propina sin pasar por la fórmula común

Fuera del Dashboard, varias pantallas suman o comparan "venta" CON propina (`total_amount` crudo) sin pasar por `saleWithoutTip`/`tipAmountOf`: `ClientDetailPage` (`totalCotizado`, `totalVendido = Σ Number(total_amount)`), `marketing/segmento.ts` (filtro `monto_min` sobre `total_amount` de aceptadas/realizadas), `super-admin.repository.armarStatsMensuales` (suma sin `Number()`, ver x6-06), y el umbral de alto valor 💎 (migración 60, `company.high_value_threshold`) comparado contra `total_amount` en `QuotationsPage` y `Calendar` — este último justo al lado de `resumenMes` que sí resta la propina. El "total vendido" de la ficha de cliente no cuadra con "Ventas" del Dashboard, y una cotización puede entrar a una audiencia de marketing o llevar 💎 solo por el tamaño de su propina.

**Evidencia:**
- `frontend/src/pages/ClientDetailPage.tsx`: `totalCotizado`, `totalVendido = reduce((s,q)=>s+Number(q.total_amount||0),0)`
- `api-rest/src/marketing/segmento.ts`: filtro `monto_min` con `Number(q.total_amount)`
- `api-rest/src/super-admin/super-admin.repository.ts`: `armarStatsMensuales`, `monto: actual.monto + (q.total_amount||0)`
- `frontend/src/pages/quotations/QuotationsPage.tsx`: `umbralAltoValor = Number(company?.high_value_threshold||0)`; `quotation.total_amount >= umbralAltoValor`
- `frontend/src/pages/calendar/Calendar.tsx`: `(q.total_amount||0) >= umbralAltoValor`, junto a `resumenMes`

#### x6-12 · El costo de un evento cambia según qué se haya cargado en Post-Venta

Hay tres costos de un mismo evento. `DashboardPage.marginData` usa `costoInsumos + (tieneCargados ? recursos??0 : r.costoFijos)` más `personalPorEvento` aparte (`people.repository.costoPersonalPorEvento`) — `tieneCargados` es `true` si el evento tiene recursos O personal cargados en Post-Venta. `GestionTab`/`EventResourcesSection`/`ServiciosTab` en Post-Venta usan costo de insumos (o `provisioned_cost`) + `costoDeRecursos(líneas)` + Σ sillas, SIN ese respaldo de catálogo: un evento sin nada cargado muestra solo insumos ahí. Basta cargar UNA silla de personal para que `tieneCargados` pase a `true` y los costos fijos de catálogo desaparezcan del cálculo del Dashboard, moviendo el margen del mes sin que haya cambiado ningún costo real.

**Evidencia:**
- `frontend/src/pages/dashboard/DashboardPage.tsx`: `marginData`, `const tieneCargados = recursos !== undefined || personal !== undefined`; `proveedores = costoInsumos + (tieneCargados ? (recursos??0) : r.costoFijos)`
- `frontend/src/pages/postventa/GestionTab.tsx`: `costoBase = provisioned && provisioned_cost!==null ? provisioned_cost : costoInsumos`; `costoTotal = costoBase + costoRecursos`
- `frontend/src/pages/postventa/EventResourcesSection.tsx`: `total = costoDelEvento(lines,personas) + costoSillas`
- `frontend/src/pages/postventa/ServiciosTab.tsx`: `costo = enPostVenta ? costoBaseReal + costoRecursos : margenEvento.costo`
- `api-rest/src/people/people.repository.ts`: `costoPersonalPorEvento`, comentario "...vacías al estimado"

#### x6-13 · El pozo de propina se digita a mano y nunca se cruza con lo cobrado de verdad

El pozo de propina del evento (`first_amount`/`second_amount`, `FichasTab.guardarPozo`) se digita a mano; `people.service.ts` solo valida que lo repartido sume el pozo ("La plata repartida no suma el pozo", `repartirPorPuntos`/`repartirAlPeso`). Confirmé que ninguna consulta del módulo de Personas a la tabla `quotations` (`people.repository.ts`: `esCotizacionDeLaEmpresa`, `diasDeEvento`) pide `tip_amount`, y no hay ninguna llamada a `tipAmountOf` en `FichasTab` ni en `people.service.ts`: la regla "la propina va entera al equipo" (cabecera de `quotationMoney.ts`) nunca se cruza con lo efectivamente cobrado al cliente. Si el pozo digitado no coincide con el `tip_amount` real (tipeo, segunda entrega que no llega, propina editada después en Servicios), la diferencia queda o sale de la caja de la empresa sin aviso.

**Evidencia:**
- `frontend/src/pages/personas/FichasTab.tsx`: `guardarPozo.mutate({first_amount})`, `monto = Number(first_amount)+Number(second_amount)`
- `api-rest/src/people/people.service.ts`: `repartirPorPuntos`, "La plata repartida ($...) no suma el pozo ($...)"
- `api-rest/src/people/people.repository.ts`: únicas consultas a `from('quotations')` piden `id` o `event_date`/`event_end_date`, no `tip_amount`
- `frontend/src/utils/quotationMoney.ts`: cabecera "la propina...va entera al equipo"
- `docs/arquitectura/10_MODULO_DE_PERSONAS.md`: "El pozo puede llegar en dos entregas"

#### x6-14 · La vista de reparto por cargo es un gemelo sin redondeo del reparto real por persona

`FichasTab.puntosPorCargo`/`plataDe` (frontend) es un "gemelo" DECLARADO del reparto real de `people.service.ts` (`repartirPorPuntos`/`minutosTrabajados`/`repartirAlPeso`), pero con otra unidad y sin redondeo: la pantalla suma HORAS por CARGO agregado (`horasTrabajadas ?? 9` si falta horario) y calcula `monto × puntos × %/totalPuntos` sin `Math.round`; el motor suma MINUTOS por PERSONA (540 si falta horario) y reparte el pozo al peso (`repartirAlPeso`: piso + restos más grandes, en pesos enteros). Hoy comparten las reglas de fondo (9h por defecto, colación, excluir `no_tip`/`person_id` nulo), pero la suma por persona redondeada del motor puede diferir unos pesos de la vista por cargo sin redondear. Cambiar el horario por defecto, la colación o quién queda fuera del pozo en solo uno de los dos archivos hace que la pantalla muestre un reparto y la nómina pague otro, sin error visible.

**Evidencia:**
- `frontend/src/pages/personas/FichasTab.tsx`: `puntosPorCargo` con `horasTrabajadas(...)??9`; `plataDe = monto*puntos*pct/totalPuntos`, comentario "Gemelo del cálculo del backend"
- `api-rest/src/people/people.service.ts`: `repartirPorPuntos`, `minutosTrabajados` (`return 540` si falta horario), comentario "Gemelo del cálculo del frontend"; `repartirAlPeso`

#### x6-15 · El saldo de un evento tiene 3 definiciones distintas según la pantalla

El saldo de un evento tiene tres definiciones distintas. Post-Venta (`PostVentaPage.fetchEvents`): `total = total_amount || Σ cuotas`, `saldo = total - (Σ paid_amount - reembolsos pagados)`. Portal del mandante (`QuotationsService.getPortalData`): `saldo = total_amount - (abonos - reembolsos)`, SIN el respaldo de sumar cuotas si falta `total_amount`. HOY/Dashboard (`sumarPorCobrar` en `hoy.controller.ts` y `analytics.service.getDashboardStats`): `Σ max(0, cuota - abonos)` por cuota, que ignora `total_amount` y los reembolsos A PROPÓSITO (comentario "Los REEMBOLSOS no entran acá"). Cuando las cuotas no suman exactamente el total (una cascada que creó reembolso, un total cambiado sin replantear el plan), un mismo evento puede figurar "pagado" en Post-Venta y con saldo pendiente en el portal o en "Por cobrar".

**Evidencia:**
- `frontend/src/pages/postventa/PostVentaPage.tsx`: `fetchEvents`, `total = q?.total_amount || ps.reduce(...)`; `saldo = total - (paid - refunded)`
- `api-rest/src/quotations/quotations.service.ts`: `getPortalData`, `pagadoBruto`/`pagado`/`saldo` directos sobre `total_amount`, sin respaldo en cuotas
- `api-rest/src/analytics/hoy.controller.ts`: `sumarPorCobrar`, comentario "Los REEMBOLSOS no entran acá"

#### x6-16 · El cuadre del plan de pagos en pantalla no redondea; el motor sí, y puede rechazar

`PaymentPlanEditor.tsx` cuadra el plan SIN redondear (`diff = total - suma`, `canSave = diff===0`) y solo redondea por cuota (`Math.round`) al guardar. El motor (`PaymentsService.createPaymentPlan`) compara `Σ Math.round(cuota)` contra `Math.round(Number(total_amount))` y rechaza si no calzan, con `NumberInput` aceptando decimales (coma chilena). Comprobé el caso borde citado: `333.333,5 + 333.333,5 + 333.333 = 1.000.000` exacto en pantalla (`diff=0`, botón habilitado), pero `Math.round(333333.5)+Math.round(333333.5)+Math.round(333333) = 333334+333334+333333 = 1.000.001` al guardar — el motor rechaza con "El total pudo cambiar hace poco: recarga la página...", un mensaje que no explica la causa real (redondeo, no un total desactualizado).

**Evidencia:**
- `frontend/src/components/PaymentPlanEditor.tsx`: `suma = rows.reduce(...)`; `diff = total - suma`; `canSave = ...&& diff===0`; `handleSave`: `amount: Math.round(r.amount||0)`
- `api-rest/src/payments/payments.service.ts`: `createPaymentPlan`, `sumaCuotas = payments.reduce((s,p)=>s+Math.round(p.amount||0),0)`; `totalActual = Math.round(Number(total_amount||0))`; mensaje "El total pudo cambiar hace poco: recarga la página y arma el plan de nuevo."

## Matriz: si tocas este módulo, revisa también

Esta matriz se arma juntando los módulos que aparecen en cada conexión de arriba (columna "Evidencia") — no es un mapa de dependencias completo del sistema, solo lo que quedó comprobado en este documento. Todos los mapas de módulo (01 a 19) están en estado "verificado una vez contra el código"; ninguno es borrador.

La tabla confirma algo esperable pero importante de tener escrito: `quotations` es la tabla central del sistema, así que **Cotizador (01), Negocio (02), Post-Venta (04) y Calendario/móvil/infraestructura del motor (16)** son módulos que casi cualquier cambio en cualquier otra parte termina rozando. En el otro extremo, **Base de datos (18)** y **Despliegue (19)** son los más aislados: solo se cruzan con el resto en un puñado de conexiones puntuales (funciones SQL sueltas, respaldo, variables de ambiente), no como parte del flujo de negocio día a día.

| Módulo | Revisa también | Algunas conexiones que lo explican |
|---|---|---|
| [01 · Cotizador](01_COTIZADOR.md) | [02](02_NEGOCIO_ENVIO_Y_SEGUIMIENTO.md), [03](03_PAGOS_REEMBOLSOS_Y_PORTAL.md), [04](04_POST_VENTA.md), [05](05_CATALOGO_DE_SERVICIOS.md), [06](06_LOGISTICA_COMPRAS_E_INVENTARIO.md), [07](07_PERSONAS_DIRECTORIO_Y_PLANIFICACION.md), [08](08_PERSONAS_LIQUIDACION_NOMINA_E_HISTORICO.md), [09](09_CLIENTES.md), [10](10_MARKETING.md), [11](11_CONSULTAS_Y_FORMULARIOS_PUBLICOS.md), [12](12_CORREOS_INTERNOS_Y_NOTIFICACIONES.md), [13](13_DASHBOARD_Y_ANALITICA.md), [14](14_ENCUESTAS_DE_SATISFACCION.md), [15](15_ACCESO_EMPRESA_USUARIOS_Y_PLANES.md), [16](16_CALENDARIO_MOVIL_E_INFRAESTRUCTURA_DEL_MOTOR.md), [17](17_KIT_DE_LA_CASA_Y_BASE_DE_LA_APP.md), [18](18_BASE_DE_DATOS.md) | x1-01, x1-16, x2-03, x4-03, x5-01, x5-02, x6-01 |
| [02 · Negocio, envío y seguimiento](02_NEGOCIO_ENVIO_Y_SEGUIMIENTO.md) | [01](01_COTIZADOR.md), [03](03_PAGOS_REEMBOLSOS_Y_PORTAL.md), [04](04_POST_VENTA.md), [05](05_CATALOGO_DE_SERVICIOS.md), [06](06_LOGISTICA_COMPRAS_E_INVENTARIO.md), [07](07_PERSONAS_DIRECTORIO_Y_PLANIFICACION.md), [08](08_PERSONAS_LIQUIDACION_NOMINA_E_HISTORICO.md), [09](09_CLIENTES.md), [10](10_MARKETING.md), [11](11_CONSULTAS_Y_FORMULARIOS_PUBLICOS.md), [12](12_CORREOS_INTERNOS_Y_NOTIFICACIONES.md), [13](13_DASHBOARD_Y_ANALITICA.md), [14](14_ENCUESTAS_DE_SATISFACCION.md), [15](15_ACCESO_EMPRESA_USUARIOS_Y_PLANES.md), [16](16_CALENDARIO_MOVIL_E_INFRAESTRUCTURA_DEL_MOTOR.md), [17](17_KIT_DE_LA_CASA_Y_BASE_DE_LA_APP.md) | x2-03, x2-06, x3-12, x3-13, x4-04, x4-09, x4-24 |
| [03 · Pagos, reembolsos y portal](03_PAGOS_REEMBOLSOS_Y_PORTAL.md) | [01](01_COTIZADOR.md), [02](02_NEGOCIO_ENVIO_Y_SEGUIMIENTO.md), [04](04_POST_VENTA.md), [06](06_LOGISTICA_COMPRAS_E_INVENTARIO.md), [08](08_PERSONAS_LIQUIDACION_NOMINA_E_HISTORICO.md), [09](09_CLIENTES.md), [10](10_MARKETING.md), [11](11_CONSULTAS_Y_FORMULARIOS_PUBLICOS.md), [12](12_CORREOS_INTERNOS_Y_NOTIFICACIONES.md), [13](13_DASHBOARD_Y_ANALITICA.md), [14](14_ENCUESTAS_DE_SATISFACCION.md), [15](15_ACCESO_EMPRESA_USUARIOS_Y_PLANES.md), [16](16_CALENDARIO_MOVIL_E_INFRAESTRUCTURA_DEL_MOTOR.md), [17](17_KIT_DE_LA_CASA_Y_BASE_DE_LA_APP.md) | x1-09, x2-03, x2-05, x4-17, x5-04, x6-06, x6-16 |
| [04 · Post-Venta](04_POST_VENTA.md) | [01](01_COTIZADOR.md), [02](02_NEGOCIO_ENVIO_Y_SEGUIMIENTO.md), [03](03_PAGOS_REEMBOLSOS_Y_PORTAL.md), [05](05_CATALOGO_DE_SERVICIOS.md), [06](06_LOGISTICA_COMPRAS_E_INVENTARIO.md), [07](07_PERSONAS_DIRECTORIO_Y_PLANIFICACION.md), [08](08_PERSONAS_LIQUIDACION_NOMINA_E_HISTORICO.md), [09](09_CLIENTES.md), [10](10_MARKETING.md), [11](11_CONSULTAS_Y_FORMULARIOS_PUBLICOS.md), [12](12_CORREOS_INTERNOS_Y_NOTIFICACIONES.md), [13](13_DASHBOARD_Y_ANALITICA.md), [14](14_ENCUESTAS_DE_SATISFACCION.md), [15](15_ACCESO_EMPRESA_USUARIOS_Y_PLANES.md), [16](16_CALENDARIO_MOVIL_E_INFRAESTRUCTURA_DEL_MOTOR.md), [17](17_KIT_DE_LA_CASA_Y_BASE_DE_LA_APP.md) | x1-11, x1-16, x3-01, x3-09, x5-06, x6-07, x6-12 |
| [05 · Catálogo de servicios](05_CATALOGO_DE_SERVICIOS.md) | [01](01_COTIZADOR.md), [02](02_NEGOCIO_ENVIO_Y_SEGUIMIENTO.md), [04](04_POST_VENTA.md), [06](06_LOGISTICA_COMPRAS_E_INVENTARIO.md), [07](07_PERSONAS_DIRECTORIO_Y_PLANIFICACION.md), [08](08_PERSONAS_LIQUIDACION_NOMINA_E_HISTORICO.md), [09](09_CLIENTES.md), [10](10_MARKETING.md), [11](11_CONSULTAS_Y_FORMULARIOS_PUBLICOS.md), [13](13_DASHBOARD_Y_ANALITICA.md), [15](15_ACCESO_EMPRESA_USUARIOS_Y_PLANES.md), [16](16_CALENDARIO_MOVIL_E_INFRAESTRUCTURA_DEL_MOTOR.md), [17](17_KIT_DE_LA_CASA_Y_BASE_DE_LA_APP.md), [18](18_BASE_DE_DATOS.md) | x1-01, x1-14, x4-03, x4-05, x6-04 |
| [06 · Logística, compras e inventario](06_LOGISTICA_COMPRAS_E_INVENTARIO.md) | [01](01_COTIZADOR.md), [02](02_NEGOCIO_ENVIO_Y_SEGUIMIENTO.md), [03](03_PAGOS_REEMBOLSOS_Y_PORTAL.md), [04](04_POST_VENTA.md), [05](05_CATALOGO_DE_SERVICIOS.md), [07](07_PERSONAS_DIRECTORIO_Y_PLANIFICACION.md), [08](08_PERSONAS_LIQUIDACION_NOMINA_E_HISTORICO.md), [09](09_CLIENTES.md), [10](10_MARKETING.md), [11](11_CONSULTAS_Y_FORMULARIOS_PUBLICOS.md), [13](13_DASHBOARD_Y_ANALITICA.md), [15](15_ACCESO_EMPRESA_USUARIOS_Y_PLANES.md), [16](16_CALENDARIO_MOVIL_E_INFRAESTRUCTURA_DEL_MOTOR.md), [17](17_KIT_DE_LA_CASA_Y_BASE_DE_LA_APP.md) | x1-04, x1-11, x1-16, x4-13, x4-16, x5-08 |
| [07 · Personas: directorio y planificación](07_PERSONAS_DIRECTORIO_Y_PLANIFICACION.md) | [01](01_COTIZADOR.md), [02](02_NEGOCIO_ENVIO_Y_SEGUIMIENTO.md), [03](03_PAGOS_REEMBOLSOS_Y_PORTAL.md), [04](04_POST_VENTA.md), [05](05_CATALOGO_DE_SERVICIOS.md), [06](06_LOGISTICA_COMPRAS_E_INVENTARIO.md), [08](08_PERSONAS_LIQUIDACION_NOMINA_E_HISTORICO.md), [09](09_CLIENTES.md), [10](10_MARKETING.md), [11](11_CONSULTAS_Y_FORMULARIOS_PUBLICOS.md), [13](13_DASHBOARD_Y_ANALITICA.md), [14](14_ENCUESTAS_DE_SATISFACCION.md), [15](15_ACCESO_EMPRESA_USUARIOS_Y_PLANES.md), [16](16_CALENDARIO_MOVIL_E_INFRAESTRUCTURA_DEL_MOTOR.md), [17](17_KIT_DE_LA_CASA_Y_BASE_DE_LA_APP.md) | x1-04, x2-16, x3-08, x3-09, x4-14, x5-06 |
| [08 · Personas: liquidación, nómina e histórico](08_PERSONAS_LIQUIDACION_NOMINA_E_HISTORICO.md) | [01](01_COTIZADOR.md), [02](02_NEGOCIO_ENVIO_Y_SEGUIMIENTO.md), [03](03_PAGOS_REEMBOLSOS_Y_PORTAL.md), [04](04_POST_VENTA.md), [05](05_CATALOGO_DE_SERVICIOS.md), [06](06_LOGISTICA_COMPRAS_E_INVENTARIO.md), [07](07_PERSONAS_DIRECTORIO_Y_PLANIFICACION.md), [09](09_CLIENTES.md), [10](10_MARKETING.md), [11](11_CONSULTAS_Y_FORMULARIOS_PUBLICOS.md), [13](13_DASHBOARD_Y_ANALITICA.md), [15](15_ACCESO_EMPRESA_USUARIOS_Y_PLANES.md), [16](16_CALENDARIO_MOVIL_E_INFRAESTRUCTURA_DEL_MOTOR.md), [17](17_KIT_DE_LA_CASA_Y_BASE_DE_LA_APP.md) | x1-16, x2-17, x3-08, x3-10, x6-13, x6-14 |
| [09 · Clientes](09_CLIENTES.md) | [01](01_COTIZADOR.md), [02](02_NEGOCIO_ENVIO_Y_SEGUIMIENTO.md), [03](03_PAGOS_REEMBOLSOS_Y_PORTAL.md), [04](04_POST_VENTA.md), [05](05_CATALOGO_DE_SERVICIOS.md), [06](06_LOGISTICA_COMPRAS_E_INVENTARIO.md), [07](07_PERSONAS_DIRECTORIO_Y_PLANIFICACION.md), [08](08_PERSONAS_LIQUIDACION_NOMINA_E_HISTORICO.md), [10](10_MARKETING.md), [11](11_CONSULTAS_Y_FORMULARIOS_PUBLICOS.md), [12](12_CORREOS_INTERNOS_Y_NOTIFICACIONES.md), [13](13_DASHBOARD_Y_ANALITICA.md), [14](14_ENCUESTAS_DE_SATISFACCION.md), [15](15_ACCESO_EMPRESA_USUARIOS_Y_PLANES.md), [16](16_CALENDARIO_MOVIL_E_INFRAESTRUCTURA_DEL_MOTOR.md), [17](17_KIT_DE_LA_CASA_Y_BASE_DE_LA_APP.md) | x1-05, x1-07, x1-17, x4-12, x4-19, x6-11 |
| [10 · Marketing](10_MARKETING.md) | [01](01_COTIZADOR.md), [02](02_NEGOCIO_ENVIO_Y_SEGUIMIENTO.md), [03](03_PAGOS_REEMBOLSOS_Y_PORTAL.md), [04](04_POST_VENTA.md), [05](05_CATALOGO_DE_SERVICIOS.md), [06](06_LOGISTICA_COMPRAS_E_INVENTARIO.md), [07](07_PERSONAS_DIRECTORIO_Y_PLANIFICACION.md), [08](08_PERSONAS_LIQUIDACION_NOMINA_E_HISTORICO.md), [09](09_CLIENTES.md), [11](11_CONSULTAS_Y_FORMULARIOS_PUBLICOS.md), [12](12_CORREOS_INTERNOS_Y_NOTIFICACIONES.md), [13](13_DASHBOARD_Y_ANALITICA.md), [14](14_ENCUESTAS_DE_SATISFACCION.md), [15](15_ACCESO_EMPRESA_USUARIOS_Y_PLANES.md), [16](16_CALENDARIO_MOVIL_E_INFRAESTRUCTURA_DEL_MOTOR.md), [17](17_KIT_DE_LA_CASA_Y_BASE_DE_LA_APP.md) | x1-05, x1-17, x2-11, x2-13, x4-10, x4-11, x5-09 |
| [11 · Consultas y formularios públicos](11_CONSULTAS_Y_FORMULARIOS_PUBLICOS.md) | [01](01_COTIZADOR.md), [02](02_NEGOCIO_ENVIO_Y_SEGUIMIENTO.md), [03](03_PAGOS_REEMBOLSOS_Y_PORTAL.md), [04](04_POST_VENTA.md), [05](05_CATALOGO_DE_SERVICIOS.md), [06](06_LOGISTICA_COMPRAS_E_INVENTARIO.md), [07](07_PERSONAS_DIRECTORIO_Y_PLANIFICACION.md), [08](08_PERSONAS_LIQUIDACION_NOMINA_E_HISTORICO.md), [09](09_CLIENTES.md), [10](10_MARKETING.md), [12](12_CORREOS_INTERNOS_Y_NOTIFICACIONES.md), [13](13_DASHBOARD_Y_ANALITICA.md), [14](14_ENCUESTAS_DE_SATISFACCION.md), [15](15_ACCESO_EMPRESA_USUARIOS_Y_PLANES.md), [16](16_CALENDARIO_MOVIL_E_INFRAESTRUCTURA_DEL_MOTOR.md), [17](17_KIT_DE_LA_CASA_Y_BASE_DE_LA_APP.md) | x1-06, x2-12, x4-01, x4-18, x4-19, x5-16, x5-19 |
| [12 · Correos internos y notificaciones](12_CORREOS_INTERNOS_Y_NOTIFICACIONES.md) | [01](01_COTIZADOR.md), [02](02_NEGOCIO_ENVIO_Y_SEGUIMIENTO.md), [03](03_PAGOS_REEMBOLSOS_Y_PORTAL.md), [04](04_POST_VENTA.md), [05](05_CATALOGO_DE_SERVICIOS.md), [06](06_LOGISTICA_COMPRAS_E_INVENTARIO.md), [07](07_PERSONAS_DIRECTORIO_Y_PLANIFICACION.md), [08](08_PERSONAS_LIQUIDACION_NOMINA_E_HISTORICO.md), [09](09_CLIENTES.md), [10](10_MARKETING.md), [11](11_CONSULTAS_Y_FORMULARIOS_PUBLICOS.md), [13](13_DASHBOARD_Y_ANALITICA.md), [14](14_ENCUESTAS_DE_SATISFACCION.md), [15](15_ACCESO_EMPRESA_USUARIOS_Y_PLANES.md), [16](16_CALENDARIO_MOVIL_E_INFRAESTRUCTURA_DEL_MOTOR.md), [17](17_KIT_DE_LA_CASA_Y_BASE_DE_LA_APP.md), [19](19_DESPLIEGUE_Y_OPERACION.md) | x1-03, x2-01, x2-08, x2-11, x4-11, x5-12 |
| [13 · Dashboard y analítica](13_DASHBOARD_Y_ANALITICA.md) | [01](01_COTIZADOR.md), [02](02_NEGOCIO_ENVIO_Y_SEGUIMIENTO.md), [03](03_PAGOS_REEMBOLSOS_Y_PORTAL.md), [04](04_POST_VENTA.md), [05](05_CATALOGO_DE_SERVICIOS.md), [06](06_LOGISTICA_COMPRAS_E_INVENTARIO.md), [07](07_PERSONAS_DIRECTORIO_Y_PLANIFICACION.md), [08](08_PERSONAS_LIQUIDACION_NOMINA_E_HISTORICO.md), [09](09_CLIENTES.md), [10](10_MARKETING.md), [11](11_CONSULTAS_Y_FORMULARIOS_PUBLICOS.md), [14](14_ENCUESTAS_DE_SATISFACCION.md), [15](15_ACCESO_EMPRESA_USUARIOS_Y_PLANES.md), [16](16_CALENDARIO_MOVIL_E_INFRAESTRUCTURA_DEL_MOTOR.md), [17](17_KIT_DE_LA_CASA_Y_BASE_DE_LA_APP.md), [18](18_BASE_DE_DATOS.md) | x1-01, x1-02, x4-07, x4-14, x4-25, x6-06 |
| [14 · Encuestas de satisfacción](14_ENCUESTAS_DE_SATISFACCION.md) | [01](01_COTIZADOR.md), [02](02_NEGOCIO_ENVIO_Y_SEGUIMIENTO.md), [03](03_PAGOS_REEMBOLSOS_Y_PORTAL.md), [04](04_POST_VENTA.md), [05](05_CATALOGO_DE_SERVICIOS.md), [06](06_LOGISTICA_COMPRAS_E_INVENTARIO.md), [07](07_PERSONAS_DIRECTORIO_Y_PLANIFICACION.md), [08](08_PERSONAS_LIQUIDACION_NOMINA_E_HISTORICO.md), [09](09_CLIENTES.md), [10](10_MARKETING.md), [11](11_CONSULTAS_Y_FORMULARIOS_PUBLICOS.md), [12](12_CORREOS_INTERNOS_Y_NOTIFICACIONES.md), [13](13_DASHBOARD_Y_ANALITICA.md), [15](15_ACCESO_EMPRESA_USUARIOS_Y_PLANES.md), [16](16_CALENDARIO_MOVIL_E_INFRAESTRUCTURA_DEL_MOTOR.md), [17](17_KIT_DE_LA_CASA_Y_BASE_DE_LA_APP.md), [19](19_DESPLIEGUE_Y_OPERACION.md) | x4-02, x4-08, x4-23, x5-01, x5-03, x5-13, x5-14 |
| [15 · Acceso, empresa, usuarios y planes](15_ACCESO_EMPRESA_USUARIOS_Y_PLANES.md) | [01](01_COTIZADOR.md), [02](02_NEGOCIO_ENVIO_Y_SEGUIMIENTO.md), [03](03_PAGOS_REEMBOLSOS_Y_PORTAL.md), [04](04_POST_VENTA.md), [05](05_CATALOGO_DE_SERVICIOS.md), [06](06_LOGISTICA_COMPRAS_E_INVENTARIO.md), [07](07_PERSONAS_DIRECTORIO_Y_PLANIFICACION.md), [08](08_PERSONAS_LIQUIDACION_NOMINA_E_HISTORICO.md), [09](09_CLIENTES.md), [10](10_MARKETING.md), [11](11_CONSULTAS_Y_FORMULARIOS_PUBLICOS.md), [12](12_CORREOS_INTERNOS_Y_NOTIFICACIONES.md), [13](13_DASHBOARD_Y_ANALITICA.md), [14](14_ENCUESTAS_DE_SATISFACCION.md), [16](16_CALENDARIO_MOVIL_E_INFRAESTRUCTURA_DEL_MOTOR.md), [17](17_KIT_DE_LA_CASA_Y_BASE_DE_LA_APP.md), [19](19_DESPLIEGUE_Y_OPERACION.md) | x4-06, x5-04, x5-06, x5-09, x5-15, x5-18 |
| [16 · Calendario, móvil e infraestructura del motor](16_CALENDARIO_MOVIL_E_INFRAESTRUCTURA_DEL_MOTOR.md) | [01](01_COTIZADOR.md), [02](02_NEGOCIO_ENVIO_Y_SEGUIMIENTO.md), [03](03_PAGOS_REEMBOLSOS_Y_PORTAL.md), [04](04_POST_VENTA.md), [05](05_CATALOGO_DE_SERVICIOS.md), [06](06_LOGISTICA_COMPRAS_E_INVENTARIO.md), [07](07_PERSONAS_DIRECTORIO_Y_PLANIFICACION.md), [08](08_PERSONAS_LIQUIDACION_NOMINA_E_HISTORICO.md), [09](09_CLIENTES.md), [10](10_MARKETING.md), [11](11_CONSULTAS_Y_FORMULARIOS_PUBLICOS.md), [12](12_CORREOS_INTERNOS_Y_NOTIFICACIONES.md), [13](13_DASHBOARD_Y_ANALITICA.md), [14](14_ENCUESTAS_DE_SATISFACCION.md), [15](15_ACCESO_EMPRESA_USUARIOS_Y_PLANES.md), [17](17_KIT_DE_LA_CASA_Y_BASE_DE_LA_APP.md), [18](18_BASE_DE_DATOS.md), [19](19_DESPLIEGUE_Y_OPERACION.md) | x1-02, x2-01, x2-14, x4-22, x5-17, x5-18, x5-20 |
| [17 · Kit de la casa y base de la app](17_KIT_DE_LA_CASA_Y_BASE_DE_LA_APP.md) | [01](01_COTIZADOR.md), [02](02_NEGOCIO_ENVIO_Y_SEGUIMIENTO.md), [03](03_PAGOS_REEMBOLSOS_Y_PORTAL.md), [04](04_POST_VENTA.md), [05](05_CATALOGO_DE_SERVICIOS.md), [06](06_LOGISTICA_COMPRAS_E_INVENTARIO.md), [07](07_PERSONAS_DIRECTORIO_Y_PLANIFICACION.md), [08](08_PERSONAS_LIQUIDACION_NOMINA_E_HISTORICO.md), [09](09_CLIENTES.md), [10](10_MARKETING.md), [11](11_CONSULTAS_Y_FORMULARIOS_PUBLICOS.md), [13](13_DASHBOARD_Y_ANALITICA.md), [14](14_ENCUESTAS_DE_SATISFACCION.md), [15](15_ACCESO_EMPRESA_USUARIOS_Y_PLANES.md), [16](16_CALENDARIO_MOVIL_E_INFRAESTRUCTURA_DEL_MOTOR.md) | x2-04, x3-15, x4-09, x4-16, x4-20, x6-01, x6-16 |
| [18 · Base de datos](18_BASE_DE_DATOS.md) | [01](01_COTIZADOR.md), [04](04_POST_VENTA.md), [05](05_CATALOGO_DE_SERVICIOS.md), [13](13_DASHBOARD_Y_ANALITICA.md), [16](16_CALENDARIO_MOVIL_E_INFRAESTRUCTURA_DEL_MOTOR.md) | x1-01, x1-02, x1-14, x1-15, x6-05 |
| [19 · Despliegue y operación](19_DESPLIEGUE_Y_OPERACION.md) | [12](12_CORREOS_INTERNOS_Y_NOTIFICACIONES.md), [14](14_ENCUESTAS_DE_SATISFACCION.md), [15](15_ACCESO_EMPRESA_USUARIOS_Y_PLANES.md), [16](16_CALENDARIO_MOVIL_E_INFRAESTRUCTURA_DEL_MOTOR.md) | x2-14, x5-12, x5-13 |

## Las 15 conexiones más peligrosas

Selección hecha con un criterio de negocio, no de cantidad: qué tan real es el daño (plata movida sin poder deshacerla, datos de una empresa vistos o alterados por otra, un candado de seguridad que en realidad no protege nada) y si ya hay evidencia en el código de que pasó o casi pasó. Las 15 están ordenadas por tipo, no por severidad — dentro de este grupo, todas merecen mirarse antes de tocar el módulo que les toca.

1. **x5-02 — `QuotationsRepository.findOne` no filtra por empresa en ningún punto.** Es el método más usado del motor y no tiene el filtro de aislamiento entre empresas que exige CLAUDE.md; lo tapan comparaciones sueltas después de leer, hechas llamador por llamador, así que cualquier camino nuevo que use `findOne` nace sin el candado.
2. **x5-01 — El portal reparte el UUID de TODAS las cotizaciones de un mandante, y `GET /quotations/:id` público trae la fila completa (costos internos incluidos).** La lista blanca que promete "los costos internos jamás pasan por aquí" no protege esta puerta.
3. **x5-06 — `PeopleController` no tiene NINGÚN `@Roles`.** Basta tener sesión en la empresa —cualquier cargo— para leer y escribir fichas, sueldos y evaluaciones de personal por API directa.
4. **x5-04 — El `portal_token` secreto del mandante sale por 2 endpoints sin `@Roles`** (`client-contacts` y `payments/transactions`), disponible para cualquier cargo con sesión aunque la pantalla se lo esconda a Recepción.
5. **x5-15 — El reseteo de contraseña no distingue el tipo de token.** Un access token de sesión normal filtrado alcanza para fijar una contraseña nueva sin conocer la anterior.
6. **x5-19 — Una empresa desactivada desde super-admin sigue recibiendo solicitudes públicas y mandando correos con su marca**, porque `createPublic` nunca revisa `companies.is_active`.
7. **x5-20 — El único upsert del sistema que filtra por empresa en lectura/borrado pero NO en la escritura** (`marcarCocina`): otra empresa que conozca el UUID puede sobrescribir la marca de cocina de un evento ajeno.
8. **x5-05 — Recepción puede borrar o enviar por correo una cotización formal por API directa**; el candado de rol solo vive en la pantalla, no en `remove` ni en `enviarPorCorreo`.
9. **x2-03 — Cambiar el total de una cotización aceptada mueve plata real (cuotas y reembolsos) sin transacción**, con al menos 6 pantallas capaces de disparar la cascada con un peso de diferencia.
10. **x2-05 — Rehacer el plan de pagos salta el candado de "realizada" y puede revivir una cotización "cancelada"**, además de duplicar cuotas si el borrado previo falla en silencio.
11. **x2-17 (con x1-16) — El candado de borrado de una cotización solo cuenta 4 tablas; el resto se va en cascada sin aviso**, y la migración que agrega el CASCADE de nómina/propinas dice en su propio encabezado "Aplicada en PRODUCCIÓN: pendiente".
12. **x2-14 — El respaldo diario bloquea el proceso ENTERO de forma síncrona**, justo en la ventana de los reinicios y deploys, y puede anotar "BACKUP OK" con tablas incompletas.
13. **x6-06 — Varias sumas de dinero (`quotations.service`, `payments`, `analytics`, `super-admin`) siguen usando `+` sin `Number()`**, pese a que el propio código documenta el incidente real de la cuota fantasma #486 (24-08) que causó exactamente este bug.
14. **x6-16 — El cuadre del plan de pagos en pantalla no redondea y el motor sí**, así que un plan que se ve perfecto en `PaymentPlanEditor` puede ser rechazado por el motor con un mensaje que no explica la causa real.
15. **x6-01 — La hoja, el PDF y el correo de una cotización recalculan la propina en vez de leer el monto guardado**, con fórmula sin el tope de 100% que sí tiene el motor: el documento que ve el cliente puede no calzar con lo que realmente se le cobró.

## Medición en producción del 11-09-2026

Medido en "Cotizador-dev" (producción) leyendo solo `information_schema`, después del cierre del mapa.

| Tabla | Tipo de `id` | ¿Se puede recorrer? |
| --- | --- | --- |
| `quotations` | `uuid`, `gen_random_uuid()` | No, pero el portal entrega los UUID al mandante (x5-01) |
| `payments` | `uuid`, `gen_random_uuid()` | No |
| `user_profiles` | `uuid`, `gen_random_uuid()` | No |
| `service_groups` | `bigint` identity | Sí |
| `service_group_collections` | `bigint` identity | Sí |
| `fixed_services` | `bigint` identity | Sí |

Consecuencias para las conexiones de este documento:

- **x5-02 y la cascada de `QuotationsService.update`**: una sesión de otra empresa necesita el UUID de la cotización. Si lo tiene, la cascada ve las cuotas ajenas, porque `findAllPaymentsFromQuotation` filtra la empresa sobre un embebido sin `!inner`. También borra el plan ajeno por `deletePaymentsByQuotationId`, que recibe `companyId` y no lo usa. Además crea o consume reembolsos ajenos y puede mandar el correo "cotización enviada" al cliente ajeno. La escritura final de la cotización sí filtra por empresa, así que la cotización misma no cambia.
- **x5-01**: `QuotationsRepository.findOne` selecciona `*`, y en producción existen `provisioned_cost`, `provisioned_people` y `provisioned_services`. El mandante que tiene el portal puede leer esos costos de sus propias cotizaciones.
- **`DELETE /payments/:id`**: no recibe usuario y borra registros y cuota solo por id, pero el id es UUID. Ninguna pantalla lo llama; el frontend solo borra registros por `DELETE /payments/transactions/:id`, que sí recibe la empresa.
- **Catálogo, la puerta más fácil de recorrer**: `DELETE /service-groups/:id`, `DELETE /service-group-collections/:id` y `PATCH /services/fixed/:id` filtran solo por id y sus ids son correlativos. Ver [flujos/16_CAMBIAR_EL_CATALOGO.md](flujos/16_CAMBIAR_EL_CATALOGO.md), pasos 8, 23 y 24, y su zona de riesgo 13.
- **Mecanismo de `!inner`**: confirmado en la documentación de Supabase, guía *Querying Joins and Nested tables*. Sin `!inner`, las filas padre vuelven aunque la tabla relacionada no calce.

Nada de esto está arreglado. Cada arreglo necesita plan y OK de Felipe.
