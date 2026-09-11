# Mapa: Personas: directorio y planificación

> **Estado: verificado una vez contra el código** (commit 0de0ddb, 11-09-2026). Falta la etapa de completar lo que no quedó escrito. Parte del atlas de docs/arquitectura/mapa; el índice es 00_MAPA_DEL_SISTEMA.md.

## 1. Qué hace

Es la mitad "de antes del pago" del módulo que en el menú se llama **Personal** (`/personas`). Guarda la **libreta de la gente que trabaja**: nombre, RUT, teléfono, datos bancarios, cargo habitual, si es de planta o freelance, sus días laborales y su horario, su situación (activa, no disponible o bloqueada) y sus evaluaciones con estrellas. Los **cargos** (garzón, cocina, cajera…) se administran acá y son solo nombres.

Encima de esa libreta vive la **Planificación**: una sábana de 28 días con todo lo que viene. Gestión (Post-Venta) pone las **sillas** de cada evento: cargo, día y valor. Acá se les pone nombre, se acuerda el monto de cada freelance y se confirma. La **planta** se carga sola un año hacia adelante según los días laborales de su ficha, y sus cambios de día se hacen desde la casilla o desde el calendario de la persona.

Solo lo usa el administrador, en tres momentos:
- **Antes del evento**: sentar gente en las sillas.
- **El día del evento**: el resumen del día, con horarios y recados.
- **Después**: las horas y la gente de esas mismas filas pasan a Liquidación, y al cerrar se evalúa.

La liquidación, las propinas, la nómina y el histórico están en el mapa 08.

## 2. Pantallas y rutas de la app

| Ruta de la app | Componente principal | Archivo | Qué hace el usuario ahí | Rol que la ve |
|---|---|---|---|---|
| `/personas` (menú "Personal") | `PersonasPage` | `frontend/src/pages/personas/PersonasPage.tsx` | Contenedor con 5 pestañas: Planificación · Liquidación · Nómina · Histórico de pagos · Staff. Abre en Planificación y recuerda la pestaña y la búsqueda en `localStorage` (`eventia_personal_pestana`, `eventia_personal_busqueda`). Los botones Cargos y Nueva persona salen solo en Staff (Felipe, 17-08) | administrador (`SECTION_ROLES.people` = `ADMIN_ONLY` en `frontend/src/constants/permissions.ts`; `PermissionGuard` en `App.tsx`; entrada del `Sidebar` con `section: "people"`) |
| `/personas` → Planificación | `SemanaTab` | `frontend/src/pages/personas/SemanaTab.tsx` | La sábana: 28 días desde el domingo, con flechas por mes y "hoy". Tiene filas "evento · cargo" que cuentan sillas por día: tiene/necesita, ámbar donde falta y verde con todos confirmados. Muestra el aviso "+N sin día" y, abajo, las bandas **Personal de planta** y **Personal Staff** (con "+ cargo"). Al abrirse proyecta la planta una vez por sesión | administrador |
| Planificación → pinchar una celda | `CasillaAbierta` (función interna de `SemanaTab.tsx`) | `frontend/src/pages/personas/SemanaTab.tsx` | Modal de un día + cargo + evento. Se pone gente con `AgregadorDeItems` (solo disponibles), se escribe el monto del día (`NumberInput`), se confirma, se ajusta el horario (`HorarioDelDia`), se abre el mini calendario de la persona y se saca con el basurero. Ahí viven la pregunta del día extra y el freno del monto | administrador |
| Planificación → pinchar una fecha | `ResumenDelDia` | `frontend/src/pages/personas/ResumenDelDia.tsx` | Hoja de ruta del día. Muestra los eventos con sus servicios y hora (editable; es la misma hora de la Ficha de Cocina), la tabla de Personal Staff por evento y la de planta. También los huérfanos de eventos anulados y los recados del día | administrador |
| `/personas` → Staff | rama "directorio" de `PersonasPage` | `frontend/src/pages/personas/PersonasPage.tsx` | Directorio agrupado en "Personal de planta" y "Freelance", con cargo, teléfono y promedio de estrellas. La búsqueda usa `matchesSearch` por nombre, RUT, teléfono, cargo y banco, y hay un aviso ámbar "faltan datos" para transferir. Pinchar una fila lleva a `/personas/:id`; "Nueva persona" abre `PersonaForm` dentro de `Modal` | administrador |
| Staff → Cargos | `CargosModal` | `frontend/src/pages/personas/CargosModal.tsx` | Crear, renombrar, apagar y volver a prender cargos. Pide también los apagados con `getRoles(true)` | administrador |
| `/personas/:id` | `PersonaFichaPage` | `frontend/src/pages/personas/PersonaFichaPage.tsx` | Ficha propia desde el 15-08. La cabecera trae tipo, RUT, teléfono, `ChipDeEstado` para la situación, WhatsApp, eliminar con `ConfirmInline`, motivo de bloqueo y 4 cajas (cargo, cómo trabaja, evaluación, días este mes). Pestañas: **Datos** (`PersonaForm`), **Su calendario** (`CalendarioDePersona` + `MiniCalendario`), **Pagos** (`PagosDePersona`, mapa 08) y **Evaluaciones** (`EvaluacionesDePersona`) | administrador |
| `/personas/:id` → Datos | `PersonaForm` | `frontend/src/pages/personas/PersonaForm.tsx` | Nombre, `RutInput`, teléfono, tipo de cuenta, banco (lista de `utils/bancos`), número de cuenta, cargo habitual, tipo, días que trabaja con horario por día (`HoraInput`, `SelectorColacion`) y notas. Una ficha que ya existe abre bajo llave (lápiz) | administrador |
| `/personas/:id` → Evaluaciones | `EvaluacionesDePersona` | `frontend/src/pages/personas/EvaluacionesDePersona.tsx` | Promedio simple, gráfico de tendencia, registro completo, y evaluar en cualquier momento con evento opcional | administrador |
| `/personas` → Liquidación · Nómina · Histórico de pagos | `FichasTab`, `NominaTab`, `HistoricoTab` | `frontend/src/pages/personas/` | Ver mapa 08 | administrador |

Pantallas de otros módulos que escriben o leen estas mismas filas:

| Dónde | Componente | Archivo | Qué hace con estas filas | Mapa |
|---|---|---|---|---|
| Post-Venta → Gestión → bloque Personal | `GrillaPersonal` | `frontend/src/pages/postventa/GrillaPersonal.tsx` | Crea, mueve de día, valoriza y quita **sillas vacías** (`addStaff`, `updateStaff`, `removeStaff`); enlace "Poner nombres →" a `/personas` | 04 |
| Post-Venta → Gestión (recursos) | `EventResourcesSection` | `frontend/src/pages/postventa/EventResourcesSection.tsx` | Suma el `amount` de las sillas al costo del evento (`getStaff`) | 04 / 06 |
| Post-Venta → Servicios | `ServiciosTab` | `frontend/src/pages/postventa/ServiciosTab.tsx` | La misma suma de sillas, para el margen | 04 |
| Dashboard | `DashboardPage` | `frontend/src/pages/dashboard/DashboardPage.tsx` | Costo de personal por evento (`getCostoPersonal`) | 13 |
| Personal → Liquidación | `FichasTab` (`EvaluacionesModal`, `TablaDeJornadas`) | `frontend/src/pages/personas/FichasTab.tsx` | Trae la planta al evento, edita horario, monto y "sin propina", y evalúa al cerrar | 08 |

## 3. Endpoints del motor

Todo vive en `PeopleController` (`@Controller('people')`, archivo `api-rest/src/people/people.controller.ts`). **No tiene ningún `@Roles` ni `@Public`.** Según `RolesGuard` (`api-rest/src/auth/roles.guard.ts`), una "Ruta sin @Roles → basta la sesión": cualquier usuario conectado de la empresa puede llamar estas rutas. El candado "solo administrador" existe solo en la app.

Todas usan `user.company_id`. Cada service de la tabla es `PeopleService.<método>`, y toda lectura o escritura pasa por `PeopleRepository`.

