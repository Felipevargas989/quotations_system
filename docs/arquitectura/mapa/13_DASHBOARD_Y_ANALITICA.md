# Mapa: Dashboard y analítica

> **Estado: verificado una vez contra el código** (commit 0de0ddb, 11-09-2026). Falta la etapa de completar lo que no quedó escrito. Parte del atlas de docs/arquitectura/mapa; el índice es 00_MAPA_DEL_SISTEMA.md.

## 1. Qué hace

Es la pantalla con la que el administrador abre el sistema: al iniciar sesión, `LoginPage` lo lleva a `/dashboard`; los demás cargos van a `/requests`. El Dashboard **no crea nada del negocio**. Lee cotizaciones, cuotas, abonos, costos de logística y nómina, y los convierte en cifras. Tiene seis bloques:

- **"Para actuar hoy"**: plata por cobrar, eventos próximos, requerimientos y enviadas sin respuesta. No obedece al período.
- **Barra de período con 5 KPIs**: ventas, eventos, conversión, ticket y margen.
- **Cuatro gráficos de tendencia contra el año anterior**. Al pinchar una barra se abre **la cosecha del mes**, la lista de llamados de un año después. Es lo único que el Dashboard escribe.
- **Ingresos y Caja por Mes**, partido en **Resultado** (por fecha del evento) y **Caja** (por fecha del movimiento).
- **Pipeline de Negocio**.
- **Cuatro secciones plegables de análisis**: comercial, clientes, servicios y proveedores.

La antigua pantalla Analytics se fusionó al Dashboard el 23-07 y `/analytics` redirige. El motor no tiene reloj propio: el "análisis semanal" se eliminó el 31-07 porque filtraba correos entre empresas.

## 2. Pantallas y rutas de la app

| Ruta de la app | Componente principal | Archivo | Qué hace el usuario ahí | Rol que la ve |
|---|---|---|---|---|
| `/dashboard` | `DashboardPage` | `frontend/src/pages/dashboard/DashboardPage.tsx` | Mira la fila HOY y pincha para ir a Post-Venta, Calendario, Requerimientos o Cotizaciones. Elige período (chips o fechas libres), lee KPIs, tendencias, pipeline y análisis; recarga con ↻ | administrador (`SECTION_ROLES.dashboard = ADMIN_ONLY`, `PermissionGuard` en `App.tsx`; ítem "Dashboard" en `Sidebar.tsx` con `precargar`) |
| `/dashboard`, al pinchar una barra de Cotizaciones o Eventos por Mes | bloque "cosecha" dentro de `DashboardPage` + `tendencias.ts` | `frontend/src/pages/dashboard/tendencias.ts` | Ve quién cotizó (o qué eventos hubo) ese mes y el mismo mes del año anterior. Filtra por tipo de evento, tipo de cliente y estado; ordena por cliente o monto; corrige el estado "¿Volvió a pedirlo?" con `SectionChipSelect`; abre `/negocio/:id` en otra pestaña | administrador |
| `/dashboard`, panel "Ingresos y Caja por Mes" | `IngresosYCaja` | `frontend/src/pages/dashboard/IngresosYCaja.tsx` | Tabla de 12 columnas (meses) con Resultado y Caja; al pasar el mouse por una cifra, `Tooltip` muestra de qué clientes o personas se compone | administrador |
| `/dashboard`, sección "Análisis" | 9 tablas de `pages/analytics/components/*` + "Por qué perdimos" + análisis de proveedores (inline) | `frontend/src/pages/analytics/components/*.tsx` | Lee tablas de estados, conversión, ingresos, top clientes, recurrentes, servicios más usados y proveedores | administrador |
| `/dashboard`, guía de cuenta nueva | `NewAccount` | `frontend/src/pages/dashboard/components/NewAccount.tsx` | Checklist de bienvenida (servicios, clientes, cotizaciones, logo). Una vez configurada la cuenta se recuerda en `localStorage` (`eventia_cuenta_configurada_<id>`) | administrador (`userRole === ADMINISTRADOR`) |
| `/analytics` | `<Navigate to="/dashboard" replace />` | `frontend/src/App.tsx` | Ruta vieja: redirige "para no romper marcadores" | — |
| (sin ruta) | `Analytics` | `frontend/src/pages/analytics/index.tsx` | **Código muerto**: nadie lo importa desde el 23-07 | — |

## 3. Endpoints del motor

| Método y ruta | Controller y método | Service | Quién lo llama desde la app | Roles o @Public |
|---|---|---|---|---|
| `GET /analytics/dashboard?start_date=&end_date=` (`GetDashboardStatsDto`, fechas opcionales) | `AnalyticsController.getDashboardStats` | `AnalyticsService.getDashboardStats` | `getDashboardStats` (`frontend/src/services/analytics.service.ts`) ← `DashboardPage.dashboardQuery` | `@Roles(...ADMIN_ONLY)` en la clase |
| `GET /analytics/complete?start_date=&end_date=` (`GetCompleteStatsDto`) | `AnalyticsController.getCompleteStats` | `AnalyticsService.getCompleteStats` (9 funciones SQL por `supabase.client.rpc`) | `getCompleteStats` ← `DashboardPage.statsQuery` (y el `Analytics` muerto) | `ADMIN_ONLY` |
| `GET /analytics/hoy` | `HoyController.alerts` | sin service: `HoyRepository.alerts` + función pura `sumarPorCobrar`, todo en `hoy.controller.ts` | `getHoyAlerts` (`frontend/src/services/hoy.service.ts`) ← `DashboardPage.hoyQuery` | `ADMIN_ONLY` |

Endpoints de **otros módulos** que el Dashboard consume (se documentan en su mapa):

| Método y ruta | Controller → service | Llamada de la app (queryKey) | Mapa |
|---|---|---|---|
| `GET /quotations?request_type=cotizacion` | `QuotationsController.findAll` → `QuotationsService.findAll` | `getQuotations` ← `tendenciaQuery` `["dashboard-tendencia", companyId]`; con `statuses=rechazada,cancelada` ← `perdidasQuery` `["dashboard-motivos", companyId, selectedTimeRange]` | 01 / 02 |
| `POST /quotations/:id/cosecha` (`EstadoCosechaDto`) | `QuotationsController.setHarvestStatus` → `QuotationsService.setHarvestStatus` | `guardarEstadoCosecha` ← `estadoMut` (mutationKey `["cosecha"]`); sin `@Roles` en la ruta | 02 |
| `GET /portal-receipts` | `PortalReceiptsController.list` → `PortalReceiptsRepository.listPending` | `listPortalReceipts` ← `receiptsQuery` `["postventa","comprobantes"]` | 03 |
| `GET /logistics/base-catalogo` | `LogisticsController.baseCatalogo` | `getBaseCatalogo` ← `marginBaseQuery` `["logistica","compras","base", companyId]` (caché compartida con Compras y el cotizador) | 06 |
| `GET /logistics/purchasing/won-events?from=` | `wonEvents` → `LogisticsRepository.findWonEventsSince` | `getWonEventsSince` ← `wonEventsQuery` | 06 |
| `GET /logistics/purchasing/supply-provisions`, `GET /logistics/resources`, `GET /logistics/event-resources` | `supplyProvisions`, `findAllResources`, `eventResources` | `getEventSupplyProvisions`, `getManagementResources`, `getAllEventResources` ← `provQuery` | 06 |
| `GET /people/costo-personal` | `PeopleController.costoPersonal` → `PeopleRepository.costoPersonalPorEvento` | `getCostoPersonal` ← `costoPersonalQuery` | 07 / 08 |
| `GET /people/pagado-por-mes` | `PeopleController.pagadoPorMes` → `PeopleRepository.pagadoDePersonalPorMes` → `utils/pagado-por-mes.ts` | `getPagadoPersonalPorMes` ← `pagadoPersonalQuery` | 08 |

