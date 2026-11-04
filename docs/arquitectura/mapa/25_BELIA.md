# Mapa: BelIA, la asistente con IA (la ventanilla de chat)

> **Estado: escrito al construir** (rama `feature/evia-asistente`, 03-11-2026), verificado contra ese código; la cara de Bela entró la misma noche y la fase 2 (las propuestas con «Sí, aplicar» y lo que hay que comprar) esa misma noche, ya tarde. El plan y las decisiones de Felipe viven en `docs/arquitectura/20_EVIA_LA_IA_DE_EVENTIA.md`, que manda sobre este mapa. Fase 1 en el laboratorio desde el 03-11; la fase 2, con la migración 181, en el laboratorio desde el 03-11 en la noche, probada en la pantalla (doc 20, estado). **Nada en producción.** Parte del atlas de docs/arquitectura/mapa; el índice es 00_MAPA_DEL_SISTEMA.md.

## 1. Qué hace

BelIA es una ventanilla de chat abajo a la derecha de todas las pantallas. Conversa con Claude (Opus 5.5), que usa quince herramientas, cada una con el cargo de su pantalla.

**Trece consultan:**
- **Quien vende:** `buscar_cotizaciones`, `ver_cotizacion` (cada servicio con su id), `calendario`, `seguimientos_pendientes`, `buscar_en_catalogo` (varios `textos` a la vez) y `buscar_clientes`.
- **Operaciones para arriba:** `pagos_del_evento` y `cobranza` (derecho `post_venta`); `insumos`, `lo_que_hay_que_comprar`, `proveedores` y `mobiliario` (derecho `logistica`).
- **Solo administración:** `personal` (derecho `personal`). Nunca trae RUT, cuentas ni montos.

**Dos proponen, y ninguna escribe (fase 2):**
- `proponer_cambio_de_servicios`: agregar o quitar servicios del catálogo en una casilla, cambiar sus personas, poner una casilla entera (así se arma una minuta) o sacarla, y poner o sacar fijos;
- `proponer_nota`: una nota en la bitácora.

La persona ve la propuesta en una tarjeta y recién con su «Sí, aplicar» el motor la guarda, por la misma puerta del cotizador.

Las usan vendedor, operaciones y administración, y solo en la empresa con el módulo propio `asistente` (Valle del Sol, migración 180).

Las reglas que la sostienen (doc 20 §3):
- actúa con el cargo y la empresa de quien escribe;
- solo tiene herramientas cerradas: las de consulta leen y las de cambio proponen;
- cada cifra sale de una herramienta;
- la plata la calcula Eventia.

Tiene cinco ánimos (doc 20 §8b): dormida, despierta, llama tu atención, enojada y celebra. Ver §5.

## 2. Pantallas y rutas de la app

| Pieza | Archivo | Qué hace | Quién |
|---|---|---|---|
| Botón y ventanilla | `frontend/src/components/belia/BeliaVentanilla.tsx`, montada en `layout/Layout.tsx` | El botón redondo con la burbuja de aviso o de enojo. Al pincharlo, el panel con el saludo, cuatro atajos, la conversación y el campo de texto. En el celular ocupa toda la pantalla. «—» minimiza y «×» termina la conversación | `SECTION_ROLES.quotations` (vendedor y arriba) con el derecho `asistente` |
| El cerebro | `components/belia/useBelia.ts` | La conversación en `sessionStorage`, con sus tarjetas y lo que la persona hizo con cada una. El ánimo de fondo con `GET /asistente/estado` cada 5 minutos. El reloj de dormir, los avisos (máximo uno por hora, con `localStorage`) y el evento `belia:celebra`. `responder` manda el «Sí, aplicar», el «No» o el «Deshacer» | — |
| La tarjeta | `components/belia/PropuestaDeBelia.tsx` | Debajo de la respuesta: el antes y el después por día (las líneas largas plegadas), el total y la diferencia, las cuotas de una aceptada, los avisos en ámbar, «Sí, aplicar» en azul y «No». Ya aplicada, «Deshacer» (solo lo no vendido) | — |
| La cara | `components/belia/BeliaAvatar.tsx`, piezas en `public/belia/` | El dibujo de Bela (demo de GPT del 03-11) en seis piezas recortadas (cuerpo, orejas, ojos, boca) más párpados, cejas, boca cerrada, notebook y señales dibujados encima, con las poses de la demo. Sin animación corriendo: transiciones cortas entre poses, pestañeo cada 5 a 10 s y respirar dormida. Fondo azul, rojo si está enojada. En el laboratorio, `?belia=<ánimo>` la muestra en ese ánimo | — |
| Lo que contesta | `components/belia/RespuestaDeBelia.tsx` y `belia.ts` | Un markdown chico armado con elementos de React (párrafos, listas, tablas, negritas y enlaces). Solo se enlazan rutas que empiezan con «/» | — |

