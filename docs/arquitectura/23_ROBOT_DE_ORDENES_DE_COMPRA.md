# 23 · El robot de órdenes de compra

> Estado: construido el 09-11-2026 en la rama `feature/robot-oc`. Va primero al laboratorio y llega a producción solo con el «a producción» de Felipe. La lectura de la OC una vez subida es de Facturación (doc 19 §9.26). Este documento cubre solo cómo llega la OC a Documentos.

## 1. Qué pidió Felipe

Felipe, 09-11-2026: *"busca en mi correo los últimos 4 meses las órdenes de compra, ve dónde tú las clasificarías y valida si coinciden con las que tenemos en el sistema. Si logras identificarlas todas bien, lo pasamos a producción. Que sea una función tuya de cuando lees mis correos: un robotito que, cuando llegue una orden de compra, la suba automáticamente a Eventia"*. Y después: *"la idea es que el robot que revisa mis correos aproveche de ver si llegó una OC y la cargue a Eventia"*.

**No es un robot nuevo.** Es un paso más de la rutina de correo de la empresa, la que corre a las 08:10 y a las 16:10 en la nube (repo `valledelsol-automation`, carpeta `borradores`). Esa rutina ya lee los cinco buzones y sus adjuntos. Ahora, cuando ve una OC, se la manda a Eventia.

## 2. La validación que lo justificó (09-11-2026)

Se revisaron cuatro meses de correo en los cinco buzones. Llegaron 7 OC de empresa:

| OC | Cliente | Cotización |
|---|---|---|
| OC-024940-1 | Linde | #470 |
| 33000132941, 33000132942, 32000066941 | Santo Tomás | #481 |
| 4505440173 | CCU, almuerzo de sindicatos | #554 |
| 4505466941 | CCU, «1er pago Navidad» | #408 |
| 35074 | Rudel, anticipo de hospedaje | #500 |

Las cinco clasificadas con seguridad coincidían con Eventia. La de Rudel no estaba cargada. La segunda de CCU se resolvió con la regla de Felipe: *"la de CCU era por contacto: Daniela nos envió la OC y quedó en la cotización de Daniela"*. La compradora que nombra el PDF es el contacto de la #408.

Las OC de Mercado Público nunca llegan por correo: se bajan del portal. El robot no las cubre.

## 3. La regla del cruce (`api-rest/src/robot-oc/elegir-cotizacion.ts`)

1. **El cliente.** Por el RUT de la OC (`razones_sociales`), por un correo igual a uno del cliente (su ficha o sus contactos) o, si no hay, por el dominio del correo (`rudel.cl` → Rudel). No cuentan los dominios genéricos (gmail, hotmail…) ni los propios (`valledelsolquillon.cl`, `eventi-app.com`).
2. **Ya cargada.** Si el N° de la OC ya está en una cotización del cliente (leído por BelIA en `ordenes_de_compra.numero`, o en el nombre o la ruta del PDF de Documentos), no se vuelve a subir.
3. **Cotizaciones que pueden recibirla.** Solo las aceptadas o realizadas cuyo total alcanza para la OC, con $1.000 de holgura. Un anticipo es menor que el evento, nunca mayor.
4. **Si quedan varias.** Gana la del **contacto** que mandó la OC o que la OC nombra como comprador. Si siguen varias, la de **total exacto**. Si aun así queda más de una, **no se adivina**: se devuelve la duda con las candidatas.

Cada caso del §2 es una prueba: `api-rest/src/robot-oc/tests/elegir-cotizacion.spec.ts`.

## 4. La puerta del motor

`POST /robot/ordenes-de-compra`, multipart: `numero`, `total`, `rut` (opcional), `correos` (separados por coma), `probar` (`si` o nada) y `archivo` (el PDF, hasta 5 MB).

- **La llave.** No hay sesión de persona. La puerta se abre con el encabezado `x-robot-key`, que debe ser igual a `ROBOT_OC_KEY`, y solo trabaja con la empresa de `ROBOT_OC_EMPRESA`. Las dos son variables de Railway. Sin ellas la puerta está apagada (503), con otra llave responde 401. La llave sirve solo para esto: no lee ni escribe nada más en Eventia. La administra Felipe.
- **Qué hace.** Con una sola cotización posible:
  - sube el PDF al balde privado, con la ruta de siempre (`c<empresa>/event-documents/<cotización>/ordenes_compra/<fecha>_OC_<N°>.pdf`);
  - agrega la fila de Documentos → «Órdenes de compra» con el nombre **«OC 35074 · Rudel»**;
  - llama a la misma lectura de BelIA que cuando la sube una persona (`leerAlSubir`, por detrás).
- **Qué responde.** `subida`, `ya_estaba`, `duda` (con las candidatas), `sin_cliente` o, con `probar=si`, `iria`, que dice dónde iría sin subir nada.
- **Qué no hace.** Con duda no escribe nada. Nunca cambia la cotización, el cliente ni la OC leída: todo eso sigue siendo de Facturación.

## 5. El lado de la rutina

- La rutina lee el PDF adjunto y saca el N°, el total, el RUT del comprador y el correo del comprador. Se lo manda a la puerta junto con el correo del remitente (`borradores/subir_oc.py`, con la llave en la variable `EVENTIA_ROBOT_OC_KEY` del entorno de la nube).
- En el resumen de la corrida deja una línea por cada OC: dónde quedó o por qué no se subió. Una duda se le muestra a Felipe con las candidatas, para que decida.
- Una cotización o un formulario de proveedor no es una OC. La rutina solo manda lo que el PDF dice que es una orden de compra (o nota de pedido) emitida a Valle del Sol.

## 6. Pendiente

- Encender: Felipe genera la llave y la pone en Railway (`ROBOT_OC_KEY` y `ROBOT_OC_EMPRESA=1`) y en el entorno de la nube «Correo VDS» (`EVENTIA_ROBOT_OC_KEY`).
- Primera pasada en producción con `probar=si` sobre las 7 OC del §2, antes de que suba de verdad.
