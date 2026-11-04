# 20 · Evia, la IA de Eventia (la ventanilla de chat)

> **Estado: PLAN APROBADO el 03-11-2026. Fases 1 y 2 EN PRODUCCIÓN desde el 04-11-2026 (PR #288, main `cc03e22d`, vitrina 6aeaa85b; migraciones 180 y 181 en las dos bases); las tablas pegadas, en producción el mismo día (PR #289). La firma «BelIA» con su carita en la bitácora, la conversación guardada por persona y BelIA para recepción (§13), en producción desde la tarde del 04-11-2026 (migración 182 en las dos bases). Las mejoras del 04-11 en la tarde (§14), en producción desde ese mismo día (Felipe: «a producción»; sin migración); «una sola IA» (§15): Felipe decidió el 04-11, y la etapa 1 (BelIA firma todo lo que escribe la IA de Eventia; las rutinas de correo de la empresa van aparte), BelIA en todas las empresas y el cupo de US$ 10 (§16), en producción desde la tarde del 04-11 (Felipe: «a producción»; migración 183 en las dos bases); la etapa 2, el cerebro común de la IA de Eventia (`api-rest/src/cerebro/`, §15), en producción desde la tarde del 04-11 (Felipe: «a producción»; sin migración). Ver abajo.**
> - En el chat, Felipe decidió los cargos, el nombre, el tope y la regla
>   de los vendidos: *"lo usa administración y vendedores"*, *"si me
>   sirve, Evia, mmm 100 USD mensuales?"*.
> - Vio dos maquetas: la ventanilla abierta sobre la 500, y el botón
>   redondo que se abre y se cierra.
> - Lo que sigue es la fase 1 (§10) en el laboratorio.
> - Migración reservada: **180**. Las 177 a 179 quedan libres para otras
>   sesiones.
>
> **03-11-2026 · Sprint 1 (el motor) escrito** (Felipe: *"vamos hazlo"*),
> en la rama `feature/evia-asistente`.
> - El módulo `api-rest/src/asistente/` con `POST /asistente/mensajes`.
>   - Recibe `{ mensaje, historial, pantalla: { ruta, cotizacion_id } }`.
>   - Devuelve `{ respuesta, herramientas, segundos, costo_usd,
>     uso_del_mes }`; `uso_del_mes` va solo a los administradores.
> - Seis herramientas de quien vende: `buscar_cotizaciones`,
>   `ver_cotizacion`, `calendario` (con el derecho `calendario`),
>   `seguimientos_pendientes` (la regla del tablero), `buscar_en_catalogo`
>   y `buscar_clientes`.
> - Opus 5.5 con pensamiento adaptativo; las instrucciones fijas y las
>   herramientas van en caché.
> - El tope se mira antes de llamar a Claude, y la cuenta se anota aunque
>   la respuesta falle.
> - Las dos matrices de permisos ya la incluyen. 1.783 pruebas en verde y
>   `nest build` limpio.
> - **En el laboratorio desde el 03-11-2026.** La migración 180 se aplicó en
>   la base del lab, y el motor del lab (`api-rest-pruebas`) corre la rama.
>   Cinco preguntas reales, con la sesión de Felipe:
>   - los seguimientos pendientes;
>   - el calendario de noviembre;
>   - la leche asada en el catálogo;
>   - «anula la 437», que no la anula;
>   - «¿qué comen el día 2 de esta?», con la 436 abierta.
>
>   Respondió en 5 a 9 s, con US$ 0,014 a 0,039 por pregunta (unos US$ 0,02
>   en promedio). De ahí salió una regla de las instrucciones: la bitácora y
>   el comentario interno no los ve el cliente; las observaciones, sí.
> - **Falta:** la ventanilla (sprint 2), el resto de las consultas (sprint
>   3) y la 180 en producción.
>
> **03-11-2026 · Sprint 2a, la ventanilla, con la cara provisoria.**
> - Ya se llama BelIA en el motor (el derecho sigue siendo `asistente`).
> - `GET /asistente/estado`, sin IA, da el ánimo de fondo.
> - La ventanilla sigue la lámina de Felipe:
>   - cabecera azul noche con «BelIA · Asistente de Eventia», «—» y «×»;
>   - el saludo «¡Guau! … ¿Qué organizamos hoy?»;
>   - cuatro atajos (Ver pendientes, Calendario, Esta cotización o
>     Catálogo, Ayuda); «Crear evento» espera a la fase 2;
>   - «Escribe tu mensaje...» con el botón azul redondo.
> - Los cinco ánimos andan, pero celebrar todavía no lo dispara ninguna
>   pantalla.
> - La cara es un círculo con una huella hasta que llegue el SVG de Bela
>   con sus partes separadas.
> - Su mapa es `mapa/25_BELIA.md`.
>
> **03-11-2026, noche · La cara, más barata y la fase 1 completa.**
> - **La cara** es el dibujo de Bela que mandó GPT, en seis piezas. Va sin
>   sonido (Felipe: *"es sin sonido esto"*).
> - **Más barata** (Felipe: *"vamos con tus 4 recomendaciones"*):
>   - busca varios productos del catálogo de una vez;
>   - guarda la conversación en caché dentro de cada pregunta;
>   - guarda sus instrucciones una hora;
>   - piensa con esfuerzo «medium».
> - **Celebra** cuando se marca «Listo», se crea un plan de pagos (es
>   aceptar), se registra un abono o se marca un evento realizado.
> - **Consultas nuevas (sprint 3):**
>   - pagos y cobranza, para operaciones para arriba;
>   - insumos, proveedores y mobiliario, para operaciones para arriba;
>   - personal, solo administración.
> - **Lo que no hace:** calcular lo que hay que comprar (eso es Compras,
>   mapa 25 §8 riesgo 5).
> - **Falta:** probarlo en el lab, la 180 en producción y la fase 2.
>
> **03-11-2026, noche · La fase 2 y lo que hay que comprar** (Felipe:
> *"vamos con lo que no puede hacer para dejarla lista hoy"*).
> - **Lo que hay que comprar.** La cuenta de cada evento (`consolidateEvent`)
>   se mudó de la app al motor, sin cambiar una coma:
>   `api-rest/src/logistics/utils/consolidacion.ts`, que la app importa con
>   el alias `@consolidacion`, como la del dinero. Tiene sus primeras
>   pruebas. La herramienta `lo_que_hay_que_comprar` (operaciones para
>   arriba, derecho `logistica`) la corre con los mismos datos y el mismo
>   filtro de Compras: por insumo, lo que piden los eventos aceptados, lo
>   que falta comprar, su costo y qué cotizaciones lo piden.
> - **Propone y la persona aprueba (§3, regla 3).** Dos herramientas que no
>   escriben: `proponer_cambio_de_servicios` (agregar o quitar servicios
>   del catálogo, personas por casilla, una casilla entera con un menú
>   guardado adaptado —así se arma la minuta—, sacar casillas, poner y
>   sacar fijos) y `proponer_nota` (la bitácora). La propuesta queda en
>   `asistente_propuestas` (**migración 181**) y la persona la ve en una
>   tarjeta con el antes y el después, el total, las cuotas, los avisos en
>   ámbar y «Sí, aplicar».
> - **Al aplicar se revisa todo de nuevo** (`POST
>   /asistente/propuestas/:id/aplicar`): que sea de quien la pidió, que no
>   haya vencido (2 horas), que nadie haya tocado la cotización entre medio
>   (una huella), el cargo, el estado y los días servidos. Se guarda con
>   `QuotationsService.update`, la puerta del cotizador, y queda en la
>   bitácora: «BelIA, a pedido de …». Dos clics no la aplican dos veces.
> - **Las reglas del §4 y §5, con código:** lo no vendido, quien vende; lo
>   aceptado, solo operaciones y administración; lo realizado, nadie; en un
>   evento que empezó, ni los días servidos ni el de hoy; con compras
>   hechas, bajar personas solo el administrador, con aviso; la ficha de
>   cocina ya impresa, con aviso. Las cuotas de la tarjeta salen de las
>   mismas funciones de «el plan mantiene su forma» que corre el guardado.
> - **Decisiones que tomé por defecto, para que Felipe las confirme:**
>   1. sin descuentos (pregunta 1 del §11, como decía el plan);
>   2. ~~las notas van a nombre del Asistente, con el robot, y el texto dice
>      «BelIA, a pedido de …» (pregunta 2)~~ **cambió el 04-11** (Felipe,
>      sobre la maqueta: *"Sí, me parece bien"*): las notas de BelIA
>      firman «BelIA», con su carita, y el texto ya no repite el nombre
>      («A pedido de …: …»; abajo);
>   3. una propuesta dura 2 horas y solo la aplica quien la pidió;
>   4. «Deshacer» solo en lo no vendido: en una aceptada la cascada del plan
>      no tiene vuelta exacta, así que se pide el cambio contrario y se ven
>      las cuotas antes;
>   5. ~~BelIA no cambia las fechas ni las personas del evento, ni agrega
>      fijos cuyo precio depende de las personas: eso, en la pantalla~~
>      **cambió el 04-11** (Felipe: *"creo que debería poder en una
>      cotización aún no aceptada"*): las personas del evento sí, en las
>      no aceptadas (§14); las fechas y los fijos que cobran por persona,
>      en la pantalla;
>   6. si la persona tiene abierta la misma cotización, la página se recarga
>      al aplicar (la tarjeta lo avisa antes), para que un formulario viejo
>      no pise el cambio.
> - Su mapa es `mapa/25_BELIA.md`. 1.829 pruebas del motor y 803 de la app
>   en verde.
> - **En el laboratorio desde el 03-11, ya tarde** (migración 181 aplicada
>   y verificada; motor `793cc22` y después `f74368e`; vitrina 6aea93cd).
>   Probado en la pantalla, con la sesión de Felipe:
>   - la 447 (formato antiguo, sin días ni personas en sus casillas):
>     macedonia por leche asada en el almuerzo del pollo, $2.273.920 →
>     $2.289.120 (+$15.200: $500 × 40 con el 24 % de descuento). Aplicada,
>     con la nota en la bitácora, y deshecha: quedó idéntica (misma huella);
>   - la 473 aceptada: + leche asada al almuerzo, +$240.000. Las tres cuotas
>     vencidas no cambian y nace una de $240.000, como manda el doc 14. Se
>     dijo «No»;
>   - una nota en la 445 con llamada y próximo contacto, «a pedido de Felipe
>     Vargas»;
>   - lo que hay que comprar para los 12 aceptados: $11.562.416, **la misma
>     cifra al peso** que «Faltante por comprar» de Compras.
>
>   De la prueba salieron cuatro arreglos: el nombre de quien escribe (la
>   sesión no lo trae), los ids en la búsqueda del catálogo, avisar solo la
>   forma que trae el cambio y distinguir casillas iguales del formato
>   antiguo por lo que tienen (`que_tiene`). Cada propuesta costó US$ 0,01
>   a 0,04; la primera después de cada subida, US$ 0,09 (la caché de una
>   hora se vuelve a escribir).
> - **Falta:** con su «a producción», las dos migraciones (180 y 181) y el
>   motor, y después la vitrina.
> - **04-11, 00:2x · «a producción»** (Felipe). Las migraciones 180 y 181,
>   **aplicadas en producción** y verificadas (respaldo de los módulos de la
>   empresa 1 en `02_RESPALDOS/cambios_de_datos`). El motor y la vitrina van
>   con la fusión del PR a main, después de las 07:00: fusionar reinicia el
>   motor de producción y de noche eso corta el radar de Oportunidades.
>
> **04-11-2026, madrugada · Las tres que faltaban** (Felipe: *"haz las 3
> primeras"*, de la lista contra este plan).
> - **La respuesta en vivo (§9).** `POST /asistente/mensajes/en-vivo`
>   responde `text/event-stream`: el texto llega mientras BelIA lo escribe
>   (`messages.stream`), avisa cuando va a buscar algo y termina con la
>   respuesta completa y sus tarjetas. La ventanilla lo lee por la misma
>   instancia `api` de la casa. Lo escrito antes de una herramienta se borra:
>   la respuesta es lo de la última vuelta. La puerta sin vivo queda.
> - **Los avisos (§8b).** «Llama tu atención» también salta con un tope de
>   calendario nuevo (la lista del tablero, `ChoquesDeFechaService`) y con
>   un comprobante del portal por revisar (operaciones para arriba con
>   Post-Venta). La burbuja pregunta «¿Qué tengo que revisar hoy?» y BelIA
>   contesta con la consulta nueva `avisos_de_hoy`.
> - **«Crear evento» (la lámina).** `proponer_cotizacion_nueva`: una
>   cotización nueva con sus servicios (las reglas de «Crear con IA») o un
>   requerimiento sin ellos, para un cliente que existe o uno nuevo. El
>   cliente nuevo pasa por el portero de clientes parecidos de las pantallas
>   y la cotización por la puerta del formulario (`QuotationsService.create`).
>   Lo que pidió el cliente va al comentario interno, nunca a las
>   observaciones. Se aprueba con «Sí, crear» y no se deshace (borrar es del
>   rojo). Es el atajo «Crear evento» de la ventanilla.
> - La 181 se completó en el mismo archivo (la cotización puede faltar
>   mientras no se crea, y el tipo `cotizacion_nueva`), aplicada en el
>   laboratorio. Para que el portero de los 800 renglones deje pasar,
>   «Crear evento» vive en `propuestas/cotizacion-nueva.service.ts` y lo de
>   la tabla de propuestas en `propuestas/propuestas.repository.ts`.
> - 1.838 pruebas del motor y las de la app en verde.
> - **En el laboratorio desde el 04-11** (pruebas `ace8b33`, vitrina
>   6aeaa31d) y probado en la pantalla con la sesión de Felipe:
>   - la burbuja de aviso salió sola por los topes de calendario, y «¿Qué
>     tengo que revisar hoy?» los listó (4 cotizaciones, con la aceptada con
>     que chocan);
>   - la respuesta en vivo llegó en 34 trozos, del segundo 1,6 al 3,4:
>     Railway no la junta;
>   - «Crear evento» armó y creó la N° 484 de prueba (Cliente demo, 27-11,
>     30 adultos, $432.000 = $14.400 × 30), con el aviso del tope y las
>     observaciones en blanco. **La 484 quedó en el laboratorio.**
>
>   La prueba costó US$ 0,14 (la propuesta de «Crear evento», US$ 0,035).
>
> **04-11-2026, madrugada · EN PRODUCCIÓN** (Felipe: *"fusiona ahora"*,
> sin esperar las 07:00: el radar de Oportunidades no estaba corriendo).
> - El PR #288 se fusionó a main (`cc03e22d`). El motor de producción
>   subió con esa versión y la vitrina de producción es la 6aeaa85b. Las
>   migraciones 180 y 181 ya estaban aplicadas (arriba).
> - La primera pregunta real, «¿Qué tengo que revisar hoy?», contestó con
>   los datos de Valle del Sol: 20 cotizaciones con tope de calendario.
> - De esa pregunta salió un arreglo de pantalla: una tabla escrita justo
>   debajo de un párrafo, sin línea en blanco, se veía como texto con
>   rayas. `belia.ts` ahora la separa antes de leer los bloques
>   (`separarTablas`, con su prueba). Va en el PR siguiente, solo
>   pantalla: no reinicia el motor.
> - **Falta que Felipe decida:** si se guardan las conversaciones (§11,
>   pregunta 3) y si confirma las seis decisiones por defecto de la fase 2
>   (arriba).
>
> **04-11-2026, mañana · BelIA firma con su carita** (Felipe: *"puedes
> hacer un pequeño icono de Belia (perrita negra) y que esto quede siempre
> con icono y como BelIA?"*; con la maqueta: *"Sí, me parece bien"*).
> - Lo que anota BelIA en la bitácora (crear un evento, cambiar servicios,
>   una nota, deshacer) queda a nombre de **«BelIA»**
>   (`QuotationFollowupsService.crearComoBelia`), sin autor de sesión: como
>   el Asistente, nadie la edita ni la borra.
> - En el Seguimiento sale con **su carita**, `public/belia/icono.png`,
>   armada con las mismas piezas de su dibujo y sin fondo como los otros
>   personajes, más la «B» y la franja en el gris grafito de la IA. Nadie
>   la puede elegir en Mi cuenta.
> - El texto ya no repite el nombre: «A pedido de Felipe Vargas: creó la
>   cotización. …», «… (a pedido de Camila)» al final de una nota
>   propuesta y «Deshizo, a pedido de …: …». El comentario interno de una
>   cotización nueva sigue diciendo «Lo que pidió el cliente (BelIA, a
>   pedido de …)»: ahí no hay firma.
> - Lo que escriben las otras IA («✉ Generar seguimiento», «✨ Crear con
>   IA», Oportunidades) sigue a nombre del «Asistente», con el robot.
> - En el laboratorio, las notas de BelIA ya escritas pasaron a la firma
>   nueva, con respaldo. En producción había una sola (la de Marval, N°
>   743): pasó con el «a producción» del 04-11, con su respaldo.
>
> **04-11-2026, mediodía · La conversación de cada persona y BelIA para
> recepción, en el laboratorio** (Felipe: *"Sí, me parece bien"* a la
> propuesta, y de la bitácora para recepción *"muéstrale lo que dice la
> bitácora ... más que mostrarles, como darle contexto"*; del tope, *"No
> importa ... esto se paga solo, así que vamos"*). El detalle va en el §13.
> Resuelve la pregunta 3 del §11: las conversaciones se guardan, pero
> cada una es solo de su persona.
>
> **04-11-2026, tarde · Las tres, en producción** (Felipe: *"a
> producción"*). La 182 se aplicó en la base de producción antes de subir
> el motor, y la nota de Marval (N° 743) pasó a la firma de BelIA, con su
> respaldo en `02_RESPALDOS/cambios_de_datos`. Recepción quedó probada solo
> con las pruebas del motor.
> - Esa misma tarde Felipe perdió su conversación al cerrar con la «×», que
>   la borraba. Ahora la «×» cierra y guarda, y «Nueva conversación» va
>   abajo, con su pregunta (*"ok arréglalo"*). En producción con las
>   mejoras del §14.

## 1. Por qué

Felipe, 03-11-2026: *"Quiero agregar una ventanilla como de soporte de
chat en Eventia, que esté conectado a un agente, ojalá Opus, que pueda
hacer cosas como consultas, preguntas, gestión, algunos cambios, editar
cotizaciones (…) Debe tener límites, no debe poderse programar, no debe
poderse hacer modificaciones al sistema. Y no debe poder editar ciertas
cosas de pagos, tal vez. O eventos que ya estén como sobre la marcha"*.

**El caso que lo motivó** fue la minuta de Ecofor y Rudel.
- Camila estuvo horas armándola a mano.
- Con la IA, desde el chat de Felipe, salió en minutos.
- *"No podemos esperar a llegar yo para eficientar el tiempo a los
  demás."*

**Los ejemplos que dio:**
- agregarle algo a la cotización abierta, y que lo valide;
- «¿cuánta carne mechada tengo?»;
- en Compras, «¿en qué producto estoy ocupando el choclo granado?»;
- editar minutas;
- consultar calendarios, garzones, pagos, proveedores y compras;
- «cuántas cotizaciones me falta regestionar para que no se me escape
  ninguna».

## 2. Lo decidido (03-11-2026)

| Qué | Decisión | Felipe |
|---|---|---|
| Quiénes | Vendedor y arriba: vendedores, operaciones y administración. Operaciones entra porque está entre los dos. **Desde el 04-11 también recepción**, sin montos (§13) | *"lo usa administración y vendedores"*; *"para que también pueda la recepcionista trabajar con Belia"* |
| Nombre | **BelIA**, por Bela (03-11, más tarde): reemplaza a «Evia», que reemplazó a «Camilia». Es una mascota, no el robot, y Felipe manda su imagen (§8b). El derecho sigue siendo `asistente` | *"no me gusta el robot, se llamará Belia, por Bela"* |
| Modelo | Opus 5.5 (`claude-opus-5-5`). Se cambia en Railway con `MODELO_ASISTENTE`, sin tocar código | *"ojalá Opus"* |
| Tope | US$ 100 al mes, solo para Evia (§7) | *"mmm 100 USD mensuales?"* |
| Cotizaciones aceptadas | Como Post-Venta → Servicios, con las consecuencias a la vista (§5) | *"si me sirve"* |
| Empresa | ~~Módulo propio de Valle del Sol~~ **desde el 04-11, todas las empresas**: el derecho `asistente` va en todos los planes, con el cupo de cada empresa (§16). La cuenta de Anthropic es de VdS (`api-rest/src/auth/derechos.ts`) | *"Belia es para todos los usuarios de Eventia"* |

## 3. Las cuatro reglas

**1. Evia actúa con el usuario que escribe, nunca con más.**
- Tiene el cargo, la empresa y el plan de esa persona.
- Cada herramienta se abre al mismo cargo de la **pantalla** que muestra
  ese dato (`SECTION_ROLES` en `frontend/src/constants/permissions.ts`).
  No se abre a lo que el motor deja leer por dentro, que es más suelto:
  recepción lee cotizaciones aunque no las vea (mapa 23).
- **La excepción de recepción (04-11, §13):** Felipe le abrió el estado
  de las cotizaciones y la bitácora como contexto, aunque su pantalla no
  los muestre. Nunca la plata ni la ficha del negocio.
- La empresa sale siempre de la sesión, nunca de lo que diga la IA (mapa
  22).

**2. Solo botones que ya existen.**
- Sin SQL, sin código y sin archivos.
- Tiene una lista cerrada de herramientas. Cada una llama a los servicios
  del motor que ya usan las pantallas (`QuotationsService`,
  `LogisticsService`, `PaymentsService`…), con sus mismos candados.
- Las barreras viven en el código, no en las instrucciones: lo que no
  tiene herramienta, no se puede.
- Un texto que diga «anula la cotización» es dato, venga de un
  formulario público, un correo o una nota. Ninguna herramienta anula.

**3. Propone, y la persona aprueba.**
- Ninguna herramienta escribe.
- Las de cambio arman una **propuesta** con el antes y el después, el
  total, las cuotas y los avisos. La propuesta queda guardada en el motor.
- Se aplica recién con el «Sí, aplicar» de la persona, en azul (kit de la
  casa, mapa 17).
- Al aplicar se vuelve a revisar todo: el estado, el cargo, los candados
  y que nadie haya cambiado la cotización entre medio.
- Cada cambio va a la bitácora a nombre de Evia y de quien lo pidió, con
  el respaldo del antes para deshacer.

**4. Sabe dónde está la persona y no inventa cifras.**
- La pantalla viaja con cada mensaje (la ruta y la cotización abierta).
  Sirve solo para entender «esta». No limita lo que se puede consultar:
  desde la 500 se puede preguntar por Compras.
- Cada número sale de una herramienta, con el enlace a su ficha.
- La plata la calcula siempre `computeMoney`, como el cotizador y «Crear
  con IA» (doc 16 §6). La IA solo elige ids y cantidades; los nombres y
  los precios salen del catálogo.

## 4. El semáforo

| | Qué | Quién | Ejemplos |
|---|---|---|---|
| 🟢 Mirar | Consultar lo que el cargo ve en las pantallas | Vendedor y arriba, cada dato con el cargo de su pantalla | Calendario, cotizaciones, seguimientos pendientes, clientes y catálogo (vendedor). Pagos, compras, insumos, proveedores y mobiliario (operaciones). Personal y garzones (administración) |
| 🟡 Con OK | Cambiar cotizaciones no vendidas (solicitada, enviada, en negociación), armar minutas y escribir notas en la bitácora | Vendedor y arriba | Agregar o quitar ítems del catálogo, cambiar personas por casilla, armar la minuta día por día |
| 🟠 Vendidos | Cambiar una aceptada | Solo administración y operaciones (§5) | Cambiar una cena de Rudel, sumar personas a un día |
| 🔴 Nunca | Ver lista de abajo | Nadie | — |

**🔴 Lo que nunca hace Evia:**
- Pagos, abonos, cuotas, plan de pagos ni reembolsos.
- Cambiar estados: aceptar, rechazar, anular, marcar realizado.
- Precios del catálogo o a dedo.
- Nómina, liquidación ni propina.
- Usuarios, claves ni configuración.
- Borrar cualquier cosa.
- Enviar correos.
- Tocar eventos realizados.
- Tocar los días ya servidos de un evento en curso.
- Programar o cambiar el sistema.

## 5. Cotizaciones aceptadas

Evia hace lo mismo que hoy hace Post-Venta → Servicios, con los mismos
candados (mapa 04 §5.5). La diferencia es que muestra las consecuencias
**antes** de aplicar.

- **Quién.** Solo administración y operaciones, los mismos que hoy editan
  una aceptada (`SECTION_ROLES.payments`). Si un vendedor lo pide, Evia le
  dice que no puede y quién sí.
- **Total y cuotas.** La propuesta muestra el total nuevo y cómo quedan
  las cuotas, con la regla «el plan mantiene su forma» (doc 14):
  - Si el total sube, crecen las cuotas por pagar que no han vencido.
  - Si baja, bajan todas.
  - Si lo pagado supera el total nuevo, queda un reembolso pendiente.
  - La cascada la corre `QuotationsService.update`, como siempre.
- **Lo que ya se hizo.** Avisa en ámbar:
  - si el evento ya tiene compras (`event_supply_provisions`), porque
    Compras mostrará lo que falta o sobra;
  - si la ficha de cocina de ese día ya se imprimió (`event_day_prints`),
    porque hay que reimprimirla.
  - Con compras hechas, solo el administrador baja personas, igual que
    `ServiciosTab.save`.
- **Realizados.** Congelados, como hoy (`esEventoCongelado`). El motor
  rechaza `update`.
- **En curso.** Esta regla es nueva, solo de Evia; la pantalla no la
  tiene. En un evento de varios días ya empezado, como Rudel del 9 al
  22-11:
  - no se tocan los días ya servidos ni el de hoy (hora de Chile);
  - los días que vienen siguen las reglas de arriba.

## 6. Lo que Eventia no sabe (y Evia lo dice así)

- **Stock de bodega de los insumos.** No existe. El mapa 06 §6 lo dice:
  *"Sin inventario: comprado ≠ necesitado es la realidad, no un stock"*.
  Solo el mobiliario tiene stock (`furniture_items.stock`). A «¿cuánta
  carne mechada tengo?» Evia responde lo que **necesitan** los eventos
  que vienen y lo que ya se **compró** para ellos
  (`event_supply_provisions`).
- **Pagos a proveedores y gastos generales.** No se registran.
- **Cualquier otro dato sin herramienta.** Evia dice que no lo sabe;
  nunca estima a ojo.

## 7. El costo y el tope

**Lo medido.** «Crear con IA» con Opus 5.5 costó en promedio US$ 0,097
por cotización, entre US$ 0,026 y 0,258.
- Son 103 cotizaciones distintas, armadas del 17-10 al 02-11.
- La cifra sale del registro del motor en Railway, buscando "generada con
  claude".
- Una pregunta a Evia debería costar algo parecido, así que **US$ 100
  alcanzan para unas 1.000 preguntas al mes**.

**Los precios** son los anotados en el motor el 17-10, en
`oportunidades/analisis/comun.ts`. Por millón de tokens:
- entrada US$ 4;
- salida US$ 20;
- lectura de la caché US$ 0,2.

Las instrucciones y la lista de herramientas van en caché.

**La cuenta del mes.**
- El motor anota el costo de cada respuesta en `asistente_uso`
  (migración 180), por empresa, usuario y mes.
- ~~El tope vive en Railway: `TOPE_ASISTENTE_USD=100`.~~ **Desde el 04-11,
  cada empresa tiene su cupo** (`companies.tope_asistente_usd`, migración
  183): US$ 10 para las nuevas y 100 para Valle del Sol (§16).
  `TOPE_ASISTENTE_USD` queda solo para cuando el motor no puede leer la
  columna.

**Al acercarse al tope:**
- Al 80 %, los administradores ven un aviso en la ventanilla.
- Al 100 %, Evia se pausa hasta el mes siguiente con un mensaje claro,
  salvo que Felipe suba el tope.

**El tope es solo de Evia.** «Crear con IA», el seguimiento con IA y
Oportunidades siguen con lo suyo.

## 8. Cómo se ve (las maquetas del 03-11)

- **El botón.** Es redondo, con el robot, abajo a la derecha de todas las
  pantallas. Solo lo ve quien tiene el derecho y el cargo.
- **El panel.** Al pincharlo se abre al costado, sin sacar a la persona
  de donde está, y la X lo cierra. En el celular ocupa toda la pantalla.
- **La cabecera.** El robot, «Evia» y debajo dónde está la persona: «Estás
  en la N° 500 · Rudel».
- **Al abrir,** saluda por el nombre y ofrece tres preguntas sugeridas
  según la pantalla.
- **Las respuestas** traen el enlace de cada cotización o evento que
  nombran.
- **La propuesta de cambio** es una tarjeta con:
  - el antes y el después;
  - el total y la diferencia;
  - las cuotas;
  - los avisos en ámbar;
  - «Sí, aplicar» en azul y «No»;
  - la línea «Queda en la bitácora a nombre de Evia y de quien lo pidió».
- **La conversación** sigue abierta al cambiar de pantalla.
- **Cuidado:** el botón no puede tapar botones de las pantallas, por
  ejemplo «Guardar cambios» de Servicios o los avisos.

## 8b. BelIA: la mascota y sus cinco estados (Felipe, 03-11-2026)

*"no me gusta el robot, se llamará Belia, por Bela, te pasaré su imagen,
dale personalidad"*. El botón de §8 deja de ser el robot: es BelIA,
dibujada a partir de las fotos de Bela, para que pueda cerrar los ojos,
mover las orejas y la cola y fruncir el ceño. Los cinco estados son los
que escribió Felipe; en cursiva, lo que dispara cada uno en Eventia, por
confirmar con él.

| Estado | Cómo se ve y qué dice (Felipe) | Lo dispara |
|---|---|---|
| Dormida | Cierra los ojitos, baja las orejas, una «Zzz» sobre la cabeza | *Unos minutos sin que nadie use Eventia (propuesta: 5)* |
| Despierta | Abre los ojos, levanta las orejas, mueve la colita: «¡Guau! ¿Qué organizamos hoy?» | Al pincharla |
| Llama tu atención | Un ladrido chico y la burbuja «¡Guau! Tienes algo importante que revisar». El sonido es opcional y no interrumpe todo el rato | *Algo nuevo e importante: un compromiso que vence hoy, un comprobante del portal por revisar, un requerimiento nuevo, un tope de calendario. Como mucho una vez por hora.* **Sin sonido** (Felipe, 03-11: *"es sin sonido esto"*): el ladrido es solo la burbuja y las ondas |
| Se enoja | Frunce el ceño, levanta las orejas, se pone seria: «¡Oye! Tenemos demasiado trabajo acumulado. ¡Vamos a resolverlo!» | *Demasiado acumulado: propuesta, más de 10 cotizaciones con el compromiso vencido (la herramienta `seguimientos_pendientes`)* |
| Celebra | Feliz, mueve la cola y celebra | *Un compromiso marcado «Listo», una cotización aceptada (la reserva), un abono registrado, un evento marcado realizado* |

Regla de la casa que aplica: lo que se mueve en una pantalla que se mira
todo el día termina siendo ruido (`tailwind.config.js`, la animación
«vibrar»: *"tres veces y para"*). Por eso cada animación de BelIA tiene
fin, salvo la respiración lenta de dormida.

## 9. Cómo se arma (para quien programe)

**Antes de escribir el ciclo**, leer la skill `claude-api`. Los nombres
del SDK no se adivinan.

**Motor:** el módulo nuevo `api-rest/src/asistente/`.
- `POST /asistente/mensajes`, con respuesta en vivo.
  - Pide cargo `SALES_AND_UP` y el derecho `asistente`.
  - Entra a `matriz-de-cargos.spec.ts` y a `matriz-de-derechos.spec.ts`.
- El ciclo es Claude con herramientas, con el SDK oficial
  `@anthropic-ai/sdk`, que ya está instalado.
- Las herramientas van en `api-rest/src/asistente/herramientas/`, una
  por archivo.
  - Cada una declara su cargo mínimo y llama a servicios que ya existen,
    con el `User` de la sesión.
  - Devuelven **resúmenes cortos**, nunca la fila cruda. Los ítems de la
    500, con 14 días, pesan miles de tokens.
- El uso y el tope van en la tabla `asistente_uso`, que crea la
  migración 180. La misma migración suma `asistente` a los
  `modulos_propios` de la empresa 1, como la 140.

**Fase 2 (§10), construida el 03-11:**
- La tabla `asistente_propuestas` (migración 181) guarda la propuesta con
  su antes, su parche y su huella.
- `POST /asistente/propuestas/:id/aplicar` vuelve a validar y aplica con
  `QuotationsService.update`, la misma puerta del cotizador, con
  `assertMoneyMatches` y la cascada del plan. `descartar` es el «No» y
  `deshacer`, la vuelta atrás de lo no vendido.
- Los cambios se arman en `api-rest/src/asistente/propuestas/`:
  `editar-foto.ts` (con `armarFoto` de «Crear con IA»), `reglas.ts` (quién,
  qué días, la plata y las cuotas) y `propuestas.service.ts`.

**Vitrina:** la ventanilla va en el marco de la app, así aparece en todas
las pantallas. Manda la ruta y la cotización abierta con cada mensaje.

**Railway:**
- `ANTHROPIC_API_KEY` ya está.
- Lo nuevo es `TOPE_ASISTENTE_USD` y, si se quiere, `MODELO_ASISTENTE`.

**A medir en el laboratorio:** que la respuesta en vivo no se corte en el
camino entre Railway y la vitrina.

## 10. Las fases

**Fase 1 · Consultas, sin cambiar nada.**
1. **Sprint 1, el motor.**
   - Las primeras herramientas: buscar cotizaciones, la ficha de una
     cotización, el calendario, los seguimientos pendientes, el catálogo
     y los clientes.
   - El derecho y el tope, con la migración 180, primero en el lab.
   - Se prueba con preguntas reales en el laboratorio.
2. **Sprint 2, la ventanilla.** El botón, el panel, la respuesta en vivo
   y la pantalla en cada mensaje.
3. **Sprint 3, el resto de las consultas:**
   - pagos y cobranza;
   - compras e insumos: lo necesitado, lo comprado y en qué productos se
     usa un insumo (`service_recipe_items`);
   - proveedores y mobiliario;
   - personal, solo para administración.
4. **Prueba de Felipe** en el lab y, con su «a producción», a producción
   (hecho el 04-11, PR #288).

**Fase 2 · Cambios con OK.** Primero las cotizaciones no vendidas, las
minutas y las notas de la bitácora. Después las aceptadas, con lo del §5.
Escrita completa el 03-11 en la noche, las dos partes a la vez, con lo que
hay que comprar (ver el estado arriba).

**Fase 3.** Lo que vaya pidiendo el uso.

## 11. Preguntas abiertas (no frenan la fase 1)

1. **Descuentos.** ¿Evia puede aplicar uno si la persona lo pide, con el
   tope de su cargo (administrador 40 %, vendedor y operaciones 15 %)?
   Hasta que Felipe decida, no. (03-11: la fase 2 salió así.) **04-11,
   decidido** (Felipe: *"vamos con la 1 a la 6"*): sí, el que la persona
   pida y nunca uno que ofrezca BelIA, con ese tope (§14).
2. **Las firmas de la bitácora.** ¿Las notas de «Crear con IA» y del
   seguimiento pasan a firmar «Evia»? Hoy firman «Asistente», con el
   robot. (03-11: las de BelIA también firman «Asistente», y el texto
   dice «BelIA, a pedido de …». **04-11, decidido para BelIA:** las suyas
   firman «BelIA», con su carita; las de «Crear con IA» y del
   seguimiento siguen como «Asistente».)
3. **Las conversaciones.** ¿Se guardan para revisar quién preguntó qué?
   La propuesta es que sí, por 90 días, y que solo las vea
   administración. **04-11, decidido:** se guardan para que BelIA siga la
   conversación, una por persona, y solo las ve esa persona; se borran a
   los 90 días sin uso (§13).

## 12. Cómo se protege

- **Las dos matrices** (cargos y derechos) con la ruta nueva.
- **Una prueba por herramienta:** el cargo de abajo no entra, y la empresa
  sale de la sesión aunque la IA pida otra.
- **Fase 2, pruebas de lo prohibido.** Ninguna herramienta toca algo del
  🔴, y los candados vuelven a cerrar al aplicar:
  - realizado;
  - días servidos;
  - compras hechas;
  - cotización cambiada entre medio.

## 13. La conversación de cada persona y BelIA para recepción (04-11-2026)

Felipe, 04-11: *"¿No será también bueno que vaya guardando como cierto
contexto cuando se cierra la ventana? Por cada usuario ... cada usuario
debería estar como medio limitado a sus roles"*, y *"pasarle Belia a la
recepcionista para que pueda hacer preguntas sobre disponibilidad,
seguimientos que sigue ocultando el tema de los montos totales"*. Aprobó
la propuesta con *"Sí, me parece bien"* y, de la bitácora: *"muéstrale lo
que dice la bitácora ... más que mostrarles, como darle contexto"*.

### La conversación de cada persona (migración 182)

- **Se guarda en Eventia**, en `asistente_conversaciones`: una por persona
  y empresa. Sigue al cerrar la ventana, al otro día y desde otro equipo.
  Antes vivía en la pestaña (`sessionStorage`) y se perdía al cerrarla.
- **Es solo de esa persona.** El motor la busca con la sesión
  (`GET`, `PUT` y `DELETE /asistente/conversacion`); no hay cómo pedir la
  de otro, ni siquiera siendo administrador.
- **Limitada a su cargo.** La guardada lleva el cargo con que se conversó
  y la ventanilla manda el que cree tener. Si cualquiera de los dos no
  calza con el de la sesión (le cambiaron el cargo), se borra y BelIA
  parte de cero: no arrastra lo que vio con el cargo anterior. Y siempre
  responde con el cargo de ahora, como antes.
- **Lo que guarda:** los 30 turnos más nuevos, como los muestra la
  ventanilla, con sus tarjetas, hasta 80.000 caracteres (el motor recibe
  hasta 100 KB). A la IA siguen viajando los últimos 20. Una tarjeta que
  se estaba aplicando se guarda pendiente.
- **Las tarjetas guardadas son solo para pintarlas:** el «Sí, aplicar» se
  revisa contra la propuesta de la 181, que vence a las 2 horas.
- **Se borra sola a los 90 días sin uso:** el motor limpia las viejas de
  la empresa cada vez que guarda una. «Nueva conversación», abajo en la
  ventanilla y después de preguntar, también la borra en Eventia. La «×»
  solo cierra: la conversación queda (Felipe, 04-11: *"acabo de
  actualizar y no se guardó la conversación"*; la «×» la borraba).
- Hasta que llega la guardada, la ventanilla no guarda nada: una pestaña
  nueva y vacía no pisa la conversación que quedó.

### BelIA para recepción

- **Entra a la ventanilla.** Las rutas de BelIA pasan a
  `RECEPTION_AND_UP`; lo que ve cada cargo lo siguen decidiendo sus
  herramientas.
- **Sus herramientas:** `calendario`, `buscar_cotizaciones`,
  `ver_cotizacion`, `buscar_clientes`, `avisos_de_hoy` y
  `proponer_cotizacion_nueva`, esta última solo como requerimiento (sin
  servicios). Las demás no se le ofrecen.
- **Nunca le llega un monto.** Las herramientas le sacan el total, el
  valor por persona, la plata, los servicios (cada uno trae su precio),
  las observaciones, el comentario interno y el enlace a la ficha del
  negocio. Y todo lo que le llega pasa además por `sinMontos`
  (`herramientas/recepcion.ts`), que tapa la plata escrita a mano en una
  nota. La barrera vive en el código, no en las instrucciones (§3, regla
  2).
- **La bitácora le llega como contexto.** Cuando pregunta en qué va un
  pedido, BelIA le cuenta en una o dos líneas lo último que se hizo, por
  qué canal y lo que quedó pendiente, sin pegar las notas (las
  instrucciones del momento para recepción).
- **No ordena por plata:** «las más grandes primero» también dice cuánto
  valen.
- **Sus enlaces llevan a Requerimientos**, su pantalla, nunca a la ficha.
- **Su ánimo:** solo la avisan los requerimientos que llegan hoy. Los
  seguimientos vencidos son de quien vende y no la enojan.
- **Sus atajos:** «Fechas libres», «Requerimientos», «Crear
  requerimiento» y «Ayuda».
- **Lo que crea:** solo requerimientos. Si la IA propone servicios, la
  herramienta lo rechaza, y el motor rechaza que recepción aplique otra
  propuesta.

### El tope

Sigue en US$ 100 al mes por empresa, para todos los cargos juntos (§7).
Felipe: *"No importa el tema del tope ... esto se paga solo"*.

## 14. Las mejoras del 04-11 en la tarde (Felipe: *"vamos con la 1 a la 6"*)

> **Estado:** en producción desde la tarde del 04-11 (Felipe: *"a
> producción"*), después de probarlas en el laboratorio. Sin migración:
> las fichas al día viven en la memoria del motor.

Salieron de medir el primer día en producción: 22 preguntas, todas de
Felipe; US$ 1,55 de los 100 del mes; 15 s por respuesta en promedio y 29 s
la más lenta; ninguna falla; 4 propuestas aplicadas.

1. **La «×» cierra y guarda.** Borraba la conversación, y Felipe la perdió
   al cerrar: el registro del motor tiene el `DELETE` de las 14:54.
   «Nueva conversación» quedó abajo, con su pregunta (`ConfirmInline`).
2. **Las fichas al día** (`conversacion/lo-leido.ts`). A la IA solo le
   viajan los textos de la conversación, y por eso volvía a pedir cada
   ficha: en la conversación de la 739, 16 lecturas en 10 preguntas.
   - Ahora el motor anota las cotizaciones que BelIA revisó (las 3
     últimas, por 20 minutos).
   - Antes de cada pregunta se las trae recién leídas de la base, con el
     cargo de quien escribe (recepción, sin montos).
   - Vive en la memoria del motor: un reinicio la borra y BelIA vuelve a
     leer, como antes. «Nueva conversación» también la borra.
3. **Los clientes, como el buscador de la casa** (`buscar-clientes.ts`).
   Sin tildes y por palabras en cualquier orden, en el nombre y el
   contacto: antes, «Matias» no encontraba a «Matías». Y varios clientes a
   la vez en `textos`: una pregunta había hecho 24 búsquedas, con 27 s y
   US$ 0,20.
4. **Las personas del evento** (`propuestas/cabecera.ts`; la regla 5 de
   arriba). En las no aceptadas, con la cuenta del cotizador:
   - la casilla que tenía el total de su audiencia lo sigue, y la ajustada
     a mano no;
   - los fijos que cobran por persona no se rehacen, porque el cotizador
     tampoco lo hace al cambiar las personas, y la tarjeta lo avisa;
   - en una aceptada, Post-Venta → Servicios.
6. **El descuento** (§11, pregunta 1). El que la persona pida, nunca uno
   que ofrezca BelIA, por % o por monto, con el tope de su cargo:
   administración 40 %, ventas y operaciones 15 %. Es el mismo
   `getMaxDiscountForRole` del cotizador y de Post-Venta; por monto, ese %
   del subtotal. En una aceptada se ven las cuotas, como en cualquier
   cambio.

«Deshacer» devuelve también las personas y el descuento: la propuesta
guarda la cabecera de antes. La 5 es el §15. La 7 (que la use el equipo)
no es código.

## 15. Una sola IA (plan del 04-11; etapas 1 y 2 en producción)

Felipe, 04-11: *"si alguien aprieta como oportunidades, aprieta borradores,
aprieta crear con la IA, debería ser BelIA quien firma, y así trabajamos
siempre como el motor de razonamiento de BelIA y no estamos arreglando cada
botón por separado, sino que tenemos una sola IA que conoce todo el sistema
de operación del complejo"*.

**Lo que entendí:**
- Todo botón con IA firma «BelIA», con «a pedido de» quien lo apretó. Lo
  escrito a mano sigue con la cara de la persona, y los botones sin IA
  («Enviar cotización», «Sí, puede seguir») también.
- Por dentro, una sola IA: lo que sabe del complejo (las reglas de la
  casa, el catálogo, cómo se cotiza) vive en un solo lugar y lo usan todos
  los botones, en vez de que cada uno tenga su copia.

**Lo que hay hoy (medido el 04-11):**

| Quién firma «Asistente» | Dónde | Notas en producción |
|---|---|---|
| «✨ Crear con IA» | `quotations/generar/generar.service.ts` | 103 |
| Los borradores de correo: «✉ Generar seguimiento» y la habilidad `correos-cotizaciones-vds` | `quotations/seguimiento/seguimiento.service.ts` (2 lugares) y la habilidad, por SQL | 63 |
| Oportunidades | `oportunidades/postulacion/cotizacion-de-la-postulacion.service.ts` y `aceptar-la-ganada.service.ts` | 6 |
| Otras | — | 16 |

**Por etapas, cada una al laboratorio primero:**
1. **La firma.** Los lugares del motor y la habilidad de correos firman
   «BelIA», con «A pedido de …» cuando alguien apretó el botón. Las notas
   viejas pasan a «BelIA» con respaldo: cambia la firma, no el texto.
2. **El cerebro común.** Las reglas de la casa que hoy repiten «Crear con
   IA», «Generar seguimiento» y BelIA se juntan en un solo módulo que usan
   los tres. Primero se mide qué dice cada uno, para no perder lo aprendido
   (las lecciones de correo de la 541, por ejemplo). Se prueba en el
   laboratorio con casos reales: la misma cotización y el mismo
   seguimiento, antes y después.
3. **Oportunidades, con su sesión.** Sus análisis siguen especializados
   (Haiku para leer, Opus para analizar), pero firman BelIA y usan lo común
   donde corresponda.

**Lo que decide Felipe antes de programar:**
- Lo que corre solo, sin que nadie apriete un botón (las rutinas de la
  mañana y la tarde): ¿firma «BelIA» sin «a pedido de»?
- Las otras empresas: BelIA es de Valle del Sol. ¿Su «Crear con IA» sigue
  como «Asistente»?
- Las 188 notas viejas: ¿se pasan a «BelIA»?

**Lo que decidió Felipe (04-11, en la tarde):** *"No, los correos dejémoslo
así como estaban aparte. Belia es para todos los usuarios de Eventia, solo
que en las otras empresas que se vayan creando, dale $10 de cupo inicial,
nada más. Sí, pasa las 188 notas del asistente antiguo, pásalas como Belia y
ponle su carita"*.
- **Lo corrigió el mismo día:** *"Los que son seguimientos y borradores, yo
  los dejaría también como Belia. Lo que pasa es que me refería yo a estos
  seguimientos que hacemos en las mañanas y en las tardes en mi correo, en
  los correos de la empresa, que eso es aparte, no es de Eventia, pero si yo
  presiono generar seguimiento, eso lo hizo Belia ... Estamos confundiendo
  una automatización interna de la compañía con este asistente"*.
  - **Lo de Eventia firma «BelIA»**, también «✉ Generar seguimiento»: el
    borrador, a pedido de quien apretó (`crearComoBeliaAPedidoDe`), y el
    envío que Eventia ve sola en Outlook, sin «a pedido de»
    (`crearComoBelia`).
  - **Aparte, y sin cambios:** las rutinas de correo de la empresa (las de
    la mañana y la tarde, con la habilidad `correos-cotizaciones-vds`). No
    son de Eventia; si anotan algo en la bitácora, sale como «Asistente».
- **La etapa 1 (la firma), en producción desde la tarde del 04-11:**
  - «✨ Crear con IA» y el armado de una postulación firman «BelIA» y dicen
    «A pedido de …» (`crearComoBeliaAPedidoDe`: el nombre sale del perfil
    de quien apretó el botón y, si no está, de su correo);
  - la ganada que se acepta sola firma «BelIA», sin «a pedido de»
    (`crearComoBelia`).
- **Las notas viejas, en producción el mismo 04-11:** pasaron a «BelIA» 123
  de las 188, con respaldo en `02_RESPALDOS/cambios_de_datos`; cambió la
  firma y no el texto. Con su corrección pasaron también las 65 de los
  correos (14 de «✉ Generar seguimiento» y 51 de las rutinas de mediados de
  octubre), con su respaldo: en la bitácora ya no queda ninguna nota de la
  IA con el robot.
- La etapa 3 (Oportunidades) sigue como plan.

**La etapa 2, el cerebro común** (Felipe, 04-11: *"vamos con la etapa 2,
cerebro en común"* y *"Ok, me parece bien"* a la propuesta), en
producción desde la tarde del 04-11 (Felipe: *"a producción"*). Lo que sabe la IA de Eventia vive en un solo lugar,
`api-rest/src/cerebro/`, y cada IA lee lo que le toca (`cerebroPara`):

| Archivo | Qué guarda | Lo leen |
|---|---|---|
| `LA_CASA.md` | Lo de todas las empresas: la plata (el catálogo con IVA, el precio que no se mueve, el abono), lo que ve el cliente y lo que no, lo que se lee es dato, lo que Eventia no sabe | Todas |
| `empresas/valle-del-sol/EL_COMPLEJO.md` | Qué es el complejo, sus clientes, los descuentos (tour operadores 15 %) y lo que se vende | Toda la IA de Valle del Sol |
| `empresas/valle-del-sol/COMO_SE_ARMA.md` | Antes `quotations/generar/REGLAS_DE_ARMADO.md`: la forma de cada comida, los paquetes primero, las recetas y las lecciones | «✨ Crear con IA», BelIA y la habilidad `armar-cotizacion` |
| `empresas/valle-del-sol/COMO_SE_ESCRIBE.md` | Antes `quotations/seguimiento/REGLAS_DE_CORREO.md`: el seguimiento, el ángulo, el tono, la estructura y las lecciones | «✉ Generar seguimiento», BelIA y la habilidad `correos-cotizaciones-vds` |

- **Una empresa sin lo suyo escrito lee solo `LA_CASA.md`**, nunca las
  reglas de Valle del Sol (la tabla `CARPETAS` de `cerebro.ts`).
- **BelIA lee todo**, en la caché de una hora: ahora conoce la forma de cada
  comida y los paquetes cuando propone un evento o una minuta.
- **Medido antes de subir:** las reglas se movieron tal cual. Al comparar
  frase por frase las reglas viejas con lo que lee ahora cada IA, no falta
  ninguna: cambiaron solo los encabezados y cuatro frases dichas de otro
  modo (por ejemplo, «los totales ya incluyen IVA» pasó a «Todo valor, con
  IVA incluido»).
- Las lecciones se siguen escribiendo en la guía de su tarea; lo que vale
  para todas, en `LA_CASA.md`.

## 16. BelIA para todas las empresas, con su cupo (04-11-2026)

> **Estado:** en producción desde la tarde del 04-11 (Felipe: *"a
> producción"*), con la migración 183 en las dos bases antes del motor.

Felipe: *"Belia es para todos los usuarios de Eventia, solo que en las otras
empresas que se vayan creando, dale $10 de cupo inicial, nada más"*.

- **El derecho `asistente` va en todos los planes**, desde Cotiza
  (`DE_COTIZA` en `api-rest/src/auth/derechos.ts`, y la copia de la app en
  `constants/permissions.ts`), también en la prueba de 7 días. A Valle del
  Sol, que lo tenía como módulo propio, no se le cuenta dos veces.
- **El cupo es de cada empresa** (`companies.tope_asistente_usd`, migración
  183): US$ 10 al mes por defecto y 100 para Valle del Sol (la empresa 1).
  Se cambia en la base, a mano, por empresa. Al llegar al cupo, BelIA
  contesta «Vuelve el día 1, o pídele a Eventia más cupo» sin llamar a la
  IA.
- Las herramientas siguen el plan de cada empresa: sin Post-Venta no hay
  pagos ni cobranza, sin Logística no hay compras, sin Personal no hay
  personal.

## 17. Las mejoras del 04-11 en la noche (Felipe: *"vamos con todas"*)

> **Estado:** plan del 04-11 en la noche. Felipe vio la lista con el uso
> real de BelIA en producción (24 preguntas, todas suyas; US$ 1,69; 15 s de
> promedio; 0 fallos; 4 propuestas y las 4 aplicadas) y respondió *"vamos
> con todas las mejoras que propusiste, me gustaron todas"*. Van al
> laboratorio por tandas; a producción, solo con su «a producción».
> La tanda A (1 y 2), en el laboratorio desde el 04-11 en la noche.

**Lo que entendí, mejora por mejora** (lo marcado «por defecto» lo puede
cambiar Felipe):

1. **Hablarle con el micrófono.** Un botón con el micrófono al lado de
   «Enviar». Usa el dictado del navegador (Chrome y Safari; en Firefox el
   botón no aparece), gratis y sin llaves. El audio lo procesa Google o
   Apple; Eventia no lo guarda. Lo dictado cae en el campo de texto y sale
   con «Enviar», para leerlo antes (por defecto). BelIA sigue respondiendo
   por escrito y sin sonido (*"es sin sonido esto"*).
2. **Que sepa qué cliente tienes abierto.** Hoy sabe la cotización abierta,
   pero en la ficha de un cliente (`/clients/:id`) solo le llegaba la ruta:
   tenía que buscarlo (una pregunta ahí tardó 22 s y 6 búsquedas). Desde
   ahora la ficha viaja como `cliente_id`; el motor revisa que el cliente sea
   de la empresa y le da a BelIA su nombre y sus cotizaciones más nuevas,
   como hace con las fichas al día. Recepción no abre fichas de clientes.
3. **Cambiar la fecha de una cotización no aceptada.** Con
   `proponer_cambio_de_servicios`, como las personas del evento (§14):
   solo en las no aceptadas (solicitada, enviada, en negociación), nunca a
   una fecha pasada. Se mueve el evento entero: el último día corre lo
   mismo, y los servicios siguen solos porque van por día del evento.
   Avisos en ámbar antes del «Sí, aplicar»: si choca con un evento aceptado
   (`checkConflictsWithExistingQuotations`, el mismo de «Crear evento») y,
   si la cotización trae ítems de temporada, que se revisen contra la fecha
   nueva (por defecto, BelIA no cambia esos ítems sola).
4. **«Prepárame el seguimiento de la 600».** Herramienta nueva
   `proponer_seguimiento`: una tarjeta con la cotización, el cliente y el
   buzón, y «Sí, dejar el borrador». Al aprobarla corre lo mismo que
   «✉ Generar seguimiento» (`SeguimientoConIAService.generar`): las mismas
   reglas de cuándo entra, el borrador en el hilo con el aviso ámbar, nunca
   envía, y la nota «BelIA · A pedido de …». Solo quien vende para arriba,
   y solo en la empresa con el derecho `seguimiento_con_ia`.
5. **Que aprenda de las correcciones.** Cuando la persona dice «No» a una
   tarjeta, BelIA pregunta por qué; y cuando la corrige en la conversación
   («los paseos de curso no llevan cena»), ofrece anotarlo. La lección es
   una tarjeta (`proponer_leccion`) con el texto exacto y para qué tarea
   vale (todas, armar, escribir o conversar). La aprueba administración
   (Felipe o Camila); la de otro cargo queda esperando y administración la
   ve en «¿Qué tengo que revisar hoy?». Aprobada, la leen desde la pregunta
   siguiente todas las IA de la empresa: va al final del cerebro común,
   bajo «Lo que aprendió BelIA». «¿Qué aprendiste?» las muestra y «Olvidar»
   saca una (queda anotada, no se borra). Tabla nueva `cerebro_lecciones`,
   **migración 185** (reservada el 04-11 con Facturación, que tiene la 184).
   De vez en cuando, con el OK de Felipe, las lecciones pasan a los
   archivos del cerebro, para que queden en el repo.
6. **Oportunidades con el mismo cerebro (etapa 3 del §15).** Una tarea
   nueva del cerebro, `postular`: lo común y lo del complejo, sin las guías
   de armar ni de escribir. La sesión de Oportunidades la pone en sus
   instrucciones (análisis, validación, preguntas y anexos); la cotización
   de la postulación ya lee cómo se arma, porque usa «Crear con IA».

Además, nadie más del equipo ha usado BelIA: mostrársela a Camila y a
recepción es de Felipe, no de código.

**Por tandas:** A, la 2 y la 1 (sin migración); B, la 3 y la 4 (sin
migración); C, la 5 (con la 185); la 6, con la sesión de Oportunidades.
`propuestas.service.ts` tiene 767 líneas: lo nuevo va en archivos propios
(el portero corta en 800).
