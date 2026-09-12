# Flujo: Cambiar el catálogo y su efecto en lo existente

> **Estado: verificado una vez contra el código** (commit bd6a0e1, 11-09-2026), actualizado el 11-09-2026 con las migraciones 107-109 y el estado del sprint 1. Falta la etapa de completar lo que no quedó escrito. Parte del atlas; índice de flujos en flujos/00_INDICE_DE_FLUJOS.md y del sistema en ../00_MAPA_DEL_SISTEMA.md.

## 1. En palabras simples

El catálogo es la carta de la empresa: servicios por persona (platos, bebidas), servicios fijos (salón, decoración), sus categorías y secciones, y los atajos que arman los vendedores (menús guardados y paquetes). El administrador lo cambia en "Catálogo" (`/services`): renombra, sube precios, mueve un servicio de categoría, lo apaga, ordena secciones o borra lo que nunca se usó. Los vendedores renombran o borran menús y paquetes desde el cotizador.

La regla que manda todo: **una cotización guardada es una foto**. Guarda el nombre, el precio, la categoría y el código de cada ítem tal como estaban ese día, y ningún cambio del catálogo la reescribe sola. Una cotización vieja sigue diciendo el nombre y el precio de entonces, y su total no se mueve.

Lo que sí cambia es todo lo que **se lee del catálogo vivo alrededor de la foto**: qué se ofrece para agregar, qué ítem va con candado, cómo se agrupa el "Incluye:" del documento, qué receta se usa para estimar costos y qué menús aparecen en cada casilla. Ahí están las sorpresas: renombrar una categoría esconde sus menús guardados; renombrar un servicio "sin costo" lo hace reaparecer como "sin receta" en eventos viejos; desactivar un servicio no lo saca de los menús ni de los paquetes. No hay correos ni relojes: solo cascadas de la base de datos y cachés de la app.

## 2. El recorrido paso a paso

### A. Abrir el catálogo

1. **Quién actúa:** el administrador entra a `/services`. **Pantalla:** `ServicesPage` (`frontend/src/pages/services/ServicesPage.tsx`). Al montarse carga:
   - **Catálogo:** `useServices()` (`frontend/src/hooks/useServices.ts`), llave `["services"]` → `findAllServices` → `GET /services` → `ServicesController.findAll` (sin `@Roles`: basta con tener sesión) → `ServicesService.findAll` → `ServicesRepository.findAllVariableServices`, `findAllFixedServices`, `findAllServiceCategories` y `findAllServiceCategoryLinks`, todas filtradas por `company_id`. El hook arma `products` con `buildProductsFromLinks`: una fila por vínculo servicio–categoría, con el nombre **vigente** de la categoría. También arma `fixedServices` (`codigo` = id en texto), `inactiveCategories` (nombres) y `orderedCategories`.
   - **Códigos en uso:** llave `["usedServiceCodes"]` → `getUsedServiceCodes` → `GET /services/used-codes` → `ServicesService.usedServiceCodes` → `ServicesRepository.usedServiceCodes` → RPC `used_service_codes` (migración 54). Junta los `codigo` de los fijos, de los ítems anidados de variables y de las variables guardadas al nivel superior (formato antiguo).
   - **Costos por fila:** `["recipeCosts", company.id]` (recetas × insumos) y `["fixedCosts", company.id]` (líneas de costo × recursos).
   - **Secciones de categoría:** `VariableServicesByCategory.loadSections` → `getCategorySections` → `GET /sections` → `SectionsController.findAll` → `SectionsRepository.findAll`. Viven en `useState`, **sin React Query**. Si la llamada falla, `getCategorySections` devuelve una lista vacía sin avisar.
   - **Secciones de fijos:** `FixedServicesBySection`, llave `["fixedSections"]` → `getFixedSections` → `GET /services/fixed-sections`.

### B. Renombrar, cambiar el precio o las categorías de un servicio variable

2. **Quién actúa:** el administrador abre la ficha (`ServicesPage.handleEditService`), que monta `VariableServiceForm` (`frontend/src/pages/services/components/variableServices/VariableServiceForm.tsx`). Cada cambio de nombre, precio, "sin costo" o categorías arma una foto local, y **1,2 s después del último cambio se autoguarda** (pedido de Felipe, 13-08). Lo que está a medio escribir no viaja: nombre vacío, precio no numérico o cero categorías.
3. **Primer viaje, en producción:** `updateVariableService(id, { name, price, no_cost })` → `PATCH /services/variable/:id` → `ServicesController.updateVariableService` (`@Roles(...ADMIN_ONLY)`) → `ServicesService.updateVariableService` → `ServicesRepository.updateVariableService(id, rest)`, que filtra **solo por `id`**, sin empresa. **Cambia** `variable_services.name`, `price` y `no_cost`. **No cambia** `variable_services.category`: es un texto legado que solo se llena al crear (`ServicesService.createVariableService`, con la primera categoría).
   - **En la rama pruebas** (commit 8266ba1, sprint 1 de aislamiento entre empresas, 11-09-2026, **todavía no en producción**): `ServicesRepository.updateVariableService(id, rest, companyId)` filtra con `.eq('id', id).eq('company_id', companyId)` y agrega `.select('id')`. `ServicesService.updateVariableService` revisa esa fila: sin ninguna, tira 404 "Servicio no encontrado" **antes** de seguir al segundo viaje. El controller ya recibía `@CurrentUser()` desde antes de este sprint; lo que faltaba era que el repositorio usara esa empresa.
4. **Segundo viaje, en producción:** `setServiceCategories(id, ids)` → `PATCH /services/variable/:id/categories` → `ServicesService.setServiceCategories` (400 "El servicio debe pertenecer al menos a una categoría" si la lista viene vacía) → `linkServiceToCategories`. Ese método lee con `getLinksForService` (sin empresa), **primero borra** los vínculos que sobran con `deleteServiceCategoryLink` (sin empresa) y **después agrega** los nuevos al final de cada categoría (`getMaxServiceSortOrder` + 1, `insertServiceCategoryLink`). **Tabla:** `variable_service_categories`. Los vínculos nuevos nacen con `section_id` nulo. No hay transacción.
   - **En la rama pruebas** (mismo commit 8266ba1, todavía no en producción): `getLinksForService(serviceId, companyId)` y `deleteServiceCategoryLink(serviceId, categoryId, companyId)` ahora reciben y filtran por `companyId`. Como el paso 3 ya cortó con 404 a un servicio ajeno, en la práctica este segundo viaje nunca llega a ejecutarse sobre un servicio de otra empresa; el filtro de empresa en `getLinksForService`/`deleteServiceCategoryLink` es un segundo candado, no el único.
5. **Resultado del autoguardado:** si falla, el modal muestra el estado "error" (`setAutoEstado`) y no revierte nada. Si funciona, marca `huboGuardadosRef`.
6. **Al cerrar** (`handleClose`, si hubo autoguardados) **o al apretar Guardar** (`handleSubmit`), se llama a `ServicesPage.handleServiceFormSuccess`. Esa función cierra el modal primero (pillada del 03-08) y después invalida `["services"]`, `["recipeCosts"]`, `["fixedCosts"]` y el prefijo `["logistica", "compras", "base"]`, "para que Gestión se entere sin esperar los 5 minutos de frescura".
7. **Efecto automático en el motor, válido para todas las escrituras de este flujo:** `PanelInvalidationInterceptor` (`api-rest/src/cache/panel-invalidation.interceptor.ts`, registrado como `APP_INTERCEPTOR` en `api-rest/src/app.module.ts`). Tras cada POST, PATCH o DELETE exitoso llama a `invalidarPanelEmpresa`, que borra de `cachePanel` el panel de análisis de esa empresa.

### C. Cambiar un servicio fijo

