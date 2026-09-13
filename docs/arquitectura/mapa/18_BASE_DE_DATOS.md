# Mapa: Base de datos

> **Estado: verificado una vez contra el código** (commit bd6a0e1, 11-09-2026), actualizado el 11-09-2026 con las migraciones 107-109 y el estado del sprint 1. Falta la etapa de completar lo que no quedó escrito. Parte del atlas de docs/arquitectura/mapa; el índice es 00_MAPA_DEL_SISTEMA.md.

## 1. Qué es y cómo se aplican los cambios

Una sola base Postgres en Supabase guarda todo el sistema y a todas las empresas. La comparten el motor y la app, pero **solo el motor conversa con las tablas**:

- **El motor** (`api-rest/`) entra con la llave de servicio a través de `SupabaseService` (`api-rest/src/supabase/`). Esa llave se salta la seguridad de fila (RLS), así que la base no separa a las empresas: lo hace cada consulta con su filtro `company_id` (`CLAUDE.md`, "Backend architecture").
- **La app** (`frontend/`) usa Supabase solo para la sesión (`frontend/src/lib/supabase.ts`, `AuthContext`). Un grep de `.from(`, `.rpc(` y `.storage` en `frontend/src` da 17 coincidencias, todas `Array.from(...)` sin relación con Supabase: ninguna llamada real. Desde las migraciones 40 y 41 (28-07-2026) se borraron las políticas de `authenticated` y `anon` y se revocaron sus permisos. La 41 lo resume así: "La base solo conversa con el backend".
- **Archivos**: Supabase Storage, con cuatro baldes (sección 5).

**Cómo se cambia la base.** No hay ejecutor automático. Cada cambio es un archivo SQL en `docs/migrations/` que alguien pega a mano en el editor SQL de Supabase, **primero en el laboratorio y después en producción**. Lo dicen la cabecera de `68_personas.sql` ("NO LA CORRE EL SISTEMA. Hay que aplicarla a mano en Supabase, primero en el laboratorio y después en producción") y la de `104_modulo_consultas.sql` ("CORRER EN LAB Y EN PRODUCCIÓN"). El repo no registra qué migración está aplicada en cuál base: algunas cabeceras lo anotan a mano y quedaron desactualizadas (sección 9).

Qué hay en `docs/migrations/` (144 archivos, contadas el 11-09-2026 tras sumar la 107, la 108 y la 109):

| Tipo | Cantidad | Nota |
|---|---|---|
| Migraciones hacia adelante | 109: numeradas del 1 al 109 (**no existe la 43**) más `68b_produccion_nombres_repetidos_antes_de_la_69.sql` | `68b` "Se corre SOLO en producción, entre la 68 y la 69"; las tres últimas son `107_cerrar_tablas_abiertas.sql`, `108_cerrar_el_grifo.sql` y `109_candado_get_backup_tables.sql` (sección 5, "Permisos, RLS y políticas") |
| Foto del esquema | 1: `0_initial_models.sql`, 12 tablas anteriores a la migración 1 | Su cabecera dice "for context only and is not meant to be run" |
| Reversas | 32, para las migraciones 38 a 66, la 68, la 102, la 107, la 108 y la 109 | Tres formas de nombre: `_reversa.sql`, `.reversa.sql` y `.revertir.sql`. De la 69 en adelante tienen reversa solo la 102, la 107, la 108 y la 109 |
| Rellenos en archivo aparte | 2: `67_...backfill.sql` y `68_personas.backfill.sql` | Los demás rellenos van dentro de su migración: 35, 37, 47, 48, 50, 51, 52, 56, 81, 84, 85 y 86 |

Fuera de esa carpeta también hay SQL vivo en la base: `db_functions_analytics_23_07.sql`, en la raíz del repo, con las 9 funciones del Dashboard. `CLAUDE.md` nombra además `frontend/databaseSchema/database_schema.sql` como foto del esquema, pero esa carpeta se borró el 15-07-2026 (commit `d12d17e`, "remove unused db files in frontend").

**Receta para la próxima migración** (sale de las lecciones escritas en las propias migraciones):

1. Número siguiente: `110_<nombre>.sql`. Conviene escribir también su reversa.
2. Tabla nueva: `company_id bigint NOT NULL REFERENCES public.companies(id)`, y los permisos en el mismo archivo: `GRANT ALL ... TO service_role`, `GRANT USAGE, SELECT` sobre la secuencia y `ENABLE ROW LEVEL SECURITY` sin políticas. Sin eso el motor recibe `42501 permission denied` y la pantalla queda cargando para siempre (comentarios de las migraciones 49, 53, 59, 68, 71, 77, 78, 91, 104 y 105).
3. Si la tabla apunta a `quotations`: `ON DELETE CASCADE`, o sumarla a la guardia `QuotationsRepository.assertDeletable` (migración 79 y el comentario de esa función).
4. Orden frente al despliegue: si el código nuevo escribe la columna, primero el SQL y después el código (37, 38). Si el SQL quita algo que el código viejo usa, primero el código (39).
5. Actualizar entidades y DTO del motor y los tipos de la app (`CLAUDE.md`), y avisarle a Felipe que la debe correr en los dos ambientes.

## 2. Tablas por área

Hay 58 tablas vigentes: 57 salen de las migraciones y `client_types` la usa el código sin tener migración. El motor las usa todas; `company_quotation_counters`, solo a través de su función. `job_roles` nació en la 68 y se borró en la 69 (sección 8). Los números de "módulo dueño" son los mapas del atlas.

### Empresa, usuarios y acceso

| Tabla | Qué guarda | Módulo dueño | Migración que la crea |
|---|---|---|---|
| `companies` | La empresa: `name`, `logo_url`, `colors`, `notifications`, `currency`, `is_active`, `is_premium`; subtítulo y datos de cobro (`tagline`, `bank_details`); umbral de alto valor (`high_value_threshold`); canales de marca para los correos (`whatsapp`, `instagram`, `facebook`, `sitio_web`, `banner_url`) | 15 | `0_initial_models.sql` (foto); columnas en 46, 60, 95 y 96 |
| `user_profiles` | Perfil del usuario: `user_id` → `auth.users`, `email`, `full_name`, `role` (CHECK con los 4 cargos), `company_id` | 15 | `0_initial_models.sql` |
| `leads` | Prospectos de Eventia desde la landing: nombre, teléfono, correo, empresa, tamaño, ventas. **No tiene `company_id`** | 15 (super-admin) | `0_initial_models.sql`; la 39 cierra la inserción anónima |

### Clientes

| Tabla | Qué guarda | Módulo dueño | Migración que la crea |
|---|---|---|---|
| `clients` | El cliente: `name`, `client_type` (el nombre del tipo, como texto), `notes`. Espejo heredado: `contact_person`, `email`, `phone`; `address` es un dato muerto | 09 | `0_initial_models.sql` |
| `client_contacts` | Las personas del cliente: `name`, `email`, `phone`, `is_primary`, `portal_token` | 09 | 34; columnas en 35, 36 y 48 |
| `client_types` | Catálogo de tipos de cliente por empresa (`name`, `sort_order`, deducidas del código) | 09 | **ninguna** |

### Cotizaciones y negocio

| Tabla | Qué guarda | Módulo dueño | Migración que la crea |
|---|---|---|---|
| `quotations` | Cada requerimiento, cotización y evento: cliente y mandante, fecha y rango, personas y niños, `items` (la foto de los servicios), totales, descuento, propina, estado, sellos de envío, encuesta, provisión, pérdida, cosecha | 01 y 02 | `0_initial_models.sql`; columnas y candados en 6, 15, 17, 26, 27, 32, 33, 37, 38, 47 (borrada en 58), 48, 51, 61, 62, 63, 64 y 66 |
| `company_quotation_counters` | Último número de cotización entregado, por empresa | 01 | 38 |
| `quotation_followups` | Bitácora comercial: nota, autor con nombre congelado, `tipo`, próximo contacto y cuándo se cumplió | 02 | 59; 65 |
| `event_documents` | Documentos del evento (contratos, órdenes de compra, facturas, otros) con su URL. **No tiene `company_id`** | 02 y 04 | 8 |

