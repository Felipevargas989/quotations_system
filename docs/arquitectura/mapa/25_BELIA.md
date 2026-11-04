# Mapa: BelIA, la asistente con IA (la ventanilla de chat)

> **Estado: escrito al construir** (rama `feature/evia-asistente`, 03-11-2026), verificado contra ese código; la cara de Bela entró la misma noche. El plan y las decisiones de Felipe viven en `docs/arquitectura/20_EVIA_LA_IA_DE_EVENTIA.md`, que manda sobre este mapa. Fase 1 (solo consultas): el motor en el laboratorio desde el 03-11 y la ventanilla con la cara provisoria hasta que llegue el dibujo de Bela. **Nada en producción.** Parte del atlas de docs/arquitectura/mapa; el índice es 00_MAPA_DEL_SISTEMA.md.

## 1. Qué hace

BelIA es una ventanilla de chat abajo a la derecha de todas las pantallas. Conversa con Claude (Opus 5.5), que consulta Eventia con doce herramientas de solo lectura, cada una con el cargo de su pantalla:
- **Quien vende:** `buscar_cotizaciones`, `ver_cotizacion`, `calendario`, `seguimientos_pendientes`, `buscar_en_catalogo` (varios `textos` a la vez) y `buscar_clientes`.
- **Operaciones para arriba:** `pagos_del_evento` y `cobranza` (derecho `post_venta`); `insumos`, `proveedores` y `mobiliario` (derecho `logistica`).
- **Solo administración:** `personal` (derecho `personal`). Nunca trae RUT, cuentas ni montos. Las usan vendedor, operaciones y administración, y solo en la empresa con el módulo propio `asistente` (Valle del Sol, migración 180).

Las reglas que la sostienen (doc 20 §3):
- actúa con el cargo y la empresa de quien escribe;
- solo tiene herramientas cerradas, ninguna escribe;
- cada cifra sale de una herramienta;
- la plata la calcula Eventia.

Tiene cinco ánimos (doc 20 §8b): dormida, despierta, llama tu atención, enojada y celebra. Ver §5.

## 2. Pantallas y rutas de la app

| Pieza | Archivo | Qué hace | Quién |
|---|---|---|---|
| Botón y ventanilla | `frontend/src/components/belia/BeliaVentanilla.tsx`, montada en `layout/Layout.tsx` | El botón redondo con la burbuja de aviso o de enojo. Al pincharlo, el panel con el saludo, cuatro atajos, la conversación y el campo de texto. En el celular ocupa toda la pantalla. «—» minimiza y «×» termina la conversación | `SECTION_ROLES.quotations` (vendedor y arriba) con el derecho `asistente` |
| El cerebro | `components/belia/useBelia.ts` | La conversación en `sessionStorage`. El ánimo de fondo con `GET /asistente/estado` cada 5 minutos. El reloj de dormir, los avisos (máximo uno por hora, con `localStorage`) y el evento `belia:celebra` | — |
| La cara | `components/belia/BeliaAvatar.tsx`, piezas en `public/belia/` | El dibujo de Bela (demo de GPT del 03-11) en seis piezas recortadas (cuerpo, orejas, ojos, boca) más párpados, cejas, boca cerrada, notebook y señales dibujados encima, con las poses de la demo. Sin animación corriendo: transiciones cortas entre poses, pestañeo cada 5 a 10 s y respirar dormida. Fondo azul, rojo si está enojada. En el laboratorio, `?belia=<ánimo>` la muestra en ese ánimo | — |
| Lo que contesta | `components/belia/RespuestaDeBelia.tsx` y `belia.ts` | Un markdown chico armado con elementos de React (párrafos, listas, tablas, negritas y enlaces). Solo se enlazan rutas que empiezan con «/» | — |

## 3. Endpoints del motor

| Ruta | Controller | Service | Llamador | Cargo y derecho |
|---|---|---|---|---|
| `POST /asistente/mensajes` | `AsistenteController.responder` | `AsistenteService.responder` | `preguntarABelia` ← `useBelia.enviar` | `SALES_AND_UP`; derecho `asistente`; `@Throttle` 20 por minuto |
| `GET /asistente/estado` | `AsistenteController.estado` | `AsistenteService.estado` | `estadoDeBelia` ← `useBelia` (React Query `["belia","estado"]`, cada 5 min) | `SALES_AND_UP`; derecho `asistente`. No llama a la IA |

**Lo que recibe `mensajes`:**
- `{ mensaje, historial: [{ rol: 'persona' | 'belia', texto }], pantalla: { ruta, cotizacion_id } }`;
- `MensajeDto`, con hasta 30 turnos;
- se mandan los últimos 20.

**Lo que devuelve:** `{ respuesta, herramientas, segundos, costo_usd, uso_del_mes }`. `uso_del_mes` llega solo a los administradores.

**Lo que devuelve `estado`:** `{ vencidos, sin_gestion, vencen_hoy, requerimientos_de_hoy }`.

## 4. Tablas de la base de datos

