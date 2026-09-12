# Mapa: Logística, compras e inventario

> **Estado: verificado una vez contra el código** (commit bd6a0e1, 11-09-2026), actualizado el 11-09-2026 con el estado del sprint 1 de aislamiento entre empresas en recetas y costos de logística (rama `pruebas`, commit 8266ba1; **no está en producción**). Falta la etapa de completar lo que no quedó escrito. Parte del atlas de docs/arquitectura/mapa; el índice es 00_MAPA_DEL_SISTEMA.md.

## 1. Qué hace

Es la trastienda operativa del evento vendido. Guarda los catálogos de lo que se le **compra** a alguien (insumos, proveedores, servicios externos) y de lo que **ya es nuestro** (mobiliario). También guarda las **recetas**: cuánto insumo y mobiliario lleva cada servicio por persona. Y guarda el **costo de los servicios fijos**, armado con referencias a recursos.

Con esos datos, el navegador calcula el **costo estimado** de un evento y arma la **lista de compra** consolidada por proveedor de varios eventos aceptados. Además registra la **provisión**, es decir, qué se compró y a qué costo, y deja una "foto" que congela el costo de insumos del evento.

Operaciones y administración lo usan después de que la cotización queda aceptada: en Compras, en Post-Venta → Gestión y en Cocina. El administrador edita recetas y costos desde el Catálogo. El cotizador, Post-Venta Servicios y el Dashboard leen su base para mostrar el margen. En el menú, desde el 15-08, el módulo aparece como **"Proveedores"** (`/logistica`) e **"Inventario"** (`/inventario`); en el código sigue llamándose `logistics`.

## 2. Pantallas y rutas de la app

| Ruta de la app | Componente principal | Archivo | Qué hace el usuario ahí | Rol que la ve |
|---|---|---|---|---|
| `/logistica` (menú "Proveedores") | `LogisticaPage` | `frontend/src/pages/logistica/LogisticaPage.tsx` | Contenedor con 4 pestañas; abre en Compras | operaciones, administrador (`SECTION_ROLES.logistics`, `PermissionGuard` en `App.tsx`) |
| `/logistica` → Compras | `ComprasTab` | `frontend/src/pages/logistica/components/ComprasTab.tsx` | Filtra eventos aceptados (por defecto "desde hoy"). Selecciona varios y ve la lista de compra por proveedor. Provisiona por partes o todo, confirmando lo comprado y lo gastado. Desprovisiona. Descarga el PDF de la orden de compra o un CSV | operaciones, administrador |
| `/logistica` → Insumos | `InsumosTab` | `frontend/src/pages/logistica/components/InsumosTab.tsx` | Crea y edita insumos: familia de unidad, precio por unidad base, merma, formato de compra y proveedor. Los desactiva o, si están libres, los elimina. Grupos plegables por proveedor | operaciones, administrador |
| `/logistica` → Proveedores | `ProveedoresTab` | `frontend/src/pages/logistica/components/ProveedoresTab.tsx` | Crea y edita proveedores (contacto, teléfono, notas). "Dar de baja" a los que tienen historia; eliminar solo si están libres | operaciones, administrador |
| `/logistica` → Servicios externos | `RecursosTab` | `frontend/src/pages/logistica/components/RecursosTab.tsx` | Catálogo de `management_resources` de tipo arriendo, con precio de lista fijo y/o por persona y proveedor. Los cargos (tipo `personal`) se filtran fuera | operaciones, administrador |
| `/inventario` | `InventarioPage` → `MobiliarioTab` | `frontend/src/pages/inventario/InventarioPage.tsx`, `frontend/src/pages/logistica/components/MobiliarioTab.tsx` | Stock, categoría, foto, "se prepara con anticipación" y costo unitario (inventario valorizado). Además, un radar de conflictos de stock por fecha contra los eventos aceptados | operaciones, administrador |

Pantallas de **otros módulos** hechas con piezas de este (detalle en sus mapas):

| Dónde | Componente | Archivo | Qué usa de Logística | Rol |
|---|---|---|---|---|
| Post-Venta → Gestión | `GestionTab` + `EventResourcesSection` | `frontend/src/pages/postventa/GestionTab.tsx`, `.../EventResourcesSection.tsx` | Insumos consolidados, mobiliario contra stock, recursos del evento, foto de provisión y margen | ver mapa 04 |
| Post-Venta → Cocina | `CocinaTab` + `FichaCocinaSection` | `frontend/src/pages/postventa/CocinaTab.tsx`, `.../FichaCocinaSection.tsx` | Horarios por servicio, notas por día, fichas impresas, retiro de bodega calculado | ver mapa 04 |
| Post-Venta → Servicios | `ServiciosTab` | `frontend/src/pages/postventa/ServiciosTab.tsx` | Cuadro de margen (estimado, o real en Post-Venta) | margen solo operaciones y administrador (`puedeVerMargen`) |
| Cotizador | `QuotationForm` | `frontend/src/pages/quotations/QuotationForm.tsx` | Margen estimado de catálogo (`margenCotizador`) | margen solo operaciones y administrador (`puedeVerMargen`) |
| Catálogo → receta y costo | `RecipeTab`, `FixedCostSection`, `ServicesPage` | `frontend/src/pages/services/...` | Escribe recetas y líneas de costo de los fijos | administrador (`SECTION_ROLES.services`) |
| Dashboard | `DashboardPage` | `frontend/src/pages/dashboard/DashboardPage.tsx` | Márgenes por mes, caja y análisis de proveedores | administrador |
| Personal → Semana / Resumen del día | `SemanaTab`, `ResumenDelDia` | `frontend/src/pages/personas/...` | Cargos (`getManagementResources`) y horarios de servicio (`kitchen/times`) | administrador |

## 3. Endpoints del motor

Todo vive en `LogisticsController` (`@Controller('logistics')`), que lleva `@Roles(...OPERATIONS_AND_UP)` a nivel de clase. Algunos métodos lo sobrescriben. No hay ningún `@Public`. Cada service de la tabla es `LogisticsService.<método>` y casi siempre pasa directo al repositorio del mismo nombre.

Roles, en la última columna: **ops+** = operaciones y administrador · **vend+** = `SALES_AND_UP` (vendedor, operaciones, administrador) · **admin** = `ADMIN_ONLY`.

