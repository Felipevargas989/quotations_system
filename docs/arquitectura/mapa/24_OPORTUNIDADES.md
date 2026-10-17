# Mapa: Oportunidades (licitaciones y compras ágiles de Mercado Público)

> **Estado: escrito al construir, contra el código de la rama `feature/oportunidades-radar` (16 y 17-10-2026).** Sprint 1a del documento 17 (el radar) **en el laboratorio desde el 17-10** (migración 122 aplicada en la base del lab, motor en `pruebas`); sprint 2 (la pantalla) construido el 17-10. **Nada en producción.** Manda `docs/arquitectura/17_MODULO_DE_OPORTUNIDADES.md`; si este mapa lo contradice, se anota en los dos. Parte del atlas de docs/arquitectura/mapa; el índice es 00_MAPA_DEL_SISTEMA.md.

## 1. Qué hace

Es el reemplazo del bot de GitHub (`valledelsol-automation`, `run_compra_agil.py`), que avisaba por correo y se le escaparon las dos grandes de Quillón del 9-10. La diferencia de fondo: **Eventia guarda todo en su propia base** y "nuevo" quiere decir **"no está en la base"**, nunca "publicado hoy".

Cada 2 horas el radar:

1. Pide la lista liviana de **todas las licitaciones activas de Chile** (una sola consulta), la compara con la base y solo pide el detalle de lo que no tiene. De lo que ya tiene, revisa si movieron el cierre o si volvió a abrirse, y lo anota.
2. Pide las **compras ágiles** de las regiones configuradas, desde la última corrida buena menos 48 horas.
3. Para cada empresa con el derecho `oportunidades` (hoy solo Valle del Sol), **lee con Claude Haiku 5.5** lo abierto de sus regiones que todavía no leyó: etiquetas, si se hace en el complejo, semáforo y la razón en una frase. Encima de la IA mandan dos reglas fijas (§6).
4. Anota la corrida en su bitácora (`mp_radar_corridas`): qué trajo, qué falló y cuántos tokens gastó.

5. La pantalla **Oportunidades** (sprint 2): la bandeja con semáforo, la ficha de cada una y la configuración del módulo. Solo administradores.

Lo que **todavía no hace** (doc 17 §7): bajar bases y anexos, guardar quién ganó al cerrar y cargar 2–3 años de historia (sprint 1b); generar documentos (sprint 3); generar cotización (sprint 4). **No manda resumen por correo**: Felipe, 17-10, *"se revisa en Eventia"*.

## 2. Pantallas y rutas de la app

| Ruta de la app | Componente principal | Archivo | Qué hace el usuario ahí | Rol que la ve |
|---|---|---|---|---|
| `/oportunidades` (pestaña Bandeja, la de entrada) | `OportunidadesPage` → `Bandeja` | `frontend/src/pages/oportunidades/OportunidadesPage.tsx` | La lista de lo vigente, de lo que cierra antes a lo que cierra después: semáforo, nombre, organismo, tipo y código, monto, cierre con cuenta regresiva (en rojo si cierra en 3 días o menos), la razón de la IA y sus etiquetas. Chips por color con su conteo (las rojas apagadas de partida), vista (abiertas, nuevas, en estudio, postuladas, descartadas, historial), tipo, región y buscador. "Me interesa" (pasa a en estudio), "Descartar" (no se borra) y "Recuperar". Arriba a la derecha: cuándo se revisó Mercado Público y "Revisar ahora" | administrador: `SECTION_ROLES.oportunidades` = `ROLE_GROUPS.ADMIN_ONLY`, con `PermissionGuard` y `derecho="oportunidades"` en `frontend/src/App.tsx` |
| `/oportunidades` (pestaña Configuración) | `ConfiguracionOportunidades` | `frontend/src/pages/oportunidades/ConfiguracionOportunidades.tsx` | Regiones (`MultiSelect` con las 16), comunas cercanas (agregar y quitar), qué vende la empresa (lo lee la IA). El monto de alto valor y el correo se muestran sin poder cambiarlos: viven en Configuración de empresa | igual |
| `/oportunidades/:id` | `OportunidadFichaPage` | `frontend/src/pages/oportunidades/OportunidadFichaPage.tsx` | La ficha: enlace a Mercado Público, monto, cierre, estado (`ChipDeEstado`), responsable (`SelectWithSearch` con los administradores), lo que leyó la IA, qué piden (descripción y productos), fechas, historial de cambios, notas. "El año anterior" queda anunciado para el sprint 1b | igual |

