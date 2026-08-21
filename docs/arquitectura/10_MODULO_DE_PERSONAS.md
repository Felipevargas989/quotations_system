# MÓDULO DE GESTIÓN DE PERSONAS

> **En el menú se llama "Personal"** (renombrado por Felipe el 15-08).
> La dirección interna sigue siendo `/personas`.
>
> **El mapa de módulos quedó así el 15-08**: *Proveedores* (ex Logística:
> compras, insumos, proveedores, servicios externos — todo lo que se le
> COMPRA a alguien) · *Inventario* (el mobiliario: lo que ya es nuestro) ·
> *Personal* (la gente). Los cargos se administran SOLO en Personal →
> Cargos; los servicios externos SOLO en Proveedores.

**Acordado el 14 de agosto de 2026, en conversación con Felipe.**

> ⚠ **ANTES DE CONSTRUIR CUALQUIER PARTE DE ESTE MÓDULO, LEER ESTE
> DOCUMENTO COMPLETO.** Incluye el capítulo 10, que es lo que enseñó el
> Excel tras horas de análisis. Pedido expreso de Felipe el 14-08: una
> conversación se pierde, esto no. Si algo acá contradice lo que uno cree
> recordar, **manda el documento**.

---

## 1. PARA QUÉ ES

Hoy los pagos a la gente viven en un Excel de nueve hojas llamado
**"04 Nomina de Pagos"**. Se analizaron las nueve. Esto es lo que se
encontró, y es lo que el módulo tiene que resolver:

| Lo que pasa hoy | El número |
|---|---|
| No hay **ningún** RUT ni **ninguna** cuenta bancaria de ninguna persona | 0 en las 9 hojas |
| La columna "Cuenta Corriente" existe, pero está vacía | 123 filas de 123 |
| El RUT y la cuenta se teclean a mano en el portal del banco | cada semana |
| Todas las filas dicen "Pagado" — nunca aparece "pendiente" | 100% |
| Personas escritas dos veces por un espacio o una tilde | 11 pares, $9.520.018 |
| Nada amarra una jornada a un evento: solo la fecha | 0 columnas |
| Propina anotada que nunca se asignó a nadie | $4,46 millones |

En una línea: **el Excel calcula bien, pero no identifica a nadie, no sabe
lo que se debe, y no sabe a qué evento pertenece ningún gasto.**

El objetivo no es reemplazar el Excel. Es **medir la rentabilidad real de
cada evento** y dejar de perseguir datos.

---

## 2. LOS CONCEPTOS

### La persona

Una ficha que se llena **una vez** y se usa siempre.

- Nombre, RUT, teléfono
- Banco, tipo de cuenta, número de cuenta
- **Cargo por defecto** y **planta o freelance por defecto**
- Estrellas, y estado: activa · no disponible · bloqueada

**El cargo y el tipo son valores por defecto, no propiedades fijas.** Se
cambian en el día que corresponda. Esto no es un capricho: en los datos,
Soledad Molina pasó de freelance a planta a mitad de agosto, y Camila
Carvajal, siendo cajera de planta, cobró jornada dos días de agosto porque
trabajó en su día libre. Si el tipo fuera fijo, el sistema le dejaría de
pagar jornadas que sí trabajó.

### El día

La unidad de todo. **No es el evento: es el día del evento.**

Joker No 1 duró 6 días, pasaron 10 personas, y **nadie trabajó los 6
días**. El día 4 hubo un relevo casi completo. Siete de los nueve eventos
Joker cruzan de una semana a otra.

Cada asignación de una persona a un día guarda: cargo, tipo, hora de
entrada, hora de salida, colación (30 min o 1 hora), horas trabajadas,
estado, jornada y propina.

### La ficha

El contenedor. Hay dos clases y funcionan igual salvo en dos cosas:

⚠ **Simplificado el 15-08**: el restaurante ya no es una ficha aparte —
es parte de **"Personal de planta"**, el evento permanente de la sábana (quotation NULL) — que también cubre patio, recepción y cualquier trabajo sin evento. Vive siempre ahí,
sin fecha de inicio ni término, y solo se le liquidan los pagos. La
etapa 7 quedó absorbida por la 3.

| | Ficha de **evento** | **Restaurante** (evento permanente) |
|---|---|---|
| De dónde salen los días | De la cotización | No tiene: está siempre |
| Período | Lo que dure el evento | **Indefinido** |
| Cuántos pozos de propina | **Uno para toda la ficha** | **Uno por día y por local** |
| ¿Suma al costo de un evento? | Sí | No |

**La planta se carga sola, sin botón (15-08)**: en la ficha de cada
persona de planta se marcan sus **días laborales** de la semana (en la
base se guardan los libres: `people.days_off`, 0=domingo…6=sábado — la
vista solo invierte). Al **abrir la sábana o mover el rango**, el
backend extiende la planta activa hacia adelante hasta el final
visible, saltándose los libres de cada uno; esas jornadas nacen
**confirmadas** (es su horario normal, no una oferta). La carga es solo
**hacia adelante** — desde hoy o desde el último día ya cargado de cada
persona — así que un día borrado a mano **no se recrea**. A alguien de
libre igual se le puede poner a mano en un día — a veces se le paga ese
día aparte — pero el buscador de la casilla lo avisa con "⚠ LIBRE este
día".

**Mover de día (15-08)**: "pasa mucho que cambiamos días para
adecuarnos al trabajo" — en la casilla abierta, cada asignado lleva un
botón de calendario que despliega los días del rango visible; se pincha
el nuevo y la asignación se muda con su horario y todo. Los libres de
la persona salen en ámbar, y si en el día de destino ya estaba, el
backend lo rechaza con aviso. Los relojes de todo el sistema van **de a
15 minutos**.

### Las sillas (17-08): el plan y la realidad viven en UNA tabla