| Método y ruta | Controller y método | Service | Quién lo llama desde la app | Roles |
|---|---|---|---|---|
| GET `/logistics/base-catalogo` | `baseCatalogo` | junta 6 lecturas en paralelo: `findAllRecipeItems`, `findAllSupplies`, `findAllFurniture`, `findAllSuppliers`, `catalogServiceNames`, `fixedServiceCosts` | `getBaseCatalogo`, usado por `useBaseLogistica` (GestionTab, CocinaTab, MobiliarioTab, ServiciosTab) y con la misma clave en ComprasTab, DashboardPage y QuotationForm | vend+ |
| GET `/logistics/estado-compras` | `estadoCompras` | `findAcceptedEvents` + `findSupplyProvisions` | `getEstadoCompras` (ComprasTab) | vend+ |
| GET `/logistics/suppliers` | `findAllSuppliers` | `findAllSuppliers` | `getSuppliers`: ProveedoresTab, InsumosTab, RecursosTab, GestionTab, EventResourcesSection, FixedCostSection | vend+ |
| GET `/logistics/suppliers/usage` | `suppliersUsage` | `suppliersUsage` | `getSuppliersUsage` (ProveedoresTab) | ops+ |
| POST `/logistics/suppliers` | `createSupplier` | `createSupplier` | `createSupplier` (ProveedoresTab) | ops+ |
| PATCH `/logistics/suppliers/:id` | `updateSupplier` | `updateSupplier` | `updateSupplier` (ProveedoresTab) | ops+ |
| DELETE `/logistics/suppliers/:id` | `deleteSupplier` | `deleteSupplier` (409 si tiene insumos o recursos) | `deleteSupplier` (ProveedoresTab) | ops+ |
| GET `/logistics/supplies` | `findAllSupplies` | `findAllSupplies` | `getSupplies`: InsumosTab, RecipeTab, ServicesPage | vend+ |
| GET `/logistics/supplies/usage?ids=` | `suppliesUsage` | `suppliesUsage` | `getSupplyUsage` (InsumosTab) | ops+ |
| POST `/logistics/supplies` | `createSupply` | `createSupply` | `createSupply`: InsumosTab, RecipeTab | ops+ |
| PATCH `/logistics/supplies/:id` | `updateSupply` | `updateSupply` (candado de familia) | `updateSupply`: InsumosTab y ComprasTab (el precio que se aprende de la compra) | ops+ |
| DELETE `/logistics/supplies/:id` | `deleteSupply` | `deleteSupply` (409 si tiene recetas o compras) | `deleteSupply` (InsumosTab) | ops+ |
| GET `/logistics/furniture` | `findAllFurniture` | `findAllFurniture` | `getFurnitureItems`: MobiliarioTab, RecipeTab | vend+ |
| GET `/logistics/furniture/usage` | `furnitureUsage` | `furnitureUsage` | `getFurnitureUsage` (MobiliarioTab) | ops+ |
| POST `/logistics/furniture` | `createFurniture` | `createFurniture` | `createFurnitureItem`: MobiliarioTab, RecipeTab ("Crear y usar") | ops+ |
| PATCH `/logistics/furniture/:id` | `updateFurniture` | `updateFurniture` | `updateFurnitureItem` (MobiliarioTab) | ops+ |
| DELETE `/logistics/furniture/:id` | `deleteFurniture` | `deleteFurniture` (409 si aparece en recetas) | `deleteFurnitureItem` (MobiliarioTab) | ops+ |
| GET `/logistics/resources` | `findAllResources` | `findAllResources` | `getManagementResources`: RecursosTab, FixedCostSection, EventResourcesSection, DashboardPage, SemanaTab, ServicesPage | ops+ |
| GET `/logistics/resources/usage` | `resourcesUsage` | `resourcesUsage` | `getResourcesUsage` (RecursosTab) | ops+ |
| POST `/logistics/resources` | `createResource` | `createResource` | `createManagementResource`: RecursosTab, FixedCostSection | ops+ |
| PATCH `/logistics/resources/:id` | `updateResource` | `updateResource` | `updateManagementResource`: RecursosTab y EventResourcesSection (`last_price`) | ops+ |
| DELETE `/logistics/resources/:id` | `deleteResource` | `deleteResource` (409 si tiene líneas de costo o eventos) | `deleteManagementResource` (RecursosTab) | ops+ |
| GET `/logistics/purchasing/accepted-events` | `acceptedEvents` | `findAcceptedEvents` | `getAcceptedEvents`: GestionTab (`gestionQueryOpts`), MobiliarioTab (radar) | ops+ |
| GET `/logistics/purchasing/won-events?from=` | `wonEvents` | `findWonEventsSince` | `getWonEventsSince` (DashboardPage) | ops+ |
| POST `/logistics/purchasing/mark-provisioned` | `markProvisioned` | `markProvisioned` | `markQuotationsProvisioned` (ComprasTab `stampCompleted`) | ops+ |
| POST `/logistics/purchasing/clear-provisioned` | `clearProvisioned` | `clearProvisioned` | `clearQuotationsProvisioned` (ComprasTab `unprovision`) | ops+ |
| GET `/logistics/purchasing/provisioning/:quotationId` | `quotationProvisioning` | `quotationProvisioning` | `getQuotationProvisioning`: GestionTab, ServiciosTab | ops+ |
| GET `/logistics/purchasing/supply-provisions` | `supplyProvisions` | `findSupplyProvisions` | `getEventSupplyProvisions` (DashboardPage `provQuery`) | ops+ |
| POST `/logistics/purchasing/supply-provisions` | `upsertSupplyProvisions` | `upsertSupplyProvisions` | `upsertEventSupplyProvisions` (ComprasTab `confirmarCompra`) | ops+ |
| POST `/logistics/purchasing/supply-provisions/delete` | `deleteSupplyProvisions` | `deleteSupplyProvisions` | `deleteEventSupplyProvisions` (ComprasTab `unprovision`) | ops+ |
| GET `/logistics/event-resources[?quotationId]` | `eventResources` | `findEventResources` / `findAllEventResources` | `getEventResources` (EventResourcesSection `recursosQueryOpts`, reusada por ServiciosTab); `getAllEventResources` (DashboardPage) | ops+ |
| POST `/logistics/event-resources` | `addEventResources` | `addEventResources` | `addEventResource(s)` (EventResourcesSection) | ops+ |
| PATCH `/logistics/event-resources/:id` | `updateEventResource` | `updateEventResource` | `updateEventResource` (EventResourcesSection) | ops+ |
| DELETE `/logistics/event-resources/:id` | `deleteEventResource` | `deleteEventResource` | `deleteEventResource` (EventResourcesSection) | ops+ |
| GET `/logistics/kitchen/times?quotationId=` | `serviceTimes` | `findServiceTimes` | `getEventServiceTimes`: FichaCocinaSection, ResumenDelDia | ops+ |
| POST `/logistics/kitchen/times` | `setServiceTime` | `setServiceTime` | `setEventServiceTime`: FichaCocinaSection, ResumenDelDia | ops+ |
| GET `/logistics/kitchen/notes?quotationId=` | `kitchenNotes` | `findKitchenNotes` | `getEventKitchenNotes` (FichaCocinaSection) | ops+ |
| POST `/logistics/kitchen/notes` | `addKitchenNote` | `addKitchenNote` | `addEventKitchenNote` (FichaCocinaSection) | ops+ |
| DELETE `/logistics/kitchen/notes/:id` | `deleteKitchenNote` | `deleteKitchenNote` | `deleteEventKitchenNote` (FichaCocinaSection) | ops+ |
| GET `/logistics/kitchen/day-prints?quotationId=` | `dayPrints` | `findDayPrints` | `getEventDayPrints` (FichaCocinaSection) | ops+ |
| POST `/logistics/kitchen/day-prints` | `markDaysPrinted` | `markDaysPrinted` | `markEventDaysPrinted` (FichaCocinaSection) | ops+ |
| GET `/logistics/catalog/service-names` | `catalogServiceNames` | `catalogServiceNames` | `getCatalogServiceNameIds` — **ninguna pantalla la llama** (ver §10) | vend+ |
| GET `/logistics/catalog/fixed-costs` | `fixedServiceCosts` | `fixedServiceCosts` | `getFixedServiceCostsById` — **ninguna pantalla la llama** | vend+ |
| GET `/logistics/recipes/all` | `allRecipeItems` | `findAllRecipeItems` | `getAllRecipeItems`, solo a través de `getAllIngredientRecipeItems` (ServicesPage) | vend+ |
| GET `/logistics/recipes?serviceType&serviceId` | `recipeItems` | `findRecipeItems` | `getRecipeItems` (RecipeTab) | admin |
| POST `/logistics/recipes` | `addRecipeItem` | `addRecipeItem` | `addRecipeItem` (RecipeTab) | admin |
| PATCH `/logistics/recipes/:id` | `updateRecipeItem` | `updateRecipeItem` | `updateRecipeItem` (RecipeTab) | admin |
| DELETE `/logistics/recipes/:id` | `deleteRecipeItem` | `deleteRecipeItem` | `deleteRecipeItem` (RecipeTab) | admin |
| GET `/logistics/fixed-cost-items[?fixedServiceId]` | `fixedServiceCostItems` | `findFixedServiceCostItems` | `getFixedServiceCostItems` (FixedCostSection); `getAllFixedServiceCostItems` (EventResourcesSection, ServicesPage) | ops+ |
| PATCH `/logistics/fixed-costs/:id` | `updateFixedServiceCosts` | `updateFixedServiceCosts` | `updateFixedServiceCosts` (FixedCostSection `syncTotals`) | admin |
| POST `/logistics/fixed-cost-items` | `addCostItem` | `addCostItem` | `addFixedServiceCostItem` (FixedCostSection) | admin |
| PATCH `/logistics/fixed-cost-items/:id` | `updateCostItem` | `updateCostItem` | `updateFixedServiceCostItem` (FixedCostSection) | admin |
| DELETE `/logistics/fixed-cost-items/:id` | `deleteCostItem` | `deleteCostItem` | `deleteFixedServiceCostItem` (FixedCostSection) | admin |

Total: **53 endpoints**. El checklist de cocina del móvil (`GET/POST /movil/cocina/:quotationId/marcas`) no vive aquí: está en `MovilController`, dentro del mapa 16.

**Aislamiento entre empresas en recetas y costos (sprint 1, SOLO EN LA RAMA `pruebas`, commit 8266ba1 — no está en producción).** `POST /logistics/recipes` y `POST /logistics/fixed-cost-items` ahora exigen que las piezas referenciadas sean del catálogo de la empresa de la sesión, antes de insertar:
- `addRecipeItem` valida que el `service_id` (según `service_type`, contra `variable_services` o `fixed_services`) y el `supply_id` o `furniture_id` (según `item_kind`) sean de la empresa.
- `addCostItem` valida que el `fixed_service_id` y el `resource_id` sean de la empresa.
- Ambos pasan por un método privado nuevo, `LogisticsService.exigirDeLaEmpresa`, que llama a `LogisticsRepository.idsDeLaEmpresa(tabla, ids, companyId)` — un `SELECT id` con `.in('id', ids).eq('company_id', companyId)` sobre `variable_services`, `fixed_services`, `supplies`, `furniture_items` o `management_resources`. Si algún id pedido no vuelve en la respuesta, lanza 404 (`NotFoundException`, "Hay piezas que no son de tu empresa") y **no llega a insertar**.

Evidencia: `LogisticsRepository.idsDeLaEmpresa`, `LogisticsService.exigirDeLaEmpresa/addRecipeItem/addCostItem`; prueba nueva `api-rest/src/logistics/tests/aislamiento-catalogo-logistica.spec.ts` (4 casos). Los demás INSERT del repositorio (`addEventResources`, `upsertSupplyProvisions`, `setServiceTime`, `addKitchenNote`, `markDaysPrinted`) siguen sin esta validación — ver §10 y §12.