Notas:

- Menú: `frontend/src/layout/Sidebar.tsx`, "Oportunidades" después de Marketing, ícono `Radar`, sección `oportunidades` (sale solo si la empresa tiene el derecho).
- La pantalla recuerda filtros y pestaña en `sessionStorage` (`op.filtros`, `op.pestana`), la regla de Felipe del 26-08.
- **Prioridad** (Felipe, 17-10: *"hay dos que son directas mías y están en amarillo y deberían ser prioridad"*): lo de una comuna cercana o de alto valor que no quedó en rojo va arriba en la bandeja, en un bloque "Prioridad", y la ficha lo marca (`esPrioridad`, `oportunidades.utils.ts`). El color no se toca: lo decide la lectura.
- El enlace a Mercado Público: licitaciones a `DetailsAcquisition.aspx?idlicitacion=` (probado el 17-10: responde 200); compras ágiles a `buscador.mercadopublico.cl/ficha?code=` (`urlMercadoPublico`, `oportunidades.utils.ts`).

## 3. Endpoints del motor

Todos en `OportunidadesController` (`api-rest/src/oportunidades/oportunidades.controller.ts`), con `@Roles(...ADMIN_ONLY)` y `@Derecho('oportunidades')` en la clase. La app no los llama todavía.

| Método y ruta | Controller y método | Service | Quién lo llama | Cargo y derecho |
|---|---|---|---|---|
| `GET /oportunidades?vigentes=&semaforo=&estado=&tipo=&limite=` | `listar` | `OportunidadesService.listar` → `OportunidadesRepository.listar`: con `mp_procesos!inner`, de a 1000 (el tope de Supabase por consulta) hasta 3.000; `vigentes` (por omisión sí) filtra en el proceso con `or(..., { referencedTable: 'proceso' })`; ordenada por cierre en el servicio | `getOportunidades` ← `Bandeja` | administrador; `oportunidades` |
| `GET /oportunidades/config` | `config` | `OportunidadesService.config`: `configDe` + `datosDeEmpresa` (umbral y correo, solo a la vista) | `getConfigOportunidades` ← `ConfiguracionOportunidades` | administrador; `oportunidades` |
| `PATCH /oportunidades/config` | `guardarConfig` | `OportunidadesService.guardarConfig`: limpia las listas (sin vacías ni repetidas, sin mirar tildes) → `guardarConfig` (upsert por empresa) | `guardarConfigOportunidades` ← `ConfiguracionOportunidades` | administrador; `oportunidades` |
| `GET /oportunidades/:id` | `ficha` | `OportunidadesService.ficha`: `ficha` (de ESTA empresa, 404 si no) + `cambiosDe` | `getFichaDeOportunidad` ← `OportunidadFichaPage` | administrador; `oportunidades` |
| `PATCH /oportunidades/:id` | `actualizar` | `OportunidadesService.actualizar`: estado, responsable (tiene que ser usuario de la empresa: `esUsuarioDeLaEmpresa`) y notas | `actualizarOportunidad` ← `Bandeja` y `OportunidadFichaPage` | administrador; `oportunidades` |
| `POST /oportunidades/radar` | `correrRadar` | `RadarService.iniciar('manual')`: toma el candado, responde al tiro `{ iniciada: true, corrida }` y la corrida sigue sola; si ya hay una, `{ iniciada: false, motivo }` | `correrRadar` ← el botón "Revisar ahora" (`EstadoDelRadar`) | administrador; `oportunidades` |
| `GET /oportunidades/radar/corridas` | `corridas` | `OportunidadesRepository.ultimasCorridas(10)` | `getCorridasDelRadar` ← `EstadoDelRadar` (cada minuto) | administrador; `oportunidades` |

Las rutas fijas (`config`, `radar/...`) van declaradas ANTES de las de `:id`: si no, Nest intentaría leer "config" como un número.

## 4. Tablas de la base de datos

Migración `docs/migrations/122_oportunidades_radar.sql`. Dos clases de tabla (doc 17, regla 4): las `mp_*` son datos **públicos** de Mercado Público, iguales para todas las empresas, y **no llevan `company_id` a propósito**; las `oportunidades*` son de cada empresa y toda consulta filtra por `company_id`.