### Pagos, reembolsos y portal

| Tabla | Qué guarda | Módulo dueño | Migración que la crea |
|---|---|---|---|
| `payments` | Cuotas del plan de pagos: número, monto, vencimiento, `status` (CHECK: pendiente, pagado, vencido). Sin `company_id` | 03 | `0_initial_models.sql` |
| `payment_transactions` | Abonos reales: monto, medio, fecha, comprobante (`receipt_photo_url`), `created_by` → `auth.users`. Sin `company_id` | 03 | `0_initial_models.sql`; medios unificados en 102 |
| `refunds` | Reembolsos: monto, pagado, fecha, medio, comprobante. Sin `company_id` | 03 | `0_initial_models.sql`; 7 |
| `portal_receipts` | Comprobantes que sube el cliente desde el portal, pendientes hasta que el equipo los confirma | 03 | 49 |

### Catálogo de servicios

| Tabla | Qué guarda | Módulo dueño | Migración que la crea |
|---|---|---|---|
| `variable_services` | Servicios por persona: código, nombre, precio, `is_active`, `no_cost`; `category` es texto heredado | 05 | `0_initial_models.sql`; 4, 57 |
| `fixed_services` | Servicios fijos: precio, `calculation_type`, costos cacheados `cost_fixed`/`cost_per_person`, `section_id`, `sort_order`, `no_cost` | 05 | `0_initial_models.sql`; 4, 12, 53, 57 |
| `service_categories` | Categorías de los servicios variables, con activo y orden | 05 | 4; 5 |
| `variable_service_categories` | Vínculo servicio ↔ categoría (multicategoría), con orden y sección | 05 | 5; 24 |
| `category_sections` | Secciones de una categoría; a lo más una fija (`is_default`) | 05 | 24; 25 |
| `fixed_service_sections` | Secciones de los servicios fijos | 05 | 53 |
| `service_groups` | Menús guardados | 05 | 1; 2 |
| `service_group_items` | Servicios de un menú, con cantidad | 05 | 1 |
| `service_group_collections` | Paquetes | 05 | 3 |
| `service_group_collection_items` | Menús de un paquete | 05 | 3 |
| `service_group_collection_services` | Servicios variables sueltos de un paquete, con cantidad | 05 | 67 |
| `service_group_collection_fixed_services` | Servicios fijos de un paquete, con cantidad | 05 | 100 |

### Logística, compras e inventario

| Tabla | Qué guarda | Módulo dueño | Migración que la crea |
|---|---|---|---|
| `suppliers` | Proveedores, con persona de contacto | 06 | 10; 29 |
| `supplies` | Insumos: familia de unidad, precio por unidad base, proveedor, merma y formato de compra | 06 | 10; 31 |
| `management_resources` | Recursos de tipo `personal` (desde la 69 son **los cargos**) o `arriendo` (arriendos y servicios externos), con proveedor y precios de lista de referencia | 06 y 07 | 10; 13, 14, 69, 72 |
| `furniture_items` | Mobiliario e inventario: categoría, stock, foto, costo unitario; `preassembled` no tiene migración | 06 | 11; 20, 73 |
| `service_recipe_items` | Receta de un servicio: insumo o mobiliario por persona | 06 | 11 |
| `fixed_service_cost_items` | Costo de un fijo como lista de recursos con cantidad | 06 | 13 |
| `event_supply_provisions` | Compra de cada insumo por evento, con foto de cantidad, costo y proveedor | 06 | 16; 30 |
| `event_resources` | Arriendos y servicios externos de un evento, por día (el personal salió en la 84) | 06 | 17; 18, 70 |
| `event_service_times` | Horario de cada servicio del evento | 06 | 22 |
| `event_kitchen_notes` | Notas de cocina, por día | 06 | 22; 28 |
| `event_day_prints` | Primera impresión de la ficha de cocina de cada día | 06 | 28 |
| `kitchen_checklist_marks` | Checks del retiro de bodega en la app móvil: qué, quién y cuándo | 06 y 16 | 44 |

### Personas

| Tabla | Qué guarda | Módulo dueño | Migración que la crea |
|---|---|---|---|
| `people` | La ficha: RUT, datos bancarios, cargo y planta/freelance por defecto, estado, horario habitual, días libres | 07 | 68; 69, 75, 76, 80 |
| `event_staff` | Una fila por persona y día: de un evento o del restaurante (`quotation_id` NULL), silla vacía (`person_id` NULL), horario, monto, propina y marcas de nómina | 07 y 08 | 71; 74, 77, 82, 84, 88, 89, 90 |
| `staff_sheets` | Ciclo de la ficha de personal del evento: armando → confirmado → trabajado → cerrada | 08 | 77; 79, 86 |
| `tip_pools` | Pozos de propina de un evento o de un día de restaurante | 08 | 77; 79, 83, 87 |
| `person_reviews` | Estrellas y nota por persona y evento | 07 y 08 | 77; 79 |
| `payrolls` | Nóminas | 08 | 77 |
| `payroll_people` | Pago de jornada y de propina por persona dentro de una nómina | 08 | 77 |
| `day_notes` | Recados del día, del día completo o de un evento | 07 | 78; 79 |

### Marketing

| Tabla | Qué guarda | Módulo dueño | Migración que la crea |
|---|---|---|---|
| `marketing_contacts` | Contactos importados, etiquetados por audiencia | 10 | 91; 94 |
| `marketing_suppressions` | Bajas y rebotes por empresa, con la campaña de origen | 10 | 91; 94, 98 |
| `marketing_campaigns` | Campañas: contenido, audiencias, estado, programación, banner y WhatsApp propios, sellos | 10 | 91; 92, 93, 99, 101, 103 |
| `marketing_sends` | Un envío por destinatario y campaña, con aperturas, clics, rebotes y reenvío | 10 | 91; 92, 97 |
| `marketing_audiences` | Audiencias guardadas: un filtro con nombre | 10 | 93 |

### Consultas y formularios públicos

| Tabla | Qué guarda | Módulo dueño | Migración que la crea |
|---|---|---|---|
| `consultas` | Consultas del embudo: la persona, tipo de evento, estado, si salió el correo, la hora citada y el cliente al convertir | 11 | 104; 106 |
| `consulta_config` | Texto y brochures del correo automático, por tipo de evento | 11 | 104 |
| `event_types` | Tipos de evento administrables, con su entrada (`cotizacion` o `consulta`) y activo | 11 | 105 |

### Encuestas

| Tabla | Qué guarda | Módulo dueño | Migración que la crea |
|---|---|---|---|
| `customer_satisfaction_survey_templates` | Las preguntas de la encuesta, una fila por empresa | 14 | `0_initial_models.sql` |
| `customer_satisfaction_survey_responses` | Las respuestas, una por cotización (`quotation_id` UNIQUE en la foto). Sin `company_id` | 14 | `0_initial_models.sql` |

### App móvil y avisos

| Tabla | Qué guarda | Módulo dueño | Migración que la crea |
|---|---|---|---|
| `push_devices` | Teléfonos suscritos a Web Push, por usuario | 16 | 45 |
| `notifications` | Registro de avisos ya empujados; `dedupe_key` único evita repetirlos | 12 y 16 | 45 |

## 3. Relaciones principales

El centro es `quotations`. Casi todo lo operativo cuelga de ella, y lo que cuelga sin CASCADE frena el borrado:

```
companies ──< clients ──< client_contacts            (CASCADE al borrar el cliente)
    │            │              ▲
    │            ▼              │ client_contact_id (SET NULL)
    ├──────< quotations ────────┘
    │            │
    │            ├──< payments ──< payment_transactions      NO ACTION: frena el borrado
    │            ├──< refunds, customer_satisfaction_survey_responses   NO ACTION
    │            ├──< portal_receipts, quotation_followups, event_documents        CASCADE
    │            ├──< event_resources, event_supply_provisions, event_service_times,
    │            │    event_kitchen_notes, event_day_prints                         CASCADE
    │            └──< event_staff, staff_sheets, tip_pools, person_reviews, day_notes CASCADE
    └──< user_profiles ── auth.users
```

**Llaves foráneas, por área** (entre paréntesis, qué pasa al borrar el padre):