**Relojes**: ninguno. `AnalyticsCronService` (`analyitics-cront.service.ts`, viernes 12:00 UTC) se borró en el commit 51948d6 del 31-07 (ver §6 y §8). En la app, solo `hoyQuery` se refresca solo cada 5 minutos (`refetchInterval`).

## 4. Tablas de la base de datos

| Tabla | Qué guarda | Lee o escribe | Migración que la crea o modifica |
|---|---|---|---|
| `quotations` | Base de casi todo: `created_at`, `updated_at`, `event_date`, `quotation_status`, `request_type`, `total_amount`, `subtotal_amount`, `fixed_value`, `tip_percentage`, `tip_amount`, `people_count`, `event_type`, `items` (JSON, lo leen las funciones de servicios), `provisioned_at`, `provisioned_cost`, `loss_reason`, `harvest_status`, `recontacted_at`, `recontacted_by`, `contact_name` | lee `AnalyticsService` (vía `QuotationsRepository.findAll` con `COLUMNAS_LISTA`), `HoyRepository`, funciones RPC, `findWonEventsSince`. **Escribe** solo `harvest_status`, `recontacted_at` y `recontacted_by` (`setHarvestStatus`) | foto en `0_initial_models.sql`; `15_provisioning.sql`; `32_children_and_tip.sql`; `33_quotation_contact_name.sql` (agrega `contact_name`); `37_tip_amount.sql`; `61_motivo_perdida.sql`; `62_recontacto.sql`; `63_estado_cosecha.sql`; CHECK en `64_estado_cosecha_check.sql`; índice `idx_quotations_company_type_status` en `66_indices_de_consultas_calientes.sql` |
| `clients` | `name`, `client_type` (joins de las RPC, globos, filtros de la cosecha) y el conteo `totalClients` | lee (`ClientsService.findAll`, joins) | foto inicial; índice `idx_clients_company` en `66_...`; mapa 09 |
| `client_contacts` | Nombre del mandante embebido en la lista | lee | mapa 09 |
| `payments` | Cuotas: `amount`, `status`, `due_date`, `paid_date` (legado) | lee `PaymentsRepository.findAllPaymentsFromQuotation` (con `quotations(company_id, quotation_number, clients(name))`) y `HoyRepository.alerts` (con `quotations!inner`) | foto inicial; `idx_payments_quotation` en `66_...`; mapa 03 |
| `payment_transactions` | Abonos: `amount`, `transaction_date` | lee (embebida en la consulta de pagos; en HOY, por tandas de 200 `payment_id`) | foto inicial; `idx_payment_transactions_payment` en `66_...` |
| `refunds` | Reembolsos | **no la lee nadie del módulo**. Por eso "Cobrado" no descuenta devoluciones (§8) | mapa 03 |
| `portal_receipts` | Comprobantes del portal pendientes (contador de HOY) | lee | `49_comprobantes_portal.sql` (mapa 03) |
| `event_supply_provisions` | Compra real por insumo (tabla de proveedores) | lee | `16_event_supply_provisions.sql` |
| `event_resources` | Recursos asignados a cada evento | lee | `17_event_resources_and_provision_snapshot.sql` y siguientes (mapa 06) |
| `management_resources` | Definición de recursos (nombre y tipo) | lee | mapa 06 |
| `recipes`, `supplies`, `furniture`, `suppliers` y costos de servicios fijos | La "base" de logística para estimar insumos | lee vía `base-catalogo` | mapa 06 |
| `event_staff` | Las sillas del personal: `amount` por evento y cargo (costo), y `payroll_id`, `tip_payroll_id` y `tip_amount` (pagado) | lee | reformada en `84_las_sillas.sql`; mapas 07 y 08 |
| `payroll_people`, `people` | Qué se marcó pagado (`jornada_paid`, `propina_paid`, `paid_at`) y los nombres | lee `pagadoDePersonalPorMes` | `77_ciclo_propinas_nomina.sql` y mapa 08 |
| Funciones SQL `get_quotation_status_stats`, `get_event_type_conversion_stats`, `get_event_type_revenue_stats`, `get_revenue_by_client_type`, `get_top_clients_by_revenue`, `get_variable_services_usage`, `get_fixed_services_usage`, `get_top_clients_by_quotations`, `get_recurring_clients` | Los 9 cuadros de análisis. Reciben `p_company_id`, `p_from_date`, `p_to_date` | lee (`rpc`) | **no están en `docs/migrations/`**: la única copia versionada es `db_functions_analytics_23_07.sql` en la raíz del repo |

## 5. Flujos principales

### A. Diccionario: de dónde sale cada número que ve Felipe

"Motor" es `AnalyticsService.getDashboardStats` salvo que se diga otra cosa. "Con propina" significa que suma `total_amount` tal cual.