8. **Quién actúa, en producción:** el administrador, en `FixedServiceForm` (`frontend/src/pages/services/components/FixedServiceForm.tsx`), aprieta Guardar. La pantalla arma `payload` con `calculation_type`, `price`, `min_price`, `max_price`, `price_per_person` y `no_cost` → `updateFixedService` → `PATCH /services/fixed/:id` → `ServicesController.updateFixedService`, que **no recibe al usuario** → `ServicesService.updateFixedService` → `validateFixedServices` (`api-rest/src/services/utils/index.ts`) → `ServicesRepository.updateFixedService(id, dto)`, **solo por `id`**. **Tabla:** `fixed_services`, en esas columnas. Un error de validación sale como 500, porque el service lo envuelve en `new Error(error)`. Después, igual que en el paso 6.
   - **En la rama pruebas** (commit 8266ba1, sprint 1, 11-09-2026, **todavía no en producción**): `ServicesController.updateFixedService` ahora sí recibe `@CurrentUser() user: User` (era, junto a `removeGroup` y `removeCollection`, una de las tres puertas de este módulo sin usuario). `ServicesRepository.updateFixedService(id, dto, companyId)` filtra con `.eq('id', id).eq('company_id', companyId)` y `.select('id')`; `ServicesService.updateFixedService` tira 404 "Servicio fijo no encontrado" si no hay fila. Sigue igual: `validateFixedServices` corre antes de tocar la base, y su error sigue envuelto en `new Error(error)` con 500.
9. **Mover de sección o de orden:** en `FixedServicesBySection`, arrastrar o usar la cajita → `reorderFixedServices(sectionId, lista)` → `PATCH /services/fixed/reorder` → `ServicesService.reorderFixedServices` → `ServicesRepository.reorderFixedServicesBulk` → RPC `reorder_fixed_services` (migración 55). **Tabla:** `fixed_services.section_id` y `sort_order`.

### D. Desactivar o reactivar un servicio

10. **Quién actúa:** el administrador aprieta el ojo de la fila → `ServicesPage.handleToggleActive` → `updateVariableService(id, { is_active })` o `updateFixedService(id, { is_active })`, los mismos endpoints de los pasos 3 y 8 (con el mismo candado de empresa: en producción solo por `id`, en la rama pruebas por `id` + `company_id`, con 404 si el servicio es ajeno). En el fijo, `validateFixedServices` no revisa nada, porque el sobre no trae `calculation_type`. **Cambia** `is_active`. Solo recarga `["services"]`. Si falla, muestra el toast "No se pudo actualizar el estado del servicio.".

### E. Borrar un servicio

11. **Quién actúa:** el administrador, con el basurero de la fila. El basurero está apagado si `servicioEnUso(usedCodes, servicio)` (`frontend/src/pages/services/serviciosEnUso.ts`) encuentra el id **o** el `code` entre los códigos en uso. Si está encendido, pide confirmación con `ConfirmInline` → `handleDeleteService`.
12. **Variable:** `removeVariableService` → `DELETE /services/variable/:id` → `ServicesService.removeVariableService` → `ServicesRepository.variableServiceUsage`:
    - `clavesDeServicio` arma las dos llaves del servicio: el id y el `code`.
    - Por cada llave cuenta las `quotations` de la empresa con `.contains('items', { variable_services: [{ items: [{ codigo }] }] })`. Manda el conteo mayor, no la suma.
    - Cuenta las filas de `service_group_items` del servicio en menús de la empresa.
    - Si hay uso → 400 con un mensaje armado solo con las partes que aplican (si solo hay cotizaciones, no menciona menús, y viceversa; con las dos, las une con "y"): "Este servicio se usa en {N cotización(es)}{ y }{M menú(s)}. No se puede eliminar: desactívalo para sacarlo del catálogo sin perder su historia." La pantalla lo muestra tal cual.
    - Si no hay uso → `ServicesRepository.removeVariableService` (con empresa). La base arrastra `variable_service_categories` (migración 5) y `service_group_collection_services` (migración 67). `service_recipe_items` **queda huérfana**, porque su `service_id` no tiene FK (migración 11).
13. **Fijo:** `DELETE /services/fixed/:id` → `ServicesService.removeFixedService` → `fixedServiceUsage` (solo mira cotizaciones, con las dos llaves) → `ServicesRepository.removeFixedService`. La base arrastra `fixed_service_cost_items` (migración 13) y `service_group_collection_fixed_services` (migración 100), y deja `event_resources.origin_fixed_service_id` en `NULL` (migración 18).
14. **Después:** toast "Servicio eliminado." y recarga de `["services"]`. Nadie invalida `["usedServiceCodes"]`.

### F. Categorías

15. **Renombrar:** menú ⋮ → Renombrar en `VariableServicesByCategory` → `onRenameCategory` = `ServicesPage.handleRenameCategory` → `updateCategoryById(id, { name })` → `PATCH /services/categories/:id` → `ServicesController.updateCategoryById` → `ServicesService.renameOrUpdateCategory` (recorta espacios) → `ServicesRepository.updateCategory` (empresa + id). **Cambia** `service_categories.name`.
    - **No cambia** `service_groups.category`, ni `variable_services.category`, ni el `category` de las casillas en `quotations.items`: los tres son texto.
    - `renameOrUpdateCategory` solo lee `data` y descarta `error`. Si la base rechaza el cambio, por ejemplo por la restricción UNIQUE (`company_id`, `name`) de la migración 4, el motor responde 200 sin cuerpo y no avisa.
    - Recarga `["services"]`.
16. **Activar o desactivar:** ⋮ → `handleToggleCategoryActive` → el mismo endpoint, con `is_active` → `service_categories.is_active`. Desde ahí `useServices.inactiveCategories` incluye ese nombre.
17. **Borrar:** ⋮ → Eliminar → `handleDeleteCategory` → `deleteCategoryById` → `DELETE /services/categories/:id` → `ServicesService.deleteCategoryForCompany` → `ServicesRepository.getServicesOnlyInCategory`.
    - Si algún servicio quedaría sin categoría → 409 con `service_ids`, y la pantalla nombra esos servicios.
    - Si no → `deleteCategory`. La base arrastra `variable_service_categories` (migración 5) y `category_sections` (migración 24).
18. **Cambiar las categorías de un servicio:** es el paso 4.
18b. **(Paso agregado en la verificación; se deja sin número entero para no correr la numeración de los pasos 19 en adelante, citados por número en el resto del documento) Reordenar categorías o servicios dentro de una categoría:** arrastre en `VariableServicesByCategory`.
    - **Categorías:** `onReorderCategories` = `ServicesPage.handleReorderCategories` → `reorderCategories(orderedIds)` → `PATCH /services/reorder-categories` → `ServicesService.reorderCategories` (bucle secuencial, una escritura por categoría, sin RPC) → `ServicesRepository.updateCategory`. **Cambia** `service_categories.sort_order`. Recarga `["services"]`.
    - **Servicios dentro de una categoría:** `reorderServicesInCategory(categoryId, ids)` → `PATCH /services/reorder-services` → `ServicesService.reorderServicesInCategory` → `ServicesRepository.reorderServicesInCategoryBulk` → RPC `reorder_services_in_category` (migración 55). **Cambia** `variable_service_categories.sort_order` dentro de esa categoría.
    - Ninguno de los dos toca `quotations`: el orden solo se lee del catálogo vivo (la carta, el agregador), nunca de la foto guardada.

### G. Secciones

19. **Secciones de una categoría** (⋮ → Secciones, en `VariableServicesByCategory`). Todas llevan `@Roles(...ADMIN_ONLY)` y filtran por empresa:

    | Acción | Endpoint | Repositorio | Qué cambia |
    |---|---|---|---|
    | Crear | `POST /sections` | `SectionsRepository.create` | fila nueva en `category_sections` |
    | Renombrar | `PATCH /sections/:id` | `SectionsRepository.rename` | `category_sections.name` |
    | Borrar | `DELETE /sections/:id` | `SectionsRepository.delete` | los vínculos quedan con `section_id` nulo (migración 24) |
    | Marcar la fija (estrella) | `PATCH /sections/default` | `SectionsRepository.setDefault` | apaga la fija actual y marca la elegida; el índice `category_sections_one_default` impide dos (migración 25) |
    | Mover un servicio de sección | `PATCH /sections/link/:linkId` | `SectionsRepository.setLinkSection` | `variable_service_categories.section_id` y `sort_order` |

    La pantalla recarga su lista local y, al mover o borrar, llama a `onReordered`, que en `ServicesPage` es `loadServices`.
