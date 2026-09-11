# Mapa: Catálogo de servicios, menús guardados y paquetes
> **Estado: verificado una vez contra el código** (commit 0de0ddb, 11-09-2026). Falta la etapa de completar lo que no quedó escrito. Parte del atlas de docs/arquitectura/mapa; el índice es 00_MAPA_DEL_SISTEMA.md.

## 1. Qué hace

Es la **carta de la empresa**: todo lo que se puede vender, con su precio. Tiene dos familias:

- **Servicios variables** (se cobran por persona: platos, bebidas, alojamiento). Cada uno pertenece a **una o más categorías** (Desayunos, Almuerzos & Cenas, Coffee…) y, dentro de cada categoría, a una **sección** (Entradas, Fondos, Postres). Una sección puede ser la **fija**: sus servicios entran solos a la cotización.
- **Servicios fijos** (se cobran por evento o fijo + por persona: salón, decoración, audiovisual), ordenados en **secciones de fijos**.

Encima del catálogo viven dos atajos: el **menú guardado** (una categoría + N servicios con cantidad, ej. "Sernatur - Almuerzo Día 1") y el **paquete** (varios menús + servicios sueltos + fijos, ej. "Graduación solo cóctel").

Lo mantiene el **administrador** en la pantalla "Catálogo" (`/services`) antes de cotizar. Los menús y paquetes los crea y aplica el **vendedor** desde el cotizador. El catálogo se lee al cotizar, al ajustar el evento en Post-Venta, al imprimir o enviar el documento (agrupa por secciones) y al estimar costos (recetas, "sin costo"). **Regla madre:** la cotización guarda una *foto* de cada ítem (código, nombre, precio, categoría); cambiar el catálogo no reescribe cotizaciones ya guardadas.

## 2. Pantallas y rutas de la app

| Ruta de la app | Componente principal | Archivo | Qué hace el usuario ahí | Rol que la ve |
|---|---|---|---|---|
| `/services` (menú lateral "Catálogo", renombrado 28-07 sin cambiar la URL) | `ServicesPage` | `frontend/src/pages/services/ServicesPage.tsx` | Buscar servicio, filtrar por receta (con / sin / sin costo), "Ver inactivos", "+ Nueva categoría", "+ Nuevo servicio" (variable, fijo o importar Excel), activar/desactivar y borrar servicios | administrador (`SECTION_ROLES.services` = `ADMIN_ONLY`, `PermissionGuard` en `App.tsx`) |
| `/services` (cajas de categorías) | `VariableServicesByCategory` | `frontend/src/pages/services/components/variableServices/VariableServicesByCategory.tsx` | Subir/bajar categorías con flechas, menú ⋮ (Renombrar, Secciones, Activar/Desactivar, Eliminar), arrastrar servicios dentro de su sección, cambiar sección con `SectionChipSelect`, modal de secciones con estrella de "fija" | administrador |
| `/services` (caja de fijos) | `FixedServicesBySection` | `frontend/src/pages/services/components/FixedServicesBySection.tsx` | Una sola caja con rótulos de sección, arrastre dentro de la sección, cajita para mover de sección, modal "Secciones" (sin estrella), costo y margen por fila | administrador |
| `/services` (modal) | `VariableServiceForm` + `RecipeTab` | `frontend/src/pages/services/components/variableServices/VariableServiceForm.tsx` | Nombre, precio, categorías (casillas, crear categoría en línea), interruptor "sin costo"; al editar se autoguarda a los 1,2 s; pestaña Receta | administrador |
| `/services` (modal) | `FixedServiceForm` + `FixedCostSection` + `RecipeTab` | `frontend/src/pages/services/components/FixedServiceForm.tsx` | Tipo de cálculo (fijo / fijo + variable), precios, "sin costo"; pestaña Costo (recursos y mobiliario) | administrador |
| `/services` (modal) | `ExcelUpload` | `frontend/src/pages/services/components/ExcelUpload.tsx` | Subir un .xlsx con hojas "Servicios variables" y "Servicios fijos" | administrador |
| `/quotation-form`, `/quotation-form/:id` | `MenusGuardados`, `SelectorDePaquetes`, `PkgFijosPicker` dentro de `QuotationForm` | `frontend/src/pages/quotations/MenusGuardados.tsx`, `frontend/src/components/selects/SelectorDePaquetes.tsx`, `frontend/src/pages/quotations/PkgFijosPicker.tsx` | Aplicar, guardar, renombrar (lápiz) y borrar menús; partir de un paquete, crear y borrar paquetes; ver el sello «fijo» | vendedor, operaciones, administrador (`quotations_edit`). Detalle en 01_COTIZADOR.md |
| `/post-venta/:id` y `/negocio/:id` (pestaña Servicios) | `ServiciosTab` | `frontend/src/pages/postventa/ServiciosTab.tsx` | Agregar un grupo desde un menú guardado, elegir ítems y fijos ordenados como la carta | Post-Venta: operaciones+ (`payments`); Negocio: la ruta admite recepción+, pero la pestaña solo aparece con `quotations_edit` (vendedor+, `NegocioPage.puedeEditar`, 12-08). Quién edita: 02 y 04 |

## 3. Endpoints del motor

Casi todos toman la empresa de la sesión (`@CurrentUser() user.company_id`); tres ni reciben al usuario: `PATCH /services/fixed/:id`, `DELETE /service-groups/:id` y `DELETE /service-group-collections/:id` (ver R5). "Sesión" = sin `@Roles`: `RolesGuard` deja pasar a cualquier usuario logueado (`api-rest/src/auth/roles.guard.ts`).

