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

**La planta se carga sola (15-08)**: cada persona de planta guarda en su
ficha sus **días libres** de la semana (`people.days_off`, 0=domingo…
6=sábado). El botón **"Cargar planta"** de la sábana llena el rango
visible completo con toda la planta activa, saltándose los libres de
cada uno y los días donde ya está; esas jornadas nacen **confirmadas**
(es su horario normal, no una oferta). A alguien de libre igual se le
puede poner a mano en un día — a veces se le paga ese día aparte — pero
el buscador de la casilla lo avisa con "⚠ LIBRE este día".

### Los tres números del personal

Son distintos y **se les permite no calzar** — esa diferencia es justo lo
que se quiere medir: *"si vendiste 10 garzones y terminaste poniendo 12,
la venta no cambia, el costo sí"*.

| | Qué es | Dónde se carga | Cuándo |
|---|---|---|---|
| **Estimado** | "voy a necesitar 9 garzones a $25.000" | **Recursos** | Al costear |
| **Plan por día** | "3 el jueves, 2 el viernes…" | **La grilla** | Días antes |
| **Real** | "fueron estos nombres, estas horas" | **La grilla** | Al confirmar y cerrar |

Un solo lugar para cada cosa: en Recursos se escribe la cantidad y el
precio, y nada de días ni nombres; en la grilla se reparte y se nombra, y
no se vuelven a escribir precios; en Gestión no se escribe nada.

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

---

## 3. EL CICLO DE UNA FICHA

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
- **El pozo puede llegar en dos entregas**, separadas por semanas.
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