| Método y ruta | Controller y método | Service | Quién lo llama desde la app | Roles o @Public |
|---|---|---|---|---|
| GET `/people/roles?todos=true` | `findRoles` | `findRoles` (solo `type='personal'`; sin `todos`, solo los activos) | `getRoles` / `rolesQueryOptions`: `PersonasPage`, `PersonaFichaPage`, `CargosModal` | sesión |
| POST `/people/roles` | `createRole` | `createRole` (`limpiarNombre`; 23505 → "Ya existe el cargo") | `createRole`: `CargosModal` | sesión |
| PATCH `/people/roles/:id` | `updateRole` | `updateRole` (el repositorio filtra `type='personal'`) | `updateRole`: `CargosModal` (renombrar, prender) | sesión |
| DELETE `/people/roles/:id` | `deactivateRole` | `deactivateRole` (no borra: deja `is_active=false`) | `deactivateRole`: `CargosModal` | sesión |
| GET `/people/staff?evento=` | `findStaff` | `findStaff` | `getStaff`: `GrillaPersonal`, `EventResourcesSection`, `ServiciosTab`, `FichasTab` | sesión |
| GET `/people/staff?desde=&hasta=` | `findStaff` (mismo método, modo rango) | `findStaffRange` (todos los eventos y el staff del rango) | `getStaffSemana`: `SemanaTab`; `PersonaFichaPage` (el mes, y un año hacia adelante para saltar al próximo día) | sesión |
| POST `/people/staff` | `addStaff` | `addStaff`: crea una silla vacía, sienta en una silla, revive una fila dormida o hace un alta nueva | `addStaff`: `SemanaTab` (`poner`), `CalendarioDePersona` (`marcar`), `GrillaPersonal` | sesión |
| POST `/people/staff/proyectar-planta` | `proyectarPlanta` | `proyectarTodaLaPlanta` → `proyectarPlanta` por persona | `proyectarPlanta`: `SemanaTab`, una vez por sesión | sesión |
| PATCH `/people/staff/:id` | `updateStaff` | `updateStaff` (sin monto no se confirma; pasar a planta borra el monto) | `updateStaff`: `SemanaTab` (`cambiar`), `CalendarioDePersona` (`cambiarHorario`), `GrillaPersonal`, `FichasTab` | sesión |
| DELETE `/people/staff/:id?liberar=1` | `removeStaff` | `removeStaff` (libera la silla, duerme el día de patrón o borra; deshace el reparto de propina) | `removeStaff`: `SemanaTab` (`sacar`, con `liberar` si es evento), `CalendarioDePersona` (`desmarcar`), `GrillaPersonal`, `FichasTab` | sesión |
| GET `/people/costo-personal` | `costoPersonal` | `costoPersonal` → `costoPersonalPorEvento` del repositorio | `getCostoPersonal`: `DashboardPage` | sesión |
| POST `/people/sheets/:quotationId/traer-planta` | `traerPlanta` | `traerPlantaAlEvento` | `traerPlantaAlEvento`: `FichasTab` al abrir una ficha no cerrada | sesión |
| GET `/people/reviews?persona=` | `findReviews` | `findReviews` | `getReviews`: `PersonasPage`, `PersonaFichaPage`, `EvaluacionesDePersona` | sesión |
| POST `/people/reviews` | `createReview` | `createReview` (estrellas o nota; persona y evento de la empresa) | `createReview`: `EvaluacionesDePersona`, `FichasTab` (`EvaluacionesModal`) | sesión |
| GET `/people/day-notes?desde=&hasta=` | `findDayNotes` (el controller valida el formato `AAAA-MM-DD`) | `findDayNotes` | `getDayNotes`: `ResumenDelDia` | sesión |
| POST `/people/day-notes` | `createDayNote` | `createDayNote` (texto no vacío) | `createDayNote`: `ResumenDelDia` | sesión |
| PATCH `/people/day-notes/:id` | `updateDayNote` | `updateDayNote` | `updateDayNote`: `ResumenDelDia` (texto, hecho) | sesión |
| DELETE `/people/day-notes/:id` | `removeDayNote` | `removeDayNote` | `removeDayNote`: `ResumenDelDia` | sesión |
| GET `/people` | `findAll` | `findAll` (ficha completa, con banco y cuenta, más el cargo) | `getPeople` / `peopleQueryOptions`: `PersonasPage`, `SemanaTab` | sesión |
| GET `/people/:id` | `findOne` | `findOne` | `getPerson`: `PersonaFichaPage` | sesión |
| POST `/people` | `create` | `create` → `proyectarSiCorresponde` | `createPerson`: `PersonasPage` | sesión |
| PATCH `/people/:id` | `update` | `update` → `proyectarSiCorresponde` | `updatePerson`: `PersonaFichaPage` (guardar, cambiar estado, motivo de bloqueo) | sesión |
| DELETE `/people/:id` | `remove` | `remove` (rechaza si la persona tiene jornadas) | `deletePerson`: `PersonaFichaPage` | sesión |

Del mismo controller, pero documentados en el **mapa 08**:
- `GET /people/sheets`, `POST /people/sheets` y `POST /people/sheets/cerrar`.
- Las rutas `/people/pools*` y `POST /people/staff/del-evento-al-dia`.
- Las rutas `/people/payrolls*`.
- `GET /people/historico/graficos`, `GET /people/dias/mas-viejo`, `GET /people/pagado-por-mes` y `GET /people/:id/historial`.

El orden de declaración importa: `roles`, `staff`, `day-notes` y `:id/historial` se declaran antes de `@Get(':id')`. Así Nest no lee "roles" o "staff" como si fueran el id de una persona (lo dicen los comentarios del controller).

## 4. Tablas de la base de datos

| Tabla | Qué guarda | Lee o escribe | Migración que la crea o modifica |
|---|---|---|---|
| `people` | La persona. Datos: `name`; `rut` limpio y único por empresa (índice parcial `people_company_rut_uniq`); `phone`, `email`. Banco: `bank_code` (código CMF de 3 dígitos), `account_type`, `account_number` (texto de 5 a 20 dígitos). Trabajo: `default_role_id` → `management_resources`, `default_kind` (planta/freelance), horario habitual (`default_starts_at`, `default_ends_at`, `default_break_minutes`), `days_off` (0=domingo…6=sábado), `weekly_schedule` (jsonb por día). Situación: `status` + `blocked_reason` (un check exige motivo al bloquear) y `notes` | Lee y escribe | `68_personas.sql` (crea, con GRANT y RLS), `69_cargos_fusionados_con_recursos.sql` (FK del cargo), `75_horario_habitual_de_la_persona.sql`, `76_dias_libres_del_personal.sql`, `80_horario_por_dia_de_la_semana.sql` |
| `management_resources` (solo `type='personal'`) | Los **cargos**: nombre e `is_active`. Es la misma tabla de arriendos y servicios externos; Personal no lee ni escribe sus precios | Lee y escribe (solo las filas `personal`) | `69_cargos_fusionados_con_recursos.sql` (índice único por `company_id`, `type` y nombre). La tabla es del mapa 06 |
| `job_roles` | Nada: nació en la 68 y la 69 la borró al fusionar los cargos con los recursos | — | `68_personas.sql`, `69_cargos_fusionados_con_recursos.sql` |
| `event_staff` | **La tabla central**: una fila por persona por día. Valores NULL con significado: `quotation_id` NULL = día de staff (el "restaurante", evento permanente); `person_id` NULL = silla vacía; `day` NULL = silla "por ubicar" (solo en eventos). Además: `role_id`, `kind`, horario, `break_minutes`, `status`, `amount`, `notes`, `no_tip`, `tip_amount`, `tip_pool_id`, `payroll_id`, `tip_payroll_id`, `solo_propina`, `ajuste` ('trabaja'/'descansa') y `puesto_en`. Llaves: `person_id` con `ON DELETE RESTRICT`, `quotation_id` con `ON DELETE CASCADE`. Únicos: (`quotation_id`, `person_id`, `day`) y, en staff, (`company_id`, `person_id`, `day`) | Lee y escribe | `71_asignacion_de_personas_por_dia.sql` (crea), `74_restaurante_como_evento_permanente.sql`, `77_ciclo_propinas_nomina.sql`, `82_sin_propina_por_persona.sql`, `84_las_sillas.sql`, `85_sillas_sin_dia_al_primer_dia.sql`, `88_jornada_solo_propina.sql`, `89_cambio_de_dia_de_planta.sql`, `90_puesto_en.sql` |
| `person_reviews` | Evaluaciones: persona, evento opcional, `stars` de 1 a 5 (opcional) y `note`. No tiene índice único por persona y evento | Lee y escribe | `77_ciclo_propinas_nomina.sql` (crea), `79_cascada_de_las_tablas_nuevas.sql` (cascada con la cotización) |
| `day_notes` | Recados de un día: `day`, `quotation_id` opcional (NULL = recado del día completo), `text` y `done` | Lee y escribe | `78_notas_del_dia.sql`, `79_cascada_de_las_tablas_nuevas.sql` |
| `tip_pools` | Pozos de propina (mapa 08). Este lado solo lo toca de rebote: `removeStaff` limpia el reparto y deja `distributed_at` en NULL | Escribe de rebote | `77_ciclo_propinas_nomina.sql` |
| `quotations` | Solo lectura: que la cotización sea de la empresa (`esCotizacionDeLaEmpresa`) y qué días dura (`diasDeEvento`, para traer la planta) | Lee | Mapa 18 |
| `event_resources` | Ya **no** guarda personal: la 84 convirtió sus cupos de tipo `personal` en sillas y los borró. Queda solo con arriendos | — (antes sí) | `70_recursos_con_dia.sql`, `81_recursos_sin_dia_de_eventos_de_un_dia.sql`, `84_las_sillas.sql` |