20. **Secciones de fijos** (`FixedServicesBySection` → "Secciones"). **Tabla:** `fixed_service_sections`. Invalida `["fixedSections"]` y, al borrar, llama a `onServicesChanged`.
    - Crear: `POST /services/fixed-sections/new`.
    - Renombrar: `PATCH /services/fixed-sections/:id` → `updateFixedSectionById`.
    - Borrar: `DELETE /services/fixed-sections/:id` → `deleteFixedSectionById`. Los servicios quedan con `fixed_services.section_id` en `NULL` (migración 53).

### H. Menús guardados y paquetes

21. **No existe forma de editar el contenido** de un menú ni de un paquete. `ServiceGroupsController` solo crea, lista, renombra y borra; `ServiceGroupCollectionsController`, crea, lista y borra. Cambiar los platos de un menú es borrarlo y guardarlo de nuevo.
22. **Renombrar un menú** (lápiz en `MenusGuardados`, 09-09): `useServiceGroups.renameGroup` → `PATCH /service-groups/:id` → `ServiceGroupsService.rename` → `ServiceGroupsRepository.renameGroup` (id + empresa). **Cambia** `service_groups.name`. Un nombre repetido (23505) sale como 409 "Ya existe un menú guardado con ese nombre. Elige otro."; cualquier otro error, como 404. La app actualiza `["serviceGroups"]` con `setQueryData` y recarga.
23. **Borrar un menú, en producción:** `useServiceGroups.removeGroup` → `DELETE /service-groups/:id` → `ServiceGroupsController.remove`, que **no recibe al usuario** → `ServiceGroupsService.remove` → `ServiceGroupsRepository.removeGroup(id)`, **sin empresa**. La base arrastra `service_group_items` (migración 1) y `service_group_collection_items` (migración 3): el menú desaparece de los paquetes que lo incluían. La app solo refresca `["serviceGroups"]`, no `["serviceGroupCollections"]`.
    - **En la rama pruebas** (commit 8266ba1, sprint 1, 11-09-2026, **todavía no en producción**): `ServiceGroupsController.remove` ahora recibe `@CurrentUser()`. `ServiceGroupsRepository.removeGroup(id, companyId)` filtra con `.eq('id', id).eq('company_id', companyId)` y `.select('id')`; `ServiceGroupsService.remove` tira 404 "Menú guardado no encontrado" si no se borró ninguna fila. El resto —cascadas, caché— sigue igual.
24. **Borrar un paquete, en producción:** `useServiceGroupCollections.removeCollection` → `DELETE /service-group-collections/:id` → `ServiceGroupCollectionsController.remove`, que **no recibe al usuario** → `ServiceGroupCollectionsService.remove` → `ServiceGroupCollectionsRepository.removeCollection(id)`, sin empresa. La base arrastra sus tres tablas hijas.
    - **En la rama pruebas** (mismo commit, todavía no en producción): igual arreglo que el menú — el controller recibe `@CurrentUser()`, el repositorio filtra por `company_id` y devuelve la fila borrada, y el service tira 404 "Paquete no encontrado" si no había ninguna.
    - **Crear un menú o un paquete (nuevo candado, mismo sprint):** hasta este sprint, `POST /service-groups` y `POST /service-group-collections` no revisaban de quién eran los `variable_service_id`, `service_group_id` ni `fixed_service_id` recibidos — solo hacía falta que existieran, de cualquier empresa. En la rama pruebas, `ServiceGroupsService.create` llama a `ServiceGroupsRepository.variableServicesDeLaEmpresa` y tira 404 "Hay servicios que no son del catálogo de tu empresa" si alguno no es propio, antes de crear la cabecera. `ServiceGroupCollectionsService.create` hace lo mismo con `ServiceGroupCollectionsRepository.idsDeLaEmpresa` para los menús, los sueltos y los fijos del paquete, con 404 "Hay piezas del paquete que no son de tu empresa". Ninguno de los dos está en producción todavía.

### I. Lo que ya existía: cómo se ve el cambio después

25. **La cotización guardada no se toca.** Ningún paso anterior escribe en `quotations`. Al abrirla en el cotizador (`GET /quotations/:id`), `QuotationForm.loadExistingItemsFromJSON` (`frontend/src/pages/quotations/QuotationForm.tsx`) copia de la foto `codigo`, `nombre`, `precio`, `categoria`, `category` y `category_id`. Los fijos entran con `precio_calculado` = el `precio` guardado. El total se rehace con `computeMoney` (`api-rest/src/quotations/utils/money.ts`) sobre la foto, sin mirar el catálogo. Para fotos anteriores al 24-07 con precio 0, la cuenta usa `tipo_calculo` y `precio_por_persona` de la misma foto.
26. **A qué categoría apunta cada casilla.** `catDeCaja` y `nomCat` llaman a `buscarCategoria` (`frontend/src/utils/categoriaCaja.ts`), que prueba en orden: `category_id`, nombre exacto y nombre sin tildes, mayúsculas ni "s" final. Si nada calza, `nombreVigente` devuelve el nombre guardado. Con ese nombre vigente se arman:
    - los ítems que se ofrecen (`opcionesDe`: solo `is_active !== false` y sin los de la sección fija),
    - el candado (`isLockedService`, con la sección fija **de hoy**),
    - el orden por secciones.
27. **Qué muestran los selectores.**
    - **Categoría** (cotizador: `serviceCategories`, sacada de `products`; Post-Venta: `catNames`). Esconde las categorías inactivas **salvo la ya elegida** en esa casilla. El valor es el **nombre guardado**. Si ya no está en la lista, `SelectWithSearch` (`frontend/src/components/selects/SelectWithSearch.tsx`) lo muestra igual, porque `valorSePuedeMostrar` acepta nombres y solo rechaza números pelados y UUID (revisión del 16-08). En la práctica, una categoría renombrada se ve con el nombre viejo en el selector y en el documento, pero sus ítems vienen de la categoría nueva si la casilla tiene `category_id`.
    - **Ítems y fijos ya elegidos:** se pintan con el `nombre` de la foto. Los agregadores (`AgregadorDeItems`) nunca muestran lo elegido y solo ofrecen servicios activos, tanto el de fijos del cotizador y de `ServiciosTab` como `PkgFijosPicker`.
    - **Fijo que ya no está en el catálogo:** cae al final (`fixedOrderOf` devuelve el máximo) bajo "Sin sección" (`fixedSectionNameOf`).
28. **Editar y guardar mezcla precios de dos fechas.**
    - Subir la cantidad de un ítem ya guardado (`updateServiceBox` con `selectedItem`) mantiene su **precio viejo**.
    - Un ítem nuevo entra con el precio de hoy (`product.precio`); un fijo nuevo, con `calculatePrice` de hoy.
    - Al guardar, `buildItemsSnapshot` escribe `category_id: catDeCaja(box)?.id ?? box.selectedCategoryId ?? null` y deja `category` con el texto que traía. O sea, **guardar rellena el id de las casillas viejas** que calcen por nombre.
    - El guardado va por `PATCH /quotations/:id` → `QuotationsService.update`, que verifica los montos al peso y, si la cotización está `aceptada` y el total cambió, reajusta el plan de pagos (ver `05_CAMBIAR_TOTAL_DE_EVENTO_ACEPTADO.md`).
    - Un evento `realizada` no se puede guardar (candado `EVENTO_REALIZADO_CONGELADO`, flujo 02).
