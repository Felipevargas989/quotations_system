# Mapa: Personas: liquidación, propinas, nómina e histórico

> **Estado: verificado una vez contra el código** (commit 0de0ddb, 11-09-2026). Falta la etapa de completar lo que no quedó escrito. Parte del atlas de docs/arquitectura/mapa; el índice es 00_MAPA_DEL_SISTEMA.md.

## 1. Qué hace

Es la segunda mitad del módulo Personal (menú "Personal", dirección `/personas`): convierte el trabajo ya hecho en plata pagada. Lo usa solo el administrador, **después** de que el evento o el día de staff ya pasó. Funciona en los tres estados que Felipe definió el 08-09-2026:

- **Liquidación**: se toma un evento o un día de staff, se corrigen horas y montos, se reparte la propina por puntos y se cierra.
- **Nómina**: se juntan varias liquidaciones en una nómina consolidada por RUT, se revisa contra los datos bancarios y se paga persona a persona, a mano, en el portal del banco.
- **Histórico de pagos**: lo que ya se pagó, más los días de staff que se resolvieron sin propina.

Lo que se le paga a cada persona vive en la tabla de jornadas, `event_staff`: cada fila guarda su jornada, su propina y el sello de la nómina que la pagó (el pozo vive en `tip_pools` y las marcas de pagado en `payroll_people`). "Pendiente" es simplemente no tener sello. El directorio, la planificación y las sillas están en `07_PERSONAS_DIRECTORIO_Y_PLANIFICACION.md`.

## 2. Pantallas y rutas de la app

Todas viven dentro de `PersonasPage` (`frontend/src/pages/personas/PersonasPage.tsx`), que cambia de pestaña con estado local y la recuerda en `localStorage` (`eventia_personal_pestana`). La ruta la protege `PermissionGuard` con `SECTION_ROLES.people` = `ADMIN_ONLY` (`frontend/src/App.tsx`, `frontend/src/constants/permissions.ts`).

| Ruta de la app | Componente principal | Archivo | Qué hace el usuario ahí | Rol que la ve |
|---|---|---|---|---|
| `/personas`, pestaña "Liquidación" (id interno `fichas`) | `FichasTab` | `frontend/src/pages/personas/FichasTab.tsx` | Ve los días de staff sin resolver (chips ámbar, botón "Repasar N días") y los "Eventos por liquidar" (solo pasados, el más viejo primero) | administrador |
| (dentro) ficha de un evento | `FichaAbierta` + `TablaDeJornadas` + `Reparto` | `FichasTab.tsx`, `frontend/src/components/personas/TablaDeJornadas.tsx` | Corrige entrada, salida, colación, monto y el chip "sin propina"; escribe la propina del evento; pone el % por cargo y reparte; "Liquidar este evento…" | administrador |
| (dentro) revisión previa | `RevisionAntesDeLiquidar` + `CuerpoDeRevision` | `frontend/src/pages/personas/RevisionDeNomina.tsx` | "Revisa antes de liquidar": la misma tabla de la nómina con lo que quedaría por pagar; "Aprobar y evaluar al equipo →" o "Volver a la ficha" | administrador |
| (dentro) evaluación y cierre | `EvaluacionesModal` | `FichasTab.tsx` | Estrellas y nota por persona (se puede saltar); "Guardar y cerrar la ficha" | administrador |
| (dentro) modal del día de staff | `DiaRestaurante` | `FichasTab.tsx` | Recorre la tanda de días con ‹ ›: quiénes trabajaron (más los invitados del evento), propina del día, % por cargo, "Repartir" (avanza solo), "Sin propina este día", "Listo" | administrador |
| `/personas`, pestaña "Nómina" | `NominaTab` → `LiquidacionesPorPagar` y la lista "Nóminas de pago" | `frontend/src/pages/personas/NominaTab.tsx` | Marca liquidaciones por pagar, "Reabrir para corregir", "Revisar y generar"; abre una nómina | administrador |
| (dentro) revisión antes del banco | `RevisarAntesDeGenerar` + `CuerpoDeRevision` | `NominaTab.tsx`, `RevisionDeNomina.tsx` | "Revisa antes de subir al banco": por persona RUT, banco, cuenta, tipo, jornadas, propinas y total, con avisos; "Generar nómina" | administrador |
| (dentro) nómina abierta y pago | `NominaAbierta`, `PagoUnoAUno`, `DetalleTrabajador`, `DesgloseDePago` | `NominaTab.tsx` | Resumen por persona; "Pagar una a una" con ‹ › y "Ya la pagué"; "detalle" sin datos bancarios | administrador |
| `/personas`, pestaña "Histórico de pagos" | `HistoricoTab`, `NominaPagada` | `frontend/src/pages/personas/HistoricoTab.tsx` | Tres gráficos; nóminas con al menos una persona pagada, abiertas por evento o día de staff; "Días sin propina" con "Devolver a Liquidación" | administrador |
| `/personas/:id`, sección de pagos | `PagosDePersona` (dentro de `PersonaFichaPage`) | `frontend/src/pages/personas/PagosDePersona.tsx` | "Se le debe", "Pagado el <año en curso>", "Total histórico", gráfico anual por mes y detalle al pinchar un mes | administrador |

## 3. Endpoints del motor

Todo está en `api-rest/src/people/people.controller.ts` (`@Controller('people')`) y en `PeopleService` (`api-rest/src/people/people.service.ts`). **Ninguna ruta lleva `@Roles`**, y `RolesGuard` (`api-rest/src/auth/roles.guard.ts`) deja pasar cualquier sesión cuando falta: "Ruta sin @Roles → basta la sesión". Por eso la columna de roles dice lo mismo en todas las filas.

