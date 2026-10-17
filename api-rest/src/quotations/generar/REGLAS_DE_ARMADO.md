# Reglas de armado de Valle del Sol

Este archivo es UNO solo y lo leen los dos que arman cotizaciones: el botón
«✨ Crear con IA» de Eventia y la skill `armar-cotizacion` del chat (Felipe,
17-10-2026: *"¿no podemos montar la skill que tenemos en ese agente?"*).
Cada corrección de Felipe se escribe acá, en «Lecciones», y desde el
siguiente despliegue la aplican los dos. El diseño y la historia están en
`docs/arquitectura/16_PROPUESTAS_DE_COTIZACION.md`.

Valle del Sol Quillón: complejo turístico en Quillón, Ñuble, Chile, con
cabañas, restaurante, salones y áreas verdes. La cotización se arma SOLO con
el catálogo de Eventia, y una persona del equipo la revisa antes de enviarla.

## Precios

- Nunca se escribe un precio: se eligen productos del catálogo y el precio lo
  pone Eventia. Los precios del catálogo ya traen IVA.
- El precio es una VARIABLE para elegir, no un tope (Felipe, 17-10).
  «Económico» = el nivel más barato de esa comida; «mediano» = el del medio;
  «caro» o «premium» = el más alto. Almuerzo y cena: Nivel 1 o Básicos,
  Nivel 2 o Estándar, Nivel 3 o Premium. Desayuno: Estándar o Premium.
  Cóctel: del I (el más barato) al IV.
- El presupuesto del cliente no es un límite: se arma lo que pidió, sin bajar
  niveles ni quitar cosas para que calce. Si el pedido no dice el nivel y hay
  presupuesto, se elige el nivel que más se le acerque por persona. Si se
  aleja mucho, se anota en la nota y se guarda igual.
- Si no dice nivel ni presupuesto, manda la historia: lo más vendido en
  eventos parecidos.

## La historia (manda cuando faltan datos)

- Si el cliente ya compró antes, se parte de su última cotización vendida
  (mismas comidas, niveles y salón), salvo que el pedido diga otra cosa.
- Si no, se mira cómo se armaron las cotizaciones vendidas parecidas.
- La historia es la del momento de armar, nunca una guardada (Felipe, 17-10:
  *"la historia se va moviendo"*). La nota dice qué historia se usó.

## La forma de cada comida (la de los menús guardados de la casa)

- **Almuerzo y cena**: una entrada o una ensalada, UN principal con UNA
  guarnición (o un plato único en vez de los dos) y UN postre. El pan y la
  bebida vienen en la sección fija.
- **Desayuno**: la sección fija (té, café y leche), un jugo, pan con
  mantequilla, uno o dos salados (huevo revuelto, jamón, queso, palta) y un
  dulce (bollería, mermelada, yogurt con granola, torta).
- **Once**: como el desayuno: bebestible fijo, salado y dulce.
- **Coffee**: un bebestible (punto de hidratación o jugo), de 1 a 5 bocados
  salados y de 1 a 3 dulces; más bocados a mayor nivel.
- **Cóctel**: bebida y pisco sour de base, espumante desde el nivel III, de 2
  a 6 bocados salados y de 3 a 5 dulces según el nivel. Los de matrimonio
  tienen sus propios menús.
- **Nunca dos de la misma sección** en almuerzo, cena o desayuno (dos
  principales, dos postres, dos puntos de hidratación), salvo que el pedido
  lo pida. En coffee y cóctel sí van varios bocados: es su forma.
- Un menú guardado que no cumple esta forma (por ejemplo, uno de prueba) no
  se usa: se parte de otro de la misma comida y, si no hay ninguno, se arma
  con sueltos. Se dice en la nota.

## Cómo se arma

- **La base son los paquetes de la casa** (Felipe, 17-10: *"quiero que se
  base mayoritariamente en los paquetes: desayunos, almuerzos, cenas, onces,
  cócteles, todos están paquetizados; en caso que un paquete no encaje, debe
  adaptarlos"*). Son de dos clases: los **paquetes de evento** (full day,
  salones, noches 1N, 2N y 3N, matrimonio, graduación) y los **menús
  guardados** de cada comida, por nivel. Toda comida sale de un menú
  guardado.
- En este orden: 1) si hay un paquete de evento para el pedido, se parte de
  él: sus menús, sueltos y fijos van a las cajas, cada uno en su día; 2)
  cada comida que falte, con un menú guardado de su nivel; 3) los sueltos,
  solo para adaptar; 4) al final, los fijos.
- **Si no encaja, se adapta; no se arma de cero:**
  - otro plato: se parte del menú guardado más parecido del nivel y se
    cambia SOLO ese plato, en su misma sección (principal por principal,
    postre por postre);
  - otro nivel: el menú del nivel pedido, en la misma comida;
  - una comida más o una menos que el paquete: se suma o se saca esa caja,
    con un menú guardado del mismo nivel;
  - más noches que el paquete: se repite la forma con otros menús del
    nivel, sin repetir platos; otro salón: se cambia el fijo;
  - un agregado que el cliente pide además: se suma al menú.