Todas las migraciones se aplican a mano en Supabase (mapa 18). No verifiqué cuáles están aplicadas en cada base.

## 5. Flujos principales

### 5.1 Cargar, editar, bloquear o borrar a una persona

1. **Pantalla**: Staff → "Nueva persona" (`PersonasPage` abre `PersonaForm` en `Modal`), o `/personas/:id` → Datos.
2. **App**: `createPerson` o `updatePerson` en `frontend/src/services/people.service.ts`. Al guardar se invalida la clave `["people"]`.
3. **Endpoint**: `POST /people` o `PATCH /people/:id`, validado por `CreatePersonDto`:
   - el RUT pasa por `RutChileno`;
   - la cuenta, de 5 a 20 dígitos, y el banco, de 3;
   - `blocked_reason` es obligatorio si `status='bloqueada'`.
4. **Motor**: `PeopleService.create` o `update` → `prepararDatos` → `limpiarNombre`.
   - `prepararDatos` deja el RUT en forma limpia con `normalizarRut`.
   - Si la cuenta es `cuenta_rut`, el número pasa a ser el RUT sin dígito y `bank_code` queda en '012'.
   - Al crear, si no vienen, pone `default_kind='freelance'` y `status='activa'`.
   - Al desbloquear, borra `blocked_reason`.
5. **Repository**: `PeopleRepository.create` o `update` sobre `people`. Si el RUT choca (23505), `errorDeRutRepetido` responde "Ese RUT ya está cargado en <nombre>".
6. **Efecto automático**: `proyectarSiCorresponde` → `proyectarPlanta` (flujo 5.2). Si falla, solo queda en el log: la ficha ya se guardó.
7. **Situación**: el `ChipDeEstado` de la cabecera manda la ficha completa con el nuevo `status`. El motivo de bloqueo se guarda al salir del campo.
8. **Borrar**: `ConfirmInline` → `DELETE /people/:id` → `remove` cuenta las jornadas con `cuantasJornadas`. Si hay alguna, responde 400: "No se puede borrar: ya trabajó N días… Márcala no disponible".

### 5.2 La planta se carga sola, un año hacia adelante

1. **Disparo**: se proyecta en dos momentos.
   - Al abrir Planificación: `useEffect` de `SemanaTab` con la llave `planta-proyectada` en `sessionStorage`, así que corre una vez por sesión.
   - Al crear o editar una persona (5.1). Quien deja de ser planta o se desactiva se limpia al guardar su ficha, no al abrir la sábana.
2. **Endpoint**: `POST /people/staff/proyectar-planta` → `proyectarTodaLaPlanta`. Toma a la gente con `status='activa'` y `default_kind='planta'` y proyecta a todos en paralelo.
3. **Motor**: `proyectarPlanta` corre por cada persona, desde hoy (hora de Santiago) hasta 365 días más, sobre sus filas de `findDePersonaDesde`:
   - Se salta cualquier día que tenga `ajuste` (cambio de día hecho a mano).
   - Un día **debe venir** si la persona está activa, es planta, no es su día libre (`days_off`) y ese día no la mandaron a un evento (`laMandaronAUnEvento`).
   - Si debe venir y no hay fila, crea una jornada `planta`, `confirmado`, con `amount` NULL, el cargo de la ficha y el horario de `horarioDelDia`.
   - Si hay fila pero el horario o el cargo no calzan con la ficha, la corrige. Solo lo hace si `laPuedeQuitarLaProyeccion` lo permite (sin plata ni nómina).
   - Si no debe venir, quita la fila, con la misma condición.
4. **Repository**: `addStaffEnLote` y `removeStaffEnLote` hacen un solo viaje cada uno; las correcciones van de a una con `updateStaff`.
5. **Tabla**: `event_staff`, filas con `quotation_id` NULL.
6. **App**: si `creadas > 0`, vuelve a pedir la semana.

### 5.3 Gestión pone las sillas; Planificación les pone nombre (evento)

1. **Gestión (mapa 04)**: `GrillaPersonal` llama `addStaff` sin `person_id`.
   - `PeopleService.addStaff` exige `quotation_id` y `role_id`, y crea una silla vacía: `freelance`, `por_confirmar`, `amount` = valor estimado.
   - Sin evento responde "El staff no lleva sillas vacías…"; sin cargo, "Una silla vacía necesita su cargo".
2. **Sábana**: `SemanaTab` arma una fila por evento y cargo con las filas de `event_staff` del rango.
   - Deja fuera la planta traída por la ficha y las filas dormidas o solo-propina (`esPlanificacion`).
   - `necesita` cuenta todas las sillas del día, con y sin nombre.
   - Las sillas sin día suman al aviso "+N sin día" y se reparten en Gestión.
3. **Casilla**: `CasillaAbierta` ofrece en `AgregadorDeItems` solo a gente `activa` que no esté ya en la casilla ni ocupada ese día. En un evento tampoco ofrece a la planta que, según su patrón, tiene turno ese día (`conTurnoDeRestaurante`).
4. **App**: la mutación `poner` revisa y pinta antes de llamar al motor.
   - Revisa el cruce: nadie puede estar en staff y en un evento el mismo día.
   - Si la persona es de planta y va a un evento, avisa con un `toast` que ese día se paga aparte.
   - Pinta una fila provisoria (freelance, en eventos) y llama `addStaff` con `amount: null`.
5. **Motor**: `addStaff` → `sonDeLaEmpresa` → `findSillaVacia`.
   - `findSillaVacia` busca primero una silla del mismo cargo y día; si no hay, una sin día.
   - Si la encuentra, **la ocupa**: `updateStaff` sobre esa fila con la persona, `puesto_en`, `kind` (freelance si `esJornadaExtra`), el monto de la silla, `por_confirmar` y el horario.
   - Si no hay silla, inserta una fila nueva: pusiste 4 donde había 3, y ahora son 4.
6. **App**: la respuesta del servidor reemplaza a la fila provisoria en su lugar, sin volver a pedir la semana (25-08). Después:
   - el monto se escribe con `cambiar` → `PATCH amount`;
   - se confirma con `PATCH status='confirmado'`, que el motor rechaza si no hay monto.
7. **Sacar**: basurero → `sacar` → `DELETE /people/staff/:id?liberar=1` → `removeStaff`.
   - La fila vuelve a ser silla vacía (sin persona, sin horario, sin propina) y el cupo queda.
   - Si la persona tenía fila solo-propina ese día, se borra, y el pozo del día vuelve a quedar sin repartir.
8. **Efecto en otros módulos**: el costo del evento en Gestión, Servicios y Dashboard es la suma del `amount` de esas mismas filas.

### 5.4 El día de staff: poner, preguntar, cobrar y quitar

1. **Puertas**: hay dos, y se comportan igual.
   - La casilla de las bandas de `SemanaTab`. La banda "Personal de planta" solo ofrece gente de planta de ese cargo; para traer a alguien de fuera está "Personal Staff".
   - La pestaña "Su calendario" de `/personas/:id` (`CalendarioDePersona` → `MiniCalendario`).
2. **La pregunta**: si la persona es de planta y el día no le corresponde (`esDiaExtra`: su día libre o un cargo que no es el suyo), se abre `PreguntaDiaExtra`: "¿Este día va como planta o como freelance?".
   - **Planta**: viaja `kind='planta'` con `ajuste='trabaja'`; nace confirmada y sin monto.
   - **Freelance**: viaja `kind='freelance'`; nace por confirmar y sin monto.
   - Desde la ficha, un planta en su día normal va como planta con `ajuste='trabaja'`.
3. **Motor**: `addStaff` sin evento busca primero una fila dormida con `findDormida` y, si existe, la revive con `cambiosParaRevivir`; si no, inserta. El `status` por defecto: la planta en su jornada normal (o con `ajuste='trabaja'`) nace `confirmado`; lo demás, `por_confirmar`.
4. **El freno del monto**: `intentarCerrar` de `CasillaAbierta` no deja cerrar mientras haya un freelance sin monto; la cajita vibra y avisa (04-09). En el motor, `updateStaff` rechaza confirmar sin monto.
5. **Horas**: `HorarioDelDia` (casilla) y el editor del `MiniCalendario` cambian `starts_at`, `ends_at` y `break_minutes`.
   - `AdvertenciaHorasSemana` avisa si la semana de planta queda sobre la jornada definida.
   - `diasConExceso` pinta el reloj rojo en los días que se pasaron.
6. **Quitar**: `removeStaff` decide en el motor.
   - Día de staff, `planta` y sin `ajuste='trabaja'` → la fila se **duerme** (`ajuste='descansa'`) para que la proyección no la recree.
   - Día agregado a mano (`trabaja`) o freelance → se borra.
   - Si ya tenía propina → `clearTips`, y el pozo vuelve a quedar sin repartir.
   - Si la jornada está en una nómina → 400 "Esa jornada ya está en una nómina".