| Número en pantalla | Fórmula | Fuente | Fecha que manda y alcance | ¿Propina? |
|---|---|---|---|---|
| HOY · Comprobantes del portal | cantidad pendiente (la tarjeta solo aparece si es > 0) | `listPortalReceipts` → `portal_receipts` | todos los pendientes | — |
| HOY · Por cobrar y "VENCIDO" | Σ max(0, cuota − abonos). Es vencido si `status = vencido` **o** `due_date` < hoy | `HoyRepository.alerts` + `sumarPorCobrar`: `payments` `pendiente`/`vencido` de cotizaciones no `cancelada` | **todas** las cuotas abiertas de la empresa, sin período | con propina; sin reembolsos |
| HOY · Eventos próximos 30 días | conteo y fecha del primero | `quotations` `aceptada` con `event_date` entre hoy y hoy + 30 (fecha UTC) | — | — |
| HOY · Requerimientos sin responder | conteo y días del más antiguo | `request_type = requerimiento`, `solicitada`, `created_at` | — | — |
| HOY · Enviadas sin respuesta (+7 días) | conteo y días de la más fría | `enviada` con `updated_at` < ahora − 7 días | `updated_at`, **no** `sent_at` | — |
| KPI · Ventas concretadas | Σ `saleWithoutTip` de `aceptada` + `realizada` | `totalQuotationsByStatus` del motor | cotizaciones **creadas** en el período, `request_type = cotizacion` | sin |
| KPI · Eventos concretados "de N cotizadas" | concretadas / `totalQuotations` | ídem | creadas en el período | — |
| KPI · Tasa de conversión y Ticket promedio | concretadas × 100 / cotizadas; ventas / concretadas | `DashboardPage` | creadas en el período | sin |
| KPI · Margen del período ("~" si hay estimación) | Σ Ventas por mes − Σ (costo proveedores + costo personal) | `margenTotales` sobre **todo** `moneyByMonth` + `marginData.byMonth` | eventos con fecha **desde** el inicio del período, sin tope (incluye lo agendado) | sin |
| Tendencia · Cotizaciones por Mes / Cotizado por Mes | conteo / Σ `total_amount` por mes de `created_at` | `getQuotations(COTIZACION)` + `agruparPorMes` + `serieInteranual` | 12 meses + 4 adelante; barra tenue = mismo mes del año anterior; **ignora el período** | Cotizado: **con** propina |
| Tendencia · Eventos por Mes / Vendido por Mes | ídem, solo `aceptada`/`realizada` (`ES_EVENTO`) por mes de `event_date` | ídem | ídem | Vendido: **con** propina |
| Resultado · Eventos y Ventas | `totalQuotationsByEventDate[mes]` (conteo y Σ `saleWithoutTip`) | motor (`concretadas`); el globo de Ventas sale de `marginData.desglose.ventas` (app) | mes de `event_date` | sin |
| Resultado · Costo proveedores | por evento: insumos (`provisioned_cost` si hay `provisioned_at`; si no, receta con `consolidateEvent`) + recursos (`costoDeRecursos`), o `costoFijos` si el evento no tiene ni recursos ni personal | `DashboardPage.marginData` con `base-catalogo`, `won-events`, `event-resources` | mes UTC de `event_date` | — |
| Resultado · Costo personal | Σ `event_staff.amount` del evento | `getCostoPersonal` → `costoPersonalPorEvento` | ídem | — |
| Resultado · Margen y Margen % | Ventas − costos; margen / Ventas | `IngresosYCaja` | ídem | sin |
| Caja · Cobrado | Σ `payments.amount` de cuotas `pagado` | motor, `totalPaymentsDetailByMonth.cobrado` | mes del **último abono** (`fechaDelUltimoAbono`), si no `paid_date`. Cuotas de cotizaciones creadas en el período **o** con evento desde su inicio, sin canceladas | con propina; **sin restar reembolsos** |
| Caja · Pagado proveedores | el mismo costo proveedores del evento | `marginData.salidas` | mes de `provisioned_at`; sin provisión y `realizada`, mes del evento; `aceptada` sin provisión no suma | **estimación**: no existe registro de pagos a proveedores |
| Caja · Pagado personal | jornadas + propinas marcadas pagadas | `getPagadoPersonalPorMes` → `pagadoDePersonalPorMes` | mes de `paid_at` de la nómina | **con** propina, a propósito |
| Caja · Por cobrar | Σ max(0, cuota − abonos) de cuotas no `pagado` | motor, `totalPaymentsDetailByMonth.porCobrar` | mes de `due_date`, mismo alcance que Cobrado | con propina |
| Caja · Flujo de caja | Cobrado − Pagado proveedores − Pagado personal + Por cobrar | `IngresosYCaja.flujoDe` | por mes | — |
| Columna TOTAL | suma de las columnas **visibles** (máximo 12) | `IngresosYCaja.sumar` | no es el total del período si la tabla viene recortada | — |
| Pipeline · Cotizaciones, %, Monto, Ticket por estado y zona | `totalQuotationsByStatus` | motor | creadas en el período | sin |
| Pipeline · Venta viva en juego | Monto `enviada` + `en_negociacion` (sin `solicitada`) | `DashboardPage` | ídem | sin |
| Análisis comercial, de clientes y de servicios (9 tablas) | funciones SQL `get_*`; "venta" = `aceptada` o `realizada` | `getCompleteStats` → `rpc` | `created_at` del período | **con** propina (`SUM(total_amount)`) |
| Por qué perdimos | conteo y Σ `total_amount` por `loss_reason` | `perdidasQuery`: todas las rechazadas y canceladas, filtradas en el navegador | `updated_at` (o `created_at`) desde el inicio del período, **sin fecha final** | con propina |
| Análisis de proveedores (compra estimada, % gasto, top 3, principales insumos, gasto en recursos por tipo) | acumulador de `consolidateEvent` (`newAccumulator`) + `costoDeRecursos` + `costoPersonalPorEvento` | `DashboardPage.proveedores` | eventos concretados desde el inicio del período | — |

### B. Abrir el Dashboard: once consultas, memoria de una hora y frescura

1. `DashboardPage` dispara en paralelo, con React Query:
   - dependen del período: `dashboardQuery`, `statsQuery`, `wonEventsQuery` y `perdidasQuery`;
   - no dependen del período: `receiptsQuery`, `marginBaseQuery`, `tendenciaQuery`, `costoPersonalQuery`, `pagadoPersonalQuery`, `provQuery` y `hoyQuery`.

   Todas usan `placeholderData: keepPreviousData`, así que al cambiar de período se sigue viendo lo anterior mientras llega lo nuevo. El esqueleto propio solo aparece en la primera carga.
2. `getDashboardStats` en el motor:
   - arma la llave `${companyId}:dash:${inicio}:${fin}` y, si está en `cachePanel` (`api-rest/src/cache/memoria.ts`), responde desde la memoria;
   - si no, hace tres lecturas en paralelo: `QuotationsService.findAll` de las **creadas en el período** (los 7 estados), `QuotationsService.findAll` de las **concretadas** (`aceptada`/`realizada` con `eventDateFrom`) y `ClientsService.findAll`;
   - junta los ids sin canceladas y pide `PaymentsService.findAllPaymentsFromQuotation` → `PaymentsRepository.findAllPaymentsFromQuotation` (`.in('quotation_id', ids)`, sin partir en tandas);
   - calcula los contadores, los ejes de meses con `generateMonthRange` (el de eventos y el de pagos se estiran hasta el último evento o vencimiento futuro), cobrado y por cobrar, y agrupa los desgloses por evento (`porEvento`);
   - guarda en memoria por `HORA_MS`.
3. `getCompleteStats` hace lo mismo con la llave `${companyId}:stats:...` y las 9 funciones en paralelo. Si una falla, responde 500 y la sección dice "No se pudieron cargar estas tablas".
4. **Cómo se borra la memoria**: `PanelInvalidationInterceptor` está registrado global (`APP_INTERCEPTOR` en `app.module.ts`). Cuando una petición POST, PATCH o DELETE **con sesión** termina bien, llama `invalidarPanelEmpresa(companyId)`, que borra todas las llaves `${companyId}:`. Regla: *"borrar de más es gratis, mostrar números viejos no"*. Un redeploy también la vacía.
5. **Frescura en la app**: los valores por defecto de `frontend/src/lib/queryClient.ts` son `staleTime` 30 s y `refetchOnWindowFocus: true`. Ninguna pantalla de otro módulo invalida las llaves `dashboard-*` (grep sin resultados fuera de `DashboardPage`). El botón ↻ solo vuelve a pedir `dashboardQuery`.

### C. Armar el panel Ingresos y Caja (mitad motor, mitad navegador)

1. `dashboardQuery.queryFn` une las llaves de mes de `totalQuotationsByEventDate` y `totalPaymentsDetailByMonth`, las ordena y arma `moneyByMonth`: una fila por mes con `eventos`, `ventas`, `cobrado`, `porCobrar`, `cobros` y `deudores`.
2. `marginData` (en el cuerpo del componente, sin `useMemo`):
   - espera `marginBaseQuery`, `provQuery` y `wonEventsQuery`, pero **no** espera `costoPersonalQuery`;
   - arma `buildConsolidationContext`;
   - agrupa las líneas de `event_resources` por evento y calcula `costoDeRecursos`;
   - suma el personal por evento desde `getCostoPersonal`;
   - por cada evento corre `consolidateEvent` y elige insumos congelados o estimados y recursos o `costoFijos`;
   - llena `byMonth` (costo), `salidas` (pagado a proveedores) y `desglose` (globos), con la llave de mes `getUTCFullYear()-getUTCMonth()`.
