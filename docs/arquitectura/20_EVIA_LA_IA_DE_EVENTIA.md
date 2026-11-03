# 20 · Evia, la IA de Eventia (la ventanilla de chat)

> **Estado: PLAN APROBADO el 03-11-2026. Nada programado.**
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
| Nombre | **Evia**: Ev(ent)IA. Se descartó «Camilia» porque en la bitácora quedaría a una letra de Camila | *"Evia"* |
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

**Fase 2 (§10):**
- La tabla `asistente_propuestas` guarda la propuesta con su antes.
- `POST /asistente/propuestas/:id/aplicar` vuelve a validar y aplica con
  `QuotationsService.update`, la misma puerta del cotizador, con
  `assertMoneyMatches` y la cascada del plan.

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

**Fase 3.** Lo que vaya pidiendo el uso.

## 11. Preguntas abiertas (no frenan la fase 1)

1. **Descuentos.** ¿Evia puede aplicar uno si la persona lo pide, con el
   tope de su cargo (administrador 40 %, vendedor y operaciones 15 %)?
   Hasta que Felipe decida, no.
2. **Las firmas de la bitácora.** ¿Las notas de «Crear con IA» y del
   seguimiento pasan a firmar «Evia»? Hoy firman «Asistente», con el
   robot.
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