### 5.5 Resumen del día y recados

1. **Pantalla**: en `SemanaTab`, pinchar la fecha de una columna abre `ResumenDelDia` debajo de la grilla.
2. **Eventos del día**: son los que caen en esa fecha o los que tienen gente puesta ese día (preparativo, desarme).
   - Por cada evento se piden `getQuotationById` (los `items`) y `getEventServiceTimes` (de `logistics.service`).
   - `serviciosDelDia` arma las categorías con la **misma clave** de la Ficha de Cocina.
   - `setEventServiceTime` guarda la hora, y queda igual en las dos pantallas.
3. **Gente**: una tabla de Personal Staff por evento y otra de planta, con la cobertura "n de m" que calcula `coberturaDelDia` en `SemanaTab`. La gente puesta en un evento que ya no está aceptado ni realizado sale como huérfana, para desconvocarla.
4. **Recados**: `getDayNotes(dia, dia)` → `GET /people/day-notes` → `findDayNotes` → `day_notes`. Se agregan, marcan como hechos y borran con `createDayNote`, `updateDayNote` y `removeDayNote`.

### 5.6 Evaluar a una persona

1. **Al cerrar una ficha (mapa 08)**: `EvaluacionesModal`, dentro de `FichasTab`, recorre a la gente con nombre. Por cada persona con estrellas o nota llama `createReview` con el evento, y al final `cerrarFicha`. Se puede saltar a cualquiera.
2. **Desde la ficha**: `/personas/:id` → Evaluaciones → `createReview` con evento opcional (un `SelectWithSearch` sobre `eventosQueryOptions` de `FichasTab`).
3. **Motor**: `createReview` exige estrellas o nota ("Una evaluación lleva estrellas o nota"). Comprueba la persona con `findOne` y el evento con `sonDeLaEmpresa`, y guarda en `person_reviews`.
4. **Lectura**: `getReviews` da el promedio simple, calculado solo sobre las evaluaciones con estrella. Se muestra en `PersonasPage` (lista) y `PersonaFichaPage` (cabecera). `Estrellas` muestra "sin evaluar" en vez de cero.

## 6. Reglas de negocio acordadas

**La persona y el cargo**

- **Planta o freelance, y el cargo, son valores por defecto de la persona; los del día se guardan en la jornada.** Camila Ganga fue Recepción el 2 de agosto y Garzón el 6. Evidencia: `docs/arquitectura/10_MODULO_DE_PERSONAS.md` §2 "La persona"; comentario de `EventStaff` en `api-rest/src/people/entities/person.entity.ts`; `71_asignacion_de_personas_por_dia.sql`.
- **Un cargo es solo un nombre.** No lleva porcentaje de propina (Felipe, 14-08) ni precio (Felipe, 17-08: *"si eso lo asignaremos día a día, caso a caso"*). Vive en `management_resources` con `type='personal'` desde la fusión (Felipe, 14-08: *"FUSIONALO ES LO MISMO TODO"*). Evidencia: `CreateJobRoleDto` y `UpdateJobRoleDto` en `dto/job-role.dto.ts`; `69_cargos_fusionados_con_recursos.sql`; `CLAUDE.md` ("Se creó una tabla de cargos que el sistema ya tenía").
- **Un cargo se apaga, no se borra**, para no dejar fichas apuntando a la nada. Además, `updateRole` solo toca filas `personal`: así nadie renombra un arriendo creyendo que es un cargo. Evidencia: `PeopleController.deactivateRole`, `PeopleService.deactivateRole`, `PeopleRepository.updateRole`.
- **El RUT se revisa de verdad.** Se revisan la forma, el dígito verificador (módulo 11) y la K mayúscula. Se rechazan los reservados que pasan la matemática: el `55555555-5` del SII y los de un dígito repetido. Se guarda limpio y no se repite en la empresa; si choca, el error dice de quién es. Al crear, es opcional. Evidencia: `RESERVADOS` y `revisarRut` en `api-rest/src/people/utils/rut.ts`; `RutChileno` en `dto/create-person.dto.ts`; índice `people_company_rut_uniq`; `errorDeRutRepetido`; doc §4 y §10.8.
- **CuentaRUT: el número es el RUT sin dígito y el banco es siempre BancoEstado (012).** Sin RUT no se puede elegir. Evidencia: `PeopleService.prepararDatos`; comentario "La CuentaRUT se llena sola" en `PersonaForm`.
- **El número de cuenta es texto, de 5 a 20 dígitos**: hay cuentas que parten en `0051`. Evidencia: `CreatePersonDto.account_number`; check `people_account_number_chk` (68).
- **El nombre se limpia de espacios**: "Valentina Salgado" y "Valentina Salgado " eran dos personas en el Excel. Evidencia: `limpiarNombre` en `people.service.ts`.
- **Bloquear exige motivo, no impide pagar, y al desbloquear el motivo se borra.** "No disponible" no es una mala nota. Evidencia: `CreatePersonDto.blocked_reason`; check `people_bloqueada_con_motivo`; `PeopleService.update`; `utils/estadoPersona.ts` ("No llamar más. Igual se le paga lo trabajado"); doc §4 "Las estrellas y los estados".
- **Quien ya trabajó no se borra: se marca no disponible** (revisión del 16-08). Evidencia: `PeopleService.remove`; FK `ON DELETE RESTRICT` de `event_staff.person_id` (71).
- **El nombre y el color de cada estado de persona viven en un solo lugar.** Evidencia: `utils/estadoPersona.ts`; regla "estado de persona escrito a mano", con techo 0, en `frontend/scripts/portero-kit-de-la-casa.sh`.

**Horario y proyección de la planta**

- **El horario baja por una escalera**: lo escrito ese día > el horario de ese día de la semana (`weekly_schedule`) > el horario único de la ficha > 09:00–19:00 con 1 hora de colación. Evidencia: `horarioDelDia` en `utils/alta-de-jornada.ts` y su gemelo `horarioHabitual` en `MiniCalendario.tsx`; migraciones 75 y 80.
- **En la ficha se marcan los días que trabaja; en la base se guardan los libres** (`days_off`). Evidencia: comentario de `PersonaForm` (corrección de Felipe, 15-08: "es más intuitivo"); doc §2.
- **La planta se proyecta a 12 meses** (Felipe, 15-08: *"no es mejor proyectarlo doce meses por una sola vez cuando defino el horario de la gente"*). Corre en lote (18-08: "se demora como 12 segundos"), en paralelo (18-08: la sábana tardaba 3,1 segundos) y una vez por sesión (18-08: "la navegabilidad está más lenta"). El pasado nunca se toca. Evidencia: `proyectarPlanta`, `proyectarTodaLaPlanta`, `addStaffEnLote`; `useEffect` de `SemanaTab`.
- **La proyección solo borra lo que ella misma puso**: jornadas de planta sin monto, sin propina y sin nómina. El 16-08, guardar la ficha de un freelance para cargarle el RUT le borró días con propina ya repartida. Evidencia: `laPuedeQuitarLaProyeccion`.
- **La planta que la ficha de liquidación trae a un evento no sale del staff.** El 18-08 la proyección borró el turno de cuatro personas. Evidencia: `laMandaronAUnEvento`.
- **El cargo de la ficha manda en los días que puso la máquina** (18-08: Camila pasó de Cocina a Administrador y sus 260 días seguían en Cocina). Evidencia: `cargoDistinto` en `proyectarPlanta`.
- **El cambio de día es sagrado**: si la fila tiene `ajuste`, la proyección no la crea, no la borra ni la corrige (24-08, migración 89). Evidencia: `proyectarPlanta` (`if (yaEsta?.ajuste) continue`); `cambio-de-dia.spec.ts`.
- **Quitar un día vale igual desde cualquier puerta.** La regla vive en el motor: duerme el día de patrón y borra el día agregado a mano o el freelance (04-09). Antes, el día quitado desde el modal resucitaba. Evidencia: `PeopleService.removeStaff`; doc §11; `alta-de-jornada.spec.ts`.
- **En staff, toda alta revive la fila dormida** en vez de chocar con "esa persona ya está puesta ese día" (04-09). Evidencia: `findDormida` + `cambiosParaRevivir` en `addStaff`.

**La jornada del día**

