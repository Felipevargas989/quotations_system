# 15 · Carga inicial con IA (onboarding automático)

> **Estado: PLAN APROBADO POR FELIPE (09-10-2026), SIN CONSTRUIR.** Sprint 0
> en curso: el MDS (Marina del Sol) armado a mano como lo haría el agente
> —catálogo, recetas con costo estimado, menús guardados y paquetes—,
> ensayado en el laboratorio el 09-10 y por cargar en producción, en una
> empresa nueva, para la revisión de Felipe. Después se construye la carga
> automática.

## Por qué

Felipe, 09-10-2026: *"no puede ser que alguien se demore semanas en todo
el trabajo de implementación, porque eso es una piedra de entrada
demasiado grande"*. Una empresa nueva sube su carta y un agente con
razonamiento avanzado le devuelve el sistema ordenado: catálogo, recetas
con costo estimado, menús guardados y paquetes. La persona revisa, aprieta
"Crear" y **lo único que hace a mano es asignar los proveedores** (Felipe:
*"que eso sí lo haga cada persona"*). Meta: una empresa cotiza el mismo día
que se registra.

Reemplaza la carga por Excel (rota, mapa 05 R8) y cubre lo que Felipe
pidió antes: cargar catálogos desde cotizaciones de banquete en PDF.

## Decisiones (Felipe, 09-10-2026)

1. **No se entrena un modelo.** Se le enseña en cada pedido con la
   *plantilla de rubro* (abajo) y las reglas de la casa; lo que se mejora
   es la plantilla, y eso le sirve a la empresa siguiente.
2. **Modelo candidato: Claude Opus 5.5** (`claude-opus-5-5`, lee PDF e
   imágenes, salida con estructura exacta, pensamiento adaptativo;
   US$4/US$20 por millón de tokens; unos pocos dólares por empresa,
   estimado). Si la medición lo deja corto: Claude Fable 5.1 (el más
   capaz, US$10/US$50, más lento). Se decide con datos (sprint 0).
3. **La plantilla lleva la ESTRUCTURA de Valle del Sol, nunca sus platos
   ni sus precios de VENTA.** (Los precios de COMPRA de insumos sí: ver
   decisión 8.)
