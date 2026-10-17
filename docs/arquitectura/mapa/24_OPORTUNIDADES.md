# Mapa: Oportunidades (licitaciones y compras ágiles de Mercado Público)

> **Estado: escrito al construir, contra el código de la rama `feature/oportunidades-radar` (16-10-2026).** Es el sprint 1a del documento 17: el radar, sin pantalla. **No está aplicado en el laboratorio ni en producción**: la migración 122 espera el OK de Felipe. Manda `docs/arquitectura/17_MODULO_DE_OPORTUNIDADES.md`; si este mapa lo contradice, se anota en los dos. Parte del atlas de docs/arquitectura/mapa; el índice es 00_MAPA_DEL_SISTEMA.md.

## 1. Qué hace

Es el reemplazo del bot de GitHub (`valledelsol-automation`, `run_compra_agil.py`), que avisaba por correo y se le escaparon las dos grandes de Quillón del 9-10. La diferencia de fondo: **Eventia guarda todo en su propia base** y "nuevo" quiere decir **"no está en la base"**, nunca "publicado hoy".

Cada 2 horas el radar:

1. Pide la lista liviana de **todas las licitaciones activas de Chile** (una sola consulta), la compara con la base y solo pide el detalle de lo que no tiene. De lo que ya tiene, revisa si movieron el cierre o si volvió a abrirse, y lo anota.
2. Pide las **compras ágiles** de las regiones configuradas, desde la última corrida buena menos 48 horas.
3. Para cada empresa con el derecho `oportunidades` (hoy solo Valle del Sol), **lee con Claude Haiku 5.5** lo abierto de sus regiones que todavía no leyó: etiquetas, si se hace en el complejo, semáforo y la razón en una frase. Encima de la IA mandan dos reglas fijas (§6).
4. Anota la corrida en su bitácora (`mp_radar_corridas`): qué trajo, qué falló y cuántos tokens gastó.

Lo que **todavía no hace** (doc 17 §7): pantalla y avisos por correo (sprint 2); bajar bases y anexos, guardar quién ganó al cerrar y cargar 2–3 años de historia (sprint 1b); generar documentos (sprint 3); generar cotización (sprint 4).

## 2. Pantallas y rutas de la app

Ninguna todavía: la pantalla "Oportunidades" es el sprint 2 (doc 17 §5.3). El menú no tiene entrada.

## 3. Endpoints del motor

Todos en `OportunidadesController` (`api-rest/src/oportunidades/oportunidades.controller.ts`), con `@Roles(...ADMIN_ONLY)` y `@Derecho('oportunidades')` en la clase. La app no los llama todavía.

| Método y ruta | Controller y método | Service | Quién lo llama | Cargo y derecho |
|---|---|---|---|---|
| `GET /oportunidades?semaforo=&estado=&limite=` | `listar` | `OportunidadesRepository.listar` (con `mp_procesos!inner`, tope 1000) | nadie todavía (sprint 2) | administrador; `oportunidades` |
| `POST /oportunidades/radar` | `correrRadar` | `RadarService.iniciar('manual')`: toma el candado, responde al tiro `{ iniciada: true, corrida }` y la corrida sigue sola; si ya hay una, `{ iniciada: false, motivo }` | nadie todavía: es el "correr ahora" del laboratorio, donde los relojes no corren | administrador; `oportunidades` |
| `GET /oportunidades/radar/corridas` | `corridas` | `OportunidadesRepository.ultimasCorridas(10)` | nadie todavía | administrador; `oportunidades` |

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
3. **Licitaciones** (`RadarService.licitaciones`): `licitacionesActivas` → `procesosConocidos`. Conocidas: si el cierre cambió (se comparan instantes, no textos) o si estaba cerrada y vuelve a estar activa, `actualizarCierre` y una fila en `mp_cambios`. Nuevas: `detalleLicitacion`, de a 4 en paralelo, hasta 6.000 por corrida, guardadas de a 100.
4. **Compras ágiles** (`RadarService.comprasAgiles`): `comprasAgiles(desde, regiones)` con la región como número oficial (`codigosDeRegiones`: Ñuble 16, Biobío 8); de las nuevas se pide el detalle de a 2, y **sin detalle igual se guardan** (nombre, comprador y monto vienen en la lista).
5. **Lectura** (`RadarService.leer`): `procesosAbiertos` (cierre futuro o sin cierre) → por empresa, lo de sus regiones que no está en `codigosLeidos`, **ordenado por cierre** (lo urgente primero) → `LecturaService.leer` de a 3 → `aplicarReglas` → `guardarLectura`. Hasta 3.000 lecturas por corrida.
6. `terminarCorrida(id, 'ok' | 'error', resumen, error)`. `ejecutar` nunca lanza: cualquier falla queda en la bitácora.

### 5.2 La lectura con IA

`LecturaService.leer` llama a `messages.parse` con `claude-haiku-5-5`, esfuerzo bajo, salida con esquema fijo (`semaforo`, `etiquetas`, `se_hace_en_el_complejo`, `razon`) y las instrucciones de la empresa en caché (`instruccionesPara`: perfil y catálogo, desde `catalogoResumido`, que lee los nombres de los paquetes y de los fijos activos). El proceso va en `descripcionDe`: nombre, comprador, monto en pesos, cierre, descripción y hasta 30 productos.