- **Cotización**: `client_id` → `clients` (sin acción: la base no deja borrar un cliente con cotizaciones); `client_contact_id` → `client_contacts` (SET NULL, 48); `user_id` → `auth.users`. Los cuatro hijos NO ACTION (`payments`, `payment_transactions`, `refunds`, `customer_satisfaction_survey_responses`) los traduce a mensajes `QuotationsRepository.assertDeletable`. Además, `QuotationsService.remove` frena el borrado de un evento `realizada`.
- **Pagos**: `payment_transactions.payment_id` → `payments` (sin acción); `portal_receipts.payment_id` → `payments` (SET NULL); `portal_receipts.client_contact_id` → `client_contacts` (SET NULL).
- **Encuestas**: `customer_satisfaction_survey_responses.template_id` → `customer_satisfaction_survey_templates`.
- **Catálogo**: `variable_service_categories` → `variable_services` y → `service_categories` (CASCADE las dos), `section_id` → `category_sections` (SET NULL); `category_sections.category_id` → `service_categories` (CASCADE); `fixed_services.section_id` → `fixed_service_sections` (SET NULL); `service_group_items` → `service_groups` y → `variable_services` (CASCADE); `service_group_collection_items` → paquete y → `service_groups` (CASCADE); `service_group_collection_services` → paquete y → `variable_services` (CASCADE); `service_group_collection_fixed_services` → paquete y → `fixed_services` (CASCADE).
- **Logística**: `supplies.supplier_id` y `management_resources.supplier_id` → `suppliers` (SET NULL); `service_recipe_items.supply_id` → `supplies` y `furniture_id` → `furniture_items` (CASCADE); `fixed_service_cost_items` → `fixed_services` y → `management_resources` (CASCADE); `event_supply_provisions.supply_id` → `supplies` (CASCADE) y `supplier_id` → `suppliers` (SET NULL); `event_resources.resource_id` → `management_resources` (CASCADE) y `origin_fixed_service_id` → `fixed_services` (SET NULL).
- **Personas**: el cargo es un `management_resources` de tipo `personal` (migración 69). `people.default_role_id` → `management_resources` (SET NULL); `event_staff.person_id` → `people` (**RESTRICT**); `event_staff.role_id` → `management_resources` (SET NULL); `event_staff.tip_pool_id` → `tip_pools`, y `payroll_id` y `tip_payroll_id` → `payrolls` (sin acción las tres); `person_reviews.person_id` y `payroll_people.person_id` → `people`; `payroll_people.payroll_id` → `payrolls` (sin acción).
- **Marketing**: `marketing_sends.campaign_id` → `marketing_campaigns` (CASCADE); `marketing_campaigns.audiencia_id` → `marketing_audiences` (SET NULL).

**Vínculos sin llave foránea** (la base no los protege):

- Por **texto**: `quotations.event_type` ↔ `event_types.name`; `clients.client_type` ↔ `client_types.name`; `consultas.event_type` y `consultas.client_type`; `consulta_config.event_type`; `marketing_campaigns.tipos_cliente` (arreglo de texto).
- Por **código dentro del jsonb**: `quotations.items` guarda el `codigo` del servicio, no su id ("la foto guarda el CÓDIGO, no el id", migración 54).
- Por **id sin llave**: `service_recipe_items.service_id` (apunta a `variable_services` o `fixed_services` según `service_type`); `kitchen_checklist_marks.quotation_id`; `consultas.client_id`; `marketing_suppressions.campaign_id`; `quotations.recontacted_by` (la 62 lo dice); `quotation_followups.author_user_id`; `push_devices.user_id`.
- **`company_id` sin llave** a `companies`: `event_supply_provisions`, `event_resources`, `event_service_times`, `event_kitchen_notes`, `event_day_prints`, `category_sections`, `kitchen_checklist_marks`, `push_devices`, `notifications`, `portal_receipts`, `fixed_service_sections`, `quotation_followups`.
- **Sin `company_id`**: `payments`, `payment_transactions`, `refunds`, `customer_satisfaction_survey_responses`, `event_documents`, `service_group_items`, `service_group_collection_items`, `service_group_collection_services`, `service_group_collection_fixed_services` y `leads`. Salvo `leads`, que es de Eventia y no de una empresa, la pertenencia se verifica a través del padre (comentarios de `event-documents.controller.ts` y de la migración 67).

## 4. Columnas especiales y jsonb

| Tabla y columna | Tipo y forma | Para qué y quién depende | Evidencia |
|---|---|---|---|
| `quotations.items` | jsonb `{ fixed_services: [{codigo, nombre, precio, quantity, categoria, tipo_calculo, precio_por_persona, min_precio, max_precio}], variable_services: [{category, audience, people, items: [{codigo, nombre, precio, quantity, categoria}]}] }`. Hay fotos antiguas con variables al nivel superior | Es la **foto** de lo cotizado. La leen `used_service_codes`, `get_variable_services_usage`, `get_fixed_services_usage`, el recálculo de `utils/money.ts` (que rechaza guardados que no calzan al peso) y la hoja pública | `QuotationItem` en `quotations/entities/quotation.entity.ts`; `MoneySnapshot` y `VariableBox` en `quotations/utils/money.ts`; migraciones 21, 32 y 54 |
| `quotations.provisioned_services` | jsonb: foto de los servicios al provisionar | La escribe `LogisticsRepository` y avisa si el evento cambió después. `QuotationsRepository` la saca de la lista por pesada ("JSON de miles de líneas") | 17; `logistics.repository.ts` |
| `quotations.quotation_number` | bigint, `UNIQUE (company_id, quotation_number)` | Lo entrega la función `next_quotation_number`; `QuotationsService.create` lo inserta explícito | 38; `QuotationsRepository.nextQuotationNumber` |
| `quotations.quotation_status` | texto **sin CHECK**: `solicitada`, `enviada`, `en_negociacion`, `aceptada`, `rechazada`, `cancelada`, `realizada` | Las funciones de análisis tienen escrito `IN ('aceptada','realizada')` | 26 ("texto libre, sin cambio de esquema"); `QuotationStatus` en `quotations/constants/constants.ts` |
| `quotations.tip_percentage` / `tip_amount`; `discount_percentage` / `discount_amount` | numeric | "El porcentaje es la REGLA [...]; el monto es el HECHO": se guardan ambos | 6, 32, 37 |
| `quotations.harvest_status` | texto con CHECK: `revendido`, `en_gestion`, `no_ha_vuelto`, `no_se_repite`, `descartado`, o NULL | NULL = manda la sugerencia automática | 63, 64 |
| `quotations.loss_reason` | texto sin CHECK; la lista de valores está en el COMMENT | Motivo al rechazar o anular | 61 |
| `quotations.sent_at`, `survey_sent_at`, `recontacted_at`, `recontacted_by`, `event_end_date`, `children_count`, `contact_name`, `client_contact_id`, `provisioned_*` | sellos y vínculos | `contact_name` es la foto de texto del mandante, `client_contact_id` el vínculo real | 15, 17, 26, 27, 32, 33, 48, 51, 62 |
| `companies.notifications` | jsonb `{ emails: { <EmailStructure>: boolean }, replyTo? }` | Interruptores de correos y "Responder a" (mapa 12) | `Company` en `companies/entities/company.entity.ts` |
| `companies.colors` / `companies.bank_details` | jsonb `{primary, secondary}` / `{titular, rut, banco, tipo_cuenta, numero, correo_pagos}` | Marca de los correos; datos de cobro para cobranza y portal | `company.entity.ts`; 46 |
| `client_contacts.portal_token` / `is_primary` | texto UNIQUE / boolean con índice único parcial `uniq_primary_contact_per_client` | Enlace secreto del portal del mandante; una sola principal por cliente | 36, 48 |
| `customer_satisfaction_survey_templates.questions` / `responses.answers` | jsonb `[{id, question, type: text/number/boolean, options?}]` / `[{id, answer}]` | Encuesta (mapa 14) | `entities/*.entity.ts` de `customer_satisfaction_survey` |
| `people.rut`, `account_number`, `bank_code`, `status` | texto con CHECK de forma (`^[0-9]{7,8}-[0-9K]$`, `^[0-9]{5,20}$`), código CMF con ceros adelante, estado con CHECK y motivo obligatorio si está bloqueada | `UNIQUE (company_id, rut)` parcial: la regla que corrige el Excel | 68 |
| `people.weekly_schedule` / `days_off` | jsonb `{"0".."6": {in, out, break}}` / integer[] (0 = domingo) | Escalera de horario: el día, luego el día de semana, luego el horario único, luego el estándar | 76, 80 |
| `event_staff.person_id`, `quotation_id`, `day` | pueden ser NULL: silla vacía, restaurante, silla por ubicar | CHECK `event_staff_dia_o_evento` y `event_staff_silla_con_cargo` | 74, 84 |
| `event_staff.tip_amount`, `tip_pool_id`, `payroll_id`, `tip_payroll_id`, `no_tip`, `solo_propina`, `ajuste`, `puesto_en` | marcas | NULL = pendiente de nómina; `ajuste` con CHECK `trabaja`/`descansa`; `puesto_en` ordena las casillas | 77, 82, 88, 89, 90 |
| `tip_pools.porcentajes` | jsonb `[{role_id, pct}]` | Porcentajes del último reparto por puntos | 87; `people/entities/person.entity.ts` |
| `marketing_campaigns.filtro`, `audiencias`; `marketing_audiences.filtro` | jsonb. Filtro = `FiltroSegmento` (`tipos_cliente`, `con_estados`, `evento_desde`, `evento_hasta`, `sin_cotizacion_desde`, `aniversario`, `monto_min`, `tipos_evento`) | La audiencia es una consulta viva; la campaña guarda una foto del filtro | 92, 93, 99; `marketing/segmento.ts` |
| `marketing_contacts.datos` | jsonb | No se encontró quién la escribe en `api-rest/src/marketing` | 91 |
| `consulta_config.brochures` | jsonb `[{nombre, path, bytes}]` | PDF adjuntos del correo del embudo, en el balde privado | 104; `Brochure` en `consultas.repository.ts` |
| `payment_transactions.payment_method` | texto libre | Unificado el 28-08: Transferencia, Tarjeta, Otro | 102 |