| Tabla | Qué guarda | Quién escribe | Quién lee |
|---|---|---|---|
| `mp_procesos` | Una fila por licitación o compra ágil, de **todo Chile** (licitaciones) y de las regiones configuradas (compras ágiles): código, tipo, nombre, descripción, organismo, unidad, región, comuna, monto, moneda, estado, fechas de publicación y cierre (en UTC), `fechas`, `productos` y `adjudicacion` en jsonb, el detalle crudo de la API en `detalle`, `primera_vez_visto` (la pone la base) y `actualizado_en` | `guardarProcesos` (upsert por `codigo`), `actualizarCierre` | `procesosConocidos`, `procesosAbiertos`, `listar` (embebida) |
| `mp_cambios` | El historial: cierre movido (`fecha_cierre`) y reapertura (`reapertura`), con el antes y el después | `registrarCambios` | nadie todavía (pantalla del sprint 2) |
| `mp_radar_corridas` | La bitácora del radar: origen (`reloj`, `manual`, `arranque`), estado (`corriendo`, `ok`, `error`, `abandonada`), inicio, término, `resumen` jsonb y error. El índice único parcial `mp_radar_una_corriendo` es **el candado**: no puede haber dos filas en `corriendo` | `tomarCorrida`, `terminarCorrida` | `ultimaCorridaOk`, `ultimasCorridas` |
| `oportunidades` | La lectura de la IA para una empresa (semáforo, etiquetas, `se_hace_en_el_complejo`, razón, alertas, modelo y fecha) y lo que la empresa decide (estado, responsable, notas, cotización). Única por `(company_id, codigo)` | `guardarLectura` (upsert con `ignoreDuplicates`: **nunca pisa** una fila que ya existe) | `codigosLeidos`, `listar` |
| `oportunidades_config` | Por empresa: regiones de interés, comunas cercanas y el perfil que lee la IA ("qué vende y qué no") | la migración 122 (Valle del Sol); la pantalla de configuración llega en el sprint 2 | `configDe` |

Las cinco nacen con RLS encendido, sin políticas, con `REVOKE ALL` a `anon` y `authenticated` y los `GRANT` a `service_role` (y sus secuencias) en la misma migración: la lección de la 107 y del error 42501 (mapa 18).

La 122 también agrega `'oportunidades'` a `companies.modulos_propios` de la empresa 1 y siembra su configuración: regiones Ñuble y Biobío, las 13 comunas cercanas del bot y el perfil de Valle del Sol.

## 5. Flujos principales

### 5.1 Una corrida del radar

`OportunidadesCronService.radarProgramado` (`@Cron('7 */2 * * *')`, solo con `NODE_ENV=production`) → `RadarService.correr('reloj')`. En el laboratorio: `POST /oportunidades/radar`, o la variable `OPORTUNIDADES_RADAR_AL_ARRANCAR=1`, que la corre una vez un minuto después de encender.

1. `tomarCorrida`: marca `abandonada` toda corrida que lleve más de 3 horas `corriendo` (el proceso murió a la mitad) e inserta la nueva. Si el índice único responde `23505`, ya hay una en marcha y esta no parte.
2. `empresasConModulo` → `configDe` de cada una → la unión de sus regiones.
3. **Licitaciones** (`RadarService.licitaciones`): `licitacionesActivas` → `procesosConocidos`. Conocidas: si el cierre cambió (se comparan instantes, no textos) o si estaba cerrada y vuelve a estar activa, `actualizarCierre` y una fila en `mp_cambios`. Nuevas: `detalleLicitacion` **de a una** (la API rechaza las peticiones simultáneas con el mismo ticket), primero lo que cierra antes (`ordenarPorCierre`), hasta 6.000 por corrida o hasta los 45 minutos (`PRESUPUESTO_DETALLES_MS`), guardadas de a 100. Lo que no alcanzó queda en `resumen.licitaciones.pendientes` y entra en la próxima. **Después de esta fase viene una primera lectura** (paso 5), y recién después las compras ágiles.
4. **Compras ágiles** (`RadarService.comprasAgiles`): `comprasAgiles(desde, regiones)` con la región como número oficial (`codigosDeRegiones`: Ñuble 16, Biobío 8); de las nuevas se pide el detalle de a una, hasta los 70 minutos de corrida (`PRESUPUESTO_COMPRAS_MS`), guardadas de a 50, y **sin detalle igual se guardan** (nombre, comprador y monto vienen en la lista). Después, la segunda lectura.
5. **Lectura** (`RadarService.leer`): `procesosAbiertos` (cierre futuro o sin cierre) → por empresa, lo de sus regiones que no está en `codigosLeidos`, **ordenado por cierre** (lo urgente primero) → `LecturaService.leer` de a 3 → `aplicarReglas` → `guardarLectura`. Hasta 3.000 lecturas por corrida, y hasta los 150 minutos desde que partió (`PRESUPUESTO_CORRIDA_MS`): así una corrida nunca llega a las 3 horas en que la siguiente la da por muerta. Se lee **dos veces por corrida** (tras las licitaciones y tras las compras ágiles); la segunda no relee lo leído ni reintenta lo que falló en la primera (`intentadas`), y si la primera se detuvo, la segunda no insiste.
6. `terminarCorrida(id, 'ok' | 'error', resumen, error)`. `ejecutar` nunca lanza: cualquier falla queda en la bitácora.