## 4. Tablas de la base de datos

| Tabla | Qué guarda | Lee o escribe | Migración que la crea o modifica |
|---|---|---|---|
| `suppliers` | Proveedores: `name` (único por empresa), `contact_name`, `phone`, `notes`, `is_active` | L/E (`LogisticsRepository`) | 10 (crea), 29 (`contact_name`) |
| `supplies` | Insumos: `unit_family` (masa/volumen/unidad), `price` por unidad base (kg/L/u), `supplier_id` (ON DELETE SET NULL), `waste_pct`, `package_name/qty/price`, `is_active` | L/E | 10, 31 (merma y formato) |
| `management_resources` | Recursos: servicios externos (`type='arriendo'`) **y cargos de Personal** (`type='personal'`), con `supplier_id`, `list_price_fixed`, `list_price_per_person`, `last_price` e `is_active` | L/E aquí; `people.repository.ts` (`findRoles`, `createRole`, `updateRole`, `esRecursoDeLaEmpresa`) lee y escribe los cargos | 10 (crea, con UNIQUE `company_id, name` y un CHECK de tipo que todavía admite `compra`; ninguna migración posterior los cambia), 13, 14 (dos componentes de precio), 19 (personal sin precio por persona), 30 (personal sin proveedor), 68b y 69 (fusión con cargos, índice único por empresa, tipo y nombre), 72 (fin del tipo `compra`) |
| `furniture_items` | Mobiliario: `category`, `stock`, `photo_url` (bucket `furniture-photos`), `preassembled`, `unit_cost`, `is_active` | L/E | 11 (crea), 20 (inventario), 73 (`unit_cost`). **`preassembled`: sin migración en `docs/migrations`** |
| `service_recipe_items` | Líneas de receta: `service_type` (variable/fixed) + `service_id` (sin llave foránea), `item_kind` (insumo/mobiliario), `supply_id` o `furniture_id` (ON DELETE CASCADE), `qty_per_person`, `unit` | L/E | 11 |
| `fixed_service_cost_items` | Líneas de costo de un servicio fijo, que apuntan a un recurso con su `quantity` (CASCADE si se borra el fijo o el recurso) | L/E | 13 |
| `fixed_services` | Solo las columnas de este módulo: `cost_fixed` y `cost_per_person` (totales cacheados desde la 13) y `no_cost` | L (`catalogServiceNames`, `fixedServiceCosts`), E (`updateFixedServiceCosts`) | 12 (`12_fixed_service_costs.sql` crea `cost_fixed` y `cost_per_person`), 13 (los vuelve caché de las líneas de costo), 57 (`no_cost`). La tabla es del mapa 05 |
| `variable_services` | Solo lee `id`, `name` y `no_cost` | L | 57. La tabla es del mapa 05 |
| `quotations` | Lee eventos `aceptada` (y `realizada` desde una fecha). Escribe la foto de provisión: `provisioned_at`, `provisioned_cost`, `provisioned_people`, `provisioned_services` | L/E | 15, 17. La tabla es de los mapas 01 y 02 |
| `event_supply_provisions` | Provisión por evento × insumo (UNIQUE `quotation_id, supply_id`): `qty_base` neta, `cost`, `provisioned_at` y foto del proveedor (`supplier_id`, `supplier_name`) | L/E | 16, 30 |
| `event_resources` | Recursos asignados a un evento: `resource_id`, `quantity` (la de esa línea o día; la suma de las líneas es el total del evento), `price_fixed`, `price_per_person`, `origin_fixed_service_id`, `day` | L/E | 17, 18, 70 (`day`), 81 (día de eventos de un día), 84 (el personal sale de esta tabla) |
| `event_service_times` | Hora de inicio por servicio del evento (UNIQUE `quotation_id, service_name`) | L/E | 22 |
| `event_kitchen_notes` | Notas de cocina como lista, con `day` | L/E | 22, 28 |
| `event_day_prints` | Primera impresión de la ficha por día (UNIQUE `quotation_id, day`) | L/E | 28 |
| `kitchen_checklist_marks` | Marcas del checklist de bodega y mobiliario desde el móvil | L/E solo desde `movil.service.ts` (mapa 16) | 44 |
| `event_staff` | "Las sillas" del personal. Aquí solo se suma `amount` para el costo, vía `getStaff` y `getCostoPersonal` | L indirecta (mapas 07 y 08) | 84 |

Cascadas relevantes (definidas en las migraciones):
- Borrar una cotización borra sus `event_supply_provisions`, `event_resources`, `event_service_times`, `event_kitchen_notes` y `event_day_prints`.
- Borrar un insumo borra sus líneas de receta y sus provisiones; borrar un mobiliario borra sus líneas de receta.
- Borrar un recurso borra sus `fixed_service_cost_items` y sus `event_resources`.
- Borrar un proveedor deja en NULL el `supplier_id` de insumos, recursos y provisiones.

## 5. Flujos principales

### F1. La base compartida de logística (la "despensa")

1. Una pantalla necesita recetas, insumos, mobiliario, proveedores, nombres del catálogo y costos fijos.
2. Usa `useBaseLogistica(companyId)` (`frontend/src/hooks/useBaseLogistica.ts`) o una consulta idéntica escrita a mano. En ambos casos la clave es **`["logistica", "compras", "base", companyId]`**, con `staleTime` de 5 minutos.
3. Esa clave llama a `getBaseCatalogo`, que va a GET `/logistics/base-catalogo`. El controller `baseCatalogo` lanza 6 lecturas del repositorio en paralelo, todas filtradas por `company_id`.
4. En la app, `mapNameIds` convierte los nombres a claves canónicas (`canonicalServiceName`) y separa los servicios "sin costo en Eventia" (`sinCostoVariable`, `sinCostoFijoIds`). `mapFixedCosts` indexa los costos fijos por id.
5. La primera pantalla que llega trae los datos y las demás los reusan: Compras, Gestión, Cocina, Servicios, Mobiliario, Dashboard y el cotizador.
6. Invalidación:
   - Cambiar un insumo (InsumosTab) o una receta (RecipeTab) invalida `["postventa"]`, `["logistica","compras"]` y `["recipeCosts"]` (`notifyCostsChanged`).
   - Guardar un servicio en `ServicesPage` invalida `["logistica","compras","base"]`.
   - Confirmar una compra invalida todo `["logistica"]`.

### F2. Cómo se calcula el costo estimado de un evento

Todo sale de `consolidateEvent(items, personas, ctx, acc)` en `frontend/src/utils/eventConsolidation.ts`, con el contexto que arma `buildConsolidationContext(recipes, supplies, furniture, nameIds, fixedCosts)`. El cálculo corre **en el navegador**: el motor solo entrega los datos.

```
items = foto de la cotización (variable_services[].items + fixed_services)

1) Resolver el servicio (resolveId):
   si el `codigo` es numérico y ese id tiene receta → ese id;
   si no → nameIds[tipo][canonicalServiceName(nombre)]  (cotizaciones antiguas, "P001");
   si el nombre tampoco calza y el `codigo` es numérico → ese id igual (sin receta; sirve para el costo fijo)

2) Servicios VARIABLES (por grupo; personas = group.people ?? personas del evento):
   por cada línea de receta:
     insumo:      neta  = toBaseQty(qty_per_person, unit) × personas_del_grupo × cantidad
                  costo = grossQty(neta, insumo) × insumo.price
                          (grossQty = neta / (1 − waste_pct/100))
     mobiliario:  total = qty_per_person × personas × cantidad
   sin receta → acc.noRecipe (solo variables)

3) Servicios FIJOS (personas = las del evento):
   líneas de receta (en la práctica, mobiliario) igual que arriba
   costoFijos += (cost_fixed + cost_per_person × personas) × cantidad

4) Mobiliario del evento (furnPeak):
   reutilizable → MÁXIMO entre servicios (se lava y vuelve)
   preassembled → SUMA entre servicios (ya está montado)

Devuelve: costoInsumos, costoFijos, supplyUse (insumo → cantidad neta),
          furnPeak y fixedServices. El acumulador `acc` suma varios eventos.
```

Luego cada pantalla arma **su** costo total. Las diferencias son a propósito:

| Pantalla | Insumos | Fijos, arriendos y servicios externos | Personal |
|---|---|---|---|
| Cotizador (`QuotationForm.margenCotizador`) y Post-Venta Servicios antes de Post-Venta (`ServiciosTab.margenEvento`) | estimado por receta | `costoFijos` del catálogo (el evento aún no tiene recursos negociados) | — |
| Post-Venta → Gestión (`GestionTab`) | `provisioned_cost` si el evento está provisionado; si no, `costoInsumos` (el contexto se arma con `fixedCosts = {}`) | `EventResourcesSection`: `costoDeRecursos(event_resources, personas)` | + suma de `event_staff.amount` (las sillas); ambos llegan por `onCostChange` |
| Post-Venta → Servicios en `aceptada/realizada/cancelada` | igual que Gestión | `costoDeRecursos` | + sillas |
| Dashboard (`DashboardPage.marginData`) | `provisioned_cost` o estimado | `costoDeRecursos` si el evento tiene recursos **o** personal cargado; si no tiene nada, cae a `costoFijos` | fila propia desde `getCostoPersonal` |