## 5. Funciones, triggers, políticas y extensiones

### Funciones

| Función | Qué hace | Quién la llama | Dónde está definida |
|---|---|---|---|
| `next_quotation_number(p_company_id bigint)` | Entrega el número siguiente de forma atómica, autocorregible contra el MAX real. REVOKE a PUBLIC, `anon` y `authenticated` | `QuotationsRepository.nextQuotationNumber` ← `QuotationsService.create` | 38 |
| `used_service_codes(p_company_id bigint)` | Códigos de servicio que aparecen en alguna cotización (apaga el basurero del catálogo) | `rpc` en `services/services.repository.ts` | 54 |
| `reorder_fixed_services(p_company_id, p_section_id, p_ids[])` | Mueve y ordena fijos en un viaje | `rpc` en `services/services.repository.ts` | 55 |
| `reorder_services_in_category(p_company_id, p_category_id, p_ids[])` | Ordena los vínculos dentro de una categoría | `rpc` en `services/services.repository.ts` | 55 |
| 9 funciones de análisis: `get_quotation_status_stats`, `get_event_type_conversion_stats`, `get_event_type_revenue_stats`, `get_revenue_by_client_type`, `get_top_clients_by_revenue`, `get_variable_services_usage`, `get_fixed_services_usage`, `get_top_clients_by_quotations`, `get_recurring_clients` | Cuadros del Dashboard; "venta" = `aceptada` o `realizada` | `AnalyticsService.getCompleteStats` (mapa 13) | **No están en `docs/migrations`**: solo en `db_functions_analytics_23_07.sql`, en la raíz |
| `get_backup_tables()` | Lista las tablas públicas para el respaldo diario (el comentario dice que sale de `pg_tables`) | `BackupCronService.runBackup` | La función, **en ninguna parte del repo**; sus permisos, desde el 11-09-2026 en la migración 109 (lab y prod) |
| `people_touch_updated_at()` y `event_staff_touch_updated_at()` | Funciones de trigger que ponen `updated_at = now()` | triggers de abajo | 68 y 71 |

Todas las funciones de negocio filtran la empresa **por dentro** (`company_id = p_company_id`) y se llaman con la llave de servicio.

**Ojo con las funciones nuevas.** La migración 108 (11-09-2026) solo revocó los privilegios por defecto sobre TABLAS y SECUENCIAS de `anon`/`authenticated`; no tocó funciones. Medido el 11-09 en `get_backup_tables()`: una función `SECURITY DEFINER` nace con `EXECUTE` para PUBLIC (que incluye a `anon`) a menos que su propia migración lo revoque a mano, como hace ahora la 109. Toda función nueva que se escriba debe repetir ese candado en su propio archivo.

### Triggers

- `people_touch_updated_at_trg` (BEFORE UPDATE en `people`, migración 68) y `event_staff_touch_updated_at_trg` (BEFORE UPDATE en `event_staff`, migración 71). No hay otros en las migraciones.
- `quotations`, `clients`, `payments` y `user_profiles` tienen `updated_at`, pero ninguna migración les pone trigger y un grep de `updated_at:` en `api-rest/src` da 11 coincidencias en 8 archivos, casi todas la declaración de tipo (`updated_at: Date`) en entidades; la única asignación real de un valor es la de `QuotationFollowupsService`. Aun así, `HoyController` usa `quotations.updated_at` para medir cuánto lleva enviada una cotización, y la migración 51 rellenó `sent_at` desde ese dato (pregunta abierta).

### Permisos, RLS y políticas

- **El modelo**: la llave de servicio del motor pasa por encima de RLS. Las migraciones 40 y 41 cerraron la entrada directa desde el navegador: la 40 borró las políticas `app_authenticated` de todas las tablas públicas y revocó todo a `authenticated`; la 41 revocó `anon` en `companies` y `company_quotation_counters` y borró toda política de `anon`.
- **La "Fase 0" de RLS** creó esas políticas y la `public_insert_leads`, que la 39 borra. No tiene archivo en `docs/migrations`: la mencionan la 39, la reversa de la 40, la 49 y la 53.

**11-09-2026 — las 12 tablas que nacieron abiertas (migración 107, lab y prod).** Medido ese día en producción (proyecto `yxezscjznhlnxxdmuvoq`): `portal_receipts`, `fixed_service_sections`, `quotation_followups`, `marketing_contacts`, `marketing_suppressions`, `marketing_campaigns`, `marketing_sends`, `marketing_audiences`, `service_group_collection_fixed_services`, `consultas`, `consulta_config` y `event_types` tenían la seguridad de fila **APAGADA** y los roles `anon`/`authenticated` con permisos **completos** (SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER). La llave `anon` viaja dentro del bundle de `www.eventi-app.com`, así que cualquiera que la sacara de la web podía leer, modificar, borrar o vaciar estas tablas por la API REST, saltándose el motor entero. Comprobado desde afuera con la llave real del sitio, solo contando filas: 2.150 `marketing_contacts`, 3.501 `marketing_sends`, 203 `quotation_followups` y 224 `marketing_suppressions`. La 107 revoca todo a `anon`/`authenticated` en las 12 y les enciende `ENABLE ROW LEVEL SECURITY` sin políticas — mismo patrón que la 68 con `people`. Se corrió en el laboratorio y en producción (en el lab el `REVOKE` no tenía nada que quitar; sirvió como ensayo de que encender RLS no rompe el motor). Verificado tras aplicar: las 12 responden 401 a la llave pública, el motor no se reinició, los relojes siguieron en 200 y el asesor de seguridad de Supabase bajó de 12 a 0 errores `rls_disabled_in_public`.