| Método y ruta | Controller y método | Service | Quién lo llama desde la app | Roles |
|---|---|---|---|---|
| `POST /services/bulk` | `ServicesController.createServicesBulk` | `ServicesService.createServicesBulk` | `createServicesBulk` ← `ExcelUpload` | ADMIN_ONLY |
| `GET /services` | `ServicesController.findAll` | `ServicesService.findAll` (4 listas: variables, fijos, categorías, vínculos) | `findAllServices` ← `useServices` (Catálogo, cotizador, `ServiciosTab`) y `NewAccount` (dashboard) | Sesión |
| `GET /services/used-codes` | `ServicesController.usedServiceCodes` | `ServicesService.usedServiceCodes` → RPC `used_service_codes` | `getUsedServiceCodes` ← `ServicesPage` | Sesión |
| `GET /services/fixed-sections` | `ServicesController.listFixedSections` | `ServicesService.listFixedSections` | `getFixedSections` ← `FixedServicesBySection`, `QuotationForm`, `ServiciosTab` | Sesión |
| `POST /services/fixed-sections/new` | `ServicesController.createFixedSection` | `createFixedSectionForCompany` | `createFixedSection` ← `FixedServicesBySection` | ADMIN_ONLY |
| `PATCH /services/fixed-sections/reorder` | `ServicesController.reorderFixedSections` | `reorderFixedSections` | `reorderFixedSections` ← `FixedServicesBySection` | ADMIN_ONLY |
| `PATCH /services/fixed-sections/:id` | `ServicesController.updateFixedSection` | `updateFixedSectionById` | `updateFixedSection` ← `FixedServicesBySection` | ADMIN_ONLY |
| `DELETE /services/fixed-sections/:id` | `ServicesController.deleteFixedSection` | `deleteFixedSectionById` | `deleteFixedSection` ← `FixedServicesBySection` | ADMIN_ONLY |
| `PATCH /services/fixed/reorder` | `ServicesController.reorderFixedServices` | `reorderFixedServices` → RPC `reorder_fixed_services` | `reorderFixedServices` ← `FixedServicesBySection` | ADMIN_ONLY |
| `PATCH /services/categories` | `ServicesController.updateServiceCategory` | `updateServiceCategory` (upsert por nombre) | `updateServiceCategory` existe en `services.service.ts` pero **nadie lo llama** | ADMIN_ONLY |
| `PATCH /services/reorder-services` | `ServicesController.reorderServicesInCategory` | `reorderServicesInCategory` → RPC `reorder_services_in_category` | `reorderServicesInCategory` ← `VariableServicesByCategory` | ADMIN_ONLY |
| `PATCH /services/reorder-categories` | `ServicesController.reorderCategories` | `reorderCategories` (una orden por categoría) | `reorderCategories` ← `ServicesPage.handleReorderCategories` | ADMIN_ONLY |
| `POST /services/categories/new` | `ServicesController.createCategory` | `createCategoryForCompany` → `findOrCreateCategory` | `createCategory` ← `ServicesPage` y `VariableServiceForm` | ADMIN_ONLY |
| `PATCH /services/categories/:id` | `ServicesController.updateCategoryById` | `renameOrUpdateCategory` | `updateCategoryById` ← `ServicesPage` (renombrar, activar) | ADMIN_ONLY |
| `DELETE /services/categories/:id` | `ServicesController.deleteCategoryById` | `deleteCategoryForCompany` | `deleteCategoryById` ← `ServicesPage.handleDeleteCategory` | ADMIN_ONLY |
| `PATCH /services/variable/:id/categories` | `ServicesController.setServiceCategories` | `setServiceCategories` → `linkServiceToCategories` | `setServiceCategories` ← `VariableServiceForm` | ADMIN_ONLY |
| `PATCH /services/variable/:id` | `ServicesController.updateVariableService` | `updateVariableService` | `updateVariableService` ← `VariableServiceForm`, `ServicesPage.handleToggleActive` | ADMIN_ONLY |
| `PATCH /services/fixed/:id` | `ServicesController.updateFixedService` | `updateFixedService` (valida con `validateFixedServices`) | `updateFixedService` ← `FixedServiceForm`, `ServicesPage.handleToggleActive` | ADMIN_ONLY |
| `POST /services/variable` | `ServicesController.createVariableService` | `createVariableService` | `createVariableService` ← `VariableServiceForm` | ADMIN_ONLY |
| `POST /services/fixed` | `ServicesController.createFixedService` | `createFixedService` | `createFixedService` ← `FixedServiceForm` | ADMIN_ONLY |
| `DELETE /services/variable/:id` | `ServicesController.removeVariableService` | `removeVariableService` (candado de uso) | `removeVariableService` ← `ServicesPage.handleDeleteService` | ADMIN_ONLY |
| `DELETE /services/fixed/:id` | `ServicesController.removeFixedService` | `removeFixedService` (candado de uso) | `removeFixedService` ← `ServicesPage.handleDeleteService` | ADMIN_ONLY |
| `GET /sections` | `SectionsController.findAll` | sin service: `SectionsRepository.findAll` | `getCategorySections` ← `VariableServicesByCategory`, `QuotationForm`, `ServiciosTab` | RECEPTION_AND_UP |
| `GET /sections/menu-order` | `SectionsController.menuOrder` | `SectionsRepository.menuOrder` | `getMenuOrder` ← `QuotationViewer`, `FichaCocinaSection` | RECEPTION_AND_UP |
| `POST /sections` | `SectionsController.create` | `SectionsRepository.create` | `createCategorySection` ← `VariableServicesByCategory` | ADMIN_ONLY |
| `PATCH /sections/reorder` | `SectionsController.reorder` | `SectionsRepository.reorder` | `reorderCategorySections` ← `VariableServicesByCategory` | ADMIN_ONLY |
| `PATCH /sections/default` | `SectionsController.setDefault` | `SectionsRepository.setDefault` | `setDefaultSection` ← `VariableServicesByCategory` | ADMIN_ONLY |
| `PATCH /sections/link/:linkId` | `SectionsController.setLinkSection` | `SectionsRepository.setLinkSection` | `setLinkSection` ← `VariableServicesByCategory` | ADMIN_ONLY |
| `PATCH /sections/:id` | `SectionsController.rename` | `SectionsRepository.rename` | `renameCategorySection` ← `VariableServicesByCategory` | ADMIN_ONLY |
| `DELETE /sections/:id` | `SectionsController.delete` | `SectionsRepository.delete` | `deleteCategorySection` ← `VariableServicesByCategory` | ADMIN_ONLY |
| `POST /service-groups` | `ServiceGroupsController.create` | `ServiceGroupsService.create` | `createServiceGroup` ← `useServiceGroups.saveGroup` ← `QuotationForm.confirmSaveGroup` | SALES_AND_UP |
| `GET /service-groups` | `ServiceGroupsController.findAll` | `ServiceGroupsService.findAll` | `getServiceGroups` ← `useServiceGroups` (`QuotationForm`, `ServiciosTab`) | Sesión |
| `PATCH /service-groups/:id` | `ServiceGroupsController.rename` | `ServiceGroupsService.rename` | `renameServiceGroup` ← `useServiceGroups.renameGroup` ← `MenusGuardados` (`onRenombrar`) | SALES_AND_UP |
| `DELETE /service-groups/:id` | `ServiceGroupsController.remove` | `ServiceGroupsService.remove` | `deleteServiceGroup` ← `useServiceGroups.removeGroup` ← `QuotationForm` | SALES_AND_UP |
| `POST /service-group-collections` | `ServiceGroupCollectionsController.create` | `ServiceGroupCollectionsService.create` | `createServiceGroupCollection` ← `useServiceGroupCollections.saveCollection` ← `QuotationForm.confirmCreateCollection` | SALES_AND_UP |
| `GET /service-group-collections` | `ServiceGroupCollectionsController.findAll` | `ServiceGroupCollectionsService.findAll` | `getServiceGroupCollections` ← `useServiceGroupCollections` ← `QuotationForm` | Sesión |
| `DELETE /service-group-collections/:id` | `ServiceGroupCollectionsController.remove` | `ServiceGroupCollectionsService.remove` | `deleteServiceGroupCollection` ← `SelectorDePaquetes.onEliminar` en `QuotationForm` | SALES_AND_UP |

Total: 37 endpoints. Otros módulos leen el catálogo por sus propias puertas: `GET /logistics/base-catalogo`, `GET /logistics/catalog/service-names` y `GET /logistics/catalog/fixed-costs` (vendedor+, ver 06_LOGISTICA_COMPRAS_E_INVENTARIO.md), y el portal y la hoja de impresión vía `QuotationsRepository.cartaDelCatalogo` (ver 02 y 03).

## 4. Tablas de la base de datos

Rutas relativas a `docs/migrations/`. No hay ejecutor de migraciones: todo se corrió a mano en Supabase.

