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
    el camino de la postulación con el botón al paso que sigue; el color
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
35. **«Armar postulación»: un solo botón, y la cotización de la licitación de solo lectura** (19-10, aprobado: *"exacto y si vinculo también queda solo de lectura... parte"*). Felipe, al revisar el laboratorio: *"dice que se arma una oferta con IA, pero todavía está el crear documentos con IA... son demasiadas opciones"*; y después: *"¿no será suficiente con un solo botón que diga armar postulación y que haga todos los anexos, arme la propuesta técnica, arme la propuesta comercial, que solamente me pida el precio... y que de ahí mismo deje la opción para vincular con la cotización: vincular a tal o crear nueva, y que la que se cree nueva no sea editable?"*.
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
45. **Los respaldos de Post-venta** (19-10, pedido por Felipe): *"En caso de que sea muy pobre los respaldos, podemos buscar en el mismo Eventia y ahí tenemos las facturas y quién fue... Buscar en Eventia y terminar de armar ese archivo con experiencia relevante y los respaldos que o están en Eventia o están en mi empresa"*. En el Día del Profesor, de 17 respaldos solo 3 caían en el período que cuenta; Eventia tenía facturas y órdenes de compra de 2026 subidas a sus eventos.
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
  **y del rubro** (alguna etiqueta distinta de "otro") → nunca rojo, y aviso
  inmediato. Afinado al construir (16-10): una compra de hormigón de Quillón
  sigue roja;
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
- **Competidores**, construido: quién gana en la zona y una ficha por proveedor; el ganador del año anterior enlaza a su ficha.
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