## 3. Endpoints del motor

| Ruta | Controller | Service | Llamador | Cargo y derecho |
|---|---|---|---|---|
| `POST /asistente/mensajes` | `AsistenteController.responder` | `AsistenteService.responder` | `preguntarABelia` ← `useBelia.enviar` | `SALES_AND_UP`; derecho `asistente`; `@Throttle` 20 por minuto |
| `GET /asistente/estado` | `AsistenteController.estado` | `AsistenteService.estado` | `estadoDeBelia` ← `useBelia` (React Query `["belia","estado"]`, cada 5 min) | `SALES_AND_UP`; derecho `asistente`. No llama a la IA |
| `POST /asistente/propuestas/:id/aplicar` | `AsistenteController.aplicar` | `PropuestasService.aplicar` | `responderPropuesta` ← `useBelia.responder` («Sí, aplicar») | `SALES_AND_UP`; derecho `asistente`; `@Throttle` 20 por minuto. Las aceptadas, solo operaciones y administración (lo revisa el servicio). No llama a la IA |
| `POST /asistente/propuestas/:id/descartar` | `AsistenteController.descartar` | `PropuestasService.descartar` | `responderPropuesta` ← `useBelia.responder` («No») | Igual |
| `POST /asistente/propuestas/:id/deshacer` | `AsistenteController.deshacer` | `PropuestasService.deshacer` | `responderPropuesta` ← `useBelia.responder` («Deshacer») | Igual |

**Lo que recibe `mensajes`:**
- `{ mensaje, historial: [{ rol: 'persona' | 'belia', texto }], pantalla: { ruta, cotizacion_id } }`;
- `MensajeDto`, con hasta 30 turnos;
- se mandan los últimos 20. El texto de un turno de BelIA lleva al final lo que la persona hizo con sus propuestas (`textoParaBelia`).

**Lo que devuelve:** `{ respuesta, herramientas, segundos, costo_usd, uso_del_mes, propuestas }`. `uso_del_mes` llega solo a los administradores; `propuestas`, las tarjetas que armaron las herramientas en esa pregunta.

**Lo que devuelve `estado`:** `{ vencidos, sin_gestion, vencen_hoy, requerimientos_de_hoy }`.

**Lo que devuelven las propuestas:** `{ estado: 'aplicada' | 'deshecha' | 'descartada', numero, enlace, total, se_puede_deshacer }`. Lo que no se puede vuelve como 409 con el porqué (cambió entre medio, venció, días servidos), 403 (el cargo o las compras hechas) o 404 (no es de quien la pide).

## 4. Tablas de la base de datos

| Tabla | Qué guarda | Lee o escribe | Migración |
|---|---|---|---|
| `asistente_uso` | Una fila por respuesta: mes en Chile, modelo, tokens, costo, segundos, herramientas, ruta y falla. Sin la pregunta | L (`gastoDelMes`) / E (`registrarUso`) | 180 |
| `asistente_propuestas` | Una fila por propuesta: quién la pidió, el resumen, el `antes` (la foto y la plata, el respaldo para deshacer), el `despues` (el parche ya calculado o la nota), la huella de la cotización al proponer y al aplicar, el estado y el vencimiento (2 horas) | L/E (`crearPropuesta`, `propuesta`, `moverPropuesta`, `descartarPendientes`) | 181 |
| `companies.modulos_propios` | El derecho `asistente` | L (`derechosDe`) | 180 (solo datos) |
| `quotations` | Lo que consultan las herramientas, siempre con el `company_id` de la sesión. **BelIA no la escribe**: lo aprobado se guarda con `QuotationsService.update`, como el cotizador | L | — |
| `quotation_followups` | La bitácora: se lee en la ficha y, al aplicar, se escribe con `crearComoAsistente` (a nombre del Asistente, con el robot) | L / E por `QuotationFollowupsService` | — |
| `clients` y el catálogo | Lo que consultan las herramientas, con el `company_id` de la sesión | Solo L | — |
| `payments`, `payment_transactions`, `refunds` | Las cuotas, los abonos y los reembolsos (para la cobranza y para mostrar cómo quedan las cuotas de una aceptada). **No tienen `company_id`**: se leen solo después de comprobar que la cotización es de la empresa, o con `quotations!inner` filtrado por ella (la cobranza) | Solo L | — |
| `supplies`, `suppliers`, `service_recipe_items`, `event_supply_provisions`, `furniture_items`, `variable_services`, `fixed_services` | Los insumos con su receta, lo comprado por evento, los proveedores y el mobiliario, con `company_id`. Lo que hay que comprar los lee con las lecturas de `LogisticsService` que usa la pantalla de Compras | Solo L | — |
| `event_day_prints` | Las fichas de cocina ya impresas, para el aviso de reimprimir | Solo L (`LogisticsService.findDayPrints`) | — |
| `event_staff`, `people`, `management_resources` | Las sillas del personal, con el nombre de la persona y del cargo. Solo nombre, cargo, día, horario y estado | Solo L | — |