### 5.2 La lectura con IA

`LecturaService.leer` llama a `messages.parse` con `claude-haiku-5-5`, esfuerzo bajo, salida con esquema fijo (`semaforo`, `etiquetas`, `se_hace_en_el_complejo`, `razon`) y las instrucciones de la empresa en caché (`instruccionesPara`: perfil y catálogo, desde `catalogoResumido`, que lee los nombres de los paquetes y de los fijos activos). El proceso va en `descripcionDe`: nombre, comprador, monto en pesos, cierre, descripción y hasta 30 productos.

- Si el modelo se niega o no devuelve nada legible → **amarillo** con "conviene revisarla a mano".
- Si falla la cuenta (llave mala, sin permiso, sin cupo por minuto, modelo que no existe o saldo agotado) → `LecturaDetenida`: la lectura de esa corrida se detiene y lo que falte se lee en la próxima.
- Cualquier otra falla → `null`: ese proceso queda sin leer y se reintenta en la próxima. Diez seguidas detienen la lectura de la corrida.

## 6. Reglas de negocio acordadas

- **Nuevo = no está en la base** (doc 17, decisión 2). Lo que Mercado Público mostró tarde, o se publicó un viernes en la noche, entra en la corrida siguiente.
- **Las licitaciones se guardan de todo Chile.** La región solo viene en el detalle, así que hay que abrir cada licitación nueva igual; guardarlas evita volver a abrirlas cada 2 horas. El doc 17 §5.1 decía "si es de la región se guarda"; **Felipe confirmó todo Chile el 17-10** (decisión 12). La IA lee solo lo de las regiones de cada empresa.
- **Mercado Público a veces responde 200 con el error adentro** (`{ Codigo, Mensaje }`, lección del código del bot): `errorDeLaApi` lo convierte en error; el 10500 ("peticiones simultáneas") se espera y se reintenta. Una lista de activas sin `Listado` es una falla, nunca "no hay nada".
- **La API de licitaciones frena con 429 si se le pide en ráfaga** (medido el 17-10 en el laboratorio: hay 4.879 activas; tras la lista, el segundo o tercer detalle pedido en menos de 2 segundos volvía 429, y el radar lo tomaba como "sin cupo por hoy"). El 429 trae escrito *"Lo sentimos. Hemos detectado que existen peticiones simultáneas"*: es la regla de una consulta a la vez por ticket, y el servidor sigue contando la anterior un rato después de responderla (con 1 s entre pedidos seguía chocando). Desde entonces el cliente **ajusta solo su ritmo**: parte con 3 s entre pedidos (`pausaMinimaMs`; medido: con 1 s y 2 s chocaba, con 4 s no) y cada choque le suma 1 s, hasta 10 s (`chocar`), espera esa pausa y reintenta; tras 6 choques seguidos se rinde con ese pedido. A ese ritmo la primera carga de todo Chile (unas 4.900) toma varias corridas: cada una pide detalles hasta los 45 minutos, primero lo que cierra antes, y lee con IA dos veces (tras las licitaciones y tras las compras ágiles). Un 429 que no habla de simultáneas se espera 30 s y 90 s antes de darlo por sin cupo (`esperas429`). Lo que Mercado Público escribe queda en el error, con el ticket tachado si apareciera. También chocan con el radar el motor anterior mientras Railway lo apaga tras un despliegue, y el bot de GitHub cuando corre (usa el mismo ticket).
- **Comuna cercana y del rubro → nunca rojo, y alerta `comuna_cercana`** (`aplicarReglas`, `lectura/reglas.ts`). "Del rubro" es tener alguna etiqueta distinta de `otro`: una compra de hormigón de Quillón sigue roja. Afinado al construir (16-10): el doc 17 §5.2 decía "nunca rojo" a secas. La comuna se busca como palabra entera, sin tildes, en comuna, organismo y unidad.
- **Monto igual o mayor al alto valor de la empresa → alerta `alto_valor`**, si no quedó en rojo. El umbral es `companies.high_value_threshold` (Valle del Sol: $3.000.000), el mismo de Configuración de empresa (doc 17, decisión 9).
- **La lectura de una empresa nunca se reescribe** sola: `ignoreDuplicates`. Lo que la empresa decidió (estado, responsable, notas) no lo toca el radar.
- **Las rojas no se botan**: quedan en la base (doc 17 §5.2).
- **Hora de Chile.** La API de licitaciones entrega fechas sin zona, en hora de Chile; `fechaChileAIso` las pasa a UTC con el desfase real de ese día (verano −3, invierno −4).