En Gestión y el Dashboard el margen se mide contra `saleWithoutTip`: la propina no es venta. Cuando el Dashboard muestra "~", los insumos todavía son estimación o el evento no tiene nada cargado.

`costoDeRecursos` (`frontend/src/utils/costoDeRecursos.ts`) agrupa por recurso:
- **con parte por persona:** `fijo UNA vez + price_per_person × personas × Σcantidades`;
- **sin parte por persona:** `Σ(price_fixed × cantidad)` línea por línea.

### F3. Compras multi-evento y provisión

1. **ComprasTab.** `getBaseCatalogo` (clave base) + `getEstadoCompras` (clave `["logistica","compras","estado",companyId]`), que va a GET `/logistics/estado-compras`. De ahí salen `findAcceptedEvents` (`quotation_status='aceptada'`) y `findSupplyProvisions`, que leen `quotations` + `clients(name)` y `event_supply_provisions`.
2. El usuario filtra por rango de fechas del evento (por defecto "desde hoy", con `hoyLocal`) o busca por N° exacto o cliente, y selecciona eventos. `perEvent` consolida cada evento. `consolidation` suma los seleccionados y **agrupa por proveedor**; el mobiliario no entra. `eventStatus` muestra Completo, Parcial n/m o Pendiente.
3. Marca insumos o proveedores y aprieta "Provisionar" (o "Provisionar todo"). Se abre **"Confirmar la compra"**:
   - "Necesito" (neto) queda bloqueado.
   - "Compro" se sugiere como `compradoSugerido`: la cantidad bruta con merma, redondeada hacia arriba al formato.
   - "Gasto" se sugiere como `costTotal`.
4. `confirmarCompra`:
   1. `buildRows` arma una fila por evento × insumo: `qty_base` neta, `cost = round(bruta × price)` y la foto del proveedor.
   2. En los insumos que el usuario **tocó**, el gasto real se reparte entre eventos según `qty_base` (`repartirGastado`, al peso y sin sobrantes).
   3. POST `/purchasing/supply-provisions` → `upsertSupplyProvisions` hace UPSERT `onConflict: quotation_id,supply_id` con `provisioned_at = now`.
   4. Por cada insumo tocado, PATCH `/supplies/:id` con `price = gastado ÷ comprado`, y `package_price` si se compraron formatos enteros: **el catálogo aprende de la compra**.
   5. `stampCompleted` revisa cada evento seleccionado **sin `provisioned_at`**. Si todos sus insumos quedaron provisionados, POST `/purchasing/mark-provisioned` → `markProvisioned` escribe en `quotations`:
      - `provisioned_at`;
      - `provisioned_cost`: la suma del `cost` de todas sus provisiones (el gasto real repartido en los insumos tocados, el de catálogo en el resto), redondeada por el motor. `confirmarCompra` siempre le pasa ese mapa, así que el respaldo `costoInsumos` de `stampCompleted` no se alcanza desde Compras;
      - `provisioned_people`;
      - `provisioned_services` (`servicesSignature`).
   6. Se invalida `["logistica"]`.
5. **Desprovisionar** pide confirmación inline (`confirmAction`):
   1. POST `/purchasing/supply-provisions/delete` sobre los eventos seleccionados, acotado a los insumos provisionados marcados (el botón "Desprovisionar marcados" solo aparece si hay alguno marcado).
   2. POST `/purchasing/clear-provisioned` sobre **todos los eventos seleccionados**.
   3. Ambos rechazan eventos `realizada`.
6. **Efectos automáticos:**
   - Gestión congela los insumos con `provisioned_cost` y avisa si después cambiaron las personas o los servicios contra la foto (`GestionTab.cambios`).
   - El Dashboard toma `provisioned_at` como el mes en que salió la plata a proveedores (`salidas`).
7. **Salidas:** `downloadPDF` abre en una ventana un HTML continuo, con una sección por proveedor. `downloadExcel` genera un CSV con `;` y BOM.

### F4. Recursos del evento (Gestión → servicios externos)

1. `EventResourcesSection` carga `recursosQueryOpts`: `event_resources` del evento, `management_resources`, proveedores y todas las `fixed_service_cost_items`.
2. **Autoimporte:** si el evento no tiene líneas y hay fijos vendidos con líneas de costo, `importFromFixed` crea una fila por cada línea de costo:
   - `quantity = línea × cantidad del fijo`;
   - precio de lista del recurso;
   - `origin_fixed_service_id`;
   - `day` = el día del evento, **si dura un día**.
3. POST `/logistics/event-resources` → `addEventResources`. Primero corre `assertEventosEditables` (rechaza eventos `realizada`); luego `conDiaUnico` le pone el día a las filas sin día de eventos de un día; al final, INSERT en `event_resources`.
4. El usuario ajusta cantidad por día (`cambiarCantidad`: POST, PATCH o DELETE según el caso) o precio. PATCH `/event-resources/:id` pasa por `eventoDeFila` y el candado. Solo al cambiar un precio, `saveLine` llama a `updateLastPrice`, que deja `last_price` (fijo + por persona) en el catálogo sin esperar respuesta.
5. `total = costoDeRecursos(lines) + Σ sillas.amount` viaja por `onCostChange` al margen de Gestión.

### F5. Recetas y costos de los fijos (Catálogo, administrador)

1. **Recetas.** `RecipeTab` → GET/POST/PATCH/DELETE `/logistics/recipes` → `service_recipe_items`.
   - Los ingredientes se ofrecen solo en servicios variables.
   - Hay una "red ámbar" que avisa cantidades sospechosas por persona, sin bloquear.
   - Tiene atajos para crear un insumo o un mobiliario al vuelo.
   - Cada cambio invalida Post-Venta, Compras y `recipeCosts`.
2. **Costo de un fijo.** `FixedCostSection` → `/logistics/fixed-cost-items`. Después de cada cambio de líneas, `reloadAndSync` → `syncTotals` recalcula `cost_fixed` y `cost_per_person` con los precios de lista vigentes y hace PATCH `/logistics/fixed-costs/:id`: ese es el caché que usa el cotizador.
3. **Cambio de familia de un insumo.** PATCH `/logistics/supplies/:id` con `unit_family`. `LogisticsService.updateSupply` busca con `recipeLinesForSupply` si alguna receta sigue en una unidad de la familia vieja; si la hay, responde 409 con los nombres de esos servicios.

### F6. Inventario y ficha de cocina

- **Radar de mobiliario** (`MobiliarioTab`):
  1. Toma la base compartida y `getAcceptedEvents` (clave `["logistica","eventos-aceptados",companyId]`).
  2. Para cada evento, `consolidateEvent` → `furnPeak`.
  3. Suma la necesidad en **cada día** del rango del evento (tope de 60 días), desde hoy.
  4. Marca conflicto donde la necesidad supera el stock y el stock es mayor que 0.
- **Gestión** hace lo mismo para un evento, contra los eventos cuyo rango de fechas se cruza (`others`).
- **Ficha de cocina** (`FichaCocinaSection`):
  - Arma platos, retiro de bodega (`bodegaDe`) y mobiliario (`mobiliarioDe`) con `consolidateEvent`, siempre recién calculados; no se guarda ningún PDF (migración 22).
  - Horarios, notas y fichas impresas van a `/logistics/kitchen/*`.
  - Si el evento está `realizada`, la pantalla deshabilita la edición (`esEventoCongelado`) y el motor también la rechaza.

## 6. Reglas de negocio acordadas

**Acceso**
- **Logística es de operaciones y administración; algunas lecturas se abren a vendedor+** porque las usan el cotizador, el Dashboard y Post-Venta ("medido en 8 pantallas (28-07)"). Evidencia: comentarios en `LogisticsController`; `SECTION_ROLES.logistics = OPERATIONS_AND_UP` en `frontend/src/constants/permissions.ts`.
- **La edición de recetas y costos es solo del administrador y vive en el Catálogo.** Evidencia: `@Roles(...ADMIN_ONLY)` y el comentario en `LogisticsController.recipeItems`.
- **`company_id` nunca viaja en el body: sale de la sesión.** Evidencia: comentarios en los DTO (`create-supplier.dto.ts`, `event-operations.dto.ts`); la app lo quita (`company_id: _omitido`) en `frontend/src/services/logistics.service.ts`.
- **Solo operaciones y administrador ven el costo en el cotizador y en Servicios** ("decisión de Felipe"). El vendedor puede descontar, pero no ve el margen. Evidencia: `puedeVerMargen` en `QuotationForm.tsx` y `ServiciosTab.tsx`.