| Método y ruta | Controller y método | Service | Quién lo llama desde la app | Roles o @Public |
|---|---|---|---|---|
| `GET /people/sheets` | `findSheets` | `findSheets` → `repo.findSheets` (le agrega `en_nomina`) | `getSheets` en `FichasTab`; también `GrillaPersonal` de Post-Venta | Sesión, sin `@Roles` |
| `POST /people/sheets` | `upsertSheet` | `upsertSheet` (solo armando, confirmado o trabajado) | Ninguna pantalla: `upsertSheet` existe en `services/people.service.ts` sin uso | Sesión, sin `@Roles` |
| `POST /people/sheets/cerrar` | `cerrarFicha` | `cerrarFicha` | `cerrarFicha` desde `EvaluacionesModal` | Sesión, sin `@Roles` |
| `POST /people/sheets/:quotationId/traer-planta` | `traerPlanta` | `traerPlantaAlEvento` | `traerPlantaAlEvento` dentro de la consulta `["people","staff-evento",id]` de `FichaAbierta`, solo si la ficha no está cerrada | Sesión, sin `@Roles` |
| `GET /people/staff?evento=` o `?desde=&hasta=` | `findStaff` | `findStaff` o `findStaffRange` | `getStaff` en `FichaAbierta`; `getStaffSemana` para la ventana de días de staff en `FichasTab` (también 04 y 07) | Sesión, sin `@Roles` |
| `PATCH /people/staff/:id` | `updateStaff` | `updateStaff` (sin monto no se confirma) | `updateStaff` desde `TablaDeJornadas`, vía `cambiarStaff` optimista | Sesión, sin `@Roles` |
| `DELETE /people/staff/:id?liberar=1` | `removeStaff` | `removeStaff` | No lo llama la liquidación (la tabla no tiene papelera); lo llaman `SemanaTab`, `PersonaFichaPage` y `GrillaPersonal` (07 y 04). Importa acá porque deshace repartos | Sesión, sin `@Roles` |
| `POST /people/staff/del-evento-al-dia` | `soloPropinaDelDia` | `soloPropinaDelDia` | `crearSoloPropina` al tocar el chip o el extra de un invitado con id negativo en `DiaRestaurante` | Sesión, sin `@Roles` |
| `GET /people/dias/mas-viejo` | `diaMasViejo` | `diaMasViejoDeRestaurante` | `getDiaMasViejo` en `FichasTab` | Sesión, sin `@Roles` |
| `GET /people/pools` | `findPools` | `findPools` | `getPools` en `FichasTab`, `FichaAbierta` y `HistoricoTab` | Sesión, sin `@Roles` |
| `POST /people/pools` | `createPool` | `createPool` (si ya existe, devuelve ese) | `createPool` en `Reparto.guardarPozo` y en `DiaRestaurante` | Sesión, sin `@Roles` |
| `PATCH /people/pools/:id` | `updatePool` | `updatePool` (sin candado) | `updatePool` en `Reparto.guardarPozo` y en `sinPropinaHoy` | Sesión, sin `@Roles` |
| `DELETE /people/pools/:id` | `removePool` | `removePool` → `clearTips` y borrar | Ninguna pantalla (`removePool` existe en el service de la app sin uso) | Sesión, sin `@Roles` |
| `POST /people/pools/:id/repartir` | `repartir` | `repartir` → `sincronizarInvitados` (días) → `repartirPorPuntos` | `repartirPool` en `Reparto` (evento) y `DiaRestaurante` (día, con `invitados` y `monto`) | Sesión, sin `@Roles` |
| `POST /people/pools/:id/sin-propina` | `sinPropina` | `marcarSinPropina` | `sinPropina` en `DiaRestaurante` | Sesión, sin `@Roles` |
| `POST /people/reviews` | `createReview` | `createReview` | `createReview` en `EvaluacionesModal` (el resto de las estrellas, en 07) | Sesión, sin `@Roles` |
| `GET /people/payrolls/pendientes` | `liquidacionesPendientes` | `liquidacionesPendientes` | `getLiquidacionesPendientes` en `LiquidacionesPorPagar` | Sesión, sin `@Roles` |
| `POST /people/payrolls/previa` | `previaPayroll` | `previaPayroll` → `reunirLiquidado` → `consolidarPorRut` | `previaPayroll` en `RevisarAntesDeGenerar` | Sesión, sin `@Roles` |
| `POST /people/payrolls/previa-preliminar` | `previaPreliminar` | `previaPreliminar` → `consolidarPorRut` | `previaPreliminar` en `RevisionAntesDeLiquidar` | Sesión, sin `@Roles` |
| `POST /people/payrolls` | `createPayroll` | `createPayroll` | `createPayroll` en `LiquidacionesPorPagar.generar` | Sesión, sin `@Roles` |
| `GET /people/payrolls` | `findPayrolls` | `findPayrolls` (estado deducido) | `getPayrolls` en `NominaTab` y `HistoricoTab` | Sesión, sin `@Roles` |
| `GET /people/payrolls/:id` | `getPayroll` | `getPayroll` | `getPayroll` en `NominaAbierta`, `NominaPagada` y la precarga del Histórico | Sesión, sin `@Roles` |
| `PATCH /people/payrolls/:id/pago` | `marcarPago` | `marcarPago` | `marcarPago` en `PagoUnoAUno`, una llamada por cada ficha de la línea | Sesión, sin `@Roles` |
| `POST /people/payrolls/reabrir` | `reabrirLiquidacion` | `reabrirLiquidacion` | `reabrirLiquidacion` en `LiquidacionesPorPagar` y `RevisarAntesDeGenerar` ("Reabrir para corregir") y en `HistoricoTab` ("Devolver a Liquidación" de días sin propina) | Sesión, sin `@Roles` |
| `GET /people/historico/graficos` | `graficosHistorico` | `graficosHistorico` → `armarGraficosHistorico` | `getGraficosHistorico` en `HistoricoTab` | Sesión, sin `@Roles` |
| `GET /people/:id/historial` | `findHistorial` | `findHistorial` → `repo.findHistorialDePersona` | `getHistorial` en `PagosDePersona` | Sesión, sin `@Roles` |
| `GET /people/pagado-por-mes` | `pagadoPorMes` | `pagadoDePersonalPorMes` → `repo.pagadoDePersonalPorMes` → `utils/pagado-por-mes.ts` | `getPagadoPersonalPorMes` en `DashboardPage` (ver 13) | Sesión, sin `@Roles` |
| `GET /people/costo-personal` | `costoPersonal` | `costoPersonal` → `repo.costoPersonalPorEvento` | `getCostoPersonal` en `DashboardPage` (sillas: ver 07 y 13) | Sesión, sin `@Roles` |

El orden de las rutas importa: los comentarios del controller piden poner `roles`, `staff`, `day-notes` y `:id/historial` antes de las rutas con `:id`, para que el texto no se lea como un id. `payrolls/pendientes` también va antes de `payrolls/:id`, pero sin comentario que lo diga.

## 4. Tablas de la base de datos

| Tabla | Qué guarda | Lee o escribe | Migración que la crea o modifica |
|---|---|---|---|
| `event_staff` | Cada jornada (persona × día × evento, o día de staff si `quotation_id` es NULL). Para este mapa: `amount` (jornada del freelance o asignación extra de la planta), `tip_amount`, `tip_pool_id`, `no_tip`, `solo_propina`, `payroll_id` (nómina que pagó la jornada) y `tip_payroll_id` (la de la propina). NULL = pendiente | Lee y escribe | Crea `71_asignacion_de_personas_por_dia.sql` (FK a `quotations` con `ON DELETE CASCADE`). Modifican: `74_restaurante_como_evento_permanente` (`quotation_id` nullable), `77_ciclo_propinas_nomina` (`tip_amount`, `tip_pool_id`, `payroll_id`, `tip_payroll_id`), `82_sin_propina_por_persona` (`no_tip`), `84_las_sillas` (`person_id` y `day` nullables), `88_jornada_solo_propina` (`solo_propina`), `89_cambio_de_dia_de_planta` (`ajuste`), `90_puesto_en`. Lo de planificación, en 07 |
| `staff_sheets` | El ciclo de la ficha de un evento: `status` (armando, confirmado, trabajado, cerrada), `closed_at`, `cierre_administrativo`. UNIQUE (`company_id`, `quotation_id`) | Lee y escribe | Crea `77`. Modifican `79_cascada_de_las_tablas_nuevas` (FK en cascada) y `86_cierres_administrativos` |
| `tip_pools` | El pozo: de un evento (`quotation_id`) o de un día de staff (`day`); `first_amount` + `second_amount`, `distributed_at` (repartido o sin propina), `porcentajes` jsonb del último reparto | Lee y escribe | Crea `77`. Modifican `79` (cascada), `83_un_solo_pozo_por_evento_y_por_dia` (índices únicos parciales `tip_pools_uno_por_evento` y `tip_pools_uno_por_dia`), `87_pozo_guarda_porcentajes` |
| `payrolls` | La nómina: `label` y `created_at`. No tiene columna de estado: se deduce | Lee y escribe | Crea `77` |
| `payroll_people` | El pago persona a persona: `jornada_paid`, `propina_paid`, `paid_at`. UNIQUE (`payroll_id`, `person_id`), **sin** `company_id` en la llave | Lee y escribe | Crea `77` |
| `person_reviews` | La evaluación que se escribe al cerrar la ficha. Sin llave única | Escribe (desde el cierre) | Crea `77`; cascada en `79`. Detalle en 07 |
| `people` | RUT, banco, tipo y número de cuenta que viajan a la revisión y al pago (`people(*)` en las consultas) | Lee | `68_personas` y siguientes (ver 07) |
| `management_resources` (type `personal`) | El cargo de cada jornada: agrupa los % del reparto y da el "área" del desglose | Lee | `69_cargos_fusionados_con_recursos` (ver 07) |
| `quotations` | Fechas del evento (`repo.diasDeEvento`), número y cliente (historial de la persona y lista de eventos de seis meses vía `getQuotations`) | Lee | Ver 01 y 02 |

## 5. Flujos principales

### 5.1 Liquidar un evento