**Causa raíz — el grifo de `pg_default_acl` (migración 108, solo prod).** Las 12 nacieron abiertas porque el esquema `public` guarda una entrada de "permisos por defecto": toda tabla NUEVA creada por el rol `postgres` heredaba automáticamente permisos completos para `anon` y `authenticated` (`ALTER DEFAULT PRIVILEGES`, no algo que un `GRANT` puntual corrija). Las migraciones 40 y 41 (28-07) solo limpiaron las tablas que existían **ese día**; nunca tocaron el grifo, así que cada tabla creada después volvía a nacer abierta. El laboratorio (`uonjtbyoxawxvhuikbgx`) nunca tuvo esta entrada — por eso allá las mismas 12 tablas existen sin ningún permiso para `anon`/`authenticated`, y el lab lleva meses funcionando así. La 108 corre `ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES/SEQUENCES FROM anon, authenticated`: de ahora en adelante una tabla nueva nace sin permisos públicos. No toca ninguna tabla existente ni las secuencias o funciones.

**Candado a `get_backup_tables()` (migración 109, lab y prod).** La función es `SECURITY DEFINER` (corre con los poderes de su dueño, `postgres`) y su lista de permisos tenía `EXECUTE` para PUBLIC (el `=X` sin nombre delante): cualquiera podía llamarla por `/rest/v1/rpc/get_backup_tables` con la llave `anon` y recibir el nombre de todas las tablas de `public` — no entrega datos, pero sí el plano de la base. La función **no es decorativa**: `BackupCronService.runBackup` la llama por RPC una vez al día para armar el respaldo (`api-rest/src/backup/backup-cron.service.ts`). La 109 revoca `EXECUTE` de PUBLIC y de `anon`/`authenticated`, y además **confirma** el `GRANT` a `service_role` — un cinturón para que el motor no se quede sin respaldo por el mismo movimiento que cierra la función.

**Qué queda abierto tras la 107-109**:
- **El grifo de `supabase_admin`.** `pg_default_acl` tiene una SEGUNDA entrada de permisos por defecto, a nombre de ese rol de plataforma, que la 108 no puede tocar desde acá. En la práctica está cerrado porque todas las tablas de la casa las crea `postgres`, pero una tabla creada como `supabase_admin` nacería abierta otra vez.
- **Las funciones nuevas.** La 108 solo cerró el grifo de TABLAS y SECUENCIAS; una función nueva sigue naciendo con `EXECUTE` para `anon` a menos que su propia migración lo revoque a mano (ver "Funciones" más arriba).
- **Los permisos viejos de `anon`** en las tablas de las migraciones 8, 10, 11, 13 y 34 (ver más abajo y la contradicción 7 de la sección 9): la 108 cierra el grifo hacia ADELANTE, no repara retroactivamente ninguna tabla de antes del 11-09-2026 que no sea una de las 12 de la 107.

**Ojo — `rutina_gym_state`.** Es la app personal de Felipe (rutina de gimnasio), entra con la llave `anon` desde su iPhone, tiene RLS con una política propia y quedó **intacta** por las tres migraciones: ninguna la nombra, y las tres listan sus tablas explícitas en vez de `ALL TABLES IN SCHEMA public`. Cualquier cierre futuro de tablas abiertas tiene que seguir excluyéndola a mano y evitar `ALL TABLES IN SCHEMA`.

**Ojo — `get_backup_tables()` sostiene el respaldo diario.** `BackupCronService.runBackup` la llama por RPC para el respaldo de las 7 AM (medido: 1 llamada al día, agente `node`, el motor). Si alguna vez alguien le revoca el permiso a `service_role` pensando que "ya se cerró", el respaldo se detiene y solo queda una línea en el log — nadie se entera. La función sigue sin estar versionada en `docs/migrations` (se creó fuera del repo); la 109 deja registrados al menos sus permisos.

- **Tablas con `ENABLE ROW LEVEL SECURITY` en su migración**: `company_quotation_counters` (38), `kitchen_checklist_marks` (44), `push_devices` y `notifications` (45), `service_group_collection_services` (67), `people` (68), `event_staff` (71), `staff_sheets`, `tip_pools`, `person_reviews`, `payrolls` y `payroll_people` (77), `day_notes` (78), y desde el 11-09-2026 las 12 de la 107: `portal_receipts`, `fixed_service_sections`, `quotation_followups`, `marketing_contacts`, `marketing_suppressions`, `marketing_campaigns`, `marketing_sends`, `marketing_audiences`, `service_group_collection_fixed_services`, `consultas`, `consulta_config` y `event_types`. Para las demás, el estado de RLS no consta en el repo.
- **Permisos antiguos a `anon` y `authenticated`**: 8 (`event_documents`), 10 (`suppliers`, `supplies`, `management_resources`), 11 (`furniture_items`, `service_recipe_items`), 13 (`fixed_service_cost_items`) y 34 (`client_contacts` y su secuencia). La 40 los quitó para `authenticated`; para `anon`, ninguna migración los revoca, ni siquiera la 107/108 (que solo tocan las 12 tablas medidas el 11-09 y el grifo hacia adelante).
- **`GRANT` a `service_role` en su propia migración (tablas nuevas)**: sí en 44, 45, 49, 53, 54, 55, 59, 68, 71, 77, 78, 91, 93, 97 a 101, 104 y 105. **No** en la 67 (`service_group_collection_services`), que solo enciende RLS. La 109 hace lo mismo para una función, no una tabla: confirma el `EXECUTE` de `service_role` sobre `get_backup_tables()`.

### Storage (archivos)

| Balde | Público | Qué guarda | Migración |
|---|---|---|---|
| `payment-receipts` (`BUCKET_PRIVADO` en `storage/storage.service.ts`) | **No**, desde la 42: se ve con enlace firmado que entrega el motor | Bajo `c<empresa>/`: `portal-receipts/`, `payment-receipts/`, `refund-receipts/`, `event-documents/` y `consulta-brochures/`. Hay rutas viejas sin prefijo, que `verificarDueno` resuelve leyendo la cotización | 9 (lo crea público); 42 (lo cierra) |
| `furniture-photos` | Sí | Fotos del mobiliario | 20 |
| `company-logos` | Sí | Logo, banner de la empresa y banners de campaña | **Ninguna**. Sus políticas `cl_*` solo aparecen para borrarlas (42) y recrearlas (reversa de la 42) |
| `backups` | Privado según `BackupCronService` | `eventia_YYYY-MM-DD.json.gz` con todas las tablas públicas; se guardan 30 días | **Ninguna** |

La 42 borró las 12 políticas de `storage.objects`: el navegador ya no escribe ni lee baldes directo.

### Extensiones

- **`pg_cron` y `pg_net` no aparecen** en ninguna migración, ni en el código, ni en los documentos (grep de `pg_cron`, `pg_net`, `cron.schedule` y `net.http`). Tampoco hay ningún `CREATE EXTENSION`.
- Los relojes viven en el motor con `@Cron` de NestJS y corren solo en producción (mapas 16 y 19): `consultas-cron.service.ts` y `marketing-cron.service.ts` cada minuto; `payments-cron.service.ts` (dos a las 11:00) y `PaymentsService` (01:00); `MovilService` cada 30 minutos; `quotations-cron.service.ts` diario y los lunes a las 11:00; `backup-cron.service.ts` a las 07:00 UTC.
- Se usa `gen_random_uuid()` (0, 47, 48, 50) y el esquema `auth.users` de Supabase Auth (`user_profiles`, `quotations.user_id`, `payment_transactions.created_by`).

### Candados únicos que sostienen los `upsert` del motor

`event_service_times (quotation_id, service_name)`, `event_day_prints (quotation_id, day)`, `event_supply_provisions (quotation_id, supply_id)`, `staff_sheets (company_id, quotation_id)`, `payroll_people (payroll_id, person_id)`, `kitchen_checklist_marks (quotation_id, clave)`, `push_devices (endpoint)`, `consulta_config (company_id, event_type)` como llave primaria, `marketing_contacts (company_id, audiencia, email)` y `marketing_suppressions (company_id, email)` (94), y `service_categories (company_id, name)` (4). Otros candados de negocio: `tip_pools_uno_por_evento` y `tip_pools_uno_por_dia` (83); `event_staff_evento_persona_dia_uniq` (71) y `event_staff_restaurante_persona_dia_uniq` (74); `management_resources_company_tipo_nombre_uniq` (69); `category_sections_one_default` (25); `marketing_sends_una_vez` (91). La 66 agrega seis índices de rendimiento sobre `quotations`, `payments`, `payment_transactions`, `event_documents` y `clients`.