**Candado y borrados**
- **Candado del evento realizado (13-08).** Un evento `realizada` rechaza con `EVENTO_REALIZADO_CONGELADO`:
  - agregar, cambiar o borrar recursos del evento;
  - cambiar horarios;
  - agregar o borrar notas de cocina;
  - borrar la foto de costos (`clearProvisioned`) y las provisiones (`deleteSupplyProvisions`).

  Quedan **abiertos a propósito** reimprimir la ficha (`markDaysPrinted`) y *tomar* la foto de costos (`markProvisioned`, `upsertSupplyProvisions`), "que es justamente lo que congela el margen". Evidencia: `LogisticsRepository.assertEventosEditables` y su comentario; `api-rest/src/logistics/tests/candado-logistica.spec.ts`; `frontend/src/utils/eventoCongelado.ts`.
- **Lo que tiene historia no se elimina: se desactiva o se da de baja.**
  - Insumo con recetas o compras → 409 (`deleteSupply`).
  - Proveedor con insumos o recursos → 409 (`deleteSupplier`; migración 30: "el ojo lo DA DE BAJA").
  - Mobiliario en recetas → 409 (`deleteFurniture`).
  - Recurso con líneas de costo o eventos → 409 (`deleteResource`).

  La razón son las cascadas de la base de datos. Evidencia: `LogisticsService.delete*`; `ProveedoresTab.doBaja`; `logistics.service.spec.ts`.