⚠ **Rediseñado por Felipe el 17-08, en el QA previo a producción.** El
plan del personal vivía en `event_resources` (cargo, día, cantidad,
valor) y la realidad en `event_staff` (persona, día, monto), sin cable
de vuelta: poner un cuarto garzón o acordar $32.000 con alguien no
movía a Gestión. Sus palabras: *"¿seguro que son dos tablas, y no una
tabla que primero se rellena parcialmente solo con cargos, días, valor,
y luego en planificación se le pone apellido a esos cargos? Así la
tabla siempre se mantiene actualizada, siempre leen el mismo
repositorio de datos."*

Desde la migración 84, una fila de `event_staff` puede ser una **silla
vacía**: cargo, día y valor estimado, sin nombre (`person_id NULL`).

- **Gestión** cuenta sillas por cargo y día, y edita el plan: crear
  sillas, moverlas de día, valorizarlas. No ve nombres.
- **Planificación** las sienta: poner a alguien **consume** una silla
  vacía del cargo (primero la del día exacto, luego una "por ubicar");
  si no queda, nace una más — planificaste 3 y pusiste 4: son 4.
  Sacar a alguien desde la planificación **libera** la silla (el cupo
  queda); borrar de verdad es bajar el plan o "no se presentó".
- **El costo es UNO por construcción**: sillas con nombre al monto
  acordado, vacías al estimado. Sin propina, jamás.
- **El gris** (acotado el 18-08): con todas las sillas sentadas y
  confirmadas, el **valor c/u** pasa a ser el promedio real, en gris y
  de solo lectura — para no cruzar precios. Pero NO apaga la sección:
  Felipe necesitó agregar a alguien que no había considerado y estaba
  bloqueado. *"Se debería bloquear solo cuando se marca como realizado
  o bien se liquidan los pagos, esas son las reglas."* Esos son los dos
  candados de Gestión → Personal: evento **realizado** o ficha
  **liquidada**. Sigue siendo dinámico: una silla nueva vuelve el valor
  editable.
- **Reglas de fierro**: una silla vacía JAMÁS llega a liquidación ni a
  nómina; al cerrar la ficha, las que siguen vacías se retiran y el
  costo converge a lo real. En los eventos con ficha ya cerrada la
  migración no creó sillas: su historia no se toca.

`event_resources` queda solo con arriendos y servicios externos.

**La planta que la ficha trae a un evento (18-08) — NO es una silla.**
Felipe: *"puede pasar que la propina que deje un evento la repartamos
con el personal de planta, o que le demos una asignación de diez o
veinte mil a cada persona de planta… lo haría como en el restaurante:
aparecen todos y yo marco sin propina."* Al abrir la ficha de un evento,
la planta con turno de restaurante en sus días entra a la ficha como
filas de `event_staff` del evento con `kind = 'planta'`, horario del
día, monto en cero (la asignación extra) y con propina; su turno de
restaurante no se toca (dos pozos). No duplica a quien ya está por
Planificación; idempotente. Y la regla que las separa del plan es
limpia, medida en producción: **en un evento, lo planificado es SIEMPRE
freelance** (la silla vacía y la persona puesta desde la casilla nacen
`freelance` por `esJornadaExtra`), así que **`kind = planta` dentro de
un evento = viene de la ficha = solo liquidación**. La sábana, la
grilla de Gestión y la ficha de la persona la filtran con
`esPlanificacion`; el costo del evento la suma (la asignación extra sí
es costo real); la nómina la paga (paga toda fila con monto, no solo
freelance). El 18-08 se me cruzaron los cables justo acá — la sábana
mostró la planta del 423 como cupos — y por eso queda escrito.

### El personal es UN número que se afina (reescrito el 17-08)

⚠ Esta sección hablaba de "tres números" (estimado en Recursos, plan
en la grilla, real al cerrar) que se permitía que no calzaran. Con las
sillas quedó obsoleta: **hay un solo número, y se afina del plan a la
realidad** — Felipe, 17-08: *"si sube de planificación o baja de
planificación el costo es el mismo y siempre es el costo del evento; no
hay un costo real con nombres y un cotizado"*.

| Momento | Qué se hace | Dónde |
|---|---|---|
| Al vender | Se ponen las **sillas**: cargo, día, cantidad, valor | Gestión |
| Antes del evento | Se **sientan** nombres en las sillas; se ajusta el monto de quien pidió distinto | Planificación |
| Al cerrar | Las sillas vacías se retiran; el costo queda en lo real | Liquidación |

**Un cargo NO lleva precio.** El valor de referencia por cargo se sacó
el 17-08 (*"si eso lo asignaremos día a día, caso a caso"*): el monto
vive en cada silla. En Gestión, la primera silla de un cargo nace en
blanco, se le pone el valor una vez, y las siguientes lo copian. Al
sentar a alguien, hereda el monto de la silla salvo que se le ponga
otro. Las columnas de precio siguen en la tabla de recursos porque las
comparten los arriendos; Personal no las lee ni las escribe.

Si al armar la grilla falta un cargo que no se costeó, **se agrega desde la
grilla misma** — no tiene sentido mandar de vuelta a Recursos.

### La nómina

**No es una semana: es un selector de qué se liquida.**

La columna "semana" del Excel se desordenó justamente porque dejó de ser
una semana y pasó a ser una etiqueta de tanda — en la hoja de compras, 109
de 241 filas no calzan con la semana real.

Entonces no se guarda ninguna semana. Cada fila queda marcada con la
nómina que la pagó, y **pendiente = lo que todavía no entró en ninguna
nómina**. No hay que acordarse de nada.

#### Repartir y liquidar son dos pasos distintos (16-08)

Felipe: *"la idea es que todo lo que se liquide quede listo para pagar
en nómina, y luego toma todas las liquidaciones pendientes y crea una
nómina"*. De ahí salen tres reglas que antes estaban mezcladas:

1. **Repartir** deja la plata asignada a cada persona. **Liquidar** la
   manda a cobrar. Van separados porque entre medio uno recorre los
   días con ‹ › **validando** lo que acaba de repartir. Mientras eran
   el mismo acto, el día desaparecía de la lista al repartirlo y no
   había dónde volver a mirarlo.
2. **Un día sale de la lista cuando llega a la nómina, no cuando se
   reparte.** En el rato intermedio se muestra en verde: repartido,
   esperando nómina. Un día marcado "sin propina" sí se va al toque —
   no hay nada que mandar.
3. **La liquidación NO crea nóminas.** El día de restaurante y la ficha
   de evento solo dejan su plata *lista para pagar*; con eso aparecen
   solas en "Liquidaciones por pagar". Hubo un botón que sí creaba la
   nómina desde el día, y duró un día: se saltaba entera la revisión de
   datos bancarios (Felipe, 16-08: *"mandé unos días a liquidación y
   pasó directo a nómina de pago"*). Quien crea nóminas es un solo
   lugar — la pestaña Nómina — porque ahí es donde se revisa antes de
   subir al banco.

   La nómina igual acepta una lista de días sueltos, como modo
   excluyente —sin eventos, solo esos días—: es lo que permite elegir
   "estas liquidaciones" sin que un rango de fechas arrastre los
   eventos de esa misma semana.
4. **A la nómina solo entra lo liquidado.** Antes bastaba con tener
   monto y no estar pagado: medido en laboratorio el 16-08, eso metía
   $100.000 en 4 filas de eventos a medio liquidar. "Liquidado" es
   distinto según el origen — un evento, cuando su ficha está cerrada;
   un día de restaurante, cuando su propina ya se resolvió — y por eso
   la regla vive como función pura (`estaLiquidado`) con su spec, no
   como una condición escondida en la consulta.

#### Las dos etapas de la nómina

Ya construidas: **la carga**, donde se ve cada persona con su RUT,
banco, cuenta y monto; y **el pago**, donde se va marcando uno a uno a
quién ya se le pagó, con barra de avance. El pago se hace a mano en el
portal del banco, así que el sistema acompaña, no transfiere.

#### Todo evento pasado se liquida; el historial es lo que Felipe liquida (21-08)

Dos decisiones de Felipe que cierran la lista "Eventos por liquidar":

- **"Todo se debe liquidar."** Un evento pasado aparece por liquidar
  aunque no tenga personal cargado; nada se oculta. El flujo de un
  evento sin gente no se ha probado todavía en producción — *"esperemos
  que pase y veamos cómo se comporta"*.
- **El pliegue "ya liquidados" es su historial.** *"Quería tener el
  historial de lo que voy liquidando, pero esos 14 son anteriores a esta
  implementación."* Las 110 fichas cerradas por SQL al arrancar el
  módulo (17/18-08, sin gente ni plata) quedan marcadas
  `cierre_administrativo` (migración 86) y la lista no las muestra. NO
  se usa "sin gente" como regla: un evento que él liquide vacío mañana
  sí es historia suya y se ve. Ninguna ficha nueva nace con la marca.

#### La revisión antes de liquidar (18-08)

Felipe: *"cuando pincho liquidar evento, podría traerme preliminarmente
el mismo modal que me mostrará después en nómina, así puedo tener una
instancia de revisión con los totales para aprobar… si apruebo paso a la
evaluación de la gente."* Al pinchar **"Liquidar este evento…"** se
abre **"Revisa antes de liquidar"**: la MISMA tabla de Nómina —por
persona: RUT, banco, cuenta, jornadas, propinas, total, totales al pie
y avisos— con lo que **quedaría** por pagar de ese evento si se cierra
ahora (`previa-preliminar`: la misma consolidación por RUT, sin
preguntar si la ficha está cerrada). **Aprobar** pasa a la evaluación
del equipo y al cierre; **Volver** deja en la ficha para seguir
ajustando, sin reabrir nada. El cuerpo de la revisión es una pieza
compartida (`RevisionDeNomina`) para que Nómina y la ficha digan
exactamente lo mismo. Sin RUT no bloquea liquidar (solo avisa); el
bloqueo sigue siendo al generar la nómina.

#### Reabrir una liquidación (18-08)

Felipe, revisando la nómina del 423: *"la idea de ese botón es que
elimine la liquidación por pagar y la regrese a liquidaciones para
liquidarlo otra vez (volver a repartir propina o ajustar pago por
jornada)… es un ajuste, no todo de nuevo."* Una liquidación que está
**por pagar** se puede **reabrir**: un evento vuelve de ficha *cerrada*
a *trabajado*, un día de restaurante vuelve a pozo *sin repartir*. Nada
se borra —horarios, jornadas, propina repartida y pozo quedan escritos—
solo se destraba la ficha para corregir y liquidar de nuevo. **Regla
de fierro:** se reabre solo si nada de esa liquidación entró ya a una
nómina; lo pagado no se deshace, se ajusta en la nómina siguiente. La
acción vive en cada liquidación de la lista de por pagar y, cuando se
revisa una sola, en el modal de revisión. En ese modal no hay
"Actualizar datos" ni "Volver": los datos se releen solos al abrir y
la X cierra.

---

## 3. EL CICLO DE UNA FICHA

⚠ **Simplificado el 15-08.** Este ciclo de cuatro pasos se diseñó
cuando la pestaña acompañaba al evento **desde antes**. Con la
Liquidación entrando solo a eventos **ya ocurridos**, los pasos
"armando" y "confirmado" no significaban nada —un evento del mes
pasado no se está armando— y obligaban a pinchar botones sin sentido.
Felipe: *"el armado se hace en la planificación; acá solamente debería
estar la gente que vino, el monto que se le está pagando, la propina y
cómo se reparte. Es solo una pantalla que tiene todo."*

En pantalla quedan **dos estados: por liquidar y liquidado**. El armado
y la confirmación de nombres viven en Planificación, donde cada persona
tiene su "por confirmar". La columna `status` conserva los cuatro
valores por si alguna vez se quiere el detalle.

| | Qué pasa | Qué se puede tocar |
|---|---|---|
| **1. Armando** | Sé que necesito 3 garzones × 6 días. Salgo a conseguirlos | Todo |
| **2. Confirmado** | Ya tengo nombres y horarios | Todo |
| **3. Trabajado** | Pasó el evento. **Se ajustan las horas reales** | Solo horas |
| **4. Cerrada** | Se reparte la propina y queda lista para la nómina | Nada |

El paso 3 es el que hoy no existe, y es la razón de que el Excel no sirva
para saber a quién se le debe: la marca de pagado se pone después, cuando
ya salió la plata.

---

## 4. LAS REGLAS

### La liquidación (flujo cerrado el 15-08)

La pestaña se llama **Liquidación** y separa los dos caminos:

- **Eventos**: solo los que **ya pasaron** ("no pago un evento de
  diciembre en agosto"), el más viejo primero, los liquidados plegados.
  Adentro es UNA pantalla: se confirman horas y asistencia (quien no
  vino se saca), se ingresa la propina una vez, se eligen los cargos
  que tocan y su %, se reparte y se liquida. De ahí queda para nómina.
- **Días de restaurante**: un modal DIARIO — "se reparte diario según
  quiénes tocaron propina ese día". Muestra quiénes trabajaron, pide el
  pozo y los % por cargo (sin plantillas por defecto: se escriben según
  el día), reparte y pasa solo al día siguiente. **Un día sin propina
  también se liquida** (botón "sin propina"); si no, los días flojos
  quedarían pendientes para siempre.
- El reparto dentro del cargo es **por horas** — no se podía en el
  Excel; mejora ratificada por Felipe el 15-08.
- La propina puede no existir; **el pago del staff siempre**: la deuda
  que el sistema registra son los staff no pagados.
- Los datos bancarios aparecen al **pagar** (cargar al banco, con su
  check); en el resumen de la nómina van nombre, RUT, monto y si se
  pagó — sin datos bancarios.

### El reparto de la propina

- Se reparte **por horas**.
- **Los cargos son solo una lista de nombres.** Ninguno trae escrito si
  lleva propina o no.
- Al repartir aparecen **todos los cargos que estuvieron ese día**, con su
  porcentaje ya puesto según la plantilla. **Cero = no lleva.**
- Si se le sube el porcentaje a uno, los demás bajan parejo — que es lo que
  ya pasa cuando entra el desconche (55/35/10 sin desconche queda 60/40).
- Plantillas guardadas: *el de siempre* 60/40, *con desconche* 55/35/10,
  *solo garzones* 100.
- **Siempre se puede forzar a mano.** De 176 días registrados, 141 fueron
  60/40 y **35 no lo fueron**: hay 8 días de 50/50, 8 de 100/0, 6 de 0/100,
  uno de 40/30/30 y uno de 40/40/20.
- **No quedan sobrantes.** El redondeo reparte los pesos que faltan de a
  uno. En el Excel quedaban $8 sin repartir en Joker No 1, y en 8 de 9
  eventos había descuadre.
- **El pozo puede llegar en dos entregas**, separadas por semanas. ⚠
  Corregido el 15-08: en pantalla es **UNA sola caja** (pedido de
  Felipe). Cuando llega el resto se suma al mismo campo — para repartir
  lo que importa es el total. La segunda columna sigue en la base por
  si algún día se quiere el desglose.
- **El candado es interno**: si la plata repartida no suma el pozo, el
  botón no se puede apretar. Sin panel de advertencia ni semáforo. El Excel
  validaba que los porcentajes sumaran 100 —y daban 100 en las 176 filas—
  mientras el 24 de enero quedaban $15.715 en el aire.

### El pago

- **No se genera archivo para el banco.** Santander lo cobra. Se paga a
  mano, con una pantalla de una persona a la vez.
- **Siempre se transfiere a la persona, nunca a un tercero.**
- **La marca de pagado se pone en el momento**, no después. Por eso ahora
  existe "pendiente".
- **Jornada y propina se pagan por separado.** El Excel ya tiene dos
  columnas de estado justamente por esto: como los eventos cruzan de
  semana y la propina llega al final, los días se pagan antes de que la
  propina exista.
- **La nómina no bloquea** si hay propina sin repartir: simplemente la deja
  fuera, y muestra qué dejó fuera. Quien bloquea es el cierre de la ficha.
- Conviene acumular por persona y pagar de una vez: la comisión de
  Santander a otro banco es UF 0,03 + IVA (~$1.458), y en los datos hay
  propinas de $208.

### Las estrellas y los estados

Son tres cosas distintas y no se mezclan:

| | Qué dice | Reversible |
|---|---|---|
| **Estrellas** | Qué tal trabaja | Cambia con cada evaluación |
| **Bloqueada** | No llamar nunca más | Sí, con motivo escrito |
| **No disponible** | No está ahora | Sí, de un clic |

- Se evalúa **al cerrar la ficha**, una evaluación por persona por evento,
  con botón de saltar.
- Se muestra el **promedio simple**, más las **últimas evaluaciones a la
  vista**, para que se vea a quien va bajando. Sin fórmulas ponderadas
  escondidas.
- Las notas se pueden poner **sin bajar la estrella** ("solo fines de
  semana", "no maneja").
- **Bloquear no borra nada y no impide pagar.** Se paga lo trabajado.
- **Sin evaluar no es lo mismo que malo.** De las 186 personas, 98 salieron
  a $100.000 o menos en total: van a quedar sin estrellas mucho tiempo.

### Los datos bancarios

Orden de los campos: **nombre → RUT → banco → tipo de cuenta → número de
cuenta.** El RUT va antes porque si la persona tiene CuentaRUT de
BancoEstado, el número de cuenta **es** el RUT sin el último dígito y se
llena solo.

- **Banco**: lista cerrada, nunca texto libre. Los 18 bancos vigentes de la
  CMF, con los que usa la gente arriba. Ya no existen Banco Security
  (ahora BICE), BBVA / "Scotiabank Azul" (ahora Scotiabank), Chek (ahora
  Ripley), MACH (ahora Bci), Corpbanca (ahora Itaú). Sí entran Tenpo,
  **Mercado Pago** y Coopeuch.
- **Tipo de cuenta**: cuatro opciones — CuentaRUT, corriente, vista,
  ahorro. La CuentaRUT **es una cuenta vista**, se muestra aparte solo
  porque autocompleta. No son opciones "chequera electrónica", "Cuenta
  Pro", "cuenta joven": son nombres de marketing de la cuenta vista.
- **Número de cuenta**: solo dígitos, sin puntos, **guardado como texto**.
  Si se guarda como cifra se comen los ceros del principio y hay cuentas
  chilenas reales que parten en `0051...`. No hay largo fijo: aceptar de 5
  a 20 dígitos y avisar si se ve raro, nunca bloquear.
- **RUT**: se revisa el dígito verificador. La K va en mayúscula. **Hay que
  bloquear a mano el `55.555.555-5`**, que es el RUT reservado del SII para
  "extranjero sin RUT" y pasa la revisión matemática.
- **No se puede verificar que una cuenta exista.** Chile no usa IBAN. La
  primera nómina va a traer rebotes.

---

## 5. LAS PANTALLAS

### Las DOS grillas — desenredo final (15-08)

Hubo un enredo con dónde vivía "la grilla", y la respuesta es que **son
dos, para dos momentos distintos**:

| | **Gestión** (por evento) | **Personas → Semana** |
|---|---|---|
| Qué se hace | Planificación **preliminar, sin nombres** | Los **nombres** |
| Contenido | Días × cargos con cantidades y **valores** | La semana entera, con los huecos de **todos** los eventos |
| Ahí se puede | Agregar cargos, agregar/quitar días (preparativos, desarme), poner el valor de cada cargo | Buscar gente, ponerla, confirmarla, cambiar planta/freelance del día |
| Pregunta | *"¿qué equipo necesita este evento y cuánto cuesta?"* | *"¿a quién tengo que conseguir esta semana?"* |

La semanal corre de **domingo a sábado**, como la semana real del negocio
(capítulo 10). Es la mesa del lunes: Felipe no se sienta a llenar el Joker
No 1, se sienta a llenar la semana.

Se pincha una casilla y se abren las personas de ese día: quién va, su
tipo (planta/freelance del día), su monto, confirmada o por confirmar.

Los cupos sin día asignado se avisan en la semanal y **se reparten en la
grilla del evento**, no ahí.

**Los días se pueden agregar aunque la cotización diga otra cosa** — hacen
falta para los días de preparativo y de desarme, que hoy no están en
ninguna parte del costo (en el correo real aparece "Preparativos evento
Municipalidad, $25.000").

### La liquidación (flujo cerrado el 15-08)

La pestaña se llama **Liquidación** y separa los dos caminos:

- **Eventos**: solo los que **ya pasaron** ("no pago un evento de
  diciembre en agosto"), el más viejo primero, los liquidados plegados.
  Adentro es UNA pantalla: se confirman horas y asistencia (quien no
  vino se saca), se ingresa la propina una vez, se eligen los cargos
  que tocan y su %, se reparte y se liquida. De ahí queda para nómina.
- **Días de restaurante**: un modal DIARIO — "se reparte diario según
  quiénes tocaron propina ese día". Muestra quiénes trabajaron, pide el
  pozo y los % por cargo (sin plantillas por defecto: se escriben según
  el día), reparte y pasa solo al día siguiente. **Un día sin propina
  también se liquida** (botón "sin propina"); si no, los días flojos
  quedarían pendientes para siempre.
- El reparto dentro del cargo es **por horas** — no se podía en el
  Excel; mejora ratificada por Felipe el 15-08.
- La propina puede no existir; **el pago del staff siempre**: la deuda
  que el sistema registra son los staff no pagados.
- Los datos bancarios aparecen al **pagar** (cargar al banco, con su
  check); en el resumen de la nómina van nombre, RUT, monto y si se
  pagó — sin datos bancarios.

### El reparto

Muestra el pozo (con sus dos entregas), los cargos que estuvieron, el
porcentaje de cada uno y cuánto le toca. Cuadra o no avanza.

### La nómina

Se arma eligiendo qué liquidar: todo lo pendiente hasta una fecha, un
rango de días, o eventos sueltos. Muestra **qué deja fuera**.

Tiene dos partes, que son exactamente las dos tablas que la administradora
arma hoy a mano en un correo:

- **Resumen** — una línea por persona: días trabajados, propinas, total.
  Es lo que va al banco.
- **Detalle** — de qué se compone cada total, agrupado por cargo.

La glosa ("Propina restaurante", "Evento Municipalidad") **se escribe
sola**: el sistema sabe el evento y sabe si la línea es jornada o propina.
Hoy se teclea a mano y el mismo evento aparece escrito de tres formas
distintas.

### El pago

Una persona a la vez, grande, con botón de copiar en cada dato, y barra de
progreso. "Ya la pagué" pasa a la siguiente; "saltar por ahora" la deja
pendiente.

### El detalle para el trabajador

Qué días trabajó, qué propina le tocó y **por qué** ("Cocina 40%, entre 3",
"2 de 28 turnos"). **Sin ningún dato bancario** — es un papel que se le
muestra a alguien.

Si la persona es de planta, la sección de trabajo no aparece: se muestran
solo las propinas. Y si ese período hizo un turno extra pagado, aparece.

### La ficha de la persona

Los datos, las estrellas con sus últimas evaluaciones, y el estado.

---

## 6. LO QUE CAMBIA EN LO QUE YA EXISTE

### Recursos

- **Personal y arriendo llevan día.** Hoy dicen "10 garzones" y "1 toldo";
  tienen que decir qué días. Para el arriendo no es lo mismo un día que
  tres.
- **El tipo "compra" desaparece** (decidido el 14-08). Quedan dos:
  **personal** y **servicios externos** — ahí caben los toldos,
  las vans, el audiovisual, los masajes: todo lo que se contrata afuera.
  *"Las compras no tienen sentido"*. Medido en producción antes de
  decidirlo: 7 cosas en el catálogo y **cero usos** desde que existe.

### Gestión — reformulada entera (14-08)

**Una sola columna ancha**, no dos, dividida en bloques de trabajo uno
debajo del otro:

| | Bloque | Cuándo aparece |
|---|---|---|
| 1 | **Personal** | Siempre. La grilla preliminar completa: cargos × días, cantidades y valores, con enlace "Poner nombres →" a la semanal |
| 2 | **Servicios externos** — la MISMA grilla de días que personal | **Solo si hay alguno** — llega por un fijo vendido que lo trae, o a mano con el botón |
| 3 | **Insumos** — resumen de dos líneas | Siempre, chico |
| 4 | **Mobiliario** | Abajo |

**El bloque 2 no aparece vacío.** Los arriendos llegan de dos maneras: por
la venta de un servicio fijo que los tiene asignados, o a mano con un botón
que ofrece esas dos opciones. Recién ahí se dibuja su grilla — *"así no
llenamos innecesariamente la pantalla"*.

- El costo de personal **deja de ser una estimación y pasa a ser lo que
  realmente se pagó**. Aparece la diferencia contra lo cotizado.
- El costo de recursos se abre en **personal · arriendos**.
- **La propina no entra al margen** — el cliente la paga y va entera al
  equipo. Felipe prefiere que ni siquiera aparezca en Gestión: *"es plata
  que entra y sale, somos intermediarios"*.
- **Insumos deja de ocupar media pantalla**: pasa a ser una línea con un
  botón que abre un modal.

### La matemática de los arriendos (15-08)

El día es la unidad que multiplica (opción A: *"para el arriendo no es lo
mismo un día que tres"*), **pero en los servicios mixtos el fijo es POR
EVENTO**, no por día — solo la parte por persona multiplica:

| Tipo | Fórmula | Ejemplo (80 personas) |
|---|---|---|
| Solo fijo (toldo) | fijo × unidades-día | $100.000 × 3 días = $300.000 |
| Solo variable (masajes) | variable × personas × unidades-día | $8.000 × 80 × 2 = $1.280.000 |
| **Mixto** (catering) | **fijo UNA VEZ** + variable × personas × unidades-día | $50.000 + $1.000 × 80 × 2 = $210.000 |

Cuando un fijo vendido trae un arriendo: en un evento de **un día** cae a
ese día solo; en uno de varios cae "sin día" y Felipe lo ubica.

⚠ Los arriendos viejos sin día están contados UNA vez; al repartirlos en
varios días su costo sube — que es lo correcto, pero el margen de ese
evento se mueve.

### El modal de insumos

| Se cambia | Se mueve | No se mueve |
|---|---|---|
| **Cantidad a pedir** | El costo de este evento | **La receta, nunca** |

⚠ **Corregido el 14-08: los precios NO se tocan acá.** Se había acordado
que el modal actualizara el catálogo; Felipe lo repensó operativamente:
*"en compras debe estar la actualización de precios y cantidades, que es
donde trabajamos esta parte del evento"*. El modal de Gestión es **solo
informativo** (decisión final de Felipe, 15-08): cantidad según receta y
costo, **agrupado por proveedor con subtotales**. Las cantidades a pedir
y los precios se trabajan en Logística → Compras.

El resumen en Gestión son dos líneas:

    INSUMOS                                       $ 680.000
    34 insumos · 3 con cantidad por confirmar      [ revisar ]

El número accionable es cuántos están por confirmar; el total solo se mira.

El precio actualiza el catálogo a propósito: si no, los precios quedan
estáticos y actualizarlos se vuelve una tarea aparte que nadie hace. El
precio recién pagado es el mejor dato que existe. Con aviso cuando el
salto es grande, para que una compra de apuro en el almacén de la esquina
no contamine todas las cotizaciones futuras.

Esto ya lo hace el sistema para los **recursos** (`last_price`): se trata
de extender el mismo patrón a insumos, no de inventar uno nuevo.

**La división queda así:** Gestión decide qué comprar · Compras compra ·
Ficha de cocina saca de bodega.

---

## 7. LAS PIEZAS DE LA CASA

Este es el primer módulo que se construye después de que existe el kit. La
regla es que **no invente nada que ya exista, y que lo que sí invente nazca
compartido**.

### Se reusan tal cual

| Para qué | Pieza |
|---|---|
| Banco, tipo de cuenta, cargo, estado | `SelectWithSearch` |
| Agregar personas a un día | `AgregadorDeItems` |
| Los montos | `NumberInput` |
| Los avisos | `Toast` |
| Confirmar un bloqueo | `ConfirmInline` |
| El teléfono | `utils/phone` |
| Las fechas | `utils/dates` |
| Buscar personas | `utils/searchMatch` |
| Quién ve el módulo | `PermissionGuard` |

### Se crean, y nacen en el kit

| Pieza | Estado hoy |
|---|---|
| **Campo de RUT** | No existe ninguno |
| **Estrellas** | No existe |
| **Campo de hora** | Hay **uno hecho a mano** en la ficha de cocina de Post-Venta. Se hace la pieza y **se migra ese** |
| **Diccionario de estados de persona** | Igual que `utils/estadoCotizacion.ts` |

Y `SelectWithSearch` debería poder **esconder el buscador cuando hay pocas
opciones** — el tipo de cuenta tiene cuatro. Eso se arregla en la pieza,
no con una copia, y lo heredan las 17 pantallas que ya la usan.

### El portero

Cuatro líneas nuevas, **antes de que exista la primera copia**. Es la
primera vez que se puede poner el candado al derecho.

| Regla | Techo |
|---|---|
| Campo de RUT a mano | 0 |
| Estrellas a mano | 0 |
| `type="time"` a mano | **1**, y baja a 0 al migrar el de Post-Venta |
| Nombre o color de estado de persona a mano | 0 |

---

## 8. LAS ETAPAS

Cada etapa se prueba sola y no rompe lo anterior.

| | Qué | Qué se puede probar |
|---|---|---|
| **1** | La ficha de la persona: datos y bancarios. Campo de RUT y los dos desplegables | Cargar gente y dejar de pedirle los datos al garzón |
| **2** | Estados y estrellas | Bloquear, marcar no disponible, ordenar por estrellas |
| **3** | Recursos con día. La grilla preliminar en **Gestión** y la semanal con nombres en **Personas** | Asignar personas a días y ver la cobertura |
| **4** | Horas, colación, ciclo de la ficha | Ajustar horas reales y cerrar |
| **5** | El reparto de propinas | Repartir con plantillas y que cuadre al peso |
| **6** | La nómina, el pago y el detalle | Pagar una tanda completa |
| **7** | La ficha de restaurante | Repartir propinas del restaurante |
| **8** | Gestión: costo real, modal de insumos | Ver el margen con el costo verdadero |

**La etapa 1 necesita que Felipe aplique una migración a mano en Supabase.**
Las migraciones nunca las corre el sistema.

> **Estado al 15-08-2026**: la ESTRUCTURA de todas las etapas está
> construida y en el laboratorio (etapas 1–6 y 8; la 7 quedó absorbida
> por la 3). Pestañas de Personal: Planificación · Fichas · Nómina ·
> Directorio. Falta el pulido de detalles y navegabilidad, que Felipe
> hará por partes. Producción sigue esperando el paquete de
> migraciones 68→77 con su OK.

---

## 9. LO QUE QUEDÓ ABIERTO

- **La cajera.** Es la que más propina recibe en proporción (83 de 101
  días, una sola persona) y no es una de las tres bolsas del restaurante.
  Se resolvió dejando que todos los cargos pregunten cada vez, así que ya
  no bloquea — pero vale la pena entender por qué.
- **El ajuste de insumos antes de comprar**: si es algo que de verdad se
  hace o si estaríamos inventando trabajo para justificar una pantalla.
- **Si el detalle además se manda** (correo, WhatsApp) o solo se muestra.
- **Los $20.134** en que la fila de total del Excel no cuadra consigo
  misma, en tres filas: Andrea Vidal, Fernando Garrido y Nayareth Alvarez.

---

## 10. LO QUE ENSEÑÓ EL EXCEL

Se analizaron las **nueve hojas** de "04 Nomina de Pagos" (Google Sheets),
tabla por tabla, con dos rondas de verificación adversarial. Estas son las
conclusiones que **el sistema tiene que respetar**. Cada número está
medido, no estimado.

### 10.1 Los cuatro agujeros que el módulo existe para tapar

| Qué pasa hoy | Medido |
|---|---|
| **No hay ningún RUT ni ninguna cuenta bancaria** de ninguna persona | 0 en las 9 hojas. El RUT solo aparece en la hoja de proveedores |
| La columna "Cuenta Corriente" existe y **nunca se llenó** | 123 filas de 123 vacías |
| **Todo dice "Pagado", nunca "pendiente"** | 100% de las filas. Por eso el Excel dice a quién se le pagó, pero no a quién se le debe |
| **Nada amarra una jornada a un evento** | 0 columnas. Solo la fecha. Por eso la rentabilidad por evento hoy no se puede medir |

Y el que más cuesta: **11 pares de la misma persona escrita dos veces**
(por un espacio o una tilde), con **$9.520.018** repartidos en dos
montones. Ejemplo textual: `Valentina Salgado | $2.433.690` y
`Valentina Salgado ` (con espacio invisible) `| $194.533`.

**Total del archivo:** 197 líneas de pago = **186 personas reales**.
Jornadas $54.257.005 + propinas $9.791.833.

### 10.2 El reparto de propinas, verificado

| | **EVENTOS** | **RESTAURANTE** |
|---|---|---|
| El pozo | Uno por evento. Llega en "primera" y "segunda entrega", que **suman exacto el total en los 29 casos** | Uno **por día y por local** |
| La fórmula | **pozo ÷ cantidad de filas persona-día**, redondeado | **pozo × % del área ÷ personas de esa área ese día** |
| Verificado | Joker No 1: $121.500 ÷ 28 jornadas = $4.339 ✓ | En 120 de 125 grupos día-recinto-cargo |
| El reparto es | **Por turno**: el que fue 6 días se lleva 6 veces lo del que fue 1 | Por turno **y por grupo** |

**La regla se adapta a quién estuvo, y eso está probado:**

| Regla usada | Quiénes estuvieron realmente |
|---|---|
| 55/35/**10** | **7 de 7 días** tenían garzones, cocina **y desconche** |
| 60/40 | 48 de 50 tenían garzones **y** cocina |
| 100/0 | **2 de 2 días había solo garzones** |

De 176 días, **141 fueron 60/40 y 35 NO**: 8 de 50/50, 8 de 100/0, 6 de
0/100, uno de 40/30/30 y uno de 40/40/20. **Por eso el reparto tiene que
poder forzarse a mano**: si el sistema reparte solo y sin preguntar, esos
35 días no se pueden hacer.

El 10% del desconche sale **5 y 5** de garzones y cocina: por eso 55/35/10
sin desconche queda exactamente en 60/40. **El desconche empezó a cobrar
propina el 1 de enero de 2026**; antes la casilla está vacía en 37 filas.

### 10.3 Los casos borde que obligan a decidir algo

| # | Qué pasa | Ejemplo real |
|---|---|---|
| 1 | **El cargo es del día, no de la persona** | Camila Ganga fue Recepción el 2 de agosto y Garzón el 6. Pasa en 5 de cada 15 personas |
| 2 | **Planta o freelance cambia en el tiempo** | Soledad Molina cobró jornada hasta el 11 de agosto; desde el 17, solo propina |
| 3 | **Y tiene excepciones el mismo día** | Camila Carvajal, cajera de planta, cobró $20.000 de jornada el 6 y 7 de agosto |
| 4 | **El precio se negocia por día** | Javier Escobar, siempre garzón: $25.000 el 2, $60.000 el 6 y $50.000 el 8 de agosto |
| 5 | **No todos los que trabajan reciben propina** | 28 de septiembre: trabajaron 10, recibieron 4 |
| 6 | **Un cargo que "nunca" recibe, a veces recibe** | Ana Fuentes, mucama, recibió propina 4 veces ($25.702) |
| 7 | **Una persona, dos jornadas el mismo día** | Soledad Molina el 1 de mayo: $350 por Joker 5 y $2.356 por Joker 9 |
| 8 | **El redondeo casi nunca cuadra** | De 9 eventos, solo 1 calza exacto. Joker No 1 dejó $8 sin repartir |
| 9 | **$4,46 millones de propina sin dueño** | 117 días de restaurante y 20 eventos con pozo anotado y nadie asignado |
| 10 | **La validación miraba lo que no era** | 24 de enero: pozo $22.450, reparto 60/40, solo Matías Zapata con $6.735. **$15.715 en el aire** y la casilla decía 100% en verde — revisaba los porcentajes, no la plata |
| 11 | **Los eventos cruzan de semana** | 7 de 9 eventos Joker. Por eso jornada y propina se pagan por separado |
| 12 | **Hay días de preparativo** | "Preparativos evento Municipalidad, $25.000" — un día de trabajo antes del evento |

**El caso 10 es la lección de diseño más importante del archivo:** hay que
revisar que **la plata repartida sume el pozo**, no que los porcentajes
sumen 100.

### 10.4 La forma del negocio, en números

| | |
|---|---|
| Personas en el historial | **186** |
| Las 20 más grandes | **$35,3 millones — el 55% de toda la plata** |
| La mitad más chica (98 personas) | $4,3 millones entre todas |
| Lo que recibió la persona mediana **en todo el historial** | **$100.000** |

**Hay un núcleo chico que trabaja siempre y una cola larguísima de gente
que pasó una vez.** De ahí dos consecuencias de diseño:

- No hace falta cargar 186 personas para partir: con 20 o 30 se cubre más
  de la mitad del volumen.
- **"Sin evaluar" NO es lo mismo que "malo"**: casi la mitad de la lista
  va a quedar sin estrellas por mucho tiempo, y no puede aparecer en el
  fondo del ranking por eso.

Cargos, contados sobre el archivo:

| Cargo | Días | Personas | Días con propina | |
|---|---|---|---|---|
| Cocina | 165 | 9 | 95 | 58% |
| Garzón | 101 | 16 | 36 | 36% |
| **Cajera** | 101 | **1 sola** | **83** | **82%** |
| Mucama | 52 | 7 | 7 | 13% |
| Recepción | 5 | 2 | 0 | — |
| Patio | 3 | 2 | 0 | — |

### 10.5 Cómo se paga hoy, y dónde se sale del Excel

Alguien trabaja un día → se anota a mano en "trabajadores" (nombre
tecleado, fecha, cargo, recinto, monto) → si hubo propina se calcula en la
hoja que corresponda y **se copia a mano** a la columna Propina de
"trabajadores" → "Nomina Personal" agrupa por persona con una tabla
dinámica → **se mira esa lista y se teclea en el portal del banco**.

**El punto exacto donde se sale del Excel es el último**, y no hay ningún
dato que acompañe al nombre. Quien paga tiene que saber de memoria, o
buscando en la libreta del banco, a qué cuenta corresponde cada persona.

Y hay un segundo salto silencioso: **se paga mirando una hoja y se marca
pagado en otra**, fila por fila.

### 10.6 Dos cosas que el Excel ya hacía bien y hay que conservar

1. **Jornada y propina se pagan por separado** — la hoja tiene DOS
   columnas de estado. No es una rareza: como los eventos cruzan de semana
   y la propina llega al final, los días se pagan antes de que la propina
   exista.
2. **La aritmética cuadra al peso** en las 123 filas de Trabajadores y las
   304 del detalle individual. El problema del Excel nunca fue calcular.

### 10.7 Lo que se descartó, y por qué

| Descartado | Motivo |
|---|---|
| Compras a proveedores | *"no es necesario reflejar acá"* (Felipe) |
| Generar el archivo del banco | Santander lo cobra. Se paga a mano |
| Transferir a un tercero | *"prefiero que siempre se le transfiera a la persona"* |
| La propina en el margen de Gestión | *"es plata que entra y sale, somos intermediarios"* |
| Bitácora de llamadas | Solo un estado: confirmado · por confirmar · en búsqueda |
| Reconstruir el historial viejo | *"no es necesario reescribir todo, que funcione de ahora para adelante"* |

### 10.8 Reglas de datos que salieron de acá

- **Sin fecha de término, el evento dura un día.** (387 cotizaciones tienen
  inicio; solo 18 tienen término.)
- **La cantidad de un recurso es el TOTAL del evento, no por día.** Se
  reparte entre los días; el costo no cambia al repartir.
- **La semana corre de domingo a sábado** — pero dejó de significar una
  semana: en la hoja de compras, 109 de 241 filas no calzan, porque se usa
  como etiqueta de tanda de pago. Por eso la nómina **no es un período,
  es un selector de qué se liquida**.
- **El número de cuenta se guarda como texto**: hay cuentas chilenas
  reales que parten en `0051`.
- **El RUT `55.555.555-5` pasa el cálculo del módulo 11** y es el que el
  SII reserva para extranjeros sin RUT. Igual que los de un dígito
  repetido, del 11111111-1 al 99999999-9: **todos dan válidos**.