| Tabla | Qué guarda | Lee o escribe | Migración que la crea o modifica |
|---|---|---|---|
| `variable_services` | Servicio por persona: `code` (legado), `name`, `price`, `category` (texto legado, solo la primera categoría al crear), `is_active`, `no_cost` | Escribe: `ServicesRepository`. Leen: service-groups y collections (join), `LogisticsRepository.catalogServiceNames` y `recipeLinesForSupply` | `0_initial_models.sql`; `4_service-active-flags.sql` (`is_active`); `5_multicategory.sql` (fusiona duplicados); `23_catalog_prefix_cleanup_and_dedup.sql` (quita "01 - " y fusiona); `57_servicios_sin_costo.sql` (`no_cost`) |
| `fixed_services` | Servicio por evento: `calculation_type`, `price`, `min_price`/`max_price`, `price_per_person`, `is_active`, `no_cost`, `section_id`, `sort_order`; costos cacheados `cost_fixed`/`cost_per_person` (los escribe Logística) | Escribe: `ServicesRepository` y `LogisticsRepository.updateFixedServiceCosts`. Lee: `LogisticsRepository` | `0_initial_models.sql`; `4`; `21_retire_variable_con_limites.sql` (convierte el catálogo); `53_secciones_servicios_fijos.sql`; `57`; costos en `12_fixed_service_costs.sql` (agrega `cost_fixed` y `cost_per_person`; dueño: mapa 06) |
| `service_categories` | Categoría de variables: `name`, `is_active`, `sort_order`. UNIQUE (`company_id`, `name`) | Escribe: `ServicesRepository`. Leen: `SectionsRepository.menuOrder`, `QuotationsRepository.cartaDelCatalogo` | `4_service-active-flags.sql` (crea); `5_multicategory.sql` (`sort_order`) |
| `variable_service_categories` | Vínculo servicio ↔ categoría con `sort_order` por categoría y `section_id`. UNIQUE (`variable_service_id`, `category_id`); cascada al borrar servicio o categoría | Escribe: `ServicesRepository`, `SectionsRepository.setLinkSection`, RPC `reorder_services_in_category`. Lee: `cartaDelCatalogo` | `5_multicategory.sql` (crea); `24_category_sections.sql` (`section_id` ON DELETE SET NULL); `55_reorden_en_un_viaje.sql` (RPC) |
| `category_sections` | Secciones de una categoría: `name`, `sort_order`, `is_default`. UNIQUE (`category_id`, `name`); a lo más una fija por categoría (índice parcial) | Escribe y lee: `SectionsRepository`. Lee: `cartaDelCatalogo` | `24_category_sections.sql`; `25_default_section.sql` |
| `fixed_service_sections` | Secciones de fijos: `name`, `is_active`, `sort_order` (sin UNIQUE de nombre) | `ServicesRepository` | `53_secciones_servicios_fijos.sql` |
| `service_groups` | Menú guardado: `name`, `category` (TEXTO, no id). UNIQUE (`company_id`, `name`) | `ServiceGroupsRepository`; lo cuenta `ServicesRepository.variableServiceUsage` | `1_service-groups.sql`; `2_add_constraint_name_company_id_on_service_group.sql`; `67_...backfill.sql` borra 6 "impostores" |
| `service_group_items` | Servicios del menú con `quantity`. Cascada al borrar menú **o servicio** | Escribe `ServiceGroupsRepository.createGroupItems`; lee `ServicesRepository.variableServiceUsage` | `1_service-groups.sql` |
| `service_group_collections` | Paquete: `name`. UNIQUE (`company_id`, `name`) | `ServiceGroupCollectionsRepository` | `3_service-group-collections.sql` |
| `service_group_collection_items` | Menús del paquete. UNIQUE (`collection_id`, `service_group_id`); cascada al borrar paquete o menú | `ServiceGroupCollectionsRepository` | `3_service-group-collections.sql`; `67_...backfill.sql` |
| `service_group_collection_services` | Servicios variables SUELTOS del paquete con `quantity > 0`. UNIQUE (`collection_id`, `variable_service_id`); cascada al borrar servicio; RLS habilitado | `ServiceGroupCollectionsRepository` | `67_paquetes_con_servicios_sueltos.sql` (+ `.backfill.sql`) |
| `service_group_collection_fixed_services` | Servicios FIJOS del paquete; `quantity` numeric; sin UNIQUE; cascada al borrar fijo | `ServiceGroupCollectionsRepository` | `100_paquetes-con-fijos.sql` |
| `quotations` (columna `items` JSON) | La foto de la cotización (dueño: mapa 01) | Solo lee: `variableServiceUsage`/`fixedServiceUsage` (`contains`) y RPC `used_service_codes` | RPC en `54_codigos_en_uso.sql` |
| `service_recipe_items`, `fixed_service_cost_items`, `event_resources.origin_fixed_service_id` | Recetas, líneas de costo de fijos y recursos de evento que vienen de un fijo (dueño: mapa 06) | Logística | `11_service_recipes.sql` (**sin FK** al servicio: `service_type` + `service_id`); `13_resource_pricing_and_service_costs.sql` (cascada desde `fixed_services`); `18_event_resource_origin.sql` (SET NULL) |

## 5. Flujos principales

### F1. Crear o editar un servicio variable
1. `ServicesPage` → "+ Nuevo servicio" → "Servicio variable" abre `VariableServiceForm` (las categorías y vínculos vienen de la página, sin viaje extra: comentario 30-07).
2. Guardar → `createVariableService` (`frontend/src/services/services.service.ts`) → `POST /services/variable`.
3. `ServicesService.createVariableService`: `resolveCategoryIds` (usa `category_ids`, o busca/crea por nombre con `findOrCreateCategory`, que compara con `ilike`); exige ≥ 1 categoría (400); llena `category` legado con el nombre de la primera categoría; `ServicesRepository.createVariableService` inserta en `variable_services`; `linkServiceToCategories` agrega cada vínculo **al final** de su categoría (`getMaxServiceSortOrder` + 1).
4. Editar: el modal se **autoguarda** 1,2 s después del último cambio (13-08, pedido de Felipe): `PATCH /services/variable/:id` (nombre, precio, `no_cost`) y luego `PATCH /services/variable/:id/categories` (`setServiceCategories` → borra los vínculos que sobran y agrega los nuevos al final). Estados a medio escribir no viajan.
5. Al cerrar: `ServicesPage.handleServiceFormSuccess` cierra primero (pillada 03-08) y después recarga `["services"]`, invalida `["recipeCosts"]`, `["fixedCosts"]` y `["logistica","compras","base"]` (para que Gestión vea el `no_cost` sin esperar 5 minutos).
6. Fijos: `FixedServiceForm` → `POST/PATCH /services/fixed[/:id]` → `validateFixedServices` (`api-rest/src/services/utils/index.ts`) → `fixed_services`. La pestaña Costo escribe en Logística (mapa 06).

### F2. Ordenar la carta y marcar la sección fija
1. **Categorías:** flechas ▲▼ en `VariableServicesByCategory.moverCategoria`; los clics se acumulan en orden local y a los 600 ms viaja una sola llamada `PATCH /services/reorder-categories` → `ServicesService.reorderCategories` (actualiza `sort_order` 1..n de a una fila).
2. **Secciones:** modal ⋮ → Secciones; crear (`POST /sections`, `sort_order` = cantidad existente), renombrar, borrar (los vínculos quedan "Sin sección" por ON DELETE SET NULL), flechas con el mismo acumulador de 600 ms (`PATCH /sections/reorder` → `SectionsRepository.reorder`, 0..n-1).
3. **Servicios dentro de la sección:** arrastre → `persistCategoryOrder` concatena los grupos en orden visual → `PATCH /services/reorder-services` → RPC `reorder_services_in_category` (un viaje, migración 55). El arrastre no cruza secciones: para eso está la cajita `SectionChipSelect` → `PATCH /sections/link/:linkId` (entra al final: `sort_order` = máximo + 1).
4. **Sección fija:** estrella → `PATCH /sections/default` → `SectionsRepository.setDefault` apaga la fija actual de la categoría y marca la elegida (el índice `category_sections_one_default` impide dos).
5. **Fijos:** arrastre o cajita en `FixedServicesBySection` → `PATCH /services/fixed/reorder` con la lista completa de la sección destino → RPC `reorder_fixed_services` (sección + orden en una pasada).
6. Efecto: `useServices.buildProductsFromLinks` ordena `products` por `sort_order` de categoría y de vínculo, y en ese orden los ofrecen el cotizador y `ServiciosTab`. El visor y el portal (`buildQuotationPrintDoc`) agrupan el "Incluye:" por el `sort_order` de las secciones, pero dentro de cada sección dejan el orden de la foto. La ficha de cocina (`FichaCocinaSection.orderItems`) agrupa por sección y ordena por el `sort_order` del vínculo.

### F3. Borrar o desactivar un servicio
1. `ServicesPage` pide `GET /services/used-codes` (RPC `used_service_codes`) y `servicioEnUso` (`frontend/src/pages/services/serviciosEnUso.ts`) apaga el basurero si el id **o** el `code` aparecen.
2. Basurero encendido → `ConfirmInline` → `DELETE /services/variable/:id`.
3. `ServicesService.removeVariableService` → `ServicesRepository.variableServiceUsage`: `clavesDeServicio` arma las dos llaves (id y `code`), cuenta cotizaciones con `contains` en `items.variable_services[].items[].codigo` (manda la mayor) y cuenta `service_group_items`. Si hay uso → 400 "desactívalo para sacarlo del catálogo sin perder su historia", que la pantalla muestra tal cual en un toast.
4. Sin uso → `removeVariableService` borra con filtro de empresa; la base arrastra en cascada vínculos de categoría y el lugar en paquetes (`service_group_collection_services`). Fijo: `fixedServiceUsage` solo mira cotizaciones; la cascada se lleva `fixed_service_cost_items` y `service_group_collection_fixed_services`.
5. Desactivar: ojo → `PATCH …/:id` con `is_active` → desaparece del selector del cotizador (`opcionesDe` y la lista de fijos filtran `is_active !== false`) y del catálogo salvo "Ver inactivos".