- **La pregunta del día extra** (Felipe, 04-09: *"creo que las reglas están mal, quizás es más fácil preguntar"*). En staff, cuando un planta viene en un día que no le corresponde, se pregunta si va como planta o como freelance. `esJornadaExtra` quedó solo como detector de cuándo preguntar. En eventos, el refuerzo sigue naciendo freelance, con aviso. Evidencia: doc §11; `PreguntaDiaExtra.tsx`; `addStaff` (`dto.kind ?? …`).
- **La jornada normal de planta nace confirmada; el día extra, por confirmar** (Felipe, 18-08: "no es una oferta, es su turno"). El cambio de día también nace confirmado (24-08). Evidencia: el `status` por defecto en `addStaff`; `jornada-extra.spec.ts`.
- **Sin monto no se confirma** (Felipe, 15-08). Lo ataja la casilla con un `toast` y el motor con un 400. Además, la casilla no se cierra mientras haya un freelance sin monto (04-09: "sin salida"). Evidencia: `PeopleService.updateStaff`; `intentarCerrar` en `CasillaAbierta`.
- **Pasar a planta borra el monto**, salvo que venga uno en el mismo cambio: esa es la asignación extra (Felipe, 18-08). Evidencia: `updateStaff`.
- **La jornada de planta no lleva monto**; la caja de monto solo aparece en freelance. Evidencia: `CasillaAbierta` (Felipe, 15-08).
- **El tipo del día es una etiqueta, no un botón** (Felipe, 15-08: "tampoco se nota que se puede cambiar"). Evidencia: `CasillaAbierta`.
- **La semana laboral y el reloj rojo.** Solo suman las jornadas `planta`, estén donde estén; el freelance es un acuerdo aparte. La marca queda en el día que causó el exceso (04-09). Evidencia: `resumenSemanaDePlanta` y `diasConExceso` en `AdvertenciaHorasSemana.tsx`.
- **El tope de 12 horas es informativo**: avisa, no frena. Evidencia: `HorarioDelDia` en `SemanaTab.tsx`.

**Sillas y planificación**

- **El plan y la realidad viven en una sola tabla** (Felipe, 17-08: *"una tabla que primero se rellena parcialmente solo con cargos, días, valor, y luego en planificación se le pone apellido a esos cargos"*). Una silla vacía necesita evento y cargo. Al sentar a alguien se usa primero la silla de ese día y después una por ubicar; si no queda ninguna, nace otra. Sacar a alguien desde Planificación **libera** la silla. Evidencia: `addStaff`, `findSillaVacia`, `removeStaff(liberar)`; `84_las_sillas.sql`; doc §2 "Las sillas".
- **El costo es uno solo, por construcción**: las sillas con nombre cuentan al monto acordado y las vacías al estimado, nunca con propina. Evidencia: `costoPersonalPorEvento`; comentario de `EventResourcesSection`.
- **Una silla vacía jamás llega a liquidación ni a nómina**, y al cerrar la ficha las vacías se retiran (mapa 08). Evidencia: `cerrarFicha` → `deleteSillasVacias`; comentario de `person_id` en la 84.
- **En un evento, lo planificado es siempre freelance.** Por eso `kind='planta'` en un evento significa "traída por la ficha, solo para liquidación", y la sábana, Gestión y el calendario la esconden. Medido en producción el 18-08: 4 filas, las 4 del #423. Evidencia: `esPlanificacion` en `frontend/src/pages/personas/estadoDelPago.ts`; doc §2 "La planta que la ficha trae a un evento".
- **Traer la planta a un evento se puede repetir sin duplicar.** Solo trae a la planta con turno de staff esos días que no esté dormida, y no repite a quien ya está; nace `confirmado` y sin monto. El 04-09 el imán trajo a Soledad un día que descansaba y le repartió propina. Evidencia: `traerPlantaAlEvento`; `plantaEnDias` (`.or('ajuste.is.null,ajuste.neq.descansa')`).
- **La sábana es mensual y fija, desde el domingo** (Felipe, 15-08: *"dejemos la vista mensual fija"*). Evidencia: `RANGO = 28` y `domingoDe` en `SemanaTab`.
- **Los colores de la sábana**: verde solo si están todos y todos confirmados; ámbar mientras alguien esté por confirmar; lila el refuerzo por día y azul la planta (15-08 y 17-08). Evidencia: `renderCelda` en `SemanaTab`.
- **La casilla solo ofrece a los disponibles** (Felipe, 18-08: *"si el de planta tiene turno no debería mostrármelo"*). Los bloqueados y los no disponibles no aparecen, pero no se borran. Evidencia: `disponibles` en `CasillaAbierta`.
- **La casilla ordena por llegada** (Felipe, 25-08: *"que el personal que voy agregando vaya quedando en el último lugar"*), usando `puesto_en`. Evidencia: `enCasilla` en `SemanaTab`; `90_puesto_en.sql`.
- **En el calendario de la persona, el staff freelance confirmado queda cerrado** (se cambia desde la casilla), y los días de evento son de solo lectura (17-08). Evidencia: `staffCerrado` y `soloLectura` en `MiniCalendario`.
- **Sacar a alguien no deja plata en el aire**: si tenía propina, el pozo vuelve a quedar sin repartir. Lo que ya está en una nómina no se saca (revisión del 16-08). Evidencia: `removeStaff`.
- **En pantalla se dice "día de staff", no "día de restaurante"** (Felipe, 08-09). Por dentro, el código sigue diciendo restaurante. Evidencia: doc §2 "Los tres estados".

**Evaluaciones y recados**

- **Estrellas o nota.** La nota puede ir sin estrella, se muestra el promedio simple y "sin evaluar" no significa malo. Evidencia: `createReview`; comentarios de `EvaluacionesDePersona.tsx`; doc §4.
- **Los recados son del día**, opcionalmente de un evento, y se marcan como hechos sin borrarlos. Evidencia: `78_notas_del_dia.sql`; `createDayNote` (texto no vacío).
- **El módulo es solo del administrador**, porque ahí viven las cuentas bancarias (14-08). Evidencia: comentario de `"people"` en `permissions.ts`; comentario de la ruta en `App.tsx`. Ver el riesgo 8.

## 7. Conexiones con otros módulos

**Quién lo usa**

- **Post-Venta → Gestión (mapa 04)**: `GrillaPersonal` escribe las sillas en `event_staff`. `EventResourcesSection` y `ServiciosTab` suman el `amount` de esas filas al costo y al margen del evento. Un monto acordado en Planificación mueve el margen que ven Gestión y Servicios.
- **Dashboard (mapa 13)**: `GET /people/costo-personal` alimenta el costo de personal por evento. `pagado-por-mes` es del mapa 08.
- **Liquidación, Nómina e Histórico (mapa 08)**: leen las mismas filas, y la jornada que se liquida es la que se planificó acá.
  - Al abrir una ficha no cerrada, llaman a `traer-planta`.
  - `cerrarFicha` borra las sillas vacías.
  - `TablaDeJornadas` edita horario, monto y `no_tip` con el mismo `updateStaff`; la colación es la misma fila (`SelectorColacion`, según `CLAUDE.md`).
  - Los sellos `payroll_id` y `tip_payroll_id` bloquean `removeStaff`.

**A quién usa**

- **Cotizaciones (mapas 01 y 02)**: `SemanaTab` pide `getQuotations` con los estados `ACEPTADA` y `REALIZADA`, y `ResumenDelDia` pide `getQuotationById`. El motor lee `quotations` para saber a qué empresa pertenece cada evento y qué fechas tiene.
- **Logística e inventario (mapa 06)**:
  - Los cargos son filas de `management_resources`; en esa pantalla, `RecursosTab` esconde las de tipo `personal`.
  - `SemanaTab` lee el catálogo con `getManagementResources`, no con `/people/roles`.
  - `ResumenDelDia` lee y escribe los horarios de servicio con `getEventServiceTimes` y `setEventServiceTime`, compartidos con la Ficha de Cocina (mapa 04).
- **Kit de la casa (mapa 17)**:
  - Piezas: `AgregadorDeItems`, `SelectWithSearch`, `NumberInput`, `HoraInput`, `SelectorColacion`, `RutInput`, `Estrellas`, `Modal`, `ConfirmInline`, `ChipDeEstado`, `IconoWhatsApp`, `GrillaDeDias`, `Toast`, `PageSkeleton`.
  - Utilidades: `utils/rut`, `utils/bancos`, `utils/estadoPersona`, `utils/phone`, `utils/searchMatch`, `utils/dates` (`hoyEnChile`), `utils/apiErrors`.
- **Acceso (mapa 15)**: en la app, `SECTION_ROLES.people`, `PermissionGuard` y `Sidebar`; en el motor, `AuthGuard` y `RolesGuard`.

**Efectos automáticos y cascadas**

- **No hay relojes ni correos**: no existe ningún `*-cron.service.ts` en `api-rest/src/people`. Lo único automático es la proyección de la planta, que se dispara al guardar una persona y al abrir la sábana.
- **Borrar una cotización** borra en cascada sus filas de `event_staff` (71) y de `staff_sheets`, `tip_pools`, `person_reviews` y `day_notes` (79).
- **Anular una cotización o volverla a pre-venta no limpia nada**: la gente queda puesta, y `ResumenDelDia` la muestra como huérfana para desconvocarla.
- **Guardar una persona de planta vuelve a proyectar su año**, y eso cambia lo que muestran la sábana, su calendario y Liquidación.