## 6. Quién lee y quién escribe cada tabla

Base: grep de `.from('<tabla>')` (con la operación que sigue) y de `.rpc(` en `api-rest/src`, más las tablas embebidas en los `select`. "Módulo" es la carpeta de `api-rest/src`; entre paréntesis va el archivo cuando no es el repositorio. **La app (`frontend/src`) no lee ni escribe ninguna tabla**: todo pasa por los endpoints del motor.

Tres accesos cubren a todas las tablas o cruzan módulos:

- `backup` lee **todas** las tablas públicas cada día (`BackupCronService`).
- Hay módulos que escriben a través del servicio o repositorio de otro. Por ejemplo, `ConsultasService.convertir` crea clientes y personas con `ClientsService.create` y `ClientContactsRepository.create` (mapa 09), y `AnalyticsService` usa `ClientsService` y `QuotationsService`.
- Se marcan en negrita las tablas que escriben directo dos o más módulos.

| Tabla | Escriben | Leen |
|---|---|---|
| **`quotations`** | `quotations` (crea, edita, borra); `logistics` (`provisioned_at`, `provisioned_cost`, `provisioned_people`, `provisioned_services`) | `quotations` (también `event-documents.controller.ts`), `analytics` (`hoy.controller.ts` y las 9 funciones SQL), `clients`, `consultas` (`event-types.repository.ts`), `logistics`, `marketing`, `movil` (`movil.service.ts`), `people`, `quotation-followups`, `services` (y `used_service_codes`), `storage` (`storage.service.ts`), `super-admin`; embebida desde `payments`, `refunds`, `customer_satisfaction_survey`, `people` y `portal-receipts.controller.ts` |
| `company_quotation_counters` | `quotations`, solo a través de `next_quotation_number` | la misma función |
| **`companies`** | `companies` (insert, update); `plans` (`confirmPlan`: `is_premium`); `super-admin` (insert, update) | `companies`, `super-admin`; embebida desde `users` y `quotations` (portal) |
| `user_profiles` | `users` | `users`, `super-admin` |
| `leads` | `super-admin` | `super-admin` |
| `clients` | `clients` | `clients`, `marketing`, funciones SQL de análisis; embebida desde `quotations`, `payments`, `refunds`, `logistics`, `movil`, `people`, `customer_satisfaction_survey` y `portal-receipts.controller.ts` |
| `client_contacts` | `clients` (`client-contacts.controller.ts`, que contiene `ClientContactsRepository`) | `clients`, `marketing`, `quotations`; embebida desde `clients` y `portal-receipts.controller.ts` |
| `client_types` | `clients` | `clients` |
| `quotation_followups` | `quotation-followups` | `quotation-followups` |
| `event_documents` | `quotations` (`event-documents.controller.ts`) | `quotations` (`event-documents.controller.ts`) |
| `payments` | `payments` | `payments`, `analytics` (`hoy.controller.ts`), `clients`, `movil`, `quotations` (`assertDeletable`); embebida desde `portal-receipts.controller.ts` |
| `payment_transactions` | `payments` | `payments`, `analytics` (`hoy.controller.ts`), `quotations` (`assertDeletable`); embebida desde `movil` |
| `refunds` | `refunds` | `refunds`, `quotations` (`assertDeletable`) |
| `portal_receipts` | `quotations` (`portal-receipts.controller.ts`) | el mismo |
| `customer_satisfaction_survey_templates` | `customer_satisfaction_survey` | `customer_satisfaction_survey` |
| `customer_satisfaction_survey_responses` | `customer_satisfaction_survey` | `customer_satisfaction_survey`, `clients`, `quotations` |
| `variable_services` | `services` (también `upsert` masivo) | `services`, `logistics`; embebida desde `service-groups` y `service-group-collections` |
| **`fixed_services`** | `services` (y `reorder_fixed_services`); `logistics` (`update` de costos) | `services`, `logistics` |
| `service_categories` | `services` | `services` (también `sections.controller.ts`), `quotations` |
| `variable_service_categories` | `services` (`services.repository.ts`, `sections.controller.ts`, `reorder_services_in_category`) | `services`, `quotations` |
| `category_sections` | `services` (`sections.controller.ts`) | `services`, `quotations` |
| `fixed_service_sections` | `services` | `services` |
| `service_groups` | `service-groups` | `service-groups`; embebida desde `services` y `service-group-collections` |
| `service_group_items` | `service-groups` (insert; se borran en cascada) | `services`; embebida desde `service-groups` |
| `service_group_collections` | `service-group-collections` | `service-group-collections` |
| `service_group_collection_items`, `service_group_collection_services`, `service_group_collection_fixed_services` | `service-group-collections` (insert; se borran en cascada) | embebidas desde `service-group-collections` |
| `suppliers`, `supplies`, `furniture_items`, `service_recipe_items`, `fixed_service_cost_items`, `event_supply_provisions`, `event_resources`, `event_service_times`, `event_kitchen_notes`, `event_day_prints` | `logistics` | `logistics` |
| **`management_resources`** | `logistics` (catálogo de recursos); `people` (cargos: insert, update) | `logistics`, `people` (también embebida desde `event_staff` y `people`) |
| `kitchen_checklist_marks` | `movil` (`upsert`, delete) | `movil` |
| `people`, `event_staff`, `staff_sheets`, `tip_pools`, `person_reviews`, `payrolls`, `payroll_people`, `day_notes` | `people` | `people` |
| `marketing_contacts`, `marketing_suppressions`, `marketing_campaigns`, `marketing_sends`, `marketing_audiences` | `marketing` | `marketing` |
| `consultas` | `consultas` | `consultas` (también `event-types.repository.ts`), `clients` (`removeType`) |
| `consulta_config` | `consultas` (`upsert`) | `consultas` |
| `event_types` | `consultas` (`event-types.repository.ts`) | el mismo |
| `push_devices` | `movil` | `movil` |
| `notifications` | `movil` (solo insert; la clave repetida se salta) | nadie |

## 7. Zonas de riesgo

