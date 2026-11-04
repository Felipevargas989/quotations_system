# 20 · Evia, la IA de Eventia (la ventanilla de chat)

> **Estado: PLAN APROBADO el 03-11-2026. Fases 1 y 2 en el laboratorio desde el 03-11 (ver abajo). Nada en producción.**
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
>   2. las notas van a nombre del Asistente, con el robot, y el texto dice
>      «BelIA, a pedido de …» (pregunta 2);
>   3. una propuesta dura 2 horas y solo la aplica quien la pidió;
>   4. «Deshacer» solo en lo no vendido: en una aceptada la cascada del plan
>      no tiene vuelta exacta, así que se pide el cambio contrario y se ven
>      las cuotas antes;
>   5. BelIA no cambia las fechas ni las personas del evento, ni agrega
>      fijos cuyo precio depende de las personas: eso, en la pantalla;
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
| Quiénes | Vendedor y arriba: vendedores, operaciones y administración. Operaciones entra porque está entre los dos | *"lo usa administración y vendedores"* |
| Nombre | **BelIA**, por Bela (03-11, más tarde): reemplaza a «Evia», que reemplazó a «Camilia». Es una mascota, no el robot, y Felipe manda su imagen (§8b). El derecho sigue siendo `asistente` | *"no me gusta el robot, se llamará Belia, por Bela"* |
| Modelo | Opus 5.5 (`claude-opus-5-5`). Se cambia en Railway con `MODELO_ASISTENTE`, sin tocar código | *"ojalá Opus"* |
| Tope | US$ 100 al mes, solo para Evia (§7) | *"mmm 100 USD mensuales?"* |
| Cotizaciones aceptadas | Como Post-Venta → Servicios, con las consecuencias a la vista (§5) | *"si me sirve"* |
| Empresa | Módulo propio de Valle del Sol: el derecho `asistente`, como `cotizar_con_ia`. La cuenta de Anthropic es de VdS (`api-rest/src/auth/derechos.ts`) | — |

## 3. Las cuatro reglas

**1. Evia actúa con el usuario que escribe, nunca con más.**
- Tiene el cargo, la empresa y el plan de esa persona.
- Cada herramienta se abre al mismo cargo de la **pantalla** que muestra
  ese dato (`SECTION_ROLES` en `frontend/src/constants/permissions.ts`).
  No se abre a lo que el motor deja leer por dentro, que es más suelto:
  recepción lee cotizaciones aunque no las vea (mapa 23).
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
- El tope vive en Railway: `TOPE_ASISTENTE_USD=100`.

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
4. **Prueba de Felipe** en el lab y, con su «a producción», a producción.

**Fase 2 · Cambios con OK.** Primero las cotizaciones no vendidas, las
minutas y las notas de la bitácora. Después las aceptadas, con lo del §5.
Escrita completa el 03-11 en la noche, las dos partes a la vez, con lo que
hay que comprar (ver el estado arriba).

**Fase 3.** Lo que vaya pidiendo el uso.

## 11. Preguntas abiertas (no frenan la fase 1)

1. **Descuentos.** ¿Evia puede aplicar uno si la persona lo pide, con el
   tope de su cargo (administrador 40 %, vendedor y operaciones 15 %)?
   Hasta que Felipe decida, no. (03-11: la fase 2 salió así.)
2. **Las firmas de la bitácora.** ¿Las notas de «Crear con IA» y del
   seguimiento pasan a firmar «Evia»? Hoy firman «Asistente», con el
   robot. (03-11: las de BelIA también firman «Asistente», y el texto
   dice «BelIA, a pedido de …».)
3. **Las conversaciones.** ¿Se guardan para revisar quién preguntó qué?
   La propuesta es que sí, por 90 días, y que solo las vea
   administración.

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