### F4. Guardar, aplicar, renombrar y borrar un menú guardado
1. En una caja del cotizador → guardar menú → `QuotationForm.confirmSaveGroup` traduce cada ítem a `variable_service_id` (por id, o por `code` legado) y guarda con el nombre **vigente** de la categoría (`nomCat(box)`).
2. `POST /service-groups` → `ServiceGroupsService.create`: inserta `service_groups` y después `service_group_items` (sin transacción). Nombre repetido (23505) → 409 "Ya existe un menú guardado con ese nombre. Elige otro."
3. Aplicar: `QuotationForm` filtra los menús (`boxGroups`) cuya `category` (texto) coincide con `nomCat(box)` —todos si la caja aún no tiene categoría— y `MenusGuardados` los lista en orden alfabético y con precio por persona; al elegir, `loadGroupIntoBox` → `buildBoxFromGroup` rehidrata nombre y precio **en vivo** desde `variable_services` y agrega los servicios de la sección fija que falten (`defaultServicesFor(group.category)`).
4. Post-Venta: `ServiciosTab.addGroupDesdeMenu` (14-08) agrega un grupo nuevo al final con la categoría del menú y su `category_id` buscado por nombre exacto.
5. Renombrar (09-09): lápiz → `PATCH /service-groups/:id` → `ServiceGroupsRepository.renameGroup` con filtro de empresa; 409 si se repite, 404 si es ajeno. Borrar: `DELETE /service-groups/:id` → `removeGroup(id)`; en cascada se cae de los paquetes que lo incluían.

### F5. Crear y aplicar un paquete
1. `SelectorDePaquetes` → "+ Crear paquete nuevo…" → modal en `QuotationForm`: menús elegidos, sueltos (`SelectWithSearch`, solo activos, etiqueta `nombre · category` legado) y fijos (`PkgFijosPicker`).
2. `POST /service-group-collections` → `ServiceGroupCollectionsService.create`: cabecera → `service_group_collection_items` → sueltos (opcional) → fijos (opcional), en secuencia y sin transacción. Cualquier error, incluido el nombre repetido, sale como 500; la pantalla dice "No se pudo guardar el paquete."
3. Aplicar: `QuotationForm.loadCollectionAsBoxes` arma una caja por menú (`buildBoxFromGroup`), cajas con los sueltos agrupados por `variable_services.category` (texto legado) y fijos con `fijosDelPaquete` (`frontend/src/pages/quotations/paqueteFijos.ts`), que recalcula el precio con las personas de la cotización y se salta el fijo que ya no está en el catálogo. **Agrega al final, no reemplaza** (14-08).
4. Borrar: basurero en `SelectorDePaquetes` → `DELETE /service-group-collections/:id` → `removeCollection(id)`.

### F6. Del catálogo a la cotización y al documento
1. `GET /services` → `useServices` (React Query `["services"]`) entrega `products` (una fila por vínculo servicio-categoría; si no hay ningún vínculo en la empresa usa el texto `category` legado), `fixedServices` formateados (`codigo` = id en texto), `inactiveCategories` y `calculatePrice` (delegado a `resolveFixedServicePrice` de `@dinero` = `api-rest/src/quotations/utils/money.ts`).
2. El cotizador y `ServiciosTab` arman el desplegable de categorías con los nombres de `products`, esconden las inactivas salvo la ya elegida (`inactiveCategorySet`, en los dos), ofrecen ítems activos agrupados por sección y ponen candado a los de la sección fija (`isLockedService`, `FijoDeCategoria`).
3. Al agregar, el precio queda **resuelto en la foto** (`items` de `quotations`). La caja guarda `category` y `category_id` (desde 06-08).
4. Visor y PDF: `QuotationViewer` pide `GET /sections/menu-order` y `buildQuotationPrintDoc` (`frontend/src/utils/quotationPrintDoc.ts`) agrupa el "Incluye:" por la sección vigente de cada `codigo`. Portal y hoja de impresión reciben la misma carta por `QuotationsRepository.cartaDelCatalogo`.

## 6. Reglas de negocio acordadas