## 5. Flujos principales

**Una pregunta.**
1. La ventanilla manda el mensaje, la historia y la pantalla.
2. El motor mira el tope del mes (`TOPE_ASISTENTE_USD`, 100 si no se dice). Si se alcanzó, contesta 429 `TOPE_DE_BELIA` sin llamar a Claude.
3. Arma las instrucciones fijas (en caché) y las del momento (quién, qué día, qué pantalla). La cotización abierta se revisa contra la empresa.
4. Ofrece solo las herramientas que el cargo y el plan permiten (`herramientasPara`).
5. Repite el ciclo de Claude hasta 8 vueltas. Cada herramienta pedida corre con el `User` de la sesión; lo que falla vuelve como error y no corta el ciclo.
6. Anota la cuenta en `asistente_uso`, también si Claude falló.

**Una propuesta (fase 2).**
1. La IA mira la ficha (los ids de lo que tiene) y el catálogo, y pide `proponer_cambio_de_servicios` con ids y cantidades, nunca precios.
2. `PropuestasService.proponerServicios` lee la cotización con la empresa de la sesión y revisa quién puede (`porQueNo`): lo no vendido, quien vende; lo aceptado, solo operaciones y administración con Post-Venta; lo realizado, nadie.
3. `editarFoto` aplica los cambios a una COPIA de la foto con las reglas de «Crear con IA» (`armarFoto`): nombre y precio del catálogo, la sección fija que entra sola, la cantidad por persona con tope y el día dentro del evento. Lo que no se toca queda con su precio guardado. Avisa la forma de cada comida (`avisosDeForma`).
4. En una aceptada que ya empezó, los días servidos y el de hoy no se tocan (`choqueConLoServido`). Con compras hechas, bajar personas es solo del administrador, y se avisa en ámbar; también si la ficha de cocina de ese día ya se imprimió.
5. La plata la hace `computeMoney` (`parcheDe`), sin tocar el descuento ni la propina. En una aceptada, las cuotas se muestran con las mismas funciones de «el plan mantiene su forma» que corre el guardado (`cuotasDespues`).
6. Se guarda la propuesta con el antes, el parche y la huella (`huellaDe`). Una nueva de la misma persona sobre la misma cotización reemplaza a la pendiente.
7. La tarjeta viaja con la respuesta. Con «Sí, aplicar», `aplicar` toma la propuesta (pasa de `pendiente` a `aplicando` solo si seguía pendiente: el candado de dos clics), revisa que sea de quien la pide y que no haya vencido, compara la huella con la de ahora y vuelve a revisar el cargo y los días servidos. Recién ahí llama a `QuotationsService.update` con el parche guardado, que vuelve a verificar la plata y corre la cascada del plan.
8. Anota en la bitácora «BelIA, a pedido de …: … Total $A → $B.» y guarda la huella de cómo quedó. En la app, BelIA celebra, las pantallas se ponen al día y, si la persona tenía abierta esa cotización, la página se recarga (la tarjeta lo avisa antes).
9. «Deshacer» (solo lo no vendido) vuelve a la foto del antes si nadie tocó la cotización después (la huella de cómo quedó).