## 8. Zonas de riesgo: si tocas esto, cuidado con aquello

1. **Si tocas** `proyectarPlanta`, `laPuedeQuitarLaProyeccion` o `laMandaronAUnEvento`, **se afectan** los días de staff con propina o nómina, los cambios de día y la planta traída a eventos, **porque** la proyección crea y borra en lote cada vez que se guarda una ficha o se abre la sábana. Ya pasó dos veces: el 16-08 borró días con propina de un freelance al cargarle el RUT, y el 18-08 borró el turno de cuatro personas de planta del #423. Evidencia: `api-rest/src/people/people.service.ts` (`proyectarPlanta`, `laPuedeQuitarLaProyeccion`, `laMandaronAUnEvento`); `tests/proyeccion-no-borra-lo-ajeno.spec.ts`, `tests/cambio-de-dia.spec.ts`.
2. **Si tocas** el significado de `kind='planta'` dentro de un evento, o `esPlanificacion`, **se afectan** la sábana, la grilla de Gestión, el calendario de la persona, la fila provisoria de `poner` y la proyección, **porque** `kind` es la única marca que separa a la planta traída por la ficha (solo para liquidación) de lo planificado. El 18-08 la sábana mostró a la planta del #423 como cupos. El 25-08 la fila provisoria con `kind` de planta quedaba invisible. Evidencia: `frontend/src/pages/personas/estadoDelPago.ts` (`esPlanificacion`); `onMutate` de `poner` en `SemanaTab.tsx`; `laMandaronAUnEvento`.
3. **Si tocas** `removeStaff`, **se afectan** el pozo de propina del día (se desreparte), la fila solo-propina y la proyección, **porque** esa función decide entre liberar la silla, dormir el día de patrón o borrar. Si borra un día de patrón, la proyección lo recrea: pasó con el modal hasta el 04-09. Evidencia: `PeopleService.removeStaff`; `tests/alta-de-jornada.spec.ts`; commit `41b38c3`.
4. **Si tocas** `addStaff` o `findSillaVacia`, **se afecta** el costo del evento en Gestión, Servicios y Dashboard, **porque** sentar a alguien debe consumir una silla. Si no la consume, el plan se infla: el QA del 17-08 lo pilló en la cotización 415 ("3 × $27.000 = $81.000" con 4 personas y dos tarifas). Evidencia: `addStaff`, `PeopleRepository.findSillaVacia`, `costoPersonalPorEvento`; `84_las_sillas.sql`.
5. **Si tocas** una función gemela, **se afecta** su pareja del otro lado, **porque** están duplicadas a mano y tienen que decir lo mismo:
   - `horarioDelDia` (`utils/alta-de-jornada.ts`) ↔ `horarioHabitual` (`MiniCalendario.tsx`); el comentario lo advierte: "si cambia uno, cambia el otro".
   - `esJornadaExtra` (`people.service.ts`) ↔ `esDiaExtra` (`PreguntaDiaExtra.tsx`).
   - `minutosTrabajados` (motor) ↔ `horasTrabajadas` (`components/inputs/HoraInput`); con estas horas se reparte la propina (mapa 08).
6. **Si tocas** el candado de `updateStaff` o `intentarCerrar` de `CasillaAbierta`, **se afecta** la nómina, **porque** una jornada freelance confirmada sin monto llega a pagarse sin saber cuánto. El caso Alejandra/Soledad (04-09) nació de una regla que hacía nacer confirmada la jornada y se saltaba el candado. Evidencia: `updateStaff`; doc §11; `alta-de-jornada.spec.ts`.
7. **Si agregas** una ruta GET con texto fijo en `PeopleController` después de `@Get(':id')`, **se afecta** esa ruta, **porque** Nest resuelve las rutas en orden y la leerá como el id de una persona. Evidencia: comentarios "Van ANTES de las rutas con :id" en `people.controller.ts`.
8. **Si confías** en que el motor protege el módulo por rol, **se afectan** los RUT y las cuentas bancarias de toda la gente, **porque** `PeopleController` no tiene `@Roles`. Cualquier usuario con sesión, recepción incluida, puede llamar `GET /people` y recibir las fichas completas. El "solo administrador" vive solo en la app. Evidencia: `api-rest/src/auth/roles.guard.ts`; cero `@Roles` en `people.controller.ts`; `SECTION_ROLES.people` en `permissions.ts`.
9. **Si tocas** `updateStaff` o `update` de persona, **se afecta** el aislamiento por empresa, **porque** `sonDeLaEmpresa` no se llama en ninguno de los dos. Se llama en `addStaff`, `traerPlantaAlEvento`, `createReview`, `createDayNote` y en métodos del mapa 08. `updateStaff` acepta `role_id` y `update` acepta `default_role_id` sin revisar a qué empresa pertenecen: un id de cargo de otra empresa entraría igual. Es el mismo hueco que la revisión del 16-08 cerró en `addStaff`. Evidencia: `PeopleService.sonDeLaEmpresa` y sus llamadas. PLAUSIBLE, no probado.
10. **Si tocas** `PeopleService.remove`, **se afecta** el borrado de una persona evaluada pero sin jornadas, **porque** `remove` solo cuenta filas de `event_staff`. En cambio, `person_reviews.person_id` y `payroll_people.person_id` apuntan a `people` sin `ON DELETE` (77). La base rechazaría el borrado con 23503 y saldría un 500 genérico: el mismo síntoma que la revisión del 16-08 quiso evitar. Hoy se puede evaluar sin evento desde `EvaluacionesDePersona`. PLAUSIBLE, no probado.
11. **Si tocas** el cruce de `poner` en `SemanaTab`, **se afecta** la doble asignación, **porque** el motor no impide que la misma persona esté en staff y en un evento el mismo día. Los índices únicos son por evento o por staff, y la 74 lo permite a propósito. `GrillaPersonal` o una llamada directa no pasan por ese cruce. Además, el error de choque no dice dónde está la persona (ítem 2 del cajón del doc). Evidencia: `poner.mutationFn`; `74_restaurante_como_evento_permanente.sql`; `PeopleRepository.addStaff`.
12. **Si creas** una tabla nueva para este módulo, **se afecta** la pantalla, que se queda cargando para siempre, **porque** sin `GRANT` a `service_role` el motor recibe el error 42501. Y si su FK a `quotations` no lleva `ON DELETE CASCADE`, la cotización ya no se puede borrar. Evidencia: comentarios de `68_personas.sql`, `77_ciclo_propinas_nomina.sql` y `79_cascada_de_las_tablas_nuevas.sql`.
13. **Si agregas** líneas a `people.service.ts`, a `FichasTab.tsx` o a un archivo cerca de las 800 líneas, **se afecta** el CI, **porque** el portero congela `people.service.ts` en 2040 líneas (hoy 2008) y `FichasTab.tsx` en 1599 (hoy 1549). Además, hay exactamente 27 archivos sobre 800 líneas con techo 27: cualquier archivo nuevo que cruce ese umbral hace fallar el CI. Evidencia: `congelar` y `techoGrandes` en `frontend/scripts/portero-kit-de-la-casa.sh`.
14. **Si cambias** la clave `["people", "staff-semana", domingo, RANGO]`, o `RANGO`, en una sola pantalla, **se desincronizan** `SemanaTab` y `PersonaFichaPage`, **porque** las dos usan esa misma clave de caché para mostrar los cambios al instante. Evidencia: `clave` en `CalendarioDePersona`; `refrescar` en `SemanaTab`.

## 9. Pruebas que lo protegen

**Motor** (Jest, en `api-rest/src/people/tests/`; corre en CI con `npx jest --silent`):
- `alta-de-jornada.spec.ts`: sin monto no se confirma y la planta no lo necesita; sacar un día de patrón lo duerme; el día `trabaja` y el freelance se borran; `cambiosParaRevivir` como planta y como freelance.
- `jornada-extra.spec.ts`: `esJornadaExtra` (día libre, cargo ajeno, evento; un freelance nunca es día extra), el `status` con que nace la jornada, y `laMandaronAUnEvento`.
- `cambio-de-dia.spec.ts`: `proyectarPlanta` no borra el día `trabaja`, no recrea ni corrige el `descansa`, y sin ajuste quita el domingo que puso la máquina.
- `proyeccion-no-borra-lo-ajeno.spec.ts`: `laPuedeQuitarLaProyeccion` con freelance, monto, propina, nómina, una fila vieja sin `kind` y monto cero.
- `rut.spec.ts`: dígito verificador, RUT reservados, limpiar y mostrar.
- Son del mapa 08 pero tocan estas filas: `invitados-del-evento.spec.ts`, `reparto-por-puntos.spec.ts`, `consolidar-por-rut.spec.ts`, `nomina-solo-lo-liquidado.spec.ts`, `reabrir-liquidacion.spec.ts`, `graficos-historico.spec.ts`, `pagado-por-mes.spec.ts`.