4. **Las secciones son parte central de la plantilla** (*"tiene un sentido
   de estructurarlo así al momento de presentar la cotización"*).
5. La empresa **revisa** el borrador (con las dudas del agente) y aprieta
   "Crear"; recién ahí se escribe en su cuenta.
6. **La plantilla es una caja de herramientas, no un molde.** Felipe: *"si
   el MDS cobra por menú, a lo mejor no hay que separar todo… la idea es
   buscar la forma en que esto se pueda adaptar a las variables del
   mercado, porque si no, no lo puedo vender"*. El agente respeta cómo
   vende cada empresa:

   | Cómo vende | Herramienta de Eventia |
   |---|---|
   | Por plato (Valle del Sol) | Ítems con precio por persona |
   | Opciones cerradas ("Coffee 1, 2, 3") | Una línea por opción, lo que trae en el nombre |
   | Menú de precio fijo con platos a elección (almuerzo ejecutivo) | Una categoría por menú; **precio parejo por sección** que suma el del menú; lo que "siempre incluye" en la sección fija a $0 |
   | Formato + elección (cóctel de N bocados) | Sección "Formato" con los precios + bocados a $0 para elegir |
   | Por pack o unidad (Mokka) | Servicio fijo × cantidad |
   | Espacio por bloque (salones) | Servicio fijo; medio día y día completo son servicios distintos |
   | Todo incluido por persona | Servicio paquetizado o paquete |
   | Base + por persona | Fijo + por persona (`fijo_variable`) |

7. **Receta propuesta por plato, con costo estimado.** El agente propone
   los insumos y el gramaje NETO por persona de cada plato (regla de la
   casa del 22-07: la merma solo suma al costo). La persona la edita en
   Catálogo → Receta. **El proveedor va en el insumo, no en la receta**:
   si el salmón está en cinco platos, se asigna una vez (Proveedores →
   Insumos). Todo eso ya existe (mapa 06): lo nuevo es solo que el agente
   lo llene.
8. **Precios de insumos transversales.** Cada insumo de una receta es un
   **producto base** genérico ("Pisco", no "Pisco Mistral 35°"; "Lomo
   vetado", no "Lomo vetado nacional clase A"). La IA clasifica: bota lo
   que casi no mueve el precio (nacional, clase, marca, formato) y
   conserva lo que sí (el corte: vetado, liso y filete son productos
   distintos). Su precio por kg, litro o unidad es **el del medio** entre
   las empresas que lo tienen, **Valle del Sol incluida, sin decir nunca de
   quién es**. Felipe: *"los precios de compra de los productos son de
   conocimiento público… mientras que no diga que yo lo compré a ese
   precio"*; al principio será el precio de Valle del Sol y *"no tiene por
   qué saberse"*; después los clientes alimentan el promedio y *"servirá
   para mi negocio"*. Un precio fuera de un rango creíble no entra (el
   salame a $13 el kilo). Lo que ninguna empresa tiene va como
   **estimado**, y la persona lo corrige con su primera compra (el
   catálogo ya aprende el precio de cada compra). No necesita ser exacto:
   es una propuesta inicial para simplificar el uso.
9. **Menús guardados y paquetes también son herramientas.** El agente arma
   los paquetes típicos del rubro (jornada completa en salón, cóctel
   corporativo, cena de gala…) para que quien cotiza *"no tenga que
   meterse y seleccionar uno a uno"*. Un paquete no puede repetir un menú
   (índice único): el coffee de la mañana y el de la tarde son dos menús,
   igual que el "Alojamiento Noche 1 / Noche 2" de Valle del Sol.

## El recorrido

| # | Quién | Qué pasa | ¿Existe hoy? |
|---|---|---|---|
| 1 | La persona | Se registra; al entrar ve "Arma tu sistema": sube su carta (PDF, Word, Excel o fotos) y responde tres preguntas: ¿precios con o sin IVA?, ¿cobras por menú o por plato?, ¿arriendas salones? | El registro sí; la subida es nueva |
| 2 | El agente | Arma el borrador: catálogo, receta propuesta por plato con costo estimado, menús guardados, paquetes y sus dudas | Nuevo |
| 3 | La persona | Revisa el borrador, responde las dudas y aprieta "Crear" | Nuevo: una pantalla |
| 4 | El sistema | Escribe todo en su cuenta; los insumos nacen sin proveedor | El cargador del sprint 0 |
| 5 | La persona | Asigna un proveedor a cada insumo y corrige lo que quiera | Ya existe |

Primero lo hace Claude con dos o tres empresas reales (MDS, Mokka,
Neuralis), sin programar; cuando el resultado sea bueno, el agente dentro
de Eventia hace lo mismo solo.

## Sprint 0: el MDS (09-10-2026)

Carpeta `Onboarding con IA/ejemplos/mds-hoteles/` (fuera del repo): la
carta 2026 y los salones de Chillán; `generar_carga.py` (catálogo),
`propuesta_mds.py` (recetas, menús y paquetes), `catalogo_mds.json` (la
**respuesta esperada**: lo que el agente tendrá que producir),
`cargador.sql.plantilla` (el cargador único) y `reporte_costos.md`. La
base de precios por producto está en
`Onboarding con IA/base_precios/insumos_empresas.csv`.

**El cargador** escribe en orden: insumos (sin proveedor), categorías,
secciones (la fija marcada), ítems con su vínculo y su receta, servicios
fijos, menús guardados y paquetes. Candados: la empresa debe existir y
estar vacía, y cada receta, menú y paquete debe encontrar todas sus piezas
o no se escribe nada. Los ítems que no son comida (el formato del cóctel,
la degustación, el estacionamiento) van "sin costo en Eventia", para que
el margen no los cuente como pendientes.

**Ensayo en el laboratorio (09-10, todo deshecho):** 9 categorías, 24
secciones (5 fijas), 121 ítems (10 sin costo), 134 productos base (84 con
precio de empresas, 50 estimados), 528 líneas de receta, 25 menús
guardados, 6 paquetes y 11 salones. Costo estimado de insumos entre el 8 %
(open bar) y el 24 % (almuerzo de filete) del precio.

**Hallazgo:** el MDS ya existía en Eventia, empresa 51 (producción y
laboratorio, creada el 29-04-2026), armada a mano "separando todo": cada
componente con un precio calculado para que el menú sume exacto (el cóctel
cuadra en sus cuatro formatos con montaje $22.729 + piezas). Tiene 114
ítems, 6 menús, 2 cotizaciones (18-07) y **0 vínculos ítem-categoría**:
su carta probablemente se ve vacía al cotizar (sin comprobar en pantalla).
No se toca; la prueba va en una empresa nueva.

## La plantilla de rubro (medida en Eventia el 09-10-2026, empresa 1)

**Comidas de plato** — Almuerzo, Cena, Almuerzo niños, Lunch box:
Fijos (por defecto) · Bebestibles · Entradas · Ensaladas · Platos únicos
· Principales · Guarniciones · Postres.

**Comidas de mesa** — Desayuno, Once, Snack y sus versiones niños:
Fijo (por defecto) · Bebestibles · Salado · Dulce.

**Coffee & Cóctel**: Bebestibles sin alcohol · Bebestibles con alcohol ·
Bocados salados · Bocados dulces.

**Extras**: Actividades · Bebestibles · Snacks · Otros.

**Servicios de ingreso**: Alojamiento · Ticket de ingreso.

**Servicios paquetizados** (sin secciones).

**Servicios fijos — se cobran POR EVENTO, no por persona** (Felipe,
09-10: *"ojo con los servicios fijos también, cómo es su estructura"*;
medido ese día en la empresa 1):

| Sección | Qué va ahí (ejemplos de VDS, solo como forma) |
|---|---|
| Arriendos | Salones por medio día / día completo |
| Audiovisuales | Servicio audiovisual por horas, producciones, arriendo de sillas |
| Decoraciones | Decoración básica, de graduación, de matrimonio |
| Actividades | Tinajas por horas o por el día, masajes |

Cómo se cobran (`fixed_services.calculation_type`, regla en
`quotations/utils/money.ts` `resolveFixedServicePrice`):
- **Fijo**: un monto por evento (un salón medio día).
- **Fijo + por persona** (`fijo_variable`): base por evento + un monto por
  persona (las sillas: base + $1.200 por persona). Son 2 de 45 en VDS.
- ("Variable con límites" está retirado desde el 18-07: el agente nunca
  lo propone.)
- Las variantes por duración son servicios distintos (medio día / día
  completo, 4 horas / por el día).
- Los costos de cada fijo (costo fijo, costo por persona, "sin costo")
  son de Logística: el agente no los inventa; si un documento los trae,
  van como sugerencia aparte.

**Fijos de categoría — lo que SIEMPRE va en una comida, por persona** (la
sección "Fijos (por defecto)" de cada categoría; sello ámbar «fijo» en el
cotizador; entra sola al abrir la caja, también al aplicar un menú
guardado). En VDS: Desayuno y Once → té, café y leche; Almuerzo, Cena y
Almuerzo niños → bebida libre consumo + pan con pebre; Lunch box →
packaging. El agente los detecta en frases como "todos los menús
incluyen…" y no los confunde con los servicios fijos por evento.

**Tipos de cliente y de evento**: los de Valle del Sol (ya se siembran al
crear la empresa: migración 117, `sembrarTiposBase`).

**Reglas de la casa que el agente aplica**: nombre de menú guardado
"principal - agregado"; precios con IVA cuando se factura (preguntar si
no está claro); separar lo que se cobra **por persona** (ítems de comida)
de lo que se cobra **por evento** (servicios fijos); detectar "base + por
persona"; la sección "Fijos (por defecto)" es lo que va siempre en esa
comida.

**Fuera de la plantilla**: las categorías Sernatur (programa propio de
Valle del Sol).

**A normalizar en la plantilla** (en Valle del Sol no se toca nada):
Salado/Dulce vs Dulces, Guarnición vs Guarniciones, "Plato unico" sin
tilde en Lunch box.

## Huecos encontrados en los ejemplos (09-10-2026, sin decidir)

- Recargos por día de la semana y precios por tramo de cantidad.
- Precios ingresados netos ("mis precios son sin IVA"): hoy se guardan con
  IVA y el agente multiplica por 1,19.
- Varias sedes (la carta de MDS es de Talcahuano y los salones de Chillán).
- El texto de condiciones de reserva (la empresa no tiene dónde guardarlo).
- Los ítems no tienen campo de descripción: lo que trae una opción cerrada
  va en el nombre.
- La capacidad de los salones por montaje no se guarda: va en el nombre.

## Pendientes

- Una llave de la API de Anthropic, creada por Felipe y puesta por él en
  Railway (nunca en el chat).
- Una línea en la política de privacidad: los documentos se procesan con
  inteligencia artificial, y los precios de compra se usan juntos y
  anónimos para proponer precios iniciales.
- La base pública para lo que ninguna empresa tiene (hoy: 50 estimados a
  mano en el MDS).
- Opcional: asignar un proveedor a varios insumos de una vez.

## Orden de construcción

0. **Sprint 0, sin tocar el sistema**: MDS armado a mano (hecho y
   ensayado el 09-10) → cargado en producción en una empresa nueva →
   revisión de Felipe → Mokka y Neuralis → se mide costo y demora del
   modelo con los mismos documentos.
1. Motor: carga de documentos + agente + borrador guardado.
2. Pantalla de revisión en el alta + "Crear" con un clic (usa el
   cargador del sprint 0).
3. Precios transversales: productos base y precio del medio entre
   empresas, con el rango creíble.
4. Pulido: dudas, volver a procesar, topes de costo por empresa.