**Lo que hay que comprar.** `lo_que_hay_que_comprar` lee lo mismo que Compras (`LogisticsService`: recetas, insumos, nombres del catálogo, eventos aceptados y lo provisionado), filtra los eventos como la pantalla (por la fecha del evento, desde hoy) y corre `consolidateEvent` de `logistics/utils/consolidacion.ts`, la misma cuenta que la app importa con `@consolidacion`. Por insumo devuelve lo que piden, lo que falta comprar, su costo con merma y qué cotizaciones lo piden (✓ = ya comprado para esa).

**El ánimo de fondo.** `estado` cuenta con la misma regla del filtro «Requieren seguimiento» del tablero. La función `pendientesDe` la comparten la herramienta `seguimientos_pendientes` y `estado`.

**Los cinco ánimos.** `animoDe` decide, en este orden:
1. pensando, que pasa a trabajando a los 2,5 s;
2. celebra;
3. atención;
4. dormida;
5. enojada (más de 10 vencidos);
6. espera.

Cuándo cambia de ánimo:
- **Se duerme** con 5 minutos sin actividad en la app. Solo la despierta un clic o un aviso.
- **Avisa** cuando suben `vencen_hoy` o `requerimientos_de_hoy`, una vez por hora como máximo y nunca con la ventanilla abierta.
- **Celebra** con `window.dispatchEvent(new Event('belia:celebra'))`: lo disparan «Listo», crear el plan de pagos, registrar un abono, marcar realizado y aplicar una propuesta.

## 6. Reglas de negocio acordadas

Las fija el doc 20, que manda:
- quiénes la usan;
- el tope de US$ 100;
- el semáforo de lo que puede hacer;
- las cotizaciones aceptadas;
- los cinco ánimos.

Dos reglas salieron de la primera prueba del 03-11:
- La bitácora y el comentario interno no los ve el cliente; las observaciones sí, porque salen en el PDF.
- BelIA no opina de las notas del equipo si no se lo preguntan.

De la fase 2 (03-11):
- BelIA no cambia el descuento ni la propina (doc 20 §11, pregunta 1: hasta que Felipe decida, no), ni las fechas ni las personas del evento: eso se hace en la pantalla.
- Solo agrega fijos de precio fijo, como «Crear con IA»; los que dependen de las personas se agregan en el cotizador.
- Una aceptada no queda en $0: se anula en Post-Venta.
- Una propuesta dura 2 horas y solo la aplica quien la pidió.

## 7. Conexiones con otros módulos

**Lo que usa del motor:**
- `QuotationsRepository.findAll`, la lista del tablero;
- `QuotationsService.update`, la puerta del cotizador, para lo que la persona aprueba;
- `GenerarRepository.catalogo`, `armarFoto` y `fijoDeFoto`, `avisosDeForma`, `esTourOperador` y `ofrecible` de «Crear con IA»;
- `computeMoney` de `quotations/utils/money.ts`;
- `repartirRebaja` y `repartirAlza` de `payments/cuotas-que-se-llenan.ts` (doc 14), para mostrar las cuotas;
- `LogisticsService` (lecturas de Compras y `findDayPrints`) y `logistics/utils/consolidacion.ts`;
- `QuotationFollowupsService.mapByCompany`, `findByQuotation` y `crearComoAsistente`, la bitácora;
- de `oportunidades/analisis/comun.ts`: `costoDelUso`, `usoDeLaRespuesta`, `hoyEnChile` y `errorDeIA`.

**Lo que usa de la app:**
- `useAuth`, `SECTION_ROLES`, `tieneDerecho`, `apiRequest` y `humanizeApiError`;
- `celebrarConBelia` y el `QueryClient` de React Query;
- las animaciones `belia-*` de `tailwind.config.js`.

## 8. Zonas de riesgo: si tocas esto, cuidado con aquello

1. **Si agregas una herramienta**, la barrera es que exista.
   - Declárale `cargos` iguales a los de la pantalla que muestra ese dato (`SECTION_ROLES`), no a lo que el motor deja leer.
   - Filtra con el `company_id` de la sesión.
   - Nunca uses `QuotationsRepository.findOne`, que no filtra por empresa (zona 3 del mapa 00).
   - Una herramienta nunca escribe: si cambia algo, arma una propuesta (`PropuestasService`) y la persona la aplica con «Sí, aplicar» por la puerta del cotizador.