- La nota dice de qué paquete y de qué menús se partió, y qué se les
  cambió.
- Una comida entera con servicios sueltos, sin un menú guardado de base,
  solo si ninguno sirve; la nota dice por qué.
- Lo que el cliente pide y NO está en el catálogo va en la nota en
  mayúsculas con su reemplazo: «NO TENEMOS risotto: va pastelera de
  choclo».
- Cada comida en SU día, y dentro del día en orden: desayuno, coffee,
  almuerzo, once, cena, extras y al final el alojamiento. Nunca todas en el
  día 1.
- Alojamiento: una caja «Servicios de Ingreso» por cada día que tenga noche,
  con el alojamiento de la temporada de ESA noche (baja del 01-03 al 31-08,
  media del 01-09 al 15-12, alta del 16-12 al 28-02). El día de la salida no
  lleva alojamiento.
- Estadías: pensión completa = desayuno, almuerzo y cena; media pensión =
  desayuno y cena. La alimentación parte con lo que el pedido diga del día de
  llegada (si no dice, con el almuerzo) y termina con el desayuno del día de
  salida. «Básico» = Nivel 1 o Básicos con desayuno Estándar; «Estándar» =
  almuerzo y cena Nivel 2 o Estándar con desayuno Estándar. Si la estadía
  calza con un paquete de noches (1N, 2N, 3N), se parte de él; si es más
  larga o de otro nivel, se adapta.
- No se repiten platos dentro de una misma cotización: se rotan los menús del
  nivel.
- Si son varios días o fechas alternativas y el pedido no lo deja claro, se
  arma un solo día y se pregunta en la nota.
- Personas: el total del evento incluye a los niños. Las cajas de adultos van
  con los adultos; las de niños usan las categorías «… niños» con la cantidad
  de niños. Una caja puede ser para parte del grupo (el alojamiento de
  algunos, por ejemplo).
- La cantidad de un servicio es POR PERSONA y casi siempre es 1: Eventia
  multiplica cada caja por sus personas.
- La sección fija de cada categoría (pan, bebida, té y café) entra sola.

## Fijos

- Solo los del catálogo de fijos. Salón según el pedido: medio día, día
  completo o de noche; auditorio para capacitación, cúpula para celebraciones
  y fiestas.
- Exclusividad solo si la piden, según el día de la semana: lunes a jueves,
  viernes a domingo, o full.
- Lo que más se vende: salones con desayuno, almuerzo y un coffee en la
  tarde; matrimonios con cóctel, cena y fiesta (barra libre y trasnoche) más
  los fijos del matrimonio íntimo (salón cúpula, audiovisual 6 horas,
  decoración premium); paseos de curso con entrada y poca comida.
- Sernatur no se ofrece: va por contrato.

## Descuentos

- Tour operadores: 15%. Clubes de adulto mayor: sin descuento. Ningún otro
  sin que Felipe lo decida.

## Recetas que ya resultaron

- **Faena o trabajadores con alojamiento** (Rudel #500, Ecofor #616): cena
  Nivel 1, alojamiento de la temporada y desayuno Estándar del día
  siguiente; llegan con cena y se van con desayuno. Almuerzos y colaciones
  van aparte, fuera de la cotización, salvo que los pidan.
- **Jornada de trabajo y celebración de noche con alojamiento** (Pares y
  Álvarez #615): día 1 el paquete «Salón día completo», cena Nivel 3 (asado
  buffet), barra libre 4 horas y alojamiento; día 2 desayuno Estándar. Fijos:
  salón cúpula día completo para la celebración y audiovisual 4 horas (el de
  fiesta).

## Lecciones (de las correcciones de Felipe)

- **14-10, Rudel #500**: el precio de Felipe se arma con productos del
  catálogo, nunca editando un precio (*"no muevas los precios así a dedo"*).
  Se pregunta si todos duermen todas las noches.
- **14-10**: las notas internas nunca van a Observaciones, que salen en el
  PDF.
- **15-10, Pares y Álvarez #615**: dos fechas seguidas en un paseo de
  empresa pueden ser dos días y no alternativas: se pregunta. El audiovisual
  de $400.000 es el de fiesta.
- **15-10, Ecofor #616**: "doble turno" era el horario de trabajo, no piezas
  compartidas.
- **17-10, laboratorio**: la cantidad de un plato es por persona (la IA puso
  80 por persona y sumó $450 millones). Un menú guardado de prueba, con dos
  principales y dos puntos de hidratación, sin postre ni guarnición, no se
  usa (Felipe: *"no tiene sentido"*).
- **17-10, Felipe**: la base son los paquetes y los menús guardados; si no
  encajan, se adaptan (un plato por otro en su sección, una comida más o
  una menos), no se arma de cero.

## La nota (para el equipo, nunca para el cliente)

- Qué se armó, en dos o tres líneas.
- Supuestos: fechas, quién duerme, cómo se leyó el pedido; si admite dos
  lecturas, cuál se eligió.
- Lo que NO TENEMOS, con su reemplazo.
- La historia que se usó.
- Qué conviene preguntarle al cliente.
- Sin precios ni totales: los calcula Eventia.
