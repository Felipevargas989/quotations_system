# 16 · Propuestas de cotización (hoy a mano, mañana un botón)

> **Estado: MÉTODO EN USO desde el 12-10-2026, BOTÓN SIN CONSTRUIR.**
> Primera corrida: el asistente procesó a mano los 11 requerimientos en
> solicitada de Valle del Sol (sección 7). Este documento es la receta que
> sigue cualquier sesión que lo repita y la especificación del botón.

## 1. Por qué

Felipe, 12-10-2026: *"Quiero que revises todos los requerimientos desde sus
comentarios, tipo de evento, fechas, todo, y que propongas una cotización y
que den solicitada (…) me gustaría que esto después fuese un botón que se
conectara con un agente y hiciera todas las propuestas de cotización
basándose en los paquetes que tenemos, en las cotizaciones que piden los
clientes y en las cosas que ya sabemos que resultan o tienen mayor tasa de
conversión."*

Un requerimiento llega con texto libre ("plateada con risotto", "valor por
persona y qué incluye") y nadie lo arma hasta que alguien se sienta con el
cotizador. La propuesta automática deja la cotización armada con lo que SÍ
tenemos, y dice claramente lo que no tenemos, para que la persona revise
y recién entonces la envíe.

## 2. Reglas de la casa (no se negocian)

1. **Nunca se envía.** La propuesta queda en `solicitada` y pasa de
   requerimiento a cotización (`request_type = 'cotizacion'`), igual que
   cuando alguien la arma en el cotizador. La envía una persona.
2. **Los comentarios van en las mismas observaciones**, debajo de una línea
   separadora (Felipe, 12-10: *"los comentarios déjalos en las mismas
   observaciones separados por una línea, yo mismo las borro post
   revisar"*). Separador en uso:
   `──────── PROPUESTA DEL ASISTENTE · revisar y borrar antes de enviar ────────`.
   **Ojo: las observaciones salen impresas en el PDF.** Nunca enviar sin
   borrarlas.
3. **Se ofrece lo que hay en el catálogo.** Lo que el cliente pide y no
   tenemos se escribe explícito y en mayúsculas: "NO TENEMOS risotto: va
   pastelera de choclo".
4. **Paquete primero.** Si no hay paquete, menús guardados por nivel; si no
   hay menú, sueltos; al final los fijos (salón, audiovisual, producción,
   exclusividad). Los precios salen del catálogo, nunca se inventan ni se
   rebajan.
5. **Todo con IVA incluido** (regla de Felipe: jamás un valor distinto).
6. **Descuentos:** tour operadores 15% en la cotización, nunca dentro del
   paquete; clubes de adulto mayor sin descuento (06-10). Cualquier otro
   descuento lo decide Felipe.
7. **`people_count` es el TOTAL** y `children_count` es una parte de él
   (convención del Cotizador 2.0). Las cajas de niños van con audiencia
   `ninos`; el cotizador no la deduce sola.
8. **Temporadas de alojamiento:** baja del 01-03 al 31-08, media del 01-09
   al 15-12 y alta del 16-12 al 28-02 (16 al 31 de diciembre, alta: regla de
   Felipe).
9. **Exclusividad según el día de la semana:** lunes a jueves $500.000,
   viernes a domingo $1.000.000, full $3.000.000 (catálogo de fijos).
10. **Fechas:** si el cliente no tiene fecha, se mantiene la que puso
    Recepción o el formulario, se anota como referencial y se revisa el día
    de la semana (un matrimonio quedó en lunes; un almuerzo, en 2028).
11. **Sernatur no se paquetiza ni se ofrece:** va por contrato.
12. **Solo se procesan requerimientos con ítems vacíos.** Una cotización
    que alguien ya empezó a armar no se pisa (la #585 tenía desayuno, dos
    coffee y salón, pero no el almuerzo: se avisa y no se toca).

## 3. Cómo se trabaja, paso a paso

0. **Antes de tocar código, el atlas y el grafo** (grillete del 19-09).
   Para la plata: `graphify affected "computeMoney"` muestra que la misma
   fórmula la usan `verifyMoney` (el motor rechaza un guardado que no
   cuadra), `QuotationForm`, `ServiciosTab`, `PostVentaPage` y
   `NegocioPage`. Una propuesta que no cuadra al peso se rompe al primer
   guardado en la app.
1. **Medir.** Requerimientos en `solicitada` con ítems vacíos. Ojo: `items`
   es un OBJETO `{fixed_services, variable_services}`, no un arreglo; un
   `jsonb_array_length(items)` falla o mide mal.
2. **Leer cada uno entero:** observaciones, tipo de evento, fecha y día de
   la semana, personas y niños, tipo de cliente, historial del cliente
   (cotizaciones anteriores, ganadas o rechazadas, fichas duplicadas) y el
   hilo de correo si escribió a contacto@.
3. **Elegir** con las reglas de la sección 2 y lo que convierte (sección 5).
4. **Armar la foto** en el formato exacto del cotizador (sección 4).
5. **Calcular** con la fórmula de `api-rest/src/quotations/utils/money.ts`:
   - variables = Σ por caja (Σ precio × cantidad) × personas de la caja;
   - fijos = Σ precio × cantidad;
   - valor por persona = suma de las cajas de adultos que cubren a TODOS los
     adultos;
   - descuento en %: `round(subtotal × %)`, con `discount_amount` en 0;
   - propina: `tip_percentage` en null.
6. **Respaldar y guardar con candados**, todas en un solo bloque: estado
   `solicitada`, `request_type = 'requerimiento'`, ítems vacíos, monto 0,
   personas iguales a lo medido, sin un separador previo, y total igual al
   calculado a mano. Si una falla, no se guarda ninguna.
7. **Comentar:** qué se armó y cuánto queda por persona, sustituciones, lo
   que NO tenemos, supuestos (fecha, niños, interpretación del pedido),
   alternativas de precio, historial del cliente y qué conviene preguntar.
8. **Verificar** recalculando desde lo guardado y comparando con las
   columnas. Revisar también que haya un solo separador.
9. **Reportar a Felipe** en una tabla: número, cliente, total, valor por
   persona y lo que tiene que decidir.

## 4. La foto de una cotización (copiada de cotizaciones hechas en la app)

Caja de servicios variables:

```json
{"day": 1, "people": 40, "audience": "adultos", "category": "Almuerzo", "category_id": 100,
 "items": [{"codigo": "2205", "nombre": "Bebida libre consumo", "precio": 1300,
            "quantity": 1, "categoria": "Almuerzo"}]}
```

- `codigo` es el **id** del servicio en texto, no el `code` del catálogo.
- `categoria` del ítem: el nombre de la categoría de la caja (la app usa el
  vínculo servicio-categoría; con menús viejos aparece la categoría antigua).
- `audience`: `adultos` o `ninos`. `people`: los adultos (total − niños) o
  los niños.

Servicio fijo:

```json
{"day": 0, "codigo": "199", "nombre": "Salón cúpula medio día", "precio": 300000,
 "quantity": 1, "categoria": "General", "max_precio": 0, "min_precio": 0,
 "tipo_calculo": "fijo", "precio_por_persona": 0}
```

- `day` 0 es "todo el evento"; en un evento de varios días, el día que
  corresponde (salón día 1 y día 2).
- `codigo` es el id del fijo.

Columnas que se escriben: `items`, `value_per_person`, `fixed_value`,
`subtotal_amount`, `discount_percentage`, `discount_amount` (0 en modo %),
`tip_percentage` (null), `tip_amount` (0), `total_amount`,
`request_type`, `observations`, `updated_at`, y `children_count` o
`event_end_date` cuando el pedido lo corrige.

Alojamiento por noche: una caja de "Servicios de Ingreso" por día con
noche (regla de Felipe, 06-10: *"se los debo asignar a cada día para hacer
el programa"*). Alimentación completa = desayuno, almuerzo y cena; parte
con el almuerzo del día de llegada y termina con el desayuno de la salida.

## 5. Lo que ya sabemos que resulta

Medido el 12-10-2026 en Valle del Sol, cotizaciones de los últimos 15
meses (consideradas = todas menos solicitadas; ganadas = aceptada o
realizada):

| Tipo de evento | Consideradas | Ganadas | Conversión | Valor por persona ganadas / perdidas |
|---|---|---|---|---|
| Almuerzo o Cena | 123 | 32 | 26% | (dato distorsionado por un valor atípico) / $39.103 |
| Paseo fin de año | 105 | 32 | 30% | $53.587 / $48.143 |
| Estadía y Alimentación | 90 | 35 | 39% | $101.068 / $87.138 |
| Uso salones | 47 | 18 | 38% | $34.927 / $30.897 |
| Paseo de Curso | 28 | 12 | 43% | $12.421 / $53.046 |
| Celebraciones | 19 | 3 | 16% | $46.750 / $39.831 |
| Matrimonios | 14 | 3 | 21% | $71.123 / $47.148 |
| Graduación | 9 | 3 | 33% | $50.000 / $31.500 |

Lectura:
- Salvo en paseos de curso, lo que se gana NO es más barato que lo que se
  pierde: el precio no es lo que decide.
- En paseos de curso sí: se ganan los de entrada con poco o nada de comida
  (~$7.500 por alumno) y se pierden los caros.
- Celebraciones convierte poco: conviene llamar antes de enviar.
- Medición del 06-10 (memoria de menús): los niveles premium y los menos
  frecuentes cierran mejor (lomo liso ~43%, completo italiano en la once
  43%, mechada en el desayuno ~48%).

Paquetes vigentes (foto del 12-10 en la tarde; Felipe ajusta nombres con el
lápiz, así que la base manda sobre esta tabla). Felipe pidió **agruparlos
por tipo de requerimiento** (*"un cliente me pregunta por un paseo y debo
tener dos o tres alternativas juntas y no estar scrolleando"*):

| Grupo | Paquete | Por persona |
|---|---|---|
| Full day | Paseo de curso (alumnos) | $29.400 |
| Full day | Full day: adulto mayor (sin ticket, confirmado por Felipe) | $34.300 |
| Full day | Paseo empresa niños | $38.300 |
| Full day | Clasico (la comida del de adulto mayor + ticket) | $44.300 |
| Full day | Paseo empresa (almuerzo nivel 3) | $57.000 |
| Alojamiento | 1N Media pensión economico (desayuno y once; nombre puesto por Felipe) | $39.400 |
| Alojamiento | 1N Media pensión básico | $41.600 |
| Alojamiento | 1N Pensión completa básico | $52.500 |
| Alojamiento | 2N Media pensión básico | $83.200 |
| Alojamiento | 2N Media pensión estándar | $95.200 |
| Alojamiento | 2N Pensión completa básico | $105.000 |
| Alojamiento | 3N Media pensión básico | $124.800 |
| Alojamiento | 2N Pensión completa estándar | $129.000 |
| Alojamiento | 3N Media pensión estándar | $142.800 |
| Alojamiento | 3N Pensión completa básico | $157.500 |
| Alojamiento | 3N Pensión completa estándar | $193.500 |
| Graduación | Solo cóctel | $27.600 |
| Graduación | Cena, alojamiento y desayuno | $47.600 |
| Matrimonio | Matrimonio: solo cóctel (ex «cóctel extendido») + fijos $1.400.000 | $30.900 |
| Matrimonio | Matrimonio: cóctel y fiesta + fijos $1.400.000 | $41.400 |
| Matrimonio | Matrimonio: de día con cóctel y almuerzo + fijos $1.400.000 | $46.100 |
| Matrimonio | Matrimonio íntimo (folleto) + fijos $1.400.000 | $46.100 |
| Matrimonio | Matrimonio Origen (folleto) + salón cúpula $400.000 | $46.800 |
| Matrimonio | Experiencia Valle del Sol (folleto) + salón cúpula $400.000 | $62.400 |
| Matrimonio | Matrimonio: de noche con cóctel, cena y barra libre | $64.100 |
| Matrimonio | Matrimonio: cóctel, cena y fiesta + fijos $1.400.000 | $71.300 |
| Salones | Salón medio día (+ salón auditorio medio día $200.000) | $8.900 |
| Salones | Salón medio día con almuerzo (+ salón auditorio medio día $200.000) | $25.800 |
| Salones | Salón día completo (+ salón auditorio día completo $250.000) | $36.700 |
| Sernatur | Sernatur: programa 4, 5 y 6 días (fuera: contrato) | — |

**Nombres de los paquetes con noches (Felipe, 12-10).** La forma es
**noches · servicio · versión**, y el precio por persona al lado del nombre
termina de explicarlo (*"igual el precio también es explicativo"*):

- **1N, 2N, 3N** = cantidad de noches. **AM** = adultos mayores.
- **Pensión completa** = desayuno, almuerzo y cena. **Media pensión** =
  desayuno y cena (decidido: el trabajador sale de día y vuelve a cenar).
- **Básico** = menús nivel 1 ($8.700 el desayuno, $10.900 almuerzo y cena).
  **Estándar** = almuerzo y cena de nivel 2 ($16.900) con desayuno de
  nivel 1, como el antiguo paquete de adulto mayor estándar. En 1 noche hay
  solo versión básica, más el **económico**: Felipe le puso «1N Media
  pensión economico» al de 1 noche con desayuno y once (la once en vez de
  la cena). Su alojamiento va como servicio suelto, no como caja «Noche 1»;
  funciona igual (categoría Servicios de Ingreso).
- **No se separan adulto mayor y trabajadores** (Felipe: *"distinguirlos por
  adultos mayores y por trabajadores no tiene sentido, es los mismos menús
  y precios"*): un solo grupo, Alojamiento. Los dos paquetes de adulto mayor
  de 2 noches pasaron a ser «2N Pensión completa básico» y «estándar».
- **Temporada media para todos** ($22.000 la noche), para que se comparen
  parejo; en otra temporada se cambia la caja de alojamiento en la
  cotización. Los de adulto mayor estaban en baja y subieron $8.000.
- **Orden de las cajas = orden del día.** Pensión completa: almuerzo, cena,
  noche, desayuno, almuerzo… Media pensión: cena, noche, desayuno, cena…
  Ningún plato se repite dentro de un paquete, salvo la mechada del 3N
  Pensión completa estándar (con otra guarnición): el nivel 2 tiene 5
  platos de fondo para 6 comidas.

**Salones, armados con lo que compran los centros de capacitación (Felipe,
12-10: *"veamos qué es lo que más se vende a centros de capacitación"*).**
En Uso salones, últimos 15 meses, gana **desayuno + almuerzo + un coffee en
la tarde**: 12 cotizadas, 8 ganadas (67%), ~$39.150 por persona en comida,
~29 personas. Después vienen solo coffee (6 cotizadas, 2 ganadas), solo el
salón (6 y 2), almuerzo con dos coffees (3 y 1); con alojamiento hubo solo
2 en 15 meses. El cliente ancla es Brito Pradenas Asesoría y Capacitación:
9 de 12 ganadas, siempre salón auditorio + desayuno + almuerzo + un
coffee, 8 a 36 personas, ~$42.000 por persona. Por eso el grupo «Jornada
de trabajo» pasó a llamarse **Salones**, el de 1 día perdió el coffee de
la mañana y el de «2 días con 1 noche» se reemplazó (no lo pide nadie).
Los tres llevan el **salón como fijo del paquete**: al aplicarlo entra
solo, como en Graduación y Matrimonio. «Salón medio día con almuerzo» lo
pidió Felipe ("coffee y almuerzo nada más", almuerzo nivel 2): coffee de
media mañana y cierre con almuerzo.

**Matrimonios, armados con lo vendido (Felipe, 12-10).** Primero se
armaron tres desde los folletos 2026 (íntimo, Origen y Experiencia; el
íntimo calza al peso, Origen y Experiencia quedan ~$1,2 millones por
evento bajo el folleto con 80 personas, y Felipe ajusta los folletos).
Después Felipe pidió basarse en lo vendido (*"en realidad no se ha vendido
ninguno, entonces vamos a hacer paquetes de cosas que no se venden"*). En
todo el histórico hay 15 matrimonios cotizados y 2 vendidos (#124, 45
personas, $75.790 p.p.; #388, 40 personas, $74.000 p.p. + arriendo de
salón $2.500.000): los dos con cóctel, cena, barra libre y trasnoche. El
folleto Origen ($66.900) se cotizó 4 veces y se perdieron las 4. De ahí
salen tres escalones, todos con los fijos del íntimo (salón cúpula,
audiovisual 6 h y decoración premium, $1.400.000): **solo cóctel** (el
cóctel extendido, porque reemplaza la cena), **cóctel y fiesta** (el
cóctel vendido con 8 bocados + barra libre 4 h + trasnoche de consomé y
pizza) y **cóctel, cena y fiesta** (lo anterior + la cena vendida:
ensalada, filete con pastelera de choclo, tiramisú, vino, jugo, bebida y
café). La cabaña de los novios, el montaje y los garzones no se itemizan
(Felipe: *"es verbalizar lo obvio"*).

Ningún código depende del nombre de un paquete (revisado con grep el
12-10). Ese mismo día los grupos pasaron a ser **listas de verdad**
(Felipe: *"mejor crear y editar listas, es más fácil que una sección que
se arme por el nombre del paquete"*): tabla `package_groups`, migración
120. "Partir de un paquete" muestra un título por grupo en el orden que
decide la empresa; cada paquete tiene su lápiz (nombre y grupo) y al pie
está "Ordenar grupos…" (crear, renombrar, subir y bajar, borrar). Un
paquete nuevo elige su grupo al crearse. Los nombres "Grupo: …" se
conservan, pero bajo su título la fila no repite el grupo. El ticket del paquete
de paseo de curso se renombró "Ticket paseo de curso con alimentación"
($2.400), para que nadie lo use suelto en una entrada sola; el nombre sale
impreso en el programa del cliente, por eso no dice "solo en paquete".

## 6. El botón (diseño, sin construir)

- **Dónde:** "Proponer cotización" en la ficha del requerimiento, y
  "Proponer todas" en Requerimientos.
- **Motor:** `POST /quotations/:id/propuesta` arma el contexto
  (requerimiento, cliente e historial, catálogo de la empresa: paquetes,
  menús, sueltos y fijos, las reglas de la sección 2 y la tabla de la
  sección 5) y llama a Claude (`claude-opus-5-5`, salida con estructura
  exacta).
- **El modelo propone y el motor decide los números:** el modelo devuelve
  cajas por día, categoría y audiencia con ids de menús y sueltos, fijos,
  descuento según regla y comentarios. El motor valida cada id contra el
  catálogo DE ESA EMPRESA, arma la foto, calcula con `computeMoney`, guarda
  con `verifyMoney` y deja la cotización en solicitada. El modelo nunca
  escribe un precio ni envía nada.
- **Multiempresa:** cada empresa usa su catálogo y sus reglas; las de Valle
  del Sol son la plantilla, igual que la plantilla de rubro de la carga
  inicial con IA.
- **Derechos por plan:** decidir en qué plan entra (correos automáticos
  y carga inicial son de los planes altos).
- **Qué hay que construir antes:** que los paquetes de niños entren
  marcados como niños solos, y menús de alojamiento por noche para
  temporada media y alta (sección 8).

## 7. Primera corrida (12-10-2026)

Las 11 quedaron en solicitada, cuadradas al peso, con los comentarios en
las observaciones. Respaldo del estado anterior en el scratchpad de la
sesión; las observaciones originales quedan intactas arriba del separador.

| N° | Cliente | Propuesta | Total | Por persona |
|---|---|---|---|---|
| 600 | María Sepúlveda (Explora Viajes, tour operador) | Fullday adultos mayores, 30 personas, −15% | $874.650 | $29.155 |
| 574 | Universidad del Bío-Bío | Claustro 2 días 1 noche, 20 personas, salón auditorio | $2.420.000 | $121.000 |
| 605 | Agencia Patytour | 3 noches con pensión completa, 20 personas, −15% | $2.677.500 | $133.875 |
| 602 | Empresa Portuaria Talcahuano | Paseo de fin de año, 40 adultos y 30 niños, producción navidad y exclusividad | $5.761.500 | adultos $52.700, niños $30.700 |
| 604 | María Fuentealba | Paseo de curso con alimentación, 62 | $1.822.800 | $29.400 |
| 576 | Colegio Luis de Álava | Graduación con cóctel, decoración y salón, 90 | $3.141.000 | $27.600 |
| 591 | Darlyn Ramírez | Bautizo, almuerzo y cena, 25 adultos y 5 niños, salón cúpula | $1.218.000 | $27.800 |
| 599 | María Cristina Vargas (club adulto mayor) | Fullday adultos mayores, 20 | $686.000 | $34.300 |
| 601 | María Guiñez Espinoza | Fullday adultos mayores, 25 | $857.500 | $34.300 |
| 603 | Cami y Diego | Matrimonio de noche, 80: cóctel, asado buffet, barra libre, café, salón y audiovisual | $6.344.000 | $59.300 |
| 588 | María José Vargas | Almuerzo nivel 2, 60 adultos y 4 niños | $1.072.800 | $16.900 |
| 562 | Taller laboral Country | Paseo empresa día completo, 11 (sin detalle del pedido; evento el 17-10) | $627.000 | $57.000 |
| 585 | IDHR | Completada: ya tenía desayuno, dos coffee y salón; se agregó almuerzo nivel 2 y data | $1.510.000 | $45.200 |

La #562 y la #585 eran cotizaciones solicitadas sin terminar, no
requerimientos; Felipe pidió procesarlas igual (12-10: *"IDHR y taller
laboral Country falta"*). A la #585 se le agregó lo que faltaba, sin tocar
lo que ya estaba armado.

## 8. Lo que falta paquetizar y lo que no tenemos

Revisión del 12-10 con los pedidos reales. **Hecho el mismo 12-10
(Felipe: "armemos los paquetes que faltan")**: los cuatro paquetes marcados
como nuevos en la sección 5, más 7 menús de apoyo: «Barra libre 4 horas»
(Extras) y «Alojamiento temporada media/alta - Noche 1, 2 y 3» (Servicios
de Ingreso; un paquete no admite el mismo menú dos veces, por eso hay uno
por noche). Lo que sigue quedó como registro de la revisión:

- **Coffee:** los menús están bien escalonados (Mini sándwich $6.800,
  Clásico $8.900, Campestre $10.700, Ejecutivo $12.300, Premium $15.700,
  Graduación $23.200). Falta el **paquete "Jornada de trabajo"**
  (desayuno, coffee, almuerzo, coffee): Uso salones es el cuarto tipo en
  volumen y convierte 38%. ~~El salón y el audiovisual van aparte porque un
  paquete no lleva fijos.~~ Corregido el 12-10: un paquete SÍ lleva fijos
  (tabla `service_group_collection_fixed_services`; Graduación y Matrimonio
  ya los usaban) y entran solos al aplicarlo. **Hecho el 12-10:** grupo
  Salones (sección 5), con el salón dentro de cada paquete.
- **Cócteles:** los menús Cóctel I a IV ($9.700 a $21.200) bastan. Falta el
  **paquete "Matrimonio de noche"** (cóctel, cena, barra libre y café),
  que es lo que pide la mayoría.
- **Estadía para grupos que no son adulto mayor**, 1 y 2 noches. Los menús
  de alojamiento por noche existen solo en temporada baja. En temporada
  alta, el suelto "Alojamiento temporada alta" arma su caja con una
  categoría que ya no existe ("Servicios de alojamiento"). Faltan los menús
  "Alojamiento temporada media/alta - Noche N". **Hecho el 12-10:** los 10
  paquetes 1N/2N/3N de media pensión y pensión completa (sección 5).
- **Pensión completa para tour operadores** (desayuno, almuerzo, cena y
  alojamiento por día). **Hecho el 12-10:** son los mismos de pensión
  completa; el 15% de tour operador va en la cotización.
- **Pedidos que no tenemos** (12-10): hamburguesa, waffles y helado soft,
  risotto, Milo, leche descremada y sin lactosa, agua mineral con y sin gas
  en estación, bebidas zero (confirmar si la bebida libre las incluye) e
  internet o wifi como ítem.
- **Decidido (Felipe, 12-10):** el Fullday adultos mayores va sin ticket de
  ingreso y el Paseo empresa con ticket (*"sí, está bien"*).
- **En conversación:** el ticket del paseo de curso con alimentación es
  $2.400 *"para cuadrar la promoción"*, pero la entrada sola se cobra
  $7.500. El PDF no lo muestra (imprime solo el valor por persona); el
  riesgo es que alguien elija ese ticket suelto para una entrada sola.