3. `pagadoPorMes` suma `salidas` y `getPagadoPersonalPorMes`. El motor arma esa última llave con `getFullYear()-getMonth()` en `pagado-por-mes.ts`: *"la misma que usa el panel"*.
4. `data.moneyByMonth.slice(-12)` pasa a `IngresosYCaja` con `recortada` si había más de 12 meses. `IngresosYCaja` pinta Resultado y Caja, pone la columna TOTAL, marca en gris los meses futuros (`·f`) y abre el globo con el desglose ordenado de mayor a menor.

### D. La fila "Para actuar hoy"

1. `hoyQuery` → `getHoyAlerts` → `GET /analytics/hoy` → `HoyRepository.alerts` (sin memoria del panel). Hace cuatro consultas en paralelo: cuotas abiertas con `quotations!inner`, eventos aceptados en 30 días, requerimientos solicitados y enviadas con `updated_at` de hace más de 7 días.
2. Pide los abonos de esas cuotas en tandas de 200 ids (`TANDA`) para no pasarse del largo de URL, y llama `sumarPorCobrar(cuotas, abonadoPorCuota, hoy)`.
3. La app pinta cinco tarjetas; la de comprobantes solo aparece si hay alguno. Al pincharlas navegan a `/post-venta` (o `/post-venta?plata=vencido` si hay plata vencida, y `PostVentaPage` lee el parámetro `plata`, mapa 04), `/calendar`, `/requests` y `/quotations`.
4. Si la llamada falla, `getHoyAlerts` se traga el error y devuelve `VACIO` (todo en cero).

### E. La cosecha del mes y su estado

1. Clic en una barra de "Cotizaciones por Mes" (mirada `cotizado`) o "Eventos por Mes" (mirada `evento`). `alPincharCon` usa `getElementsAtEventForMode` para saber si fue la barra de este año o la tenue, y guarda `mesElegido {base, anterior, mirada}`. Los gráficos de plata no abren nada.
2. `cosecha` (`useMemo`) corre `cosechaDelMes(todas, clave, mirada)` para las dos pestañas de año:
   - la llave es `cliente|mandante|tipo` normalizada; sin cliente o mandante, la fila va sola;
   - si ese cruce pidió algo **después del mes**, sugiere `revendido`; si el tipo es matrimonio, `no_se_repite`; si no, `no_ha_vuelto`;
   - `harvest_status` guardado manda sobre la sugerencia (`efectivo`).

   Después aplica filtros y orden, y cuenta "por llamar" y "en gestión".
3. Cambiar el chip:
   - `estadoMut.onMutate` escribe en la caché `["dashboard-tendencia"]` al instante;
   - `POST /quotations/:id/cosecha` → `QuotationsService.setHarvestStatus` verifica la empresa y, con `QuotationsRepository.update`, guarda `harvest_status` (null = automático), `recontacted_at` = ahora y `recontacted_by` = usuario;
   - el CHECK de la migración 64 rechaza valores fuera de la lista;
   - si falla, se restaura la foto y aparece `toast.error`; cuando no queda nada en vuelo, se invalida la consulta;
   - el POST dispara `PanelInvalidationInterceptor`.
4. Clic en una fila o en "#posterior": `window.open('/negocio/:id')` en otra pestaña (mapa 02).

### F. Las tablas de análisis (funciones SQL)

1. `statsQuery` → `GET /analytics/complete` → `supabase.client.rpc(fn, {p_company_id, p_from_date, p_to_date})` ×9. El aislamiento entre empresas vive **dentro de cada función SQL** (`company_id = p_company_id`), no en un repositorio, y el cliente usa la service-role que se salta RLS.
2. Qué hace el SQL (`db_functions_analytics_23_07.sql`):
   - todas filtran por `created_at` del período;
   - las de ingresos suman `total_amount`;
   - "venta" = `aceptada` o `realizada`;
   - ninguna de las 9 filtra por `request_type` (la columna no aparece en el SQL); las 6 de "venta" quedan protegidas igual porque filtran `quotation_status IN ('aceptada','realizada')`, un estado al que casi ningún requerimiento llega. `get_quotation_status_stats`, `get_event_type_conversion_stats` y `get_top_clients_by_quotations` no tienen ese filtro de estado, así que sí cuentan requerimientos junto con cotizaciones;
   - las de servicios comparan `q.created_at BETWEEN p_from_date AND p_to_date` sin `::date`, y dejan fuera el último día;
   - las de servicios y top clientes cortan en 10 (`LIMIT 10`).
3. Los componentes de `pages/analytics/components/` solo formatean: `formatCurrency`, porcentajes con 2 decimales y `etiquetaEstado`.

## 6. Reglas de negocio acordadas