1. **Si creas** una tabla nueva sin `GRANT ALL ... TO service_role` y sin permiso sobre su secuencia, **se afecta** toda pantalla que la use, **porque** las tablas creadas por SQL directo no heredan permisos: el motor recibe `42501 permission denied` y la pantalla queda cargando. Pasó al menos cuatro veces (14-08 con `people`, 25-08 con marketing, 30-07 y 05-09 en el laboratorio). Evidencia: comentarios de las migraciones 49, 59, 68, 71, 91 y 104.
2. **Si agregas** una tabla que apunte a `quotations` sin `ON DELETE CASCADE`, **se afecta** el borrado de cotizaciones, **porque** la base lo bloquea con un error crudo que la pantalla muestra como "vuelve a intentarlo". Hay que ponerle CASCADE o sumarla a `assertDeletable`. Evidencia: migración 79; comentario de `QuotationsRepository.assertDeletable` ("OJO SI SE AGREGA OTRA TABLA...").
3. **Si cambias** la forma de `quotations.items`, **se afectan** el basurero del catálogo (`used_service_codes`), dos cuadros del Dashboard (`get_variable_services_usage`, `get_fixed_services_usage`), el recálculo que valida cada guardado (`utils/money.ts`) y las cotizaciones históricas, **porque** todos leen las llaves `fixed_services`, `variable_services`, `items`, `codigo` y `nombre` por nombre, y las fotos viejas no se reescriben. Evidencia: 54, `db_functions_analytics_23_07.sql`, `money.ts`, comentario de la 21.
4. **Si agregas o renombras** un estado de cotización, **se afectan** el Dashboard y los rellenos, **porque** `quotation_status` no tiene CHECK (la base no avisa) y las funciones de análisis tienen escrito `IN ('aceptada','realizada')`. Evidencia: 26; cabecera de `db_functions_analytics_23_07.sql`; `QuotationStatus`.
5. **Si renombras** un tipo de evento o de cliente, **se afectan** las cotizaciones, clientes, consultas y campañas que lo guardan, **porque** el vínculo es por texto y no por id. Además, la foto inicial muestra CHECK con listas fijas en `quotations.event_type` y `clients.client_type`, que ninguna migración quita. Evidencia: `0_initial_models.sql`; 105; doc 12 ("renombrar NO existe en v1"); mapas 01, 09 y 11.
6. **Si consultas** una tabla sin `company_id` (`payments`, `payment_transactions`, `refunds`, `event_documents`, respuestas de encuesta, piezas de menús y paquetes), **se afecta** la separación entre empresas, **porque** con la llave de servicio nada filtra por uno: hay que amarrar por el padre (`quotations!inner(company_id)`). Evidencia: `CLAUDE.md`; `event-documents.controller.ts`; comentario de la 67.
7. **Si escribes** una función SQL nueva, **se afecta** la separación entre empresas, **porque** se llama con la llave de servicio y el único filtro es el `company_id = p_company_id` escrito dentro de la función. Evidencia: 54, 55, `db_functions_analytics_23_07.sql`; mapa 13.
8. **Si aplicas** una migración en el orden equivocado respecto del despliegue, **se afectan** los guardados o los formularios, **porque** el motor rechaza campos que no conoce (`forbidNonWhitelisted`) y el código escribe columnas que tienen que existir. Evidencia: cabeceras de 37, 38 y 39; `docs/pendiente-despliegue.md`.
9. **Si tocas** los índices únicos de marketing o dejas de guardar los correos en minúsculas, **se afectan** la importación de contactos y las bajas, **porque** el `upsert` declara el conflicto por columnas y Postgres no reconoce un índice por fórmula (`42P10`). Evidencia: 94.
10. **Si tocas** las unicidades y CHECK de `event_staff` o `tip_pools`, **se afectan** la planificación, la ficha y la nómina, **porque** de ellos depende que no haya pozos invisibles que traben el cierre, ni la misma persona dos veces el mismo día. Evidencia: 71, 74, 83, 84.
11. **Si haces** público el balde `payment-receipts` o recreas políticas en `storage.objects`, **se afectan** los comprobantes, documentos y brochures de **todas** las empresas, **porque** viven juntos en ese balde y solo el motor verifica al dueño (`verificarDueno`). Evidencia: 42; `storage.service.ts`.
12. **Si agregas** una tabla con datos sensibles, **se afecta** el respaldo, **porque** `get_backup_tables()` la mete sola al JSON diario del balde `backups`, que ya lleva RUT y cuentas bancarias de `people`. Si esa función faltara, el respaldo falla y solo queda en el log. Evidencia: comentario y código de `BackupCronService`.
13. **Si corres** una migración de datos en otro ambiente o para otra empresa, **se afectan** datos que no eran el objetivo, o no pasa nada, **porque** varias tienen valores fijos: la 67 (`company_id = 1`), el relleno de la 68 (`'Valle del Sol Quillón'`), la reversión de la 102 (ids capturados en producción) y la 86 (corte `'2026-08-19'`). Evidencia: esos archivos.
14. **Si guardas** una persona sin normalizar el RUT o la cuenta, **se afecta** la ficha, **porque** la base rechaza las formas inválidas con CHECK (`people_rut_chk`, `people_account_number_chk`, `people_bloqueada_con_motivo`). Evidencia: 68.
15. **Si le revocas a `service_role` el permiso sobre `get_backup_tables()`** pensando que ya quedó todo cerrado con la 109, **se afecta** el respaldo diario, **porque** `BackupCronService.runBackup` la necesita para saber qué volcar al balde `backups`, y si falla no hay alarma: solo una línea en el log. Evidencia: migración 109; `backup-cron.service.ts`.
16. **Si asumes que el catálogo ya filtra por empresa en el repositorio** (servicios fijos y variables, grupos de servicios, paquetes, logística), revisa antes el estado del Sprint 1 de aislamiento entre empresas: agregó el filtro `company_id` a `ServicesRepository`, `ServiceGroupsRepository`, `ServiceGroupCollectionsRepository` y `LogisticsRepository`, pero al 11-09-2026 está **solo en el laboratorio** (rama `pruebas`, commit `8266ba1`) — en producción esas puertas seguían abiertas. Evidencia y detalle completo: mapa `22_AISLAMIENTO_ENTRE_EMPRESAS.md`.

## 8. Rarezas y tablas abandonadas

- **`job_roles`**: se creó en la 68 y se borró en la 69 ("FUSIONALO ES LO MISMO TODO", Felipe 14-08). Los cargos viven en `management_resources` tipo `personal`. `68_personas.backfill.sql` todavía siembra `job_roles`: hoy fallaría, porque la tabla no existe.
- **No hay tablas de respaldo en `docs/migrations`.** Las temporales (`_merge_map` en la 5, `pares` en la 68b, `equivalencias` en la 69) se borran solas (`ON COMMIT DROP`). `backups` es un balde, no una tabla.
- **Columnas muertas o heredadas**:
  - `quotations.portal_token`: la creó la 47 y la borró la 58, pero `quotation.entity.ts` todavía la declara.
  - `management_resources.list_price` y `charge_mode`: los borró la 14.
  - `variable_services.category`: texto heredado "kept for rollback" en la 5, `NOT NULL` en la foto, y `ServicesService` todavía lo escribe (`category: legacyName`).
  - `fixed_services.min_price`, `max_price` y `price_per_person`: quedaron vacíos para el tipo retirado `variable_con_limites` (21).
  - `clients.contact_person`, `email`, `phone` y `address` (mapa 09).
  - `payments.paid_date` y `payment_method` (mapa 03).
- **El CHECK de `management_resources.type` sigue aceptando `compra`**: la 72 pasó las filas a `arriendo`, pero no cambió la regla de la 10.
- **`service_group_collection_fixed_services` (100) no es espejo exacto de su gemela (67)**: le faltan `UNIQUE (collection_id, fixed_service_id)`, índice y RLS, y su `quantity` es `numeric`, no `integer` con CHECK > 0.
- **Tipos mezclados**: la 77 usa `serial` e `integer` para ids y `company_id`, contra `bigint` en el resto; `event_staff.tip_pool_id` y los ids de nómina también son `integer`.
- **`notifications` solo se escribe**: es un registro para no repetir avisos, y nadie la lee.
- **`event_types` se sembró solo para las empresas que existían al correr la 105**: el `INSERT ... SELECT FROM public.companies` no cubre a las que se creen después.
- **`kitchen_checklist_marks.quotation_id` no tiene llave foránea**: al borrar una cotización, sus checks quedan huérfanos.
- **Falta el número 43.** No hay rastro de él en el historial de git (`git log --all -- 'docs/migrations/43_*'` vacío).
- **Las cabeceras de aplicación envejecen**: 76 a 85 dicen "Aplicada en PRODUCCIÓN: pendiente", y 83 y 85 dicen además "LABORATORIO: pendiente".
- **Nueve archivos del motor tocan Supabase fuera de un `*.repository.ts`**:
  - controllers: `client-contacts.controller.ts`, `event-documents.controller.ts`, `portal-receipts.controller.ts`, `sections.controller.ts` y `hoy.controller.ts`
  - servicios: `movil.service.ts`, `storage.service.ts`, `backup-cron.service.ts` y `analytics.service.ts`
- **`docs/mapa-programacion-planes.md` diseña tablas que no existen**: columnas `plan`, `subscription_status`, `trial_ends_at` y otras en `companies`, y la tabla `subscription_events`. Un grep en `api-rest/src` y `frontend/src` da cero: es un plan no construido.

## 9. Contradicciones entre documentos y migraciones

1. **`CLAUDE.md` nombra una foto que ya no existe.**
   - Documento: "`docs/migrations/0_initial_models.sql` and `frontend/databaseSchema/database_schema.sql` are context-only snapshots".
   - Repo: la carpeta `frontend/databaseSchema` se borró en el commit `d12d17e` (15-07-2026).
2. **`CLAUDE.md` exige migración para todo cambio de base.**
   - Documento: "Every DB change MUST be recorded as a migration".
   - Repo: no tienen DDL en `docs/migrations`:
     - la tabla `client_types` (commit `3b17b4d`, 21-07-2026)
     - la columna `furniture_items.preassembled`, que usan `LogisticsRepository` y `create-catalog-items.dto.ts`
     - las 9 funciones de análisis (solo `db_functions_analytics_23_07.sql`, en la raíz)
     - `get_backup_tables()` (no está en ningún archivo)
     - los baldes `company-logos` y `backups`
     - las políticas de la "Fase 0" de RLS (`app_authenticated`, `public_insert_leads`) y las de storage `cl_*`