29. **Post-Venta y Negocio** (`ServiciosTab`, `frontend/src/pages/postventa/ServiciosTab.tsx`): se comporta igual, con copias de las mismas funciones (`catDeCaja`, `nomCat`, `defaultServiceIdsFor`, `isLockedService`, `defaultServicesFor`, `fixedOrderOf`, `fixedSectionNameOf`, `opcionesDe`). Su `buildItemsSnapshot` también rellena `category_id`. `addFixedSvc` resuelve el precio de hoy con `resolveFixedServicePrice`. Guarda con `updateQuotation`, salvo si `esEventoCongelado(quote.quotation_status)`.
30. **Documento, portal y hoja del correo.** Tres entradas que terminan en el mismo armado:
    - **Visor interno:** `QuotationViewer` → `getMenuOrder` → `GET /sections/menu-order` → `SectionsRepository.menuOrder`. El PDF espera a que llegue la carta.
    - **Portal:** `QuotationsService` entrega `menu: cartaDelCatalogo`.
    - **Hoja del correo:** `EnvioCotizacionService.hojaParaImprimir`, también con `QuotationsRepository.cartaDelCatalogo`.

    Las tres van a `buildQuotationPrintDoc` (`frontend/src/utils/quotationPrintDoc.ts`):
    - El título de la fila es el `category` **guardado**.
    - `includesOf` busca la categoría por `category_id`, luego por nombre y luego por nombre sin "s" final, y reparte los ítems por la sección **vigente** de su vínculo, cruzando `String(variable_service_id)` con `codigo`.
    - Queda "sin sección" (al final y sin rótulo) un ítem con código legado ("SF008"), un servicio que ya no pertenece a esa categoría o un ítem cuya sección se borró.
    - Si la categoría no se encuentra, sale la lista plana.
31. **Costos:** Gestión, la pestaña Servicios de Post-Venta, el margen del cotizador, Compras, Dashboard, el radar de Mobiliario y la ficha de cocina.
    - **Lectura:** todos leen `GET /logistics/base-catalogo` → `LogisticsController.baseCatalogo` → `LogisticsService.catalogServiceNames`/`fixedServiceCosts` (pura delegación) → `LogisticsRepository.catalogServiceNames` (`id`, `name`, `no_cost` de ambos catálogos) y `fixedServiceCosts`. Llave `["logistica", "compras", "base", companyId]`, con 5 minutos de frescura en `useBaseLogistica` y en el cotizador.
    - **Mapa de nombres:** `mapNameIds` (`frontend/src/services/logistics.service.ts`) arma el mapa nombre canónico → id con `canonicalServiceName` (`frontend/src/utils/searchMatch.ts`), y la lista `sinCostoVariable` **con los nombres canónicos actuales**. Los fijos sin costo van por id (`sinCostoFijoIds`).
    - **Resolución:** `consolidateEvent` → `resolveId` (`frontend/src/utils/eventConsolidation.ts`). Si el `codigo` es un número y ese id tiene receta, usa el id. Si no, busca por el nombre canónico **de la foto**. Si tampoco calza, usa el número.
    - **Sin receta:** un variable sin líneas de receta va a `acc.noRecipe` con el nombre de la foto, y cada pantalla lo filtra contra `sinCostoVariable`.
    - **Ficha de cocina:** tiene su propia copia, `FichaCocinaSection.resolveVarId`, sin el último respaldo numérico.
32. **Menús y paquetes al aplicarlos.** `GET /service-groups` y `GET /service-group-collections` traen `variable_services(*)` y `fixed_services(*)` unidos en vivo.
    - **Cotizador:** `boxGroups` lista los menús con `g.category === nomCat(box)`, o todos si la casilla no tiene categoría; si no hay ninguno, el botón "Usar un menú guardado…" queda deshabilitado. `MenusGuardados` muestra el precio por persona con precios de hoy. `buildBoxFromGroup` trae nombre y precio **de hoy**, **no filtra inactivos** y agrega la sección fija con `defaultServicesFor(group.category)`, por nombre exacto.
    - **Paquete:** `loadCollectionAsBoxes` crea las casillas con `selectedCategory = group.category` y **sin** `selectedCategoryId`. Los sueltos se agrupan por `variable_services.category`, el texto legado. Los fijos pasan por `fijosDelPaquete` (`frontend/src/pages/quotations/paqueteFijos.ts`), que los busca en `fixedServices` **incluidos los inactivos**, calcula el precio de hoy y se salta el que ya no existe.
    - **Post-Venta:** `ServiciosTab.addGroupDesdeMenu` lista todos los menús agrupados por su `category` (texto) y pone `category_id` buscando ese nombre exacto.
33. **Estadísticas.** `AnalyticsService` llama a las funciones `get_variable_services_usage` y `get_fixed_services_usage`, definidas en `db_functions_analytics_23_07.sql` (raíz del repo). Agrupan por `item->>'nombre'` de la foto, en cotizaciones aceptadas y realizadas, y devuelven un top 10. Se muestran en `DashboardPage` y en `frontend/src/pages/analytics/index.tsx`. La respuesta vive 1 hora en `cachePanel`, pero el interceptor del paso 7 la borra con cualquier escritura.

## 3. Diagrama

```mermaid
sequenceDiagram
    actor Admin as Administrador
    participant Cat as Catálogo (ServicesPage y modales)
    participant RQ as Caché React Query
    participant API as Motor (services, sections, service-groups)
    participant DB as Supabase
    participant Cot as Cotizador y Post-Venta
    participant Doc as Visor, portal y hoja
    participant Cos as Gestión, Compras, Dashboard, Cocina

    Admin->>Cat: cambia nombre, precio o categorías
    Note over Cat: autoguardado a los 1,2 s
    Cat->>API: PATCH /services/variable/:id
    API->>DB: UPDATE variable_services (solo por id en prod; con company_id en rama pruebas, sprint 1, aún no en prod)
    Cat->>API: PATCH /services/variable/:id/categories
    API->>DB: DELETE e INSERT en variable_service_categories
    Note over API: PanelInvalidationInterceptor borra cachePanel
    Admin->>Cat: cierra el modal
    Cat->>RQ: invalida services, recipeCosts, fixedCosts y logistica/compras/base
    Admin->>Cat: basurero de un servicio
    Cat->>API: DELETE /services/variable/:id
    API->>DB: cuenta quotations por id y por code, y service_group_items
    alt en uso
        API-->>Cat: 400 desactívalo
    else libre
        API->>DB: DELETE con cascadas (vínculos y sueltos de paquetes)
    end
    Note over DB: quotations.items no se toca en ningún paso del catálogo
    Cot->>API: GET /services y GET /quotations/:id
    Cot->>Cot: loadExistingItemsFromJSON usa nombre y precio de la foto
    Cot->>Cot: buscarCategoria por id, nombre o nombre normalizado
    Cot->>API: PATCH /quotations/:id (solo si alguien guarda)
    API->>DB: UPDATE quotations.items con category_id rellenado
    Doc->>API: GET /sections/menu-order o cartaDelCatalogo
    Doc->>Doc: includesOf agrupa por la sección vigente de cada codigo
    Cos->>API: GET /logistics/base-catalogo (5 min de caché)
    Cos->>Cos: resolveId por id o por canonicalServiceName del nombre guardado
```

## 4. Datos que cambian