1. **Un servicio ocupado no se borra, se desactiva** (13-08: "La regla que Felipe daba por existente y nunca estuvo"). Ocupado = aparece en los ítems de alguna cotización o vive en algún menú. Evidencia: `ServicesService.removeVariableService` y `removeFixedService` (el fijo solo mira cotizaciones).
2. **Las dos llaves de un servicio en las cotizaciones** (13-08): las nuevas guardan el id ("2042") y las viejas el `code` ("SF008"). Medido en producción: de 424 referencias vivas, 120 calzan por id y 42 por código. Se consultan ambas y manda la mayor, sin sumar. Evidencia: `ServicesRepository.clavesDeServicio`; `api-rest/src/services/tests/uso-de-servicios.spec.ts` ("Sillas Chivari", "Bollería variedades"); `serviciosEnUso.ts`.
3. **Basurero apagado para lo que está en cotizaciones** (30-07, regla de Felipe). Evidencia: `54_codigos_en_uso.sql`, `ServicesPage` (`usedCodes`).
4. **Un variable pertenece al menos a una categoría**; puede estar en muchas (migración 5: "no more duplicated rows"). Evidencia: `ServicesService.createVariableService`, `setServiceCategories`, `updateVariableService` (400 "El servicio debe pertenecer al menos a una categoría").
5. **No se borra una categoría que deja servicios huérfanos**: 409 con `service_ids`, y la pantalla nombra los servicios. Evidencia: `ServicesService.deleteCategoryForCompany`, `ServicesRepository.getServicesOnlyInCategory`, `ServicesPage.handleDeleteCategory`.
6. **Crear categoría es buscar o crear**, sin distinguir mayúsculas, para no duplicar por un tipeo. Evidencia: `ServicesService.findOrCreateCategory`.
7. **La sección vive en el vínculo, no en el servicio**: "un servicio multicategoría puede ser 'Bebidas' en Almuerzos y 'Refrescos' en Coffee". Un servicio recién asignado entra al final. Evidencia: `24_category_sections.sql`.
8. **Sección fija**: a lo más una por categoría; sus servicios entran solos y con candado. Excepción (Felipe, 09-09: el 99 % de las veces debe quedarse; CCU #408 fue el 1 %): se quita solo en esta cotización, con confirmación; el catálogo no se toca. Los menús guardados antes de existir la sección igual reciben sus servicios. Evidencia: `25_default_section.sql`, `frontend/src/components/FijoDeCategoria.tsx`, `QuotationForm.buildBoxFromGroup`, `ServiciosTab.addGroupDesdeMenu`.
9. **La estrella "fija" es solo de variables.** Evidencia: comentario de cabecera de `FixedServicesBySection`.
10. **Un fijo vive en UNA sección** (30-07, Felipe: "ídem que servicios variables"). Borrar una sección no borra servicios: caen a "Sin sección". Evidencia: `53_secciones_servicios_fijos.sql`, `ServicesService.deleteFixedSectionById`.
11. **Tipos de cálculo de fijos: solo "fijo" y "fijo_variable"** al crear o editar. "variable_con_limites" se retiró el 18-07 con montos decididos por Felipe, pero su cálculo sigue vivo para las 81 cotizaciones históricas que lo guardan. Evidencia: `21_retire_variable_con_limites.sql`, `frontend/src/constants/services.ts` (`SELECTABLE_CALCULATION_TYPES`), `money.ts` (`resolveFixedServicePrice` y `fixedPrice` dentro de `computeMoney` conservan el caso).
12. **El precio de un fijo se resuelve al agregarlo y queda en la foto**: "de ahí en adelante es un hecho guardado". Una sola regla para cotizador y Post-Venta (FASE 1.2, 27-07). Evidencia: `api-rest/src/quotations/utils/money.ts`, `useServices.calculateFixedServicePrice`.
13. **"Sin costo en Eventia"** (03-08): Ticket diario, alojamientos, Exclusividad cuentan $0 real y no figuran como pendientes. Hoy lo respetan el filtro del catálogo, Gestión, la pestaña Servicios (#470) y el margen del cotizador (Felipe, 09-09, #516). Evidencia: `57_servicios_sin_costo.sql`, `ServicesPage` (`variableBucket`), `GestionTab`, `ServiciosTab`, `QuotationForm.margenCotizador`.
14. **Los conteos del filtro cuentan solo lo visible** (pillada de Felipe 03-08: "Sin receta" mentía). **Los inactivos van ocultos por defecto** y el interruptor no se recuerda a propósito (Felipe 30-07). Evidencia: `ServicesPage` (`esVisible`, `showInactive`).
15. **Desactivar esconde del selector, pero las cotizaciones existentes se ven igual.** Evidencia: `4_service-active-flags.sql`.
16. **Menú guardado = una categoría + N variables con cantidad**, nombre único por empresa con 409 en castellano (pillado 05-08 con "Desayuno de campo"); se renombra con un lápiz, solo el nombre y con candado de empresa (Felipe, 09-09); la lista va siempre en orden alfabético con "nombre · precio por persona". Evidencia: `1_service-groups.sql`, `2_...sql`, `ServiceGroupsService.create`/`rename`, `service-groups.service.spec.ts`, `MenusGuardados.tsx`.
17. **El menú se guarda con el nombre vigente de su categoría**: "guardado con el viejo, el menú no aparecería nunca en su propia caja". Evidencia: `QuotationForm.confirmSaveGroup`.
18. **Un paquete lleva menús, servicios sueltos y fijos.** Sueltos (13-08): acabaron con los 6 impostores de Sernatur, que obligaban a mantener dos copias de la misma cena. Fijos (28-08, Felipe: "esa es una mala regla, debería incluir los servicios fijos"). Un suelto no se repite: se sube la cantidad. Evidencia: `67_paquetes_con_servicios_sueltos.sql`, `100_paquetes-con-fijos.sql`.
19. **Aplicar un paquete agrega, no reemplaza** (14-08, Felipe: "un paquete es una base de trabajo, una plantilla… Que borre lo que hay no suma nada"; quince días = dos paquetes de siete + uno de tres). Evidencia: `QuotationForm.loadCollectionAsBoxes`.
20. **Un fijo del paquete que salió del catálogo se salta**: "nunca se inventa un precio". Evidencia: `paqueteFijos.ts`.
21. **La caja apunta a la categoría por id** (06-08, Felipe: "no es al nombre donde debe apuntar sino al código de la categoría, así no importa cómo la llame"): se resuelve por id → nombre exacto → nombre sin tildes ni plural. Evidencia: `frontend/src/utils/categoriaCaja.ts`.
22. **El orden de la carta es legible por recepción** (12-08): sin precios; con 403 el visor tragaba el error y el PDF salía "en una línea corrida". Escribir sigue siendo de administrador. Evidencia: `sections.controller.ts`.
23. **Portal y documento interno agrupan igual** (revisión 06-08); el PDF no se entrega hasta que llega la carta. Evidencia: `QuotationsRepository.cartaDelCatalogo`, `QuotationViewer.handleDownloadPDF`.
24. **El costo de la carta usa la cantidad bruta (neta + merma)** (Felipe, 04-09: "no me calzan los costos, hay un problema con las mermas"). El margen de un fijo solo se muestra "cuando es honesto" (precio simple y costo sin componente por persona). Evidencia: `ServicesPage` (`recipeCosts`), `FixedServicesBySection`.
25. **Categorías se ordenan con flechas; el arrastre se jubiló** (06-08, decisión de Felipe: "preciso y no se pega"). **Reordenar viaja en una llamada** (30-07, "se demora": eran 37 viajes para "Sin sección"). Evidencia: `VariableServicesByCategory`, `55_reorden_en_un_viaje.sql`.
26. **Catálogo solo administrador; menús y paquetes, vendedor para arriba.** Evidencia: `frontend/src/constants/permissions.ts`, `@Roles(...ADMIN_ONLY)` / `@Roles(...SALES_AND_UP)`.

## 7. Conexiones con otros módulos

**Quién usa el catálogo**
- **Cotizador** (01_COTIZADOR.md): `useServices`, `useServiceGroups`, `useServiceGroupCollections`, `getFixedSections`, `getCategorySections`, `utils/categoriaCaja.ts`, `FijoDeCategoria`, `MenusGuardados`, `SelectorDePaquetes`, `PkgFijosPicker`, `paqueteFijos.ts`; el margen estimado usa `GET /logistics/base-catalogo`.
- **Ficha del negocio y envío** (02_NEGOCIO_ENVIO_Y_SEGUIMIENTO.md): `ServiciosTab` es la misma pieza en Negocio y Post-Venta; `EnvioCotizacionService.hojaParaImprimir` pide `cartaDelCatalogo` para la hoja del correo.
- **Portal del cliente** (03_PAGOS_REEMBOLSOS_Y_PORTAL.md): `QuotationsService` entrega `menu: cartaDelCatalogo` junto a la lista blanca de la hoja.
- **Post-Venta** (04_POST_VENTA.md): `ServiciosTab` (catálogo, secciones, sección fija, menús guardados), `FichaCocinaSection` (`getMenuOrder`, orden "como la carta", `resolveVarId` por id o por nombre), `GestionTab` (`sinCostoVariable`).
- **Logística** (06_LOGISTICA_COMPRAS_E_INVENTARIO.md): los modales del catálogo incrustan `RecipeTab` y `FixedCostSection`, que escriben por `logistics.service.ts`; `LogisticsRepository.catalogServiceNames` (id, nombre, `no_cost`) alimenta los mapas nombre → id de `utils/eventConsolidation.ts`; un fijo vendido puede traer recursos (`event_resources.origin_fixed_service_id`; en `10_MODULO_DE_PERSONAS.md` los servicios externos "llegan por un fijo vendido que lo trae").
- **Dashboard** (13_DASHBOARD_Y_ANALITICA.md): `NewAccount` usa `findAllServices` para el aviso de cuenta nueva sin servicios.
- **Consultas** (11_CONSULTAS_Y_FORMULARIOS_PUBLICOS.md): convertir abre el cotizador "de cero o con paquete" (`12_MODULO_DE_CONSULTAS.md`).

**A quién usa:** `SupabaseService` (service-role), `RolesGuard` y `permissions.ts` (15_ACCESO_EMPRESA_USUARIOS_Y_PLANES.md); piezas de la casa `ConfirmInline`, `MultiSelect`, `SelectWithSearch`, `SectionChipSelect`, `toast` (17_KIT_DE_LA_CASA_Y_BASE_DE_LA_APP.md); las migraciones (18_BASE_DE_DATOS.md).

**Efectos automáticos:** no hay relojes, correos ni notificaciones propias. Lo automático son las **cascadas de la base** (tabla de la sección 4) y la **invalidación de cachés** de React Query: `["services"]`, `["serviceGroups"]`, `["serviceGroupCollections"]`, `["fixedSections"]`, `["recipeCosts"]`, `["fixedCosts"]`, `["logistica","compras","base"]`. `["usedServiceCodes"]` también es caché de `ServicesPage`, pero ningún código la invalida. Las secciones de categoría **no** están en React Query: `VariableServicesByCategory`, `QuotationForm` y `ServiciosTab` las cargan con `useState` al montar, así que un cotizador abierto no ve cambios de secciones hasta recargar.

### Qué pasa con lo ya guardado cuando cambia el catálogo

| Cambio en el catálogo | Cotizaciones guardadas | Menús y paquetes | Costos / Gestión |
|---|---|---|---|
| Renombrar o cambiar precio de un servicio | Conservan nombre y precio de la foto (`QuotationForm` carga `item.nombre`/`item.precio`) | Al aplicarlos traen el nombre y precio **nuevos** (join vivo en `ServiceGroupsRepository.findAll`) | Con `codigo` = id la receta se sigue encontrando. Con `code` legado se busca por nombre y deja de calzar. Un servicio "sin costo" renombrado vuelve a salir "sin receta" en cualquier cotización vieja: el filtro compara el nombre de la foto con el nombre actual (riesgo R3) |
| Desactivar un servicio | Se ven igual; al editar ya no se ofrece | **Siguen trayéndolo**: `buildBoxFromGroup`, sueltos de `loadCollectionAsBoxes` y `fijosDelPaquete` no filtran `is_active`. La sección fija sí filtra (`defaultServicesFor`) | Sin efecto |
| Borrar un servicio | Bloqueado si está en alguna (dos llaves) | Bloqueado si está en un menú; **no** si solo está en un paquete: se cae del paquete en cascada | Cascada de `fixed_service_cost_items`; las líneas de `service_recipe_items` quedan huérfanas (sin FK) |
| Renombrar una categoría | Desde 06-08 guardan `category_id` y se reencuentran; las fotos viejas solo con texto se buscan por nombre exacto o normalizado | `service_groups.category` es texto y no se actualiza: el menú deja de aparecer en la caja de su categoría (riesgo R2) | Sin efecto |
| Desactivar una categoría | Se ven igual; el cotizador y `ServiciosTab` la esconden del desplegable salvo en cajas que ya la tienen (`inactiveCategorySet`) | Sin efecto | Sin efecto |
| Borrar una categoría o una sección | Conservan el texto; el documento se agrupa con la carta **vigente**, así que esos ítems pierden su rótulo | Cascada de vínculos y secciones | Sin efecto |
| Cambiar la sección fija | La foto no cambia; al editar, el candado se recalcula con la carta vigente (`isLockedService`) | Al aplicar un menú entran los servicios de la sección fija actual | Sin efecto |

## 8. Zonas de riesgo: si tocas esto, cuidado con aquello

- **R1. Si tocas** la forma en que `items` guarda `codigo` o las consultas de uso, **se afecta** el candado de borrado y el basurero del catálogo, **porque** conviven dos llaves (id y `code`). Hasta el arreglo del 13-08, buscar solo por id dejaba borrables servicios que sí estaban en cotizaciones antiguas ("Sillas Chivari", "Arco de Flores" y 40 más; Felipe lo pilló con "Bollería variedades", id 2042 y código 10). Evidencia: `ServicesRepository.clavesDeServicio`, `variableServiceUsage`, `fixedServiceUsage`; `uso-de-servicios.spec.ts`; `serviciosEnUso.ts`; RPC `used_service_codes`. Ojo extra, no verificado con datos: `utils/eventConsolidation.ts` (`resolveId`) y `FichaCocinaSection.resolveVarId` prueban primero el `codigo` como id, así que un código legado numérico ("10") podría leerse como el id 10.
- **R2. Si renombras** una categoría, **se afectan** los menús guardados de esa categoría y los paquetes con sueltos, **porque** `service_groups.category` y `variable_services.category` son texto que `renameOrUpdateCategory` no toca. El menú deja de aparecer en la caja de su categoría (`QuotationForm` filtra `boxGroups` con `g.category === nomCat(box)` antes de pasarlos a `MenusGuardados`), `defaultServiceIdsFor(group.category)` busca la categoría por nombre exacto y no agrega la sección fija, y `ServiciosTab.addGroupDesdeMenu` queda con `category_id` nulo (también busca por nombre exacto). Verificado leyendo el código, no probado en pantalla. Evidencia: `ServicesService.renameOrUpdateCategory`, `QuotationForm.defaultServiceIdsFor`, `QuotationForm.buildBoxFromGroup`, `QuotationForm.loadCollectionAsBoxes`, `ServiciosTab.addGroupDesdeMenu`.
- **R3. Si renombras** un servicio variable marcado "sin costo", **se afectan** Gestión, la pestaña Servicios de Post-Venta y el margen del cotizador en eventos ya cotizados, **porque** `acc.noRecipe` guarda el nombre de la foto y el filtro lo compara con `sinCostoVariable` (nombres canónicos **actuales**). El comentario de `logistics.service.ts` ("encuentran su servicio aunque el catálogo haya sido renombrado") solo cubre tildes, mayúsculas, espacios, el prefijo "02 - " y "1pp" = "1 pp", no un nombre distinto. Evidencia: `eventConsolidation.ts` (`acc.noRecipe.push(nombre)`), `utils/searchMatch.ts` (`canonicalServiceName`), `GestionTab`, `ServiciosTab.margenEvento`, `QuotationForm.margenCotizador`, `mapNameIds`.
- **R4. Si borras** un servicio que solo vive en un paquete, o un fijo con líneas de costo, **se afecta** el paquete o la ficha de costos sin aviso, **porque** el candado solo mira cotizaciones y menús (fijos: solo cotizaciones) y la base borra en cascada. Las recetas quedan huérfanas porque `service_recipe_items` no tiene FK. Evidencia: `ServicesRepository.variableServiceUsage`/`fixedServiceUsage`; `67_…sql`, `100_…sql`, `13_…sql` (ON DELETE CASCADE); `11_service_recipes.sql`.
- **R5. Si tocas** escrituras por id, **se afecta** el aislamiento entre empresas, **porque** Supabase corre con service-role y el filtro `company_id` es la única barrera (CLAUDE.md). Hoy escriben o borran **sin** empresa: `ServicesRepository.updateVariableService`, `deleteServiceCategoryLink`, `updateFixedService`, `ServiceGroupsRepository.removeGroup` y `ServiceGroupCollectionsRepository.removeCollection` (en los tres últimos el controller ni recibe al usuario); `getLinksForService` también lee sin empresa. Es el mismo tipo de hoyo que se cerró el 13-08 en `DELETE /services/*` ("cualquier usuario logueado —de cualquier empresa— podía borrar un servicio ajeno por su número"). Tampoco se valida que los ids de ítems de menús o paquetes, ni el `category_id` de `POST /sections`, sean de la empresa.
- **R6. Si tocas** la regla de precio de un fijo, **se afectan** cotizador, Post-Venta, paquetes y el total de las cotizaciones viejas, **porque** vive en `api-rest/src/quotations/utils/money.ts` (el frontend la importa por el alias `@dinero`: `frontend/vite.config.ts`, `frontend/tsconfig.json`) y ahí está **dos veces**: `resolveFixedServicePrice`, que usan `useServices.calculatePrice` (cotizador y `fijosDelPaquete`) y `ServiciosTab` directo, y la copia `fixedPrice` dentro de `computeMoney`, que resuelve las fotos viejas guardadas con precio 0 y tarifa por persona (incluidas las "variable_con_limites"). Cambiar una sin la otra las deja en desacuerdo. `resolveFixedServicePrice` no tiene prueba directa; `money.spec.ts` solo prueba `fixedPrice` con `fijo_variable`.
- **R7. Si agregas** un campo al guardado de servicios, **se afecta** el guardado, **porque** el `ValidationPipe` global rechaza campos desconocidos (`forbidNonWhitelisted`, `api-rest/src/main.ts`): si el formulario lo manda y el DTO no lo declara, todo el guardado cae con 400. Y al revés, los formularios arman el sobre campo a campo: si el DTO lo acepta y el formulario no lo pone, el valor no viaja y nadie avisa. Eso pasó con `no_cost`: commit 9cb1418 "El interruptor sin-costo ahora sí viaja en el sobre del guardado" ("no_cost quedaba fuera en crear/editar"). Actualiza en el mismo movimiento la entidad, el DTO, el tipo de la app y el sobre del formulario.
- **R8. Si usas** la importación por Excel, **se afectan** la carta y el cotizador, **porque** `createServicesBulk` inserta variables solo con el texto `category`, sin `variable_service_categories` ni `service_categories`: `buildProductsFromLinks` ignora a los servicios sin vínculo cuando la empresa ya tiene vínculos, y `VariableServicesByCategory` recorre vínculos. Además, el upsert usa `onConflict` (`company_id,category,name`) y (`company_id,name`), restricciones que no aparecen en ninguna migración, y no se revisa `error`. Posible, no verificado contra la base. Evidencia: `ServicesService.createServicesBulk`, `ServicesRepository.createVariableServices`/`createFixedServices`, `ExcelUpload.processVariableServices`.
- **R9. Si confías** en la respuesta de estas rutas, **se afecta** la honestidad de los avisos, **porque** varios repositorios devuelven la respuesta cruda de Supabase y el service no mira `error`: `updateVariableService`, `updateFixedService`, `removeVariableService`, `removeFixedService`, `removeGroup`, `removeCollection`, `updateCategory` (en `reorderCategories`), `createServicesBulk`. Un fallo de base puede llegar como 200 y la pantalla dice "Servicio eliminado.". Posible, leído en código.
- **R10. Si tocas** la creación de menús o paquetes, **se afecta** la unicidad de nombres, **porque** cabecera e ítems se insertan sin transacción: si fallan los ítems queda una cabecera vacía que ocupa el nombre. En paquetes, el nombre repetido sale como 500 con el mensaje crudo de la base (no hay rama 23505 como en menús) y la pantalla solo dice "No se pudo guardar el paquete.". Evidencia: `ServiceGroupsService.create`, `ServiceGroupCollectionsService.create`, `QuotationForm.confirmCreateCollection`.
- **R11. Si endureces** los permisos de `GET /sections` o `GET /sections/menu-order`, **se afecta** el visor y el PDF de recepción, **porque** `getCategorySections` y `getMenuOrder` tragan el error y devuelven listas vacías (incidente del 12-08: todo salía en una línea). Evidencia: `sections.controller.ts`, `frontend/src/services/sections.service.ts`.
- **R12. Si tocas** el orden optimista del arrastre y las flechas, **se afecta** lo que ve el administrador, **porque** el orden local tiene que rendirse ante los datos frescos sin botarse antes de tiempo. Hubo dos incidentes: 30-07, "jugo de naranja a Once", con membresías viejas; y 06-08, "se pega y piensa", con rebote al orden viejo. Evidencia: `useEffect` de `VariableServicesByCategory` y `FixedServicesBySection`.
- **R13. Si tocas** `QuotationForm` o `ServiciosTab` por algo del catálogo, **se afecta** el portero de tamaño, **porque** están congelados por nombre (3936 y 2285 líneas de techo). La sección fija y el orden de fijos están copiados en ambos ("calco del cotizador"): arreglar uno exige arreglar el otro. Extrae piezas como ya se hizo con `MenusGuardados`, `SelectorDePaquetes`, `PkgFijosPicker` y `paqueteFijos.ts`. Evidencia: `frontend/scripts/portero-kit-de-la-casa.sh` (`congelar`).

## 9. Pruebas que lo protegen

| Archivo | Qué cubre |
|---|---|
| `api-rest/src/services/tests/uso-de-servicios.spec.ts` | Las dos llaves del uso: variable por id, por código, ambas consultadas, "manda la mayor", sin código, libre = 0; fijo por código ("Sillas Chivari"), por id y ambas (9 pruebas) |
| `api-rest/src/service-groups/tests/service-groups.service.spec.ts` | `ServiceGroupsService.rename`: recorta el nombre y pasa la empresa, 409 en castellano, 404 si es ajeno (3 pruebas) |
| `api-rest/src/services/tests/services.controller.spec.ts`, `services.service.spec.ts` | Solo que la clase se construye ("Esqueleto reparado") |
| `api-rest/src/quotations/tests/unit/money.spec.ts` | `computeMoney` con fijos `fijo_variable` de fotos viejas: prueba la copia `fixedPrice`, no `resolveFixedServicePrice` (dueño mapa 01) |
| `api-rest/src/quotations/tests/unit/envio-cotizacion.service.spec.ts` | Simula `cartaDelCatalogo` devolviendo `null`; no prueba el agrupado |
| `api-rest/src/auth/tests/roles.guard.spec.ts` | El guard de roles en general |
| `frontend/src/pages/quotations/paqueteFijos.test.ts` | `fijosDelPaquete`: precio de hoy, se salta el fijo que salió del catálogo, paquete viejo sin fijos (3 pruebas, vitest) |

La app **sí tiene pruebas** con vitest, aunque CLAUDE.md dice que no; del catálogo solo cubren `fijosDelPaquete`. La CI (`.github/workflows/ci.yml`) compila y corre las pruebas de las dos apps (jest y vitest) e impone techos: lint del motor 19, lint de la app 87 y el portero.

**Sin cubrir, y lo que más importa:** crear o editar variables con vínculos (≥ 1 categoría, alta al final); el guardia de huérfanos al borrar categoría; `findOrCreateCategory`; todo `SectionsController`/`SectionsRepository` (sección fija única, `setLinkSection`); los RPC de reorden; `createServicesBulk`; `ServiceGroupsService.create` (409) y `ServiceGroupCollectionsService.create` (sueltos y fijos); el aislamiento por empresa de `removeGroup`/`removeCollection`/`updateFixedService`; `validateFixedServices`; y en la app: `useServices.buildProductsFromLinks`, `categoriaCaja.ts`, `servicioEnUso`, la sección fija y los filtros de "sin costo".

## 10. Deuda y rarezas conocidas

- **Capa rota:** `SectionsRepository` vive dentro de `api-rest/src/services/sections.controller.ts` (mudanza #7, 28-07), sin service.
- **Tamaño:** `VariableServicesByCategory.tsx` tiene 1177 líneas y cuenta para el techo de 27 archivos de más de 800 líneas; no está congelado por nombre. Cerca del límite: `RecipeTab.tsx` (788) y `ServicesPage.tsx` (669).
- **Modales a mano:** `VariableServicesByCategory` y `FixedServicesBySection` están en la deuda declarada de CLAUDE.md; `VariableServiceForm`, `FixedServiceForm` y `ExcelUpload` también arman su propio `fixed inset-0` y no están en esa lista. Paneles flotantes a mano: menú "+ Nuevo servicio" de `ServicesPage`, ⋮ de categoría y ⋮ de fijos.
- **Código muerto:**
  - `frontend/src/pages/services/components/ServicesTable.tsx` (395 líneas): solo lo exporta `pages/services/index.ts` y nadie lo importa.
  - `updateServiceCategory` en la app (sin llamadas), con su endpoint `PATCH /services/categories` y `ServicesRepository.upsertServiceCategory`: activar por nombre, herencia de la migración 4.
  - `ServicesRepository.updateLinkSortOrder` y `updateFixedServicePlacement` no tienen llamadas.
  - `findOne` comentado en `ServicesController`.
- **Duplicaciones:** `defaultServiceIdsFor`/`isLockedService`/`defaultServicesFor` y `fixedOrderOf`/`fixedSectionNameOf` copiados en `QuotationForm` y `ServiciosTab`; `mapNameIds` y su gemela suelta en `logistics.service.ts` ("si cambias una, cambia la otra"); el modal de secciones calcado entre variables y fijos.
- **Columnas de texto heredadas:** `variable_services.category` se llena solo al crear (primera categoría; en la importación por Excel, la columna de la hoja) y la app nunca la actualiza, pero todavía la usan los sueltos de paquetes, la etiqueta `nombre · category` y `buildBoxFromGroup`. `service_groups.category` también es texto.
- **Enum retirado que el motor acepta:** `CalculationType.VARIABLE_CON_LIMITES` sigue en `CreateFixedServiceDto` (`@IsEnum`), así que el API todavía deja crear un fijo de ese tipo aunque la app ya no lo ofrece.
- **Errores mal clasificados:** `validateFixedServices` lanza `Error` en inglés y el service lo envuelve en `new Error(error)` o en 500, así que una validación sale como error del servidor. Los mensajes dicen "greater than 0" pero la condición acepta 0.
- **Sin DTO:** `PATCH /services/variable/:id/categories` recibe `body: { category_ids: number[] }` como tipo plano, sin class-validator. `UpdateVariableServiceDto` también acepta `category_ids`: hay dos caminos para lo mismo.
- **Basurero con falso positivo posible:** `used_service_codes` mezcla códigos de fijos y variables en un solo conjunto, y `servicioEnUso` compara `String(id)`. Un variable y un fijo con el mismo número se "contagian" el basurero apagado. El servidor sí distingue la familia.
- **Tablas desparejas:** `service_group_collection_fixed_services` no tiene UNIQUE, su `quantity` es numeric (el DTO pide `@IsInt`) y no habilita RLS, a diferencia de la 67. `fixed_service_sections` no tiene UNIQUE de nombre.
- **Reorden de a una fila:** categorías (`reorderCategories`) y secciones (`SectionsRepository.reorder`) siguen actualizando una fila por orden; la migración 55 solo optimizó servicios. Las escalas de `sort_order` difieren: categorías 1..n, secciones 0..n-1.
- **Firmas heredadas:** `getCategorySections(_companyId)` y `getMenuOrder(_companyId)` reciben un id que ya no usan; `createCategorySection` manda `company_id` y lo quita antes de viajar.
- **`any` en `ExcelUpload`** (`processVariableServices(data: any[])`, `processFixedServices(data: any[])`): deuda de tipos que **no** cuenta para el techo de lint de la app, porque `frontend/.eslintrc.cjs` apaga `@typescript-eslint/no-explicit-any`.

## 11. Contradicciones entre documento y código

`docs/arquitectura` no tiene un documento del catálogo. Lo poco que dice (`12_MODULO_DE_CONSULTAS.md`: "de cero o con paquete"; `10_MODULO_DE_PERSONAS.md`: el servicio externo "llega por un fijo vendido que lo trae") calza con el código. Las contradicciones halladas son contra CLAUDE.md y contra comentarios de migraciones:

1. **CLAUDE.md** dice que cada método de repositorio "takes `companyId` and filters/scopes queries by `company_id`". **Código:** `ServiceGroupsRepository.removeGroup(id)`, `ServiceGroupCollectionsRepository.removeCollection(id)` y `ServicesRepository.updateVariableService`, `updateFixedService`, `getLinksForService`, `deleteServiceCategoryLink` y `updateLinkSortOrder` no reciben `companyId` ni filtran por `company_id` (filtran por `id` o por `variable_service_id`).
2. **CLAUDE.md** describe un patrón "strict 4-layer" en el que el repositorio es la única capa que toca Supabase. **Código:** `sections.controller.ts` define `SectionsRepository` en el mismo archivo del controller y no hay service.
3. **Migración 67** dice: "El acceso se filtra por empresa a través del paquete". **Código:** `ServiceGroupCollectionsService.remove` borra por id sin empresa, y `create` no verifica que los menús o servicios del paquete sean de la empresa.
4. **Comentario en `ServicesService.removeVariableService`**: sin el candado, "borrar un servicio le arrancaba en cascada su receta". **Migración 11:** `service_recipe_items.service_id` no tiene FK ni cascada; la receta queda huérfana, no se arranca. Solo los menús y paquetes caen en cascada.
5. **Cabecera de `frontend/src/services/sections.service.ts`**: "Lecturas vendedor+". **Código:** `SectionsController.findAll` y `menuOrder` son `RECEPTION_AND_UP` desde el 12-08.
6. **CLAUDE.md** (deuda de `Modal`) nombra solo `FixedServicesBySection` y `VariableServicesByCategory` en este módulo. **Código:** `VariableServiceForm`, `FixedServiceForm` y `ExcelUpload` también son modales hechos a mano.

## 12. Preguntas abiertas

1. ¿Existen en la base las restricciones únicas que usa el upsert de `createServicesBulk`, (`company_id`, `category`, `name`) en `variable_services` y (`company_id`, `name`) en `fixed_services`? No están en `docs/migrations`.
2. ¿Se sigue usando la importación por Excel? Si alguien la usó después de la migración 5, ¿hay variables sin vínculo que no aparecen en ninguna parte?
3. ¿Hay filas huérfanas en `service_recipe_items` de servicios borrados antes del candado del 13-08?
4. ¿Borrar un servicio que solo vive en un paquete debería bloquearse igual que con los menús?
5. ¿Qué debe pasar con los menús guardados al renombrar su categoría? ¿Conviene guardar `category_id` en `service_groups`, como se hizo con las cajas el 06-08?
6. ¿Desactivar un servicio debería sacarlo de los menús y paquetes al aplicarlos, como ya hace la sección fija?
7. ¿Hay cotizaciones antiguas con `code` numérico que la consolidación y la ficha de cocina lean como id equivocado (R1)? Hay que medirlo con datos.
8. ¿La tabla `service_group_collection_fixed_services` quedó con RLS en producción? La migración 100 no lo habilita.
9. `GET /services`, `GET /service-groups` y `GET /service-group-collections` no tienen `@Roles`: recepción puede leer el catálogo completo con precios por la API. ¿Es intencional? Las pantallas de recepción no lo muestran.

## 13. Archivos clave

**Motor**
- `api-rest/src/services/services.controller.ts` — rutas `/services/*`
- `api-rest/src/services/sections.controller.ts` — `SectionsController` + `SectionsRepository` (`/sections/*`)
- `api-rest/src/services/services.service.ts` — candado de uso, multicategoría, huérfanos
- `api-rest/src/services/services.repository.ts` — `clavesDeServicio`, uso, RPC de reorden y códigos
- `api-rest/src/services/services.module.ts`
- `api-rest/src/services/dto/` — `create-variable-service.dto.ts`, `create-fixed-service.dto.ts`, `fixed-sections.dto.ts`, `category-section.dto.ts`, `reorder-*.dto.ts`, `update-*.dto.ts`, `create-services-bulk.dto.ts`
- `api-rest/src/services/entities/service.entity.ts`
- `api-rest/src/services/utils/index.ts` — `validateFixedServices`
- `api-rest/src/services/constants/index.ts` — `CalculationType`
- `api-rest/src/services/tests/uso-de-servicios.spec.ts`
- `api-rest/src/service-groups/` — `service-groups.controller.ts`, `service-groups.service.ts`, `service-groups.repository.ts`, `dto/create-service-group.dto.ts`, `dto/rename-service-group.dto.ts`, `entities/service-group.entity.ts`, `tests/service-groups.service.spec.ts`
- `api-rest/src/service-group-collections/` — `service-group-collections.controller.ts`, `service-group-collections.service.ts`, `service-group-collections.repository.ts`, `dto/create-service-group-collection.dto.ts`, `entities/service-group-collection.entity.ts`
- `api-rest/src/quotations/utils/money.ts` — `resolveFixedServicePrice` (alias `@dinero`)
- `api-rest/src/quotations/quotations.repository.ts` — `cartaDelCatalogo`
- `api-rest/src/logistics/logistics.repository.ts` — `catalogServiceNames`, `fixedServiceCosts`
- `api-rest/src/auth/roles.decorator.ts`, `api-rest/src/auth/roles.guard.ts`
- `docs/migrations/` — `1`, `2`, `3`, `4`, `5`, `21`, `23`, `24`, `25`, `53`, `54`, `55`, `57`, `67` (+ backfill), `100`; relacionadas `11`, `13`, `18`

**App**
- `frontend/src/pages/services/ServicesPage.tsx`
- `frontend/src/pages/services/components/variableServices/VariableServicesByCategory.tsx`
- `frontend/src/pages/services/components/variableServices/VariableServiceForm.tsx`
- `frontend/src/pages/services/components/FixedServicesBySection.tsx`
- `frontend/src/pages/services/components/FixedServiceForm.tsx`
- `frontend/src/pages/services/components/ExcelUpload.tsx`
- `frontend/src/pages/services/components/RecipeTab.tsx`, `FixedCostSection.tsx` (escriben en Logística, mapa 06)
- `frontend/src/pages/services/components/ServicesTable.tsx` (muerto)
- `frontend/src/pages/services/serviciosEnUso.ts`, `constants.ts`, `index.ts`
- `frontend/src/hooks/useServices.ts`, `useServiceGroups.ts`, `useServiceGroupCollections.ts`
- `frontend/src/services/services.service.ts`, `sections.service.ts`, `serviceGroups.service.ts`, `serviceGroupCollections.service.ts`
- `frontend/src/types/services.types.ts`, `serviceGroups.types.ts`, `serviceGroupCollections.types.ts`
- `frontend/src/constants/services.ts`, `api.routes.ts`, `permissions.ts`
- `frontend/src/utils/categoriaCaja.ts`
- `frontend/src/components/FijoDeCategoria.tsx`, `frontend/src/components/selects/SectionChipSelect.tsx`, `frontend/src/components/selects/SelectorDePaquetes.tsx`
- `frontend/src/pages/quotations/MenusGuardados.tsx`, `PkgFijosPicker.tsx`, `paqueteFijos.ts`
- `frontend/src/layout/Sidebar.tsx` (entrada "Catálogo"), `frontend/src/App.tsx` (ruta `/services`)