**App** (Vitest; corre en CI con `npm run test`):
- `frontend/src/pages/personas/estadoDelPago.test.ts`: `esPlanificacion` en tres casos (staff, planta en evento, freelance en evento). El `estadoDelPago` del mismo archivo es del mapa 08.
- `frontend/src/components/inputs/RutInput.test.tsx` y `frontend/src/utils/rut.test.ts`: el campo de RUT y la CuentaRUT.
- `frontend/src/utils/bancos.test.ts`: la lista de bancos.
- `frontend/src/components/inputs/HoraInput.test.tsx`: normalizar y guardar la hora.
- `frontend/src/components/personas/TablaDeJornadas.test.tsx` y `frontend/src/pages/personas/porConcepto.test.ts`: del mapa 08.

**Lo importante que NO está cubierto:**
- `addStaff` con sillas: sentar en la silla del día o en una por ubicar, crear una silla de más, rechazar sillas sin evento o sin cargo.
- `removeStaff`: el modo `liberar=1`, el desreparto del pozo al sacar a alguien con propina y el borrado de la fila solo-propina al salir de un evento.
- `traerPlantaAlEvento`: que no duplique y que ignore a las dormidas.
- `create`, `update` y `remove` de persona: `prepararDatos` (CuentaRUT), `limpiarNombre`, `errorDeRutRepetido`, el motivo que se borra al desbloquear y el rechazo por jornadas.
- `proyectarPlanta`: el salto de los días con evento, la corrección de cargo y horario, y la limpieza del futuro de quien deja de ser planta o se desactiva.
- Cálculos de horario y horas: `horarioDelDia` y su gemelo `horarioHabitual`, `esDiaExtra`, `resumenSemanaDePlanta` y `diasConExceso` (reloj rojo).
- `esPlanificacion` con `solo_propina` o con `ajuste='descansa'` (los nombres de sus pruebas no los mencionan).
- Las pantallas `SemanaTab`, `CasillaAbierta`, `MiniCalendario` y `PersonaFichaPage`: el armado de filas y "necesita", la lista de disponibles, el cruce, el freno del monto y las filas provisorias.
- `costoPersonalPorEvento`, las notas del día, `createReview`, el orden de rutas y la falta de roles del controller.

## 10. Deuda y rarezas conocidas

**Archivos gigantes**
- `api-rest/src/people/people.service.ts`: 2008 líneas (congelado en 2040). Mezcla directorio, planificación, liquidación y nómina.
- `frontend/src/pages/personas/FichasTab.tsx`: 1549 líneas (congelado en 1599; mapa 08).
- `SemanaTab.tsx`: 1534 líneas. No está congelado por nombre, pero cuenta entre los 27 archivos sobre 800, igual que `people.repository.ts` (1233) y `NominaTab.tsx` (949). Trae adentro `CasillaAbierta`, `HorarioDelDia` y `SelectWithSearchCargos`, que son candidatos naturales a extraer cuando se toque.

**Duplicaciones**
- Los gemelos del riesgo 5.
- `sumarDias`/`diaMas`, `domingoDe` y `rotulo` están escritos de nuevo en `SemanaTab`, `PersonaFichaPage`, `MiniCalendario`, `AdvertenciaHorasSemana` y `people.service.ts`.
- El filtro de la fila dormida se repite en el repositorio (`findPlantaDelDia`, `plantaEnDias`) y en la app (`esPlanificacion`, `semanaDePlanta`).

**Código muerto o sin uso**
- `PeopleRepository.findPlantaDesde` no tiene llamadas: era la "marca de agua" de la carga hacia adelante, que reemplazó la proyección a 12 meses.
- `deactivateRole` calcula `countPeopleWithRole` solo para escribirlo en el log.
- `POST /people/sheets` (`upsertSheet`) no tiene ninguna llamada desde la app (mapa 08).
- `PersonasPage` conserva una rama de edición (`editando ? updatePerson(...) : createPerson(...)`), pero la lista ya navega a `/personas/:id`: el modal solo se abre para crear.
- En `SemanaTab`, `GrillaDeDias` recibe funciones vacías: `onQuitarDia={() => {}}` y `onCambiar: () => {}`.

**Comentarios desactualizados**
- `SemanaTab`: el comentario "MOVER DE DÍA… la asignación se muda con su horario y todo" no calza con el código (ver sección 11). El de `refrescar` dice que las necesidades "viven en Recursos", pero desde la 84 son sillas. La cabecera habla de "la semana", pero `RANGO = 28`.
- `PeopleRepository` dice "El precio del cargo es solo una SUGERENCIA", y el 17-08 se decidió que "Un cargo NO lleva precio".
- El portero dice "Techo 1 A PROPÓSITO" para `type="time"`, pero el techo real es 0.
- `68_personas.sql` apunta a la ruta vieja `00_DOCUMENTACION/10_MODULO_DE_PERSONAS.md`.
- `89_cambio_de_dia_de_planta.sql` conserva la "Regla de origen", retirada el 04-09 (el doc lo aclara).

**Tipos que mienten**
- `EventStaff` en `person.entity.ts` declara `quotation_id: string`, `person_id: number` y `day: string` como obligatorios, pero la base los acepta NULL desde las migraciones 74 y 84.

**Consultas pesadas**
- `PersonaFichaPage` pide `getStaffSemana(hoy, hoy+365)` de **toda la empresa** solo para saber el próximo día de una persona.
- `GET /people` entrega la ficha completa, con cuenta bancaria, a pantallas que solo necesitan nombres, como `SemanaTab`.
- `proyectarTodaLaPlanta` recorre 365 días por persona en la primera apertura de cada sesión.

**Pendientes y huecos**
- Del "cajón" del doc siguen abiertos dos pendientes de este lado:
  - El choque de personas no dice dónde está la persona: el mensaje sigue siendo "Esa persona ya está puesta ese día", en `PeopleRepository.addStaff` y `updateStaff`.
  - `traer-planta` no corre una sola vez por ficha: `FichasTab` lo llama cada vez que abre una ficha abierta.
- El cruce vive solo en la app: la regla "una persona, una cosa por día" está en `poner.mutationFn` y usa `staff` ya filtrado por `esPlanificacion`, así que no ve a la planta traída por la ficha.
- El motor no hace cumplir la lista cerrada de bancos: `CreatePersonDto.bank_code` acepta cualquier código de 3 dígitos.

## 11. Contradicciones entre documento y código

1. **Cómo se carga la planta.**
   - Doc §2 (15-08): *"Al abrir la sábana o mover el rango, el backend extiende la planta activa hacia adelante hasta el final visible… desde hoy o desde el último día ya cargado de cada persona — así que un día borrado a mano no se recrea."*
   - Código: `proyectarPlanta` proyecta 365 días desde hoy, al guardar la ficha y una vez por sesión al abrir `SemanaTab`. Crea cualquier día de patrón sin fila. Lo que evita recrear un día quitado es `ajuste='descansa'` (`removeStaff`), no una marca de agua. `findPlantaDesde` quedó sin uso.
   - El §2 del doc sí recoge la regla del 24-08; el párrafo del 15-08 quedó sin actualizar.
2. **Mover de día.**
   - Doc §2 (15-08): *"cada asignado lleva un botón de calendario… se pincha el nuevo y la asignación se muda con su horario y todo. Los libres de la persona salen en ámbar, y si en el día de destino ya estaba, el backend lo rechaza."*
   - Código: en `CasillaAbierta`, ese botón abre `MiniCalendario` para **marcar y desmarcar** días. `onPonerEnDia` llama `addStaff` con el horario habitual y `onSacarDelDia` llama `removeStaff`; ni `SemanaTab` ni `PersonaFichaPage` hacen `PATCH day`. En eventos el calendario es de solo lectura (17-08), y la leyenda de `MiniCalendario` dice "En gris, sus días libres". El `PATCH day` solo lo usa `GrillaPersonal`, para mover sillas.
3. **Semana o mes.**
   - Doc §5 "Las DOS grillas": *"La semanal corre de domingo a sábado… Felipe se sienta a llenar la semana."*
   - Código: `SemanaTab` usa `RANGO = 28` ("LA SÁBANA ES MENSUAL Y FIJA", Felipe, 15-08).
4. **Cambiar el tipo en la casilla.**
   - Doc §5, tabla de las dos grillas: en Personas se puede *"cambiar planta/freelance del día"*.
   - Código: en `CasillaAbierta` el tipo es una etiqueta, no un botón (Felipe, 15-08). El tipo solo se elige al poner a la persona (`PreguntaDiaExtra`) o lo decide una regla del motor.
5. **Monto de la planta traída.**
   - Doc §2: la planta entra *"con monto en cero (la asignación extra)"*.
   - Código: `traerPlantaAlEvento` inserta `amount: null`.