1. **La propina no es venta ni margen** (24-07, Felipe). Ventas, KPI, pipeline, Resultado y margen usan `saleWithoutTip`. Evidencia: cabecera de `api-rest/src/quotations/utils/tip.ts` (*"Criterio ÚNICO para todo el sistema"*), comentarios "24-07: SIN propina" en `AnalyticsService.getDashboardStats`, leyenda "del período, sin propina" en `DashboardPage`; doc 10: *"es plata que entra y sale, somos intermediarios"*. **En la caja sí sale**: `pagado-por-mes.ts` la incluye "a propósito".
2. **Venta y evento confirmado = `aceptada` + `realizada`** (23-07). Antes solo contaba `aceptada` y *"cada evento marcado realizado DESAPARECÍA de ingresos/conversión/uso"*. Evidencia: cabecera de `db_functions_analytics_23_07.sql`; `ES_EVENTO` ("decisión de Felipe") en `tendencias.ts`.
3. **El período gobierna el tablero** (Fase 1, 23-07), con dos lecturas: creadas en el período (contadores, estados, pipeline) y concretadas con evento desde el inicio, sin tope ("el futuro confirmado se pinta punteado"). Excepciones deliberadas: la fila HOY ("el hoy no se filtra") y las tendencias interanuales (06-08: *"su trabajo no es analizar un rango sino mostrar el pulso del negocio contra el año anterior"*). Evidencia: comentarios en `getDashboardStats` y `DashboardPage`.
4. **Las canceladas no son caja esperada**: conservan sus pagos pero salen del cobrado y del por cobrar. Evidencia: comentario en `getDashboardStats`; `.neq('quotations.quotation_status','cancelada')` en `HoyRepository.alerts`.
5. **El mes del cobro es el del último abono** (28-08). Medido en producción: 55 de 174 cuotas pagadas caían en el mes equivocado ($101.066.964; la peor, con 410 días de desfase). `paid_date` queda de respaldo para las 40 cuotas viejas sin abonos. Evidencia: comentario en `getDashboardStats`; `analytics.service.spec.ts`; `fechaDelUltimoAbono` en `payments.service.ts`.
6. **Por cobrar descuenta los abonos, nunca baja de cero y no pasa sobrante a otra cuota.** Una cuota en cero deja de contarse aunque diga "pendiente". Es vencido por estado o por fecha, y "hoy" todavía no está vencido. Casos: #332 en HOY (07-08, $1.623.600 mostrados cuando faltaban $823.600) y Brito Pradenas en el panel (28-08, *"el panel pedía cobrar $800 mil de más"*). Evidencia: `sumarPorCobrar` y `por-cobrar.spec.ts`; comentario en `getDashboardStats`.
7. **Los reembolsos no entran al por cobrar** (07-08): nacen cuando el cliente pagó de más (la #93 abonó $1.638.000 sobre $1.170.000), y sumarlos *"inventaría plata por cobrar que nadie debe"*. Evidencia: comentario en `HoyRepository.alerts`.
8. **Resultado por fecha del evento, Caja por fecha del movimiento** (29-08). Felipe: *"este gráfico mezcla flujo de caja y EERR (puede ser el mismo pero partido)"*. Costo y pago van separados en proveedores y personal *"para poder validar tus cálculos"*. Evidencia: cabecera de `IngresosYCaja.tsx`.
9. **Cuándo sale la plata a proveedores** (29-08): si se provisionó, el día de la provisión. Si no se provisionó y el evento se realizó, el día del evento (*"nunca el día que lo marcaste realizado"*). Si está aceptado y sin provisionar, todavía no salió nada. Evidencia: comentario en `DashboardPage.marginData`.
10. **El personal sale de caja "cuando los marque como pagados en la pestaña de nómina"** (29-08), con jornada y propina por separado. Evidencia: `api-rest/src/people/utils/pagado-por-mes.ts`.
11. **Flujo de caja = cobrado − pagado + por cobrar**: *"es la fórmula que pidió Felipe: no es caja pura, es la POSICIÓN del mes"*. Evidencia: `IngresosYCaja.flujoDe`.
12. **El costo del evento se arma como en Post-Venta → Gestión** (24-07, *"lo pilló Felipe"*): insumos + recursos asignados. Los recursos **reemplazan** a `costoFijos`, que solo es respaldo si el evento no tiene ni recursos ni personal. Los insumos se congelan con `provisioned_cost` (solo insumos). Evidencia: comentarios en `DashboardPage.marginData`.
13. **El fijo de un recurso mixto se cobra una vez por evento**, aunque vaya en varios días (16-08). Evidencia: `utils/costoDeRecursos.ts` y su prueba; comentarios en `marginData` y `proveedores`.
14. **El personal viene de las sillas** (migración 84): con nombre al monto acordado, vacías al estimado, en su propia fila desde el 29-08. Evidencia: `costoPersonalPorEvento`; comentario en `marginData`.
15. **Desglose por evento, no por cuota** (31-08): *"un evento cobrado en nueve cuotas es UNA línea"*. El personal se desglosa por persona. Evidencia: `porEvento` en `getDashboardStats`; `PagadoDelMes.personas`.
16. **Cifras en miles** (23-07), con el monto exacto al pasar el mouse. Los nombres largos ceden con "…" (31-08, Iglesia Adventista). Se sacaron las explicaciones por fila: *"yo me entiendo"*. Evidencia: `IngresosYCaja.tsx`; commit 0aca7dc.
17. **Un mes sin historia es un hueco, no un cero** (06-08): *"un cero dice 'no vendimos nada' y es mentira"* cuando el sistema no existía (los datos parten en agosto de 2025). Evidencia: `serieInteranual` y `primerMesConDatos`.
18. **La cosecha: la máquina sugiere, quien vende decide** (07-08). Las reglas de distancia entre fechas se rompían (FEPASA parte un evento en dos cotizaciones; la Iglesia Adventista re-cotizó al día siguiente). Matrimonio no se repite, "Graduación" sí. **Cada fila manda sobre sí misma**: Felipe movió la #97 y se le movió la #107. Siempre se anota cuándo y quién (migración 62). Evidencia: `tendencias.ts`, `QuotationsService.setHarvestStatus`, migraciones 62, 63 y 64.
19. **La misma tabla responde dos preguntas** (18-08): Cotizaciones → "quién cotizó ese mes"; Eventos → "qué eventos se hicieron", solo confirmados. Evidencia: `perteneceAlMes` y `tendencias.test.ts`.
20. **Por qué perdimos** (06-08): el precio no explica las derrotas. Ticket de ganadas $3.025.652 contra $3.028.883 de las perdidas. Evidencia: `61_motivo_perdida.sql`; bloque en `DashboardPage`.
21. **Pinchar plata vencida lleva a Post-Venta con el filtro puesto** (07-08). Evidencia: `DashboardPage`, commit bdb6fd6.
22. **Sección de administrador** en ambas apps (Fase 3). Evidencia: `@Roles(...ADMIN_ONLY)` en `AnalyticsController` y `HoyController`; `SECTION_ROLES.dashboard`.
23. **Análisis de proveedores con cuatro columnas "que deciden"** (poda del 25-08): "Comprado real comparaba peras con manzanas". Evidencia: comentario en la tabla maestra de `DashboardPage`.
24. **El KPI "Clientes" se quitó** por ser *"un total de vanidad"* (Fase 5). Evidencia: comentario sobre los KPIs.

## 7. Conexiones con otros módulos

**A quién usa este módulo**

- **01 Cotizador / 02 Negocio**: `QuotationsService.findAll` y `COLUMNAS_LISTA` (una columna nueva no llega si no se agrega ahí). Diccionario `utils/estadoCotizacion` (`etiquetaEstado`, `puntoEstado`, `chipEstado`). `loss_reason` se captura al rechazar o anular (`components/MotivoPerdida`). La cosecha abre `/negocio/:id`.
- **03 Pagos, reembolsos y portal**: `payments`, `payment_transactions`, `fechaDelUltimoAbono`, contador de `portal_receipts`. El derrame y `normalizePaymentAfterTransactions` deciden qué cuota queda `pagado`, y eso es lo que el panel cuenta como Cobrado.
- **04 Post-Venta**: HOY navega a `/post-venta` y `?plata=vencido`; comparte `["postventa","comprobantes"]`. Gestión y Servicios calculan el mismo costo del evento en otro archivo.
- **06 Logística**: `base-catalogo`, `won-events`, `supply-provisions`, `resources`, `event-resources`; `utils/eventConsolidation.ts` y `utils/costoDeRecursos.ts`; `provisioned_at` y `provisioned_cost`.
- **07 Personas (planificación)**: las sillas de `event_staff` son el costo de personal.
- **08 Nómina**: `GET /people/pagado-por-mes` y `pagadoDePersonalPorMes` (la fecha la pone `marcarPago`).
- **09 Clientes**: `clients` (conteo, `client_type` en las funciones y en `getClientTypeColor`).
- **11 Consultas**: HOY cuenta requerimientos `solicitada` y lleva a `/requests`. Las consultas del embudo *"no entran en analytics ni en el pipeline"* (mapa 11, regla 23; el grep ahí confirma que `analytics` no lee `consultas`).
- **12 Correos**: el resumen semanal de los lunes (`WEEKLY_DIGEST` en `quotations-cron.service.ts`) reemplazó al análisis semanal viejo; la plantilla `WEEKLY_ANALYTICS` quedó sin quien la llame.
- **15 Acceso y roles**: `PermissionGuard`, `ADMIN_ONLY`, `LoginPage` (administrador → `/dashboard`).
- **16 Infraestructura del motor**: `src/cache/memoria.ts` y `PanelInvalidationInterceptor` son globales; `ScheduleModule` solo en producción.
- **17 Kit de la casa**: `Tooltip` (con `ancho="amplio"`), `SectionChipSelect`, `toast`, `formatCurrency`, `MONTHS`. Ojo con el nombre: `frontend/src/lib/analytics.ts` y `usePageViews` son **Google Analytics**, no este módulo.
- **18 Base de datos**: las 9 funciones SQL fuera de las migraciones. **19 Despliegue**: la memoria del panel vive en el proceso.

**Quién usa este módulo**: nadie lee sus endpoints fuera de `DashboardPage`. Su única escritura (`harvest_status`, `recontacted_*`) vive en `quotations` y viaja en `COLUMNAS_LISTA` a toda pantalla que liste cotizaciones.

**Efectos automáticos**

- No hay relojes. Cualquier escritura con sesión de cualquier módulo borra la memoria del panel de esa empresa (`PanelInvalidationInterceptor`).
- La app refresca HOY cada 5 minutos; lo demás se refresca al volver a la pestaña o cuando pasan 30 s y se vuelve a montar.
- Cambiar un estado de la cosecha actualiza la caché al instante y la confirma después.

## 8. Zonas de riesgo: si tocas esto, cuidado con aquello

1. **Si tocas** las funciones SQL de análisis en Supabase, **se afectan** las 9 tablas, **porque** no hay migración: la única copia es `db_functions_analytics_23_07.sql` en la raíz. Ya pasó: el switchover del 22-07 *"migró datos, no funciones → Analytics quedó caída"*. Además, cada función filtra la empresa por dentro (`company_id = p_company_id`) con la service-role, así que olvidar ese filtro en una función nueva mezcla empresas. Evidencia: cabecera del SQL; `AnalyticsService.getCompleteStats`.
2. **Si revives** un envío de análisis a administradores, **se afecta** la privacidad entre empresas, **porque** el cron borrado juntaba en un solo "Para:" a los administradores de TODAS las empresas (`usersService.findAll(undefined, ADMINISTRADOR)`). Emergencia del 31-07: *"Camila de MDS viendo el correo de Felipe"*. Evidencia: commit 51948d6; `EmailStructure.WEEKLY_ANALYTICS` sigue en `email.service.ts`.
3. **Si cambias** `saleWithoutTip` o `tipAmountOf` en un solo lado, **se afecta** el panel, **porque** hay dos copias a mano: el motor (`quotations/utils/tip.ts`, celda de Ventas y KPI) y la app (`utils/quotationMoney.ts`, globo de Ventas en `marginData.desglose` y margen de Gestión). La celda y su desglose dejarían de sumar lo mismo. Evidencia: *"si cambias uno, cambia el otro"* en `tip.ts`.
4. **Si tocas** cómo se arma el costo del evento en `GestionTab`, `ServiciosTab`, `consolidateEvent` o `costoDeRecursos` sin mirar `DashboardPage.marginData` (o al revés), **se afecta** el margen del Dashboard contra el de Post-Venta, **porque** es la misma regla escrita en archivos distintos y `eventConsolidation.ts` no tiene pruebas. Ya pasó dos veces: margen inflado por no contar recursos (24-07) y fijo cobrado por día (16-08). Evidencia: comentarios en `marginData`; mapa 06, riesgos 1 y 7.
5. **Si cambias** la llave de mes (`año-mesBase0`) en `analytics.service.ts`, `pagado-por-mes.ts` o `marginData`, **se afectan** las filas de Ventas, Cobrado, Costo y Pagado, que quedarían corridas un mes o vacías, **porque** se arma de tres maneras: el motor con `getFullYear()/getMonth()` (hora del servidor), la app con `getUTCFullYear()/getUTCMonth()` y las tendencias con `YYYY-MM` en base 1. Solo coinciden si el servidor corre en UTC (*"igual que el backend que corre en UTC"*, comentario en `marginData`). En el repo no hay `TZ` configurada. Evidencia: `generateMonthRange`, `llaveDelMes`, `marginData`.
6. **Si tocas** el derrame o `normalizePaymentAfterTransactions` (mapa 03), **se afecta** Cobrado, **porque** suma el `amount` de cuotas `pagado`, no los abonos. Una cuota que sigue `pendiente` con abonos parciales no aporta nada a Cobrado (su abono solo resta en Por cobrar), y una cuota pagada en varios abonos cae entera en el mes del último. Evidencia: `totalPaymentsDetailByMonth` en `getDashboardStats`.
7. **Si registras** reembolsos pagados, **se afecta** la comparación con Post-Venta, **porque** el Dashboard no lee `refunds` y Post-Venta muestra *"Saldo neto: lo pagado menos lo ya devuelto"* (`PostVentaPage.fetchEvents` con `getPaidRefundsByQuotation`). Evidencia: no hay ninguna mención a `refund` en `api-rest/src/analytics/`.
8. **Si falla** la consulta de pagos del panel, **se afecta** toda la mitad Caja, que sale en blanco durante una hora, **porque** `getDashboardStats` desarma solo `{ data: payments }`, ignora el `error`, calcula con lista vacía y lo guarda en `cachePanel`. Evidencia: `AnalyticsService.getDashboardStats`.
9. **Si pides** un período largo ("Últimos 5 años"), **se puede afectar** el panel completo, **porque** `findAllPaymentsFromQuotation` manda todos los UUID en `.in('quotation_id', ...)` sin tandas. `HoyRepository` sí parte de a 200 y advierte: *"se pasa del largo que acepta el servidor y ahí no se cae solo este número: se cae el panel de alertas completo"*. No medido. Evidencia: `hoy.controller.ts` (`TANDA`); `payments.repository.ts`.
10. **Si escribes** en `quotations`, `payments` o `event_staff` desde un reloj o un endpoint `@Public`, **se afecta** la frescura del panel (hasta una hora de números viejos), **porque** el interceptor solo borra cuando hay `req.user.company_id` y el método no es GET. Hoy no duele: el público crea requerimientos, que el panel no cuenta, y `updateOverduePayments` solo cambia `pendiente` a `vencido`, que el panel no distingue. Evidencia: `panel-invalidation.interceptor.ts`.
11. **Si agregas** un estado de cosecha, **se afecta** el chip, que "vuelve solo, sin explicación", **porque** la lista vive en tres lugares sin nada que los ate: `ESTADOS_COSECHA` en `tendencias.ts`, en `estado-cosecha.dto.ts` y el CHECK de `64_estado_cosecha_check.sql`. Evidencia: comentarios gemelos en ambos archivos.
12. **Si agregas** una columna a `quotations` que el panel necesite, **no llega**, **porque** `QuotationsRepository.findAll` (`COLUMNAS_LISTA`) y `LogisticsRepository.findWonEventsSince` usan `select` explícitos. Así se agregaron los campos de propina el 31-08. Evidencia: ambos repositorios; mapa 06, riesgo 13.
13. **Si tocas** `getHoyAlerts`, **se afecta** la confianza en HOY, **porque** ante cualquier error devuelve ceros y la tarjeta dice "Nada vencido" o "Todo respondido". Evidencia: `frontend/src/services/hoy.service.ts`.
14. **Si agregas** código a `DashboardPage.tsx`, **lo rechaza** el portero (2748 líneas, congelado en 2798), **porque** es uno de los 7 gigantes. Se hace como `IngresosYCaja` el 29-08: extraer la pieza a su archivo. Evidencia: `congelar` en `frontend/scripts/portero-kit-de-la-casa.sh`.
15. **Si cambias** la `queryFn` o la llave `["logistica","compras","base", companyId]` en `DashboardPage`, **se afectan** Compras y el cotizador, **porque** comparten caché y cada uno escribe la consulta a mano. Evidencia: `marginBaseQuery`; mapa 06, riesgo 2.
16. **Si cambias** `end_date` o los DTO del período, **cuidado**: el motor convierte `"YYYY-MM-DD"` en medianoche UTC y filtra `lte('created_at', ...)`, mientras las funciones SQL usan `created_at::date BETWEEN`. Por lectura del código, las cotizaciones creadas el día final (hoy, en los presets) entran en la tabla "Estado de cotizaciones" pero no en "de N cotizadas" ni en el pipeline. No medido. Evidencia: `getDashboardStats`, `QuotationsRepository.findAll` (`dateRange`), SQL.

## 9. Pruebas que lo protegen

| Archivo | Qué cubre |
|---|---|
| `api-rest/src/analytics/tests/por-cobrar.spec.ts` | `sumarPorCobrar`: descuenta abonos (caso #332), cuota en cero no cuenta, sobrante no pasa a otra cuota, vencido por estado o por fecha, montos como texto |
| `api-rest/src/analytics/tests/analytics.service.spec.ts` | Que `AnalyticsService` se construya y "el mes del cobro" (3 casos). **Ojo**: la regla se copia dentro de la prueba (`mesDeCobro`) y solo usa `fechaDelUltimoAbono`; si el servicio cambia, la prueba sigue verde |
| `api-rest/src/analytics/tests/analytics.controller.spec.ts` | Solo `toBeDefined` |
| `api-rest/src/payments/tests/payments.service.spec.ts` | `fechaDelUltimoAbono` (mapa 03) |
| `api-rest/src/people/tests/pagado-por-mes.spec.ts` | `pagadoDePersonalPorMes`: fecha del pago, jornada y propina, desglose por persona (mapa 08) |
| `frontend/src/pages/dashboard/tendencias.test.ts` | `perteneceAlMes` y `cosechaDelMes` con las miradas `cotizado` y `evento` |
| `frontend/src/utils/quotationMoney.test.ts` | `tipAmountOf` y `saleWithoutTip` de la app |
| `frontend/src/utils/costoDeRecursos.test.ts` | fijo una vez por evento, variable por personas, montos como texto |

CI (`.github/workflows/ci.yml`) corre `npx jest`, `npm run test` (vitest), `npm run build` y el portero.

**Lo importante que NO está cubierto**:

- `getDashboardStats` completo: las dos poblaciones, canceladas fuera, ejes de meses, saldo por cobrar, `porEvento`, el error de pagos ignorado.
- Las 9 funciones SQL (ni versionadas ni probadas).
- Las consultas de `HoyRepository.alerts` (solo la función pura).
- `PanelInvalidationInterceptor` y `CacheMemoria`.
- `QuotationsService.setHarvestStatus`.
- Todo lo que vive dentro de `DashboardPage`: `marginData`, `salidas`, `pagadoPorMes`, `margenTotales`, `proveedores`, `motivosPerdida`, KPIs.
- Las fórmulas de `IngresosYCaja` (margen y flujo).
- `agruparPorMes`, `serieInteranual`, `ventanaMeses` y `primerMesConDatos`.
- `utils/eventConsolidation.ts` (mapa 06).

## 10. Deuda y rarezas conocidas

**Cálculos de plata que existen en más de un lugar** (donde puede descuadrar con el cotizador o Post-Venta):

| Número | Dónde se calcula | Qué los hace diferir |
|---|---|---|
| Venta sin propina | motor `tip.ts` (`AnalyticsService`) y app `quotationMoney.ts` (`marginData`, Gestión) | espejos a mano |
| Venta con propina | funciones SQL de ingresos, `agruparPorMes` (Cotizado y Vendido por Mes), monto de la cosecha, "Por qué perdimos" | "Vendido por Mes" y "Top clientes por ingresos" no cuadran con "Ventas" ni con "Ventas concretadas", que van sin propina |
| Por cobrar | `HoyRepository.alerts` (toda la empresa), `getDashboardStats` (solo el alcance del período, por vencimiento), Post-Venta (mapa 04), portal `getPortalData` (mapa 03) | alcance y fecha distintos: la tarjeta HOY y el TOTAL de la fila Por cobrar no deberían coincidir |
| Cobrado o pagado | `getDashboardStats` (cuotas `pagado`, bruto) y Post-Venta (neto de reembolsos) | reembolsos pagados y abonos parciales |
| Costo del evento | `DashboardPage.marginData`, `GestionTab.costoBase`, `ServiciosTab`, `QuotationForm` (este usa `costoFijos` a propósito, mapa 06) | además, `marginData` no espera `costoPersonalQuery`: mientras llega el personal, un evento sin recursos cae a `costoFijos` |
| Vencido | `sumarPorCobrar` (estado o fecha), `updateOverduePayments` 1 AM (mapa 03), portal (`vence < hoy`) | la tarjeta HOY puede marcar vencido antes que el reloj |
| Ventas del período | KPI "Ventas concretadas" (creadas en el período) contra "Margen del período" y fila Ventas (eventos desde el inicio, con futuro) | dos poblaciones distintas lado a lado |

**Rarezas y código muerto**:

- `DashboardPage.tsx` tiene 2748 líneas (techo 2798). Toda la lógica de margen, caja, proveedores, cosecha, tendencias y motivos corre en el navegador dentro del componente, sin `useMemo` salvo la cosecha. El motivo está escrito: *"Se calcula aquí y no en el motor porque el costo de insumos vive en este cálculo"*.
- `frontend/src/pages/analytics/index.tsx` está muerto, y aun así el plan 09 lo lista para arreglar (§11).
- En `AnalyticsService`: `totalPaymentsByMonth` se calcula y ninguna pantalla lo usa; `totalClients` obliga a leer todos los clientes (`ClientsService.findAll`) y ya no se pinta.
- En la app: `SECTION_ROLES.analytics` no lo usa ninguna ruta; en `proveedores` se calculan `real`, `ultima` y `servicios`, que ya no se muestran (poda del 25-08).
- `AnalyticsModule` todavía importa `UsersModule` y `EmailModule`, restos del cron borrado. La plantilla `email/templates/weekly_analytics/` y su sobrecarga en `EmailService.sendEmail` no tienen quien las llame.
- Se rompe la regla de 4 capas: `AnalyticsService` llama `supabase.client.rpc` directo, y `HoyRepository` vive dentro de `hoy.controller.ts`.
- El tipo del motor declara `event_type_conversion_stats: EventTypeConversionStats` como objeto; el SQL y la app lo tratan como lista.
- `getDashboardStats` suma `payment.amount` sin `Number()`, mientras `sumarPorCobrar` y `costoDeRecursos` se protegen de montos que llegan como texto.
- `perdidasQuery`: su llave no incluye `customRange` (con fechas libres no se recalcula), no aplica fecha final y baja todas las rechazadas y canceladas para filtrar en el navegador.
- `data.moneyByMonth.slice(-12)` toma las **últimas** 12 columnas de un eje que se estira al futuro: con eventos agendados, los meses iniciales del período desaparecen. La columna TOTAL solo suma lo visible, y el KPI "Margen del período" suma todos los meses, así que cuando la tabla viene recortada no cuadran.
- El "~" de estimación se sacó de la tabla (*"a Felipe no le decía nada"*, 31-08), pero sigue en el KPI "Margen del período".
- Comentarios desactualizados en `DashboardPage`:
  - *"el Dashboard ya se refresca solo cada 5 min"*: solo HOY tiene `refetchInterval`;
  - *"Se guarda para TODAS las cotizaciones de la misma oportunidad"*: el código guarda solo la fila (`ids: [f.id]`), como manda la regla del 07-08;
  - *"Convert totalPaymentsByMonth to paymentsByMonth format"*: ya no convierte eso.
- "Enviadas sin respuesta (+7 días)" mide `updated_at`: cualquier edición reinicia el reloj, mientras los toques de seguimiento usan `sent_at` (mapa 02).
- Las funciones SQL de estados, conversión y top por cotizaciones incluyen requerimientos; el motor cuenta solo `request_type = cotizacion`.
- `getHoyAlerts(_companyId)` y los `get*(_companyId)` de logística reciben un parámetro que ya no usan (restos de la Mudanza #7, 28-07).

## 11. Contradicciones entre documento y código

1. **`CLAUDE.md` (sección Cron)** nombra como ejemplo de reloj *"`analyitics-cront.service.ts`"*. **Código**: el archivo se borró el 31-07 (commit 51948d6) y `AnalyticsModule` solo provee `AnalyticsService` y `HoyRepository`.
2. **`CLAUDE.md` (Commands)** dice *"There is no frontend test suite."* **Código**: `frontend/package.json` tiene `"test": "vitest run"`, hay 19 archivos `*.test.ts(x)` (entre ellos `tendencias.test.ts`) y CI corre "Pruebas (vitest)".
3. **`CLAUDE.md` (Database & migrations)** exige que todo cambio de base quede como migración numerada en `docs/migrations/`. **Código**: las 9 funciones de análisis solo están en `db_functions_analytics_23_07.sql`, en la raíz; un grep en `docs/migrations` no las encuentra.
4. **`CLAUDE.md` (Backend architecture)** dice que el repository es *"the ONLY layer that touches Supabase"*. **Código**: `AnalyticsService.getCompleteStats` llama `this.supabase.client.rpc` desde el service.
5. **`docs/arquitectura/09_PLAN_DE_HOMOLOGACION.md` (13-08), Tanda A1**, lista `analytics/index.tsx:43` ("corre un día el rango por omisión") como arreglo pendiente. **Código**: esa pantalla no se muestra desde el 23-07 (`/analytics` redirige y nadie importa el archivo).
6. **El mismo plan, Tanda B5**, dice que *"el Dashboard y Analytics siguen diciendo 'Cancelada'"*. **Código**: el pipeline usa `etiquetaEstado("cancelada")`, que devuelve "Anulada" (`utils/estadoCotizacion.ts`), igual que `QuotationStatusStats` y `ETIQUETA_ESTADO` de la cosecha (commit 811ae6f, 14-08). El plan quedó atrás en ese punto.

## 12. Preguntas abiertas

1. ¿El motor en Railway corre en UTC? Las llaves de mes lo suponen y no hay `TZ` en el repo (mapa 19).
2. ¿Cuántas instancias corre el motor? `cachePanel` vive en la memoria del proceso: con dos réplicas, una escritura borraría la memoria de una sola.
3. ¿Las funciones SQL de producción ("Cotizador-dev") son idénticas a `db_functions_analytics_23_07.sql`? No hay migración que lo asegure.
4. ¿Cuántas cotizaciones creadas el día final quedan fuera de los KPI por el corte a medianoche UTC (riesgo 16)? Falta medir.
5. Con "Últimos 5 años", ¿cuántos UUID viajan en la consulta de pagos y qué tan cerca está del límite de URL (riesgo 9)?
6. ¿Quedan en producción cuotas `pendiente` o `vencido` con abonos parciales, anteriores a la regla del 20-07? Su plata abonada no aparece en ninguna fila de Cobrado.
7. ¿Felipe quiere que las tablas de análisis, "Vendido por Mes", la cosecha y "Por qué perdimos" muestren montos sin propina, como el resto del tablero?
8. ¿"Enviadas sin respuesta" debería medir `sent_at` en vez de `updated_at`?
9. ¿"Cobrado" debería restar los reembolsos pagados, como Post-Venta?
10. ¿Alguien ha visto la mitad Caja en blanco? Sería la huella del error de pagos ignorado (riesgo 8).

## 13. Archivos clave

**Motor**

- `api-rest/src/analytics/analytics.controller.ts`, `analytics.service.ts`, `analytics.module.ts`
- `api-rest/src/analytics/hoy.controller.ts` (`HoyController`, `HoyRepository`, `sumarPorCobrar`)
- `api-rest/src/analytics/dto/get-dashboard-stats.dto.ts`, `dto/get-complete-stats.dto.ts`, `types/index.ts`, `utils/index.ts` (`generateMonthRange`)
- `api-rest/src/analytics/tests/por-cobrar.spec.ts`, `analytics.service.spec.ts`, `analytics.controller.spec.ts`
- `api-rest/src/cache/memoria.ts` (`cachePanel`, `invalidarPanelEmpresa`), `api-rest/src/cache/panel-invalidation.interceptor.ts`, `api-rest/src/app.module.ts`
- `api-rest/src/quotations/utils/tip.ts` (`saleWithoutTip`)
- `api-rest/src/quotations/quotations.repository.ts` (`findAll`, `COLUMNAS_LISTA`), `quotations.service.ts` (`findAll`, `setHarvestStatus`), `quotations.controller.ts`, `dto/estado-cosecha.dto.ts`
- `api-rest/src/payments/payments.service.ts` (`fechaDelUltimoAbono`), `payments.repository.ts` (`findAllPaymentsFromQuotation`)
- `api-rest/src/people/utils/pagado-por-mes.ts`, `people.repository.ts` (`costoPersonalPorEvento`, `pagadoDePersonalPorMes`), `people.controller.ts`
- `api-rest/src/logistics/logistics.repository.ts` (`findWonEventsSince`)
- `api-rest/src/email/templates/weekly_analytics/` (sin uso)
- `db_functions_analytics_23_07.sql` (raíz del repo: las 9 funciones)
- Migraciones: `docs/migrations/15_provisioning.sql`, `37_tip_amount.sql`, `61_motivo_perdida.sql`, `62_recontacto.sql`, `63_estado_cosecha.sql`, `64_estado_cosecha_check.sql`, `66_indices_de_consultas_calientes.sql`, `84_las_sillas.sql`

**App**

- `frontend/src/pages/dashboard/DashboardPage.tsx`, `IngresosYCaja.tsx`, `tendencias.ts`, `tendencias.test.ts`, `components/NewAccount.tsx`
- `frontend/src/pages/analytics/components/*.tsx` (9 tablas) y `frontend/src/pages/analytics/index.tsx` (muerto)
- `frontend/src/services/analytics.service.ts`, `hoy.service.ts`, `types/analytics.types.ts`, `constants/api.routes.ts` (`ANALYTICS_*`)
- `frontend/src/constants/permissions.ts`, `App.tsx`, `layout/Sidebar.tsx`, `pages/LoginPage.tsx`, `lib/queryClient.ts`
- `frontend/src/utils/quotationMoney.ts`, `utils/costoDeRecursos.ts`, `utils/eventConsolidation.ts`, `utils/estadoCotizacion.ts`, `components/MotivoPerdida.tsx`
- `frontend/src/services/people.service.ts` (`getCostoPersonal`, `getPagadoPersonalPorMes`), `logistics.service.ts`, `quotations.service.ts` (`getQuotations`, `guardarEstadoCosecha`), `portalReceipts.service.ts`
- `frontend/scripts/portero-kit-de-la-casa.sh` (techo de `DashboardPage`)