- Si el modelo se niega o no devuelve nada legible → **amarillo** con "conviene revisarla a mano".
- Si falla la cuenta (llave mala, sin permiso, sin cupo por minuto, modelo que no existe o saldo agotado) → `LecturaDetenida`: la lectura de esa corrida se detiene y lo que falte se lee en la próxima.
- Cualquier otra falla → `null`: ese proceso queda sin leer y se reintenta en la próxima. Diez seguidas detienen la lectura de la corrida.

## 6. Reglas de negocio acordadas

- **Nuevo = no está en la base** (doc 17, decisión 2). Lo que Mercado Público mostró tarde, o se publicó un viernes en la noche, entra en la corrida siguiente.
- **Las licitaciones se guardan de todo Chile.** La región solo viene en el detalle, así que hay que abrir cada licitación nueva igual; guardarlas evita volver a abrirlas cada 2 horas. **Es una diferencia con el doc 17 §5.1**, que decía "si es de la región se guarda": anotada en los dos, a confirmar por Felipe. La IA lee solo lo de las regiones de cada empresa.
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

1. **El respaldo diario de Eventia (mapa 16) arma un solo archivo en memoria con TODAS las tablas.** `mp_procesos` crece con todo Chile (unas 500 licitaciones nuevas por día, con su detalle crudo). En meses puede hacer caer el respaldo de todo Eventia o la memoria del motor a las 07:00 UTC. **Antes de producción** hay que sacarla del respaldo de Eventia (son datos públicos que se vuelven a pedir; Supabase guarda su propia copia diaria). Propuesta anotada en el doc 17 §12, sin aplicar.
2. **La primera corrida gasta mucho cupo**: unas 6.000 consultas de detalle a Mercado Público, del mismo ticket que usa el bot (10.000 al día). Laboratorio y producción comparten ticket: no hacer la primera corrida de los dos el mismo día.
3. **El candado vive en la base** (`mp_radar_una_corriendo`), no en memoria: dos réplicas del motor no corren dos radares. Si una corrida muere, la siguiente la marca `abandonada` a las 3 horas.
4. **Un `upsert` sin `ignoreDuplicates` en `guardarLectura`** pisaría lo que la empresa decidió. La prueba `oportunidades.repository.spec.ts` lo fija.
5. **Las consultas de empresa sin `company_id`** filtrarían lecturas de otra empresa. Lo fija la misma prueba; `listar` usa `!inner` (un embebido sin `!inner` no filtra, lección del mapa 22).
6. **El ticket nunca va a un registro**: los errores dicen el código HTTP y qué se pedía, no la URL (`mercado-publico.client.spec.ts`).

## 9. Pruebas que lo protegen

| Prueba | Qué fija |
|---|---|
| `oportunidades/tests/mapeo.spec.ts` | Hora de Chile a UTC en verano e invierno, regiones escritas de varias formas, traducción de licitación y compra ágil, quién ganó y a qué precio |
| `oportunidades/tests/reglas.spec.ts` | Comuna cercana y del rubro nunca rojo; hormigón de Quillón sigue rojo; alto valor; palabra entera |
| `oportunidades/tests/mercado-publico.client.spec.ts` | Reintentos ante 504 y cortes de red, 429 sin reintento, el ticket nunca en errores ni registros, páginas de compra ágil |
| `oportunidades/tests/lectura.service.spec.ts` | Pedido a Haiku 5.5 con esfuerzo bajo y caché; rechazo → amarillo; fallas de la cuenta detienen; las demás dejan el proceso sin leer |
| `oportunidades/tests/radar.service.spec.ts` | El candado; solo lo nuevo; cierre movido y reapertura; caída de la lista; corte tras 10 fallas; compras ágiles desde la última corrida; lectura por región y en orden de cierre |
| `oportunidades/tests/oportunidades.repository.spec.ts` | El candado contra la base; empresa bloqueada fuera; cada consulta de empresa filtra por `company_id`; la lectura no se pisa |
| `auth/tests/matriz-de-derechos.spec.ts`, `matriz-de-cargos.spec.ts`, `derechos.spec.ts` | Las tres rutas cerradas con `oportunidades` y solo para administrador; ningún plan da el derecho |

## 10. Deuda y rarezas conocidas

- `procesosAbiertos` trae a memoria todo lo abierto de Chile en cada corrida (unas 6.000–8.000 filas) para filtrar por región después. Sirve hoy; si crece, filtrar por región en la consulta.
- El estado de una licitación cerrada no se actualiza todavía (llega con la adjudicación, sprint 1b): sale de la lectura por su fecha de cierre.

## 11. Preguntas abiertas (para Felipe)

- ¿Todo Chile o solo las regiones configuradas en `mp_procesos`? (§6)
- Sacar `mp_procesos` del respaldo diario de Eventia antes de producción (§8.1).
- Las de pantalla, para el mockup del sprint 2: quién ve el módulo (hoy, solo administrador), si las rojas se esconden por omisión, cada cuánto el resumen por correo.

## 12. Archivos clave

- `api-rest/src/oportunidades/oportunidades.module.ts`, `oportunidades.controller.ts`, `oportunidades-cron.service.ts`, `radar.service.ts`, `oportunidades.repository.ts`, `dto/listar-oportunidades.dto.ts`
- `api-rest/src/oportunidades/mercado-publico/mercado-publico.client.ts`, `mapeo.ts`, `tipos.ts`
- `api-rest/src/oportunidades/lectura/lectura.service.ts`, `reglas.ts`
- `api-rest/src/auth/derechos.ts` (el derecho `oportunidades`), `api-rest/src/config/validate-env.ts` (las dos variables)
- `docs/migrations/122_oportunidades_radar.sql`