1. **Pantalla** Liquidación → "Eventos por liquidar". `FichasTab` arma la lista con `eventosQueryOptions` (`getQuotations` de aceptadas y realizadas desde hace seis meses) cruzada con `getSheets`. Deja solo los que ya terminaron (`(q.termino || q.inicio) <= hoy`), quita los `cierre_administrativo` y muestra los que no están en `cerrada`.
2. **Abrir la ficha**: `FichaAbierta` llama `POST /people/sheets/:id/traer-planta` (si no está cerrada) y luego `GET /people/staff?evento=`. En el motor, `traerPlantaAlEvento` usa `repo.diasDeEvento` y `repo.plantaEnDias` (que excluye `ajuste = 'descansa'`) e inserta en lote filas `kind = 'planta'`, `status = 'confirmado'`, `amount = null` para quien no esté ya en el evento. La pantalla filtra las sillas vacías y avisa que se retirarán al cerrar.
3. **Corregir la gente**: `TablaDeJornadas` cambia horas, colación, monto y `no_tip` → `PATCH /people/staff/:id` → `updateStaff` (rechaza confirmar sin monto si no es planta) → `repo.updateStaff`. Es optimista: `pintarStaff` pinta las cachés `["people","staff-evento"]` y `["people","liquidacion-ventana"]` y deshace si el motor rechaza.
4. **La propina**: en `Reparto`, la caja "Propina del evento" guarda al salir del campo (`onCommit`) con `POST /people/pools` o `PATCH /people/pools/:id`. Los % por cargo se escriben a mano; si queda un solo cargo activo se fija en 100.
5. **Repartir**: `POST /people/pools/:id/repartir` → `repartir`. Valida pozo mayor que cero, % que suman 100, ficha no cerrada y ninguna fila con `tip_payroll_id`. Saca a los `no_tip` y a las sillas, calcula `repartirPorPuntos` (minutos trabajados × % del cargo, 540 minutos si no hay horario, `repartirAlPeso` sin sobrantes), borra el reparto anterior con `repo.clearTips`, escribe `tip_amount` y `tip_pool_id` en paralelo, y guarda `distributed_at` y `porcentajes` en `tip_pools`.
6. **Revisión**: "Liquidar este evento…" abre `RevisionAntesDeLiquidar` → `POST /people/payrolls/previa-preliminar` → `previaPreliminar`: `repo.jornadasPendientes` + `repo.propinasPendientes` del evento, sin preguntar si la ficha está cerrada, → `consolidarPorRut`. `CuerpoDeRevision` muestra avisos de fichas repetidas y de cuenta faltante, y un "falta" en rojo en la columna de RUT, banco o cuenta; no bloquea.
7. **Evaluar y cerrar**: "Aprobar" abre `EvaluacionesModal`. Por cada persona con estrella o nota, `POST /people/reviews`; después `POST /people/sheets/cerrar` → `cerrarFicha`: primero `repo.deleteSillasVacias`; luego rechaza si hay un pozo con plata sin `distributed_at` o si `Math.round(repartido) !== Math.round(pozo)`; si cuadra, `repo.upsertSheet` a `cerrada` con `closed_at`.
8. **Efectos**: con la ficha cerrada, `estaLiquidado` deja pasar sus filas y el evento, si tiene montos, aparece solo en Nómina → "Liquidaciones por pagar". En Post-Venta, `GrillaPersonal` ve el `closed_at` (candado de Gestión → Personal, ver 04 y 07).

### 5.2 Liquidar los días de staff