2. **Si cambias la regla del tablero** (`semaforoDe` en `QuotationsPage.tsx`), cámbiala también en `semaforo` de `seguimientos-pendientes.ts`, o BelIA y el tablero contarán distinto.
3. **Si tocas las instrucciones** (`instrucciones.ts`), recuerda que no son la barrera: solo explican.
4. **Si cambias el modelo** (`MODELO_ASISTENTE`), revisa que `costoDelUso` tenga su precio. Si no lo tiene, cuenta como Opus.
5. **Si tocas `consolidateEvent`** (`api-rest/src/logistics/utils/consolidacion.ts`, alias `@consolidacion`), cambian a la vez las siete pantallas del mapa 06 y lo que BelIA dice que hay que comprar: es la misma cuenta. Y si cambias cómo Compras elige los eventos o qué cuenta como comprado (`ComprasTab`), cámbialo también en `compras.ts`.
6. **El costo** (doc 20 §7):
   - las instrucciones y las herramientas van en caché una hora, y la conversación cinco minutos, con la marca solo en su último bloque (`marcarElFinal`);
   - son 3 marcas de las 4 que permite la API;
   - `costoDe` cobra cada duración a su precio;
   - si cambias el orden de las marcas, las de una hora tienen que ir antes que las de cinco minutos.
7. **Si cambias la cascada del plan en `QuotationsService.update`** (doc 14: compensar reembolsos, «el plan mantiene su forma»), cambia también `cuotasDespues` de `propuestas/reglas.ts`: la tarjeta mostraría unas cuotas y el guardado haría otras.
8. **Si cambias las reglas de `armarFoto`** (lo que vale en una casilla), cambian también los cambios de BelIA: `editarFoto` arma con ella.
9. **Si sacas un campo de `huellaDe`**, un cambio en ese campo entre la propuesta y el «Sí, aplicar» ya no se notaría y BelIA guardaría sobre algo que la persona no vio. Si agregas a la propuesta algo que dependa de otro campo de la cotización, súmalo a la huella.
10. **Si cambias los estados de `asistente_propuestas`** (el check de la 181), revisa `moverPropuesta`: el candado de dos clics es el paso de `pendiente` a `aplicando` solo si seguía pendiente.

## 9. Pruebas que lo protegen

| Archivo | Qué cubre |
|---|---|
| `api-rest/src/asistente/tests/asistente.service.spec.ts` | La empresa de la sesión aunque la IA pida otra. Que lo que no tiene herramienta vuelva como error, y que nada de lo ofrecido escriba. Que el tope frene antes de llamar. La cuenta anotada aunque falle. El tope desde Railway. Las herramientas por cargo. El derecho desde `modulos_propios`. La conversación que viaja. El ánimo de fondo |
| `api-rest/src/asistente/tests/herramientas.spec.ts` | La regla del tablero, los días de la minuta, la búsqueda en el catálogo sin tildes y las fechas en Chile |
| `api-rest/src/asistente/tests/propuestas.spec.ts` | Los cambios con el precio del catálogo y lo demás intacto, el menú guardado con su sección fija, bajar personas, la casilla vacía que sale, los fijos, lo que no calza, las casillas repetidas, la propuesta que no cambia nada. Lo prohibido: lo realizado, las aceptadas para quien vende, los requerimientos, rechazadas y anuladas, los días servidos. La plata que el motor acepta y las cuotas (alza y reembolso compensado). Al aplicar: la puerta del cotizador y la bitácora, la cotización cambiada entre medio, solo quien la pidió, los dos clics, la vencida, el día que pasó y las compras hechas |
| `api-rest/src/logistics/tests/consolidacion.spec.ts` | La cuenta de lo que lleva cada evento (la misma de Compras) |
| `api-rest/src/auth/tests/matriz-de-cargos.spec.ts` y `matriz-de-derechos.spec.ts` | Las cinco rutas con su cargo y su derecho |
| `frontend/src/components/belia/belia.test.ts` | La pantalla abierta, el orden de los ánimos, el aviso solo cuando sube lo de hoy, que solo se enlacen rutas de Eventia y lo que BelIA lee de sus propuestas |

## 13. Archivos clave

- `api-rest/src/asistente/` (módulo, controller, service, repository, instrucciones, `herramientas/`, `propuestas/`, `dto/`)
- `api-rest/src/logistics/utils/consolidacion.ts` (la cuenta compartida con la app)
- `frontend/src/components/belia/`, `frontend/src/services/asistente.service.ts`
- `docs/migrations/180_evia_asistente.sql` y `181_belia_propuestas.sql`
- `docs/arquitectura/20_EVIA_LA_IA_DE_EVENTIA.md`