| Tabla | Columnas | En qué paso | Quién escribe |
|---|---|---|---|
| `variable_services` | `name`, `price`, `no_cost` | 3 | `ServicesRepository.updateVariableService` (solo por id en producción; con `company_id` en la rama pruebas, sprint 1, 11-09-2026, todavía no en producción) |
| `variable_services` | `is_active` | 10 | `ServicesRepository.updateVariableService` |
| `variable_services` | fila completa (borrado) | 12 | `ServicesRepository.removeVariableService` |
| `variable_service_categories` | filas nuevas (`sort_order` al final) y filas borradas | 4 | `ServicesRepository.insertServiceCategoryLink` y `deleteServiceCategoryLink` (este último sin empresa en producción; con `company_id` en la rama pruebas, sprint 1, todavía no en producción) |
| `variable_service_categories` | `section_id`, `sort_order` | 19 | `SectionsRepository.setLinkSection` |
| `variable_service_categories` | filas en cascada o `section_id` a `NULL` | 12, 17, 19 | la base (migraciones 5 y 24) |
| `fixed_services` | `name`, `calculation_type`, `price`, `min_price`, `max_price`, `price_per_person`, `no_cost` | 8 | `ServicesRepository.updateFixedService` (solo por id en producción; con `company_id` en la rama pruebas, sprint 1, todavía no en producción) |
| `fixed_services` | `is_active` | 10 | `ServicesRepository.updateFixedService` |
| `fixed_services` | `section_id`, `sort_order` | 9 | RPC `reorder_fixed_services` |
| `fixed_services` | `section_id` a `NULL` | 20 | la base (migración 53) |
| `fixed_services` | fila completa (borrado) | 13 | `ServicesRepository.removeFixedService` |
| `service_categories` | `name`, `is_active` | 15, 16 | `ServicesRepository.updateCategory` |
| `service_categories` | fila completa (borrado) | 17 | `ServicesRepository.deleteCategory` |
| `service_categories` | `sort_order` | 18b | `ServicesRepository.updateCategory`, en bucle |
| `variable_service_categories` | `sort_order` dentro de una categoría | 18b | RPC `reorder_services_in_category` (migración 55) |
| `category_sections` | fila, `name`, `sort_order`, `is_default` | 19 | `SectionsRepository.create`, `rename`, `reorder`, `setDefault` y `delete` |
| `category_sections` | filas en cascada al borrar la categoría | 17 | la base (migración 24) |
| `fixed_service_sections` | fila, `name`, `sort_order` | 20 | `ServicesRepository.createFixedSection`, `updateFixedSection` y `deleteFixedSection` |
| `service_groups` | `name` | 22 | `ServiceGroupsRepository.renameGroup` |
| `service_groups` | fila completa (borrado) | 23 | `ServiceGroupsRepository.removeGroup` (sin empresa en producción; con `company_id` en la rama pruebas, sprint 1, todavía no en producción) |
| `service_group_items` | filas en cascada | 23 | la base (migración 1) |
| `service_group_collections` | fila completa (borrado) | 24 | `ServiceGroupCollectionsRepository.removeCollection` (sin empresa en producción; con `company_id` en la rama pruebas, sprint 1, todavía no en producción) |
| `service_group_collection_items` | filas en cascada | 23, 24 | la base (migración 3) |
| `service_group_collection_services` | filas en cascada | 12, 24 | la base (migración 67) |
| `service_group_collection_fixed_services` | filas en cascada | 13, 24 | la base (migración 100) |
| `fixed_service_cost_items` | filas en cascada | 13 | la base (migración 13) |
| `event_resources` | `origin_fixed_service_id` a `NULL` | 13 | la base (migración 18) |
| `service_recipe_items` | **nada**: la receta queda huérfana | 12, 13 | nadie (migración 11, sin FK) |
| `quotations` | **nada** en este flujo. `items` (con `category_id` rellenado y precios mezclados) cambia solo si alguien guarda después | 28, 29 | `QuotationsRepository.update`, vía `QuotationsService.update` |

## 5. Efectos automáticos y colaterales

**Correos, relojes y notificaciones:** ninguno. `ServicesService`, `ServiceGroupsService` y `ServiceGroupCollectionsService` no llaman al módulo de correo ni tienen tareas programadas.

**Cascadas de la base:** las marcadas "la base" en la tabla anterior. Las más delicadas:
- Borrar un menú lo saca, sin aviso, de todos los paquetes que lo tenían.
- Borrar un servicio que solo vivía en un paquete lo saca del paquete, porque el candado no mira paquetes.
- Borrar un fijo borra su ficha de costos.
- Borrar una sección, de categoría o de fijos, deja sus servicios en "Sin sección". Si era la sección fija, la categoría deja de sembrar ítems solos.

**Caché del motor:** `cachePanel` (`api-rest/src/cache/memoria.ts`, 1 hora) guarda el panel y las estadísticas por empresa. `PanelInvalidationInterceptor` la borra con cualquier escritura exitosa, incluidas las del catálogo.

**Cachés de la app** (`frontend/src/lib/queryClient.ts`: `staleTime` de 30 s y `refetchOnWindowFocus` por defecto):

| Caché | Quién la invalida | Qué queda viejo |
|---|---|---|
| `["services"]` | `ServicesPage` después de cada acción, solo en ese navegador | En otras pestañas o usuarios se refresca al volver el foco a la ventana o al remontar la pantalla, si pasaron 30 s. Un cotizador abierto sigue ofreciendo precios viejos hasta entonces |
| `["logistica", "compras", "base", id]` | Solo `handleServiceFormSuccess` (editar o crear desde el formulario) | 5 minutos para todos los demás. Activar, desactivar, borrar o renombrar una categoría no la invalidan |
| `["recipeCosts"]`, `["fixedCosts"]` | `ServicesPage.loadRecipeCosts`, al cerrar o guardar el formulario | — |
| `["fixedSections"]` | `FixedServicesBySection.invalidate` | Por defecto, 30 s en el cotizador y en `ServiciosTab` |
| Secciones de categoría | **Nadie**: no están en React Query | `QuotationForm`, `ServiciosTab` y `VariableServicesByCategory` las piden solo al montarse; `QuotationViewer` y `FichaCocinaSection` piden `menu-order` al montarse. Una estrella cambiada no llega a un cotizador abierto hasta recargar la página |
| `["serviceGroups"]` | `useServiceGroups` (`saveGroup`, `renameGroup`, `removeGroup`) | — |
| `["serviceGroupCollections"]` | `useServiceGroupCollections`, pero **no** al borrar un menú | El paquete sigue trayendo el menú borrado desde la caché hasta que se refresque |
| `["usedServiceCodes"]` | **Nadie** | Un servicio recién cotizado puede verse con el basurero encendido hasta que la consulta se refresque. El motor igual bloquea el borrado |

**Colaterales en otros módulos** (detalle en la sección 7):
- Menús que dejan de aparecer tras renombrar su categoría.
- Avisos falsos de "sin receta" tras renombrar servicios "sin costo".
- Costos que bajan en cotizaciones con códigos legados tras renombrar un servicio.
- El documento de eventos viejos se reagrupa con la carta de hoy.
- El top 10 de servicios del panel se parte en dos nombres.

## 6. Reglas de negocio que gobiernan el flujo

1. **La cotización es una foto y el catálogo no la reescribe.** La migración 4 lo dice así: "already-created quotations keep displaying them normally (the frontend keeps the full catalog and only filters the picker)". La migración 21 retiró "variable_con_limites" del catálogo, y las 81 cotizaciones históricas "NO se tocan". En el código: `loadExistingItemsFromJSON` y `computeMoney`.
   - **Excepción conocida, registrada solo en git:** el 22-07 una migración de datos a mano "remapped dead service ids and refreshed stored names in the 56 live quotations (backup table quotations_items_backup_22_07)" (commit f6b2b31). No está en `docs/migrations`.