6. **Una evaluación por persona por evento.**
   - Doc §4: *"Se evalúa al cerrar la ficha, una evaluación por persona por evento, con botón de saltar."*
   - Código: `person_reviews` no tiene índice único (77) y `createReview` no revisa duplicados. `EvaluacionesDePersona` permite evaluar en cualquier momento, con evento opcional ("Evaluar desde acá, sin esperar a cerrar una ficha").
7. **Orden de los campos bancarios.**
   - Doc §4: *"nombre → RUT → banco → tipo de cuenta → número de cuenta."*
   - Código: `PersonaForm` pide nombre → RUT → teléfono → **tipo de cuenta** → **banco** → número de cuenta.
8. **Horas trabajadas guardadas.**
   - Doc §2 "El día": cada asignación guarda *"horas trabajadas"*.
   - Código: `event_staff` no tiene esa columna (71 y siguientes). Las horas se calculan con `horasTrabajadas` (app) y `minutosTrabajados` (motor).
9. **Pestañas.**
   - Doc §8, estado al 15-08: *"Pestañas de Personal: Planificación · Fichas · Nómina · Directorio."*
   - Código: `PersonasPage` tiene Planificación · Liquidación · Nómina · Histórico de pagos · Staff. El propio doc lo actualiza el 24-08; solo la línea de estado quedó vieja.
10. **"Solo administrador".**
    - Doc §7: para decidir quién ve el módulo pide solo `PermissionGuard`. Los comentarios de `permissions.ts` y `App.tsx` dicen que el módulo es "SOLO de administrador" por las cuentas bancarias.
    - Código: el motor no lo aplica (`PeopleController` no tiene `@Roles`).
    - No choca con el doc, pero sí con la intención escrita en el código. Ver el riesgo 8.
11. **Pruebas del frontend** (documento fuera de `docs/arquitectura`: `CLAUDE.md`).
    - `CLAUDE.md`: *"There is no frontend test suite."*
    - Código: `frontend/package.json` tiene `"test": "vitest run"`, y el CI corre "Pruebas (vitest)" con pruebas de este módulo.

## 12. Preguntas abiertas

- ¿Es intencional que las rutas `/people` no tengan `@Roles` (siguiendo el "se van marcando rutas por etapas" de `roles.guard.ts`), o falta ponerle `ADMIN_ONLY` al controller? Hoy un usuario de recepción podría leer RUT y cuentas a través de la API.
- ¿"Una evaluación por persona por evento" debe ser una regla dura (índice único), o basta con el flujo de cierre?
- ¿El motor debería impedir que una persona esté en staff y en un evento el mismo día? El doc del 24-08 dice que "el cruce del 15-08 sigue", pero la migración 74 lo permite a propósito ("pasa en el Excel: Soledad Molina el 1 de mayo").
- ¿Qué migraciones del paquete 68→90 están aplicadas en producción y en el laboratorio? Varias cabeceras dicen "PRODUCCIÓN: pendiente", y no se revisó la base.
- ¿La gente puesta en eventos anulados o vueltos a pre-venta debería limpiarse sola? Hoy solo aparece como huérfana en `ResumenDelDia`.
- `ResumenDelDia` usa `getEventServiceTimes` y `setEventServiceTime` de `logistics.service`. No verifiqué el endpoint ni la tabla del motor: el nombre `event_service_times` sale del comentario de `serviciosDelDia.ts` (mapas 04 y 06).
- ¿"Mover de día" (una fila que se muda) se reemplazó a propósito por "marcar y desmarcar días", o se perdió en una reescritura? El comentario de `SemanaTab` todavía describe lo primero.

## 13. Archivos clave

**Motor**
- `api-rest/src/people/people.controller.ts`: las rutas `/people` (cargos, staff, proyección, evaluaciones, notas del día, personas).
- `api-rest/src/people/people.service.ts`:
  - Personas: `create`, `update`, `remove`, `prepararDatos`.
  - Jornadas: `addStaff`, `updateStaff`, `removeStaff`, `proyectarPlanta`, `proyectarTodaLaPlanta`, `traerPlantaAlEvento`.
  - Otros: `createReview`, notas del día, `deactivateRole`.
  - Funciones puras: `esJornadaExtra`, `laMandaronAUnEvento`, `laPuedeQuitarLaProyeccion`.
- `api-rest/src/people/people.repository.ts`: `people`, los cargos en `management_resources`, `event_staff` (`findSillaVacia`, `findDormida`, `plantaEnDias`, `costoPersonalPorEvento`, `addStaffEnLote`), `person_reviews` y `day_notes`.
- `api-rest/src/people/utils/alta-de-jornada.ts`: `horarioDelDia`, `cambiosParaRevivir`.
- `api-rest/src/people/utils/rut.ts`: `revisarRut`, `normalizarRut`, `RESERVADOS`.
- DTOs en `api-rest/src/people/dto/`: `create-person.dto.ts`, `update-person.dto.ts`, `event-staff.dto.ts`, `job-role.dto.ts` y `etapas.dto.ts` (`CreateReviewDto`, `CreateDayNoteDto`, `UpdateDayNoteDto`).
- `api-rest/src/people/entities/person.entity.ts`: `Person`, `Cargo`, `EventStaff`, `PersonReview`, `DayNote`.
- `api-rest/src/people/people.module.ts` y `api-rest/src/auth/roles.guard.ts`.
- Pruebas en `api-rest/src/people/tests/`: `alta-de-jornada.spec.ts`, `jornada-extra.spec.ts`, `cambio-de-dia.spec.ts`, `proyeccion-no-borra-lo-ajeno.spec.ts`, `rut.spec.ts`.
- Migraciones en `docs/migrations/`: `68_personas.sql`, `69_cargos_fusionados_con_recursos.sql`, `71_asignacion_de_personas_por_dia.sql`, `74_restaurante_como_evento_permanente.sql`, `75_horario_habitual_de_la_persona.sql`, `76_dias_libres_del_personal.sql`, `77_ciclo_propinas_nomina.sql`, `78_notas_del_dia.sql`, `79_cascada_de_las_tablas_nuevas.sql`, `80_horario_por_dia_de_la_semana.sql`, `84_las_sillas.sql`, `85_sillas_sin_dia_al_primer_dia.sql`, `89_cambio_de_dia_de_planta.sql`, `90_puesto_en.sql`.

**App**
- `frontend/src/pages/personas/PersonasPage.tsx`: el contenedor, las pestañas y el directorio Staff.
- `frontend/src/pages/personas/SemanaTab.tsx`: la sábana, `CasillaAbierta`, `HorarioDelDia` y la proyección por sesión.
- `frontend/src/pages/personas/MiniCalendario.tsx`: el calendario de la persona y `horarioHabitual`.
- `frontend/src/pages/personas/PersonaFichaPage.tsx`: la ficha `/personas/:id` y `CalendarioDePersona`.
- `frontend/src/pages/personas/PersonaForm.tsx`: datos, banco y jornada semanal.
- `frontend/src/pages/personas/CargosModal.tsx`: los cargos.
- `frontend/src/pages/personas/EvaluacionesDePersona.tsx`: las evaluaciones de una persona.
- `frontend/src/pages/personas/ResumenDelDia.tsx` y `serviciosDelDia.ts`: el resumen y los recados del día.
- `frontend/src/pages/personas/PreguntaDiaExtra.tsx` (`esDiaExtra`) y `AdvertenciaHorasSemana.tsx` (`diasConExceso`).
- `frontend/src/pages/personas/estadoDelPago.ts` (`esPlanificacion`) y `estadoDelPago.test.ts`.
- `frontend/src/services/people.service.ts` y `frontend/src/types/people.types.ts` (`Persona`, `Asignacion`, `datosParaPagarCompletos`).
- Utilidades: `frontend/src/utils/estadoPersona.ts`, `frontend/src/utils/rut.ts`, `frontend/src/utils/bancos.ts`.
- Piezas: `frontend/src/components/inputs/RutInput.tsx`, `HoraInput.tsx`, `SelectorColacion.tsx`, y `frontend/src/components/Estrellas.tsx`.
- Rutas y permisos:
  - `frontend/src/constants/permissions.ts` (`people`)
  - `frontend/src/constants/api.routes.ts` (`PEOPLE`, `PEOPLE_ROLES`, `PEOPLE_STAFF`)
  - `frontend/src/App.tsx` (rutas `personas` y `personas/:id`)
  - `frontend/src/layout/Sidebar.tsx`
- Pantallas de otros módulos que escriben o leen las filas: `frontend/src/pages/postventa/GrillaPersonal.tsx`, `EventResourcesSection.tsx` y `ServiciosTab.tsx`; `frontend/src/pages/dashboard/DashboardPage.tsx`.
- `frontend/scripts/portero-kit-de-la-casa.sh`: los techos de RUT, bancos, estado de persona, hora y tamaño de archivos.