## 7. Conexiones con otros módulos

- **Acceso y planes (15)**: el derecho `oportunidades` es un módulo propio (`derechos.ts`, `esModuloPropio`): no lo da ningún plan, ni la prueba de Crece. El reloj no tiene sesión: `empresasConModulo` filtra con la misma `derechosDe`, así que una empresa bloqueada no entra aunque tenga el módulo.
- **Catálogo (05)**: `catalogoResumido` lee `service_group_collections` y `fixed_services` de la empresa, solo los nombres, para el perfil de la IA.
- **Cotizaciones (01)**: `oportunidades.quotation_id` apunta a `quotations` para el sprint 4; nadie la escribe todavía.
- **Infraestructura (16)**: un reloj más, cada 2 horas; y las variables `MP_TICKET` (Mercado **Público**, no Mercado Pago) y `ANTHROPIC_API_KEY`, que `validate-env.ts` reclama como importantes sin detener el arranque.
- **El bot de GitHub**: comparte el ticket de Mercado Público (10.000 consultas al día) mientras convivan.

## 8. Zonas de riesgo: si tocas esto, cuidado con aquello

1. **El respaldo diario de Eventia (mapa 16) arma un solo archivo en memoria con TODAS las tablas.** `mp_procesos` crece con todo Chile (unas 500 licitaciones nuevas por día, con su detalle crudo) y habría terminado botando el respaldo de todo Eventia. **Desde el 17-10 queda fuera** (`FUERA_DEL_RESPALDO` en `backup-cron.service.ts`, decisión 13 del doc 17; prueba `backup/tests/fuera-del-respaldo.spec.ts`). Una tabla pública nueva que crezca así va a esa misma lista.
2. **La primera corrida gasta mucho cupo**: unas 6.000 consultas de detalle a Mercado Público, del mismo ticket que usa el bot (10.000 al día). Laboratorio y producción comparten ticket: no hacer la primera corrida de los dos el mismo día. Y nada de pedir en paralelo: la API rechaza las peticiones simultáneas con el mismo ticket.
3. **El candado vive en la base** (`mp_radar_una_corriendo`), no en memoria: dos réplicas del motor no corren dos radares. Si una corrida muere, la siguiente la marca `abandonada` a las 3 horas.
4. **Un `upsert` sin `ignoreDuplicates` en `guardarLectura`** pisaría lo que la empresa decidió. La prueba `oportunidades.repository.spec.ts` lo fija.
5. **Las consultas de empresa sin `company_id`** filtrarían lecturas de otra empresa. Lo fija la misma prueba; `listar` usa `!inner` (un embebido sin `!inner` no filtra, lección del mapa 22).
6. **El ticket nunca va a un registro**: los errores dicen el código HTTP y qué se pedía, no la URL (`mercado-publico.client.spec.ts`).

## 9. Pruebas que lo protegen