**Unidades, merma y recetas**
- **Regla de merma (Felipe, 22-07).** La cantidad es SIEMPRE la **neta** de la receta ("lo que se cocina, retira y compra"); la merma ("caducidad, robo, pérdida") solo infla el **costo**. Evidencia: `ConsolidatedSupply` y `addRecipeLines` en `eventConsolidation.ts`; `buildRows` en ComprasTab (`qty_base: base, // NETA`); commit ee334a7 del 22-07.
- **Candado de familia de unidad (31-07).** Es un pedido de Felipe después de pasar a mano la naranja y la manzana de gramos a unidades: cambiar la familia reescribe el significado de las recetas ("100 gr pasarían a leerse como 100 unidades"). Evidencia: `LogisticsService.updateSupply` y `UNITS_BY_FAMILY`.
- **Familias de unidad (convención Fudo):** masa kg/gr · volumen L/ml · unidad u. El precio se guarda por unidad base. Evidencia: migración 10; `frontend/src/types/logistics.types.ts`.
- **Los variables llevan insumos y mobiliario; los fijos solo mobiliario.** La regla se aplica solo en la pantalla. Evidencia: migración 11; RecipeTab ("Ingredientes (solo servicios variables)").
- **"Sin receta" solo se avisa en los variables:** los fijos se costean por recursos ("acordado con Felipe el 22-07: la marca a fijos era puro ruido"). Evidencia: `addRecipeLines`.
- **Los servicios "sin costo en Eventia" no son pendientes** (migración 57, 03-08). Se filtran igual en Gestión, en Servicios (#470) y en el cotizador ("Felipe, 09-09, en la #516"). Evidencia: `GestionTab`, `ServiciosTab.margenEvento`, `QuotationForm.margenCotizador`.
- **Nombres canónicos (22-07):** sin tildes, sin el prefijo "02 - ", y "1pp" ≡ "1 pp". Existen porque la limpieza de nombres del catálogo dejó recetas sin reconocer. Evidencia: `canonicalServiceName` en `frontend/src/utils/searchMatch.ts`.

**Mobiliario e inventario**
- **El mobiliario reutilizable cuenta el máximo entre servicios; el que se prepara con anticipación, la suma.** Un evento de varios días retiene su mobiliario todos los días; los conflictos son entre eventos que se cruzan en fecha. Evidencia: `FurniturePeak` en `eventConsolidation.ts`; migración 20 (solo respalda el máximo: es anterior a los eventos de varios días y habla de conflictos "de la MISMA fecha"); radar de `MobiliarioTab` y `others` en `GestionTab`.
- **El mobiliario no va en Compras** ("no se compra: se reutiliza"). Evidencia: comentario en `ComprasTab.consolidation`.
- **Proveedores es lo que se COMPRA; Inventario es lo que ya es nuestro** (Felipe, 15-08). Evidencia: `LogisticaPage`, `InventarioPage`, `Sidebar.tsx`; encabezado de `docs/arquitectura/10_MODULO_DE_PERSONAS.md`.
- **Inventario valorizado = stock × costo unitario** (Felipe, 15-08). Evidencia: `CreateFurnitureItemDto.unit_cost`; migración 73.

**Recursos, arriendos y personal**
- **Hay dos tipos de recurso: personal y arriendo.** "Compra" se eliminó el 14-08: *"las compras no tienen sentido"*. Evidencia: `ResourceType` en `logistics.types.ts`; migración 72; doc 10 §6.
- **Cargos = recursos de tipo personal** (14-08: *"FUSIONALO ES LO MISMO TODO"*). Se administran **solo** en Personal → Cargos, y RecursosTab los filtra fuera (15-08). Evidencia: migración 69; `RecursosTab`; `people.repository.findRoles`.
- **El personal nunca se cobra por persona y no lleva proveedor.** Se aplica solo en pantalla. Evidencia: migraciones 19 y 30; comentarios en `RecursosTab` y `FixedCostSection`.
- **La cantidad de un recurso es el TOTAL del evento; el día solo la reparte y el costo no cambia** (*"se necesitan diez personas, pero no diez personas el mismo día"*). Evidencia: migración 70; `EventResourceRowDto.day`; doc 10 §10.8.
- **En un evento de un solo día, el día se pone solo** (Felipe, 15-08: *"al ser evento de un solo día debería asignarlo automático"*). Evidencia: `LogisticsRepository.conDiaUnico`; migración 81; `diaUnico` en EventResourcesSection.
- **Matemática de arriendos (15-08):** en el mixto, el fijo va **una vez**; solo la parte por persona multiplica por las unidades-día. Evidencia: `costoDeRecursos` y su prueba; doc 10 §6.
- **El costo de un fijo son referencias a recursos; en cada evento el precio es editable** (rebajas y premios se resuelven en el evento). Evidencia: migraciones 13, 17 y 18.
- **Sin doble conteo:** los recursos importados ya traen los fijos, así que **reemplazan** a `costoFijos`. Evidencia: comentario de 24-07 en `DashboardPage` ("lo pilló Felipe"); comentario de 12-08 en `ServiciosTab`. El cotizador sí usa `costoFijos` "a propósito", porque el evento aún no existe (`QuotationForm`).

**Costos, provisión y compra**
- **La propina no es venta ni margen** (24-07; doc 10: *"es plata que entra y sale, somos intermediarios"*). Evidencia: `saleWithoutTip` en `GestionTab` y `DashboardPage`.
- **La provisión se hace por partes; `provisioned_at` significa "evento completo".** Evidencia: migración 16.
- **Foto del proveedor al comprar:** la estadística por proveedor no se reescribe. Evidencia: migración 30; `buildRows`.
- **Confirmar la compra real** (Felipe, 24-08: *"al apretar provisionar debería aparecer un modal para confirmar los valores... total comprado y total gastado"*).
  - Lo que el evento necesita va bloqueado.
  - El costo real manda sobre el estimado.
  - El catálogo aprende: $/unidad = gastado ÷ comprado.
  - *"Sin inventario: comprado ≠ necesitado es la realidad, no un stock."*
  - Evidencia: comentarios y `confirmarCompra` en `ComprasTab`.
- **El modal de insumos de Gestión es solo informativo y va agrupado por proveedor** (15-08). Las cantidades a pedir y los precios se trabajan en Compras. Evidencia: doc 10 §6 "El modal de insumos"; comentario de `proveedoresQuery` en `GestionTab`.
- **Las fechas de evento se muestran en UTC** (bug del 22-07). Evidencia: `fmtDate` en `ComprasTab`.

## 7. Conexiones con otros módulos

**A quién usa**
- **Cotizaciones (mapas 01 y 02):**
  - lee `quotations.items`, `people_count`, `event_date/event_end_date`, `quotation_status` y los campos de propina;
  - escribe solo las columnas `provisioned_*`;
  - importa `EVENTO_REALIZADO_CONGELADO` de `api-rest/src/quotations/constants/constants.ts`.
- **Catálogo de servicios (mapa 05):**
  - lee nombres, `no_cost` y el caché `cost_fixed/cost_per_person`;
  - las pantallas `RecipeTab`, `FixedCostSection` y `ServicesPage` viven en `pages/services` pero escriben en `/logistics/*`;
  - `ServicesService.removeVariableService/removeFixedService` impiden borrar servicios ocupados.
- **Personas (mapas 07 y 08):**
  - el costo de personal sale de `event_staff` (`getStaff` en EventResourcesSection y ServiciosTab; `getCostoPersonal` en el Dashboard);
  - comparte la tabla `management_resources`: los cargos de Personal son las filas `type='personal'`.
- **Móvil, storage e infraestructura (mapa 16):**
  - `movil.service.ts` guarda el checklist de cocina (`kitchen_checklist_marks`);
  - `api-rest/src/storage/storage.service.ts` sube las fotos al bucket `furniture-photos`.
- **Kit de la casa (mapa 17):** `NumberInput`, `matchesSearch`, `formatPhone`, `esEventoCongelado`, `saleWithoutTip`.

**Quién lo usa**
- **Post-Venta (mapa 04):** Gestión, Cocina y Servicios, con la base compartida, recursos del evento, provisión y la ficha de cocina.
- **Cotizador (mapa 01):** margen estimado.
- **Dashboard y analítica (mapa 13):** márgenes por mes, `salidas` de caja por `provisioned_at` o fecha del evento, y análisis de proveedores con `event_supply_provisions` y `event_resources`.
- **Personal (mapa 07):** `SemanaTab` lee cargos con `getManagementResources`; `ResumenDelDia` lee y escribe horarios de servicio con `kitchen/times`.

**Efectos automáticos**
- **No hay** relojes (cron), correos ni notificaciones en `api-rest/src/logistics`: el módulo no tiene `*-cron.service.ts` ni usa `EmailModule`.
- **Escritura al abrir una pantalla:** `EventResourcesSection` importa sola los recursos de los fijos la primera vez que se abre Gestión. Es "el ÚNICO punto del sistema que escribe por el solo hecho de ABRIR una pantalla" (comentario OJO del 13-08) y está frenado en eventos congelados.
- **Escritura en el catálogo:** confirmar una compra reescribe `supplies.price` (y `package_price`). Eso mueve el costo estimado de **todas** las cotizaciones futuras y de los eventos no provisionados, en todas las pantallas del §2.
- **Cascadas de la base:** ver §4.
- **Caché de React Query entre módulos:** ver F1. Un cambio de insumo o receta refresca Post-Venta y Compras; un cambio en el Catálogo refresca la base.

## 8. Zonas de riesgo: si tocas esto, cuidado con aquello

1. **Si tocas** `consolidateEvent`, `buildConsolidationContext` o `resolveId`, **se afecta** el costo, la lista de compra, la ficha de cocina y el stock de mobiliario en Compras, Gestión, Cocina, Servicios, cotizador, Dashboard y el radar de Inventario, **porque** las siete pantallas llaman la misma función y **no tiene ninguna prueba**. Ya pasó: el Dashboard mostró el margen inflado por armar el costo distinto que Gestión (24-07). Evidencia: `frontend/src/utils/eventConsolidation.ts` y los usos listados en §2.
2. **Si tocas** la forma de la respuesta de `/logistics/base-catalogo`, `getBaseCatalogo` o la clave `["logistica","compras","base",companyId]`, **se afectan** esas mismas siete pantallas, **porque** comparten una sola caché. Tres de ellas (`ComprasTab`, `DashboardPage`, `QuotationForm`) escriben la consulta a mano en vez de usar `useBaseLogistica`: si una cambia su `queryFn` sin cambiar la clave, las demás reciben la forma que llegue primero; si cambia la clave, deja de compartir la caché. Evidencia: `frontend/src/hooks/useBaseLogistica.ts`, `marginBaseQuery` en `QuotationForm` y `DashboardPage`, y `baseQuery` en `ComprasTab`.
3. **Si tocas** `canonicalServiceName`, **se afecta** el reconocimiento de recetas en cotizaciones antiguas y el filtro "sin costo en Eventia", **porque** `resolveId` busca por nombre canónico cuando el `codigo` no es un id. Ya pasó el 22-07: la limpieza de nombres dejó recetas sin reconocer en Gestión y la ficha de cocina. Evidencia: `frontend/src/utils/searchMatch.ts`, `mapNameIds`.
4. **Si tocas** `toBaseQty`, `grossQty` o dónde se aplica la merma, **se afectan** la cantidad a comprar, `qty_base`, el costo de provisión, el PDF y el CSV, **porque** la regla del 22-07 separa la cantidad (neta) del costo (bruto) y hoy hay pantallas que usan una u otra (ver §10). Evidencia: `frontend/src/types/logistics.types.ts`, `ComprasTab.buildRows` y `compradoSugerido`.
5. **Si tocas** `LogisticsService.updateSupply` o permites cambiar `unit_family` por otra vía, **se afectan** todas las recetas de ese insumo, sus costos y sus compras, **porque** "100 gr pasarían a leerse como 100 unidades" (31-07, naranja y manzana). La lista de unidades por familia está duplicada entre el motor (`LogisticsService.UNITS_BY_FAMILY`) y la app (`UNITS_BY_FAMILY` en `logistics.types.ts`): hay que mantenerlas iguales.
6. **Si tocas** `assertEventosEditables`, o agregas una escritura sobre datos de un evento, **se afecta** el candado del evento realizado, **porque** la regla vive en el repositorio método por método. Además, el autoimporte de `EventResourcesSection` escribe al abrir Gestión; sin el freno `congelado`, un evento realizado quedaría "con el cartel rojo de no se pudieron importar para siempre" (13-08). Evidencia: `LogisticsRepository`, `candado-logistica.spec.ts`, `EventResourcesSection`.
7. **Si sumas** `costoFijos` del catálogo encima de los recursos del evento, **se afecta** el margen de Gestión, Servicios y el Dashboard, **porque** los recursos importados ya traen los fijos con el precio negociado: se contarían dos veces. Ya pasó (Dashboard 24-07, Servicios 12-08). Evidencia: comentarios en `DashboardPage.marginData` y `ServiciosTab`.
8. **Si calculas** el costo de recursos línea por línea o copias la fórmula en otra pantalla, **se afecta** el costo de los recursos mixtos repartidos en días, **porque** el fijo se cobraría una vez por día. En la revisión del 16-08 "el mismo evento mostraba dos costos distintos en dos pestañas de la misma ventana". Evidencia: `frontend/src/utils/costoDeRecursos.ts` y su prueba.
9. **Si cambias** el precio de lista de un recurso en `RecursosTab`, **se afecta** el costo estimado de los fijos en el cotizador y en Servicios, **porque** ese estimado lee el caché `fixed_services.cost_fixed/cost_per_person`, y el caché solo se recalcula en `FixedCostSection.syncTotals` cuando alguien edita las líneas de ese fijo. `RecursosTab` solo invalida `["logistica","recursos"]`. Evidencia: `FixedCostSection.reloadAndSync`; `RecursosTab.load`.
10. **Si borras** filas de `supplies`, `furniture_items`, `management_resources` o `suppliers` sin pasar por `LogisticsService`, **se pierden** en cascada líneas de receta, provisiones y recursos de eventos (o queda NULL el proveedor), **porque** las llaves foráneas son `ON DELETE CASCADE` o `SET NULL`. Las reglas "con historia no se elimina" existen justamente por eso. Evidencia: migraciones 10, 11, 13, 16, 17 y 30; `LogisticsService.delete*`.
11. **Si tocas** `management_resources` pensando solo en servicios externos, **se afectan** los cargos de Personal, **porque** son la misma tabla (`type='personal'`), con un índice único por empresa, tipo y nombre (69, preparado en producción por la 68b) que convive con la llave `(company_id, name)` de la 10, que no distingue tipo. Además, un `type` que la app no reconoce dejaba filas invisibles ("NADIE SE QUEDA FUERA", 16-08). Evidencia: migración 69 (comentario del paso 2); `people.repository.findRoles`; `RecursosTab`.
12. **Si tocas** `markProvisioned`, `clearProvisioned` o el orden de `unprovision`, **se afectan** el costo congelado de Gestión y el Dashboard, y el mes de salida de caja, **porque** `provisioned_cost` (solo insumos) y `provisioned_at` alimentan `GestionTab.costoBase` y `DashboardPage.salidas`. `markProvisioned` y `upsertSupplyProvisions` están abiertos incluso en eventos realizados. Evidencia: `LogisticsRepository.markProvisioned` y `upsertSupplyProvisions`; `DashboardPage.marginData`.
13. **Si agregas** una columna a `quotations` que Compras o el Dashboard necesiten, **no aparecerá**, **porque** `findAcceptedEvents` y `findWonEventsSince` usan un `select` con columnas explícitas. Así se agregaron los campos de propina el 31-08; lo mismo aplica a `COLUMNAS_LISTA` de `quotations.repository.ts` ("columna nueva en la tabla ⇒ agregarla acá").
14. **Si agregas** código a `ComprasTab.tsx` (1.744 líneas), **lo rechaza el portero**, **porque** es uno de los 7 gigantes congelados en 1.794. Hay que extraer la pieza nueva a su propio archivo. Evidencia: `frontend/scripts/portero-kit-de-la-casa.sh` (`congelar`).
15. **Si arreglas** solo la línea del "hoy" en el radar de `MobiliarioTab`, **se crea** un bug nuevo, **porque** ese "hoy" en hora universal se compara contra fechas del mismo bloque que también están en hora universal. Evidencia: `docs/arquitectura/09_PLAN_DE_HOMOLOGACION.md`, Tanda A1 ("Revisar el bloque completo").

## 9. Pruebas que lo protegen

| Archivo | Qué cubre |
|---|---|
| `api-rest/src/logistics/tests/candado-logistica.spec.ts` | Candado del evento realizado en `LogisticsRepository`. Rechaza agregar, cambiar o borrar recursos, cambiar horarios, agregar o borrar notas, borrar la foto de costos y borrar provisiones. Permite tomar la foto (`markProvisioned`). En un evento vivo acepta recursos, notas y borrar la foto. Sin filas no consulta la base |
| `api-rest/src/logistics/tests/logistics.service.spec.ts` | `LogisticsService.deleteSupplier`: se elimina sin referencias; 409 con insumos o con recursos |
| `api-rest/src/logistics/tests/aislamiento-catalogo-logistica.spec.ts` (sprint 1, **solo en la rama `pruebas`**) | `addRecipeItem`: deja pasar con servicio e insumo propios; rechaza (404) el insumo ajeno sin insertar; rechaza (404) el servicio ajeno sin insertar. `addCostItem`: deja pasar con fijo y recurso propios; rechaza (404) el recurso ajeno sin insertar |
| `frontend/src/utils/costoDeRecursos.test.ts` (vitest) | 8 casos: solo fijo, solo variable, mixto con el fijo una vez, "la cuenta vieja cobraba la instalación dos veces", personal línea por línea, recursos distintos no se mezclan, números que llegan como texto, sin líneas |

**Lo importante que NO está cubierto:**
- `consolidateEvent`, `buildConsolidationContext`, `resolveId`, `servicesSignature`, `toBaseQty`, `grossQty` y `canonicalServiceName`: el corazón del costo estimado no tiene pruebas.
- Del lado del motor:
  - el candado de familia (`updateSupply`);
  - las reglas de borrado de insumos, mobiliario y recursos;
  - `conDiaUnico`;
  - `suppliesUsage`;
  - el aislamiento por `company_id` de las consultas.
- De Compras: `confirmarCompra`, `repartirGastado`, `stampCompleted`, `buildRows` y `unprovision`.
- La composición del margen en `GestionTab`, `ServiciosTab` y `DashboardPage.marginData`.
- La sincronización del caché de los fijos (`FixedCostSection.syncTotals`) y el autoimporte de `EventResourcesSection`.

## 10. Deuda y rarezas conocidas

**Tamaño y portero**
- `ComprasTab.tsx`: 1.744 líneas, congelado en 1.794.
- Pasan de 800 líneas y cuentan para el techo de 27: `MobiliarioTab.tsx` (806), `FichaCocinaSection.tsx` (1.213), `GestionTab.tsx` (865) y `EventResourcesSection.tsx` (835).

**Modales hechos a mano** (`fixed inset-0`, no el `Modal` de la casa)
- `InsumosTab`, `ProveedoresTab`, `MobiliarioTab` y el modal "Confirmar la compra" de `ComprasTab`.
- El de `MobiliarioTab` no tiene tope de alto (`max-w-md p-5` sin `max-h`): es el pendiente de la Tanda A4 del doc 09.
- `CLAUDE.md` no los lista en su deuda de modales.

**Duplicaciones y código muerto**
- `getCatalogServiceNameIds` y `getFixedServiceCostsById` en `frontend/src/services/logistics.service.ts` no tienen quien las llame. Duplican `mapNameIds` y `mapFixedCosts` ("si cambias una, cambia la otra"). Por eso GET `/logistics/catalog/service-names` y `/catalog/fixed-costs` quedan sin uso desde la app.
- La consulta de la base está escrita a mano en 3 pantallas en vez de `useBaseLogistica` (§8.2).
- `FichaCocinaSection.resolveVarId` repite los dos primeros pasos de `resolveId` (sin el respaldo final por id numérico).
- `UNITS_BY_FAMILY` existe en el motor y en la app.

**Comentarios viejos**
- `frontend/src/services/logistics.service.ts` dice "Acceso directo a Supabase", contradiciendo su propio encabezado del 28-07.
- `logistics.module.ts` dice "Hoy: proveedores. Próximas sesiones: insumos, compras…", pero ya está todo mudado.

**En la app**
- Las lecturas sueltas de `frontend/src/services/logistics.service.ts` "tragan errores por historia": devuelven `[]`, `{}` o nulos si falla la red, así que una caída se ve igual que un catálogo vacío. Las escrituras no lanzan: devuelven `{ error }`. Solo `getBaseCatalogo` y `getEstadoCompras` lanzan el error.
- Casi todas conservan un `_companyId` que no se usa.
- `getBaseCatalogo` y `getEstadoCompras` escriben la ruta a mano (`"/logistics/base-catalogo"`, `"/logistics/estado-compras"`), sin constante en `api.routes.ts`.

**En el motor**
- `LogisticsService` es casi todo "pasadas directas" (así lo dice su comentario): las reglas de Compras viven en la pantalla.
- El repositorio devuelve `Record<string, unknown>`, sin entidades ni interfaces.
- `CreateManagementResourceDto.type` acepta cualquier texto; el motor no valida `personal/arriendo`. Solo frena el CHECK de la migración 10, que todavía admite `compra`.
- Varias reglas existen **solo en la pantalla**:
  - el personal no se cobra por persona ni lleva proveedor;
  - los fijos no llevan insumos.
- `createFurniture` no guarda `unit_cost` al crear (arma la fila solo con nombre, categoría, stock, foto y `preassembled`). El costo unitario solo se puede poner editando.
- `markProvisioned` hace un UPDATE por evento, en serie.
- Los INSERT del repositorio `addEventResources`, `upsertSupplyProvisions`, `setServiceTime`, `addKitchenNote` y `markDaysPrinted` siguen sin verificar que los ids a los que apuntan sean de la empresa de la sesión. La fila queda con el `company_id` propio, pero puede apuntar a una cotización, recurso o servicio ajeno. `addRecipeItem` y `addCostItem` **SÍ lo verifican desde el sprint 1 de aislamiento entre empresas (11-09-2026)**, con el método nuevo `LogisticsRepository.idsDeLaEmpresa` (ver §3) — pero **solo en la rama `pruebas` (commit 8266ba1): no está en producción**. `api-rest/src/people/people.service.ts` ya lo verificaba para el cargo, con `people.repository.esRecursoDeLaEmpresa`.

**Rarezas de Compras**
- En el CSV, el **subtotal** por proveedor se calcula con `totalBase × price` (neto, sin merma), pero cada fila muestra `costTotal` (bruto). Con merma mayor que 0, el subtotal no cuadra con la suma de las filas.
- El "formato" de la columna en pantalla, del PDF y del CSV usa la cantidad **neta**, pero el "Compro" sugerido del modal usa la **bruta** (`compradoSugerido`), aunque su comentario dice que es "la misma cuenta que muestra la columna Formato".
- `stampCompleted` solo estampa eventos **sin** `provisioned_at`: re-provisionar un evento completo con un gasto real distinto no actualiza `provisioned_cost`.
- `unprovision` limpia la marca de "completo" en **todos** los eventos seleccionados, aunque se hayan desprovisionado solo algunos insumos.

**Otros**
- `EventResourcesSection.updateLastPrice` escribe `last_price` sin esperar respuesta y se traga el error (`.catch(() => {})`).
- `InventarioPage` importa `MobiliarioTab` desde `pages/logistica/components`: la pieza cambió de casa, pero el archivo no.
- Uso de `any`: 1 en cada una de `InsumosTab`, `ProveedoresTab`, `RecursosTab` y `MobiliarioTab`.

## 11. Contradicciones entre documento y código

1. **La merma: cantidad bruta o neta.**
   - Documentos: `docs/migrations/31_supply_waste_and_package.sql` (19-07) dice "Compras, Gestión, bodega de la ficha y costos usan la bruta". El comentario de `Supply` en `frontend/src/types/logistics.types.ts` dice "compras y costos usan la cantidad BRUTA".
   - Código: la "REGLA DE MERMA (Felipe, 22-07)" de `eventConsolidation.ts` (commit ee334a7) deja la cantidad **neta** y la merma solo en el costo. `ComprasTab.buildRows` guarda `qty_base` neta. `bodegaDe` en la ficha usa `totalBase` neto.
2. **Doc 10 §6, "El modal de insumos": dos líneas de resumen.**
   - Documento: *"34 insumos · 3 con cantidad por confirmar [ revisar ]"*.
   - Código: `GestionTab` no tiene ningún concepto de "cantidad por confirmar" (buscar "por confirmar" o "revisar" no da resultados). El modal es solo informativo.
3. **Doc 10 §6: el precio que actualiza el catálogo.**
   - Documento: "El precio actualiza el catálogo a propósito… **Con aviso cuando el salto es grande**".
   - Código: `ComprasTab.confirmarCompra` escribe `price = gastado ÷ comprado` con `updateSupply`, sin comparar contra el precio anterior ni avisar (no hay umbral en el archivo).
4. **"Todos los servicios que lo referencian se actualizan solos."**
   - Documentos: la migración 13 dice "al actualizar la lista anual del proveedor, todos los servicios que la referencian se actualizan solos"; el encabezado de `FixedCostSection.tsx` dice lo mismo.
   - Código: eso vale para lo que muestra `FixedCostSection` (calcula en vivo). El caché `fixed_services.cost_fixed/cost_per_person`, que usan el cotizador y Servicios vía `base-catalogo`, solo se reescribe en `FixedCostSection.syncTotals`. Editar el precio en `RecursosTab` no lo resincroniza.
5. **Re-provisionar actualiza la foto.**
   - Documentos: la migración 15 dice "re-provisionar está permitido y actualiza la foto"; el comentario de `markQuotationsProvisioned` en `logistics.service.ts` repite "Re-provisionar está permitido: actualiza la foto completa".
   - Código: `ComprasTab.stampCompleted` filtra `!ev.provisioned_at`, así que desde Compras no se re-estampa un evento ya completo.
6. **`CLAUDE.md`: "There is no frontend test suite".**
   - Código: `frontend/package.json` tiene `"test": "vitest run"` y hay 19 archivos `*.test.ts(x)`, entre ellos `frontend/src/utils/costoDeRecursos.test.ts`.
7. **`CLAUDE.md`: "Every DB change MUST be recorded as a migration".**
   - Código: `furniture_items.preassembled` se usa en `CreateFurnitureItemDto`, `LogisticsRepository.createFurniture`, `FurnitureItem` y `consolidateEvent`, pero ningún archivo de `docs/migrations` la crea.
8. **`CLAUDE.md`: "Endpoint paths are centralized in `src/constants/api.routes.ts`".**
   - Código: `getBaseCatalogo` y `getEstadoCompras` escriben la ruta a mano.
9. **`CLAUDE.md`: la lista de módulos del motor** ("Modules: auth, companies, …") no incluye `logistics` (tampoco `people`, `movil`, `storage`, `consultas` ni `marketing`).
   - Código: `LogisticsModule` está registrado en `api-rest/src/app.module.ts`.
10. **`CLAUDE.md`: la deuda de modales hechos a mano.**
    - Documento: la lista nombra `GestionTab`, `PhotoPopup` y otros.
    - Código: omite los 4 modales hechos a mano de Logística (§10).

## 12. Preguntas abiertas

- **`preassembled` sin migración.** ¿En qué migración, o cambio manual en Supabase, nació `furniture_items.preassembled`? ¿Existe igual en producción y en el laboratorio?
- **Paquete 68→81 en producción.** La migración 81 dice "Aplicada en PRODUCCIÓN: pendiente (paquete 68→81)", y `RecursosTab` dice que en producción hay 7 recursos con tipo viejo "hasta que corra la migración 72". El código no permite confirmar si ya se aplicaron.
- **Borrar un servicio y sus recetas.** El comentario de `ServicesService.removeVariableService` (13-08) dice que borrar un servicio "le arrancaba en cascada su receta". Pero la migración 11 no pone llave foránea en `service_recipe_items.service_id`, y no se encontró ningún trigger. Al borrar un servicio libre, ¿quedan líneas de receta huérfanas? ¿Hay algo en la base que no está en `docs/migrations`?
- **Tomar la foto en eventos realizados.** ¿Es intencional que `markProvisioned` y `upsertSupplyProvisions` acepten eventos `realizada` y puedan **reescribir** su costo congelado? El candado dice que "tomar la foto" queda abierto, pero no distingue la primera foto de una posterior.
- **Re-estampar con el gasto real.** ¿Debe Compras volver a estampar `provisioned_cost` cuando se re-provisiona un evento completo con un gasto real distinto (§10, §11.5)?
- **Ids de otra empresa.** El sprint 1 de aislamiento entre empresas (11-09, rama `pruebas`, commit 8266ba1) ya valida esto en `addRecipeItem` y `addCostItem` (§3). ¿Se quiere extender la misma validación a `addEventResources`, `upsertSupplyProvisions`, `setServiceTime`, `addKitchenNote` y `markDaysPrinted` (§10)? ¿Y llevar el sprint 1 completo a producción?
- **El caché de los fijos.** ¿Cambiar el precio de lista de un recurso debería resincronizar el caché de costos de los fijos (§8.9, §11.4)?
- **El ajuste de insumos antes de comprar.** El doc 10 §9 lo deja abierto. ¿El modal "Confirmar la compra" del 24-08 lo da por resuelto? Si es así, el documento debería decirlo.
- **Roles de Post-Venta.** Los roles exactos que ven Gestión y Cocina dependen de Post-Venta y no se verificaron aquí (mapa 04).

## 13. Archivos clave

**Motor**
- `api-rest/src/logistics/logistics.module.ts`
- `api-rest/src/logistics/logistics.controller.ts`
- `api-rest/src/logistics/logistics.service.ts`
- `api-rest/src/logistics/logistics.repository.ts`
- `api-rest/src/logistics/dto/create-supplier.dto.ts`
- `api-rest/src/logistics/dto/create-supply.dto.ts`
- `api-rest/src/logistics/dto/create-catalog-items.dto.ts`
- `api-rest/src/logistics/dto/event-operations.dto.ts`
- `api-rest/src/logistics/tests/candado-logistica.spec.ts`
- `api-rest/src/logistics/tests/logistics.service.spec.ts`
- `api-rest/src/logistics/tests/aislamiento-catalogo-logistica.spec.ts` (sprint 1, solo en la rama `pruebas`)
- `api-rest/src/auth/roles.decorator.ts` (`OPERATIONS_AND_UP`, `SALES_AND_UP`, `ADMIN_ONLY`)
- `api-rest/src/quotations/constants/constants.ts` (`EVENTO_REALIZADO_CONGELADO`)
- `api-rest/src/people/people.repository.ts` (cargos sobre `management_resources`)
- `api-rest/src/movil/movil.service.ts` (checklist de cocina)
- `api-rest/src/storage/storage.service.ts` (bucket `furniture-photos`)
- Migraciones: `docs/migrations/10_logistics_catalogs.sql`, `11_service_recipes.sql`, `12_fixed_service_costs.sql`, `13_resource_pricing_and_service_costs.sql`, `14_resource_two_price_components.sql`, `15_provisioning.sql`, `16_event_supply_provisions.sql`, `17_event_resources_and_provision_snapshot.sql`, `18_event_resource_origin.sql`, `19_personal_no_per_person.sql`, `20_furniture_inventory.sql`, `22_kitchen_sheet.sql`, `28_multi_day_kitchen.sql`, `29_supplier_contact_name.sql`, `30_supplier_snapshot_and_rules.sql`, `31_supply_waste_and_package.sql`, `44_cocina_checklist.sql`, `57_servicios_sin_costo.sql`, `68b_produccion_nombres_repetidos_antes_de_la_69.sql`, `69_cargos_fusionados_con_recursos.sql`, `70_recursos_con_dia.sql`, `72_se_acaba_el_tipo_compra.sql`, `73_mobiliario_costo_unitario.sql`, `81_recursos_sin_dia_de_eventos_de_un_dia.sql`, `84_las_sillas.sql`

**App**
- `frontend/src/pages/logistica/LogisticaPage.tsx`
- `frontend/src/pages/logistica/components/ComprasTab.tsx`
- `frontend/src/pages/logistica/components/InsumosTab.tsx`
- `frontend/src/pages/logistica/components/ProveedoresTab.tsx`
- `frontend/src/pages/logistica/components/RecursosTab.tsx`
- `frontend/src/pages/logistica/components/MobiliarioTab.tsx`
- `frontend/src/pages/inventario/InventarioPage.tsx`
- `frontend/src/services/logistics.service.ts`
- `frontend/src/hooks/useBaseLogistica.ts`
- `frontend/src/utils/eventConsolidation.ts` (`consolidateEvent`, `buildConsolidationContext`, `servicesSignature`)
- `frontend/src/utils/costoDeRecursos.ts` y `costoDeRecursos.test.ts`
- `frontend/src/utils/searchMatch.ts` (`canonicalServiceName`)
- `frontend/src/utils/eventoCongelado.ts`
- `frontend/src/types/logistics.types.ts` (`toBaseQty`, `grossQty`, `UNITS_BY_FAMILY`)
- `frontend/src/constants/api.routes.ts` (`LOGISTICS_*`)
- `frontend/src/constants/permissions.ts` (`SECTION_ROLES.logistics`)
- `frontend/src/layout/Sidebar.tsx`
- `frontend/src/App.tsx`
- Consumidores fuera del módulo:
  - `frontend/src/pages/postventa/GestionTab.tsx`
  - `frontend/src/pages/postventa/EventResourcesSection.tsx`
  - `frontend/src/pages/postventa/CocinaTab.tsx`
  - `frontend/src/pages/postventa/FichaCocinaSection.tsx`
  - `frontend/src/pages/postventa/ServiciosTab.tsx`
  - `frontend/src/pages/quotations/QuotationForm.tsx`
  - `frontend/src/pages/dashboard/DashboardPage.tsx`
  - `frontend/src/pages/services/components/RecipeTab.tsx`
  - `frontend/src/pages/services/components/FixedCostSection.tsx`
  - `frontend/src/pages/services/ServicesPage.tsx`
  - `frontend/src/pages/personas/SemanaTab.tsx`
  - `frontend/src/pages/personas/ResumenDelDia.tsx`
- `frontend/scripts/portero-kit-de-la-casa.sh` (gigante `ComprasTab` congelado)
