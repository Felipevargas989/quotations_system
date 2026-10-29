# 17 — Módulo de Oportunidades (licitaciones y compras ágiles)

> **Estado: en producción desde el 17-10-2026 (PR #144).** Conversado
> con Felipe el 16-10-2026 y escrito el mismo día. Construido en la rama
> `feature/oportunidades-radar` y probado en el laboratorio el 17-10; ese
> mismo día Felipe: *"apaga el bot de mercado público, pasemos esto a
> producción"*. Las migraciones 122 a 127 y 129 se aplicaron en la base de
> producción antes del motor, y el bot de GitHub quedó sin horario. El
> sprint 4 (cotización) sigue en otro chat. Lo construido la noche del
> 19-10 (decisiones 29 a 31: la cotización de la postulación, «Seguir»
> una licitación y la bandeja con un color por significado) está en
> producción desde la mañana del 19-10 (PR #166; migraciones 144 y 145
> en las dos bases, antes del motor). Su mapa es
> `mapa/24_OPORTUNIDADES.md`. Si una sesión futura recuerda algo distinto,
> **manda este documento**; si la conversación cambia una decisión, se
> corrige aquí en el mismo movimiento.

## 1. Por qué

Valle del Sol tiene desde el 29-05-2026 un bot en GitHub
(`valledelsol-automation`, `run_compra_agil.py`) que revisa Mercado Público y
manda un correo con las oportunidades. Felipe, 16-10: *"no ha funcionado nada
los correos con los avisos... hay licitaciones grandes que no han aparecido y
otras que son irrelevantes"*.

Lo medido ese día:

- **Se escaparon las grandes de Quillón.** "Producción de evento Día del
  Profesor" (4364-13-LE26, $15.960.000) y "Ceremonia y cena Día del
  Funcionario" (1532886-5-LE26, $12.000.000), las dos publicadas el viernes
  9-10 y con cierre el lunes 19-10, **no están** entre las ~560 que el bot
  procesó en sus últimos 30 días. Ese viernes el bot sí revisó más de 30
  licitaciones; estas dos no.
- **Causa de fondo, en palabras de Felipe:** *"nuestro problema no trabajamos
  con una base de datos"*. El bot pide `licitaciones.json?fecha=<hoy>` y lo
  que no aparece en esa lista en ese momento se pierde para siempre. Además
  pesca por palabras **solo en el título**, y su regla "ante la duda, amarillo"
  llena el correo de ruido.
- **Los compradores categorizan mal.** Felipe buscó por su rubro en Mercado
  Público y el Día del Profesor no salía: *"la gente que sube esto lo sube mal.
  No lo sube bien categorizado"*. Por eso la IA tiene que **leer** cada
  licitación, no confiar en la categoría.
- **Casi no hay competencia.** En 2025 las tres recurrentes de Quillón
  tuvieron **una sola oferta** cada una (ver §9).

Lo que se busca: no perder ninguna, separar el ruido con el criterio del
negocio (*¿se puede hacer en el complejo?*) y quitarle a Felipe lo tedioso de
postular: armar la cotización y llenar los documentos.

## 2. Qué miramos antes de diseñar

**Licify** (licify.cl, chileno) y **LicitaLab** son los referentes. Felipe abrió
cuenta en Licify el 16-10 (prueba gratis hasta el 30-10, vinculada a VALLE DEL
SOL QUILLON SPA); se exploró por dentro ese día.

| Lo que hace Licify | Cómo |
|---|---|
| Base con todo | 13.592 oportunidades abiertas en Chile el 16-10; 1.749 en Ñuble y Biobío |
| Filtro | "Líneas de negocio" con hasta 200 palabras clave, en título o descripción. **No es IA:** se le cuela "Banquetas sala de espera" por "banquetería" |
| Ficha | Fechas (preguntas, respuestas, aperturas, adjudicación), productos, criterios con su peso, foro, archivos, indicadores del comprador (% de pago no oportuno, % de irregularidad) |
| Historial de cambios | Por licitación: archivos nuevos (la aclaratoria del Día del Profesor llegó el 15-10), fechas movidas, cambios de estado |
| Competencia | Ofertas recibidas con precio, adjudicación, perfil de cada proveedor |
| Anexos | "Adjuntar Anexos" partió el Word del Día del Profesor en 6 anexos y les puso variables (`{{rut_proveedor}}`, `{{direccion_proveedor}}`…) para llenarlas con los datos de la empresa y firmarlas |
| Lo que deja en blanco | Experiencia (formulario 3), calidad de la propuesta (4) y oferta económica (5) = **70% de la nota** del Día del Profesor |
| Velocidad | Vio el Día del Profesor (publicado 15:54) a las 18:55, y el del Funcionario (13:24) a las 16:30: **~3 horas** |
| Precio | Buscador gratis; alertas y anexos desde 1 UF al mes (plan Equipos) |

**Lo que Eventia tiene y Licify no:** el catálogo de la empresa (paquetes,
menús, salones), sus cotizaciones y su historial de eventos realizados. Con eso
se llenan justo los anexos que deciden la nota y se arma la cotización. Ese es
el diferencial; no tiene sentido construir "otro buscador".

**Cómo lo hace la industria** (Brainial, Tendium, Inventive, AutoRFP; Box con
Claude para generar Word): el botón deja un trabajo en el **servidor**, la IA
lo hace, el resultado queda guardado y una persona revisa antes de enviar. Los
pasos que todos repiten: pasar las bases a texto (con OCR), sacar los
requisitos a un checklist que apunta a la página de las bases, seguir cambios y
aclaraciones, redactar desde la experiencia anterior, revisión humana siempre.

## 3. Decisiones de Felipe (16-10-2026)

1. **Base de datos con ingesta progresiva y filtro con IA.** *"Traer la mayor
   cantidad posible llenando una base de datos de forma progresiva y diaria y
   luego IA genera un filtro avanzado sobre qué interesa"*.
2. **Solo lo nuevo, con su fecha de cierre, y ojo si se reabre.** Acordado:
   "nuevo" quiere decir **"no está en nuestra base"**, nunca "publicado hoy"
   (ese fue el error del bot).
3. **Quién ganó el año anterior, a qué valor y con qué servicios.**
4. **La IA categoriza, filtra y genera los documentos** para subir a Mercado
   Público (*"porque eso también es muy tedioso"*).
5. **Todo dentro de Eventia**, con botones: *"un botón allá pinchar generar
   documento"*. Se conversó hacerlo con Claude en el Mac de Felipe; se decidió
   **el servidor**, como la industria, para que funcione con el Mac apagado, lo
   usen Camila y Recepción y se pueda vender después.
6. **Haiku 5.5 para la lectura diaria** (*"para lectura yo creo que Haiku 5.5
   está bien"*). Opus 5.5 para generar cotizaciones y documentos.
   **Afinada el 17-10** (*"los más caros donde se necesiten y los más
   baratos donde sea necesario"*):
   - Opus 5.5 analiza las bases, valida y escribe la propuesta técnica;
   - Sonnet 5.5 llena los anexos;
   - Haiku 5.5 pone la firma.
7. **La llave de Anthropic va en Railway.** Creada por Felipe el 16-10
   (`eventia-motor`, ver `00_DOCUMENTACION/01_CLAVES.md` §5 en la carpeta
   maestra). Variable `ANTHROPIC_API_KEY` de `api-rest-pruebas`, aplicada
   por Felipe el mismo 16-10 (el redespliegue del laboratorio terminó bien).
8. **"Generar cotización" entra al módulo.** Es el mismo botón diseñado en
   `16_PROPUESTAS_DE_COTIZACION.md` §6, que estaba en pausa.
9. **"Grande" es el monto de alto valor de la empresa**, el que ya existe en
   Configuración de empresa (`companies.high_value_threshold`): *"usemos la
   misma definición que está en la configuración de empresa así queda
   variable"*. Valle del Sol: $3.000.000 (medido el 16-10).
10. **Los avisos van al correo de la empresa** (`companies.notifications.replyTo`):
    Valle del Sol, contacto@valledelsolquillon.cl (medido el 16-10).
11. **Las regiones se configuran en el módulo**, por empresa: *"eso debería
    ser configurable en el módulo de Eventia"*. Lo mismo las comunas
    cercanas (§5.7).

Decisiones del 17-10-2026 (respuestas de Felipe a lo pendiente):

12. **Todo Chile** en la base, no solo las regiones configuradas (§5.1).
13. **`mp_procesos` fuera del respaldo diario de Eventia** (riesgo 9).
14. **Solo administradores**: Felipe y Camila (perfil administrador).
15. **Sin resumen por correo**: *"ya no se necesita el resumen, se revisa
    en Eventia"*. El aviso inmediato de comuna cercana y alto valor queda
    por confirmar.
16. **Directo al laboratorio, sin otro mockup**: *"terminado esto, anda
    directo al sprint 2"*. La base de la pantalla es el mockup del 16-10.
17. **Sin avisos por correo, tampoco el inmediato** (17-10): *"no, sin
    correo, revisaré la app diario"*. La comuna cercana y el alto valor se
    ven en el bloque **Prioridad** de la bandeja y en "Se viene".
18. **El horario del radar** (17-10): *"nada se mueve después de las 18:00,
    sistema público"*. Cuatro pasadas de día, en horario de oficina (09, 12,
    15 y 18 h), y tres de noche (23, 02 y 05 h) que además cargan la
    historia de 3 años; todo en hora de Chile. Antes era cada 2 horas. La API
    de Mercado Público limita por consultas (10.000 al día por ticket, de a
    una), no por volumen: una pasada sin novedades gasta unas pocas.
19. **Las celebraciones son verdes** (17-10): con el Día del Funcionario de
    Quillón y el de Lota en amarillo, *"las dos primeras son definitivamente
    verdes"*. Un comprador público no tiene salón de banquetes: una
    celebración para un grupo que no dice dónde se hace en el recinto del
    oferente. Las capacitaciones sin lugar siguen en amarillo. Cuando
    cambian las reglas, lo abierto que nadie ha tocado se relee solo
    (`LECTURA_ACTUAL` en `leida_con`). Siguiente paso posible, con una semana
    de decisiones juntadas: que aprenda de los «Me interesa» y «Descartar».
20. **Las compras ágiles entran todas de una** (17-10): *"¿las compras ágiles
    están funcionando? no veo ninguna"*. Pedir el detalle de cada una
    tardaba ~20 s: entraron 54 de 750, y cierran en días. Ahora entran todas
    con lo de la lista, primero las que cierran antes, son lo primero de
    cada corrida y la IA las lee al tiro; la descripción y los productos se
    piden cuando alguien abre una. Y cada fila lleva su sello: «Licitación»
    o «Compra ágil» (*"sello compra ágil / sello licitación"*).
21. **La ficha, más clara** (17-10, *"vamos con todas"*, tras ver el boceto):
    el camino de la postulación (desde el 20-10, solo la línea de tiempo
    con el paso que sigue destacado, sin botón ni frase: *"creo que ese
    botón no suma.... saquémoslo"*; *"deja solamente la línea de tiempo,
    a veces menos es más"*); el color
    sigue al análisis de las bases (verde si se puede en el complejo, rojo
    si exigen otro lugar), y el radar ya no lo pisa; el evento en corto y
    los datos con ícono; el estado y el responsable arriba; «Me interesa»
    deja de responsable a quien la marcó si no había nadie; los archivos
    con ícono, nombre legible y la lista plegada cuando ya hay análisis.
22. **La bandeja, ordenada** (18-10, *"vamos con las 5"*, tras el boceto;
    con la bandeja vacía en pantalla: *"¿se podrá mejorar este front?"*):
    los montones como botones con su número, debajo de las pestañas del
    módulo (Por revisar · Descartadas · Historial; lo en estudio y lo
    postulado vive solo en «Mis licitaciones», para no tenerlo en dos
    lados); los filtros en una fila, con el tipo en botones; la lista
    agrupada por cierre (Prioridad, 3 días o menos, esta semana, más
    adelante y, en el historial, lo ya cerrado); la bandeja vacía dice
    «Revisaste todo lo nuevo», a qué hora vuelve a mirar el radar y deja a
    un clic «Mis licitaciones» y las rojas; y arriba, junto a cuándo se
    revisó, la próxima pasada.
23. **Traer todo, y el catering en amarillo** (18-10). Felipe preguntó
    *"¿cómo sé que está trayendo todas las licitaciones que me interesan?"*
    y respondió *"dale con el plan... el catering, tráelo para acá,
    mientras déjalo en amarillo"*.
    - **Las compras ágiles se piden siempre de los últimos 10 días.** La
      pasada de las 18:00 del 17-10 vio 750 y guardó 54, y aun así quedó
      "ok". Pedir "desde la última corrida buena" habría dejado fuera
      para siempre lo publicado entre el 8 y el 15-10 que seguía abierto.
    - **Arriba, «¿Está todo?»**: lo que falta por traer y por leer, y un
      aviso si Mercado Público no respondió o si el radar pasa 6 horas sin
      una pasada buena.
    - **Lo que la descripción de la empresa marca POR EVALUAR va
      amarillo**, aunque se haga fuera. Para Valle del Sol es el catering,
      el coffee break, el cóctel o la banquetería en las dependencias del
      comprador. El suministro diario de colaciones, la comida a domicilio
      y el delivery siguen en rojo.
    - Lo que nadie ha tocado se relee con las reglas nuevas.
24. **Los formularios del comprador, dos caminos** (18-10). Felipe:
    *"si bien en Word se rellena, si bien escaneado en PDF se reconvierte...
    y dejamos un protocolo más robusto cuando se reconvierta, cosa de que
    mantenga la originalidad del documento"*.
    - **Word**: se llena el mismo archivo del comprador. El .doc antiguo lo
      convierte el taller; antes había que guardarlo a mano como .docx
      (Lota y Yumbel los traían así).
    - **PDF**, sea separado, escaneado o al final de las bases: se
      **reescribe** cada formulario en un Word nuevo. Lleva el texto
      oficial al pie de la letra, las mismas tablas, títulos y sombreados,
      tipografía parecida y el logo del organismo recortado en el mismo
      lugar, sin firmas, timbres ni rúbricas. Va un Word por formulario, y
      la IA lo compara con el original antes de entregar.
    - Lo hace Opus, que mira el PDF página por página. Llenar encima del
      PDF se descartó: en el Día del Profesor los formularios venían
      escaneados y mezclados con el decreto, bajo las firmas del alcalde.
    - La pantalla dice qué le pasa a cada formulario. Los PDF se marcan a
      mano, porque casi siempre son las bases. Si «Mi empresa» no tiene
      razón social o RUT, se avisa antes de apretar.
25. **El filtro, afinado** (18-10 en la noche). Felipe, con 87 amarillas: *"quiero afinar el ojo del filtro... antes de cambiar nada analicemos qué pasó"*; y después: *"corramos a, b, c y d y dejemos mejor entrenado a ese agente"*. El análisis encontró tres causas: 66 compras ágiles leídas sin descripción, 27 caterings «por evaluar» (22 de menos de $1 millón) y unas 35 lecturas que confundían vender el curso o el show con vender el lugar. Lo decidido:
    - **B. Cursos y talleres:** si se compra el curso, el relator o el monitor, rojo. Siguen si piden salón, alimentación o alojamiento.
    - **C. Eventos públicos del comprador** (ferias, festivales, shows, fondas, teletón): se hacen en su comuna, rojo, salvo que pidan un recinto del oferente. Los de un grupo cerrado (autocuidado, recreativas) siguen la regla de las celebraciones.
    - **D. El catering «por evaluar», solo desde $1.000.000.** Felipe: *"las comunas que rodean a Quillón son potencialmente visitantes"*: eso ya lo cubre la regla fija de que una comuna cercana del rubro nunca queda en rojo.
    - Las instrucciones llevan cinco ejemplos reales.
    - **A. Compras ágiles sin descripción:** se les pide el detalle y se releen. Queda para la mañana del 19-10.
    - Felipe: *"igual hay que monitorear: algunas están mal ingresadas y vienen a nuestros salones"*. Eso entra en la ronda semanal (parte 2 del plan).
26. **Los formularios los encuentra el análisis, y la A** (18-10 cerca de la medianoche). Felipe: *"¿no conviene que cuando la IA analice los documentos identifique dónde están los formularios a rellenar... y deje listo el proceso de generación de documentos y anexos?"*, y *"vamos con eso y no se te olvide el cambio chico"*.
    - **El análisis de bases** devuelve `formularios`: el nombre de cada uno, el archivo y las páginas donde viene el formato EN BLANCO, si aplica a la empresa (no el de UTP ni el de persona natural) y en qué parte de la oferta se entrega. Si un formulario no vino en lo subido, queda con archivo vacío y la pantalla dice que hay que buscarlo en Mercado Público.
    - **«Generar anexos» parte de eso:** sin elegir, van los Word y los PDF donde el análisis encontró formularios que aplican, y la IA sabe en qué página está cada uno. Sin análisis nuevo, se marcaban a mano (hasta el 19-10: ver la 27). Los análisis anteriores se renuevan con «Volver a analizar».
    - **La A:** a las compras ágiles que quedan en amarillo sin descripción, el radar les pide el detalle y las relee: de a una, hasta 40 por pasada y 20 minutos, primero las que cierran antes. Si Mercado Público no trae el detalle, no se vuelve a pedir en un día.
    - **El cambio chico:** «¿Está todo?» muestra cada parte según su último intento. Ya no queda pegado un aviso viejo por una pasada que se cayó después.
27. **Sin casillas: los archivos los elige el motor** (19-10, con la ficha del Día del Profesor). Felipe: *"el detalle de los documentos a generar está bueno... pero que me traiga los PDF y me los marque, creo que eso es lo innecesario"*, y *"vamos dale"*.
    - «Anexos del comprador» muestra la lista de formularios del análisis (con su archivo, página y parte de la oferta) y una línea con lo que se llena. Ya no lista los archivos ni tiene casillas.
    - El motor elige con la misma regla de antes: los Word de «Bases y anexos» y los PDF donde el análisis encontró formularios que aplican.
    - Sin análisis, o con uno anterior al 18-10: se llenan los Word y se pide analizar para encontrar los formularios en PDF. Si solo hay PDF, el botón espera el análisis.
    - Un formulario que no vino en lo subido: se busca en Mercado Público, se sube a «Bases y anexos» y se vuelve a analizar.
28. **La gran descarga de la historia** (19-10, de madrugada). Felipe: *"todavía no tenemos la historia, todavía no tenemos quién ganó los años pasados... mañana tengo que postular esta licitación"* y *"hagamos una gran carga esta noche y después sigamos con el flujo regular"*.
    - Medido: la historia iba en 3 días de 1.096. No por la IA (el filtro de nombres ya era Haiku y todo el radar había costado US$ 0,36), sino por Mercado Público: una consulta a la vez, 10.000 al día, y las descargas grandes de 22:00 a 07:00. Además solo usaba lo que le sobraba de cada pasada de noche (130 minutos desde que partía) y dos noches se cayeron por los errores de los incidentes 74 y 75.
    - **La noche completa:** cada pasada de noche carga historia hasta 10 minutos antes de la siguiente, y la de las 05 hasta las 06:55 (nunca más de 2 h 45 desde que partió).
    - **Solo las unidades de compra de las regiones configuradas:** el código empieza con la unidad (4364 = Municipalidad de Quillón) y su región ya se conoce por lo guardado (1.737 unidades, el 97 % en una sola región). Las de otras regiones no se leen ni se pide su detalle; las desconocidas sí. En los días del 14 al 16-10, el 12 % era de Ñuble o Biobío.
    - **Primero el año anterior:** el mes a cada lado de "hace un año", después los últimos 60 días y al final el resto.
    - Pasar a 2 pasadas al día no bajaba los tokens (cada licitación se lee una vez; una pasada normal cuesta cerca de 1 centavo de dólar) y atrasaba lo nuevo: se queda el horario de la decisión 18.
    - Modelos: se revisaron con Felipe. Se queda Opus en el análisis de bases (pocas, críticas, PDF escaneados); Sonnet ahorraría unos US$ 0,19 por análisis.
    - Cuando no quedan días pendientes, la historia no hace nada: el curso normal sigue solo.
29. **La propuesta técnica y la cotización son lo mismo** (19-10, decidido; construido esa noche y en producción desde el 19-10, PR #166; sprint C de la hoja de ruta, §7). Felipe propuso un aviso de *"cumplimiento de presupuesto"*: antes de postular tiene que saber, solo para él, cuánto se aleja el presupuesto de la licitación de lo que vale con su catálogo (*"un 30 % más barato, un 40 % más barato, y así yo puedo jugar con un rango de tolerancia"*). Y la postulación queda unida a una cotización de Eventia para el seguimiento: una nueva, o una que ya existe porque el comprador pidió precio antes (*"a veces me cotizan a mí y luego se crea la licitación, y muchas veces no es así"*).
    - La cotización **no se arma aparte**. Felipe: *"lo que traigo del catálogo es lo que debe vaciarse en la nueva cotización o en la cotización que se vincula, porque tienen que ser equivalentes... lo que estoy ofreciendo a las municipalidades como licitación es lo que tiene que tener la cotización"*.
    - Por eso la propuesta técnica deja, además del Word, la **lista de ítems del catálogo con sus cantidades** que ofrece. Esa misma lista llena la cotización: una nueva o la vinculada. Los precios son los del catálogo (regla de la casa del 14-10).
    - **Vincular = solo el número, y se reescribe todo** (19-10). Felipe: *"quizás se va a tener que vincular solamente el número y reescribir todo, que es lo más simple, con la propuesta técnica que se presente en la postulación... creo que eso es lo correcto"*. Al vincular una cotización que ya existe, sus ítems se reemplazan por los de la propuesta técnica: no se comparan uno a uno. Antes de reemplazar se pregunta (*"tiene N ítems: se reemplazan por los de la propuesta técnica"*) y lo que tenía queda anotado en su bitácora, porque nada se borra.
    - **Por decidir:** propuesto que una cotización aceptada (ya es un evento) no se pueda vincular, para no reescribir un evento confirmado.
    - **«¿Calza el precio?»**, arriba de «Mi postulación»: el presupuesto de la licitación, el total de la cotización con los precios del catálogo, lo que cobró el ganador del año anterior y **la oferta**. La oferta parte con el total de la cotización; el anexo económico la toma.
    - **El margen no se configura: es aritmética** (decidido el 19-10). Felipe: *"el margen será un resultado entre nuestros costos y el valor que pongamos en la licitación... si existe diferencia de precio respecto a lo ofertado se ajusta como un descuento en dinero, así cuadramos al peso"*. La cotización lleva los precios del catálogo. Si la oferta es menor, la diferencia entra como **descuento en dinero** de la cotización, y la cotización cuadra al peso con lo ofertado. El panel muestra ese descuento en pesos y en %.
    - **Construido la noche del 19-10** (sprint C; probado en el laboratorio y en producción desde el 19-10):
      - La propuesta técnica ve el catálogo con ids, el mismo texto de «✨ Crear con IA» (`catalogoComoTexto`). En su `informe.json` deja la oferta: cajas y fijos con la forma de `PlanDeLaIA`, en `generacion/oferta-de-la-propuesta.ts`. Si el catálogo no se puede leer, sale con la carta de antes y sin oferta.
      - «Crear cotización» arma la cotización con esa oferta (`armarFoto` + `computeMoney`). El cliente es el comprador: el parecido que ya existe, o uno nuevo con el tipo de los públicos. La fecha y las personas salen de las bases. Queda en solicitada y vinculada en `oportunidades.quotation_id`.
      - «Vincular» recibe el número y reescribe la cotización entera; lo que tenía va a su bitácora. «Aplicar oferta» deja el descuento en dinero.
      - En pantalla, `CotizacionDeLaPostulacion.tsx` va arriba de «Mi postulación», y el anexo económico parte con el total de la cotización.
      - Las propuestas creadas antes del 19-10 no traen oferta: hay que volver a crearlas.
      - Sin migraciones.
30. **Seguir una licitación** (19-10, aprobado; construido esa noche y en producción desde el 19-10, PR #166; sprints D y E de la hoja de ruta, §7). Felipe quiere seguir licitaciones que no va a postular: quién ganó, cuándo, si quedó desierta, en qué condiciones y qué ofreció cada uno. El ejemplo es la gira de estudio: *"yo no la voy a postular porque no realizo giras de estudio, pero a lo mejor me interesa saber quién se la ganó... para incluirme dentro de los servicios de ese tour operador"*.
    - **El caso de negocio:** el radar marca en rojo lo que la empresa no vende directo (giras, cursos, producción de eventos públicos), pero quien lo gana necesita alojamiento, comida o un salón. Es un canal para venderle al ganador. Los precios de los ganadores alimentan además «¿Calza el precio?».
    - **La bandeja:** se va el botón «Ver resumen»; al pinchar la fila se abre el resumen, con «Me interesa», «Seguir» y «Descartar». Se agrega un montón nuevo, «En seguimiento».
    - **El radar** revisa una vez al día las que se siguen, de cualquier región y color, hasta que se adjudican, quedan desiertas o se revocan.
    - **El acta pública:** la API trae el enlace (`UrlActa`), y la página se abre sin código. Se revisó el 19-10 con la 3997-60-LE26. Trae todas las ofertas por ítem: proveedor, RUT, qué ofreció, a qué precio y si ganó. Los adjuntos de esa página sí tienen código y se arrastran a mano, como las bases.
    - **«Resumen de negocio» con IA**, con un botón: quién ganó, qué incluye (destinos, fechas, personas), qué ofreció cada uno y a qué precio, y qué le sirve a la empresa. Esto último se lee de «Mi empresa»: *"los que deberían estar siempre resumidos en Mi empresa, así se mantiene escalable"*.
    - **Decidido el 19-10:** la descripción de lo que vende la empresa pasa de Configuración a «Mi empresa». Felipe: *"sí, correcto, dejemos eso ahí"*. Es una sola: la lee el radar y la lee el resumen de negocio.
    - **Parte 1 construida la noche del 19-10** (sprint D, migración 144; probado en el laboratorio y en producción desde el 19-10):
      - el estado 'seguida' y la columna `mp_procesos.acta`;
      - el montón «En seguimiento», que muestra todo el semáforo;
      - en el resumen, «Seguir» y «Dejar de seguir»;
      - la fila sin «Ver resumen»;
      - el radar, que revisa las seguidas con las adjudicaciones y lee el acta (`historia/acta.ts`);
      - en la ficha, «Quién ganó, según el acta».
      Las razones de la prioridad quedaron en violeta también en el resumen y en la ficha (decisión 31).
    - **Parte 2 construida la noche del 19-10** (sprint E, migración 145; probado en el laboratorio y en producción desde el 19-10):
      - lo que vende la empresa se escribe en «Mi empresa» y Configuración remite allá; es la misma `perfil`, que lee el radar. Desde el 19-10 a mediodía va dentro de «Datos como oferente», justo después de Instalaciones, y se guarda con el mismo «Guardar datos» (Felipe: *"lo que vende tu empresa debería estar en instalaciones"*): las tres descripciones que lee la IA quedan juntas;
      - en la ficha de una seguida, o con acta, el botón «Hacer resumen de negocio»: Sonnet 5.5 lee lo publicado, el acta y lo subido, y lo cruza con «Mi empresa» (quién ganó, qué incluye, qué ofreció cada uno, para tu empresa, siguientes pasos).
      Sonnet y no Opus: no decide una postulación y cuesta la mitad.
31. **La bandeja, un color por significado** (19-10; construido esa noche y en producción desde el 19-10, PR #166; sprint B de la hoja de ruta, §7). Felipe, con la bandeja a la vista: *"el amarillo de los prioritarios se mezcla con el amarillo del semáforo y hace confuso saber cuál es más importante... quizás las verdes con un fondo verde pálido, las amarillas un amarillo pálido, y las prioritarias separadas por tablas"*.
    - Se le mostraron dos bocetos el 19-10:
      - **A, su idea:** la fila entera teñida por el semáforo y la prioridad separada por secciones.
      - **B, la propuesta:** la misma tinta con una franja del color a la izquierda. La prioridad va en violeta con estrella, en su propio recuadro y con sus razones («Comuna cercana», «Alto valor») en violeta. La urgencia («cierra en 11 h») va con un reloj, sin rojo. Así verde, amarillo y rojo solo significan el semáforo, y violeta solo significa prioridad.
    - **Decidido el 19-10: B.** Felipe: *"me gusta tu propuesta, vamos con la B"*.
    - **Construido la noche del 19-10** (sprint B; probado en el laboratorio y en producción desde el 19-10): `coloresDeLaBandeja.ts` y la fila aparte, en `FilaDeOportunidad.tsx`. Cada grupo de la lista va en su recuadro. Al probarlo apareció un detalle: la línea gris entre filas (`divide-y`) le ganaba a la franja desde la segunda fila; ahora cada fila lleva su propia línea abajo.
32. **Más es menos: la propuesta responde solo lo que piden las bases** (19-10, decidido y construido el mismo día). Felipe, al ver la primera propuesta técnica del Funcionario de Quillón (76 pendientes y secciones de contingencias y compromisos): *"muchas veces en estas licitaciones más es menos. Solamente hay que responder lo que preguntan de forma estricta, más que extenderse en las declaraciones, porque nos compromete"*. Las bases le dan la razón: la calidad de la oferta da 100 puntos si el Anexo N°4 está «en estricta sujeción a las bases técnicas», o queda fuera de bases (no suma nada agregar), y lo ofertado que no se entrega se multa por hecho y por unidad (8 UTM más 0,5 UTM por unidad; 30 UTM si falta un número artístico).
    - **La estructura es la de las bases:** las filas del formulario de calidad de la oferta (o las especificaciones técnicas en su orden), una o dos líneas por especificación con sus mismas cantidades. Sin secciones propias (presentación, entendimiento del servicio, programa, montaje, personal, accesibilidad, contingencias, compromisos, experiencia, visita técnica, tablas resumen), salvo que las bases o la pauta las pidan. Sin ofrecer de más: ni más cantidad, ni libre consumo, ni alternativas, ni marcas, ni horarios. Si las bases dan a elegir, una sola opción.
    - **Lo subcontratado, tal cual lo dicen las bases.** Felipe: *"todo lo que tenga que ver con audiovisual, cristalería y esas cosas, que coloque exactamente lo que piden las bases, porque esos son servicios que se subcontratan, siempre que quede ahí establecido"*. Audiovisual, escenarios y estructuras, mobiliario, mantelería, cristalería, vajilla, decoración, flores, fotografía, música, animación, shows, DJ y generador se ofrecen con las cantidades y características de las bases, como un servicio más de la empresa: sin [POR CONFIRMAR], sin nombres de proveedores y **sin decir que se subcontrata** (Felipe: *"tampoco se hace una mención a que va a ser subcontratado, porque no es interés de la municipalidad saberlo"*). Eso es interno: va solo en «Lo que te toca completar», nunca dentro del Word. Lo que las bases dejan para que lo defina el oferente (la temática de un show) queda como [COMPLETAR]. Todo lo subcontratado se anota en pendientes («Subcontratar y cotizar: …»), porque si no está en la cotización, «¿Calza el precio?» muestra un margen que no existe.
    - **La experiencia, la justa:** en el anexo de experiencia van solo las contrataciones necesarias para el puntaje máximo de la pauta más una o dos de reserva (en el Funcionario, 6 o más dan 100 puntos), porque cada una necesita su orden de compra o factura.
    - Construido en `generacion/instrucciones.ts` (`SOLO_LO_QUE_PIDEN`, `LO_SUBCONTRATADO`), para la propuesta técnica y para los anexos de la oferta técnica. Lo que produce la empresa (comida, bebidas, salones) sigue la regla de antes: lo que tiene se ofrece con su nombre real y lo que no, sale [POR CONFIRMAR].
33. **Una sola oferta: la cotización, y los documentos salen de ella** (19-10, aprobado). Felipe: *"busca una forma que sea escalable... quizás vincular a la cotización y que ambos lean la cotización"*, y después *"ok, hagamos eso"*. El problema: el agente de los anexos y el de la propuesta técnica escribían por separado (el de los anexos no lee la propuesta), así que podían contradecirse (uno ofrece plateada y el otro salmón), y el anexo económico no tenía de dónde sacar el desglose por línea que piden algunos formularios.
    - **La oferta se arma una vez.** La IA crea la cotización vinculada desde el análisis y el catálogo, y cada línea queda marcada con la especificación de las bases que cubre (la matriz de cumplimiento). Lo subcontratado que no está en el catálogo se pide para agregarlo una vez, con su precio: precios nunca a dedo.
    - **La empresa la revisa** en el cotizador de siempre y fija el monto con «Aplicar oferta».
    - **La propuesta técnica y los anexos se generan juntos desde esa cotización**: misma comida, mismos servicios, mismas cantidades y mismo monto. El anexo económico lleva su desglose por línea, calculado por Eventia: el motor suma; la IA solo dice qué línea de la cotización va en qué fila del formulario.
    - **Formato propio:** si el formulario de calidad lo acepta (lo detecta el análisis), dice «Se adjunta propuesta técnica en formato propio» y lleva encabezado y firma. Si no lo acepta, se llena con las mismas líneas de la propuesta.
    - **Desactualizado:** si la cotización cambia después de generar, los documentos quedan marcados así hasta volver a generarlos. Eso vale **solo antes de postular**.
    - **Al postular, se congela** (Felipe, 19-10: *"si una oferta es aceptada en Mercado Público ya no se modifica: se debe cumplir el contrato tal cual se postuló"*). Cuando la licitación pasa a «Postulada», la cotización y los documentos quedan fijos, tal como se subieron. Si pasa a «Ganada», esa cotización es el contrato: no se modifica.
    - Opus decide una sola vez (armar la oferta); los documentos los escribe Sonnet, que cuesta la mitad.
    - **Armar la oferta, construido el 19-10 en la tarde** (sprint G; migración 151, que suma 'oferta' a los tipos de `oportunidad_generacion`): «La oferta», arriba de «Mi postulación», con «Armar la oferta con IA» (Opus, con las bases adjuntas, el catálogo con ids, las instalaciones y lo que vende la empresa). Muestra la matriz «lo que piden → lo que ofreces», con su origen (catálogo, agregar al catálogo, por definir), y lo que falta en el catálogo. «Crear cotización» toma la oferta más nueva. Los documentos todavía no leen la cotización: es el sprint H.
    - **La fuente es lo postulado** (Felipe, 19-10: *"se deberían generar siempre desde el módulo de oportunidades... al vincularla con una existente, se debe homogenizar a lo postulado; en caso de crear una nueva, traer todo desde lo postulado"*). La oferta armada en Oportunidades manda. La cotización es su copia: «Crear cotización» la saca de ahí y «Vincular N°» reescribe la existente igual a lo postulado. Lo que alguien cambie a mano en el cotizador no llega a los documentos.
    - **Documentos desde lo postulado, construido el 19-10 en la tarde** (sprint H, sin migración): la propuesta técnica y los anexos reciben LO POSTULADO (`LoPostuladoService`, `postulacion/la-oferta-en-texto.ts`): la matriz «lo que piden → lo que se ofrece» y sus productos con los nombres del catálogo, sin precios. La regla `ESCRIBIR_LA_OFERTA` les dice que lo escriban tal cual, sin decidir nada. Con lo postulado, la propuesta ya no lee el catálogo ni la revisión, no devuelve una oferta y la escribe Sonnet. Sin oferta armada, todo sigue como antes.
    - **Sprint I, primera parte, construida el 19-10 en la tarde** (sin migración):
      - **Al postular, se congela.** `postulacion/congelada.ts`: con la licitación «Postulada» o «Ganada», el motor rechaza armar la oferta, crear o vincular la cotización, aplicar la oferta y generar o firmar documentos, y lo dice en palabras. «Mi postulación» muestra el aviso y apaga «Armar la oferta».
      - **Formato propio.** Con lo postulado, el formulario de calidad que permite formato propio dice «Se adjunta propuesta técnica en formato propio», con su encabezado y su firma (`FORMATO_PROPIO`). La IA lo reconoce en el texto del formulario.
      - **Desactualizado.** En «Crear documentos con IA», un anexo o una propuesta hechos antes de la última oferta armada se marcan para volver a generarlos.
      - **Segunda parte, «Descargar para Mercado Público», construida el 19-10 en la tarde** (sin migración): ver la decisión 34.
    - **Pendiente del H:** el desglose por línea del anexo económico, calculado por Eventia. Necesita que lo que se subcontrata esté en el catálogo con su precio; mientras, el anexo lleva el total, el neto y el IVA del motor.
34. **Los respaldos de experiencia y el set para Mercado Público** (19-10, aprobado). Felipe, mientras bajaba las órdenes de compra de su experiencia: *"quizás debería existir el tipo de documento respaldo de experiencia, que puede ser una factura o la orden de compra... y al momento de generar el set de documentos que tengo que subir al mercado público, debería descargarse y adjuntarse estos mismos documentos"*.
    - **Tipo nuevo en «Mi empresa → Documentos»: Respaldo de experiencia** (orden de compra o factura), con mandante, nombre del contrato, año, monto y número de la orden o la factura. Con el número de una orden de compra, Eventia completa lo demás desde su ficha pública de Mercado Público, que se abre sin código, como el acta. No vence.
    - **El anexo de experiencia se llena con esos respaldos**: los más parecidos a lo que se licita, hasta el puntaje máximo de la pauta más uno o dos de reserva, y van sus PDF.
    - **«Descargar para Mercado Público»** en «Mi postulación»: un ZIP con carpetas como las pide el portal (administrativa, técnica, económica), con los anexos firmados, la propuesta técnica, los documentos de la empresa que piden las bases y los respaldos de la experiencia declarada. Antes de bajarlo, la lista de lo que falta.
    - **La parte del respaldo, construida el 19-10 en la tarde** (sprint F; migración 150, que deja libres del 146 al 149 para la otra conversación): el tipo «Respaldo de experiencia» en la carpeta con sus datos (`oportunidades_documentos.datos`), «Completar desde Mercado Público» con el número de la orden (`GET oferente/orden-de-compra/:codigo`, `oferente/orden-de-compra.ts`) y el anexo de experiencia que los usa primero, con su número y su archivo. El ZIP para Mercado Público es del sprint I.
    - **El set, construido el 19-10 en la tarde** (sprint I, segunda parte, sin migración; `postulacion/el-set.ts`, `el-set.service.ts` y `zip.ts`; en la pantalla, «Para subir a Mercado Público» debajo de «Mi postulación»). Lo arma el motor **sin IA**, con lo que ya está, para que salga igual cada vez:
      - **Tres carpetas, como las partes del portal**: «1. Administrativa», «2. Técnica» y «3. Económica». Cada anexo va a la que dicen las bases (el análisis anota dónde se entrega cada formulario); un Word del comprador que trae formularios de dos partes va en las dos.
      - **De los anexos, la última versión y firmada si se firmó.** La propuesta técnica, la más nueva, en la técnica. Lo subido a mano a «Mi postulación», todo.
      - **De «Mi empresa», solo lo que piden las bases** (más es menos): patente, inicio de actividades, programa de integridad, F30, vigencia, resolución sanitaria o declaración jurada de trabajadores, si un requisito los nombra. No va si las bases traen su formato como formulario o si ya se subió a mano.
      - **Los respaldos de la experiencia declarada**: los de la carpeta cuyo número aparece en los anexos o la propuesta, juntos en «Respaldos de experiencia».
      - **Antes de bajar, lo que falta**: formularios sin llenar, lo que va sin firma, lo hecho antes de la última oferta, la propuesta si la piden y no está, documentos que piden y no están o están vencidos al cierre, y los respaldos si piden experiencia.
      - El ZIP se arma sin librerías nuevas, con lo que trae el motor (nombres con tildes en UTF-8, hora de Chile; probado con el descompresor de Mac). Tope: 150 MB. Si un archivo no baja, el resto sale igual y queda anotado adentro.
    - **Se leen solos** (19-10 en la tarde; Felipe: *"¿podría ser que yo suba el documento, que se lea automáticamente y que rellene los campos que faltan?"*): se arrastran varias órdenes de compra o facturas a la vez y Haiku lee cada una (unos US$0,002 por documento); si es de Mercado Público, su ficha pública confirma los datos. Se revisa la lista y se guarda; nada se guarda sin revisar (`POST oferente/respaldos/leer`, `RespaldosEnLote`).
    - El 19-10 se encontraron así las 27 órdenes de compra de Valle del Sol de 2023 y 2024 (`02_RESPALDOS/ordenes_de_compra_vds_2023_2024.json`, fuera del repo). Entre ellas, el Día del Funcionario 2023 de Quillón (4352-103-SE23, que Valle del Sol ganó) y el de Florida 2024 (3567-636-SE24).
35. **«Armar postulación»: un solo botón, y la cotización de la licitación de solo lectura** (la parte de «solo lectura» la cambió la decisión 69, el 22-10: ahora se edita a mano y «Armar postulación» ya no la reescribe sola) (19-10, aprobado: *"exacto y si vinculo también queda solo de lectura... parte"*). Felipe, al revisar el laboratorio: *"dice que se arma una oferta con IA, pero todavía está el crear documentos con IA... son demasiadas opciones"*; y después: *"¿no será suficiente con un solo botón que diga armar postulación y que haga todos los anexos, arme la propuesta técnica, arme la propuesta comercial, que solamente me pida el precio... y que de ahí mismo deje la opción para vincular con la cotización: vincular a tal o crear nueva, y que la que se cree nueva no sea editable?"*.
    - **Un botón, «Armar postulación»**, que pide solo el precio con IVA. Encadena lo que ya existía (`postulacion/armar-postulacion.service.ts`): la oferta (Opus, una vez); **solo si quedó lista**, los anexos con ese precio (la oferta económica: el neto y el IVA los calcula Eventia) y la propuesta técnica si las bases la piden o aceptan formato propio, los dos desde lo postulado. Si ya hay cotización vinculada, se iguala a lo postulado con el mismo precio.
    - En la pantalla, los tres pasos a la vista («Qué ofreces», «Anexos del comprador», «Propuesta técnica» o «Las bases no la piden»), con «Reintentar» en el que falle, con el mismo precio. «Volver a armar» rehace todo.
    - Se van los botones sueltos: «Armar la oferta», «Generar anexos», «Crear propuesta técnica», «Crear cotización», «Aplicar oferta» y «Actualizar con la propuesta». La firma sigue aparte, después de revisar (17-10).
    - **«Vincular con cotización»**: crear una nueva o vincular una por su número. Las dos quedan iguales a lo postulado, con el precio de la postulación, y **de solo lectura** en el cotizador. El motor lo cierra en la puerta ancha (`QuotationsService.update`: no se cambian a mano servicios, montos, personas ni fechas; solo Oportunidades, con `desde: 'postulacion'`); el estado, los pagos y el seguimiento siguen abiertos.
    - Construido la tarde del 19-10 en el laboratorio (sprint J, sin migración). La «propuesta comercial» es el anexo económico de las bases con el precio; si unas bases no traen formulario económico, el precio se escribe en el portal.
36. **Un archivo por formulario, la firma junta y el PDF al firmar** (19-10, aprobado: *"ajústame eso"*). Felipe: *"los documentos tipo formulario tienen que quedar por separado cada uno, el 1, el 2, el 3, el 4, ojalá de una forma ordenada; que la firma no quede sola... si la firma no alcanza a caer en la hoja, tiene que saltarse a la siguiente. Y eso tiene que ser un solo documento tipo PDF, cosa que yo lo pueda descargar y subir"*.
    - **Un Word por formulario**, en el orden del original, también cuando el comprador manda un solo Word con todos (`salidasDeFormularios`: `formulario_<id>_<n>.docx`). El taller llena el Word entero y después lo separa, borrando de cada copia lo que no es de su formulario, para que conserve el formato, el encabezado y los logos. Los que no aplican no se entregan.
    - **La firma, junta** (`FIRMA_JUNTA`): la línea, el nombre, el RUT y el cargo de quien firma van pegados a la última línea de su formulario («conservar con el siguiente» y «conservar líneas juntas»). Si no cabe en la hoja, pasa entera a la siguiente, nunca partida ni sola. Vale para los anexos, la propuesta técnica y la firma.
    - **Al firmar, cada documento queda en PDF**: el taller entrega el Word firmado (el motor solo lo revisa: el mismo texto y una imagen más) y su PDF (LibreOffice), que es lo que se guarda en «Mi postulación» y lo que lleva el ZIP (`salidasDeLaFirma`, `problemaDeLaSalida`). El PDF se guarda solo si su Word pasó la revisión.
    - **«Firmar todos»**: firma de una vez lo último que hizo la IA que no está firmado (hasta 10).
    - En el set para Mercado Público, cada formulario va solo a la parte del portal que le toca; los respaldos se buscan en el texto de su Word.
37. **«Bases y criterios» en dos listas: las exigencias que se marcan y el checklist de documentos** (19-10, pedido por Felipe con su orden y su contenido). Felipe: *"debería ser como un listado de exigencias, así como almuerzo, esto. Y marcar algunos que sean como lo tengo y otro hay que conseguir o revisar. Y quizás con alguna función que yo pueda ir haciendo un check... Y si marco uno que no puedo, bueno, desisto con la postulación"*; y antes: *"un checklist documental para saber si tengo toda la documentación... un cruce de documentación que ya tengo en el sistema y documentación que debo conseguir"*.
    - **El orden de «Bases y criterios»**: el resumen (corto), cómo te evalúan, lo que te deja fuera, los formularios a rellenar, **las exigencias de la licitación**, **los documentos a presentar**, las otras condiciones plegadas, las fechas clave y las garantías. «¿Puedo cumplir?» y la lista mezclada de lo que hay que presentar (que repetía lo que piden las bases) se juntaron en esas dos.
    - **Las exigencias**: lo que hay que cumplir u ofrecer (el almuerzo, la exclusividad del recinto, el show). Cada una con lo que sugiere la IA de «¿Puedo cumplir?» (lo tienes, conseguir o no se puede, con qué o por qué) y dos botones, **✓ Lo tengo** y **✗ No puedo**, que quedan guardados (migración 152, `oportunidades.exigencias_marcadas`). La marca se guarda con el texto de la exigencia sin tildes ni mayúsculas, así sigue a su exigencia si se vuelve a analizar. La base la guarda en un solo paso (`marcar_exigencia`): en el laboratorio, dos clics seguidos se pisaban. Con alguna en «No puedo» aparece **«Desistir de esta licitación»**: la deja en «Descartadas», de donde se puede recuperar; ya postulada, no se ofrece.
    - **Los documentos a presentar**, solo documentos (formularios, patente, inicio de actividades, programa de integridad, constitución, estatutos, DICOM, F30…). El análisis de las bases devuelve el checklist (`documentos`: nombre, parte, cuándo —con la oferta, al adjudicar o al pagar—, si es obligatorio, la vigencia que piden y a qué parte de la carpeta corresponde). La pantalla lo cruza **sin IA** con la carpeta de «Mi empresa» (el vencimiento contra el cierre) y con «Mi postulación»: firmado, en tu carpeta, en tu postulación, falta firmar, lo arma la IA, no aplica (un formulario que el análisis descarta, como el de UTP), vencido o falta; lo de adjudicar y pagar que todavía no está, «Pendiente» en gris. Lo que no es un documento (la vigencia de la oferta por 60 días) va a la generación, no a esta lista.
    - Un análisis anterior no trae el checklist: la pantalla arma uno con los formularios y los requisitos que son documentos, y pide volver a analizar para tener lo de adjudicar y pagar y las vigencias.
    - «Mi postulación» se ordena en la vuelta siguiente (Felipe: *"eso dejémoslo para la siguiente vuelta"*).
38. **El ZIP con una cuarta carpeta, «4. Otros», y lo de UTP que no aplica** (19-10, pedido por Felipe). Felipe, con la carpeta «Para subir» que le armó otro chat para el Día del Profesor: *"separó la postulación por los tres ítems, por administrativos, técnico y económico, y debería haber un cuarto que son otros, que son el e-RUT, la patente, el certificado de no quiebra, el estatuto vigente, el certificado de vigencia, que son los generales de las licitaciones para contratar"*; y del Funcionario: *"el anexo 6 de UTP es solamente si postulo como UTP... en mi caso no es necesario que lo arme"*.
    - **«4. Otros»** en el ZIP para Mercado Público: lo general para contratar (e-RUT, patente, certificado de no quiebra, escritura y estatutos, certificado de vigencia), desde la carpeta de «Mi empresa» o lo subido a mano. Lo que las bases piden en la parte administrativa (la patente, la vigencia) sigue yendo ahí, sin repetirse. Lo que no está en la carpeta se avisa en una línea, solo si las bases lo nombran (Felipe: *"los estatutos parece que no los piden... la escritura tampoco"*).
    - **Tres tipos nuevos en «Mi empresa»**: e-RUT (SII), certificado de no quiebra y escritura de constitución y estatutos. Se suben una vez y sirven para todas las licitaciones.
    - **El F30-1, aparte del F30** (Felipe: *"ya, para F30 y F30-1"*): tipo propio en «Mi empresa». Sirve para el certificado de la Inspección del Trabajo de no tener reclamos laborales que pide el Día del Profesor para cobrar (pág. 12). Lo que el análisis deja como «otro» se reconoce por su nombre y se cruza con la carpeta.
    - **El Registro de Proveedores se da por hecho** (Felipe: *"déjalo como que siempre estará habilitado... es difícil no tener eso"* y *"sácalo de los documentos a entregar, no es necesario"*): no aparece en «Documentos a presentar» y «Validar documentos» lo da siempre por cumplido.
    - **Lo de UTP no aplica**: en «Documentos a presentar», el formulario y la escritura de una Unión Temporal de Proveedores salen «No aplica · solo si postulas como UTP», salvo que se suban a «Mi postulación». Con un análisis nuevo la IA tampoco los arma (el análisis los marca como que no aplican).
39. **«Qué ofreces» pasa a «Lo que tienes que conseguir»** (19-10, pedido por Felipe). Felipe, mirando «Mi postulación» del Día del Profesor: *"eso ya está en el análisis anterior... lo que podría estar es como un mini resumen de qué cosas están comprometidas que no tenemos certeza de si las tenemos. Por ejemplo, comidas particulares, servicios de baile, así como tienes que conseguirte esto y esto... no entiendo que esté acá también este análisis de qué piden"*.
    - Arriba, lo que ofreciste y no está en tu catálogo («Conseguir o subcontratar»: comidas especiales, el show, el escenario…) y lo que queda por definir (la temática de un show), sin los formularios: esos se completan al hacer los anexos.
    - La oferta punto por punto (lo que piden, lo que ofreces y de dónde sale) queda plegada: de ella siguen saliendo la cotización, la propuesta y los anexos.
    - Si la oferta es de antes del último análisis de las bases, lo avisa: hay que volver a armar la postulación. Pasó con el Profesor: la oferta de las 18:12 seguía con el decreto de otra licitación.
40. **El anexo de calidad lleva todo el detalle, sin propuesta técnica aparte** (19-10, pedido por Felipe). En el Día del Profesor, el Formulario N°4 (calidad de la propuesta) salió casi vacío: solo decía «Se adjunta propuesta técnica en formato propio», por la regla de la decisión 33. Felipe: *"la idea es que en ese mismo formulario hubiese puesto todo el detalle de todo lo que piden a nivel de oferta. Y no estar creando otra oferta técnica a partir de otro formato y otro modelo, sino que acá mismo... todo el detalle del coffee, lo que pidan, si es cena, si es desayuno, si es fiesta... exactamente lo que piden las bases técnicas, y si no tienen el detalle completo, poner sencillamente una propuesta en base a lo que tenemos paquetizado o lo que está en el catálogo"*.
    - El formulario de calidad de la oferta (o de oferta técnica, o de propuesta técnica) se llena ahí mismo con todo lo postulado, punto por punto y con su estructura, aunque diga que acepta formato propio. Ya no remite a otro documento.
    - La propuesta técnica aparte solo se arma si las bases la piden y no traen formulario para ella.
    - Al armar la oferta, si las bases no detallan un servicio (dicen solo «almuerzo» o «coffee»), se propone el detalle con el menú o paquete guardado que calce, o con el catálogo.
41. **La comparación de ofertas** (19-10, pedido por Felipe). Felipe: *"en las postuladas quiero una opción que diga cuadro de oferta para poder descargar toda la información que haya subido otro posible competidor y analizar la probabilidad de quién se va a adjudicar la licitación en base a los criterios de evaluación... Es una nueva pestaña después de historial: comparación de ofertas. Cargamos ambas ofertas, la mía va a salir de acá, la otra la descargo y la sumo, y que la IA analice porcentualmente quién cumple mejor según cada parámetro y cada nota según los criterios de evaluación"*.
    - Una pestaña después de «Historial», solo en postuladas, ganadas y perdidas.
    - Tu oferta sale de lo que vas a presentar (lo mismo que va al ZIP, sin los respaldos de experiencia). La de cada competidor se sube ahí, con el nombre del oferente (migración 153: sección `competencia` y `competidor`).
    - Opus 5.5 pone la nota de cada criterio (0 a 100) con su fundamento, dice si cada oferta cumple las bases, la probabilidad de ganar, lo que le suma y le resta, y qué hacer distinto la próxima vez. El puntaje ponderado lo calcula Eventia con los pesos de las bases, no la IA.
42. **Sin formulario técnico, la propuesta técnica valorizada** (19-10, decidido por Felipe). Felipe preguntó: *"¿qué pasa si es una compra ágil y no viene ningún formulario a prerrellenar? ¿Qué va a rellenar la IA?... ¿Cómo lo vamos a hacer para presentar la propuesta técnica valorizada?"*. Entre (a) solo el total y (b) el detalle con precios del catálogo y un descuento que cuadra, eligió: *"vamos con la A, así siempre son todas iguales en presentación"*.
    - Si las bases no traen un formulario técnico (calidad de la oferta, oferta o propuesta técnica), «Armar postulación» hace siempre la propuesta técnica, la pidan o no.
    - La propuesta lleva el detalle de lo postulado y, al final, el valor: una tabla con el neto, el IVA y el total, calculados por Eventia con el precio que pusiste. Nunca precios por ítem, por persona ni unitarios.
    - Con formulario técnico, todo va en ese formulario (decisión 40) y no hay propuesta aparte.
43. **Los contactos para licitar en «Mi empresa», y los respaldos usados no son pendientes** (19-10, pedido por Felipe). En el Día del Profesor, el Formulario N°1 quedó con la dirección, los teléfonos y el correo del representante legal en blanco, y sin el coordinador de la licitación: «Mi empresa» solo tenía su nombre, RUT y cargo. Felipe: *"podríamos incluir los datos del coordinador de la identificación"*. Y el Formulario N°3 pedía «Adjuntar respaldos» con las tres órdenes que sí estaban: *"me está pidiendo órdenes de compra que sí entiendo que están"*.
    - «Mi empresa» suma el correo, el teléfono y la dirección del representante legal, el coordinador de la licitación (nombre, cargo, correo y teléfono) y la página web (migración 154). Si el contacto del representante queda vacío, la IA usa el de la empresa.
    - Los respaldos que la IA usó ya no salen como pendientes: el ZIP para Mercado Público los adjunta solo, por su número. Pendiente queda solo lo que de verdad falta (las filas sin respaldo).
44. **El anexo de experiencia en un solo PDF con sus respaldos** (19-10, pedido por Felipe): *"sería bueno que el anexo de experiencia adjunte los mismos respaldos, sea un solo PDF, un solo documento con los respaldos adjuntos, no tres documentos, para que sea más simple"*.
    - En el ZIP para Mercado Público, el anexo firmado (PDF) lleva detrás cada respaldo que nombra, con todas sus páginas; una foto va en una página tamaño carta.
    - Lo que no se puede pegar (un Word, un PDF cifrado o roto) va aparte, en «Respaldos de experiencia». Si el anexo todavía no está firmado (es Word), los respaldos siguen aparte: hay que firmarlo para que queden en un solo PDF.
    - Lo que sigue (pedido en la misma conversación): si los respaldos son pocos, buscarlos en Eventia, en los eventos parecidos con su factura u orden de compra (decisión 45).
45. **Los respaldos de Post-venta** (19-10, pedido por Felipe): *"En caso de que sea muy pobre los respaldos, podemos buscar en el mismo Eventia y ahí tenemos las facturas y quién fue... Buscar en Eventia y terminar de armar ese archivo con experiencia relevante y los respaldos que o están en Eventia o están en mi empresa"*. En el Día del Profesor, de 17 respaldos solo 3 caían en el período que cuenta; Eventia tenía facturas y órdenes de compra de 2026 subidas a sus eventos. **Desde la 75 (23-10)**, lo de Post-venta va en la misma lista que lo de «Mi empresa», por monto, y no solo si eso no alcanza.
    - **Corregida la misma noche.** La primera versión copiaba esas facturas a «Mi empresa» con un botón «Traer de Eventia». Felipe: *"no entendí eso de traer desde Eventia... ¿debería el motor, a la hora de generar la licitación, evaluar si tiene experiencia suficiente o debe ir a post venta a buscar respaldos? Creo que traer desde Eventia es raro, si estamos en Eventia"*. Quedó así, sin botón y sin copias:
    - Al «Armar postulación», si las bases piden experiencia, el motor lee las facturas y órdenes de compra de los eventos ya hechos (aceptados o realizados, de los últimos 4 años) que no están en «Mi empresa»: **una por evento** (la orden y la factura de un mismo servicio son una sola experiencia; la orden de compra primero, que si es de Mercado Público se confirma con su ficha), con la misma IA de «Leer solo». Si el primer documento no es una orden ni una factura, prueba el siguiente (hasta 3 por evento). Sin repetir un número de «Mi empresa» ni de otro evento; lo que no se puede leer, no va.
    - La IA del anexo los ve aparte, **después** de los de «Mi empresa», y los usa solo si esos no alcanzan para el puntaje máximo, en el período que cuentan las bases. Cada uno dice de qué evento es, y ese evento no se repite en la lista de eventos (sería contar dos veces la misma experiencia).
    - No se copia nada: lo leído queda anotado en el trabajo de los anexos, y el ZIP pega el PDF directo desde el evento (dentro del anexo firmado, decisión 44). Si se reintentan los anexos, van los mismos, sin volver a leer.
46. **El Word se lee en Eventia** (19-10, pedido por Felipe): *"¿tienes algún visor de Word para poder no tener que descargar y abrir un Word, sino que poder verlo ahí mismo, el documento, sin tener que descargar para firmar? Para poder leerlo y firmar"*.
    - «Ver» abre los Word (`.docx`) igual que los PDF: en «Bases y anexos», en «Mi postulación» y en la carpeta de «Mi empresa». Se ven como en Word (tablas, colores, logos). El `.doc` antiguo se sigue descargando.
    - En «Mi postulación», el visor trae «Firmar» (con su confirmación): se lee y se firma sin salir.
    - Un Word de las bases viene de afuera: se dibuja aislado (sus estilos no tocan la página, sin el HTML incrustado y con los enlaces controlados).
    - El visor pasó a la ventana de la casa: Escape cierra y el título queda siempre a la vista.
47. **La página web sale de Configuración de empresa** (19-10, pedido por Felipe: *"página web debería traer la de Eventia o no?"*). La decisión 43 la había agregado a «Mi empresa», repetida: Eventia ya la tiene en Configuración (la de los correos y del formulario público). En «Mi empresa» se muestra junto al nombre de fantasía y los datos bancarios, y se cambia en Configuración; la IA la toma de ahí.
48. **Una sola lista de documentos, la de postular** (19-10, pedido por Felipe, con el pantallazo de «Para el pago»): *"creo que hay que eliminar la facturación y dejar los otros dos como opcionales, así dejamos una sola lista para efectos de la postulación, que es nuestro foco ahora; la factura no es relevante ahora"*. «Documentos a presentar» deja de partirse en «Con la oferta», «Al adjudicar» y «Para el pago»: es una lista, la de postular; lo de adjudicar y pagar (el F30, el F30-1, el DICOM) va al final como «Opcional» y no cuenta, y la factura para cobrar no va.
49. **Volver a armar sin llenarse de documentos** (19-10, pedido por Felipe): *"no necesitamos llenarnos de documentos; si pongo volver a generar está bien que borre todo lo anterior (que no esté firmado); si tengo el 1, 2 y 3 firmados, en este caso debe volver a crear solo 4 y 5, y si yo borro todo, que cree todo de nuevo"*. En el Profesor había 16 archivos de tres vueltas.
    - Lo firmado (o subido a mano) se queda y no se rehace. Excepción: un formulario de la parte económica firmado con otro precio se rehace, para que la oferta no salga con el precio de antes.
    - Los borradores de la IA sin firma se reemplazan: se borran solos, pero recién cuando lo nuevo quedó guardado (si la IA falla, quedan). Nunca se borra un firmado, ni el Word del que salió.
    - Si se borra lo firmado, la próxima vez se vuelve a crear. Con todo firmado no hay nada que rehacer.
    - El ZIP toma, de cada formulario, su versión más nueva aunque venga de otra vuelta.
50. **La firma limpia** (19-10, pedido por Felipe, con el Formulario N°5 firmado a la vista: la foto de la firma traía el papel gris entero): *"hay que mejorar la extracción de la firma: debe quedar solo las líneas, bonitas (capaz hay que suavizarlas) y deben ser azul"*.
    - Al subir la foto en «Mi empresa», el navegador deja solo el trazo: sin el papel (aunque la luz sea despareja), sin manchitas, con el borde suave, en azul y recortado. Se ve cómo queda antes de guardar.
    - «Limpiar la firma guardada» arregla la que ya estaba. Lo ya firmado no cambia: hay que borrar el firmado y volver a firmar.
51. **El formulario de calidad, ordenado** (19-10, pedido por Felipe con el Formulario N°4 del Profesor a la vista: salía todo en negrita): *"en negrita los títulos y sin negrita el escrito... se ve muy mal como está"*. Cada punto lleva su título en negrita (el número y la especificación de las bases, sin la página) y debajo, sin negrita, lo que se ofrece. Felipe: *"no importa que ocupemos este formulario, pero dejemos un orden mínimo"*.
52. **La experiencia que no se rechaza** (19-10, pedido por Felipe): *"dejemos las mejores de los últimos 24 meses y eliminemos el resto para que no sea ninguna rechazada"*. El anexo de experiencia solo usa respaldos de los últimos 24 meses (o del período de las bases, si es más corto), nunca una fila sin su orden de compra o factura, y solo las necesarias para el puntaje máximo más una o dos de reserva. La IA ni siquiera ve los respaldos más viejos; lo de Post-venta se busca en los últimos 24 meses. **Reemplazada por la 75 (23-10)**: el período lo dicen las bases, no 24 meses fijos.
53. **Las 10 de siempre** (19-10, pedido por Felipe; **reemplazada por la 56 el 20-10**): *"como es algo que se ajustará anualmente, dejemos las mejores 10 entre Eventia y Mercado Público y las usamos siempre"*; después *"saca a Joker de la ecuación... busca otro, una de CCU podría ser"*. En «Mi empresa», una estrella por respaldo, hasta 10: el anexo de experiencia lleva siempre esas (salvo una que quede fuera del período que fijen las bases) y no se busca más en Post-venta. Se ajustan una vez al año. Las de Post-venta que van entre las 10 se suben (o se copian) a «Mi empresa»: la factura 260 de CCU (#118), la 373 de ADRA y la 348 de BPM se copiaron así.
54. **Las normas de la casa para llenar el formulario del comprador** (19-10, pedido por Felipe: *"¿cómo podemos aprovechar el formato que ya tenemos de PDF?... quizás solamente hay que rellenar el formulario que te dan, de una forma más ordenada, con ciertas normas estéticas, y en caso de que no te pasen un formulario, tener otro basado en el que tenemos"*). Parte 1 de dos:
    - El formulario del comprador es oficial: su diseño no se toca (bordes, colores, columnas, letra).
    - Lo que se escribe en él sigue las mismas reglas en todas las licitaciones: la letra y el tamaño del formulario, sin negrita (salvo el título de cada punto del formulario de calidad, decisión 51), mayúsculas normales, un dato corto con la alineación de su celda y un texto largo a la izquierda.
    - Formatos fijos: montos como $1.234.567, fechas como 11 de noviembre de 2026 (salvo que el formulario muestre otro), RUT como 77.701.305-K y teléfonos como +56 9 5095 5947.
    - Ningún campo de datos queda vacío: lo que no corresponde dice «No aplica» y lo que falta va como [COMPLETAR]. Notas y páginas de las bases, a pendientes, nunca al documento.
    - Parte 2, por aprobar: la «Propuesta Valle del Sol», un formato propio con el aspecto del PDF de la cotización para cuando no hay formulario (compras ágiles, formato libre). Primero un borrador visual; se programa cuando Felipe lo apruebe.
55. **Los tickets de respaldo de Mercado Público** (20-10, pedido por Felipe: *"creo que está bloqueada la API; yo recuerdo que tenía dos en el bot para esto"*, y *"¿se podría ocupar dos veces al día cada una?"*).
    - Lo que pasaba: desde el 19-10 a las 09:00, Mercado Público no responde las compras ágiles (504 a los 30 segundos, en cada pasada). El 20-10 se probó una consulta con cada uno de los dos tickets de Felipe, aun pidiendo un solo día: los dos fallan igual, y uno contestó «Servicio no disponible, intente nuevamente más tarde». Es su servicio, no un bloqueo por consultas: las licitaciones siguen llegando y, cuando vuelva, el radar trae los últimos 10 días.
    - El cupo de Mercado Público es por ticket y por día (10.000 consultas), no por veces al día. Lo que más gasta es la descarga de la historia, de noche.
    - Desde ahora el motor usa hasta tres tickets, como el bot: `MP_TICKET` y los de respaldo `MP_TICKET_2` y `MP_TICKET_3`, en las variables del motor (los pone Felipe). Un 429 que no es de «peticiones simultáneas», o un ticket que Mercado Público no reconoce, pasa al siguiente al tiro y ahí se queda. Con todos sin cupo, espera como antes y recién ahí es «sin cupo».
    - Un ticket repetido en dos variables cuenta una vez. En el registro cada ticket es su número, nunca su valor.
56. **Los respaldos de mayor a menor monto, y «No usar» en vez de «las 10 de siempre»** (20-10, debatido con Felipe). Reemplaza a la 53. Felipe: *"es algo que la IA debe ir evaluando"*; *"es más fácil la mantención... estar siempre eligiendo cuando envejecen las experiencias requerirá una mantención innecesaria si solo marco lo que no quiero mostrar"*; *"como criterio general deja que siempre coloque lo mejor que tengamos en $$$$ de mayor a menor hasta cumplir con lo que piden las bases"*; *"dale con 2 de reservas"*.
    - En «Mi empresa», cada respaldo tiene «No usar» en vez de la estrella. Lo marcado no lo ve la IA, y de Post-venta tampoco entra otro respaldo de ese mismo cliente (*"saca a Joker de la ecuación"*).
    - En cada licitación, los respaldos del período de las bases (desde la 75; antes, de los últimos 24 meses) van de mayor a menor monto, todos juntos los de «Mi empresa» y los de Post-venta, y la IA los toma en ese orden hasta cumplir lo que pide el puntaje máximo, más 2 de reserva si hay y caben en el formulario. Si las bases ponen condiciones (solo compradores públicos, un monto mínimo, servicios parecidos), esas mandan.
    - Sin piso de monto: lo proporcional sale del orden, porque las chicas solo entran si hacen falta para el puntaje (Felipe: *"deben ser proporcionales a lo que se está licitando"*). Con un piso del 10% de lo licitado, el Profesor habría quedado con 4 respaldos y 30 puntos en vez de 100. El mix público y privado también sale del orden.
    - Si no alcanzan, «Armar postulación» busca en Post-venta (decisión 45) y, si igual faltan, avisa en pendientes cuántas faltan.
    - Las estrellas que quedaron de la 53 ya no cuentan; el motor las saca al marcar o desmarcar «No usar».
57. **Un solo ítem «Subcontratar» y las variaciones al comentario interno** (20-10, pedido por Felipe con «Lo que tienes que conseguir» del Profesor a la vista: nueve cosas sueltas). Felipe: *"toda la licitación será un requerimiento al proveedor... si piden un capacitor o piden un generador, o piden decoración, o piden un artista... siempre va a ser un requerimiento al proveedor y generalmente va a ser un proveedor audiovisual... agrupado en un solo ítem de subcontratar, con el checklist de todas las cosas que se necesita pedir al proveedor externo"*; y *"no puedo hacer un producto por cada variación del principal: si me piden carne con un topping de cilantro, no puedo crearla, sino que un comentario que tiene que ir en los comentarios internos para yo poder hacer seguimiento"*.
    - La oferta separa tres cosas. «Subcontratar»: todo lo que la empresa no tiene y no va a tener, en una sola lista, que es el pedido al proveedor externo, con cantidades y días. «Detalles»: las variaciones de lo que ya vende (el relleno de las empanadas, las galletas del helado, las salsas, lo vegetariano o vegano, las flores), que van con su producto genérico. Y lo que de verdad falta en el catálogo, que casi nunca hay.
    - «Lo que tienes que conseguir» muestra el pedido al proveedor como checklist, los detalles aparte y, si hay, lo que falta. Una oferta de antes se sigue viendo como antes.
    - La cotización de la licitación lleva en su comentario interno los detalles y el pedido al proveedor. Al volver a armar se reemplaza solo ese bloque; lo que la persona escribió se queda.
    - En «Mi postulación», el Word ya firmado no se ve: queda su PDF firmado (Felipe: *"una vez firmados los documentos se debería eliminar o dejar de ver el Word, y dejar solo el PDF firmado"*). Desde la decisión 58, además, se borra.
58. **Se firma y se borra el Word** (20-10, pedido por Felipe). Corrige la decisión 57, que lo dejaba guardado y escondido: *"¿puedo poner yo las normas del sistema? Elimina el Word... se firma y se borra; si se necesita de nuevo se toma el PDF y se convierte en Word, no se pierde jamás la información"*; *"no tiene sentido guardar Word editables de algo que no se volverá a editar jamás en la vida una vez postulado; cada postulación se hace, se sube y muere, el documento es solo historia"*; *"la información permanece, solo cambia el formato"*.
    - Al terminar una firma, el Word de cada firmado (de la IA o subido a mano) se borra, su fila y su archivo. Queda el PDF firmado.
    - Antes de borrarlo, el PDF toma del Word el archivo del comprador y la corrida que lo hizo, y el texto del Word queda guardado en el trabajo de la firma. Así el ZIP sigue poniendo cada formulario en su carpeta, sigue pegando los respaldos dentro del anexo de experiencia y sigue avisando el formulario económico firmado con otro precio; y «Volver a armar» sigue reconociendo lo firmado.
    - Un Word que no se pudo leer no se borra.
    - Los Word firmados antes de este cambio se borran la próxima vez que se firme algo de esa licitación.
    - El avance de «Mis licitaciones» y de la ficha cuenta como «sin firmar» solo el Word de la IA que no tiene su firmado.
59. **El reclamo desde la comparación de ofertas** (20-10, pedido por Felipe). Nació del caso Integra (1072229-25-L125): la ganadora y la más barata eran de la misma gente, y la comisión contó una experiencia mal respaldada sin darse cuenta. Felipe: *"dejemos en el comparativo una función de que en caso de incumplimiento grave, genere un texto para hacer un reclamos en el centro de ayuda"*.
    - La IA marca en cada oferta los **incumplimientos graves**: lo que según las bases o la ley la deja fuera (no lo que solo baja puntaje), con su prueba (archivo y página, o «no está entre lo que presentó») y su regla. Revisa todas con la misma vara, la tuya incluida.
    - Busca **ofertas relacionadas**: la misma persona o empresa en dos ofertas (RUT, cédula, teléfono, correo, dirección, o la misma persona como representante, dueña, socia, encargada o firmante). Va como incumplimiento grave, con la regla de la Ley de Compras (art. 9; reglamento, art. 60). El contacto de un cliente en la experiencia no cuenta.
    - En la oferta de un competidor con algo grave, **«Redactar reclamo»** muestra el texto que arma el motor, sin IA: a quién va, la licitación, cada incumplimiento con su prueba y su regla, y la petición de revisar la oferta y, si corresponde, declararla inadmisible, firmado con los datos de «Mi empresa». Se copia y se pega en el Centro de Ayuda de Mercado Público: Eventia no envía nada.
    - Si algo es porque «no está», antes pregunta si se subió todo lo de ese oferente (el 20-10, con Sol de Quillón, faltaban archivos por subir).
    - Ya adjudicada (ganada, perdida o adjudicada en Mercado Público), no hay reclamo: avisa que queda impugnar ante el Tribunal de Contratación Pública, dentro de 10 días hábiles.
    - Sin migración ni costo aparte: va en la misma comparación. Las comparaciones de antes hay que hacerlas de nuevo.
60. **La base de lo que aprendemos de las comisiones** (20-10, pedido por Felipe). Cuando se le propuso llevar lo visto en las actas al análisis de las bases: *"las bases son las que determinan qué cosas se aceptan o no se aceptan como respaldo... no porque en una licitación particular una comisión, que pudo haberlo hecho bien o mal, tome una determinación, va a marcar un precedente... Lo que necesitamos es entender los criterios, las flexibilidades que tienen estos comités evaluadores... para intentar predecir quién va a ganar, nada más"*. Y: *"las que vayamos licitando, vamos a ver si ganamos o perdemos, ir revisando las actas de adjudicación e ir entrenando la IA para que vaya afinando el ojo"*.
    - **Al postular mandan las bases.** Lo aprendido no toca «Armar postulación» ni el análisis: solo lo lee la «Comparación de ofertas», para las notas y la probabilidad. Lo que cumple las bases y lo grave (el reclamo, decisión 59) siguen yendo por las bases. Una comisión que se salta las bases no es precedente: queda anotada para predecir y para reclamar.
    - **La base** (migración 155, `oportunidades_aprendizajes`): cada fila es una decisión de una comisión ante una falta, una omisión o una duda (qué pasó y qué decidió), de qué licitación y unidad de compra salió y cómo se portó: estricta, flexible o contra las bases. Parte con los 43 casos estudiados el 20-10 (el DAEM y la Oficina de Jóvenes de Quillón, Integra Ñuble, el DEM de Yumbel, la UBB, Concepción y tres actas públicas).
    - **La comparación** lee primero lo de la misma unidad de compra (la comisión de esa licitación), después lo del mismo organismo y al final lo demás; nunca lo de la misma licitación.
    - **«Aprender del acta»**, en la pestaña «Comparación de ofertas»: cuando adjudican, se sube el acta de evaluación (sección `acta`) y Opus 5.5 anota cómo decidió la comisión, si la comparación acertó y, si falló, por qué. Lo aprendido entra a la base; aprender otra vez reemplaza lo de esa licitación. Sin nombres de personas ni de oferentes, sin consejos ni pesos de las bases.
    - La pestaña muestra también «Cómo ha decidido esta comisión»: lo que la base sabe de su unidad de compra.
61. **El respaldo de la patente va siempre con ella** (20-10, pedido por Felipe). Valle del Sol Quillón SpA postula con las patentes de Centro de Eventos Valle del Sol S.A., que usa por un contrato de comodato. En 2025 la Municipalidad de Quillón dejó fuera su oferta por eso, y Contraloría dijo después que no se ajustó a derecho (Contraloría Regional de Ñuble, folio E179496/2025): las bases pedían «patente municipal vigente» y la cedida cumple. Felipe, que la llama su punto débil: *"acabo de subir el contrato de arriendo de patente, ¿puedes dejar por defecto que siempre me lo pase en el zip para licitaciones o compra ágil que pidan la patente?"*.
    - **Tipo nuevo en «Mi empresa»: «Respaldo de la patente (contrato, comodato o dictamen)»**, sin migración (`tipo` es texto). Al elegirlo, la pantalla avisa que va siempre en el ZIP junto a la patente.
    - **En el set** (`el-set.ts`, `TIPO_RESPALDO_PATENTE`): todos los de ese tipo van donde va la patente, justo detrás: en la administrativa si las bases la piden y en «4. Otros» si no, venga la patente de la carpeta o subida a mano. Sin patente en el set no van. Lo ya subido a mano con un nombre parecido no se repite, y lo vencido al cierre va con aviso. Vale igual para licitaciones y compras ágiles, porque el set es el mismo.
    - **En producción desde el 20-10 (PR #203).** Ese día, con el OK de Felipe (*"ok hazlo"*), pasaron de «otro» a este tipo los tres documentos de la patente de Valle del Sol: el contrato que subió esa tarde («Comodato de arriendo Valle del Sol.pdf»), el dictamen de Contraloría y la declaración de uso de la patente. Como «otro» no entraban nunca al ZIP. El respaldo de antes está en `02_RESPALDOS/cambios_de_datos/respaldo_tipo_respaldo_patente_2026-10-20.json`, fuera del repo.
62. **«Se viene» con el semáforo de la bandeja** (20-10, pedido por Felipe). Felipe, con la pestaña llena de insumos médicos, computadores y transporte: *"deberíamos filtrar con el mismo semáforo, no tiene sentido analizar 400 opciones"*; y *"ahora se viene la licitación súper importante, que es la del Día del Dirigente... quiero las relevantes y no todo el resto"*. El semáforo solo existía para lo que el radar leyó (lo abierto desde el 17-10); lo de «Se viene» son licitaciones de años anteriores que la IA nunca leyó.
    - **La misma lectura de la bandeja**: cada serie se lee una vez, por la última vez que salió, con Haiku 5.5, las instrucciones de la empresa (perfil y catálogo) y las reglas fijas (comuna cercana y del rubro nunca es roja). Queda en `oportunidades_se_viene` (migración 156), aparte de `oportunidades` para no llenar la bandeja ni su historial con licitaciones de años anteriores.
    - **Se lee sola al abrir «Se viene»**: lo que falta se manda a leer por detrás, de a seis y una lectura por empresa a la vez. La pantalla pregunta cómo va (`GET /oportunidades/calendario/lectura`) y pide el calendario otra vez al terminar. La primera vez son unas 400 (menos de US$0,10); después, solo las nuevas. Lo que no se pudo leer se reintenta en una hora.
    - **Qué se ve**: las verdes y las amarillas, con la franja y la razón de la bandeja; las rojas, apagadas. Desde esa misma noche, con el filtro de la bandeja (Felipe: *"sería bueno que este filtro sea el mismo, con verdes, amarillas, rojas y buscador"*): cada color es un botón con cuántas hay, las rojas parten «ocultas», y el buscador mira nombre, organismo, comuna y código. Es la misma pieza en las dos pantallas (`FiltroDelSemaforo`). Después, con la fila de la bandeja al lado (*"¿por qué no dejas esto igual en se viene? Creo que está bien logrado, y ese check box no pega ni junta"*): la región, como en la bandeja, y la lista ordenada como la bandeja: la prioridad en su recuadro violeta arriba («★ Prioridad (n)») y el resto por mes, cada uno en su recuadro. Sin filtro de prioridad (Felipe: *"si no, le generamos distintas interfaces a cosas que dicen lo mismo y que actúan bajo la misma cadena de reglas"*). Los botones de tipo no van: «Se viene» trae solo licitaciones. Mientras la IA lee, lo sin leer no se ve; lo que quedó sin leer se ve sin color. La prioridad pasa a violeta («Comuna cercana», «Alto valor») como en la bandeja (decisión 31), porque el amarillo es del semáforo; «Debía salir… y todavía no aparece» va con reloj.
63. **«Se viene»: si se repite, según la IA, y «Descartar»** (20-10, pedido por Felipe). Felipe, al ver que «Se viene» anunciaba licitaciones que quizás fueron de una sola vez: *"lo que se viene también debería poder descartarlo... hay ciertos servicios que son de una vez, y hay otros que son de todos los años"*; y cuando se le contó que las series se arman por palabras en común y que un evento puede cambiar de nombre (en 2024 Quillón publicó «Gala del Dirigente» y en 2025 «Día de Campo del Dirigente»): *"dos licitaciones con nombres similares, con montos similares, debería ser considerado una repetición; por eso es que usamos IA y no un bot... para que si el nombre cambia un poco, identifique que son las mismas"*.
    - **Si se repite**: por cada serie, la IA (Haiku 5.5, `LecturaService.edicionesAnteriores`, `historia/repeticion.ts`) ve la última vez y las licitaciones del mismo comprador de 6 a 40 meses antes (hasta 40, primero las más cercanas a «un año antes»), cada una con su nombre, fecha y monto, y dice cuáles son ediciones anteriores del mismo evento y por qué. El nombre puede cambiar un poco; un monto parecido lo confirma; un monto o un formato muy distinto puede ser otro evento. Sin candidatas, «salió una sola vez» sin IA. Los años de la serie pasan a ser los que dice la IA.
    - **Se guarda** en la misma fila de la lectura de «Se viene» (migración 157: `ediciones`, `repeticion`, `descartada_en`) y se revisa junto con el semáforo, por detrás, al abrir la pestaña: las ya leídas solo hacen la pregunta de la repetición. Cuesta centavos.
    - **En la pantalla**: el sello «Se repite» o «Solo una vez» (la razón, al pasar el mouse), y **«Descartar»** con confirmación (*"si es que yo siento que no se va a repetir"*): sale de «Se viene» y no vuelve. Si igual la publican, el radar la trae a la bandeja. «Descartadas (n)» las muestra para recuperarlas (`PATCH /oportunidades/calendario/:codigo`).
64. **Prioridad es lo de tu rubro en tu zona, sin importar el monto** (20-10, pedido por Felipe). Felipe, al ver «Prioridad» en «Se viene»: *"que esté grande no necesariamente lo hace una prioridad... algo puede tener 60 millones, pero si es de Concepción difícilmente lo logre traer para acá, a menos que la Municipalidad de Concepción esté licitando un viaje por las rutas del Itata en Quillón... para mí prioridad son las licitaciones de mi rubro, o que tienen que ver con lo que yo vendo, que estén en Quillón o en todas sus comunas"*.
    - **La regla, una sola**: prioridad es lo verde o amarillo (de tu rubro) de una comuna cercana, las que tiene la configuración del módulo. El alto valor deja de contar. Vale igual en la bandeja (el recuadro «Prioridad», el resumen y la ficha: `esPrioridad`) y en «Se viene».
    - **En la pantalla**: la razón «Alto valor» ya no aparece; «Comuna cercana» sigue en violeta, que es solo de la prioridad (decisión 31). El monto se sigue viendo en cada fila.
    - El motor sigue anotando `alto_valor` en las alertas y el umbral sigue en Configuración de empresa; la prioridad no los usa.
65. **«Traer los documentos»: las bases llegan solas, por Licify** (21-10, pedido por Felipe). Felipe encontró en Apify el servicio comercial de Licify (`licify/mercadopublico-licitaciones` y `licify/mercadopublico-compraagil`), que guarda en su propio almacén los adjuntos de cada proceso, y pidió usarlo: *"Déjame crear la cuenta y ellos descargan los archivos"*; *"si cuesta tan poco por licitación, podríamos poner un botón de bajar documentos y que lo lleve directamente"*. Sobre el proveedor: *"hay una presunción de inocencia que es legal... si ellos están operando y funcionan, debemos asumir que lo están haciendo en buena ley"*. Mercado Público protege sus adjuntos con un control antirrobots que esta casa no esquiva; Licify es otro camino: un proveedor que se contrata.
    - **Lo que medimos antes (21-10)**: Licify tiene lo que el comprador adjunta al publicar (bases, decretos, fichas técnicas, formularios, respuestas del foro), desde fines de 2025. **No tiene** el acta de evaluación ni lo que se adjunta al adjudicar, ni las ofertas de los competidores (Juventudes 2026: 4 archivos contra los 11 y 4 carpetas de oferentes que bajó Felipe). Para «Aprender del acta» y la comparación, esos siguen bajándose a mano. Cuesta US$0,001 por proceso; el plan gratis de Apify da US$5 al mes.
    - **El botón**, en «Bases y anexos» de la ficha, (el camino a mano es el enlace «Mercado Público» de la cabecera de la ficha; el segundo botón que había al lado se quitó el 22-10, decisión 66): `POST /oportunidades/:id/adjuntos/traer` → `LicifyService.traer` (`adjuntos/licify.service.ts`): pide la lista (`list-files`) al servicio que corresponde al tipo del proceso, con el token de la empresa (`APIFY_TOKEN`, en la cabecera; nunca en la URL ni en el registro), baja cada archivo del almacén de Licify presentándose como Eventia, valida tipo y tamaño como lo subido a mano, lo guarda en el balde privado de la empresa y en `oportunidad_adjuntos` (sección `bases`, origen `subido`, quien apretó el botón). No repite lo que ya está (por el nombre normalizado o por el mismo peso). Lo que no se puede bajar se anota y el resto sigue; sin token, 400; Licify caído, 503.
    - **En la pantalla**: «Llegaron N archivos (M ya estaban)»; si Licify no conoce el proceso, aviso y el camino a mano. El análisis con IA y todo lo demás los ven como cualquier archivo de «Bases y anexos».
    - **Siempre a la vista, una vuelta a la vez** (23-10, pedido por Felipe: un PDF de 12 MB quedó repetido; *"apreté traer bases, me salí, volví, no estaban las bases y no estaba trabajando y apreté de nuevo"*; aprobado: *"sí, hazlo así"*). El motor anota qué está trayendo (`LicifyService.estaTrayendo`, en memoria: si se reinicia, la vuelta se corta y deja de decirlo) y un segundo `POST` mientras trae responde 409 sin bajar nada. La pantalla le pregunta al entrar a la ficha (`GET /oportunidades/:id/adjuntos/traer`, `useEstadoDeTraer`, cada 3 s mientras trae): el botón sigue en «Trayendo…» con «Puedes salir de la ficha: aparecen solos al terminar», y al terminar se piden de nuevo la lista y «Mis licitaciones». La etapa **Bases** del camino de la ficha y de «Mis licitaciones» gira mientras trae y queda lista recién al terminar (`avance.trayendo`): el primer archivo chico ya no la cierra.
    - **El token** vive en 01_CLAVES («Token apify.md», fuera del repo) y en Railway como `APIFY_TOKEN`. El mismo token sirve para los dos servicios. Los archivos quedan en nuestro balde: si Licify cambia o desaparece, lo bajado no se pierde.

66. **Un solo enlace a Mercado Público, el de la cabecera** (22-10, Felipe: *"borremos el botón bajar de mercado publico... si arriba hay un botón de ir a mercado publico"*). En «Bases y anexos» queda solo «Traer los documentos»; el camino a mano es el enlace «Mercado Público» de la cabecera de la ficha (`FichaEnUnaMirada`). El aviso cuando Licify no tiene el proceso apunta a ese enlace, y solo el enlace de la cabecera va pegado al borde derecho; el estado y el responsable se quedan donde estaban (*"prefiero que esté pegado a la derecha el de arriba... y el de abajo fuera"*; después: *"el en estudio y el responsable estaban bien donde estaban"*). Dos botones para lo mismo, en la misma pantalla, era una interfaz repetida. **El 23-10, el título largo en una línea**: con el catamarán, la fila del título se partía y dejaba el punto de color solo arriba y «Prioridad» solo abajo (Felipe: *"esto se desordenó donde el título es muy grande"*). De las dos maneras que vio (el título completo en dos líneas, o cortado), eligió la B: el título va en una sola línea, cortado con «…», y se lee completo al pasar el mouse (*"la b a producción"*).

67. **«Pregúntale a la IA» sobre estas bases, sin releer todo** (22-10, pedido por Felipe: *"no tengo cómo preguntar ni interactuar... no sé si está bien o no"*; *"sí me gustaría un pregúntale a la IA pero en el análisis de bases... la idea es poder precisar cosas y que no vuelva a releer todo... propón algo eficiente o como lo hace la industria"*; *"me gusta vamos"*). Un cuadro bajo el análisis de las bases (`PreguntasALaIA`): se escribe la duda y responde en segundos, citando documento y página; el hilo queda en la oportunidad (`oportunidad_preguntas`, migración 159) y lo ve todo el equipo.
    - **Quién responde: Opus 5.5**, el mismo que hizo el análisis (`MODELO_PREGUNTAS`). En bases legales, precisar es lo que importa; Haiku se equivoca y Sonnet queda a medio camino.
    - **Cómo no releer todo: caché de contexto de la API, con el MISMO prefijo que el análisis** (lo que hacen NotebookLM, Claude Projects o Harvey). Felipe, al ver que la primera pregunta costó US$0,55: *"¿pero la primera lectura no es cuando aprieto analizar las bases?"*. La caché solo sirve si el comienzo del pedido es idéntico, así que el análisis y las preguntas empiezan igual: las instrucciones comunes en el sistema (`instruccionesComunes`, `sistemaConCache`) y los documentos de «Bases y anexos» primero, con la marca de caché de **1 hora** (`CACHE_DE_BASES`, `prefijoDeDocumentos`, en `comun.ts`); lo que cambia (el pedido del análisis, `PEDIDO_DE_ANALISIS`; las reglas de las preguntas, `REGLAS_DE_PREGUNTAS`, con el análisis previo `analisisComoTexto`) va después de la marca. El análisis deja las bases guardadas una hora y cada pregunta de esa hora las lee de la caché (el 5 % de la entrada). Lo que cuesta (Felipe: *"casi 1 dólar por bases? ok"*): el análisis pasa de unos US$0,53 a unos US$0,95 por 100 mil tokens (escribir la caché de 1 hora cuesta 2 veces la entrada, `costoDelUso(..., '1h')`), y cada pregunta de esa hora sale a unos US$0,04, sin la pregunta cara de antes (US$0,55). Pasada la hora sin uso, la primera pregunta vuelve a escribirla. Después de la caché va el hilo (las últimas `PREGUNTAS_EN_EL_HILO` = 8 preguntas con respuesta, en orden) y la pregunta nueva: la IA recuerda lo ya aclarado.
    - **Sin RAG**: para bases de 10 a 60 páginas conviene mandar todo (más preciso); recortar por trozos es para cientos de páginas.
    - **La respuesta** (`ESQUEMA_DE_RESPUESTA`): el texto (máximo 120 palabras), hasta 4 citas (documento, página, texto; `citasValidas` las limpia) y la seguridad (`alta`: lo dicen los documentos; `media`: una deducción; `baja`: no está). La pantalla muestra eso, el modelo, lo que costó y «con las bases en caché» cuando las leyó de ahí.
    - **Igual que el análisis**: `POST /oportunidades/:id/preguntas` deja la fila «procesando» y responde por detrás (`PreguntasService.ejecutar`); la pantalla pregunta cada 3 segundos. Una pregunta a la vez por oportunidad (índice único `oportunidad_preguntas_una_en_curso`); sin bases legibles no se pregunta; entre 3 y 600 letras; lo que quedó procesando antes de un reinicio se abandona (`abandonarAntesDe`). La falla queda en palabras de la casa (`errorDeIA`).
    - **Lo que queda para después**: «Corregir el análisis con esto» (pasar una respuesta al checklist) se ve cuando Felipe lo use.

68. **Una sola memoria por licitación: lo aclarado manda** (22-10, aprobado por Felipe: *"Una sola memoria por licitación ok"*). Felipe, al ver la validación del catamarán dudar otra vez de las colaciones: *"la validación parece que se encontró errores por no entender bien las bases... ¿cómo lo abordarías para que al momento de armar la cotización sea también sobre la base del análisis que ya hicimos, con las consultas que ya hicimos?"*. La memoria de la licitación es el análisis de las bases más lo aclarado en «Pregúntale a la IA» (decisión 67), y la leen todos los pasos de la IA: la oferta («Armar postulación»), los anexos, la propuesta técnica y la validación.
    - **Qué entra** (`loAclarado`, `preguntas/lo-aclarado.ts`): lo que los documentos dicen directo (seguridad alta) entra solo; una deducción (media) o lo que no está (baja) entra SOLO cuando la persona anota lo que confirmó el comprador (la línea bajo la respuesta; `oportunidad_preguntas.confirmado`, migración 161). Lo confirmado manda también sobre una respuesta alta. Felipe preguntó *"¿qué ganamos con que mi palabra pese más?"*: cuando las bases no lo dicen, la respuesta real la tiene el comprador, no la IA (las «100 colaciones» por día o en total cambian el precio casi al triple; si la IA adivina mal, se cotiza de más o no se cumple).
    - **Cómo la leen** (`textoDeLoAclarado`): un bloque «LO ACLARADO DE ESTA LICITACIÓN (manda sobre tu propia lectura de las bases…)» con cada pregunta, su respuesta y de dónde viene (lo confirmó el comprador o lo dicen los documentos). Va después de lo que piden las bases: en `lasBases` (anexos y propuesta, `contexto-de-generacion.ts`, que salió de `generacion.service.ts` para no cruzar las 800 líneas; y la oferta, `instruccionesDeLaOferta`) y en `instruccionesDeValidacion`, que además dice que si un documento coincide con lo aclarado cuenta como correcto y que avise solo cuando lo contradiga. En «Pregúntale a la IA», lo confirmado va con su respuesta en el hilo.
    - **Una sola memoria, la misma regla en la pantalla** (`entraALaPostulacion`, `pages/oportunidades/loAclarado.ts`): bajo cada respuesta, «Lo dicen los documentos: entra a la postulación» (con «Corregir con lo que dijo el comprador»), o «No entra a la postulación hasta que anotes lo que confirmó el comprador» con la línea para escribirlo; arriba, «La postulación usa N aclaraciones». `PATCH /oportunidades/:id/preguntas/:preguntaId` guarda o borra lo confirmado.
    - **Leerla nunca rompe** (`memoriaDeLaLicitacion`): si falla la lectura, el paso de la IA sigue sin memoria y queda el aviso en el registro.

69. **La cotización del catamarán: se crea siempre, en sus fechas, y se cuadra a mano** (22-10, pedido y aprobado por Felipe: *"La cotización del catamarán ok"*). Al vincular la cotización de la compra ágil del Sudamericano de Canotaje (1346350-37-COT26), el botón no aparecía. Felipe: *"lo que no puede ser es que no pueda crear una cotización con los servicios que yo tengo que comprar a mis proveedores, lo que yo tengo que coordinar y las fechas que tengo que reservar... por un tema de una diferencia de plata no estamos creando la cotización con lo básico"*; *"tiene que estar en rojo cuando hay alguna diferencia... y abajo los pendientes... yo después me voy y a mano pongo servicio de catamarán, lo agrego, y cuadro los precios... o lo dejo con esa diferencia"*; *"cada licitación sale con sus temas particulares y no podemos automatizar eso"*.
    - **Dos errores que frenaban la cotización.** (1) `PostulacionRepository.ultimaPropuesta` tomaba la generación más nueva entre oferta y propuesta; desde la decisión 33 la propuesta se arma DESPUÉS de la oferta y no trae «oferta», así que el cuadro decía «Primero arma la postulación» y escondía el botón (el catamarán y la 792906-18-COT26). Ahora toma la más nueva que traiga oferta (`resultado->oferta` no nulo). (2) La cotización se armaba como de un solo día (`ultimo_dia: ''` en `armarFoto`), y lo ofrecido de varios días (día 1, 2 y 3) se rechazaba: el catamarán (6 al 8 de noviembre) y el Profesor (28 y 29). Ahora `armarFoto` recibe el último día.
    - **Se crea siempre con lo del catálogo.** Si la oferta es mayor que lo que suma el catálogo (lleva lo que se subcontrata), ya no hay error: la cotización queda a precio de catálogo y la bitácora anota cuánto falta. Nunca un precio a dedo (memoria «precios nunca a dedo»): lo que falta se agrega a mano, como servicio, o se deja como diferencia. Si la oferta es menor, el descuento en dinero, como siempre (decisión 29).
    - **Las fechas al crear.** «Crear o vincular cotización» pide «desde» y «hasta», propuestas desde las bases (`fecha_del_servicio_iso`) y los días que dura lo ofrecido (`diasDeLaOferta`); van a `event_date` y `event_end_date`, para el calendario, las compras y la cocina. El término nunca queda antes de lo que dura lo ofrecido (un «hasta» más corto se alarga). En el catamarán, la comida es del 6 al 8 aunque el catamarán parta el 2: se corrige a mano.
    - **«¿Calza el precio?» cruza tres cifras**: el presupuesto de la licitación, tu oferta (el precio de «Armar postulación») y tu cotización (su total, con el catálogo y el descuento al lado). En rojo cuando la oferta se pasa del presupuesto (`veredicto`) o cuando la cotización no cuadra con la oferta (`cuadre`: le falta o le sobra). Abajo, «Lo que falta en la cotización»: la lista de lo que se subcontrata (`faltan`, la misma del comentario interno, decisión 57).
    - **La cotización de la licitación se edita.** Se levanta el candado de la decisión 35 (`cotizacion-de-licitacion.ts` se borra; `QuotationsService.update` ya no lo revisa; el cotizador solo dice de qué licitación viene). «Armar postulación» ya no la reescribe sola: se reescribe con lo postulado con el botón «Reescribir con lo postulado» (con confirmación; lo que tenía queda en su bitácora).

70. **Competidores reales, desde las actas de adjudicación** (22-10, pedido por Felipe: *"en mis competidores, podemos hacerle seguimiento a las empresas con las que he competido... también busca empresas similares, complejos turísticos o restaurantes que hayan postulado a servicios públicos a los que yo postulo... debería haber un botón de «no es mi competidor» (con un confirmar)"*; aprobado: *"ok con competidores"*). La pestaña Competidores tenía solo quién **gana** en la zona (la API de Mercado Público no dice quién más ofertó). El acta pública de adjudicación sí trae **todas** las ofertas, con RUT, precio y quién ganó, y se abre sin código (`leerActa`, decisión 30). Con eso:
    - **Las ofertas, en una tabla de todos** (`mp_ofertas`, migración 162; pública como `mp_procesos`): una fila por licitación y RUT (`ofertasDelActa`, `competencia/competencia.ts`), con lo ofertado (precio unitario por la cantidad pedida, sumado), lo adjudicado, si ganó, sus líneas, lo que escribió de su oferta (corto: sirve para saber a qué se dedica) y lo del proceso repetido (comprador, comuna, fecha). `mp_procesos.ofertas_leidas_en` dice que ya pasaron; el acta que guardó «Seguir» (decisión 30) se pasa desde la guardada, sin volver a bajarla, y un acta sin ítems no se guarda (para que «Seguir» la reintente).
    - **«Buscar en las actas»** (`POST /oportunidades/competencia/buscar`, `CompetenciaService.buscar`): responde al tiro y lee por detrás, de a una empresa a la vez, hasta 400 actas por vuelta (`ACTAS_POR_BUSQUEDA`) con una pausa de 0,8 s entre página y página (`PAUSA_ENTRE_ACTAS_MS`) y un tope de 25 minutos: primero las de sus licitaciones (todas menos las nuevas y las descartadas), después las de sus compradores de los últimos 3 años y al final las de sus comunas cercanas, sin repetir. De noche sigue sola con lo que falte (`CompetenciaCronService`, 03:40 de Chile, entre las pasadas del radar de las 02:07 y las 05:07). La pantalla dice cómo va («Leyendo actas: 35 de 400») y la lista crece mientras lee.
    - **La lista, «Tus competidores»** (`competidoresReales`; la vista de entrada de la pestaña, `CompetidoresReales.tsx`): tres etiquetas. **Compitió contigo**: ofertó en una licitación donde ofertó la empresa (por el RUT de «Mi empresa»; sin él, un aviso): cuántas veces se cruzaron, quién ganó cada vez y su precio frente al tuyo en promedio («8 % más barato que el tuyo»). **Parecido a ti**: la IA lo ve como un negocio como el tuyo y oferta en tus compradores; con sus ofertas, sus triunfos y lo que ganó ahí. **Lo sigues**: «Seguir», aunque no aparezca en las actas. Arriba, una vista por etiqueta con su número y un buscador.
    - **Lo único con IA: si se parece a ti** (`clasificar`, Haiku 5.5, por centavos): al final de cada búsqueda, los proveedores nuevos de los compradores de la empresa (hasta 300, de a 40 por pedido, el perfil de «Mi empresa» en caché), con «si» o «no» y una razón corta (`ESQUEMA_DE_CLASIFICACION`); solo se guardan RUT de la lista, una vez cada uno (`clasificacionValida`). Lo ya clasificado no se vuelve a pedir. La razón se ve bajo el nombre («Según la IA: …»).
    - **«No es mi competidor», con confirmación** (`ConfirmInline`, tono sereno: se deshace): sale de la lista y queda en «No son competidores», desde donde se recupera. Igual que «Seguir», se guarda por empresa en `oportunidades_competidores` (`PATCH /oportunidades/competencia/:rut`, RUT normalizado; marcar no pisa lo que dijo la IA). Las rutas van bajo «competencia» y no «competidores» porque `competidores/:rut` (la ficha de la zona) se tragaría las nuevas.
    - **La ficha del competidor, con «Cuando compitió contigo»** (`GET /oportunidades/competencia/:rut/encuentros`): cada licitación donde ofertaron los dos, con su oferta, la tuya, quién ganó y la diferencia de precio. Un proveedor que nunca ganó en la zona igual tiene ficha si se cruzó con la empresa (antes decía que no lo encontraba).
    - **«Quién gana en tu zona» sigue igual**, como segunda vista de la pestaña.
    - **Lo que queda para después** (sin aprobar): los avisos de postulaciones (cuando cambia el estado de una postulada, gana o pierde) y la segunda parte de «Seguir» (ver las órdenes de compra de los que sigues).
    - **La 71 (23-10) cambió esto**: sin «Parecido a ti», sin botón y con el estudio de mercado de cada competidor. Ver abajo.

71. **El mapa de tu competencia** (23-10, Felipe al ver «Tus competidores» en producción: *"mis competidores es que debes revisar todas aquellas licitaciones que yo haya participado o compras ágiles... y ver contra quiénes competí, independiente si haya ganado o perdido. Y luego traer la información de ellos, todas las licitaciones en las que participan, cuántas veces ganaron, el monto, la última vez, dónde gana más"*; *"es como un estudio de mercado"*; *"el parecido a mí no sé si sea lo mejor... va a ser muy complejo de que la IA sea capaz de identificar lo mismo"*; *"la lectura de actas debería ser automático y debería ser un dato que me lo entregara, no algo cliqueable"*; aprobado: *"las 5 están bien"*). Lo medido ese día en producción: la búsqueda que apretó leyó 89 actas de sus compradores y Valle del Sol no aparecía en ninguna; casi toda su historia con el Estado es compra ágil, que no tiene acta (0 de 3.177). Cinco cambios:
    1. **Tus competidores, solo los reales**: los que ofertaron donde ofertó la empresa, ganara o perdiera, y los que sigue. Sale «Parecido a ti» (la IA que clasificaba proveedores; las columnas `parecido` de la 162 quedan sin uso). Para encontrar cada licitación donde ofertó se leen **todas** las actas de los últimos 3 años de sus regiones (unas 6.000 en Ñuble y Biobío), no solo las de sus compradores; cada postulación suya entra sola cuando se adjudica. Orden (`ActasDeLaZonaService.pendientes`): sus licitaciones, sus compradores, sus comunas cercanas y el resto de la región, lo más nuevo primero.
    2. **La ficha de cada uno, como estudio de mercado** (`GET /oportunidades/competencia/:rut`, `fichaDeMercado`): todas las licitaciones donde participó (las actas leídas, más lo que ganó en la zona aunque no tenga acta), ganadas y perdidas, con qué ofreció, a qué precio, cuántos ofertaron y quién le ganó; arriba cuánto participó, ganó y perdió, el monto ganado, la última vez y **a quién le vende** (por comprador: participó y ganó); y «Cuando compitió contigo». En la lista, cada uno trae su historia en la zona («participó 12 veces, ganó 5, más con DAEM Quillón»).
    3. **Quién gana en tu zona, solo tu rubro** (`GET /oportunidades/competencia/zona`, `RubroService`, tabla `oportunidades_rubro`, migración 163): la IA (Haiku 5.5, de a 25, con las instrucciones en caché) lee UNA vez el nombre y las líneas de cada licitación adjudicada de la zona y dice cuáles son del rubro: alimentación y catering, celebraciones y fiestas (día del funcionario, del profesor, aniversarios), paseos y jornadas, salón o centro de eventos y alojamiento; no la producción técnica sola (audio, iluminación, escenarios, animación), ni la compra de alimentos, ni lo demás. La categoría de Mercado Público no sirve: el Día del Profesor 2025 de Quillón está como «ventas y marketing». Se cuenta quién ganó **las líneas del rubro** (en una mixta, la comida y no el escenario), con lo que dice la adjudicación de cada línea. Unas 5.900 licitaciones, cerca de US$2 la primera vez. **Más estricta desde el mismo 23-10 (instrucciones v2, `VERSION_DEL_RUBRO`)**: en producción, la primera versión contó producciones técnicas y artísticas de fiestas comunales («Fiesta de la Papa», «producción técnica y artística» de un aniversario comunal), ferias, exposiciones, un festival de la voz y una concesión de casino. Ahora una línea es del rubro solo si el proveedor da comida, salón o alojamiento; las celebraciones de funcionarios o de grupos (día del funcionario, del profesor, del adulto mayor, navidad) sí, aunque digan «producción de evento»; los festivales, ferias, exposiciones, conciertos, fiestas costumbristas y aniversarios comunales abiertos al público, no, salvo que la línea diga que el proveedor da la comida; las concesiones de casino, no; ante la duda, no. Lo revisado con otra versión se vuelve a revisar sin borrar nada (se reescribe encima; `oportunidades_rubro.modelo` lleva la versión, «claude-haiku-5-5#v2»).
    4. **Sin botón**: las actas y el rubro se leen solos. De noche en dos vueltas entre las pasadas del radar (`CompetenciaCronService`: 23:30 a 01:55 y 02:30 a 04:55, hora de Chile; la primera noche alcanza para las ~6.000 actas) y, si al abrir la pestaña falta algo y nadie está leyendo, por detrás (20 minutos las actas, 15 el rubro). La pantalla solo da el dato: «Actas leídas: 89 de 5.977 de tu zona · leyendo ahora» y «La IA lleva 1.200 de 5.901 licitaciones…». Sale `POST /oportunidades/competencia/buscar`.
    5. **Compras ágiles, la medición** (`CotizantesService`): Mercado Público trae en cada compra ágil `proveedores_cotizando`, vacío mientras está abierta. Una vez al día, hasta 45 días después del cierre, se vuelve a pedir el detalle de las compras ágiles de la empresa y se guarda crudo (`mp_procesos.cotizantes`, migración 163; aparte de `detalle`, que el radar reescribe). Si trae RUT, entran como ofertas (una línea cada una) y cuentan como «compitió contigo». El registro anota los nombres de los campos (no los datos) la primera vez, para ajustar la lectura a la forma real.
    - **El precio, línea a línea** (error corregido): «Su precio» comparaba el total de cada uno aunque hubieran ofertado líneas distintas (Centropan salió «3.984 % más caro» por ofertar pan donde Valle del Sol ofertó el almuerzo). Ahora se compara precio unitario contra precio unitario de la misma línea, con el acta guardada (`diferenciasDePrecio`); sin líneas en común dice «Ofertaron líneas distintas: no se compara el precio». Sin acta (compra ágil), los totales, solo si cada uno ofertó una línea.
72. **El rojo es reciclaje, y la basura va aparte** (23-10, pedido por Felipe al ver en la Prioridad unas verduras de Portezuelo y las entradas a Fantasilandia de El Carmen: *"por qué deja esto como amarillo si la IA reconoce que no es de mi interés"*). La causa era la regla del 16-10 (§5.2): lo de una comuna cercana y del rubro nunca quedaba en rojo, subía a amarillo y entraba a la Prioridad. Medido ese día: de las 15 de la Prioridad, 12 eran un «no» de la IA subido por la regla (verduras, colaciones sueltas para entregar, entradas a un parque, festivales públicos, cursos con relator) y solo 3 valían. Pero la misma regla había rescatado el catamarán (1346350-37-COT26): la IA dijo que no y Felipe postuló. Felipe: *"dejémoslo afuera. En rojo, pero el rojo que no sea un rojo basura, el rojo puede ser reciclaje, o sea, cosas que la IA rechazó, pero que vale la pena ver... es mejor tener menos, pero hincarle el diente. Y otras que estén sencillamente descartadas porque no son"*; aprobado: *"hazlo"*.
    - **El color es el de la IA** (`aplicarReglas`): lo de una comuna cercana y del rubro lleva la alerta `comuna_cercana` pero ya no sube de rojo a amarillo. Así la Prioridad (verde o amarillo de tu zona, decisión 64) queda solo con lo que la IA aprueba.
    - **Tres montones por color, sin migración**: verde y amarillo, lo que la IA aprueba (unas 15 al día); **rojo = reciclaje**, lo que la IA rechaza pero es de tu zona y de tu rubro, es decir rojo con la alerta (unas 6 al día; ahí habría quedado el catamarán); **basura**, todo el resto del rojo (unas 550 al día), guardada y oculta, por si un día se busca algo. La base sigue guardando verde, amarillo o rojo; la pantalla parte el rojo en dos (`colorDe`, `colorDeLaOportunidad`). En la bandeja y en «Se viene», el botón rojo se llama «Reciclaje» y la basura tiene su botón gris; los dos parten apagados («ocultas»). En «Se viene» el motor dice cuál es reciclaje (`reciclaje`: roja, de comuna cercana y con alguna etiqueta del rubro). Ojo, dicho a Felipe antes de aprobar: en el reciclaje también caen cosas como las verduras de Portezuelo, porque son de su zona y la IA las marca como comida.
    - **Esa misma noche, el rojo se ve y la basura se va** (23-10, Felipe al verlo en producción: *"el botón rojo con el verde y el amarillo se comportan distintos, el rojo y el gris tienen la viñeta oculta... gris lo eliminaría; rojo que sea igual en comportamiento al verde y amarillo"*): el «Reciclaje» parte prendido como el verde y el amarillo, sin «ocultas», en la bandeja y en «Se viene» (es la misma pieza, `FiltroDelSemaforo`); la basura ya no tiene botón y aparece solo al buscar (`pasaElColor`), para que lo guardado se siga encontrando. Los filtros guardados de la sesión cambiaron de clave (`op.filtros.v2`) y si traen la basura prendida se apaga.
    - **Lo leído antes se relee**: las abiertas de una comuna cercana que quedaron en amarillo y nadie tocó se marcaron para releer (`leida_con` distinto de `LECTURA_ACTUAL`, decisión 19) y el radar las vuelve a leer en su pasada siguiente; así lo que la IA había rechazado baja al reciclaje. En «Se viene» igual: desde esta decisión, una serie leída con otras reglas relee solo su color (no si se repite), y las descartadas no se releen. `LECTURA_ACTUAL` no cambia: cambiarlo habría releído las ~1.500 abiertas, y las instrucciones de la IA son las mismas.
73. **Vincular no reescribe, y las fechas salen de las bases** (23-10, pedido por Felipe con el Día de Campo del Dirigente 2026, 5040-14-LE26, armado sobre su cotización 493: *"podemos ordenarlo... ya las vinculé, pero sigue igual abierto... el crear cotización pregunta los días, pero no debería leer las bases para saber si es por día?"*; *"no se reescribe, finalmente postulo con lo que puedo... el precio de catálogo es lo que es"*; aprobado: *"ok hazlo así"*). Cambia lo de la decisión 29 («vincular solamente el número y reescribir todo»).
    - **El panel en dos bloques** (`CotizacionDeLaPostulacion`): «Crear una nueva» arriba y «Vincular una que ya tienes» abajo, cada uno con su texto, y «Cancelar» al final. La confirmación de vincular aparece dentro de su bloque, junto al botón: la 493 no había quedado vinculada porque la confirmación de antes, «Sí, vincular», salía más abajo y no se apretó.
    - **Las fechas de las bases ya puestas**: «Para el jueves 26 de noviembre, según las bases» (`fechasEnPalabras`), con «Cambiar» para abrir «Desde» y «Hasta»; si es un solo día, el «hasta» viene igual al «desde» y no parece que falte. Sale el ejemplo del catamarán, que estaba escrito fijo y aparecía en todas. Las fechas tienen uso: ubican la cotización en el calendario, avisan topes y, en lo de varios días, el catálogo cobra por día.
    - **Vincular sin reescribir** (`POST /oportunidades/:id/cotizacion/vincular`, `CotizacionDeLaPostulacionService.vincular`): une la cotización a la licitación con sus productos, precios y personas tal como están; solo pasa a la fecha de las bases, la misma que propone «Crear una nueva», salvo que sea un evento aceptado o realizado, que conserva la suya. Queda anotado en su bitácora. Reescribirla con lo postulado sigue siendo un botón aparte, «Reescribir con lo postulado».
    - **El descuento que suma no se hace**: la cotización solo acepta descuentos que restan (`discount_amount` mínimo 0); que sumara cambiaría cómo cuadran todas las cotizaciones, el PDF y los pagos. Si la oferta es más alta que el catálogo, «¿Calza el precio?» lo muestra en rojo; para que cuadre, se arma la postulación con el precio del catálogo. Felipe decide el monto.
74. **El catálogo manda: la IA no cambia productos por precio** (23-10, esa misma noche, pedido por Felipe tras ver su cotización 493 reescrita: *"no tuvo que haber cambiado nada al vincular, ¿cachai?"*; *"no hay que cambiar los productos por precio, arma lo que piden... si voy a licitar por menos, la diferencia para abajo se hace un descuento"*; *"correcto sacar del motor la vinculación antigua y correcto lo del calza el precio... y debe excluir si no postulo todas las líneas"*). Qué pasó: la IA de «1. Qué ofreces» comparó el catálogo, que tiene IVA, contra el tope NETO de la línea 1 ($14.453.782) y, para caber, cambió el ticket diario por el de convenio (quedó en $14.195.000); después el vincular antiguo reemplazó la 493 por esos productos. La 493 se devolvió a lo de agosto ese mismo día, con respaldo.
    - **Las instrucciones de la oferta** (`instruccionesDeLaOferta`): los precios del catálogo tienen IVA incluido y nunca se cambian, quitan ni agregan productos por precio ni para caber en el presupuesto; se arma lo que piden las bases. El precio lo pone la empresa: si es menor que el catálogo, la diferencia va como descuento (`fijarOferta`); si es mayor, por ahora no se hace nada distinto: Felipe postula a precio de catálogo.
    - **Sin la vinculación antigua**: `POST /oportunidades/:id/cotizacion` ya no recibe un número; crea una nueva o reescribe la ya vinculada («Reescribir con lo postulado»). Vincular otra es solo `POST .../cotizacion/vincular`, que no reescribe (decisión 73).
    - **«¿Calza el precio?» compara con lo que se postula**: la oferta trae `presupuesto`, lo disponible con IVA de las líneas que cubre, sin las otras (en el Día de Campo, la línea 1, $17.200.000, no los $20.471.755 de las dos); si la oferta no lo trae, el total publicado o el de las bases. La cifra se llama «Presupuesto de lo que postulas».
75. **La experiencia la fijan las bases, no una regla fija** (23-10, pedido por Felipe al ver el anexo de experiencia del Día de Campo del Dirigente 2026, 5040-14-LE26, con respaldos de $0,6 a $3,5 millones y uno solo de más de $7 millones: *"creo que las experiencias que pusimos son muy pequeñas, ¿no tenemos algo más?, ojalá ticket de 7M para arriba"*; *"la IA debe buscar considerando lo que dicen las bases, no con una regla fija"*). Reemplaza a la 52. Qué pasó: esas bases cuentan los contratos similares de los últimos 4 años, pero la regla de 24 meses dejó fuera las dos órdenes de compra de la Municipalidad de Quillón de 2023 ($16.500.000 y $11.782.499), y lo de Post-venta iba detrás de lo de «Mi empresa», que se usaba primero aunque fuera más chico.
    - **Sin período fijo** (`laExperienciaEnEventia`, `instrucciones.ts`): la IA ve los respaldos de cualquier fecha (los que no tienen año, no: no se sabe si cuentan) y usa los del período y las condiciones de las bases; si las bases no fijan un período, sirven todos. Sigue: nunca una fila sin su respaldo ni una de fuera del período.
    - **Una sola lista, de mayor a menor monto**: los de «Mi empresa» y los de Post-venta van juntos; los de Post-venta ya no esperan a que falten los de «Mi empresa». «No usar» sigue igual (decisión 56).
    - **Post-venta lee primero los eventos más grandes** (`losMasGrandesPrimero`, con el total de la cotización que ahora trae `documentosDeExperiencia`), de cualquier fecha y hasta 30 por vez: si hay más, quedan fuera los más chicos.
    - En el Día de Campo, 6 contratos parecidos dan el puntaje máximo de experiencia (20 %). Felipe sube a Post-venta las facturas de sus eventos grandes de 2025 (Ferrocarril del Pacífico, CCU, Armada, Curimapu y una estadía) y vuelve a armar.

76. **La experiencia que se presenta: el proceso estricto** (24-10, pedido por Felipe con el Día de Campo del Dirigente 2026: *"hay dos fuentes de información. La información que yo cargo en mi empresa, que son todas las órdenes de compra que han pasado por el mercado público... pueden ser la primera prioridad... en caso de que ahí no esté la mejor experiencia... en segunda instancia tiene que ir a la base de datos de Eventia y traer las mejores alternativas... me puede preguntar cuál está pensando traer. Yo le confirmo si sí o si no, que busque otras. Y listo, con eso las arma. Dejemos eso como el proceso estricto"*; *"quiero no decir tanto mis clientes, que me pueden ir a buscar... CCU es buena opción porque es un cliente fidelizado... Fepasa no tanto, prefiero esconderlo... todo lo que sea municipalidad es correcto"*; *"Rudel... es alojamiento, no es fiesta, quizás no aplica: la IA no debe solo juntar facturas si no cumplir con lo que las bases dicen"*; *"en mi empresa debería solo estar la experiencia en mercado público, el resto todo de la base de Eventia"*; *"constrúyelo lab y producción"*).
    - **Dos fuentes, en orden**: primero las órdenes de compra de Mercado Público de «Mi empresa» (`candidatasDeMiEmpresa`; las facturas que estaban ahí ya no cuentan: se usan desde su evento en Post-venta); después los eventos de Eventia (`eventosParaLaExperiencia`, de cualquier fecha), con su factura u orden leída de Post-venta o, si no la tienen, como «sin factura» para decir cuál conviene subir.
    - **Quién se puede mostrar** (`sePuedeMostrar`): los clientes de tipo «Empresas Publicas» siempre; los particulares nunca; los demás, solo si están en la lista de «Mi empresa» («Clientes que puedes mostrar como experiencia», `oportunidades_oferente.clientes_que_se_muestran`, migración 164). La misma regla limpia los eventos que la IA ve al llenar los anexos y la propuesta: no nombra a un privado que no está en la lista.
    - **Lo que piden las bases**: Sonnet 5.5 recibe lo que se licita y todo lo que dicen de la experiencia (`textoDeLasBases`) y elige solo contratos parecidos (un hospedaje para trabajadores no es un día de campo), del período y con las condiciones de las bases, primero «Mi empresa», de mayor a menor monto, el máximo más 2 de reserva, sin contar dos veces el mismo contrato (una orden de «Mi empresa» y el evento de Eventia que cubre son uno solo: en la primera prueba del laboratorio pidió la factura de un evento que ya estaba en una orden), y dice qué facturas convendría subir (`instruccionesDeLaExperiencia`, `leerEleccion`).
    - **La empresa confirma**: «La experiencia», dentro de «Armar postulación», muestra la propuesta; cada fila con su casilla, «Confirmar» (sin las que se sacan) o «Buscar otras» (sin las que se sacaron). Si las bases piden experiencia, «Armar postulación» no parte sin una confirmada (400), y los anexos llevan exactamente esas filas, en ese orden (`LA_EXPERIENCIA_CONFIRMADA`); el ZIP pega sus PDF como antes. Al volver a armar se usa la última confirmada; «Cambiar» la vuelve a pedir.
    - Primer uso: 5040-14-LE26. La propuesta a mano de ese día dio Quillón 2023 por $16,5 y $11,8 millones, CCU 2025 por $11,3, la Armada por $8,6, la Corporación de Asistencia Judicial 2024 por $4 y Quillón 2023 por $4,8, con dos más de Quillón de reserva: todas públicas o de CCU.

77. **Sin duplicados al subir la experiencia** (24-10, pedido por Felipe tras subir dos veces la misma orden 5040-536-SE23: *"necesito igual que al momento de subir una experiencia esto valide si ya existe en el sistema, para no generar duplicidades"*; *"si hazlo en lab y producción"*).
    - Al leer cada orden o factura que se sube a «Mi empresa», el motor dice si ya está (`ya_esta`, `OferenteService.dondeYaEsta`): primero en «Mi empresa», por el número leído (sin espacios, mayúsculas ni ceros adelante, `mismoNumero`), sin importar el nombre del archivo; después en los documentos de los eventos de Post-venta, por el nombre del archivo, porque esos no están leídos (`eventoConElNumero`: «F249.pdf» no nombra el 249 solo; «Factura 250.pdf» sí).
    - En «Respaldos en lote» la fila queda en ámbar («Ya está en ... No se guarda.») y no se guarda; lo repetido en la misma tanda va una sola vez.
    - Al guardar, el motor vuelve a revisar: lo que ya está es 409 y el archivo ni se sube.
    - La 5040-536-SE23 que quedó repetida antes de esto la cuenta una sola vez la propuesta de experiencia (decisión 76); la copia la puede borrar la empresa.

78. **El Word se edita en Eventia** (24-10, probado en el laboratorio y en producción esa misma noche: *"me gusta, a producción"*; Felipe, con el Formulario N°4 de la 5040-14-LE26 lleno de [COMPLETAR] en el visor: *"¿qué tan difícil será poner un editor? para completar cosas que la IA no sepa... hoy para completar eso debo bajarlo, editarlo y subirlo"*, y después: *"¿y si necesito editar algo que ya haya escrito la IA, para precisar la postulación?... un documento editable que pueda escribir y/o modificar en línea (lo básico: escribir, borrar, negrita, cursiva)... en caso que quiera descargarlo se descarga en Word"*; *"probemos eso en laboratorio, no me queda claro cómo se verá y es un cambio grande"*).
    - **Se edita el mismo Word del comprador**, no un documento propio en otro formato: las bases piden sus formularios con su diseño, y un viaje de ida y vuelta por otro formato pierde logos, tablas y márgenes. Para la persona se ve como lo pidió: hace clic en el texto y escribe.
    - «Editar», junto a «Firmar» en cada Word de «Mi postulación» sin firmar, abre el texto del formulario párrafo por párrafo, con sus tablas. Enter es un salto de línea, se pega solo el texto, negrita, cursiva y subrayado van con la barra o el teclado, y el navegador corrige la ortografía en español. Los [COMPLETAR] van en amarillo y «Siguiente» lleva a cada uno con su texto marcado, para escribir encima.
    - El motor guarda solo los párrafos que cambiaron (`postulacion/guardar-el-word.ts`): cada pedazo conserva la letra, el tamaño y el color de su corrida, la negrita, la cursiva y el subrayado se escriben solo si cambiaron, y lo demás del Word queda igual, letra por letra. Lo que tiene una imagen, un campo automático o un vínculo se ve en gris y no se edita aquí; el encabezado y el pie tampoco.
    - Lo editado queda en el mismo archivo de «Mi postulación» (con «editado en Eventia» y la hora): «Descargar» baja el Word editado y «Firmar» lo firma como siempre, en PDF. No se edita con la licitación postulada ni mientras la IA trabaja en sus documentos.
    - **Ver y editar es la misma pantalla** (Felipe, al verlo en el laboratorio: *"¿para qué tenerlo en Word en el sistema?... el ver y editar debería ser el mismo... ver el documento, ahí mismo poder editar, guardar, después tener abajo o al lado un botón de volver a validar... firmo y se pasa a PDF"*). Se discutieron dos caminos: un documento propio de Eventia sin Word (descartado: habría que rehacer el diseño de cada comprador y el PDF saldría con el nuestro) y el Word escondido por dentro, con una sola pantalla (elegido: *"me parece bien la opción 1"*). «Abrir» reemplaza a «Ver» y a «Editar» en cada Word sin firmar: el documento se ve con su encabezado, su logo, su letra y sus colores, y abajo están «Guardar», «Volver a validar», «Firmar» y «Descargar».
    - **Si el formulario vino en PDF** (pregunta de Felipe): la IA lo reescribe como Word al pie de la letra y con su forma (decisión 24), y ese Word se ve y se edita igual. Lo que no pudo leer queda como [ILEGIBLE], que sale en amarillo como los [COMPLETAR]; los saltos de página se mantienen al editar.
    - «Volver a validar» guarda y pide la validación de siempre, que ahora también revisa la ortografía y lo que quedó por completar o sin leer; el resultado sale arriba del documento y avisa si es de antes del último cambio.
    - **Alinear** (25-10; Felipe, con los precios del Formulario N°5 de la 5040-14-LE26 centrados en una fila y a la derecha en otra, porque así venía cada celda del formulario: *"¿será necesario incluir una herramienta para manejar los centrados?"*, y *"hagamos ese cambio chico"*): tres botones junto a la negrita, izquierda, centro y derecha, para el párrafo del cursor o los que toca lo marcado. Se guarda en el mismo Word, en el diseño del párrafo.
    - La barra de abajo tiene siempre el mismo alto (25-10; Felipe: *"cuando pincho firmar, cambia el tamaño del recuadro de abajo"*): la pregunta de «Firmar» o de salir sin guardar sale en el mismo lugar, a la derecha, en una línea, y el documento no salta.
    - Pregunta abierta: al «Volver a armar», lo editado se pierde (decisión 49); ¿se protege como lo firmado?
79. **«Mi postulación» en tres pasos** (26-10, probado en el laboratorio y en producción ese mismo día: *"pásalo todo a producción"*; Felipe, con «¿Calza el precio?», las notas de la firma y «Lo que tienes que conseguir» a la vista: *"creo que hay demasiadas partes en donde tengo comentarios de cosas que faltan... necesito que esto tenga una secuencia lógica"*; *"lo que falta conseguir no debería ser un análisis que ya está en exigencias de la licitación... debería estar mi postulación finalmente, con centrado en los anexos, lo que tengo que presentar, el precio"*; y con el boceto: *"bajo cada formulario podría estar como el detalle de qué es lo que falta completar... si es que hubiese algo que revisar"*).
    - **Arriba, lo armado en una línea**: cuándo se armó, el precio con IVA, la experiencia confirmada y «Volver a armar», que abre todo «Armar postulación» (el precio, la experiencia y sus pasos). Abierto se ve antes de la primera vez, mientras la IA arma y si un paso no resultó, para reintentarlo.
    - **1 El precio**: el presupuesto, tu oferta con su neto y quién ganó el año pasado, y una línea que dice si calza y si la cotización cuadra, con «Ver la cotización». Lo que le falta a la cotización ya no se lista aquí: queda en su comentario interno. Crear o vincular la cotización sigue igual.
    - **2 Tus documentos**: cada formulario por su N°, con su estado (firmado, por completar, por revisar, por firmar o subido), «Abrir» y «Firmar»; «Firmar todos» y la zona para subir siguen ahí. **Debajo de cada uno, lo que falta o hay que revisar**: lo que dejó la IA al llenarlo (sin su línea de la firma, que la dice el estado; si se editó después, ya no, y lo dice la próxima validación), lo que anotó al firmarlo si habla de ese formulario, y lo que encontró la última validación si el documento no cambió después; si cambió, *«Cambió después de la última validación: vuelve a validar»*. Se reparte por el nombre del archivo o por el N° del formulario (*«Línea N°2»* no es un formulario).
    - **3 Subir a Mercado Público**, con el cierre a la vista: «Validar todo», con la última validación en una línea (cuántos requisitos cumplen) y debajo solo lo que no es de ningún documento (el plazo de ejecución, un certificado de la carpeta); después «Descargar el ZIP», que baja de una, y «Ver qué lleva».
    - «Lo que tienes que conseguir» (decisión 39) pasa a «Bases y criterios», después del análisis. Queda por juntarlo con las exigencias de la licitación (parte 2).
    - Queda para después: que «Volver a validar» dentro del documento valide solo ese documento y ponga al día sus notas.
    - **Las postuladas antes de «Armar postulación»** (26-10; Felipe, con la 1532886-5-LE26, postulada la mañana del 19-10: *"no me está reconociendo mi oferta"*): no tienen oferta armada, así que «Tu oferta» toma el precio con que se llenaron los anexos (`monto_total`), arriba va una línea «Postulada con $… con IVA» en vez del bloque para armar, y una postulada sin cotización vinculada dice «Se postuló sin cotización vinculada» en vez de ofrecer crearla (el motor no deja cambiar lo postulado).
80. **«Bases y criterios» relacionado** (26-10, probado en el laboratorio y en producción ese mismo día, junto con la 79: *"pásalo todo a producción"*; Felipe: *"ahora en bases y criterios, ¿cómo podemos ordenar esto? para que estén relacionados y sirva al propósito"*; con el boceto: *"sí, ármalo en el laboratorio"*). Cuatro bloques que se responden entre sí, después del resumen:
    - **1 Cómo te evalúan**: las barras por peso y, al lado de cada criterio, cómo vas: el precio frente al presupuesto, la experiencia confirmada frente a lo que da el puntaje máximo, los documentos listos, el programa de integridad y, para la calidad de la oferta, lo que falta de las exigencias.
    - **2 Lo que te deja fuera**: cada causa con su estado real: los formularios que nombra, el precio, el 100 % de lo pedido o el documento del que habla.
    - **3 Lo que tienes que ofrecer**: las exigencias se juntan con «Lo que tienes que conseguir» (decisión 39). Cada exigencia tiene **un solo estado**: manda lo que marcaste (✓ Lo tengo / ✗ No puedo), después cómo se ofreció al armar la postulación (de tu catálogo, subcontratar, por definir o no va) y al final la primera lectura de la IA. Antes se contradecían: el análisis decía «conseguir» los baños y la oferta, «catálogo». Debajo de cada una, «Ofreces: …». El pedido al proveedor y los detalles para el comentario interno quedan plegados al final de la pestaña; el bloque avisa cuántas cosas pedir (Felipe: *"creo que [esto] también debería estar en los plegables de abajo"*).
    - **Un solo pedido al proveedor** (Felipe, con «Al catálogo» de una capacitación a la vista: *"todo lo que pusiste en catálogo para mí es proveedor"*; *"deja uno solo y mete todo ahí"*). Corrige la decisión 57, que dejaba aparte «lo que de verdad falta en el catálogo»: todo lo que la empresa no tiene, aunque haya que comprarlo o crearlo (materiales, impresiones, diplomas, relatores, un local ajeno), va en el pedido al proveedor. El motor lo junta al armar (`leerArmado`), así también llega al comentario interno de la cotización, que antes solo llevaba lo subcontratado; y la pantalla suma lo de las ofertas armadas antes.
    - **4 Lo que tienes que presentar**: los documentos por parte del portal (administrativa, técnica, económica). Los formularios van aquí con su estado: la lista aparte «Formularios para llenar» se quitó porque los repetía.
    - **5 Pregúntale a la IA**, abierto, con el cuadro para preguntar y las últimas respuestas a la vista (Felipe: *"debe ser el bloque 5 y más protagonista"*). Felipe preguntó si ponerle un nombre a la IA; se propuso «Eva», que sale de Eventia y no de Valle del Sol porque Eventia se vende a otras empresas, o dejar «Asistente», como en la bitácora. Queda por decidir.
    - Al final, plegados (*"me gusta que existan estos plegables"*): para el proveedor, lo demás de la oferta, «Otros detalles a considerar» (los detalles que van al comentario interno de la cotización; Felipe le puso ese título), las fechas clave y garantías y las otras condiciones, cada uno con cuántos tiene.
    - Cómo se juntan: la oferta y el análisis leen las mismas bases punto por punto, así que cada exigencia toma la línea de la oferta con más palabras en común (y la misma página); una línea va a una sola exigencia. Lo que no calza con ninguna queda en «Lo demás de la oferta».
    - En una postulada antes de «Armar postulación» (26-10; Felipe: *"no está el desplegable del proveedor"*), el pedido al proveedor sale de los pendientes de sus anexos («Subcontratar y cotizar: …»), cosa por cosa, y el precio de «Cómo te evalúan», del precio con que se llenaron (`postuladasDeAntes.ts`).
81. **Los avisos de cada formulario, al día** (26-10, probado en el laboratorio y en producción ese mismo día; Felipe, al ver que en producción seguía el resumen general arriba del N°5: *"¿por qué sigue apareciendo esto?"* y *"pásalo a producción"*; antes, con la validación de toda la postulación arriba del N°5, que hablaba del N°3, del N°4 y del F30: *"¿esta validación que llegó acá al formulario 5?"*; *"que se actualicen los avisos: si son cosas que se corrigieron se deben eliminar, si no solo generan bulla"*).
    - Arriba del documento, en el editor, ya no va el resumen de la validación general: van solo los avisos de ese formulario, los mismos que salen bajo él en «Tus documentos» (lo que dejó la IA al llenarlo, lo que anotó al firmar y lo de la última validación).
    - **Lo corregido se va solo**: un aviso que cita un texto ('Adwards', «prespuesto») desaparece apenas ese texto ya no está en el documento, mientras escribes; uno de [COMPLETAR] o [ILEGIBLE], cuando ya no queda ninguno. Si la cita no estaba en el documento (es de las bases), el aviso no se toca.
    - Lo de una validación anterior a tus cambios vuelve solo si lo que cita sigue ahí; lo que no se puede comprobar con el texto se cuenta («1 aviso no se puede comprobar aquí») y «Volver a validar» lo revisa.
    - Queda para después: que «Volver a validar» dentro del documento revise solo ese formulario (paso 2, con el motor).
82. **La letra del formulario manda** (26-10, probado en el laboratorio y en producción ese mismo día: *"pásalo a producción"*; Felipe, con el Formulario N°5 de la 5040-14-LE26 abierto: *"¿por qué pareciera que los tipos de letra son diferentes?"*. El formulario del municipio estaba entero en Calibri y lo que escribió la IA, los montos y los diez «No aplica», en Times New Roman. Felipe: *"dejemos por defecto siempre Calibri"*; se acordó que mande la letra del mismo formulario y Calibri solo cuando no haya de dónde copiarla, porque hay municipios que usan Arial u otra: *"ok, sí a ambos"*).
    - **Por qué pasaba**: la habilidad de Word escribe en una celda vacía una corrida sin letra, que toma la base del documento (en ese Word, Times New Roman 12) y no la de la celda (Calibri 11, puesta corrida por corrida).
    - **La regla** (`postulacion/la-letra-del-formulario.ts`): una corrida sin letra propia ni estilo de carácter, que se ve con la letra base del documento, toma la letra y el tamaño del texto con letra propia más cercano: su párrafo, su celda, su fila, su tabla y, si no, la letra de más de la mitad del documento. Si el Word no dice ninguna letra, Calibri. Lo que el formulario pone con un estilo (un título, una tabla con su letra) no se toca, y el texto no cambia ni una letra: si cambiara, el Word queda como llegó.
    - **Dónde se aplica**: a los Word que entrega la IA, antes de guardarlos en «Mi postulación», y al guardar desde el editor. Así un Word llenado antes de esta regla queda bien con solo escribir algo y guardarlo: el N°5 de la 5040-14-LE26 se arregla escribiendo en el editor sus precios unitarios, que quedaron en blanco.
    - Si el formulario mismo mezcla letras sin decirlas, lo que va en la letra base pasa a la del texto de su lado.
83. **«Validar todo» revisa el ZIP entero contra las bases** (26-10, probado en el laboratorio y en producción ese mismo día: *"pásalo a producción"*; Felipe, con el «Revisar» del programa de integridad, que sí tenía: *"el programa de ética lo tengo, entonces no entiendo por qué dice revisar"*; después: *"validar todo debe validar todo lo que está en el ZIP contra las bases, ¿o me equivoco?"* y *"sí, armemos eso para que el validador sea nuestro seguro de que está todo en orden en la licitación"*).
    - **Por qué pasaba**: la validación leía solo «Mi postulación». De «Mi empresa» le llegaban el nombre y el vencimiento, no el archivo, así que del programa de integridad no podía decir si traía la política, los protocolos, el canal de denuncia y la certificación del personal, y lo dejaba en «revisar». Los respaldos de la experiencia tampoco los leía.
    - **Ahora lee lo mismo que va en el ZIP** (`analisis/el-zip-para-validar.ts`, con las piezas de `ElSetService.piezas`): cada formulario, lo subido a mano, los documentos de «Mi empresa» que van y los respaldos que van dentro del PDF de un anexo, cada uno con su carpeta en el título («2. Técnica / Formulario N°4…»). La IA los lee por dentro (que digan lo que piden las bases, vigentes, firmados y con los datos de la empresa) y avisa si un documento va en una carpeta del ZIP que no es la que piden.
    - **Lo que no se puede leer no corta la validación**: una foto o un Excel, y los PDF que no caben en un pedido (más de 22 MB juntos; queda fuera primero lo de menos: los respaldos, después la carpeta y al final los formularios), van a «No leyó» con su motivo y se revisan por su nombre. Antes, pasar de 22 MB daba un error y no validaba nada.
    - En la pantalla, la línea de la última validación dice cuántos archivos del ZIP leyó. Cuesta más que antes porque lee más páginas.
    - `NOMBRES_DE_DOCUMENTO` se mudó a `oferente/nombres-de-documento.ts`: la validación ahora usa el set, y el set los tomaba de la validación (se habrían importado en círculo).
84. **Todas las salvedades en «Validar todo»** (26-10 en la noche, probado en el laboratorio y en producción ese mismo día: *"pásalo a producción"*; Felipe, primero con el plazo sin firmar: *"y acá no me apareció que me falta firmar un papel"*, y después con el jugo del Formulario N°4 bajo el formulario: *"estas salvedades y todas saquémoslas de acá y coloquémoslas siempre en el punto 3 de validación así ordenamos, a mí se me pasó completamente"*). Corrige el reparto de la 79.
    - **2 Tus documentos** queda solo con cada documento, su estado (firmado, por completar, por revisar, por firmar o subido), «Abrir» y «Firmar». Si alguno tiene algo pendiente, la línea de arriba lo dice: *«Lo que falta o hay que revisar de cada uno está en el paso 3, «Validar todo».»*
    - **3 Subir a Mercado Público** lista todo lo pendiente bajo «Validar todo»: primero cada documento con algo por hacer, por su N° y con su nombre, y debajo lo que dejó la IA al llenarlo, lo que anotó al firmar, lo de la última validación y la firma que falta (*«Falta la firma.»*, también en un Word sin nada más que decir); si cambió después de validar, *«Cambió después de la última validación: vuelve a validar»*. Después, lo que no es de ningún documento, como antes. Un documento sale con «Falta» si algo falta, y si no, con «Revisar».
    - La lista sale aunque todavía no se haya validado (las firmas que faltan y lo que dejó la IA); el veredicto y la línea de «Bases y criterios» salen solo con una validación.
    - El editor no cambia (decisión 81): arriba del documento siguen solo los avisos de ese formulario.
    - Las notas se calculan igual (`notasDeLaPostulacion`); lo nuevo es `pendientesPorDocumento`, que las ordena para la lista.
85. **Grave en rojo, menor en amarillo** (26-10 en la noche, probado en el laboratorio, donde la IA marcó 12 graves y 1 menor en la oportunidad 40 por US$0,16, y en producción el 27-10 pasada la medianoche; Felipe, con todo en amarillo en «Validar todo»: *"me llama la atención que no distinga una falta menor en amarillo a una grave en rojo, que falte un formulario es grave"*; y *"sí ármalo en laboratorio y producción"*).
    - **Grave** (rojo): lo que puede dejar la oferta fuera de bases o anularla (hasta la decisión 105, también lo que le costaba puntaje): un formulario o documento que falta, una firma que falta, un dato obligatorio en blanco, algo que no cubre lo pedido, un documento vencido o que no acredita lo que piden. **Menor** (amarillo): lo de forma (redacción, ortografía, nombres de archivo, sugerencias). En la lista va primero lo grave.
    - **Lo dice la IA al validar**: cada requisito trae `gravedad` (`grave` o `menor`) y lo que no es de un requisito se reparte entre `otros_graves` y `otros_problemas` (lo que quedó [COMPLETAR] o [ILEGIBLE] es grave; la ortografía, menor). En una validación de antes, que no lo trae, es grave lo que falta o venció, y lo que se revisa si las bases lo piden como obligatorio (el orden del análisis, si calza con el de la validación).
    - En lo de cada documento, lo que falta (lo que dejó la IA por completar y la firma) es siempre grave; lo que se revisa, según la validación.
    - **Lo que falta en el ZIP, arriba y sin validar**: cada documento que las bases piden **como obligatorio** con la oferta y no está (lo no obligatorio lo ve la validación al leer el ZIP: en la 5040-14-LE26 salía en rojo «la certificación de que el personal conoce el programa», que va dentro del mismo programa) (un formulario que no se armó o se borró, un certificado que falta o vence antes del cierre), del mismo cruce de «Lo que tienes que presentar» (`useChecklistDeDocumentos`). Con algo así, el veredicto es *«Todavía no: falta algo obligatorio»*, diga lo que diga la última validación. Si la validación ya lo nombra igual, no se repite.
    - Las pruebas de «Validar todo» pasaron a `ValidacionDeDocumentos.test.tsx` (`AnalisisYValidacion.test.tsx` había pasado las 800 líneas).
86. **«Armar postulación» es solo el precio** (27-10, probado en el laboratorio y en producción ese mismo día; Felipe: *"en armar postulación primero muestra la experiencia (yo no la mostraría, no todas las licitaciones piden experiencia y si las piden solo mostraría abajo un aviso en caso de que la IA no encuentre en mi empresa o Eventia experiencia suficiente), luego hay una lista de los formularios, también fuera, eso está en el análisis de bases... luego está el precio a colocar ok, el punto 1 qué ofreces ya no tiene sentido... el punto de anexos del comprador... y propuesta valorizada lo mismo"*; y *"sí me parece bien"*). Corrige el proceso estricto de la 76 en un punto: **la empresa ya no confirma la experiencia a mano**.
    - **Queda el precio y el botón.** Se fueron la lista de formularios (está en «Bases y criterios», en «Lo que tienes que presentar»), el bloque de la experiencia y los tres pasos («Qué ofreces», «Anexos del comprador» y «Propuesta técnica valorizada»). Mientras arma, una línea: *«Armando tu postulación… suele tardar entre 3 y 8 minutos»*. Si algo falla, una línea roja con el error y «Reintentar» con el mismo precio. Lo armado sale en «Tus documentos» y lo pendiente, en «Validar todo».
    - **La experiencia la elige la IA al armar** (`LaExperienciaService.paraArmar`): si las bases la piden, cuando la oferta quedó lista usa la confirmada; si no hay, confirma sola la última propuesta, marcada `automatica`; si no hay ninguna propuesta, la pide y la espera, cada 5 segundos y hasta 5 minutos. Si no resulta, se arma igual, sin experiencia. Sigue con las mismas reglas de la 76: primero las órdenes de Mercado Público de «Mi empresa», después Eventia, y solo los clientes que se pueden mostrar.
    - **Un aviso solo si no alcanza** (`avisoDeExperiencia`): *«La IA encontró N contratos con respaldo y las bases dan el puntaje máximo con M. Sube órdenes de compra a «Mi empresa» o las facturas de tus eventos en Post-venta, y vuelve a armar.»*, o que no se pudo elegir. Sale en la barra de la postulación armada y en el panel.
    - Se borraron `LaExperiencia.tsx` (con su prueba), `FormulariosDelAnalisis.tsx` y `EstadoDeGeneracion.tsx`, que solo usaba este panel. Las rutas del motor para proponer y confirmar quedan, sin pantalla.
    - Lo pedido justo antes, la noche del 26-10, mostró por qué: una propuesta nueva sin confirmar frenó «Volver a armar» del N°4 de la 5040-14-LE26, y confirmarla por la API era una decisión de la empresa.
    - Queda por decidir (Felipe, *"esto de tener recelos de algunas experiencias es algo mío, no del sistema para escalar"*): dar vuelta «Los clientes que se muestran». Hoy solo se muestran las empresas privadas de la lista; la propuesta es que se muestren todas y se marque «No mostrar» en las que se quieran esconder. Los organismos públicos se muestran siempre y las personas naturales, nunca. El 27-10 Felipe lo dejó en espera: *"quizás en la ficha del cliente podemos poner un clic o algo... o un botón al contrario de cliente confidencial... y lo bloqueamos desde el cliente 360"*.
    - De paso, el 27-10, «Traer los documentos» queda quieto al apretarlo (Felipe: *"cuando pincho el botón traer documentos, este baja para cargar... ¿puedes dejarlo quieto?"*): el aviso «Puedes salir de la ficha» iba antes del botón y lo empujaba a la línea de abajo; ahora va debajo, y el botón guarda el ancho de su texto largo mientras dice «Trayendo…». El 28-10 (Felipe: *"cuando pincho traer documentos, y se pone a pensar este botón se baja"*) quedó siempre arriba a la derecha, al lado del título: con la lista abierta, como parte una licitación sin documentos, el texto explicativo lo echaba abajo a la izquierda y el aviso, al aparecer, lo corría. Ahora el texto se acomoda a su lado y el aviso guarda su lugar aunque no se vea; en el teléfono el botón va debajo del texto.
87. **«Validar todo» avisa solo lo que importa, y los precios siempre** (27-10, probado en el laboratorio y en producción ese mismo día; Felipe: *"hay validaciones que son de escrituras... veamos cuáles de esas puedo corregir, cuáles de esas tienen que estar y cuáles de esas en realidad está de más que estén. Para ya empezar a postular de forma masiva"*; y, al ver la propuesta: *"quedé afuera de la licitación del Día del Funcionario Quillón porque no incluimos los precios netos... creo que esto debería estar en la validación y revisar que estén todos los precios netos"*). Solo cambian las instrucciones de la IA que valida (`instruccionesDeValidacion`): sin migración ni pantalla.
    - **Los precios, siempre y uno por uno.** En la oferta económica, cada ítem o línea con su precio (neto, unitario o total, según las columnas del formulario), el neto, el IVA y el total. Una celda de precio en blanco, un precio que no está en neto cuando lo piden en neto, sumas que no cuadran, decimales cuando los piden sin decimales o un total sobre el presupuesto son **graves**: la oferta económica no se corrige después del cierre. Va en el requisito de la oferta económica, o en «otros graves» si el checklist no lo trae. Las líneas a las que no se postula no llevan precio. En la 1532886-5-LE26 (Día del Funcionario, postulada el 19-10), la validación de ese día dijo «cumple» al Anexo N°5; la del 26-10 vio la columna de precio neto por ítem vacía, pero la dejó en «conviene completarla». Al llenar, la IA deja en blanco el desglose que no tiene (nunca un precio a dedo) y lo anota en pendientes: la validación es la que no lo deja pasar.
    - **Lo que ya no se avisa**, porque no se puede o no vale la pena corregir: cómo se escribe un nombre o una razón social (con o sin tilde, en mayúsculas, SpA o SPA: va como en el documento de donde sale); la ortografía, las tildes, las mayúsculas o el género de una palabra en los PDF y en los documentos de terceros; lo que viene escrito en el formulario del comprador; las sugerencias de estilo (en los Word, solo las faltas y las frases que no se entienden); la redacción o el formato de los documentos de terceros (de ellos solo importa si sirven, si están vigentes, a nombre de quién están y qué acreditan); los nombres de los archivos; los documentos que las bases no piden con la oferta (el F30, que se pide al contratar); y los consejos que no son de los documentos, como la operación del día del evento. Una pregunta al foro, solo si puede cambiar la admisión o el puntaje.
    - **Lo que se sigue avisando**: lo que cambia el sentido o un dato en cualquier documento (una frase cortada, un RUT, un monto, una fecha o un lugar distintos), la ortografía de los Word que la empresa todavía edita en Eventia (decisión 78), lo que quedó [COMPLETAR] o [ILEGIBLE] y todo lo que puede dejar la oferta fuera o costarle puntaje.
    - Medido a mano con la validación de las 00:35 del 27-10 de la 5040-14-LE26: de 12 avisos menores quedaban 4 (la patente a nombre de otra empresa, para el foro; la distancia distinta entre documentos; la frase cortada de la declaración de uso de patente, y el registro de difusión del programa de integridad sin fecha).
88. **«Validar todo» es el contralorito: revisa si la empresa está habilitada para lo que ofrece** (27-10, probado en el laboratorio y en producción ese mismo día, junto con la 89; Felipe: *"el validador tiene que revisar todo. Porque tiene que ser nuestro contralorito interno en el cual valide que lo que estamos mandando cumple con la normativa. Por ejemplo, algo que no me ha detectado el validador es que mis resoluciones sanitarias no me permiten tener un restaurante"*). Solo motor: sin migración ni pantalla.
    - **Lo que habilita a la empresa se lee aunque no vaya en el ZIP** (`loQueLaHabilita`): de «Mi empresa», las resoluciones sanitarias y los respaldos de la patente, todos, y de la patente y el inicio de actividades, el más nuevo. Van con el título «Mi empresa, no va en el ZIP», entran al tope de 22 MB como documentos y no cuentan en «leyó N archivos del ZIP».
    - **La empresa habilitada, siempre, aunque las bases no lo pidan.** Con esos documentos, la IA revisa que la empresa pueda hacer por ley cada servicio que ofrece: preparar o servir alimentos exige una autorización sanitaria de la SEREMI de Salud para eso (Reglamento Sanitario de los Alimentos); una piscina de uso público, la suya; el alojamiento, la suya; los guardias, el OS10. Mira a nombre de quién están y si la capacidad autorizada alcanza para lo que se ofrece (personas, usuarios, bañistas, huéspedes). Lo que falta o no alcanza es grave: aunque la comisión no lo pida, puede dejar fuera la oferta o terminar el contrato, y la SEREMI puede multar o clausurar. Lo que no va con la oferta sigue sin avisarse (87), salvo lo que habilita a la empresa.
    - **Con lo demás, pero nunca hacia el comprador.** Felipe, al ver la prueba: *"es una advertencia que tiene que existir, pero no nos vamos a autodelatar... y mientras tengo que seguir mandando los documentos"*, y después: *"las observaciones estaban bien donde estaban, solo que no quería que se informara al cliente"*. Van en la misma lista, en rojo, y la IA dice qué tiene que hacer la empresa para quedar habilitada, sin sugerir explicarlo en la postulación ni subir documentos que muestren lo que falta. Un recuadro aparte, «Para tu empresa», que no contaba para el veredicto, se probó en el laboratorio y se descartó el mismo día.
89. **«Validar todo» revisa toda la documentación de la empresa** (27-10, probado en el laboratorio y en producción ese mismo día; Felipe: *"finalmente el objetivo es que el validar todo revise toda la documentación, la que genera el sistema y la que se obtiene de otras fuentes, y advierta cualquier inconsistencia (técnica) más que de forma: resoluciones, F30 vigentes, vigencia de la empresa (a veces piden no mayor a 60 días, otras 30), TGR, DICOM, certificado de quiebra, etc."*; y *"sí, ármalo en laboratorio y producción"*). Amplía la 88. Motor y pantalla, sin migración.
    - **Lee toda la carpeta de «Mi empresa»**, vaya o no en el ZIP (`loDeMiEmpresa`, que reemplaza a `loQueLaHabilita`): de los certificados que se renuevan (patente, inicio de actividades, programa de integridad, F30, F30-1, vigencia, declaración de los trabajadores, e-RUT, no quiebra, TGR y DICOM), el más nuevo; de las resoluciones, los respaldos de la patente, los estatutos y lo demás, todos. Los respaldos de experiencia que no van en el ZIP no se leen. Si no cabe todo en los 22 MB, lo que no va en el ZIP es lo primero que queda fuera.
    - **Con lo que piden las bases**: la validación recibe también la lista de documentos del análisis, con cuándo se piden (con la oferta, al adjudicar o contratar, para el pago) y la vigencia o antigüedad que exigen.
    - **El fondo, no la forma**: que cada certificado esté vigente al cierre y cumpla la antigüedad que fijan las bases (por ejemplo, emitido hace no más de 30 o 60 días); que no muestre problemas por dentro (deudas en la TGR, morosidades o protestos en el DICOM, deudas o multas laborales en el F30 o el F30-1, una quiebra, una sociedad no vigente); que los datos calcen, y la habilitación de la 88. Lo que se pide al adjudicar, contratar o pagar también se revisa: si no va a estar vigente cuando lo pidan, dice la fecha en que hay que renovarlo. Es grave si puede dejar fuera la oferta, impedir contratar o costar puntaje, y menor si solo hay que renovarlo. Siempre para la empresa, nunca hacia el comprador.
    - Cambia una regla de la 87: el F30 que no va con la oferta vuelve a revisarse.
    - **Dos tipos nuevos en «Mi empresa»**: el certificado de deuda fiscal (`tgr`) y el informe comercial (`dicom`), también en el análisis de las bases y en «Lo que tienes que presentar», que los reconoce por el nombre si un análisis de antes los dejó en «otro». No van solos en el ZIP: el set no los agrega a «4. Otros».
    - Las pruebas de las instrucciones pasaron a `instrucciones-de-validacion.spec.ts`, porque `validacion.service.spec.ts` había pasado las 800 líneas.
    - Probado en el laboratorio con la 1532886-5-LE26 y los certificados de producción copiados a la carpeta del laboratorio. Avisó que el F30 vence el 31-10, que el F30-1 fue emitido para otro contrato (otra empresa principal) y que las resoluciones están a nombre de otras sociedades. También avisó los 100 usuarios de la de agua y alcantarillado y la columna de precio neto vacía del N°5. Como también dijo que la vigencia y la quiebra «están en orden», se agregó que no avise lo que está bien: solo lo que hay que hacer o revisar.
    - **Desde la decisión 90 lee solo el ZIP**: lo de «Mi empresa» que no va, y lo que se pide al adjudicar o pagar, ya no se revisa.
90. **El ZIP lo arma la sección 4, la vigencia la fijan las bases y «Validar todo» lee solo el ZIP** (27-10, probado en el laboratorio y en producción ese mismo día; Felipe: *"debe leer solo el zip y el zip se debe armar en función de lo que piden las bases, lo que piden las bases debe armarse con el análisis de las bases de IA en la sección 4 lo que tienes que presentar... Si las bases de licitación te dicen que el certificado de vigencia no puede ser mayor a 30 días, ese es el criterio. Entonces los documentos vencen en función de lo que dicen las bases y no necesariamente lo que tenemos nosotros definido como fecha de vencimiento"*; y sobre «4. Otros»: *"sí está bien, deja todo eso en otros"*). Corrige la 88 y la 89. Motor y pantalla, sin migración.
    - **«Validar todo» lee solo el ZIP**: sale `loDeMiEmpresa`. Lo que no va en el ZIP no se lee, y tampoco se revisa lo que se pide al adjudicar o pagar. Las reglas del fondo de la 89 (vigencia, deudas, morosidad, multas, quiebra, datos y habilitación) se aplican a lo que va en el ZIP. Felipe, sobre lo que eso deja fuera: *"está ok, pero cuando las bases pidan resolución será un problema"*: si las bases la piden, va en el ZIP y el validador la revisa.
    - **El ZIP toma de «Mi empresa» lo que pide la sección 4 con la oferta** (`pedidosDeLaSeccion4` en `postulacion/la-seccion-4.ts`, que usa `el-set.ts`): cada documento con `cuando` = con la oferta, por su `carpeta` (lo que el análisis dejó en «otro», por el nombre), en la parte que dice: administrativa, técnica, económica u «otra», que va a «4. Otros». Lo de UTP («solo si postulas como UTP»: en la 5040-14-LE26 la sección 4 pedía así los estatutos) y el Registro de Proveedores no van. Lo que falta se avisa solo si es obligatorio: en esa misma licitación, la certificación de que el personal conoce el programa no es obligatoria y va dentro del programa. Antes salía de los nombres de los requisitos, solo en la administrativa; un análisis de antes, sin la sección 4, sigue así. «4. Otros», con lo general para contratar, queda como estaba (decisión 38).
    - **La vigencia la fijan las bases** (`fijaUnPlazo`, igual en el motor y en la pantalla): si la condición de la sección 4 pone un plazo desde la emisión («no mayor a 30 días», «sesenta (60) días», «3 meses»), la fecha de vencimiento de «Mi empresa» no cuenta. La sección 4 muestra *«las bases piden: …»* en vez de esa fecha, el ZIP no avisa «venció», y la validación compara la fecha de emisión que dice el documento con el cierre. Si las bases solo piden que esté vigente, vale la fecha de «Mi empresa».
    - La validación recibe solo lo que la sección 4 pide con la oferta, con su plazo, y la fecha de «Mi empresa» le llega como referencia.
    - Probado en el laboratorio con la 1532886-5-LE26: el ZIP avisa solo lo obligatorio que falta (la patente y el inicio de actividades), y la validación leyó solo los 8 archivos del ZIP, sin nombrar las resoluciones ni el F30-1 de la carpeta.
    - Por qué no lo vio: en la 5040-14-LE26 las bases no piden la resolución sanitaria, no iba en el ZIP y la validación leía solo el ZIP (83). Desde la decisión 90 vuelve a leer solo el ZIP: la resolución se revisa cuando las bases la piden. Las cuatro resoluciones de «Mi empresa» autorizan el agua y el alcantarillado (calculado para 100 usuarios), la piscina y las cabañas; ninguna, preparar alimentos.
91. **En una compra ágil, el precio y el plazo van en el portal, y la sección 4 reconoce lo que hizo la IA** (27-10, probado en el laboratorio y en producción ese mismo día; Felipe, con la 1030177-85-COT26 en rojo: *"el plazo de entrega es de compra ágil"*, y *"sí, arréglalo, quiero empezar a subir las licitaciones cuando el validador me dé el pase"*). Motor y pantalla, sin migración.
    - **La validación sabe si es una compra ágil** (`compra_agil` en `ContextoDeValidacion`, de `ficha.proceso.tipo`). El precio y el plazo de entrega se declaran en el formulario de Mercado Público al ofertar, así que no traerlos en los documentos no es una falta; si las bases los evalúan, se recuerda en «menor» que hay que declararlos en el portal. Si un documento trae el precio, se revisa como siempre (87).
    - **La sección 4 reconoce lo que hizo la IA** (`checklistDeDocumentos.estadoDe`): lo que el análisis dejó en «otro» se cruza por el nombre con todo «Mi postulación», no solo con lo subido a mano, igual que un formulario: firmado, subido o hecho por la IA sin firmar. En la 1030177-85-COT26 la propuesta técnica firmada salía como «falta», en rojo, y frenaba el veredicto, aunque iba en el ZIP y la validación la había leído; venía de la 85.
92. **El resultado de lo que postulaste llega solo, y te avisa** (27-10, probado en el laboratorio y en producción ese mismo día; Felipe, con la del catamarán, 1346350-37-COT26: *"la licitación de 7.500.000 cerró, la perdí y no me avisó el sistema"*; cuando se vio que el comprador ya había elegido: *"usa ese mismo criterio para evaluar las ofertas... para comparar siempre ocupa el criterio (1) de cómo te evalúan"*, y *"sí, ármalo así"*; y después: *"la licitación igual debe marcarse sola, pues a ver si fueron ganadas o perdidas"*). Motor y pantalla, sin migración.
    - **Media hora después de cada pasada del radar** (`RESULTADOS`, a las :37 de las 2, 5, 9, 12, 15, 18 y 23, unos 10 minutos; `ResultadosDePostuladasService` en `competencia/resultados.service.ts`) se miran las licitaciones postuladas que ya traen su adjudicación (sin preguntarle a Mercado Público: ya están en la base) y se vuelve a pedir el detalle de cada compra ágil que la empresa postuló y ya cerró, hasta 45 días después del cierre. Antes solo la vuelta de la noche (71) miraba las compras ágiles, una vez al día, y nunca cambiaba el estado.
    - **Las licitaciones**: el radar revisa por código y de cualquier región las licitaciones postuladas, como las seguidas (decisión 30: `procesosSeguidos` toma «seguida» y «postulada»), hasta leer su acta. Las postuladas van primero y en cada pasada del radar (las no revisadas en 2 horas; las pasadas van de a 3 horas o más); las seguidas, una vez cada 20 horas. Felipe, el 27-10: *"al menos que sea en cada revisión del radar"*: al principio también las postuladas eran cada 20 horas, y una adjudicación podía llegar con casi un día de atraso. Antes una postulada solo se revisaba en la pasada general, dentro de las regiones configuradas y entre las 300 recién cerradas, y podía no verse nunca adjudicada. Cuando trae la adjudicación (`mp_procesos.adjudicacion`), `resultadoPublicoDeLicitacion` toma a quiénes adjudicaron (`ganadoresDe`, del que se llevó más al que menos): si está la empresa, «ganada», con lo suyo; si no, «perdida», con a quién y por cuánto. Desierta, revocada o sin ganadores con RUT no se marca. No hay lugar por precio: en una licitación mandan los criterios de las bases, y por qué se perdió es otro paso (traer las ofertas de los demás y que la IA lo explique debajo de la predicción).
    - **Lo que trae el detalle de una compra ágil, medido el 27-10 con la del catamarán**: mientras está «Cerrada» (`estado.id_estado` 3), `proveedores_cotizando` viene vacío; con «Proveedor seleccionado» (4) trae todas las ofertas, cada una con `rut_proveedor`, `razon_social`, `monto_total`, `valor_neto`, `productos_cotizados`, `justificacion_inadmisibilidad` y `proveedor_seleccionado` (1 o 0). `id_orden_compra` es un número interno (55732521), no el código de la orden: no sirve para leer su ficha pública. La primera versión de la 92 esperaba ese código y nunca habría marcado nada.
    - **Se compara con el criterio de «Cómo te evalúan»** (la sección 1 del análisis). Hay dos caminos: en una licitación mandan los criterios de las bases; en una compra ágil manda la ley (decisión 93): gana el menor precio. `resultadoParaLaEmpresa` (`competencia/resultado-compra-agil.ts`) toma a quien quedó elegido: si es la empresa (por RUT, aunque venga escrito distinto) queda «ganada»; si no, «perdida». En una compra ágil, además, ordena por `monto_total` las ofertas admisibles y deja el lugar de la empresa, lo que cotizó y si tenía el menor precio y eligieron a otro (`era_la_mas_barata`: la ley obliga al comprador a justificarlo en la orden de compra). Una oferta con `justificacion_inadmisibilidad` no se compara; si es la de la empresa, se dice por qué quedó fuera. Solo cambia el estado si sigue en «postulada»: lo que la empresa marcó a mano no se pisa, pero igual se anota a quién eligieron (Felipe ya había marcado perdida la del catamarán).
    - **Dónde queda**: lo público (`resultadoPublicoDeCompraAgil` o `resultadoPublicoDeLicitacion`: a quién eligieron o adjudicaron y, en una compra ágil, todas las ofertas, con RUT, nombre, total y si quedó fuera) va en `mp_cambios`, con tipo «resultado», una vez por código: es igual para cualquier empresa. No va en `mp_procesos` porque el radar reescribe `adjudicacion` y la vuelta de la noche reescribe `cotizantes`. Lo de cada empresa (ganada o perdida, lo que ofertó, su lugar y si era la más barata) se calcula al leer, con su RUT (`resultadoParaLaEmpresa`): Eventia la usan varias empresas y el mismo código puede ser de dos. `ResultadosRepository` (`competencia/resultados.repository.ts`) lo lee para «Mis licitaciones», que trae `resultado` en las ganadas y perdidas, y la ficha lo dice en «Historial de cambios»: *«eligieron a X por $Y»* o *«adjudicaron a X por $Y»*.
    - **En pantalla**: la tarjeta de «Mis licitaciones» dice, por ejemplo, *«Eligieron a BPM EVENTOS SPA por $6.800.000. Tú cotizaste $7.090.000, $290.000 más, y quedaste 2° de 2 por precio.»* o *«Te eligieron por $X, 1° de N por precio.»*; en una licitación, *«Adjudicaron a X por $Y.»* o *«Te adjudicaron por $Y.»*. En gris si perdiste, en verde si ganaste y en rojo si en una compra ágil tenías el menor precio y eligieron a otro (*«…aunque tu precio de $X era el menor. Por ley gana el menor precio: el comprador tiene que justificarlo en la orden de compra.»*). Al abrir Oportunidades sale un aviso que queda hasta cerrarlo, una vez por resultado en ese navegador, con los mismos colores (`useAvisoDeResultados` y `colorDelResultado`, en `resultadoDeCompraAgil.ts`).
    - Queda por ver la compra ágil que se cierra sin elegir a nadie (desierta o cancelada): sigue en «postuladas» hasta los 45 días; y la licitación desierta sigue en «postuladas». Desde la 95, una compra ágil puede traer los criterios de la solicitud: desde la 97, el lugar por precio y el aviso rojo salen solo si el criterio es el de la ley. Y la lectura de la noche (71, `cotizantesDeCompraAgil`) busca el nombre y el monto por el nombre del campo, sin conocer la forma real: puede tomar `valor_neto` en vez de `monto_total`, o «IVA» (`nombre_impuesto`) como nombre. Se ajusta con un OK aparte.
93. **En una compra ágil, por ley gana el menor precio** (27-10, probado en el laboratorio y en producción ese mismo día; Felipe: *"revisa cuál es el criterio de selección de las compras ágiles porque no me trae cómo se elige y me da la sensación de que quizás eso está normado por ley, que el precio más bajo"*, y *"sí ármalo"*). Solo pantalla, sin migración.
    - Lo está: la Ley 19.886, modificada por la Ley 21.634, y el artículo 97 de su reglamento (Decreto 661) dicen que la compra ágil es hasta 100 UTM, con al menos tres cotizaciones y, por regla general, con empresas de menor tamaño y proveedores locales. Si no eligen la cotización de menor precio, tienen que justificarlo en la orden de compra. El Observatorio de ChileCompra ya objetó una justificación que solo decía «cumple lo requerido» (Til Til, 2025), y la Directiva 35/2025 la reglamenta.
    - **En «Cómo te evalúan» de toda compra ágil** (`Criterios` en `AnalisisDeBases.tsx`, con `ficha.proceso.tipo === 'compra_agil'`): arriba, *«Por ley, gana el menor precio»*, con cómo va tu precio y lo que dice la ley. Los criterios que agregue el comprador, como el plazo de entrega, van debajo, con el título *«Lo que agrega el comprador»*. Una compra ágil sin criterios ahora sí muestra el bloque.
    - **Cambiado por la decisión 95**: la ley ya no va encima de los criterios del comprador. Si la solicitud los trae, mandan esos; si no, el de la ley, y es el mismo criterio para la comparación y para «Validar todo».

94. **Una compra ágil sin formularios no tiene anexos: va la propuesta técnica valorizada** (27-10, probado en el laboratorio y en producción ese mismo día; Felipe, con la 3497-466-COT26: *"como no hay formularios no arma nada... es compra ágil, ahí usemos el formato de la casa para sacar la propuesta técnica valorizada"*, y *"ok hazlo"*). Motor y pantalla, sin migración.
    - La propuesta valorizada, con el formato de la casa y el valor neto, el IVA y el total, ya se armaba: en la 3497-466-COT26 salió el 26-10. Lo que fallaba era el paso de los anexos, que en una compra ágil sin formularios no tiene qué llenar. Dejaba en rojo *«Los anexos: Los anexos: No hay formularios para llenar…»*, con el nombre repetido.
    - **`ArmarPostulacionService.armar`**: si es una compra ágil (`proceso.tipo` en `PostulacionRepository.oportunidad`) y el análisis no trae formularios que apliquen, anota `anexos: false` en la oferta y la propuesta va siempre. `seguir` no pide los anexos y solo limpia los borradores que sobran. Una licitación sin formularios sigue con el aviso, que ahí sirve, porque el análisis puede no haberlos encontrado.
    - **En la pantalla**, `vueltaDeLaPostulacion` deja los anexos en «no va». Y la línea roja de un paso que falla ya no repite su nombre (`sinSuNombre` en `ArmarPostulacion.tsx`).

95. **Los criterios de una compra ágil: los de la solicitud y, si no trae, el de la ley** (27-10, probado en el laboratorio y en producción ese mismo día; Felipe, con la comparación del catamarán, 1346350-37-COT26, que respondía *«El análisis de las bases no trae criterios de evaluación»*: *"cuando analizo la base, esto tiene que identificar si es una licitación o una compra ágil. Si es licitación, trae los criterios de evaluación de la base. Si es compra ágil, los de la ley... y al momento de comparar ofertas, ocupa el mismo criterio de evaluación que ya está identificado al momento de analizar las bases"*, y *"usa los de él; si no, lo de la ley... pero no sé si legalmente en compra ágil pueda cambiar los criterios"*). Cambia lo que muestra la 93. Motor y pantalla, sin migración.
    - **Sí puede**: la Directiva 35/2025 de ChileCompra (http://www.chilecompra.cl/wp-content/uploads/2025/12/563BRes-Directiva35CompraAgil.pdf) dice que el comprador puede evaluar con otros criterios, como el plazo o la calidad, si los detalla en la solicitud de cotización. Si no los detalla, se elige la oferta más económica que cumpla los requisitos técnicos mínimos, y si eligen otra deben justificarlo con parámetros objetivos.
    - **Un solo lugar** (`analisis/criterios-de-evaluacion.ts`, `criteriosDeEvaluacion`; en la vitrina, `pages/oportunidades/criteriosDeEvaluacion.ts`, igual): los criterios de las bases o de la solicitud y, en una compra ágil que no trae ninguno, `CRITERIO_DE_LA_LEY` («Menor precio», 100 %, con `de_la_ley`). Una licitación sin criterios sigue sin criterios.
    - **El análisis lo guarda así** (`AnalisisService`, con `ContextoDeBases.tipo` de `ficha.proceso.tipo`; el tipo no entra en las instrucciones, así la caché de las bases no cambia). Un análisis de antes se completa al leerlo: la comparación, «Validar todo» y la lectura del acta usan la misma función, y el 400 *«no trae criterios»* queda solo para una licitación. Así la comparación del catamarán funciona sin volver a analizar.
    - **«Cómo te evalúan»** muestra las barras de esos criterios. En una compra ágil, una línea dice de dónde salen: *«La solicitud no trae criterios: por ley gana la cotización más económica que cumpla lo técnico.»*, o *«Son los criterios de la solicitud. Sin ellos, por ley ganaría la más económica que cumpla lo técnico.»*. Sale la cabecera de la 93, que ponía la ley encima de los criterios del comprador.
96. **Las ofertas de la competencia llegan solas** (27-10, probado en el laboratorio y en producción ese mismo día; Felipe: *"si yo no las cargué, que tú lo trajeras una vez que la gané o perdí y obtener un feedback del porqué"*). Solo motor, sin migración.
    - **Cuándo**: en la misma vuelta de la 92 (`RESULTADOS`, media hora después de cada pasada del radar), después del resultado: las licitaciones de la empresa ganadas o perdidas en los últimos 7 días, por su última actualización, que no tienen ninguna oferta de la competencia subida (`ResultadosRepository.licitacionesSinCompetencia`). Si la empresa ya subió alguna, no se trae nada.
    - **De dónde** (`competencia/ofertas-publicas.ts`, medido el 27-10 con la 4364-13-LE26): de la ficha pública al cuadro de ofertas (`imgCuadroOferta`), de ahí a su cabecera y al «Resumen de ofertas» (`SupplySummary.aspx`). Ahí está cada oferente con su RUT, nombre, total, estado y sus anexos administrativos, técnicos y económicos (`ViewBidAttachment.aspx`). Cada archivo se baja uno por uno con su botón «Ver anexo» (un POST con los campos ocultos de la página), página por página, de a 6; sin clave ni cookie. Bajar todos juntos pide un código de imagen, y ese camino no se usa. Solo se siguen enlaces de Mercado Público con esa forma.
    - **Qué se guarda** (`OfertasDeLaCompetenciaService`): los anexos de cada oferente que no es la empresa (por RUT), en la sección «competencia» de la comparación (decisión 41), con el nombre del oferente como `competidor` y sin `subido_por`. No se traen los comprimidos (ZIP, RAR, 7z: suelen repetir los PDF y la comparación no los lee) ni lo que pese más de 30 MB; hasta 80 archivos y 200 MB por licitación.
    - En la del Día del Profesor, Sol de Quillón trae 15 archivos en 3 páginas: los mismos 15 que Felipe subió a mano.
    - **Sigue en la 97**: la IA explica, debajo de la predicción de «Comparación de ofertas», por qué se perdió y si era razonable, con el criterio de «Cómo te evalúan» (`criteriosDeEvaluacion`, de la 95).

97. **Por qué perdimos, debajo de la predicción** (27-10, probado en el laboratorio y en producción ese mismo día; Felipe: *"que la IA haga la comparación de por qué perdimos. Entonces queda abajo está la predicción y luego está el por qué perdimos y si el haber perdido era razonable o no"*, y *"parte con el 3"*). Motor y pantalla, migración 166.
    - **Qué hace** (`PorQuePerdimosService`, en `comparacion/por-que-perdimos.service.ts`; lo que lee la IA, en `por-que-perdimos.ts`): cuando una postulada queda perdida y ya se sabe a quién eligieron (decisión 92), Opus 5.5 lee la oferta de la empresa (las piezas del set, como la comparación) y las de la competencia (subidas o traídas solas, decisión 96). Con eso, y con lo que el motor ya sabe, explica por qué se perdió, criterio por criterio, si era razonable (sí, no o dudoso, con la regla de las bases o la ley) y qué hacer distinto. Lo que el motor ya sabe: a quién eligieron y por cuánto, las cotizaciones de una compra ágil con el precio de cada producto (`mp_procesos.cotizantes`), el acta de una licitación (`mp_procesos.acta`) y lo que predijo la comparación antes del resultado. Es interno: no va en nada que se suba a Mercado Público.
    - **Con el criterio de «Cómo te evalúan»**: `criteriosDeEvaluacion` (decisión 95), los de las bases o de la solicitud y, en una compra ágil que no trae, el de la ley, que además le recuerda a la IA que el comprador debe justificar si eligió otra.
    - **Cuándo**: solo, en la vuelta de los resultados (`RESULTADOS`, después de traer las ofertas de la competencia), a las perdidas de los últimos 7 días sin su por qué, dos por pasada; lo que todavía no se puede explicar (sin resultado, sin análisis o sin la oferta de quien ganó) se intenta en la próxima. O con el botón «Explicar por qué perdimos» / «Volver a explicar» (`GET` y `POST /oportunidades/:id/por-que`). Se guarda en `oportunidad_generacion` con tipo `por_que` (migración 166, que agrega ese tipo al check).
    - **En pantalla** (`PorQuePerdimos.tsx`): en «Comparación de ofertas», solo en las perdidas, debajo de la predicción y antes de «Aprender del acta»: «Por qué perdiste», con el veredicto («Era razonable perder» en gris, «No era razonable perder» en rojo, «No se puede saber si era razonable» en ámbar), el resumen, el fundamento, en qué se perdió en cada criterio y «Para la próxima».
    - **Y el aviso de la 92 sigue el mismo criterio**: en una compra ágil, el lugar por precio y el aviso rojo de «por ley gana el menor precio» salen solo si el criterio es el de la ley; si la solicitud trae sus propios criterios, la tarjeta dice solo a quién eligieron y por cuánto (`resultadoParaLaEmpresa` con los criterios del último análisis, `AnalisisRepository.criteriosDe`).
    - **Y las licitaciones postuladas se consultan en cada pasada del radar** (ver la 92), para que el resultado, y con él este por qué, no llegue con un día de atraso.

98. **Con el criterio de la ley, sin «Ver cómo se calcula cada uno»** (27-10, probado en el laboratorio y en producción ese mismo día; Felipe, con «Cómo te evalúan» de una compra ágil sin criterios: *"creo que el ver cómo se calcula está de más"*). Solo pantalla, sin migración.
    - En `Criterios` de `AnalisisDeBases.tsx`, el detalle plegado no sale cuando el criterio es el de la ley (`esDeLaLey`, de la 95): la línea de arriba ya dice que gana la cotización más económica que cumpla lo técnico. Con los criterios de la solicitud o de las bases, el detalle sigue, porque explica cómo se calcula cada puntaje.
    - Lo que se deja de ver: el texto largo del criterio de la ley, el de justificar con parámetros objetivos, con la Ley 19.886 y la Directiva 35. Felipe lo sabe.

99. **Con todo firmado, «Armar postulación» dice «anexos: ya firmados»** (27-10 en el laboratorio y desde el 28-10 en producción; Felipe, sobre el rojo «Los anexos: No alcanzó a partir: reinténtalo.» de la 1030177-85-COT26, armada con los anexos ya firmados: *"si armalo"*). Motor y pantalla, sin migración.
    - Con todos los formularios firmados no hay trabajo de anexos que rehacer (`laVueltaAnterior`, decisión 49). Sin trabajo de anexos a los 3 minutos de la oferta, la pantalla lo daba por no partido (`vueltaDeLaPostulacion`): un rojo con «Reintentar» sin ningún error detrás.
    - `ArmarPostulacionService.seguir` anota en la fila de la oferta `firmados: true` antes de seguir con la propuesta. Si después algo falla, el problema se suma a la marca sin borrarla.
    - La pantalla lo lee como el paso «firmados»: no espera, no sale en rojo y no ofrece «Reintentar». La barra dice «Armada el … · $… con IVA · anexos: ya firmados». Una compra ágil sin formularios sigue sin anexos (decisión 94).
    - Lo armado antes de la 99 no tiene la marca. En producción, la única que hoy sale con ese rojo es la 1030177-85-COT26 (la oferta 69).
100. **Las ganadas, en su pestaña** (28-10, en el laboratorio y en producción el mismo día: *"a producción"*; Felipe: *"No me gusta que las cotizaciones perdidas queden con las ganadas. Las perdidas creo que está bien que queden ahí atrás, las ganadas... deberían estar en alguna parte más visible, para que no se me..."*. Vio dos dibujos, arriba de todo en «Mis licitaciones» o una pestaña propia, y eligió: *"me gusta la opción 2"*). Motor y pantalla, sin migración.
    - Una pestaña «Ganadas» al lado de «Mis licitaciones», con cuántas hay por cumplir. Arriba, «Por cumplir», en dorado y del próximo servicio al más lejano: a la derecha, en vez del cierre, el servicio («hoy» y «mañana» en rojo, o «en N días», con el día) y lo que dicen las bases. Abajo, «Cumplidas», desde el día siguiente del último día del servicio.
    - En «Mis licitaciones», al final y plegadas, quedan solo las perdidas: «Perdidas (N)».
    - Los días del servicio los lee el motor del último análisis listo, solo para las ganadas (`AnalisisRepository.serviciosDe`, `mias/servicio-de-la-ganada.ts`): el primer día que da la IA (`fecha_del_servicio_iso`) y los que nombra el texto de las bases (un día, varios, un rango «del 2 al 8 de noviembre», «30/10/2026», «2-nov.-2026»). Un día sin año toma el que viene después en el texto; si no hay, el del primer día o el del cierre, y si así queda más de un mes antes, el del año siguiente.
    - Si las bases no dan una fecha (un contrato con servicios a pedido), la ganada queda por cumplir y dice «Sin fecha en las bases».
    - El servicio, y el cierre en «Mis licitaciones», quedan siempre a la derecha, también con un nombre largo; en el teléfono bajan bajo el nombre (Felipe, al ver la de Laja Diguillín con la fecha debajo: *"si siempre a la derecha"*).
    - La cotización vinculada no cambia de estado al ganar: Felipe lo pensó y lo retiró (*"No, mejor eso último no"*).
101. **El mercado de todo Chile, desde los datos abiertos de ChileCompra** (28-10, en el laboratorio y en producción el mismo día: *"pasalo a producción"*; Felipe, después de ver lo que gastaron los municipios en el Día del Funcionario: *"podemos traer toda la data de los ultimos 3 años de todo el pais....quiero armar una pestaña de dashboard para entender el mercado y detectar algunas cosas"*, después *"licitaciones y compra agiles... :D"* y, con el plan a la vista, *"si dale"*). Solo motor, migración 168 en las dos bases; en la base real, los 3 años los carga el reloj de las 00:15 la noche del 28 al 29-10. La pestaña del tablero viene después: se decide con Felipe con los datos ya cargados y se le muestra antes de programarla.
    - Por qué no la API: atiende de a una consulta, 10.000 al día por ticket; los 3 años de licitaciones de todo Chile (419.371, medido en `mp_historia`) eran unas 7 semanas de noches. ChileCompra publica gratis un archivo por mes con todas las licitaciones del país, con cada oferta (`lic-da/{año}-{mes}.zip`, mes sin cero, al día), y otro con todas las cotizaciones de compra ágil (`trnspchc/COT_{año}-{mm}.zip`, mes con cero, con un mes de atraso). Medido el 28-10: 3 años comprimidos pesan 647 MB las licitaciones y 4,8 GB las compras ágiles. No usa tickets.
    - Qué se guarda (tablas `mercado_*`, sin empresa, como las `mp_*`): todas las licitaciones, con cada oferta, quién ganó y por cuánto; de las compras ágiles, las de eventos, banquetería, alimentación y alojamiento con cada cotización, y del resto solo el total por unidad de compra y por mes (3 años completos pasaban los 2 GB, con una base de 154 MB). Octubre 2025: 9.043 licitaciones con 38.056 ofertas, 692 del rubro; 93.446 compras ágiles, 6.998 del rubro con 19.921 cotizaciones.
    - El rubro, por el código ONU de lo comprado (catering y banquetes 9010, hoteles 9011, producción de eventos 801416, cocina 911116, suministro de alimentos 931316) o por el nombre (cena, cóctel, celebración, aniversario, Día del Funcionario…).
    - Montos limpios: lo adjudicado se recalcula con el precio unitario por la cantidad adjudicada, sin pasar de la ofertada. La cena de Coelemu traía 12.442.640 en la cantidad y sumaba $774 mil millones; queda en $12.442.640. Solo se suman pesos: lo ofertado en dólares o UF queda sin monto. En una compra ágil el total se repite en cada producto y se cuenta una vez; de varias alternativas de un proveedor vale la elegida o la más barata.
    - El cargador (`datos-abiertos/`): a las 00:15 de Chile, entre la pasada del radar de las 23:07 y la de las 02:07, hasta las 06:30. Mes a mes, del más nuevo al más viejo, baja el archivo a una carpeta temporal, lo lee de a pedazos con un lector de ZIP y de CSV propios (Windows-1252, punto y coma), lo guarda y lo borra. Un mes listo no se repite mientras su archivo no cambie; las licitaciones del mes en curso cambian cada día y se recargan cada noche. Un mes con error queda anotado y se reintenta la noche siguiente. Una carga a la vez. Medido con octubre 2025: 3 s las licitaciones y 32 s las compras ágiles, con 137 MB de memoria (guardar los códigos tal como salen del CSV retenía el archivo entero: 1,1 GB).
    - A mano, solo administrador: `POST /oportunidades/mercado/cargar?meses=N` arranca y responde al tiro; `GET /oportunidades/mercado/cargas` dice qué mes está listo.
    - Fuera del respaldo diario (`FUERA_DEL_RESPALDO`): son públicas y se vuelven a bajar. También `mercado_cargas`, para que una restauración no diga «lista» con las tablas vacías.
    - Los archivos de compra ágil hasta septiembre de 2025 no traen `NombreOOPP`: ahí el organismo sale de la razón social de la unidad (`RazonSocialUnidaddeCompra`). Medido en la primera carga del laboratorio (28-10): los 3 años en 35 minutos, 356.027 licitaciones con 1.579.777 ofertas y 2.654.653 compras ágiles, 142.556 del rubro con 543.904 cotizaciones; 641 MB.
102. **El programa de integridad vale con la firma del representante legal y del coordinador** (28-10, en el laboratorio y en producción el mismo día: *"a producción"*). Felipe, con el registro de difusión de la 5040-14-LE26 en rojo por no tener fecha ni las firmas de todo el personal: *"el personal del servicio no es quienes están involucrados en procesos de decisión de compras públicas a quienes esta orientado ese papel... dalo por bueno porfavor, mientras el representante legal y el coordinador del evento estén, el papel es valido"*. Motor y pantalla, sin migración.
    - Las bases (pág. 11) piden el programa y «la certificación que es conocido por todo su personal», y en una nota cuentan como personal al representante legal y a «todos los trabajadores atingentes a la presente licitación». Felipe lee atingentes como los que deciden en las compras públicas.
    - «Validar todo» da por buena la certificación (un registro de difusión o una declaración, que suele ir dentro del programa) si la firman el representante legal y el coordinador del servicio, con sus nombres de «Mi empresa». No pide fecha ni las firmas del resto del personal. Si falta uno de los dos, era grave; desde la decisión 105 es menor, en amarillo: cuesta puntaje, no deja fuera la oferta.
    - En «Bases y criterios», la certificación (que el análisis deja en `dj_trabajadores`) la cubre el programa de integridad de «Mi empresa» cuando no hay una declaración aparte (`checklistDeDocumentos`). Salía «Falta», y «Cómo te evalúan» decía «falta 1 de 2». El ZIP ya la tomaba del programa (`el-set.ts`).
103. **Las bases pueden pesar hasta 40 MB** (28-10, en el laboratorio y en producción el mismo día: *"ármalo en producción y lab"*). Felipe: *"el analizar bases solo lee hasta 22 mb es muy poco quedo topado en algunas...puedes poner ese tope un poco más arriba"*. Ese día la topada era la 918023-5-LE26, con 23,2 MB en dos PDF. Solo motor, sin migración.
    - El 22 no era al azar: los PDF iban dentro del pedido, en base64, que los agranda un tercio, y el pedido no pasa de 32 MB. Por ahí no caben más de unos 23 MB.
    - Si los PDF pasan de 22 MB juntos, se suben todos antes a la Files API, como en el taller, y el pedido lleva solo su `file_id` (`analisis/pdf-subidos.ts`; `armarContenido` con `subir`). Bajo 22 MB todo sigue dentro del pedido, como antes.
    - No se borran al terminar: vencen solos a las 2 horas (`expires_in_seconds`). Mientras tanto, el mismo PDF (por su huella) da el mismo `file_id` por una hora y media, para que «Pregúntale a la IA» empiece igual que el análisis y lea su caché de 1 hora (decisión 67).
    - El tope nuevo, 40 MB, es el de «Generar documentos», y vale para «Analizar bases» y «Pregúntale a la IA» (`MAX_BYTES_DE_BASES`). Lo que sigue limitando son las 600 páginas por pedido: si pasan, sale el aviso de siempre, «Son demasiadas páginas» (`errorDeIA`).
    - «Validar todo», la comparación de ofertas, por qué perdimos, lo que aprendemos de las comisiones, el resumen de negocio y armar la oferta siguen con 22 MB (`MAX_BYTES_DE_PDF`).
104. **La cotización de una ganada: se crea desde ahí y queda aceptada con una cuota a 30 días** (28-10; a producción sin probarse en el laboratorio, que Railway tenía con las publicaciones pausadas: Felipe pidió *"subirlo a producción"*; la 103 es de otra sesión. Probada después en el laboratorio, los dos casos: la N° 481 vinculada y la N° 483 creada desde la ganada). Felipe: *"cuando una licitación está ganada, y no tengo nada vinculado, debería poder crear la cotización desde ahi trayendo la mayor cantidad de cosas posibles y si faltan, avisar en los comentarios internos"*; *"si esta ganada la licitación la cotización debe quedar como aceptada con un plan de pagos a 30 dias post realización del evento"*; y para la ya vinculada: *"Sí, me parece bien. Ambos casos."* Motor y pantalla, sin migración.
    - En una ganada sin cotización, «1 El precio» ofrece «Crear o vincular cotización» (antes decía «Se postuló sin cotización vinculada»). Crear trae lo de siempre: el comprador como cliente, los días del servicio de las bases, los productos de «Qué ofreces» a precio de catálogo y el precio postulado como descuento; lo que falta va al comentario interno (decisiones 57 y 69). Lo postulado no se toca (`esGanadaSinCotizacion`, `congelada.ts`); una ganada que ya tiene cotización sigue fija.
    - Si se postuló sin «Armar postulación», no hay «Qué ofreces»: la IA lo arma con las bases (`ArmarLaOfertaService.pedir` con `paraLaGanada`) y, al terminar, crea la cotización sola. El precio es el de los anexos y las fechas, los días del servicio de las bases (`servicioDe`).
    - La cotización de una ganada queda **aceptada**, con una cuota por el total que vence 30 días después del último día del servicio, como la N° 679 que Felipe aceptó a mano (`AceptarLaGanadaService`). Vale para la que se crea o se vincula desde la ganada, y para la ya vinculada cuando la licitación sale ganada, sola (el resultado de la decisión 92) o a mano. Una que ya es evento, anulada o rechazada, o sin fecha, queda como está.
    - Sin el correo del plan al comprador (`createPaymentPlan` con `sinCorreo`): es un organismo público, que paga contra la orden de compra. Queda anotado en su bitácora, a nombre del Asistente, y el aviso al marcarla ganada lo dice.
    - Y deja la tarea de revisarla (28-10, en el laboratorio y en producción el mismo día: *"a producción"*). Felipe: *"dejale un seguimiento de esos rojo diciendo validar servicios contra licitación"*, con un pantallazo de la franja roja «Contacto comprometido» de una cotización en Post-Venta. Después de «Aceptada sola», el Asistente anota «Validar servicios contra licitación <código>.» con el próximo contacto de ayer (`validarServicios`): nace vencida, así el hilo de seguimiento la muestra en rojo desde que se acepta, con «Registrar gestión» y «Listo».
105. **Rojo, solo lo que te puede dejar fuera** (28-10, en el laboratorio y en producción el mismo día: *"si así en laboratorio y producción"*). Felipe, con la firma de Camila Carvajal, la coordinadora, en rojo en el programa de integridad de la 5040-14-LE26: *"igual esto es una incidencia menor"*, *"entonces debe marcarlo como amarillo no rojo"* y *"rojo es algo que puedan dejarme fuera de la postulación"*. Solo motor, sin migración. Cambia la regla de la 85.
    - «Validar todo» marca `grave`, en rojo, solo lo que puede dejar la oferta fuera de bases o anularla: un formulario o un documento obligatorio que falta, un formulario sin firma, un dato obligatorio en blanco, algo que no cubre lo pedido, un documento vencido o que no acredita lo pedido.
    - Lo que solo cuesta puntaje, aunque después no se pueda corregir, va `menor`, en amarillo, igual que lo de forma.
    - La firma del representante legal o del coordinador que falta en la certificación del programa de integridad (decisión 102) es menor, salvo que las bases exijan esa firma para admitir la oferta: las bases piden la certificación, no la firma de una persona en particular. Ese día, en la 5040-14-LE26, el registro de difusión tenía 6 firmas del personal y no la de Camila.
    - El veredicto sigue igual: «casi» si quedan detalles, «no» si falta algo obligatorio.

106. **«Se viene» y los competidores, desde el mercado de todo Chile; «Se viene», solo lo grande** (28-10, en el laboratorio y en producción el mismo día: *"pasalo a producción"*). Felipe, con el plan de la 101 a la vista: *"Sí, se viene y el competidor es en quién ganó. Deberían actualizarse"*. Y sobre «Se viene»: *"para no mapear basura... una licitación chica la sacamos en el minuto. Es saber con anticipación que se viene, entonces tiene que tener un tamaño considerable"*, con el número de *"considerar una cotización grande"*; elegido: *"mismo numero de mi empresa"*. Motor y migración 169 en las dos bases, sin pantalla nueva.
    - «Se viene», la lista de competidores y la ficha de cada competidor leen del mercado de la 101 (`MercadoDeLaZonaRepository`). Toman las licitaciones del rubro de los últimos 38 meses en las regiones de la empresa, con quién ganó y por cuánto. La vista `mercado_licitaciones_con_ganadores` (migración 169) las entrega con la misma forma que la historia del radar, así que `seVienen`, `rankingDeCompetidores` y `fichaDeCompetidor` no cambian. Medido en el laboratorio: 3.490 licitaciones del rubro en Ñuble y Biobío, 3.027 con ganador. La consulta pide las regiones por su nombre exacto en ChileCompra y avanza por código, con dos índices de la migración 169. La primera versión las filtraba en memoria y saltaba páginas: pasaba el tope de tiempo de la base, 4,5 s por página; ahora tarda 0,2 s.
    - Si el mercado todavía no tiene nada de la zona, se usa la historia del radar, como antes; así no queda vacío mientras el reloj de la noche hace su primera carga.
    - «Se viene» muestra solo las series cuya última vez supera el umbral de «cotización grande» de Mi empresa (`high_value_threshold`; Valle del Sol tiene $3.000.000). Vale el monto estimado o, si no lo hay, lo adjudicado. Sin umbral, se ven todas.
    - El semáforo de una serie cuya última vez el radar no guardó se lee con lo que trae el mercado: el nombre y los rubros de lo que se compró, sin descripción (`paraLeer`).
    - «Quién ganó el año anterior» en la bandeja y la ficha sigue con la historia del radar, y por eso esa descarga nocturna por la API sigue encendida. Pasarlo al mercado y apagarla es el paso siguiente, con el OK de Felipe.
107. **Los números de las pestañas: lo que queda por hacer** (28-10, en el laboratorio y en producción el mismo día: *"hazlo en ambas"*). Felipe, con «Mis licitaciones 7» y «Ganadas 1»: *"en licitaciones ese numero 7 podria ser solo lo pendiente de posturar....y las ganas solo las que aún no se realizan (por fecha de realización)"*. Solo pantalla, sin migración.
    - «Mis licitaciones» cuenta solo las por postular que siguen abiertas (`separarMias(...).pendientes`). Ese día pasó de 7 a 4: las 3 postuladas que esperan resultado y las que cerraron sin postular ya no suman. La bandeja vacía sigue diciendo cuántas hay en curso (`enCurso`).
    - «Ganadas» cuenta solo las que aún no se realizan por la fecha del servicio (`ganadasPorRealizar`): el día del servicio ya no cuenta, y las que las bases no fechan, sí. El 1 de ese día era el almuerzo de Laja Diguillín, ya servido esa tarde.
    - Las listas no cambian: «Por cumplir» sigue mostrando la del día con «hoy» en rojo.
108. **El radar municipal: las compras de los municipios, sus señales de riesgo y una pestaña en Oportunidades** (28-10, **solo en el laboratorio**). Felipe: *"la idea de esto es generar un spinoff de una empresa que será un radar municipal para detectar irregularidades de usos de dineros publicos inspirados en zorro de ukrania"*. El marco es el informe «Detección de anomalías en compras públicas» que él trajo ese día, con 30 indicadores, su fórmula, su umbral y su nivel de evidencia: *"te pasare un texto para que veamos indicadores de transparencia, Cuánto se gasta, Quién gana, Cuándo compran, Dónde no estás"*. Eligió *"una pestaña en oportunidades"*, tres datos nuevos (tratos directos, todas las compras ágiles y población por comuna) y el laboratorio: *"dejemos esto en laboratorio no más mientras no quiero pagar más"*. Después: *"dale con todo mañana quiero ver este informe"*. Motor y migración 170, **solo en la base del laboratorio**; main y la base real no tienen nada de esto.
    - **Solo municipios.** Es un radar municipal, y así cabe en el disco que el laboratorio ya paga (8 GB, con 0,8 GB usados ese día). Lo nuevo es solo del sector «Municipalidades», que es cerca de la mitad de lo que compra el Estado. Las licitaciones de todo Chile de la 101 siguen como estaban.
    - **Las órdenes de compra** (`oc-da/{año}-{mes}.zip`, mes sin cero). Queda una fila por orden en `mercado_ordenes_de_compra`, con su modalidad (licitación, compra ágil, convenio marco, trato directo u otra). Un trato directo trae además la causal que invocó el municipio (emergencia, proveedor único, menos de 30 UTM...) y si fue por emergencia. El organismo y el proveedor, con su giro, quedan una vez cada uno en `mercado_organismos` y `mercado_proveedores`. Medido con septiembre 2026:
        - 147.627 órdenes, de las cuales 45.495 son de municipios, con 366 organismos y 12.738 proveedores.
        - Por modalidad: 25.340 compras ágiles, 14.436 de licitación, 2.706 de convenio marco, 2.451 tratos directos (437 por emergencia) y 562 otras.
    - **Cada noche, solo lo nuevo.** ChileCompra rehace a diario los archivos de órdenes de los últimos 15 meses, 1,4 GB. Felipe: *"yo traeria las del día no más"*. Cada noche se leen el mes en curso y el anterior. Un mes más viejo ya cargado se repasa una vez al mes, para sumar lo anulado (`ordenesAlDia`). A mano se puede pedir una sola fuente (`fuentes=ordenes_de_compra`).
    - **Las compras ágiles de los municipios**, de cualquier rubro, en `mercado_compras_agiles` con `municipal` y `del_rubro`. Guardan cuántas cotizaciones tuvieron y la elegida, pero no cada cotización: esas siguen solo para el rubro.
    - **La población de las 346 comunas**, del Censo 2024 del INE (`mercado_poblacion`, 18.480.432 personas, de la capa pública `COMUNA_DPA_INDICADORES`). Sirve para el gasto por habitante, como el CIC N°22 de Contraloría sobre las celebraciones.
    - **La UTM de cada mes**, del SII (`mercado_utm`), para los topes legales: compra ágil hasta 100 UTM, concejo desde 500 y publicidad del trato directo desde 1.000.
    - **La pestaña «Radar municipal»** en Oportunidades, con las vistas que eligió Felipe y un filtro de región (de partida, las de la empresa; también una sola o todo Chile) y de año (de partida, el último completo; solo se ofrecen los años con 6 meses o más, porque los 3 años hacia atrás empiezan en noviembre de 2023; uno incompleto dice qué meses trae):
        - **Cuánto se gasta:** lo que compró cada municipio en el rubro, por habitante, todo lo que compró y su parte en trato directo; arriba, el promedio por municipio y por habitante de todo Chile.
        - **Quién gana:** a quién le compraron el rubro, por monto de sus órdenes, con sus órdenes y sus municipios.
        - **Cuándo compran:** las órdenes del rubro mes a mes.
        - **Dónde no estás:** los municipios que compraron el rubro donde la empresa no ofertó, no cotizó ni vendió en los 3 años, con quién les vende más.
        - **Transparencia:** cada municipio con cuántas de las 13 señales tiene y cuáles; al abrirlo, qué vio el radar, sus ejemplos con enlace a Mercado Público y de dónde sale la regla. Arriba, el aviso: *una señal no es una acusación: muestra dónde mirar.*
    - **Las 13 señales**, en los últimos 12 meses con órdenes de compra, salen del informe y de las reglas de Contraloría y del Observatorio de ChileCompra que se pueden calcular con estos datos:
        - Por proceso: plazo para ofertar bajo el mínimo legal; tres o más tratos directos por emergencia al mismo proveedor; licitaciones de un tipo menor al que pedía su monto (L1 hasta 100 UTM, LE hasta 1.000); un proveedor que se lleva más del 40 % de lo que compra el municipio.
        - Comparadas con los demás municipios con la cerca de Tukey de la guía de la Open Contracting Partnership (lo que queda sobre el tercer cuartil más 1,5 veces el rango intercuartil): un solo oferente, demora en adjudicar, adjudicadas más de 30 % sobre lo estimado, no ganó la más barata, mucho trato directo, compras ágiles partidas (el mismo día, la misma unidad y el mismo proveedor, sobre 100 UTM juntas), compras ágiles entre 95 y 100 UTM, gasto en el rubro por habitante y compras ágiles con una sola cotización.
        - El primer cálculo, marcando con una sola vez, marcaba a casi todos en tres señales (compras partidas por trimestre a 327 de 345 municipios). Por eso esas pasaron a ser proporciones comparadas, que es lo que pide el informe: si una señal se enciende en casi todos, no sirve.
    - **El cálculo vive en la base** (migración 171): vistas materializadas que llena `radar_recalcular()` después de cada carga, y la función `radar_tablero` que devuelve todo lo de la pestaña en un JSON. En el laboratorio se recalcula a mano.
109. **La base ordenada del mercado: una capa limpia y resumida que leen todos** (29-10, en el laboratorio y en producción el mismo día: *"pasalo a producción"*; la 108, el radar municipal, quedó solo en el laboratorio por decisión de Felipe). Felipe: *"a nivel de base de datos, entonces, ¿qué mejoras propones para que todo esto trabaje y sea una base de datos fácil y ágil de preguntar?"*; ante las seis propuestas: *"si me gustaron los 6 cambios"*. Este sprint trae las tres primeras. Motor y migración 172, sin pantalla nueva.
    - Las tablas `mercado_*` de la 168 siguen guardando lo que llega de ChileCompra, tal cual. Encima, la base arma una capa limpia: `mercado_compras` (cada licitación, de todos los rubros, y cada compra ágil del rubro, con la misma forma y sus ganadores ya armados), `mercado_gasto_por_comprador_mes` y `mercado_ganadores_por_mes`. La rearma `mercado_resumir_mes()` apenas el cargador guarda un mes. Al final de cada carga se resumen los meses listos que nunca se resumieron o que cambiaron después (`faltaResumir`), sin volver a bajar el archivo. No hay reloj nuevo.
    - **Una sola forma de escribir cada dato** (1). El RUT va sin puntos, con guion y K mayúscula (`mercado_rut`). La región y la comuna van por su código oficial: `mercado_regiones` tiene las 16 con el nombre que usa ChileCompra, y `mercado_comunas` las 346 con su CUT y la población del Censo 2024. Los archivos traían el RUT con puntos y las actas sin puntos.
    - Las compras ágiles no traen comuna ni organismo: salen de las licitaciones de la misma unidad de compra, igual que la comuna de una licitación que viene sin ella. Los nombres que ChileCompra escribe distinto que el INE («Santiago Centro», «Llay-Llay», «Puerto Natales» y otros diez) van en `mercado_clave_de_comuna`; con ellos cruzan todas las comunas escritas.
    - **Control de calidad al resumir** (2). Cada mes cuenta en `mercado_cargas.calidad` cuántas compras y ofertas hay, cuántas vienen sin región o sin comuna, y cuántas ofertas traen un RUT que no es un RUT chileno válido (forma y dígito verificador, `mercado_rut_valido`), y cuántas de esas ganaron. Lo dudoso no entra a los ganadores ni a los rankings, pero nunca se borra de lo que llegó.
    - En los 3 años del laboratorio, 1.939 de 1,58 millones de ofertas traen un RUT no válido; la mayoría son proveedores extranjeros, y 257 de ellas ganaron. De 356.030 licitaciones, 53 vienen sin región y 1.423 sin comuna.
    - **Resúmenes listos** (3). «Se viene», los competidores y la ficha leen `mercado_compras` una región a la vez, por su código oficial (`codigosDeRegiones`, el mismo del radar) y por el índice de la zona. Medido en el laboratorio: la misma zona que la vista de la 169, 3.490 licitaciones del rubro en Ñuble y Biobío y 3.027 con ganador, en páginas de 15 ms en vez de casi un segundo. Cada mes guarda juntas las del rubro de cada región: la zona ocupa 299 páginas del disco en vez de unas 2.400, y la primera lectura, con la base fría, baja en la misma proporción. Si la capa está vacía, se lee la vista de la 169 como antes.
    - Resumir un mes tarda de 2 a 9 s en el laboratorio; noviembre de 2023, el de más licitaciones con 16.636, tardó 5,7 s. La API de la base corta a los 8 s, así que la función lleva su propio tope de 60 s, y el motor la llama con su cliente para trabajos largos (75 s): el de siempre se rinde a los 10 s, y en la primera prueba en el laboratorio cortó dos meses grandes. La capa pesa unos 390 MB y queda fuera del respaldo diario, como el resto del mercado: la base la rearma sola.
    - Fuera del rubro, `mercado_ganadores_por_mes` guarda solo a los proveedores que ganaron algo; los que solo ofertaron eran 6 de cada 10 filas.
    - **Las otras tres, el mismo 29-10.** Felipe: *"primero haz los tres cambios que me pediste"*.
    - **(4) Una sola historia.** «Quién ganó el año anterior», en la bandeja y en la ficha, sale del mercado.
      - `MercadoDeLaZonaRepository.historialDeOrganismos` toma las licitaciones del rubro de la empresa con ganador, de los últimos 31 meses, y `anteriorDe` no cambia. Con la capa vacía, vuelve a la historia del radar.
      - El estudio de mercado de un competidor (`CompetenciaService.ficha`) también lee del mercado. Era lo último que leía la historia de la API.
      - La historia por la API quedó apagada: el radar ya no llama a `cargarHistoria`. `mp_historia` y lo que bajó quedan como estaban.
    - **El reloj del radar, el de Felipe:** *"cuatro revisiones"*, a las 8, 12, 15 y 18 h. Reemplaza al de la 18.
      - Medido ese día con 5.792 compras ágiles de 3 semanas: no se pierde ninguna, y ninguna llega con menos de 6 horas para cerrar.
      - Los resultados de lo postulado se miran media hora después de cada pasada. La cabecera de la pantalla dice el horario nuevo.
    - **Las dos claves de la API:** *"una puede trabajar de mañana y otra de tarde"*.
      - Antes de las 14:00 parte el `MP_TICKET` y desde ahí el `MP_TICKET_2`.
      - Si la del turno se queda sin cupo, sigue con la otra.
    - **(5) Preguntas con nombre y un diccionario** (migración 173).
      - Preguntas: `mercado_buscar_comprador`, `mercado_gasto_de`, `mercado_quien_gana`, `mercado_proveedor`, `mercado_categorias` y `mercado_calidad`.
      - La vista `mercado_diccionario` junta lo que dicen los comentarios de cada tabla, columna y pregunta del mercado. En el laboratorio explica 36 piezas.
    - **(6) El rubro se elige al preguntar** (migración 173): un índice de las categorías de ChileCompra y `oportunidades_config.categorias`.
      - Con categorías, «Se viene», los competidores, el estudio de mercado y el año anterior toman las licitaciones que tienen alguna de ellas.
      - Sin categorías, vale la marca «del rubro» de siempre. Valle del Sol no las tiene, así que no cambia.
      - Medido en el laboratorio: de las licitaciones marcadas del rubro, 14.903 son de «Servicios para la comercialización y distribución». **Corregido el 29-10 con lo medido en producción (decisión 111):** ahí caen los Días del Funcionario y del Profesor y las productoras de eventos, no las tarjetas de alimentación. Las de AMIPASS, EDENRED y Pluxee de Ñuble y Biobío están en «Ayuda y asistencia humanitaria» (22 convenios), «Servicio doméstico y de cuidados» (2) y «Restaurantes y catering» (9): por eso encabezan quién gana en la zona.
      - Las categorías de Valle del Sol las elige Felipe.
    - **En producción, el disco** (29-10). La base real tenía un disco de 2 GB. Al armar la capa, lo escrito más el registro de cambios de la base (WAL) lo llevó al 95%, y Supabase la dejó en solo lectura de 14:49 a 14:52. No se perdió nada: las únicas escrituras rechazadas fueron las de la capa.
      - Se vació la capa, Felipe subió el disco a 8 GB, lo que trae su plan, y la capa se rearmó. En producción pesa 421 MB, y la zona da lo mismo que la vista de la 169: 3.490 licitaciones del rubro y 3.027 con ganador.
      - Supabase agranda el disco solo cuando crece la base, no el WAL: antes de una carga grande, se mira el disco.
110. **«Se viene» en su ventana y sin lo que ya ocurrió** (29-10, en el laboratorio y en producción el mismo día). Felipe: *"deberíamos trabajar con el mes en cuestión... darle un rango de tolerancia, hacia el futuro... y al revés también, puede ser que se atrase, pero tener una visión tan larga así del «Se viene» con 100 o con 50 eventos creo que es mucho"*. Y: *"hacer un cruce en el «Se viene» con el ya ocurrió... hay varios días del funcionario que yo he visto que ya lo lanzaron las municipalidades, entonces ya no se viene porque ya ocurrió"*. Ante la propuesta: *"si dale con 3 semanas atras y 4 adelante"*. Motor y pantalla, sin migración.
    - **La ventana:** se muestra lo que, según la última vez, debería salir en las próximas 4 semanas o lleva hasta 3 de atraso (`seVienen`: `dias` 28 y `gracia` 21; antes, 90 y 30). Ese día el laboratorio mostraba 78 series en 90 días.
    - **Lo que ya ocurrió:** `MercadoDeLaZonaRepository.recientesDeLaZona` junta lo de este año: las licitaciones y compras ágiles que trajo el radar, que es lo de hoy, y las compras ágiles del rubro de los archivos, que llegan con un mes de atraso. Son 8 meses, diez minutos en memoria.
      - Una serie sale de la lista si el mismo comprador publicó algo con un nombre parecido, la misma vara de siempre, más de medio año después de la última vez.
      - Al comprador se le reconoce por el código del organismo, por la unidad de compra (el comienzo del código) o por el nombre del organismo sin el «I.» ni el «Ilustre». Las compras ágiles del radar no traen el código del organismo, y por eso el cruce de antes no las veía.
    - **El caso medido:** San Ignacio publicó su Día del Funcionario 2026 el 23-10 como compra ágil (3706-382-COT26), y «Se viene» lo seguía anunciando para el 29-10 por la licitación 3706-59-LE25 de 2025. Ese mes muchos municipios de la zona lo publicaron por compra ágil: Bulnes, Santa Bárbara, Antuco, Quilleco, Chillán y otros.
    - La pantalla lo dice: «debería volver a salir en las próximas 4 semanas, o que lleva hasta 3 de atraso. Lo que ya salió este año no aparece».
111. **Las categorías de ChileCompra se eligen en Configuración** (29-10, en el laboratorio y en producción el mismo día: *"pasalo a producción"*; en producción no queda ninguna marcada: las elige Felipe en la pestaña). Felipe, ante las categorías propuestas para Valle del Sol: *"si, pero deja esto como una sección para elegir en la pestaña de configuración"*; y con el dibujo de la sección: *"si dale armalo asi"*. Motor, pantalla y migración 174.
    - **La sección** «Categorías de ChileCompra», debajo de «Comunas cercanas», es la misma lista con buscador de «Regiones de interés». Cada categoría dice cuántas licitaciones tuvo en las regiones de la empresa en los 3 años de la capa (`GET /oportunidades/config/categorias`).
      - Se guardan con el botón «Guardar» de siempre, en `oportunidades_config.categorias`. Sin ninguna queda null, y vale la marca «del rubro» de la 101.
      - Al guardar se refrescan «Se viene», Competidores y la bandeja.
    - **Las sugeridas** van primero y dicen «sugerida»: «Servicios para la comercialización y distribución», «Restaurantes y catering», «Instalaciones hoteleras, alojamientos y centros de eventos» y «Asistencia para viajes» (`CATEGORIAS_SUGERIDAS`). No se aplican solas: las marca la empresa.
    - **Lo medido en producción el 29-10**, licitaciones de Ñuble y Biobío en 3 años:
      - Las cuatro suman 2.837, contra 3.490 de la marca de la 101.
      - De 9 licitaciones que le importan a Valle del Sol quedan 7. Se pierden las dos giras de estudio de Pemuco, que están en «Transporte de pasajeros».
      - Pluxee y AMIPASS salen de «quién gana», pero siguen Sodexo y Edenred y aparecen productoras de sonido y de fuegos artificiales: las categorías de ChileCompra son de familia, muy amplias.
    - **Contarlas rápido** (migración 174): `mercado_categorias_de_la_zona(regiones)`, con un índice por región que trae las categorías (`INCLUDE`), cuenta sin abrir ninguna licitación.
      - Tarda 0,6 s en frío en el laboratorio, contra 6,9 s recorriendo la tabla y 3,6 s con un índice sin las categorías.
      - El motor guarda la lista 10 minutos.

## 4. Reglas del módulo (no se negocian)

1. **La IA propone, la persona decide.** Nada se sube a Mercado Público
   automáticamente; Felipe revisa, firma y sube. Las declaraciones juradas las
   firma él: la IA llena datos, no declara.
2. **Nunca un precio a dedo.** La oferta económica sale de una cotización de
   Eventia armada con el catálogo (regla de la casa del 14-10).
3. **Nada se borra.** Lo descartado y lo cerrado quedan: son el historial que
   alimenta "quién ganó el año anterior".
4. **Lo público es de todos; lo de cada empresa, de cada empresa.** Los datos
   de Mercado Público van en tablas comunes (son públicos e iguales para
   todos). La clasificación, el estado, las notas y los documentos van con
   `company_id`, y cada consulta filtra por empresa (regla del motor).
5. **Solo Valle del Sol al principio.** Derecho nuevo `oportunidades`,
   entregado por `companies.modulos_propios` como Personal y Marketing
   (`mapa/15`, §5.7 y §5.8). Venderlo es otra decisión.

## 5. Cómo funciona

### 5.1 El radar (09, 12, 15 y 18 h, y de noche)

1. **Licitaciones:** una sola consulta liviana a
   `licitaciones.json?estado=activas` ("todas las licitaciones publicadas al
   día de realizada la consulta", documentación oficial de ChileCompra). Se
   compara con la base:
   - código que no está → se pide el detalle (`?codigo=`) y se guarda, **de
     todo Chile**. Cambio al construir (16-10): la
     región solo viene en el detalle, así que hay que abrir cada licitación
     igual, y guardarla evita volver a abrirla en cada pasada. La IA lee solo
     las de las regiones de cada empresa. **Confirmado por Felipe el
     17-10** (decisión 12);
   - código que ya está y cambió su fecha de cierre → se actualiza y se anota
     en el historial;
   - código que estaba cerrado y vuelve a aparecer → se reabre y se anota.
2. **Compras ágiles:** API v2 con `publicado_desde` = última corrida exitosa
   menos un margen (48 h) y región 8,16; se compara con la base igual que
   arriba.

   Lo que enseñó el código del bot (17-10): la API de licitaciones a veces
   responde 200 **con el error adentro** (`Codigo` y `Mensaje`), y rechaza
   las peticiones simultáneas con el mismo ticket. El radar revisa el
   cuerpo de cada respuesta, reintenta las "peticiones simultáneas" y pide
   **de a uno**, primero lo que cierra antes. Y frena con 429 si se le pide
   en ráfaga (medido en el laboratorio el 17-10): el radar deja 1 segundo
   entre pedidos y espera ante un 429 antes de darlo por "sin cupo". Cada corrida pide detalles
   hasta los 80 minutos y lee hasta los 150; lo que falta entra en la
   próxima (así nunca llega a las 3 horas en que la siguiente la da por
   muerta).
3. **Regiones:** las que tenga configuradas cada empresa en el módulo
   (§5.7); el radar trae la unión de todas. Valle del Sol parte con Ñuble y
   Biobío.
4. **Archivos:** ~~para las que la IA marca del rubro, se bajan bases,
   anexos y aclaratorias desde la ficha pública de Mercado Público~~.
   **Verificado el 17-10: no se puede de forma honesta.** La ficha pública
   enlaza a la lista de adjuntos, pero esa página solo muestra los archivos
   después de pasar un reCAPTCHA de Google (el control antirrobots);
   esquivarlo sería saltarse a propósito una protección de ChileCompra.
   Alternativas en §12. **Decidido el 17-10** (Felipe: *"ok dale con el
   botón y arrastro"*): los baja una persona y los arrastra a la ficha
   (opción d). Construido ese día y en el laboratorio (migración 124).
5. **Al cerrar:** se guarda quién ganó, el precio, cuántos ofertaron y el
   enlace al acta (vienen en el detalle de la API: `Adjudicacion`,
   `NumeroOferentes`, `UrlActa`, ganador por ítem). **Construido el 17-10**
   (`HistoriaService.revisarAdjudicaciones`): las cerradas de las regiones
   configuradas se revisan una vez al día hasta que digan el ganador.
6. **Historia:** una vez, al partir, se cargan 2 o 3 años de Ñuble y Biobío
   con `?fecha=` día por día, de noche (ChileCompra pide las descargas grandes
   entre 22:00 y 07:00). Primero se filtra por nombre con Haiku y solo se pide
   el detalle de las candidatas. **Construido el 17-10**
   (`HistoriaService.cargarHistoria`, migración 123): 3 años de todo Chile,
   primero los días cercanos a "hace un año"; cada fila y cada ficha muestran
   la misma compra del año anterior (mismo organismo comprador y nombre
   parecido).

### 5.2 La lectura con IA (Haiku 5.5)

Cada licitación nueva se lee **una sola vez por empresa** con derecho:
nombre, descripción y productos (y las bases cuando ya estén). Devuelve, con
salida de estructura fija:

- etiquetas propias: evento, alimentación, alojamiento, capacitación con
  salón, paseo, otro;
- `se_hace_en_el_complejo`: sí / no / dudoso;
- semáforo verde / amarillo / rojo, y la razón en una frase.

**El criterio sale del perfil de la empresa**: el catálogo de Eventia
(paquetes, menús, salones) más la ficha del oferente (§5.5). No hay lista de
palabras clave.

Reglas que mandan sobre la IA:

- organismo de una comuna cercana (lista configurable, §5.7; Valle del Sol
  parte con la del bot: Quillón, Bulnes, Ránquil, Portezuelo, San Ignacio,
  El Carmen, Pemuco, Coelemu, Ninhue, Treguaco, Florida, Yumbel, Cabrero)
  **y del rubro** (alguna etiqueta distinta de "otro") → aviso inmediato.
  Afinado al construir (16-10): una compra de hormigón de Quillón sigue
  roja. Hasta el 23-10 también "nunca rojo": subía a amarillo. **Desde la
  decisión 72 el color es el de la IA**: si dice que no, queda roja con el
  aviso y es el **reciclaje**; el rojo sin el aviso es la **basura**;
- monto igual o mayor al de **alto valor** de la empresa
  (`companies.high_value_threshold`, Configuración de empresa; Valle del Sol
  $3.000.000) → aviso inmediato;
- las rojas no se botan: quedan en la base, y el primer mes se revisa una
  muestra cada semana para medir lo que se le escapa a la IA.

Sumado al construir (16-10): lo que cierra antes se lee primero (si una
corrida se corta, lo urgente ya quedó leído); si la IA falla por la cuenta
(llave, cupo por minuto, saldo, modelo), la lectura se detiene y sigue en la
próxima corrida, y diez fallas seguidas también la detienen. Si el modelo
se niega o no devuelve nada legible, queda en amarillo para revisar a mano.

### 5.3 La pantalla "Oportunidades" (solo Valle del Sol)

Tabla con semáforo, nombre, organismo, comuna, monto, cierre, la razón y el
enlace a Mercado Público, con filtros (desde el 18-10, en montones y agrupada
por cierre: decisión 22). Al lado de cada una, **la del año
anterior**: quién ganó, a qué precio y cuántas ofertas hubo. Botones **Me
interesa** / **Descartar**, responsable y estado (nueva → en estudio →
postulada → ganada / perdida / descartada). Ficha con fechas, archivos,
criterios con su peso e historial de cambios. Calendario de las recurrentes
("en noviembre viene el Día de Campo del Dirigente"). Ficha de cada
competidor. **Sin resumen por correo** (decisión 15, 17-10): se revisa en
Eventia, que se pone al día a las 9, 12, 15 y 18 h (decisión 18). El aviso inmediato para las
comunas cercanas y las de alto valor, al correo de la empresa
(`companies.notifications.replyTo`; Valle del Sol:
contacto@valledelsolquillon.cl), queda por confirmar. Solo la ven los
administradores (decisión 14). Piezas del kit de la casa (`CLAUDE.md`):
`SelectWithSearch`, `ChipDeEstado`, `Modal`, `Toast`, `ConfirmInline`.

### 5.4 Botón "Generar documentos" (Opus 5.5)

En la ficha de una oportunidad "Me interesa", con su cotización ya armada:

1. El motor crea un trabajo y responde al tiro; la pantalla muestra "en
   proceso" y avisa cuando está listo.
2. Llama a Claude por la API con: las bases en PDF (con citas a la página),
   los anexos en Word (Files API), los datos de la empresa, la cotización y la
   experiencia (eventos realizados en Eventia: cliente, año, monto), usando
   las habilidades de Word y PDF de Claude (Agent Skills + ejecución de
   código).
3. Devuelve y guarda en Eventia:
   - **checklist** de todo lo que piden las bases, con la página: ✅ listo ·
     🔄 lo generó Eventia · ⚠️ falta o está vencido · ✋ le toca a Felipe;
   - **anexos llenos**: identificación y declaración jurada (datos de la
     empresa), experiencia (eventos de Eventia), oferta económica (total de la
     cotización, bajo el presupuesto, con IVA);
   - **propuesta técnica** desde la cotización, con logo y fotos del complejo
     (30% de la nota en el Día del Profesor);
   - **revisión final**: lo generado contra las bases.
4. Felipe revisa, firma y sube. Los archivos que entrega la API vencen: el
   motor los copia al almacenamiento de Eventia apenas llegan.

**El sprint 3 en pasos cortos (17-10).** Felipe mandó pantallazos de Licify
(el panel de detalle, la pestaña Criterios y "Mis Documentos" con Subir,
Crear Documento, Adjuntar Anexos y Validar documentos) y pidió:

1. *"pinchar un modal con el detalle, la opción de ver la ficha; ahí
   podríamos poner un en estudio o descartar"*;
2. *"destacar criterios es importante"*;
3. *"opción de subir, crear documento, adjuntar anexos (que se generen con
   IA y la firma con una foto de la firma) y lo más importante validar
   documentos"*; y antes de llenar, *"una forma de meter la información de
   la empresa, la firma (una foto de la firma)"*.

Orden acordado:

| Paso | Qué |
|---|---|
| 1 | **Analizar bases** (Opus 5.5, migración 125): resumen, **criterios destacados** (arriba, por peso, con el % grande), checklist de requisitos con la página, fechas, garantías y alertas. **Construido el 17-10; la 125, en el laboratorio** |
| 1b | El **panel de detalle** al pinchar en la bandeja, con En estudio, Descartar y Ver ficha. **Construido el 17-10** |
| 2 | **Datos de la empresa como oferente y la foto de la firma**; la carpeta con vencimientos (§5.5). **Construido el 17-10** (pestaña "Mi empresa"); la migración 126, en el laboratorio desde el 17-10 |
| 3 | **Validar documentos** (lo más importante para Felipe): los documentos de la postulación contra el checklist de las bases, uno por uno: cumple, falta o vencido. **Construido el 17-10** ("Mi postulación" y "Validar documentos" en la ficha); la migración 127, en el laboratorio desde el 17-10 |
| 4 | **Adjuntar anexos** (los Word de las bases, llenos con IA y firmados con la foto) y **Crear documento** (propuesta de negocio, presentación, ficha técnica). **Construido el 17-10** ("Crear documentos con IA" y «Firmar» en la ficha); la migración 129, en el laboratorio desde el 17-10 |

**Paso 4: diseño propuesto, para decidir con Felipe (escrito el 17-10
mientras estaba fuera; no se construyó: gasta plata de su cuenta y tiene
decisiones suyas).**

- **Cómo se llenan los anexos.** El plan de §5.4 sigue siendo el mejor:
  Claude edita **el Word original del comprador** con ejecución de código y
  la habilidad de Word de Anthropic (los anexos y la foto de la firma van
  por la Files API). Así el formato queda el mismo que pide la
  municipalidad. Las otras dos opciones son peores:
  - (a) reemplazar los "______" en el XML con el motor: frágil, porque
    cada municipalidad arma sus formularios distinto;
  - (b) rehacer cada anexo en un Word nuevo: siempre sale, pero no es el
    formato entregado.

  Costo estimado: US$1 a 2 por postulación con Opus 5.5.
- **Qué llena la IA**, con "Mi empresa" y la carpeta:
  - identificación del oferente y declaraciones juradas;
  - experiencia (de "Mi empresa" y, más adelante, de los eventos
    realizados en Eventia);
  - la oferta económica solo con un monto que ponga Felipe o que venga de
    una cotización (eso es del sprint 4, que Felipe ve en otro chat);
    nunca un precio inventado.
- **La firma**, en dos tiempos:
  1. "Generar anexos" deja los Word llenos **sin firma** en "Mi
     postulación", marcados como generados.
  2. Felipe los revisa y recién ahí aprieta "Firmar", que pone la foto de
     la firma.

  Así nunca sale un documento firmado que nadie miró.
- **Crear documento** (propuesta de negocio, presentación, ficha
  técnica): con logo, catálogo y la ficha de la empresa. Partir por la
  **propuesta técnica**, que en el Día del Profesor pesaba 30%.
- **Después**, "Validar documentos" (paso 3) revisa lo generado contra
  las bases.

Para decidir: (1) ¿Word original con ejecución de código, como dice §5.4?
(2) ¿Firma en dos tiempos? (3) ¿Por cuál documento partimos?

**Decidido el 17-10** (Felipe: *"1.- si 2.- si 3.- si, pero primero
dejemos todo listo y luego testeamos con estas licitaciones"*):
1. el Word original, con ejecución de código;
2. la firma en dos tiempos;
3. se parte por la propuesta técnica.

Se deja todo listo en el laboratorio y después se prueba con el Día del
Profesor y el del Funcionario de Quillón.

**Construido el 17-10** (rama `feature/oportunidades-radar`, migración 129;
en el laboratorio desde el 17-10 en la tarde). Cómo quedó:

- **"Crear documentos con IA"**, en la ficha, entre "Lo que piden las
  bases" y "Mi postulación":
  - **Anexos del comprador**: los formularios de «Bases y anexos» (sin
    casillas desde el 19-10: los elige el motor, decisión 27) y el
    **monto total de la oferta con IVA** (opcional). El neto
    y el IVA los calcula el motor, no la IA; sin monto, la oferta
    económica queda en blanco.
  - **Propuesta técnica**: un Word nuevo que responde punto por punto a
    las especificaciones técnicas, con el logo, los datos de «Mi empresa»
    y el catálogo. Sin precios. Necesita el análisis de las bases.
- **«Firmar»** en cada Word sin firma de «Mi postulación», con la pregunta
  "¿Ya lo revisaste?". Cada archivo lleva su sello: «Hecho con IA · sin
  firma» o «Firmado».
- **La revisión del motor**: lo que entrega la IA tiene que ser un Word que
  se abre. El firmado, además, tiene que traer el mismo texto que el
  revisado y una imagen más (la firma). Si no, se descarta y se dice por
  qué.
- Lo que falta queda en blanco o como [COMPLETAR: …], y sale en "Lo que te
  toca completar".
- Los archivos pasan por la Files API de Anthropic y se borran al
  terminar.
- **Costo**: los tokens de Opus 5.5, con caché; el cómputo del contenedor
  trae 1.550 horas gratis al mes. Queda anotado en cada trabajo.
- **Por ahora no**:
  - un anexo que viene solo en PDF, o como .doc antiguo, se llena a mano
    (el .doc se puede guardar como .docx y subir de nuevo);
  - las fotos del complejo en la propuesta (no hay dónde tomarlas todavía).

Mapa 24 §6 tiene las reglas; el detalle técnico está en
`api-rest/src/oportunidades/generacion/`.

**El pulido del 17-10** (Felipe: *"de acuerdo con todas tus propuestas,
las mejoras de front, la de las fichas, todo... todo el desarrollo"*).
Antes de seguir, ordenar lo que ya existe:

| Qué | Estado |
|---|---|
| **El resumen al costado**, como Licify, abriéndose con **toda la fila** (o «Ver resumen»), y con **«Asignar»** (el responsable). Felipe no encontraba el que se abría solo con el nombre | Hecho el 17-10 |
| **"Mis licitaciones"**: pestaña con las marcadas «Me interesa», de la que cierra antes a la que cierra después, con el avance de cada una (bases, análisis, anexos, firma, validación, postulada). Felipe: *"¿dónde van a quedar compiladas las que sí me interesan para luego trabajarlas?"* | Hecho el 17-10 |
| **La ficha ordenada**: arriba "en una mirada" (cierre, presupuesto, evento, lugar, el año pasado); pestañas Resumen · Bases y criterios · Mi postulación · Historial; de las alertas, arriba solo las que dejan fuera (máximo 5) y el resto plegado; una sola lista de lo que hay que presentar, con el estado de la validación al lado. Felipe: *"la información para abajo quedó muy desordenada... difícil de leer"* | Hecho el 17-10 (para ver lo que deja fuera separado, hay que volver a analizar las bases de cada licitación: US$0,33 c/u) |
| **El modelo de IA por tarea**: Haiku lee cada licitación; Opus analiza las bases, valida y escribe la propuesta técnica; **Sonnet llena los anexos** (la mitad de Opus) y **Haiku firma** (solo pega una imagen; el motor descarta si cambia una letra). Y el costo con el precio de cada modelo. Felipe: *"los más caros donde se necesiten y los más baratos donde sea necesario"* | Hecho el 17-10 (cambia la decisión 6: Opus ya no hace todos los documentos) |
| **"¿Puedo cumplir?"**: cada exigencia técnica de las bases contra Eventia (catálogo, menús, «Mi empresa» y la agenda de ese día): ✅ lo tienes, 🟡 hay que conseguirlo (nunca se promete en los documentos), ❌ no se puede, solo con un dato duro (fecha ocupada, capacidad, distancia), siempre diciendo por qué. Más tus **menús** y tus **eventos realizados** para la propuesta y la experiencia | Hecho el 17-10 (Felipe: *"todo el desarrollo"*): lo hace Sonnet 5.5 junto con el análisis de las bases; para verlo en una licitación ya analizada, hay que volver a analizarla |

### 5.5 La carpeta y la ficha del oferente

- **Carpeta de documentos de la empresa** con fecha de vencimiento y aviso
  antes de vencer: patente municipal, inicio de actividades, programa de
  integridad (lo pidió el Día del Profesor, dictamen CGR E370752/2023), F30,
  certificado de vigencia, resolución sanitaria, declaración de trabajadores.
- **Ficha de Valle del Sol como oferente**: datos legales (VALLE DEL SOL
  QUILLON SPA, RUT 77.701.305-K), representante, salones y capacidades,
  experiencia destacada. Es el perfil que usa la IA para leer y para escribir.

### 5.6 Botón "Generar cotización" (Opus 5.5)

El diseño es el de `16_PROPUESTAS_DE_COTIZACION.md` §6: el modelo propone ids
del catálogo y el motor decide los números con `computeMoney`, valida contra
el catálogo de la empresa, guarda en **solicitada** y deja las notas en la
**bitácora**, nunca en Observaciones (regla del 14-10). Novedad de este
módulo: **Me interesa** crea el requerimiento con los datos de la licitación
(personas, fechas, comidas, lugar). La skill `armar-cotizacion` del chat es la
receta que se convierte en las instrucciones del agente.

### 5.7 Configuración del módulo (por empresa)

Una pestaña "Configuración" dentro de Oportunidades:

- **Regiones de interés** (Valle del Sol parte con Ñuble y Biobío).
- **Comunas cercanas**: las que nunca quedan en rojo y avisan al instante
  (Valle del Sol parte con la lista del bot, §5.2).

Lo que **no** se configura aquí, porque ya existe en Configuración de
empresa y no se duplica: el monto de alto valor
(`companies.high_value_threshold`) y el correo de avisos
(`companies.notifications.replyTo`).

## 6. Piezas (propuesta para el sprint 1, a confirmar al construir)

**Construido en el sprint 1a (16-10, migración 122):** `mp_procesos`,
`mp_cambios`, `mp_radar_corridas` (la bitácora del radar, que también es su
candado; no estaba en esta propuesta), `oportunidades` y
`oportunidades_config`. Quedan para después `mp_archivos` (sprint 1b) y
`oferente_documentos`, `oferente_ficha` y `postulaciones` (sprint 3).

**Tablas comunes (datos públicos de Mercado Público, sin `company_id`):**

| Tabla | Qué guarda |
|---|---|
| `mp_procesos` | Una fila por licitación o compra ágil: código, tipo, nombre, descripción, organismo, unidad, región, comuna, monto, fechas, estado, criterios, productos, adjudicación, primera vez visto, última actualización |
| `mp_archivos` | Archivos de cada proceso: nombre, tipo (bases, anexo, aclaratoria), ruta en el almacenamiento, texto extraído, resumen |
| `mp_cambios` | Historial: qué cambió y cuándo (fecha de cierre, archivo nuevo, estado, reapertura) |

**Tablas de cada empresa (con `company_id`):**

| Tabla | Qué guarda |
|---|---|
| `oportunidades` | La lectura de la IA para esa empresa (etiquetas, semáforo, razón, modelo usado) y lo que la empresa decide (estado, responsable, notas, cotización asociada). Única por empresa y código |
| `oportunidades_config` | La configuración del módulo (§5.7): regiones de interés y comunas cercanas. Tabla aparte para no sumarle columnas a `companies` (cada campo nuevo de `companies` queda editable desde la Torre, mapa 15) |
| `oferente_documentos` | La carpeta: tipo, archivo, vence el, notas |
| `oferente_ficha` | La ficha del oferente (§5.5) |
| `postulaciones` | Cada "Generar documentos": estado del trabajo, checklist, archivos generados, tokens usados |

**Motor:** módulo `oportunidades/` con el patrón de 4 capas; reloj
`oportunidades-cron.service.ts` (horario de la decisión 18); ruta "correr ahora" para el
laboratorio (ahí los relojes no corren); candado en la base para que dos
corridas no se pisen; derecho `oportunidades` en cada ruta (la prueba
`matriz-de-derechos.spec.ts` frena una ruta sin decidir).

**Variables nuevas en Railway:** `ANTHROPIC_API_KEY` (en el laboratorio
desde el 16-10; en producción al pasar) y el ticket de Mercado Público
(`MP_TICKET`, lo pega Felipe).

## 7. Sprints

| Sprint | Qué | Se da por bueno cuando |
|---|---|---|
| 1. Radar | Migraciones, derecho `oportunidades` para Valle del Sol, radar con solo lo nuevo, cierre y cambios, lectura con Haiku 5.5, adjudicaciones, historia de 2–3 años | En el laboratorio aparecen el Día del Profesor y el del Funcionario bien marcados, la historia muestra "Día del Profesor 2025: ganó Centro Turístico Sol de Quillón por $12.000.000", y en una semana de comparación Licify no muestra nada del rubro que el radar no tenga |
| 2. Pantalla | "Oportunidades", ficha, año anterior, decidir, calendario, competidores, avisos | Felipe la usa una semana en vez del correo del bot; ahí se apaga la parte de Mercado Público del bot de GitHub |
| 3. Generar documentos | Carpeta y ficha del oferente, botón, checklist, anexos, propuesta técnica | Una postulación real sale lista para firmar y subir |
| 4. Generar cotización (Felipe, 17-10: *"lo del botón para crear cotizaciones con IA desde requerimientos lo veré en otro chat"*) | Botón del doc 16 §6 y "Me interesa" → requerimiento | Se prueba en el laboratorio; la regla de "10 seguidas sin corrección" (skill `armar-cotizacion`) sigue siendo la vara para abrirlo a todos |

**El sprint 1 se partió en dos al construir (16-10).** 1a: migración,
derecho, radar con solo lo nuevo, cierres movidos y reaperturas, lectura con
Haiku 5.5 — hecho en la rama `feature/oportunidades-radar`, sin aplicar. 1b:
bajar los archivos, guardar quién ganó al cerrar y la historia de 2–3 años.

**Primera prueba en el laboratorio (17-10, corrida 5):** el Día del
Funcionario (1532886-5-LE26) y el Día del Profesor (4364-13-LE26) de
Quillón quedaron en la base y salieron en **amarillo con "comuna
cercana"** (el Funcionario también con "alto valor"): la IA los ve del
rubro pero las descripciones no dicen dónde se hacen. En la primera
lectura: 121 leídas de Ñuble y Biobío, 9 amarillas, 112 rojas, ninguna
verde. **Ojo:** en el Día del Profesor Quillón ocultó el monto en Mercado
Público (`VisibilidadMonto` 0), así que la API no lo trae y la alerta de
alto valor no se puede encender; Licify lo sacó de las bases, y eso llega
con los archivos (sprint 1b).

**Sprint 1b, construido el 17-10** (Felipe: *"vamos con el sprint 1b"*):
quién ganó al cerrar, la historia de 3 años y "el año anterior" en la
bandeja y en la ficha; además el bloque **Prioridad** arriba de la bandeja
(Felipe: *"hay dos que son directas mías y están en amarillo y deberían
ser prioridad"*). Lo que no se pudo: bajar las bases (reCAPTCHA, §5.1
punto 4). La migración 123 se aplicó en el laboratorio el 17-10 con el OK
de Felipe.

**Lo que le faltaba al sprint 2, 17-10** (Felipe: *"vamos con el desarrollo, con el módulo listo lo mandamos a producción"*):
- **Se viene**, construido: el calendario de las que se repiten cada año, como "en noviembre viene el Día de Campo del Dirigente".
- **Competidores**, construido: quién gana en la zona y una ficha por proveedor; el ganador del año anterior enlaza a su ficha. Desde la decisión 70 (22-10), además, «Tus competidores»: con quién compitió la empresa según las actas, los parecidos a ella en sus compradores y los que sigue.
- **Avisos**: sin correo (decisión 17): Felipe revisa la app a diario. Con eso el sprint 2 queda completo en el laboratorio.

La historia ahora revisa primero los últimos 60 días. Producción, cuando el módulo esté listo.

**Sprint 2, construido el 17-10** (Felipe: *"terminado esto, anda directo al
sprint 2"*): la bandeja, la ficha y la configuración, sin resumen por
correo. Quedan para después de la historia (1b): "el año anterior", el
calendario de recurrentes y la ficha de competidores. El aviso inmediato
de comuna cercana y alto valor espera la respuesta de Felipe.

**Hoja de ruta desde el 19-10** (Felipe: *"actualiza el roadmap... para que desarrollemos todo esto en el laboratorio"*). Todo se construye y se prueba primero en el laboratorio, en este orden. Producción, solo con el «a producción» de Felipe:

| Sprint | Qué | Se da por bueno cuando |
|---|---|---|
| A. El laboratorio al día | Felipe: *"me da la sensación que el laboratorio está atrasado respecto a producción"*. Medido el 19-10: lo está. Ver la nota de abajo | El laboratorio muestra lo mismo que producción |
| B. La bandeja más clara (decisión 31) | Un color por significado: el semáforo en las filas, la prioridad en su recuadro y la urgencia con reloj | Felipe distingue de un vistazo qué es prioridad y de qué color es cada una |
| C. La cotización de la postulación y «¿Calza el precio?» (decisión 29) | La propuesta técnica deja su lista de ítems del catálogo. Esa lista llena la cotización nueva, o reescribe la vinculada con aviso y bitácora. Si la oferta es menor que el catálogo, la diferencia entra como descuento en dinero. El panel muestra presupuesto, cotización, ganador del año anterior, oferta y descuento | En una licitación del laboratorio, la propuesta técnica y la cotización traen los mismos ítems y el panel muestra el margen con su color |
| D. Seguir una licitación, parte 1 (decisión 30) | La bandeja sin «Ver resumen», «Seguir» en el resumen, el montón «En seguimiento», la revisión diaria y el acta pública | Una licitación seguida muestra ganador, ofertas y precios cuando se adjudica |
| E. Seguir una licitación, parte 2 (decisión 30) | La descripción de lo que vende la empresa pasa a «Mi empresa». El resumen de negocio con IA se arma según esa descripción, con los documentos arrastrados | El resumen de una gira de estudio dice a quién ofrecerle qué |

**Cómo estaba el laboratorio el 19-10.**
- La rama `pruebas` iba 49 commits detrás de `main`. Faltaban todos los arreglos de Oportunidades desde el 17-10 en la noche (#148 a #165): la bandeja ordenada, traer todo, los formularios por dos caminos, el filtro afinado, los formularios que encuentra el análisis, «Generar anexos» sin casillas y la gran descarga. Son 61 archivos distintos solo en Oportunidades.
- Lo que `pruebas` tiene y `main` no es casi nada: el plan `15_CARGA_INICIAL_CON_IA.md`. Lo demás son copias (cherry-pick) de lo que ya está en `main`.
- Una mezcla de prueba de `main` en `pruebas`, hecha solo en el Mac y deshecha, chocó en 48 archivos: los mismos cambios llegaron por dos caminos.
- La base del laboratorio tiene todas las tablas de Oportunidades (migraciones 122 a 129, 141, 142 y 143). Le falta la descripción de Valle del Sol afinada en producción el 18-10. Su radar está apagado desde el 17-10 y comparte el ticket de Mercado Público con producción.
- **Propuesta, sin hacer:** mezclar `main` en `pruebas` dándole la razón a `main` en los choques, sin forzar la rama (otras conversaciones la usan). Revisar uno por uno los trozos que solo tiene el laboratorio. Después, el motor del laboratorio se despliega solo, la vitrina del laboratorio se publica desde `pruebas` al día y la descripción de Valle del Sol se copia de producción. El radar del laboratorio sigue apagado, para no gastar el cupo del ticket que usa la gran descarga. Todo con el OK de Felipe y avisando antes a las otras conversaciones.

Cada sprint: laboratorio primero, validación de Felipe, y su "a producción".
**Hecho el 19-10:** los cinco sprints se construyeron y probaron en el
laboratorio esa noche. En la mañana Felipe los revisó (*"se ve todo bien,
a producción"*) y pasaron con el PR #166: primero las migraciones 144 y
145 en la base de producción, después el motor y la vitrina.
Las migraciones van al laboratorio y a producción **antes** del motor.

**Hoja de ruta desde el 19-10 en la tarde** (decisiones 33 y 34; Felipe: *"ok, hagamos eso... inclúyelo en este sprint"*). Laboratorio primero; producción, con su «a producción». Va primero la F porque no depende de las otras y sirve de inmediato:

| Sprint | Qué | Se da por bueno cuando |
|---|---|---|
| F. Respaldos de experiencia (decisión 34) | El tipo «Respaldo de experiencia» con sus datos. Con el número de una orden de compra, Eventia completa el resto desde la ficha pública. El anexo de experiencia sale de ahí, con sus PDF | Las órdenes de compra de Valle del Sol cargadas llenan solas el anexo de experiencia del Funcionario, con sus números |
| G. Armar la oferta (decisión 33) | La IA crea la cotización vinculada con la matriz «especificación → línea de la cotización»; lo que falta en el catálogo se pide | En una licitación del laboratorio, la cotización cubre cada especificación técnica y dice qué falta en el catálogo |
| H. Documentos desde la cotización (decisión 33) | Propuesta técnica y anexos juntos desde la cotización; el desglose del anexo económico lo calcula Eventia | La propuesta, el anexo de calidad y el económico dicen lo mismo que la cotización |
| J. «Armar postulación» (decisión 35) | Un botón con el precio: la oferta, los anexos con ese precio y la propuesta si va; «Vincular con cotización» (nueva o existente), de solo lectura | Con el precio, la postulación queda armada sin apretar nada más, y la cotización vinculada no se deja editar a mano |
| I. Formato propio, «desactualizado», congelar al postular y el set (decisiones 33 y 34) | El formulario de calidad remite a la propuesta si se permite; aviso si la cotización cambió antes de postular; al pasar a «Postulada» la cotización y los documentos quedan fijos, y si sale «Ganada» es el contrato; «Descargar para Mercado Público» | El ZIP trae todo lo que piden las bases, en sus carpetas, y avisa lo que falta; una postulada no deja cambiar su cotización |

## 8. Costos (estimados, a medir el primer mes)

| Tarea | Modelo | Estimado |
|---|---|---|
| Leer y etiquetar una licitación | Haiku 5.5 | ~US$0,001; ~US$6 al mes con ~200 nuevas al día |
| Generar documentos de una postulación | Opus 5.5 | ~US$1 |
| Generar una cotización | Opus 5.5 | ~US$0,3 |

Tope: límite de gasto mensual de la organización en la consola de Anthropic,
**USD 50** (medido el 16-10; lo fijó Felipe). Saldo ese día: 9,84 US$, sin
recarga automática. La consola ofrece "Tu plan Max incluye USD 200 al mes en
créditos de API" (botón "Comenzar"): decisión de Felipe.

## 9. Datos de partida (medidos el 16-10-2026)

| Recurrente de Quillón | 2025 | Ganó | Precio | Ofertas |
|---|---|---|---|---|
| Día del Profesor | 4364-5-LE25 | Centro Turístico Sol de Quillón SpA | $12.000.000 | 1 |
| Día del Funcionario (cena) | 4352-6-LE25, tope $17M | BPM Eventos SpA | $13.949.580 | 1 |
| Día de Campo del Dirigente | 5040-25-LE25, tope $17M | Parque Aventuras Antu S.A. | $17.000.000 | 1 |

Día del Profesor 2026 (4364-13-LE26): 28 y 29 de octubre, ~235 personas en un
centro de eventos, almuerzo y amplificación; criterios precio 30, calidad de
la propuesta 30, **ubicación geográfica 20**, experiencia 10, programa de
integridad 5, requisitos formales 5 — los mismos de 2025.

## 10. Riesgos

1. **La API de Mercado Público se cae a ratos** (504 entre agosto y octubre de
   2026, lección del bot): reintentos, y una fuente caída no tumba la otra.
2. **Mercado Público demora en mostrar lo publicado** (~3 h vistas en
   Licify): por eso se compara contra la base y no contra "hoy".
3. **Bajar los archivos depende de la página web de Mercado Público**: si la
   cambian, se rompe. Pieza aislada, con prueba, y aviso si una licitación del
   rubro queda sin archivos.
4. **La IA se equivoca**: reglas de Quillón y monto por encima de la IA, y
   muestra semanal de rojas el primer mes.
5. **Relojes solo en producción** (`NODE_ENV=production`, zona 9 del mapa):
   el laboratorio prueba con "correr ahora".
6. **Una tabla nueva sin `GRANT` a `service_role`** deja la pantalla en error
   42501 (mapa 18): cada migración lo incluye.
7. **Lo que firma Felipe es responsabilidad de Felipe**: la declaración
   jurada y la oferta se revisan siempre antes de subir.
8. **El ticket de Mercado Público es uno solo** (10.000 consultas al día,
   de a una): el bot de GitHub quedó apagado el 17-10 y el radar del
   laboratorio ya no corre al encender (`OPORTUNIDADES_RADAR_AL_ARRANCAR=0`
   desde el 17-10), así que el cupo es de producción. La primera corrida de
   producción (17-10) vio 4.886 licitaciones activas: la carga inicial se
   reparte en varias pasadas.
9. **El respaldo diario de Eventia arma un solo archivo en memoria con
   todas las tablas** (mapa 16), y `mp_procesos` crece con todo Chile (unas
   500 por día). **Resuelto en el código el 17-10** (decisión 13):
   `FUERA_DEL_RESPALDO` en `backup-cron.service.ts` la deja fuera; son
   datos públicos que se vuelven a pedir, y Supabase guarda su propia copia
   diaria. Lo de cada empresa (`oportunidades`, `oportunidades_config`) sí
   queda en el respaldo.

## 11. Lo que no se hace

Postulación automática por reglas (sirve para vender productos en serie, no
eventos); subir la oferta a Mercado Público por Felipe con un usuario robot;
portales privados (wherEX, SeNegocia); convenio marco; app móvil propia.
Más adelante, si se pide: precio de referencia con el historial (pedido el
19-10: «¿Calza el precio?», decisión 29), ver la oferta técnica del ganador
anterior y el análisis del acta (pedido el 19-10: «Seguir», decisión 30),
indicadores de pago del comprador, foro, firma escaneada, orden de compra →
evento confirmado.

## 12. Pendiente (Felipe)

1. ~~Pegar el ticket de Mercado Público en Railway~~: hecho por Felipe el
   16-10 (`MP_TICKET` en `api-rest-pruebas`).
2. Activar o no los USD 200 al mes de créditos de API del plan Max.
3. ~~OK para el laboratorio~~: dado el 17-10.
4. ~~¿Todo Chile o solo las regiones?~~: todo Chile (decisión 12).
5. ~~Sacar `mp_procesos` del respaldo~~: hecho en el código (decisión 13).
7. ~~OK para aplicar la migración 123 (la historia) en el laboratorio~~:
   dado el 17-10 junto con la 124; las dos aplicadas en la base del lab.
8. **Las bases, sin poder bajarlas solas** (reCAPTCHA, §5.1 punto 4). Opciones:
   (a) **subirlas a mano** en la ficha (Felipe o Camila las bajan de Mercado
   Público, que es una persona pasando el control, y la IA las lee: se
   aclara el lugar, aparece el monto oculto y sale el checklist); es lo que
   igual pide el sprint 3 para llenar los anexos; (b) usar el MCP de
   Licify, que entrega documentos públicos con resumen (depende de un
   tercero y de sus condiciones); (c) preguntarle a ChileCompra por un
   canal oficial. Recomendación: (a).

   **Cómo lo hace Licify** (revisado el 17-10 a pedido de Felipe: *"no creo
   que estén cometiendo una ilegalidad... quizás hay un token especial"*).
   No hay token especial: lo dicen sus propios términos (terms.licify.cl,
   §5 y §6). La empresa cliente le agrega a Licify un **"usuario de
   sistema"** en su cuenta de Mercado Público, con un **mandato** para
   consultar y ofertar a su nombre. Ese usuario se agrega con su extensión
   de Chrome o su app. Licify entra como un usuario más de cada empresa:
   legal, con mandato. Lo oficial no trae los archivos:
   - la guía de la API de Compra Ágil (mayo 2026) tiene dos endpoints y solo
     da el `id` y el `nombre` de cada adjunto;
   - la de licitaciones solo trae el enlace al acta;
   - en la consulta pública de ChileCompra (marzo 2026), "acceso a documentos
     adjuntos" fue la sugerencia n.º 3 de la comunidad, porque no existe.

   Copiar el modelo con la cuenta de Valle del Sol sería un robot entrando con
   la cuenta de proveedor, y eso es lo que ChileCompra bloquea: bloqueo
   preventivo y proceso sancionatorio por herramientas automatizadas no
   autorizadas (aviso de diciembre 2025, art. 160 del DS 661/2024). Además
   pide Clave Única con segundo factor. Opciones nuevas:
   - (d) un botón en la ficha que abre la página oficial de adjuntos de esa
     licitación; la persona baja los archivos y los arrastra a Eventia;
   - (e) más adelante, una extensión propia de Chrome que, cuando Felipe abre
     los adjuntos en su navegador, ofrece "Guardar en Eventia" (su sesión, a
     ritmo de persona). Mirado el 17-10 en la página de adjuntos
     (`ViewAttachmentLC.aspx`), a pedido de Felipe:
     - cada fila tiene **«Ver Anexo»**, que baja ese archivo directo, **sin
       código**: es lo que hace una persona;
     - el código de imagen ("Ingrese el texto de la imagen") es para
       todos y sirve **solo para «Descargar seleccionados»** (el lote,
       hasta 20 MB). En el chat se dijo antes que salía por ser un
       navegador automatizado: era una suposición y estaba mal;
     - la lista igual aparece recién después del reCAPTCHA invisible al
       cargar, así que un programa sin navegador (el radar) sigue sin
       verla.

     La extensión haría lo mismo que «Ver Anexo» fila por fila, dentro de la
     sesión de Felipe.

     **Pospuesta el 17-10.** Felipe preguntó si se podía bajar con «Ver
     Anexo» desde el motor, solo para las que interesan. No se puede: desde
     el servidor habría que pasar el control invisible haciéndose pasar por
     persona. La versión buena es el botón en su Chrome. Felipe: *"estoy
     pensando para Eventia primero el Valle y luego que sea escalable...
     mientras dejemos como está de arrastrar, no nos desgastemos"*. Queda el
     arrastre (d). La extensión se retoma cuando el módulo se piense para
     otras empresas.
   - (f) la API de Licify en Apify (acción `list-files`, desde US$0,10 por
     1.000 resultados); falta probar si trae el archivo o solo el nombre.

   **Decidido el 17-10: (d).** Felipe: *"ok dale con el botón y
   arrastro"*. Construido ese día: sección "Bases y anexos" en la ficha,
   con el botón a Mercado Público, la zona de arrastre y la lista (Ver,
   Descargar, Eliminar). Migración 124 aplicada en el laboratorio. Felipe
   preguntó si Licify de verdad lo hace así: no usó su Clave Única, solo
   la extensión, y la navegación es fluida. Las dos cosas calzan con sus
   términos: la extensión usa la sesión abierta del cliente para agregar
   el usuario de Licify, que después entra con su propia cuenta. Y Licify
   baja los archivos antes en su servidor y muestra su copia. Lo que no
   dicen es cómo pasa su servidor el control antirrobots. Siguen
   pendientes (e) y (f), y que la IA lea lo subido (monto oculto, lugar,
   checklist).
6. ~~Quién ve el módulo y el resumen por correo~~: administradores, sin
   resumen (decisiones 14 y 15). Queda: ¿el aviso inmediato de comuna
   cercana y alto valor se mantiene? ¿Las rojas se esconden por omisión?

Decidido el 16-10 (§3, puntos 9 a 11): "grande" = monto de alto valor de la
empresa; avisos al correo de la empresa; regiones y comunas cercanas
configurables en el módulo.