| Prueba | Qué fija |
|---|---|
| `oportunidades/tests/mapeo.spec.ts` | Hora de Chile a UTC en verano e invierno, regiones escritas de varias formas, traducción de licitación y compra ágil, quién ganó y a qué precio |
| `oportunidades/tests/reglas.spec.ts` | Comuna cercana y del rubro nunca rojo; hormigón de Quillón sigue rojo; alto valor; palabra entera |
| `oportunidades/tests/mercado-publico.client.spec.ts` | Reintentos ante 504 y cortes de red, 429 sin reintento, el error escrito dentro de un 200, "peticiones simultáneas" se reintenta, el ticket nunca en errores ni registros, páginas de compra ágil |
| `oportunidades/tests/lectura.service.spec.ts` | Pedido a Haiku 5.5 con esfuerzo bajo y caché; rechazo → amarillo; fallas de la cuenta detienen; las demás dejan el proceso sin leer |
| `oportunidades/tests/radar.service.spec.ts` | El candado; solo lo nuevo, de a uno y en orden de cierre; cierre movido y reapertura; caída de la lista; corte tras 10 fallas; tope de tiempo; compras ágiles desde la última corrida; lectura por región y en orden de cierre |
| `backup/tests/fuera-del-respaldo.spec.ts` | `mp_procesos` fuera del respaldo diario; lo de cada empresa adentro |
| `oportunidades/tests/oportunidades.service.spec.ts` | La bandeja en orden de cierre y solo lo vigente; 404 de otra empresa; el responsable tiene que ser de la empresa; notas limpias; la configuración limpia sus listas |
| `oportunidades/tests/oportunidades-cron.service.spec.ts` | Al encender suelta el candado de una corrida a medias; la palanca corre el radar un minuto después |
| `frontend/src/pages/oportunidades/oportunidades.utils.test.ts` | Lo que se ve de partida (sin rojas ni descartadas), contadores por color, buscador sin tildes, cuenta regresiva del cierre, enlaces a Mercado Público |
| `oportunidades/tests/oportunidades.repository.spec.ts` | El candado contra la base; empresa bloqueada fuera; cada consulta de empresa filtra por `company_id`; la lectura no se pisa |
| `auth/tests/matriz-de-derechos.spec.ts`, `matriz-de-cargos.spec.ts`, `derechos.spec.ts` | Las tres rutas cerradas con `oportunidades` y solo para administrador; ningún plan da el derecho |

## 10. Deuda y rarezas conocidas

- `procesosAbiertos` trae a memoria todo lo abierto de Chile en cada corrida (unas 6.000–8.000 filas) para filtrar por región después. Sirve hoy; si crece, filtrar por región en la consulta.
- El estado de una licitación cerrada no se actualiza todavía (llega con la adjudicación, sprint 1b): sale de la lectura por su fecha de cierre.

## 11. Preguntas abiertas (para Felipe)

- Respondidas el 17-10: todo Chile; `mp_procesos` fuera del respaldo; solo administradores; sin resumen por correo (doc 17, decisiones 12 a 15).
- Quedan: ¿se mantiene el aviso inmediato de comuna cercana y alto valor? (no está construido). Las rojas quedaron apagadas de partida en la bandeja, con un clic se ven: ¿así está bien?

## 12. Archivos clave

- `api-rest/src/oportunidades/oportunidades.module.ts`, `oportunidades.controller.ts`, `oportunidades-cron.service.ts`, `radar.service.ts`, `oportunidades.repository.ts`, `dto/listar-oportunidades.dto.ts`
- `api-rest/src/oportunidades/mercado-publico/mercado-publico.client.ts`, `mapeo.ts`, `tipos.ts`
- `api-rest/src/oportunidades/lectura/lectura.service.ts`, `reglas.ts`
- `api-rest/src/auth/derechos.ts` (el derecho `oportunidades`), `api-rest/src/config/validate-env.ts` (las dos variables)
- `api-rest/src/oportunidades/oportunidades.service.ts`, `dto/actualizar-oportunidad.dto.ts`, `dto/guardar-config.dto.ts`
- `frontend/src/pages/oportunidades/OportunidadesPage.tsx`, `OportunidadFichaPage.tsx`, `ConfiguracionOportunidades.tsx`, `oportunidades.utils.ts`
- `frontend/src/services/oportunidades.service.ts`; `frontend/src/constants/permissions.ts` (sección y derecho `oportunidades`)
- `docs/migrations/122_oportunidades_radar.sql`