3. **`CLAUDE.md` dice que el repositorio es la única capa que toca Supabase.**
   - Documento: "the ONLY layer that touches Supabase".
   - Código: los nueve archivos de la sección 8, cinco de ellos controllers.
4. **La foto y la migración 38 describen dos columnas `quotation_number` incompatibles.**
   - Foto: `0_initial_models.sql` la declara `bigint GENERATED ALWAYS AS IDENTITY`.
   - Migración y código: la 38 cuenta que el número "se calculaba en el backend como 'el último + 1'" y crea `next_quotation_number`; `QuotationsService.create` inserta `quotation_number` explícito.
   - Postgres no deja insertar a mano en una columna `GENERATED ALWAYS`, así que la base real no puede ser igual a la foto.
5. **Tipos de evento administrables contra el CHECK de la foto.**
   - Documento 12 y migración 105: "Tipos de evento ADMINISTRABLES (...) dejan de ser lista fija en el código".
   - Foto: `0_initial_models.sql` tiene `CHECK (event_type = ANY (ARRAY[...8 tipos...]))` en `quotations`, y ninguna migración lo quita (mapas 01 y 11).
6. **Tipos de cliente administrables contra el CHECK de la foto.**
   - Documento 12: "igual que los tipos de cliente viven en Clientes".
   - Foto: `clients.client_type` tiene un CHECK con 6 nombres fijos, sin migración que lo quite (mapa 09).
7. **La 41 afirma "CERO privilegios y CERO políticas para anon/authenticated en el esquema public".**
   - Migraciones: 8, 10, 11, 13 y 34 dieron `GRANT ALL` a `anon`, y la 41 solo revoca `anon` en `companies` y `company_quotation_counters`.
   - Medido el 11-09-2026 (migraciones 107 y 108): la causa de fondo de este tipo de agujero ya se identificó (el grifo de `pg_default_acl` para tablas nuevas), pero esas 7 tablas, de julio de 2026, no son de las 12 que cerró la 107, y la 108 solo cierra el grifo hacia ADELANTE. Esta contradicción sigue abierta para `event_documents`, `suppliers`, `supplies`, `management_resources`, `furniture_items`, `service_recipe_items`, `fixed_service_cost_items` y `client_contacts` (pregunta 5 de la sección 10).
8. **La 79 afirma que sus cuatro tablas "son las únicas del sistema que se lo saltan [el CASCADE]".**
   - Foto: `payments`, `payment_transactions`, `refunds` y `customer_satisfaction_survey_responses` apuntan a `quotations` sin CASCADE, y el comentario de `assertDeletable` lo confirma ("apuntan a quotations con NO ACTION").
   - Migración 44: `kitchen_checklist_marks` ni siquiera tiene llave.
9. **Estado de aplicación del paquete de Personas.**
   - Documento 10: "Estado al 15-08-2026 (...) Producción sigue esperando el paquete de migraciones 68→77", y las cabeceras de 76 a 85 dicen "PRODUCCIÓN: pendiente".
   - Migraciones: la 68b "Se corre SOLO en producción (...) Medido en producción el 17-08", y la 85 "Medido en producción antes de escribirla".
   - Ningún documento deja constancia del estado final.
10. **Documento 11, sección "Tablas (migración 91)".**
    - Documento: describe `marketing_campaigns` con "estado borrador/enviada".
    - Migración 103: el CHECK acepta también `programada`. El mismo documento lo cuenta más abajo, en "Programar envío".
11. **La migración 108 mide un privilegio por defecto que ya incluía a `service_role`, contra la zona de riesgo 1 de este mismo documento.**
    - Migración 108 (comentario, medido el 11-09 en producción): el privilegio por defecto de una tabla nueva creada por `postgres` en `public` es `{postgres=arwdDxtm, anon=arwdDxtm, authenticated=arwdDxtm, service_role=arwdDxtm}` — `service_role` ya viene con permisos completos.
    - Zona de riesgo 1 (este documento) y los comentarios de las migraciones 49, 53, 59, 68, 71, 77, 78, 91 y 104: una tabla nueva SIN `GRANT ALL ... TO service_role` explícito le da `42501 permission denied` al motor, y pasó de verdad al menos cuatro veces.
    - No se pudo verificar desde el repo por qué, si el privilegio por defecto ya alcanzaba a `service_role`, el motor igual necesitó el `GRANT` a mano en cada una de esas migraciones.

## 10. Preguntas abiertas

1. ¿Cuál es el DDL real de `client_types` y de `furniture_items.preassembled` (llave única, llave a `companies`, `GRANT`, RLS)? No es verificable desde el repo.
2. ¿Siguen vivos en la base los CHECK de `quotations.event_type` y `clients.client_type` que muestra la foto? ¿Cómo está definida de verdad `quotations.quotation_number`?
3. ¿Qué migraciones están aplicadas en el laboratorio y cuáles en producción, sobre todo del 68 al 106? El repo no tiene un registro de control. (Las 107 y 109 sí están confirmadas en lab y prod; la 108, solo en prod, porque en el lab el grifo de `pg_default_acl` nunca existió.)
4. ¿Dónde está el SQL de la "Fase 0" de RLS? ¿Existió una migración 43? Ninguna se encontró en el repo. Lo de `get_backup_tables()` se aclaró parcialmente el 11-09-2026: la función sigue sin estar versionada, pero sus permisos sí, desde la migración 109.
5. ¿Tiene `anon` todavía privilegios sobre `event_documents`, `suppliers`, `supplies`, `management_resources`, `furniture_items`, `service_recipe_items`, `fixed_service_cost_items` y `client_contacts`? ¿Tienen RLS encendido? La migración 108 (11-09-2026) no lo repara: solo cierra el grifo para tablas creadas DESPUÉS de esa fecha; estas 7 son de julio.
6. ¿Tiene `service_role` permisos sobre `service_group_collection_services` en las dos bases? La 67 no trae `GRANT`.
7. ¿Quién actualiza `quotations.updated_at` (y el de `clients`, `payments` y `user_profiles`)? No hay trigger en las migraciones ni escritura en el código, pero `HoyController` y la migración 51 dependen de ese dato.
8. ¿Están activadas `pg_cron` o `pg_net` en el proyecto de Supabase? El repo no las usa: todos los relojes están en el motor.
9. ¿Hay en la base tablas sobrantes o de respaldo que no estén en las migraciones, por ejemplo del cambio de base del 22-07 o de respaldos manuales? `get_backup_tables()` las metería al respaldo diario.
10. ¿Alguien escribe `marketing_contacts.datos`? El documento 11 dice que guarda "datos jsonb para la satisfacción del Forms", pero no se encontró escritura en `api-rest/src/marketing`.
11. ¿Las empresas creadas después del 05-09 tienen tipos de evento? La 105 solo sembró a las que existían ese día.
12. ¿Se quiere sacar `compra` del CHECK de `management_resources.type`, y dar llave foránea a `kitchen_checklist_marks.quotation_id` para que los checks no queden huérfanos?
13. La migración 108 midió que el privilegio por defecto de `service_role` ya alcanzaba a las tablas nuevas antes de aplicarla (contradicción 11 de la sección 9): ¿por qué entonces el motor igual necesitó `GRANT` explícito en 44, 45, 49, 53, 54, 55, 59, 68, 71, 77, 78, 91, 93, 97 a 101 y 104? No se pudo verificar desde el repo.
14. ¿Cómo se cierra el grifo de `supabase_admin` en `pg_default_acl`, que la migración 108 no puede tocar? Mientras nadie cree una tabla como ese rol el riesgo es teórico, pero nadie lo revisó.
15. ¿Cuándo pasa a producción el Sprint 1 de aislamiento entre empresas (rama `pruebas`, commit `8266ba1`)? Al 11-09-2026 espera la validación de Felipe (mapa `22_AISLAMIENTO_ENTRE_EMPRESAS.md`).