1. **Ventana**: `FichasTab` pide `GET /people/dias/mas-viejo` y arma `desdeVentana` (42 días atrás, o el día más viejo si es anterior) → `GET /people/staff?desde=&hasta=hoy`. Un día está pendiente si tiene filas sin evento y su pozo no tiene `distributed_at`.
2. **La tanda**: "Repasar N días" congela la lista (`tanda`) y abre `DiaRestaurante`. La tabla junta las filas del día sin evento (sin `solo_propina`, sin `ajuste = 'descansa'`) y los **invitados del evento**: gente con jornada de evento ese día y sin jornada de staff. Si todavía no tienen fila solo-de-propina, se pintan con id negativo; tocar su chip o su extra llama `POST /people/staff/del-evento-al-dia` → `soloPropinaDelDia`.
3. **Repartir**: si no hay pozo lo crea (`POST /people/pools` con `day`), y manda `POST /people/pools/:id/repartir` con `porcentajes`, `invitados` (ids de las jornadas de evento) y `monto` en el mismo viaje. En el motor, `sincronizarInvitados` valida que sean jornadas de evento de ese día, descarta a quien ya está en la planta del día (el "cinturón" del caso #423), borra las filas solo-de-propina que sobran (si alguna ya tiene `tip_payroll_id`, rechaza el reparto entero), crea las nuevas (`quotation_id` null, `amount` null, `solo_propina` true, horario del evento) y reparte por puntos como en 5.1. La pantalla pasa sola al día siguiente.
4. **Sin propina**: "Sin propina este día" crea el pozo en cero o lo deja en cero (`PATCH /people/pools/:id`) y llama `POST /people/pools/:id/sin-propina` → `marcarSinPropina` (rechaza si el pozo tiene plata) → `distributed_at`.
5. **Efectos**: `repo.diasLiquidados` ve el `distributed_at`. El día repartido aparece en "Liquidaciones por pagar"; el día sin propina pasa derecho a Histórico → "Días sin propina" (`HistoricoTab.diasSinPropina`), aunque sus jornadas con monto, si las tiene, igual llegan a "Liquidaciones por pagar" porque `diasLiquidados` lo cuenta como liquidado.

### 5.3 Generar una nómina

1. **Lista**: Nómina → `LiquidacionesPorPagar` → `GET /people/payrolls/pendientes` → `liquidacionesPendientes`. Junta `repo.jornadasPendientes` (persona no nula, `payroll_id` nulo, `amount > 0`) y `repo.propinasPendientes` (`tip_payroll_id` nulo, `tip_amount > 0`), las filtra con `estaLiquidado` usando `repo.fichasCerradas` y `repo.diasLiquidados`, y agrupa por evento o por día, con personas, `sin_rut` por nombre, jornadas, propinas y total.
2. **Selección**: se marcan casillas. Si alguien no tiene RUT, el botón queda deshabilitado y el aviso dice su nombre.
3. **Revisión**: "Revisar y generar" → `RevisarAntesDeGenerar` → `POST /people/payrolls/previa` con `quotation_ids` y `dias` → `previaPayroll` → `reunirLiquidado` (con días y eventos a la vez los pide por separado y los suma; el filtro `dias` excluye eventos) → `consolidarPorRut`.
4. **Generar**: "Generar nómina" → `POST /people/payrolls` → `createPayroll`. Vuelve a correr `reunirLiquidado` (no compara con lo que se mostró), rechaza si falta un RUT, inserta en `payrolls`, sella con `repo.stampRows` (`payroll_id` a las jornadas, `tip_payroll_id` a las propinas), crea los pagos con `repo.insertPagos` (upsert en `payroll_people`) y calcula `poolsSinRepartir` ("fuera"). Son cuatro escrituras seguidas, sin transacción.
5. **Efecto**: la app abre la nómina recién creada; lo sellado sale de "Liquidaciones por pagar".

### 5.4 Pagar una a una

1. **Nómina abierta**: `NominaAbierta` → `GET /people/payrolls/:id` → `getPayroll` (`repo.rowsDeNomina` + `repo.findPagos`). En la app, `porPersonaDe` consolida por RUT (sin RUT, por ficha) y `estadoDelPago` dice pagada solo si todo lo que tiene monto está marcado.
2. **Pago**: "Pagar una a una" abre `PagoUnoAUno`: la persona pendiente con RUT, banco y cuenta, su `DesgloseDePago` (jornadas y propinas por fecha) y flechas ‹ ›. "Ya la pagué" → `PATCH /people/payrolls/:id/pago` por cada `personId` de la línea, con `jornada_paid` y `propina_paid` en true → `marcarPago`: verifica con `repo.findPayroll` que la nómina sea de la empresa, pone `paid_at` = ahora y hace `repo.upsertPago`.
3. **Estado**: refresca la nómina y la lista `["people","payrolls"]`. `findPayrolls` deduce `estado`: `pagada` si todas las filas de `payroll_people` tienen las dos marcas; si no, `banco` ("En el banco").
4. **Efectos**: el panel de caja (`GET /people/pagado-por-mes`) cuenta el pago en el mes de `paid_at`; una nómina con al menos una persona pagada aparece en el Histórico.

### 5.5 Devolver a Liquidación

1. **Desde dónde**: "Reabrir para corregir" en cada fila de "Liquidaciones por pagar" (con `ConfirmInline`), o en el pie del modal de revisión cuando se revisa una sola; y "Devolver a Liquidación" en Histórico → "Días sin propina".
2. **Motor**: `POST /people/payrolls/reabrir` → `reabrirLiquidacion`. Si `repo.hayPagosEn` encuentra alguna fila del evento o del día con `payroll_id` o `tip_payroll_id`, rechaza. Si no: un evento vuelve a `trabajado` con `closed_at` null (`repo.upsertSheet`); un día vuelve a pozo sin repartir (`repo.desrepartirPozoDelDia`). No borra horas, montos, propinas ni porcentajes.
3. **Efecto**: el evento reaparece en "Eventos por liquidar" y el día como chip ámbar.

### 5.6 Histórico y pagos de una persona

1. **Histórico**: `HistoricoTab` pide `getPayrolls`, deja las que tienen `pagadas > 0` y precarga cada `getPayroll`. Al abrir una, `porConceptoDe` agrupa por evento o día de staff y `estadoDelConcepto` marca solo lo "Parcial" o "Sin pagar".
2. **Gráficos**: `GET /people/historico/graficos` → `repo.filasEnNominaDesde` (12 meses) + `repo.findPools` → `armarGraficosHistorico`: en nóminas por mes (jornadas y propinas), top 5 de seis meses, y propina promedio por día contando solo los días con propina.
3. **Ficha de la persona**: `PagosDePersona` → `GET /people/:id/historial` → todas sus filas con `quotations(quotation_number, clients(name))`. Para la pantalla, "pagado" es tener sello de nómina.

## 6. Reglas de negocio acordadas

1. **Los tres estados** (08-09-2026): Liquidación valida, Nómina deja listo y paga, Histórico es lo pagado. Felipe: *"un hito es pagado, es un sello que no debería tener reapertura"*. Evidencia: doc 10, sección "Los tres estados"; comentario de cabecera de `HistoricoTab`.
2. **Se liquida lo que ya pasó, y todo lo que pasó**: *"no pago un evento de diciembre en agosto"* (15-08) y *"Todo se debe liquidar"* (21-08), aunque no tenga gente. Evidencia: filtro `(q.termino || q.inicio) <= hoy` en `FichasTab`; doc 10.
3. **Los cierres administrativos no son historia**: las 110 fichas cerradas por SQL el 17 y 18-08 no se listan (*"esos 14 son anteriores a esta implementación"*, 21-08). Evidencia: migración 86; filtro `cierre_administrativo` en `FichasTab`.
4. **Repartir y liquidar son dos pasos, y la liquidación no crea nóminas**: un botón que la creaba duró un día (16-08: *"mandé unos días a liquidación y pasó directo a nómina de pago"*). Evidencia: comentario "EL DÍA NO CREA NÓMINAS" en `DiaRestaurante`; doc 10.
5. **A la nómina solo entra lo liquidado**: evento = ficha cerrada; día = pozo con `distributed_at`. El 16-08, en laboratorio, se colaban $100.000 en 4 filas de eventos a medio liquidar. Evidencia: `estaLiquidado` y `nomina-solo-lo-liquidado.spec.ts`.
6. **Reparto por puntos** (21-08): el % de un cargo es el valor de su hora, no su tajada; *"mismas horas y mismo cargo, misma propina"*. La pantalla sigue pidiendo % que sumen 100 (*"es más familiar que hablar de puntos"*). Evidencia: `repartirPorPuntos`, `reparto-por-puntos.spec.ts` (ejemplo de $104.000 al 60/30/10), texto bajo la grilla en `Reparto`.
7. **Al peso y sin sobrantes**: en el Excel, Joker No 1 dejó $8 en el aire y 8 de 9 eventos descuadraban. Evidencia: `repartirAlPeso`.
8. **El candado mira la plata, no los porcentajes**: el 24 de enero quedaron $15.715 en el aire con la casilla en verde. Evidencia: `cerrarFicha`; doc 10, caso 10.
9. **Un pozo por evento y por día**: una cotización llegó a tener cinco pozos porque el monto se guardaba tecla por tecla, y la ficha no cerraba nunca. Evidencia: migración 83; `createPool` devuelve el existente; la caja usa `onCommit`.
10. **Los % se guardan en el pozo y cada día muestra lo suyo** (21-08 y 24-08: *"no está recordando los porcentajes"*). Evidencia: migración 87; `repartir` guarda `porcentajes`; `DiaRestaurante` los lee de `pozo.porcentajes`.
11. **"Sin propina" es del día, no de la persona**, y la jornada se paga igual: el 28 de septiembre trabajaron 10 y recibieron 4. Evidencia: migración 82; `repartir` filtra `no_tip`.
12. **Un día sin propina también se liquida, pero solo con pozo en cero** (15-08). Evidencia: `marcarSinPropina` ("Ese día tiene pozo: repártelo, no lo saltes").
13. **Un solo cargo se lleva el 100% solo, y cada caja es de quien la escribe** (15-08 y 17-08: al cambiar un % los demás ya no se recalculan). Evidencia: `pct()` en `Reparto` y `DiaRestaurante`; `cambiar` en `Reparto` (en `DiaRestaurante` es el `onChange` de cada caja).
14. **Los invitados del evento entran al pozo del día** (24-08: *"son dos propinas distintas que se distribuyen de forma distinta"*): por defecto, con el horario del evento, excluibles con "sin propina"; por dentro, fila `solo_propina` sin pago. Quien ya tiene jornada de staff ese día no se invita (repartiría doble). Evidencia: `sincronizarInvitados`, `invitados-del-evento.spec.ts`, migración 88.
15. **La planta que la ficha trae a un evento** (18-08: *"aparecen todos y yo marco sin propina"*): en un evento, `kind = 'planta'` significa que la trajo la ficha, con monto en cero y con propina; su turno de staff no se toca. Evidencia: `traerPlantaAlEvento`, `laMandaronAUnEvento`, `esPlanificacion`.
16. **La nómina paga toda fila con monto, planta incluida** (la asignación extra, 18-08), y **una silla vacía jamás llega a la nómina** (migración 84). Evidencia: `jornadasPendientes` (`amount > 0`, `person_id` no nulo); `deleteSillasVacias` en `cerrarFicha`.
17. **Consolidar por RUT** (16-08: *"no puedo subir diez veces al banco"*); sin RUT va por ficha y nunca junto a otro sin RUT. Evidencia: `consolidarPorRut`, `porPersonaDe`, `consolidar-por-rut.spec.ts`.
18. **El RUT es regla de avance para generar, no para liquidar** (16-08: *"los RUT deben estar antes de poder generar las nóminas"*); la falta de cuenta solo avisa. Evidencia: `createPayroll`; `RevisionAntesDeLiquidar` no bloquea; aviso "ese pago tendrás que resolverlo aparte" en `CuerpoDeRevision`.
19. **La revisión y la nómina usan la misma consulta**, para que *"un día mostrarían distinto de lo que pagan"*; y la revisión previa al cierre es el mismo cuerpo (`CuerpoDeRevision`, 18-08). Evidencia: `reunirLiquidado`.
20. **La nómina es un selector, no una semana**; se elige por liquidación y `dias` es un modo excluyente (16-08). Evidencia: `SeleccionPayrollDto.dias`, `jornadasPendientes`.
21. **En nómina no hay vuelta atrás** (24-08), y lo pagado se ajusta en la nómina siguiente (18-08). Devolver a Liquidación, sacar a alguien, volver a repartir o sacar a un invitado se rechazan si hay sello. Evidencia: `reabrirLiquidacion` + `hayPagosEn`, `removeStaff`, `repartir`, `sincronizarInvitados`; `reabrir-liquidacion.spec.ts`.
22. **Un solo monto, dos estados** (17-08): pendiente o pagada, no existe el parcial por persona. Evidencia: `estadoDelPago` y su prueba. La base conserva dos marcas.
23. **El estado de la nómina se deduce, no se guarda**: "En el banco" hasta que no quede nadie por pagar (16-08). Evidencia: `findPayrolls`.
24. **El pago se hace a mano en el banco**: el sistema acompaña, no transfiere (Santander cobra el archivo). Evidencia: doc 10, "El pago"; comentario de cabecera de `NominaTab`.
25. **La nómina tiene que ser de la empresa**: la llave única de `payroll_people` no incluye `company_id`, así que el upsert le cambiaba el dueño a una fila ajena (revisión del 16-08). Evidencia: `marcarPago` llama `findPayroll` antes.
26. **En la caja, el personal entra cuando se marca pagado** (29-08), con la propina incluida. Evidencia: `utils/pagado-por-mes.ts`, `pagado-por-mes.spec.ts`.
27. **El Histórico lista qué se pagó, no a quién** (08-09), y cada fila muestra solo nombre y total (08-09: *"el resto de los datos solo ensucia"*, commit 2fb51de). Evidencia: `NominaPagada`, `porConcepto.ts`.
28. **"Día de staff", no "día de restaurante"**, en todas las pantallas (08-09); el código y el doc siguen diciendo restaurante por dentro. Evidencia: doc 10; textos de `FichasTab` y `NominaTab`.
29. **En las pantallas de plata no hay caché**: Felipe agregó un garzón en Planificación y al liquidar no aparecía. Evidencia: `staleTime: 0` en sheets, pools y la ventana de `FichasTab`.
30. **El detalle para el trabajador no lleva datos bancarios** (doc 10, "El detalle para el trabajador"). Evidencia: `DetalleTrabajador`.

## 7. Conexiones con otros módulos

**A quién usa:**

- **07 Personas: directorio y planificación** (`07_PERSONAS_DIRECTORIO_Y_PLANIFICACION.md`): la misma tabla `event_staff`, las sillas, la proyección de planta (`laPuedeQuitarLaProyeccion` no toca filas con plata o sello), `removeStaff` (que deshace repartos), los datos bancarios de `people` y las estrellas. `esPlanificacion` vive en `estadoDelPago.ts` pero la usan `SemanaTab`, `PersonaFichaPage` y `GrillaPersonal`.
- **01 Cotizador** y **02 Negocio**: `getQuotations` (aceptadas y realizadas, seis meses) pone "N° · cliente · fecha"; `repo.diasDeEvento` lee `event_date` y `event_end_date`.
- **17 Kit de la casa**: `Modal`, `ConfirmInline`, `Toast`, `NumberInput`, `Tooltip`, `HoraInput`, `SelectorColacion`, `utils/bancos`, `utils/rut`, `utils/dates`, `humanizeApiError`. `TablaDeJornadas` es pieza propia del módulo.

**Quién lo usa:**

- **13 Dashboard** (`13_DASHBOARD_Y_ANALITICA.md`): `DashboardPage` pide `getPagadoPersonalPorMes` (casilla `personal` de la caja en `IngresosYCaja`, con desglose por persona) y `getCostoPersonal` (costo por evento para el margen).
- **04 Post-Venta** (`04_POST_VENTA.md`): `GrillaPersonal` lee `getSheets` y calcula `fichaCerrada` con `closed_at` (el candado "ficha liquidada" de Gestión → Personal); `ServiciosTab` y `EventResourcesSection` leen `getStaff`.

**Efectos automáticos:**

- No hay relojes, correos ni notificaciones en `api-rest/src/people` (no existe un `*-cron.service.ts` y `PeopleService` no importa el módulo de correo).
- **Abrir una ficha escribe**: `traer-planta` inserta filas cada vez que se abre una ficha no cerrada.
- **Sacar a alguien con propina** llama `clearTips` y deja el pozo entero sin repartir; si se va de un evento, borra también su fila solo-de-propina del día (`removeStaff`).
- **Cascadas en la base**: borrar una cotización borra en cadena `event_staff` (migración 71), `staff_sheets`, `tip_pools` y `person_reviews` (migración 79). Ver 18 Base de datos.

## 8. Zonas de riesgo: si tocas esto, cuidado con aquello

1. **Si tocas** los filtros de `jornadasPendientes` o `propinasPendientes`, o `estaLiquidado`, **se afecta** qué se paga en cada nómina y lo que muestra "Liquidaciones por pagar", **porque** son la única definición de "pendiente y liquidado" que comparten `liquidacionesPendientes`, `previaPayroll` y `createPayroll` (`previaPreliminar` usa los dos filtros del repository, pero no `estaLiquidado`). El 16-08 un filtro más laxo metía $100.000 de eventos sin liquidar. Evidencia: `api-rest/src/people/people.repository.ts` `jornadasPendientes`; `people.service.ts` `reunirLiquidado`, `estaLiquidado`.
2. **Si tocas** `consolidarPorRut` o `porPersonaDe`, **se afecta** cuántas transferencias salen por persona y cuándo figura pagada, **porque** el mismo criterio está escrito dos veces: el motor lo usa en la revisión y la app lo reimplementa para la nómina abierta y el pago. Evidencia: `people.service.ts` `consolidarPorRut`; `frontend/src/pages/personas/porPersona.ts` `porPersonaDe`.
3. **Si tocas** `repartirPorPuntos` o `minutosTrabajados`, **se afecta** la plata que la pantalla anticipa por cargo, **porque** la app tiene un gemelo (`horasTrabajadas(...) ?? 9` en `Reparto` y en `DiaRestaurante`) y lo mostrado dejaría de calzar con lo repartido. Evidencia: `people.service.ts` `minutosTrabajados`; `FichasTab.tsx` `puntosPorCargo` y `horasPorCargo`.
4. **Si tocas** `cerrarFicha` o `EvaluacionesModal`, **se afecta** el costo del evento y las evaluaciones, **porque** `cerrarFicha` borra las sillas vacías **antes** de validar el cuadre, y la app guarda las evaluaciones **antes** de llamar al cierre. Si el cierre rebota (pozo sin repartir o descuadre), las sillas ya se fueron y las evaluaciones ya quedaron; reintentar las duplica, porque `person_reviews` no tiene llave única. Leído en el código, no probado. Evidencia: `people.service.ts` `cerrarFicha`; `FichasTab.tsx` `EvaluacionesModal.cerrar`; migración 77.
5. **Si tocas** `sinPropinaHoy` o `marcarSinPropina`, **se afecta** la nómina, **porque** ninguno limpia `tip_amount`. Un día recién repartido, al que se vuelve con ‹ dentro de la misma tanda y se marca "Sin propina este día", quedaría con pozo en cero y `distributed_at`, pero con las propinas escritas en sus filas, y `propinasPendientes` las llevaría a la nómina. Leído en el código, no probado (ver Preguntas abiertas). Evidencia: `FichasTab.tsx` `DiaRestaurante.sinPropinaHoy` (`updatePool` con `first_amount: 0`); `people.service.ts` `marcarSinPropina` (sin `clearTips`).
6. **Si tocas** `updateStaff` o `updatePool`, **se afecta** una nómina ya generada, **porque** ninguno revisa `payroll_id` ni `tip_payroll_id`. El candado "en nómina no hay vuelta atrás" existe en `removeStaff`, `repartir`, `reabrirLiquidacion` y `sincronizarInvitados`, pero cambiar el monto o las horas de una jornada ya sellada cambia lo que suma la nómina (`montosDeNominas` y `rowsDeNomina` leen el monto vivo). En la ficha cerrada lo impide la pantalla (`TablaDeJornadas` con `cerrada`), no el motor. Evidencia: `people.service.ts` `updateStaff`, `updatePool`.
7. **Si tocas** `removePool` o `repo.clearTips`, **se afecta** plata ya pagada, **porque** `clearTips` borra `tip_amount` de todas las filas del pozo sin mirar el sello, y `DELETE /people/pools/:id` no tiene candado. Hoy ninguna pantalla lo llama. Evidencia: `people.repository.ts` `clearTips`; `people.service.ts` `removePool`.
8. **Si tocas** `createPayroll`, **se afecta** la integridad de la nómina, **porque** crea y sella en cuatro escrituras separadas (`createPayroll`, dos `stampRows`, `insertPagos`) sin transacción: un fallo a mitad deja una nómina a medias, y dos generaciones simultáneas pueden pisarse el sello. Tampoco revalida contra la revisión aprobada (pendiente 1 del cajón, por el reparto del #400 rehecho la noche del 24-08). Evidencia: `people.service.ts` `createPayroll`; doc 10, "El cajón".
9. **Si tocas** `eventosQueryOptions`, **se afecta** Liquidación, Nómina, Histórico y Evaluaciones, **porque** es la única fuente de eventos de las cuatro y trae solo seis meses. Un evento sin liquidar más viejo que eso no aparece en "Eventos por liquidar" (sus jornadas no tienen camino a la nómina), y en Nómina e Histórico sale como "Evento" sin nombre. La ventana de los días de staff sí se abrió hasta el día más viejo (revisión del 16-08); la de eventos no. Evidencia: `FichasTab.tsx` `eventosQueryOptions` y `SEIS_MESES_ATRAS`.
10. **Si tocas** la ventana de `FichasTab`, **se afecta** la velocidad de Liquidación, **porque** `diaMasViejoDeRestaurante` devuelve el día de staff más viejo de toda la historia, no el más viejo sin liquidar. En la práctica la "ventana de seis semanas" carga todas las jornadas desde el primer día, con `staleTime: 0`, cada vez que se abre la pestaña. Evidencia: `people.repository.ts` `diaMasViejoDeRestaurante`; `FichasTab.tsx` `desdeVentana`.
11. **Si tocas** `removeStaff`, **se afecta** un evento o día ya repartido, **porque** sacar a alguien con propina deshace el reparto del pozo entero (revisión del 16-08: la plata quedaba en el aire), y al salir de un evento borra además su fila solo-de-propina del día y reabre ese pozo. Evidencia: `people.service.ts` `removeStaff`.
12. **Si tocas** `plantaEnDias`, `traerPlantaAlEvento` o `laMandaronAUnEvento`, **se afecta** quién recibe propina y la proyección de la planta, **porque** ya hubo dos incidentes: el 18-08 la proyección vio las filas traídas por la ficha y borró cuatro turnos de staff; el 04-09 el imán trajo a Soledad a un evento el día que descansaba y le repartió propina. Evidencia: comentarios en `people.service.ts` `laMandaronAUnEvento` y `people.repository.ts` `plantaEnDias`; doc 10, capítulo 11.
13. **Si tocas** `invitadosFilas` (app) o `sincronizarInvitados` (motor), **se afecta** el reparto del día, **porque** la regla "quien ya tiene jornada de staff ese día no es invitado" está escrita en los dos lados; si uno cambia y el otro no, se reparte doble o se pierde a alguien. Evidencia: `FichasTab.tsx` `DiaRestaurante.invitadosFilas`; `people.service.ts` `sincronizarInvitados`.
14. **Si tocas** `marcarPago`, **se afecta** el flujo de caja del panel, **porque** cada llamada pisa `paid_at` con la hora actual (también al desmarcar) y `pagadoDePersonalPorMes` usa esa fecha para elegir el mes. Evidencia: `people.service.ts` `marcarPago`; `utils/pagado-por-mes.ts`.
15. **Si tocas** `PeopleController`, **se afecta** quién ve RUT y cuentas y quién puede marcar pagos, **porque** ninguna ruta tiene `@Roles` y el "solo administrador" vive solo en la app. Poner `@Roles(...ADMIN_ONLY)` (`api-rest/src/auth/roles.decorator.ts`) al controller entero rompería Post-Venta (`GrillaPersonal`, `ServiciosTab`, `EventResourcesSection`), que llama rutas de `/people` y también la ve operaciones (`SECTION_ROLES.payments`): hay que marcar ruta por ruta (el Dashboard ya es solo del administrador). Evidencia: `people.controller.ts`; `api-rest/src/auth/roles.guard.ts`; `frontend/src/constants/permissions.ts`.
16. **Si tocas** `QuotationsRepository.assertDeletable` o la llave de `event_staff` a `quotations`, **se afecta** la historia de pagos, **porque** borrar una cotización borra en cascada sus jornadas aunque estén en una nómina pagada, y `assertDeletable` solo mira `payment_transactions`, `refunds`, `payments` y encuestas. Evidencia: `api-rest/src/quotations/quotations.repository.ts` `assertDeletable`; migración 71.
17. **Si tocas** `PagosDePersona.lineasDe`, **se afecta** lo que Felipe le responde a un trabajador, **porque** "pagado" es `payroll_id !== null` en la jornada o `tip_payroll_id !== null` en la propina (entró a nómina, no se marcó en el banco) y "Se le debe" suma todo lo sin sello, incluidos días futuros con monto y eventos todavía sin liquidar. Evidencia: `frontend/src/pages/personas/PagosDePersona.tsx`.

## 9. Pruebas que lo protegen

**Motor** (jest; en CI corre `npx jest --silent`, `.github/workflows/ci.yml`):

- `api-rest/src/people/tests/reparto-por-puntos.spec.ts`: `repartirPorPuntos` con 1 cocinera y 3 garzones al 50/50, el ejemplo de $104.000 al 60/30/10, 60/40, el caso #423, sin pesos en el aire, cargo en 0% fuera, % a un cargo sin nadie = error.
- `consolidar-por-rut.spec.ts`: una línea por persona con varios orígenes, mismo RUT = un pago, sin RUT nunca juntos, filas en cero, origen sin contar dos veces un día, orden por nombre y desglose día a día (27-08).
- `nomina-solo-lo-liquidado.spec.ts`: `estaLiquidado` (evento cerrado o no, día resuelto o no, día liquidado no salva a un evento abierto, fecha con hora).
- `reabrir-liquidacion.spec.ts`: `reabrirLiquidacion` con repository simulado: evento vuelve a `trabajado`, día a sin repartir, regla de fierro con sello, sin origen.
- `invitados-del-evento.spec.ts`: `repartir` con invitados y `soloPropinaDelDia`: crea la fila solo-de-propina, la borra al sacarlo, chip y extra la crean o corrigen, cinturón de la planta, otro día = error, jornada que no es de evento = error.
- `graficos-historico.spec.ts`: `armarGraficosHistorico` y `mesesAtras`.
- `pagado-por-mes.spec.ts`: `pagadoDePersonalPorMes` (fecha del pago, jornada y propina por separado, todas las filas de la persona, sin fecha no hay salida, no confunde personas, desglose por nombre, cada pago en su mes).
- De 07, pero protegen plata: `proyeccion-no-borra-lo-ajeno.spec.ts` (`laPuedeQuitarLaProyeccion`), `jornada-extra.spec.ts` (`esJornadaExtra` y `laMandaronAUnEvento`), `alta-de-jornada.spec.ts` (`updateStaff` sin monto no confirma; `removeStaff` duerme o borra).

**App** (vitest; en CI corre `npm run test`):

- `frontend/src/pages/personas/estadoDelPago.test.ts`: `estadoDelPago` (dos estados, lista vacía no es pagada, dos fichas con el mismo RUT) y `esPlanificacion`.
- `frontend/src/pages/personas/porConcepto.test.ts`: `porConceptoDe` y `estadoDelConcepto`.
- `frontend/src/components/personas/TablaDeJornadas.test.tsx`: títulos, chip "sin propina", modo cerrada de solo lectura, secciones.

**Lo importante que NO está cubierto:**

- `createPayroll` (sellos, bloqueo por RUT, `insertPagos`), `previaPayroll`, `previaPreliminar` y `liquidacionesPendientes` (agrupación y `sin_rut`).
- `cerrarFicha`: ni el candado de la plata ni el borrado de sillas.
- `marcarSinPropina`, `updatePool`, `removePool` y `clearTips`.
- `marcarPago` y el estado deducido de `findPayrolls`.
- `removeStaff` cuando la fila tenía propina (deshacer el pozo); la prueba existente cubre dormir o borrar, no la plata.
- `traerPlantaAlEvento`.
- Las consultas del repository (`jornadasPendientes`, el modo `dias` excluyente, `hayPagosEn`, `poolsSinRepartir`): todas las pruebas simulan el repository.
- En la app: `porPersona.ts` (gemelo de `consolidarPorRut`, sin prueba), `PagosDePersona`, `HistoricoTab`, `diasPendientes` y la grilla de % de `FichasTab`.

## 10. Deuda y rarezas conocidas

- **Gigantes congelados por el portero** (`frontend/scripts/portero-kit-de-la-casa.sh`, función `congelar`): `people.service.ts` tiene 2008 líneas con techo 2040; `FichasTab.tsx` tiene 1549 con techo 1599. `people.repository.ts` (1233) y `NominaTab.tsx` (949) cuentan para el techo de 27 archivos sobre 800 líneas. La regla es extraer la pieza nueva a su propio archivo, nunca reescribir entero.
- **`FichasTab.tsx` son seis componentes en un archivo** (`FichasTab`, `ChipEstado`, `FichaAbierta`, `Reparto`, `EvaluacionesModal`, `DiaRestaurante`) y además exporta `eventosQueryOptions`, que importan `NominaTab`, `HistoricoTab`, `RevisionDeNomina` y `EvaluacionesDePersona`.
- **La grilla de porcentajes está copiada** en `Reparto` y `DiaRestaurante`, con el mismo comentario "UN SOLO CARGO SE LLEVA EL 100% SOLO" repetido.
- **`clp` está definido a mano** en `FichasTab`, `NominaTab`, `RevisionDeNomina`, `PagosDePersona` y `TablaDeJornadas`; `HistoricoTab` lo importa desde `../postventa/PostVentaPage`, un gigante de otro módulo, solo por el formateador.
- **Gemelos app y motor**: `consolidarPorRut` / `porPersonaDe`; `minutosTrabajados` / `horasTrabajadas ?? 9`; el cinturón de invitados.
- **`DiaRestaurante` reinicia el estado al cambiar de día por dos caminos**: un bloque en el render que deduce los % desde la plata (`repartoGuardado`, el método anterior al 21-08) y un `useEffect` que los lee de `pozo.porcentajes`. Gana el efecto.
- **`en_nomina` sin lector**: `repo.findSheets` hace una consulta extra en cada `GET /people/sheets` para calcularlo ("el Histórico necesita saber a quién ponerle candado"), pero desde el 08-09 ninguna pantalla lo usa; solo aparece en `people.types.ts`.
- **Código sin uso desde la app**: `POST /people/sheets` (`upsertSheet`) y `DELETE /people/pools/:id` (`removePool`). Los filtros `hasta` y `desde` de la nómina siguen en `SeleccionPayrollDto`, pero la app ya no los manda ("El armado por rango de fechas era el camino viejo (Felipe, 17-08)"). `createPayroll` devuelve `fuera` y ninguna pantalla lo muestra.
- **Columnas que la pantalla ya no usa**: `staff_sheets.status` conserva cuatro valores y la pantalla usa dos (doc 10, sección 3); `tip_pools.second_amount` sigue en la base, pero la pantalla usa una sola caja y `repartir` con `monto` lo deja en 0.
- **Comentarios que ya no dicen la verdad**: en `FichasTab.diasPendientes` dice "UN DÍA SE VA CUANDO LLEGA A LA NÓMINA, NO CUANDO SE REPARTE", pero el código lo saca al repartir (regla del 24-08). En el controller, el JSDoc "Lo liquidado que todavía no entró a ninguna nómina" está sobre `historico/graficos`; en el service hay JSDoc apilados sin su función (por ejemplo, el de "LAS LIQUIDACIONES POR PAGAR" queda sobre `reabrirLiquidacion`).
- **Conteos que pueden no calzar**: `findPayrolls` cuenta `personas` y `pagadas` por ficha (`payroll_people`), mientras `NominaAbierta` cuenta por RUT; con dos fichas del mismo RUT, la lista y el detalle dirían números distintos.
- **La etiqueta automática** "Nómina dd-mm-aaaa" repite nombre si se generan dos nóminas el mismo día (`LiquidacionesPorPagar.generar`).
- **Tres criterios de mes**: el gráfico del Histórico agrupa por día trabajado (`filasEnNominaDesde` por `day`), la caja del panel por `paid_at` en la hora del servidor (`llaveDelMes`), y la lista de nóminas se fecha y ordena por `created_at`. Además `graficosHistorico` calcula "hoy" en UTC (`toISOString`), mientras `FichasTab` y `PagosDePersona` usan la hora de Chile (`hoyEnChile`, `America/Santiago`); `SEIS_MESES_ATRAS` de `FichasTab` también se calcula en UTC.
- **Evento liquidado sin plata, invisible**: no está en Liquidación (cerrado), ni en "Liquidaciones por pagar" (sin monto), ni en el Histórico (sin nómina). No hay dónde verlo ni devolverlo.
- **El cajón pendiente del doc 10**: (1) revalidar la revisión al generar: no está en `createPayroll`; (4) avisar si los pagos del evento traen propinas anotadas: no lo encontré; (5) alertar montos menores a $1.000: no está en `CuerpoDeRevision`; (6) horas junto al monto en "Cómo se reparte": solo en el `title` al pasar el mouse; (7) `traer-planta` una sola vez por ficha: hoy se llama cada vez que se abre.

## 11. Contradicciones entre documento y código

1. **"Reabrir" sigue en pantalla.** Doc 10, "Los tres estados" (08-09): *"La palabra 'Reabrir' desaparece del módulo: siempre 'Devolver a Liquidación'"*. Código: `NominaTab.tsx` muestra "Reabrir para corregir" en `LiquidacionesPorPagar` y en `RevisarAntesDeGenerar`, con `ConfirmInline` de `yesLabel="Reabrir"`; ahí "¿Devolver … a Liquidación?" queda solo en la pregunta del `ConfirmInline`. El botón "Devolver a Liquidación" existe solo en `HistoricoTab`.
2. **Qué muestra cada fila del Histórico.** Doc 10 (08-09): una fila por evento o día *"con cuánta gente, jornadas, propinas, total y sello Pagado el… / Parcial / Sin pagar"*. Código: `NominaPagada` muestra solo nombre y total, y sello solo para "Parcial" y "Sin pagar"; `pagadoEl` se calcula en `porConceptoDe` pero no se pinta (commit 2fb51de).
3. **Lo que espera pago dentro del Histórico.** Doc 10 (08-09): *"Una nómina parcialmente pagada aparece solo con las personas pagadas. Nada de lo que espera pago se ve acá"*. Código: `NominaPagada` lista todos los conceptos de la nómina, incluidos los "Sin pagar", y la cabecera muestra el total de la nómina entera (`findPayrolls.total`).
4. **Botón de copiar y "saltar por ahora".** Doc 10, sección 5, "El pago": *"con botón de copiar en cada dato"* y *"'saltar por ahora' la deja pendiente"*. Código: `PagoUnoAUno` muestra RUT, banco y cuenta como texto, sin botón de copiar (no hay `clipboard` en `NominaTab.tsx`; solo el comentario de cabecera lo menciona), y "Saltar por ahora" se quitó el 08-09 en favor de ‹ › (comentario en el código, commit 331e274).
5. **Jornada y propina por separado.** Doc 10, sección 4 "El pago" y 10.6: *"Jornada y propina se pagan por separado"*. Código: `estadoDelPago` (*"UN SOLO MONTO, DOS ESTADOS (Felipe, 17-08)… no existe el parcial"*) y `PagoUnoAUno` marca `jornada_paid` y `propina_paid` juntos. El motor y `pagadoDePersonalPorMes` siguen tratándolas por separado.
6. **Cómo se arma la nómina.** Doc 10, sección 5 "La nómina": *"todo lo pendiente hasta una fecha, un rango de días, o eventos sueltos. Muestra qué deja fuera"*. Código: `NominaTab` dice *"Sin 'Armar nómina'… El armado por rango de fechas era el camino viejo (Felipe, 17-08)"*; la app solo manda `quotation_ids` y `dias`, y no muestra `fuera`.
7. **RUT en el resumen de la nómina.** Doc 10, sección 4: *"en el resumen de la nómina van nombre, RUT, monto y si se pagó"*. Código: la tabla de `NominaAbierta` tiene Persona, Días, Jornadas, Propinas, Total y Pago, sin RUT (el RUT sale en la revisión y en el pago uno a uno).
8. **"Pagado" en la ficha de la persona.** Doc 10 (08-09) separa Nómina (en el banco, sin pagar) de Histórico (pagado). Código: `PagosDePersona.lineasDe` marca `pagado: a.payroll_id !== null` (y `a.tip_payroll_id !== null` en la propina), así que lo que solo entró a una nómina figura "pagado" y suma en "Pagado el <año>".
9. **El doc se contradice a sí mismo y el código sigue a la regla nueva.** Doc 10, "La liquidación (flujo cerrado el 15-08)", aparece dos veces: *"los liquidados plegados"*, y la sección del 16-08 dice que el día repartido se queda en verde hasta la nómina. La sección del 24-08 dice *"Sin pliegues, sin verdes"*. `FichasTab` sigue la del 24-08.
10. **CLAUDE.md y las pruebas de la app.** `CLAUDE.md` dice *"There is no frontend test suite."* Código: `frontend/package.json` tiene `"test": "vitest run"`, CI lo corre, y este módulo tiene tres archivos de prueba en la app.

## 12. Preguntas abiertas

1. ¿Marcar "Sin propina este día" en un día recién repartido (volviendo con ‹ en la misma tanda) deja las propinas en las filas y las manda a la nómina? Se desprende de `sinPropinaHoy` y `marcarSinPropina`; falta probarlo en el laboratorio.
2. ¿Dónde se ve, y cómo se devuelve a Liquidación, un evento liquidado sin plata (sin gente, o solo planta sin asignación extra)? Doc 10 (21-08): *"esperemos que pase y veamos cómo se comporta"*.
3. ¿Se puede cambiar desde Planificación el monto o el horario de una jornada que ya está en una nómina? El motor (`updateStaff`) no lo impide y `SemanaTab` no revisa `payroll_id`; no verifiqué si los candados de 07 (evento realizado, ficha cerrada) lo tapan en todos los casos, en particular en los días de staff.
4. ¿En qué zona horaria corre el motor en Railway? `pagadoDePersonalPorMes` arma el mes con `getMonth()` del servidor; un pago marcado de noche el último día del mes podría caer en el mes siguiente.
5. ¿El Histórico debe mostrar los conceptos "Sin pagar" de una nómina parcial (contradicción 3), y "Reabrir para corregir" se renombra a "Devolver a Liquidación" (contradicción 1)?
6. ¿Hay hoy en producción eventos de hace más de seis meses sin liquidar? Si los hay, no aparecen en Liquidación (`eventosQueryOptions`).
7. ¿Por qué `PeopleController` no tiene `@Roles`: es la etapa pendiente de `RolesGuard` ("se van marcando rutas por etapas") o una decisión? Las rutas de nómina entregan RUT y cuentas a cualquier sesión.
8. ¿El cajón del doc 10 sigue en ese orden? El punto 1 (revalidar al generar) sigue sin código.

## 13. Archivos clave

**Motor**

- `api-rest/src/people/people.controller.ts`
- `api-rest/src/people/people.service.ts`: `cerrarFicha`, `traerPlantaAlEvento`, `createPool`, `updatePool`, `removePool`, `repartir`, `sincronizarInvitados`, `soloPropinaDelDia`, `marcarSinPropina`, `removeStaff`, `reabrirLiquidacion`, `liquidacionesPendientes`, `reunirLiquidado`, `previaPayroll`, `previaPreliminar`, `createPayroll`, `findPayrolls`, `getPayroll`, `marcarPago`, `graficosHistorico`; funciones puras `consolidarPorRut`, `estaLiquidado`, `repartirAlPeso`, `repartirPorPuntos`, `armarGraficosHistorico`, `mesesAtras`, `laMandaronAUnEvento`, `laPuedeQuitarLaProyeccion`
- `api-rest/src/people/people.repository.ts`: secciones "EL CICLO DE LA FICHA", "LOS POZOS DE PROPINA" y "LA NÓMINA"
- `api-rest/src/people/dto/etapas.dto.ts`
- `api-rest/src/people/entities/person.entity.ts` (`StaffSheet`, `TipPool`, `Payroll`, `PayrollPerson`)
- `api-rest/src/people/utils/pagado-por-mes.ts`
- `api-rest/src/people/tests/` (las siete pruebas de la sección 9)
- `api-rest/src/auth/roles.guard.ts`
- `api-rest/src/quotations/quotations.repository.ts` (`assertDeletable`)
- `docs/migrations/71_asignacion_de_personas_por_dia.sql`, `74_restaurante_como_evento_permanente.sql`, `77_ciclo_propinas_nomina.sql`, `79_cascada_de_las_tablas_nuevas.sql`, `82_sin_propina_por_persona.sql`, `83_un_solo_pozo_por_evento_y_por_dia.sql`, `84_las_sillas.sql`, `86_cierres_administrativos.sql`, `87_pozo_guarda_porcentajes.sql`, `88_jornada_solo_propina.sql`
- `docs/arquitectura/10_MODULO_DE_PERSONAS.md`

**App**

- `frontend/src/pages/personas/PersonasPage.tsx`
- `frontend/src/pages/personas/FichasTab.tsx`
- `frontend/src/pages/personas/NominaTab.tsx`
- `frontend/src/pages/personas/HistoricoTab.tsx`
- `frontend/src/pages/personas/RevisionDeNomina.tsx`
- `frontend/src/pages/personas/PagosDePersona.tsx`
- `frontend/src/pages/personas/porPersona.ts`
- `frontend/src/pages/personas/porConcepto.ts` y `porConcepto.test.ts`
- `frontend/src/pages/personas/estadoDelPago.ts` y `estadoDelPago.test.ts`
- `frontend/src/components/personas/TablaDeJornadas.tsx` y `TablaDeJornadas.test.tsx`
- `frontend/src/services/people.service.ts`
- `frontend/src/types/people.types.ts` (`Ficha`, `Pozo`, `Nomina`, `NominaDetalle`, `PagoPersona`, `LiquidacionPendiente`, `PreviaNomina`)
- `frontend/src/App.tsx` y `frontend/src/constants/permissions.ts` (`SECTION_ROLES.people`)
- `frontend/src/pages/dashboard/DashboardPage.tsx` y `frontend/src/pages/postventa/GrillaPersonal.tsx` (consumidores)
- `frontend/scripts/portero-kit-de-la-casa.sh`