| Tabla | Qué guarda | Lee o escribe | Migración |
|---|---|---|---|
| `asistente_uso` | Una fila por respuesta: mes en Chile, modelo, tokens, costo, segundos, herramientas, ruta y falla. Sin la pregunta | L (`gastoDelMes`) / E (`registrarUso`) | 180 |
| `companies.modulos_propios` | El derecho `asistente` | L (`derechosDe`) | 180 (solo datos) |
| `quotations`, `clients`, `quotation_followups` y el catálogo | Lo que consultan las herramientas, siempre con el `company_id` de la sesión | Solo L | — |
| `payments`, `payment_transactions`, `refunds` | Las cuotas, los abonos y los reembolsos. **No tienen `company_id`**: se leen solo después de comprobar que la cotización es de la empresa, o con `quotations!inner` filtrado por ella (la cobranza) | Solo L | — |
| `supplies`, `suppliers`, `service_recipe_items`, `event_supply_provisions`, `furniture_items`, `variable_services`, `fixed_services` | Los insumos con su receta, lo comprado por evento, los proveedores y el mobiliario, con `company_id` | Solo L | — |
| `event_staff`, `people`, `management_resources` | Las sillas del personal, con el nombre de la persona y del cargo. Solo nombre, cargo, día, horario y estado | Solo L | — |

## 5. Flujos principales

**Una pregunta.**
1. La ventanilla manda el mensaje, la historia y la pantalla.
2. El motor mira el tope del mes (`TOPE_ASISTENTE_USD`, 100 si no se dice). Si se alcanzó, contesta 429 `TOPE_DE_BELIA` sin llamar a Claude.
3. Arma las instrucciones fijas (en caché) y las del momento (quién, qué día, qué pantalla). La cotización abierta se revisa contra la empresa.
4. Ofrece solo las herramientas que el cargo y el plan permiten (`herramientasPara`).
5. Repite el ciclo de Claude hasta 8 vueltas. Cada herramienta pedida corre con el `User` de la sesión; lo que falla vuelve como error y no corta el ciclo.
6. Anota la cuenta en `asistente_uso`, también si Claude falló.

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
- **Celebra** con `window.dispatchEvent(new Event('belia:celebra'))`. Todavía no lo dispara ninguna pantalla.

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

## 7. Conexiones con otros módulos

**Lo que usa del motor:**
- `QuotationsRepository.findAll`, la lista del tablero;
- `GenerarRepository.catalogo`, el catálogo de «Crear con IA»;
- `QuotationFollowupsService.mapByCompany` y `findByQuotation`, la bitácora;
- de `oportunidades/analisis/comun.ts`: `costoDelUso`, `usoDeLaRespuesta`, `hoyEnChile` y `errorDeIA`.

**Lo que usa de la app:**
- `useAuth`, `SECTION_ROLES`, `tieneDerecho`, `apiRequest` y `humanizeApiError`;
- las animaciones `belia-*` de `tailwind.config.js`.

## 8. Zonas de riesgo: si tocas esto, cuidado con aquello

1. **Si agregas una herramienta**, la barrera es que exista.
   - Declárale `cargos` iguales a los de la pantalla que muestra ese dato (`SECTION_ROLES`), no a lo que el motor deja leer.
   - Filtra con el `company_id` de la sesión.
   - Nunca uses `QuotationsRepository.findOne`, que no filtra por empresa (zona 3 del mapa 00).
   - Una herramienta que escribe es la fase 2 del doc 20: propuesta, «Sí, aplicar» y la misma puerta del cotizador.
2. **Si cambias la regla del tablero** (`semaforoDe` en `QuotationsPage.tsx`), cámbiala también en `semaforo` de `seguimientos-pendientes.ts`, o BelIA y el tablero contarán distinto.
3. **Si tocas las instrucciones** (`instrucciones.ts`), recuerda que no son la barrera: solo explican.
4. **Si cambias el modelo** (`MODELO_ASISTENTE`), revisa que `costoDelUso` tenga su precio. Si no lo tiene, cuenta como Opus.
5. **Lo que necesita cada evento NO lo calcula BelIA.** Lo hace la pantalla de Compras (`consolidateEvent`, en la app, mapa 06). Una copia en el motor podría dar otra cifra: BelIA da lo ya comprado y manda a Compras. Para que lo calcule ella, primero hay que mover esa cuenta a un solo lugar compartido.
6. **El costo** (doc 20 §7):
   - las instrucciones y las herramientas van en caché una hora, y la conversación cinco minutos, con la marca solo en su último bloque (`marcarElFinal`);
   - son 3 marcas de las 4 que permite la API;
   - `costoDe` cobra cada duración a su precio;
   - si cambias el orden de las marcas, las de una hora tienen que ir antes que las de cinco minutos.

## 9. Pruebas que lo protegen

| Archivo | Qué cubre |
|---|---|
| `api-rest/src/asistente/tests/asistente.service.spec.ts` | La empresa de la sesión aunque la IA pida otra. Que lo que no tiene herramienta vuelva como error. Que el tope frene antes de llamar. La cuenta anotada aunque falle. El tope desde Railway. Las herramientas por cargo. El derecho desde `modulos_propios`. La conversación que viaja. El ánimo de fondo |
| `api-rest/src/asistente/tests/herramientas.spec.ts` | La regla del tablero, los días de la minuta, la búsqueda en el catálogo sin tildes y las fechas en Chile |
| `api-rest/src/auth/tests/matriz-de-cargos.spec.ts` y `matriz-de-derechos.spec.ts` | Las dos rutas con su cargo y su derecho |
| `frontend/src/components/belia/belia.test.ts` | La pantalla abierta, el orden de los ánimos, el aviso solo cuando sube lo de hoy, y que solo se enlacen rutas de Eventia |

## 13. Archivos clave

- `api-rest/src/asistente/` (módulo, controller, service, repository, instrucciones, `herramientas/`, `dto/`)
- `frontend/src/components/belia/`, `frontend/src/services/asistente.service.ts`
- `docs/migrations/180_evia_asistente.sql`
- `docs/arquitectura/20_EVIA_LA_IA_DE_EVENTIA.md`