2. **El precio de un fijo se resuelve al agregarlo y queda en la foto** (FASE 1.2, 27-07). Evidencia: comentario de `resolveFixedServicePrice` y `useServices.calculateFixedServicePrice`. Un paquete trae el precio de HOY: "precio y categoría de HOY, no la foto del paquete" (`paqueteFijos.ts`).
3. **Un servicio ocupado no se borra, se desactiva** (13-08: "La regla que Felipe daba por existente y nunca estuvo"). Ocupado significa que aparece en alguna cotización (por cualquiera de las dos llaves) o en algún menú; en el fijo, solo en cotizaciones. Evidencia: `ServicesService.removeVariableService` y `removeFixedService`.
4. **Las dos llaves** (13-08). Las cotizaciones nuevas guardan el id y las viejas el `code`: "de 424 referencias vivas, 120 calzan por id y 42 por código". Se consultan ambas y manda la mayor. Evidencia: `ServicesRepository.clavesDeServicio`, commit 17ce549.
5. **Basurero apagado para lo cotizado** (30-07, "regla de Felipe"). Evidencia: migración 54, `servicioEnUso`.
6. **La casilla apunta a la categoría por id** (06-08, Felipe: "no es al nombre donde debe apuntar sino al código de la categoría, así no importa cómo la llame"). Evidencia: `categoriaCaja.ts`, `buildItemsSnapshot` en `QuotationForm` y `ServiciosTab`, `includesOf`.
7. **El menú se guarda con el nombre vigente de su categoría**: "guardado con el viejo, el menú no aparecería nunca en su propia caja". Evidencia: `QuotationForm.confirmSaveGroup`.
8. **Lo guardado se muestra aunque ya no esté en el catálogo, pero nunca un id crudo** (revisión del 16-08: "un proveedor desactivado aparecía como '7'"). Evidencia: `valorSePuedeMostrar`, `SelectWithSearch`.
9. **La categoría desactivada se esconde, salvo la ya elegida**: "si no, una cotización vieja perdería su categoría" (`QuotationForm`); "un evento viejo perdería su categoría al abrirlo" (`ServiciosTab`). Un servicio desactivado sale de los agregadores y de la siembra de la sección fija (`defaultServicesFor`).
10. **Nombre canónico para emparejar fotos viejas con el catálogo** (22-07): "sin tildes ni mayúsculas, sin el prefijo de orden ('02 - '), espacios colapsados y '1pp' ≡ '1 pp'". Evidencia: `canonicalServiceName`.
11. **"Sin costo en Eventia"** (03-08, migración 57): Ticket diario, alojamientos y Exclusividad cuentan $0 real. El filtro quedó igual en todas las pantallas el 09-09 (#516): "Mismo filtro, misma verdad en las dos casas". Evidencia: `QuotationForm.margenCotizador`, `ServiciosTab`, `GestionTab`.
12. **Un variable pertenece al menos a una categoría, y no se borra una categoría que deja servicios huérfanos.** Evidencia: `ServicesService.setServiceCategories`, `deleteCategoryForCompany`.
13. **La sección vive en el vínculo, y borrar una sección no borra servicios.** Evidencia: migración 24 ("un servicio multicategoría puede ser 'Bebidas' en Almuerzos y 'Refrescos' en Coffee"), migración 53 y comentario de `ServicesService.deleteFixedSectionById`.
14. **Sección fija: a lo más una por categoría, entra sola y con candado, y se quita solo en esta cotización** (Felipe, 09-09: el 99 % de las veces debe quedarse; CCU #408 fue el 1 %). La siembra ocurre solo al elegir la categoría: "lo guardado no se toca al cargar" (`ServiciosTab.setGroupCategory`). Evidencia: migración 25, `FijoDeCategoria`.
15. **Un fijo del paquete que salió del catálogo se salta: "nunca se inventa un precio"** (28-08). Evidencia: `fijosDelPaquete`, `paqueteFijos.test.ts`.
16. **Menús con nombre único por empresa, que se renombran pero no se editan por dentro** (05-08, caso "Desayuno de campo"; 09-09, el lápiz). Evidencia: `ServiceGroupsService.create` y `rename`, `ServiceGroupsController`.
17. **Un evento realizado queda congelado** (13-08). Evidencia: `esEventoCongelado` en `ServiciosTab`; `QuotationsService.update` (flujo 02).
18. **Solo el administrador cambia el catálogo; menús y paquetes, del vendedor para arriba. El orden de la carta lo lee también recepción** (12-08). Evidencia: `@Roles(...ADMIN_ONLY)` en `ServicesController` y `SectionsController`, `@Roles(...SALES_AND_UP)` en los controllers de menús y paquetes, `@Roles(...RECEPTION_AND_UP)` en `SectionsController.findAll` y `menuOrder`.

## 7. Si cambias algo en este flujo

1. **Si cambias** lo que se guarda bajo `codigo` en `quotations.items`, o las consultas de uso (`clavesDeServicio`, `variableServiceUsage`, `fixedServiceUsage`, RPC `used_service_codes`, `servicioEnUso`), **pasa** que se pueden borrar servicios que sí están en cotizaciones, o se apaga el basurero de servicios libres, **porque** conviven dos llaves: el id en las cotizaciones nuevas y el `code` en las viejas. **Incidente del 13-08:** 42 servicios eran borrables ("Sillas Chivari", "Arco de Flores", "Exclusividad Full") y "Bollería variedades" tenía el basurero encendido estando en 28 cotizaciones. Evidencia: commit 17ce549, `uso-de-servicios.spec.ts`.
2. **Si cambias** `canonicalServiceName`, `mapNameIds` (o su gemela `getCatalogServiceNameIds`), `resolveId` o `FichaCocinaSection.resolveVarId`, **pasa** que las cotizaciones viejas dejan de encontrar su receta: bajan sin aviso el costo, la lista de compra y la ficha de cocina, **porque** los ítems con código legado se resuelven comparando el nombre de la foto con el nombre vigente. **Incidente del 22-07:** después de la limpieza de nombres (migración 23, sin los prefijos "02 - "), Gestión, la ficha de cocina, Compras y el radar dejaron de reconocer recetas. Evidencia: commit f6b2b31; en `logistics.service.ts`, "si cambias una, cambia la otra".
3. **Si vuelves** a buscar la categoría de una casilla solo por nombre (en `QuotationForm`, `ServiciosTab` o `quotationPrintDoc`), **pasa** que al renombrar una categoría las cotizaciones guardadas quedan sin secciones en el documento y con el buscador de ítems vacío al editarlas, **porque** el texto `category` de la foto no se actualiza. **Incidente y diseño del 06-08.** Y **si quitas** el respaldo `?? box.selectedCategoryId` de `buildItemsSnapshot`, **pasa** que una caída del catálogo borra el id guardado, **porque** `catDeCaja` devuelve `undefined` sin catálogo ("el id guardado ya no se borra si el catálogo no resuelve", commit b61ac5d). Evidencia: `categoriaCaja.ts`.
4. **Si renombras** una categoría que tiene menús guardados, **pasa** que esos menús dejan de ofrecerse en las casillas de su categoría. Si se aplican igual (desde un paquete o desde Post-Venta), no traen la sección fija y quedan con `category_id` nulo, **porque** `service_groups.category` es texto que `renameOrUpdateCategory` no toca, y `boxGroups`, `defaultServicesFor`, `loadCollectionAsBoxes` y `addGroupDesdeMenu` lo comparan con el nombre vigente. El 06-08 ya se pilló que "el guardado de menús usaba el nombre VIEJO" (commit b61ac5d), pero se arregló el guardado nuevo, no los menús que ya existían. Verificado leyendo el código, no probado en pantalla.
5. **Si renombras** un servicio variable marcado "sin costo", **pasa** que vuelve a aparecer como "sin receta" en Gestión, en la pestaña Servicios y en el margen del cotizador de todas las cotizaciones guardadas antes del cambio, **porque** `acc.noRecipe` guarda el nombre de la foto y el filtro lo compara con `sinCostoVariable`, que tiene los nombres canónicos **actuales**. Es el mismo aviso falso que se limpió en la #470 y el 09-09 (#516, "Ticket Diario", commit 07ccb1b). El comentario de `getCatalogServiceNameIds` ("aunque el catálogo haya sido renombrado") solo cubre tildes, espacios, prefijos y "1pp", no un nombre distinto.
6. **Si renombras** un servicio que alguna cotización guardó con su `code` legado, **pasa** que ese evento pierde su receta (costo de insumos en 0, "sin receta", ficha de cocina sin gramajes), **porque** `resolveId` solo puede encontrarlo por nombre canónico. Con `codigo` = id no pasa. Evidencia: `resolveId`, `resolveVarId`; mapa 05, R3.
7. **Si haces** que el cotizador o Post-Venta recalculen precios o nombres desde el catálogo al abrir una cotización, **pasa** que cambia el total de cotizaciones ya enviadas o aceptadas y, al guardar una aceptada, el motor reajusta solo el plan de pagos (achica cuotas o crea reembolsos), **porque** `QuotationsService.update` rehace el plan cuando cambia `total_amount` ("Pago creado por diferencia de total_amount"). La foto es el precio pactado. Evidencia: `loadExistingItemsFromJSON`, `computeMoney`, migración 4, flujo 05.
8. **Si cambias** `valorSePuedeMostrar` o la excepción "salvo la ya elegida" de los selectores de categoría, **pasa** que una cotización vieja parece haber perdido su categoría o, al revés, vuelven a verse ids crudos ("7", un UUID), **porque** `SelectWithSearch` muestra el valor guardado solo cuando es un nombre. **Incidente del 16-08.** Evidencia: `valorSePuedeMostrar.test.ts`, filtros con `inactiveCategorySet`.
9. **Si endureces** los permisos de `GET /sections` o `GET /sections/menu-order`, **pasa** que el visor y el PDF salen con el "Incluye:" en una línea corrida, **porque** `getCategorySections` y `getMenuOrder` tragan el error y devuelven listas vacías. **Incidente del 12-08** con recepción. Evidencia: comentario en `SectionsController`, `frontend/src/services/sections.service.ts`.
10. **Si exiges** `calculation_type` al validar `PATCH /services/fixed/:id`, **pasa** que deja de funcionar el ojo de activar y desactivar fijos, **porque** `handleToggleActive` manda solo `{ is_active }`, y hoy pasa porque `validateFixedServices` no entra a ninguna rama sin tipo. Evidencia: `UpdateFixedServiceDto` (`PartialType`).
11. **Si borras** un servicio que solo vive en un paquete, o un fijo con líneas de costo, **pasa** que desaparece del paquete y de su ficha de costos sin aviso, **porque** `variableServiceUsage` mira cotizaciones y menús, `fixedServiceUsage` solo cotizaciones, y la base borra en cascada (migraciones 67, 100 y 13). La receta de un variable no se borra: queda huérfana (migración 11, sin FK). Eso contradice el comentario de `removeVariableService`: "le arrancaba en cascada su receta".
12. **Si agregas** un filtro `is_active` a menús y paquetes, **pasa** que llegan incompletos los que contienen un servicio apagado (hoy lo traen igual), **porque** `buildBoxFromGroup`, los sueltos de `loadCollectionAsBoxes`, `addGroupDesdeMenu` y `fijosDelPaquete` no filtran, mientras la sección fija sí. Es una decisión pendiente, no un error confirmado (pregunta 3).
13. **En producción, hoy: si tocas** `ServicesRepository.updateVariableService`, `updateFixedService`, `getLinksForService`, `deleteServiceCategoryLink`, `ServiceGroupsRepository.removeGroup` o `ServiceGroupCollectionsRepository.removeCollection`, **pasa** que sigue abierta la puerta para cambiar o borrar datos de otra empresa por id, **porque** filtran solo por `id` y Supabase corre con la llave service-role (CLAUDE.md). Es el mismo tipo de hoyo que se cerró el 13-08 en `DELETE /services/*`. Evidencia: esos métodos; mapa 05, R5 y R9.
    - **Cerrado en la rama pruebas** (commit 8266ba1, sprint 1 de aislamiento entre empresas, 11-09-2026, **todavía no en producción**): los seis métodos reciben `companyId` y filtran por él; `updateVariableService`/`updateFixedService`/`removeGroup`/`removeCollection` además devuelven con `.select('id')` la fila tocada, y sus services tiran 404 si viene vacía — un servicio, menú o paquete ajeno ya no se puede tocar ni borrar probando números. `ServicesController.updateFixedService`, `ServiceGroupsController.remove` y `ServiceGroupCollectionsController.remove` ahora reciben `@CurrentUser()`. Además, crear un menú (`ServiceGroupsService.create`) o un paquete (`ServiceGroupCollectionsService.create`) ahora exige que cada servicio, menú o fijo referenciado sea del catálogo de la empresa. Pruebas: `services/tests/aislamiento-catalogo.spec.ts`, `service-group-collections/tests/aislamiento-paquetes.spec.ts`, casos nuevos en `service-groups/tests/service-groups.service.spec.ts`.
    - **Sigue sin revisar `error`:** varios de estos métodos devuelven la respuesta cruda de Supabase y una falla de la base puede llegar como 200; ese punto no se tocó en el sprint 1. Y `ServicesRepository.updateLinkSortOrder` sigue sin `companyId` en ambos lados, pero no tiene llamadas (código muerto, mapa 05 sección 10).
14. **Si arreglas** algo del catálogo en `QuotationForm`, **pasa** que `ServiciosTab` queda distinto (y al revés), **porque** `catDeCaja`, `nomCat`, `defaultServiceIdsFor`, `isLockedService`, `defaultServicesFor`, `fixedOrderOf`, `fixedSectionNameOf`, `opcionesDe` y `buildItemsSnapshot` están copiados ("calco del cotizador"). Los dos archivos están congelados por tamaño en `frontend/scripts/portero-kit-de-la-casa.sh`: extrae piezas.
15. **Si renombras** un servicio, **pasa** que el top 10 de servicios del panel lo cuenta dos veces, con el nombre viejo en cotizaciones antiguas y el nuevo en las nuevas, **porque** `get_variable_services_usage` y `get_fixed_services_usage` agrupan por `item->>'nombre'`. Evidencia: `db_functions_analytics_23_07.sql`.

## 8. Casos borde y estados raros

- **Autoguardado a medias:** si el `PATCH /services/variable/:id` funciona y el de categorías falla, quedan el nombre y el precio nuevos con las categorías viejas. El modal marca "error" y nada se revierte.
- **Servicio sin categorías por una falla:** `linkServiceToCategories` borra antes de agregar y sin transacción. Si se cambia la única categoría y la inserción falla, el servicio queda sin vínculos y desaparece de `products` (`buildProductsFromLinks` solo recorre vínculos cuando la empresa tiene alguno), de la carta y del cotizador, aunque siga en `variable_services`.
- **Dos administradores sobre el mismo servicio:** gana la última escritura. No hay control de versión y el autoguardado de uno puede pisar al otro sin aviso.
- **Vendedor con el cotizador abierto mientras cambia un precio:** sigue viendo `products` de su caché hasta recuperar el foco o remontar la pantalla. Lo que agregue antes queda con el precio viejo, y el motor lo acepta: `assertMoneyMatches` compara contra la foto, no contra el catálogo. Las secciones y la estrella de la sección fija no se refrescan hasta recargar la página.
- **Renombrar una categoría a un nombre ya usado:** la base lo rechaza (UNIQUE `company_id, name`), `renameOrUpdateCategory` ignora el error y responde 200, la pantalla recarga y el nombre queda igual, sin mensaje. La restricción distingue mayúsculas.
- **Borrar un menú con un paquete que lo usa:** la cascada lo saca del paquete, pero `["serviceGroupCollections"]` no se invalida. Si el paquete se aplica en los siguientes segundos, todavía trae el menú desde la caché.
- **Paquete con un fijo desactivado:** entra igual, porque `fijosDelPaquete` no mira `is_active`. Con un fijo borrado, la cascada ya lo sacó y además `fijosDelPaquete` lo salta.
- **Sueltos de un paquete con categoría legada:** si el servicio cambió de categorías o su primera categoría se renombró, la casilla nace con un nombre que no calza. `nomCat` devuelve el texto, no hay ítems para agregar ni sección fija, y se guarda con `category_id` nulo.
- **Ítem con código legado en una cotización vieja:** si se agrega el mismo servicio desde el agregador, entra como fila nueva, porque el `codigo` nuevo es el id y no calza con el viejo, en vez de sumar cantidad. El documento lo deja sin sección.
- **Código legado numérico** ("10"): `resolveId` y `resolveVarId` lo prueban primero como id. Si existe una receta de otro servicio con id 10, el evento se costea con la receta equivocada. No medido con datos (mapa 05, R1).
- **Dos servicios con el mismo nombre canónico:** la migración 0 no tiene UNIQUE de nombre en `variable_services` ni en `fixed_services`. `mapNameIds` se queda con el último, así que un ítem viejo resuelto por nombre puede tomar la receta del otro.
- **Variables guardadas al nivel superior (formato antiguo):** `used_service_codes` las cuenta y apaga el basurero, pero `variableServiceUsage` solo mira ítems anidados. Por API directa se podría borrar ese servicio.
- **Sección fija borrada o cambiada:** las cotizaciones guardadas no reciben ítems nuevos. Al editarlas, el candado se recalcula con la sección de hoy: un ítem antes bloqueado queda removible y uno de la nueva sección queda con candado.
- **Categoría borrada:** la casilla de una cotización vieja conserva el texto y el selector lo muestra, pero no ofrece ítems y el documento sale como lista plana.
- **Evento realizado:** no se puede editar, pero el documento y los costos estimados se siguen armando con la carta y los nombres de hoy. El agrupado del "Incluye:" y la lista de "sin receta" pueden cambiar en un evento cerrado aunque su foto no cambie. Dashboard usa `provisioned_cost` cuando existe.
- **Tildes en el documento:** `quotationPrintDoc` normaliza sin quitar tildes y `categoriaCaja` sí las quita. Una foto sin `category_id` cuya categoría solo cambió una tilde calza en el cotizador pero sale plana en el documento.
- **Catálogo caído al editar:** `useServices` falla, `buscarCategoria` no resuelve y `buildItemsSnapshot` conserva el `category_id` guardado. Si las secciones fallan, las pantallas y el documento las muestran planas sin aviso.
- **Importación por Excel:** `ServicesService.createServicesBulk` inserta variables solo con el texto `category`, sin vínculos, así que no aparecen en la carta ni en el cotizador (mapa 05, R8).

## 9. Pruebas que protegen el flujo y huecos

| Archivo | Qué cubre | Corre en CI |
|---|---|---|
| `api-rest/src/services/tests/uso-de-servicios.spec.ts` | Las dos llaves del candado: variable por id, por código, ambas consultadas, manda la mayor, sin código, servicio libre en cero; fijo por código ("Sillas Chivari"), por id y ambas (9 pruebas) | Sí, job `backend`: `npx jest --silent` |
| `api-rest/src/service-groups/tests/service-groups.service.spec.ts` | `ServiceGroupsService.rename`: recorta y pasa la empresa, 409 en castellano, 404 si es ajeno (3 pruebas). Sprint 1 (11-09-2026) agregó `remove` (pasa la empresa, 404 si es ajeno) y `create` (acepta servicios propios, rechaza uno ajeno): 4 pruebas más, 7 en total | Sí, en la rama pruebas; las 4 nuevas no corren en la CI de `main` hasta el merge |
| `api-rest/src/services/tests/aislamiento-catalogo.spec.ts` (rama pruebas, sprint 1, 11-09-2026) | El candado de empresa de `updateFixedService`/`updateVariableService`: pasa la empresa, 404 si es ajeno, no toca categorías de un servicio ajeno (4 pruebas) | Sí, en la rama pruebas; no está en la CI de `main` hasta el merge |
| `api-rest/src/service-group-collections/tests/aislamiento-paquetes.spec.ts` (rama pruebas, sprint 1, 11-09-2026) | El candado de empresa de los paquetes: borrar pasa la empresa y 404 si es ajeno; crear exige que menús, sueltos y fijos sean del catálogo propio (4 pruebas) | Sí, en la rama pruebas; no está en la CI de `main` hasta el merge |
| `api-rest/src/quotations/tests/unit/money.spec.ts` | La cuenta sobre la foto (`computeMoney`), dueño flujo 02. No revisé sus 18 casos uno a uno | Sí |
| `api-rest/src/quotations/tests/unit/envio-cotizacion.service.spec.ts` | Simula `cartaDelCatalogo` devolviendo `null`; no prueba el agrupado | Sí |
| `frontend/src/pages/quotations/paqueteFijos.test.ts` | `fijosDelPaquete`: precio de HOY, fijo fuera del catálogo se salta, paquete sin fijos (3 pruebas) | Sí, job de frontend: "Pruebas (vitest)" |
| `frontend/src/components/selects/valorSePuedeMostrar.test.ts` | Un nombre fuera del catálogo se muestra; un id numérico o un UUID, no (5 pruebas) | Sí |

**Huecos, de mayor a menor riesgo:**
- `canonicalServiceName`, `mapNameIds`, `resolveId` y `resolveVarId`: el corazón del incidente del 22-07, sin ninguna prueba.
- `buscarCategoria` y `nombreVigente` (`categoriaCaja.ts`), y el respaldo de `category_id` en `buildItemsSnapshot`.
- El filtro "sin costo" por nombre y su falla al renombrar (sección 7, punto 5).
- `includesOf` de `quotationPrintDoc` con categoría renombrada, código legado o sección borrada.
- `boxGroups`, `buildBoxFromGroup` y `loadCollectionAsBoxes` con categoría renombrada o servicios inactivos.
- `linkServiceToCategories` (borra antes de agregar), `renameOrUpdateCategory` (error ignorado), `deleteCategoryForCompany` (409 de huérfanos).
- `SectionsRepository` completo: sección fija única, `setLinkSection`, borrado con `SET NULL`.
- `validateFixedServices` con un parche parcial (`{ is_active }`).
- Aislamiento por empresa de `updateVariableService`, `updateFixedService`, `removeGroup` y `removeCollection`: cubierto por pruebas nuevas **en la rama pruebas** desde el sprint 1 (11-09-2026); ese código, y esas pruebas, todavía no corren en producción.
- La RPC `used_service_codes` contra `variableServiceUsage` (formato antiguo al nivel superior).
- Las funciones de estadística agrupadas por nombre.

## 10. Preguntas abiertas

1. La migración de datos del 22-07 (commit f6b2b31) reescribió `items` de 56 cotizaciones con respaldo en `quotations_items_backup_22_07`, pero no está en `docs/migrations`. ¿Sigue existiendo esa tabla de respaldo? ¿Fue la única vez que se reescribió la foto?
2. ¿Qué debe pasar con los menús guardados al renombrar su categoría? ¿Conviene guardar `category_id` en `service_groups`, como se hizo con las casillas el 06-08?
3. ¿Desactivar un servicio, variable o fijo, debería sacarlo de los menús y paquetes al aplicarlos, como ya hace la sección fija?
4. ¿Debería bloquearse borrar un servicio que solo vive en un paquete, o un fijo con ficha de costos?
5. ¿El filtro "sin costo" de variables debería ir por id, como el de fijos, para que renombrar no reviva el "sin receta"?
6. ¿El top 10 de servicios del panel debería agruparse por `codigo` en vez de por nombre?
7. ¿Cuántas cotizaciones tienen códigos legados numéricos, variables en formato al nivel superior o nombres canónicos repetidos en el catálogo? Hay que medirlo con datos.
8. ¿`renameOrUpdateCategory` debería avisar el choque de nombre con un 409, como los menús?
9. **Contradicción documento–código:** CLAUDE.md dice "There is no frontend test suite", y el mapa 05 (sección 9) repite "La app no tiene pruebas". **Código:** `frontend/package.json` tiene `"test": "vitest run"`, `.github/workflows/ci.yml` corre "Pruebas (vitest)" y existen archivos `*.test.ts` en `frontend/src`, entre ellos `paqueteFijos.test.ts` y `valorSePuedeMostrar.test.ts`.
10. **Contradicción dentro del atlas:** el mapa 05 (tabla "Qué pasa con lo ya guardado" y pregunta 11) dice que no encontró en `ServiciosTab` el filtro de categorías inactivas. **Código:** `ServiciosTab` filtra con `!inactiveCategorySet.has(c) || c === g.category`, igual que el cotizador.
11. **Contradicción comentario–código:** la cabecera de `api-rest/src/services/sections.controller.ts` dice "Lecturas para vendedor+". **Código:** `findAll` y `menuOrder` llevan `@Roles(...RECEPTION_AND_UP)` desde el 12-08.
12. ¿`["usedServiceCodes"]` debería refrescarse al guardar cotizaciones, y `["serviceGroupCollections"]` al borrar un menú?
