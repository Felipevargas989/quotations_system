# 18 · Seguimiento con IA (el botón «Generar seguimiento»)

> **Estado: EN PRODUCCIÓN desde el 17-10-2026** (Felipe: *"ok pásalo a
> producción"*). Paso 1 (el motor) probado en el laboratorio: la 475 dejó
> un correo nuevo en Borradores de felipe@ (14 s, US$ 0,04). Paso 2 (*"vamos
> con el paso 2"*): «✉ Generar seguimiento» en la tarjeta del tablero y en
> el aviso «Contacto comprometido» de la ficha, y «✉ Generar seguimientos
> (N)» arriba, con la barra de Cotizaciones en dos filas (*"los encuentro
> desordenados"*). Migración 140 en las dos bases; la llave de Outlook
> (`MS_CLIENT_SECRET`) la pegó Felipe en Railway. Mapa 01 §5.8, regla 33,
> riesgo 17; mapa 02 §2. Falta: la primera prueba con cotizaciones reales
> (paso 3) y las lecciones que deje.
>
> **17-10 en la noche: cuándo sale el borrador (§9).** Decisión de Felipe
> con la 559 a la vista. **Probado en el laboratorio** el 18-10 a las 02:45
> UTC contra Outlook de verdad (migración 141 en la base del lab, motor
> `5a1727a`, vitrina `6ad4317c`). **EN PRODUCCIÓN desde el 18-10-2026**
> (Felipe: *"si dale a producción"*; PR #153, migración 141 aplicada en
> producción antes de fusionar), coordinada con la sesión de Oportunidades.
>
> **18-10: siempre el hilo de la cotización (§3 punto 3).** Felipe: *"si
> dale que prefiera el hilo de la cotización siempre"*. En producción desde el
> 18-10-2026 (PR #156).

## 1. Por qué

Felipe, 17-10-2026: *"quiero agregar un botón en cotizaciones para hacer
seguimiento (…) todas las que requieran seguimiento porque esté vencida la
próxima acción, y que su próxima acción sea un correo (…) se genere
idealmente en el hilo donde está la conversación; si no está en el hilo,
que se cree un nuevo correo. Sigue los principios de la skill de correo
(…) ese botón esté en cada cotización y en un generar seguimiento general
arriba"*.

Hoy eso lo hace la skill `correos-cotizaciones-vds` desde el chat
(función 2, «Seguimiento»). El botón lo lleva a Eventia, para que lo use
cualquiera del equipo sin abrir el chat.

## 2. Cuáles entran

- Estado **enviada** o **en negociación**. Una solicitada nunca salió: no
  es seguimiento.
- Con el **compromiso vivo vencido**: el de la nota más reciente de la
  bitácora que tiene fecha, si no está cumplida, con la fecha antes de hoy
  (hora de Chile). Si esa nota ya se dio por cumplida, no hay compromiso:
  las anteriores no reaparecen (28-10-2026). Es el mismo «Contacto
  comprometido» que muestra el panel.
- Y **el botoncito de esa nota es Correo**. Felipe, 17-10, con la 607: el
  tipo de la nota que deja la fecha ES el tipo del próximo contacto. No se
  agrega ningún campo.
- **Sin tope de calendario** (18-10, mapa 02 §5.6): si la cotización choca
  con una aceptada, no se le insiste al cliente con una fecha que quizás no
  se pueda respetar. No se ofrece el botón hasta que se resuelve el tope.

Medido el 17-10: calzan **10**, todas con correo del cliente: 477, 508,
530, 578, 389, 607, 592, 559, 493 y 536. Con WhatsApp o llamada hay 13 más
vencidas: esas no entran.

## 3. Lo que hace con cada una

1. **Lee** la cotización, la bitácora completa, Observaciones y el
   comentario interno. El comentario interno sirve para razonar y NUNCA se
   copia ni se parafrasea al cliente.
2. **Se salta, y dice por qué** (sin borrador):
   - la nota del compromiso dice llamar, visitar o reunirse → «toca
     llamar». Caso real: la 592 tiene el botoncito Correo y la nota dice
     «llamar la próxima semana»;
   - el cliente no tiene correo, o es de relleno (`noindica@`,
     `sincorreo@`);
   - el evento ya pasó;
   - el hilo ya tiene un borrador;
   - el cliente escribió después de nuestro último correo y nadie le
     contestó: no es seguimiento, es respuesta → «requiere tu respuesta».
3. **Busca el hilo** con el correo del cliente y el del contacto de la
   cotización: contacto@ primero (ahí llega la copia oculta de cada
   «Enviar cotización» desde el 16-09, porque es el buzón de respuestas de
   la empresa), después felipe@, camila@, reservas@ y recepcion@.
   - **Siempre el hilo de la cotización** (Felipe, 18-10: *"que prefiera
     el hilo de la cotización siempre"*; el 17-10 la 493 quedó escrita en un
     hilo de factura). Es el que nombra su N° en el asunto (gana siempre), o
     el que habla de cotización o trae el correo de «Enviar cotización» de
     Eventia, sin nombrar otro número y con movimiento después de creada la
     cotización. Si un buzón no lo tiene, se sigue con el siguiente.
     Medido con las 10 del 17-10: 8 quedan igual; la 493 (factura) y la 508
     (su único hilo era el de la #535, otra cotización) pasan a correo nuevo.
   - **Con hilo:** borrador de seguimiento sobre el último mensaje de la
     casa, dirigido al cliente y con las mismas copias.
   - **Sin el hilo de la cotización en ningún buzón:** correo nuevo en
     contacto@, con el asunto de la casa. Nunca otro hilo.
4. **Escribe** con las reglas de correo (sección 4) y deja el borrador con
   el aviso ámbar de la casa. **Nunca envía, nunca borra ni mueve.**
5. **Bitácora:** una línea a nombre de quien apretó el botón (como «Crear
   con IA»), tipo correo, sin cifras: «Borrador de seguimiento con IA listo
   en el hilo de contacto@: <ángulo>. Revísalo en Outlook y envíalo desde
   ahí.» Sin próxima fecha: la pone quien envía, como en la skill. Si no
   quedó borrador, no se escribe nada.

## 4. Las reglas del correo: un solo archivo

Igual que con las cotizaciones (doc 16): las reglas viven en UN archivo del
motor, `REGLAS_DE_CORREO.md`, que leen el botón y la skill
`correos-cotizaciones-vds`. Salen de esa skill y de `correos-valle-del-sol`:

- Calidez en el saludo y la despedida; imparcialidad en las condiciones. No
  anticipar la reacción del cliente. Español de Chile, tú o usted según el
  hilo, sin las frases prohibidas.
- Cuenta en qué está la cotización, con un ángulo distinto al del
  seguimiento anterior. Tres o cuatro párrafos cortos.
- El precio no se mueve: nada de descuentos, urgencias inventadas ni
  «últimos cupos». Todo valor, con IVA.
- Si el evento está a menos de 30 días, recordar con tacto que la fecha se
  reserva con el abono.
- Voz: en contacto@, plural de equipo; en felipe@, Felipe en primera
  persona.
- Sin firma (la pone Outlook al enviar) y sin RUT, datos bancarios,
  enlaces ni claves del portal.

Cada corrección de Felipe se escribe en ese archivo, en «Lecciones», y la
aplican el botón y la skill desde el siguiente despliegue.

## 5. Pantallas

- **Cotizaciones:** en cada fila que calce, un botón chico «✉ Generar
  seguimiento». Arriba, junto al filtro «Requieren seguimiento»,
  **«✉ Generar seguimientos (N)»**: va de a uno, con contador, y muestra un
  resultado por cotización (borrador listo, toca llamar, saltada y por
  qué). Tope de 20 por vez, las más vencidas primero.
- **Ficha de la cotización:** el mismo botón en el aviso «Contacto
  comprometido», junto a «Registrar gestión».
- Solo con el derecho `seguimiento_con_ia`, módulo propio de Valle del Sol
  como «Crear con IA».

## 6. El motor

- `POST /quotations/:id/seguimiento` (una) y
  `GET /quotations/seguimiento/pendientes` (las que calzan). Las reglas de
  la sección 2 se revisan en el motor, no en la pantalla.
- **Outlook:** la llave de la empresa, la misma app de Microsoft que usa
  `graph_borrador.py`, con `Mail.ReadWrite` (revisado de nuevo el 17-10:
  lee contacto@ y puede crear borradores). El único secreto es
  `MS_CLIENT_SECRET`: Felipe lo pega en Railway, en el laboratorio y en
  producción. Los identificadores de la aplicación son públicos y van por
  defecto en el código, como en la herramienta. El motor toca SOLO los cinco buzones de
  la lista y SOLO crea borradores. El código sigue a `graph_borrador.py`
  (buscar, leer, seguimiento, nuevo), que ya resolvió el hilo, las copias y
  el aviso ámbar.
- **Claude** (`claude-opus-5-5`, como «Crear con IA»): un viaje por
  cotización, con salida de estructura fija: cuerpo del correo, asunto si
  es nuevo y ángulo, o «saltar» con el motivo.
- **Laboratorio:** sus clientes son de prueba. Solo el motor de
  producción (servicio `api-rest` de Railway, sin `EMAILS_SILENCED`) toca
  los buzones de verdad; el laboratorio, las pruebas y un motor local usan
  solo felipe@, para no ensuciar contacto@. Si algo falla, falla del lado
  seguro.
- **Costo estimado:** US$ 0,05 a 0,10 por seguimiento. Se mide en la
  primera prueba.

## 7. Pasos

1. `REGLAS_DE_CORREO.md` y el motor con Outlook y Claude, en el
   laboratorio, con la llave de Outlook en el Railway del laboratorio.
2. Los botones: fila, arriba y ficha.
3. Prueba en producción con las cotizaciones del día: quedan borradores,
   nada se envía, y Felipe los revisa. Sus correcciones van a «Lecciones».
4. Producción: la migración 140 del derecho (reservada con la sesión de
   Oportunidades el 17-10) y la llave en el Railway de producción.

## 8. Preguntas abiertas

- La llave de Outlook en Railway la pone Felipe. Sin ella, Eventia no
  puede dejar borradores.
- Quién aprieta el botón. Propuesta: ventas y administración, los mismos
  de «Crear con IA».

## 9. Cuando el borrador sale (Felipe, 17-10-2026 en la noche)

Felipe, con la 559 a la vista: *"ese creo que ya se mandó el correo y
todavía aparecía generar seguimiento"*, y *"no creo que esté bien que
desaparezca cuando se registra la gestión"*. Decidió:

- La cotización sale **sola** de la lista cuando el borrador **se envía**.
- Eventia lo revisa **al abrir Cotizaciones**, sin reloj de fondo
  (*"¿no será excesivo que entres cada 15 min?"*): como mucho una consulta
  a Outlook por borrador cada 5 minutos, y **sin IA** (cero tokens).
- Al ver que salió, anota el envío en la bitácora con el próximo contacto:
  *"dejemos en 14 días siguiente contacto por correo, 2 correos sin
  respuesta pasa a calendarizarse un llamado a la siguiente semana"*.
- Mientras el borrador espera, la tarjeta muestra el aviso **«Borrador en
  Outlook»** en vez del botón. Así no se escriben dos. Sin enlace para
  abrirlo (Felipe, 18-10: *"el aviso acá es más que suficiente"*): se
  abre en Outlook, donde se revisa y se envía. Lo mismo el «Borrador listo»
  que aparece al escribirlo.
- OK final: *"si dale me parece bien"*.

### 9.1 Lo que se midió antes de construir (17-10, solo leyendo)

Los 6 borradores que dejó Camila ese día en contacto@:

| N° | En Outlook |
|---|---|
| 536 y 559 | En **Enviados**, ya no son borrador (salieron a las 17:56 y 17:58). Conservan la hora en que se creó el borrador: es el mismo mensaje |
| 477 y 578 | Siguen en **Borradores** |
| 607 y 493 | En **Elementos eliminados**, todavía como borrador: se descartaron |

Microsoft da un **identificador inmutable** (`Prefer: IdType="ImmutableId"`)
que no cambia cuando el mensaje pasa de Borradores a Enviados o a Elementos
eliminados. Con él, saber si salió es **una sola consulta**.

Dos hallazgos de esa medición:

- Algunos correos que salen de la casa llegan a contacto@ con la dirección
  interna de Exchange (`/o=exchangelabs/…`, sin @). Ahora cuentan como de
  la casa; antes se leían como del cliente.
- La 493 eligió un hilo de **factura** de un evento anterior («Factura
  N°347…»): era la conversación más reciente con ese contacto. Camila lo
  borró. Queda como lección por conversar con Felipe: preferir el hilo de la
  cotización.

### 9.2 Cómo funciona

1. «✉ Generar seguimiento» guarda cada borrador en `seguimientos_con_ia`
   (migración 141): buzón, modo, identificador inmutable, hilo, enlace y
   ángulo.
2. Al abrir Cotizaciones (o la ficha), la pantalla llama a
   `POST /quotations/seguimiento/revisar`. El motor pregunta por cada
   borrador que espera (los de los últimos 30 días; cada uno como mucho cada
   5 minutos, y una sola pantalla a la vez):
   - **Sigue de borrador:** nada. La tarjeta dice «Borrador en Outlook» y
     «Generar seguimientos (N)» no lo cuenta.
   - **Salió:** una línea en la bitácora a nombre de **Asistente**, por
     ejemplo «Seguimiento con IA enviado desde contacto@ el 17-10. Próximo
     contacto por correo el 31-10, en 14 días.» El tipo de la nota es el del
     próximo contacto, así que la cotización deja la lista.
   - **Se borró:** si después salió otro correo de la casa en el hilo, ese
     fue el seguimiento (escrito a mano) y se anota igual. Si no, queda
     descartado, sin línea, y el botón vuelve.
3. **El próximo contacto:** correo a 14 días. Si ya van **dos seguimientos
   sin respuesta**, llamada a los 7 días. Se cuentan los correos de la casa
   después del ancla: el último correo del cliente, o el último envío de una
   cotización (el de Eventia o uno con el PDF adjunto). Es la regla de la
   skill: *"tras dos seguimientos sin respuesta, el paso siguiente es
   teléfono"*. Con los hilos reales: la 477 da 2 (llamada) y la 578 da 1
   (correo).
4. **Lo que se respeta:**
   - Si alguien ya anotó un próximo contacto después del borrador, manda lo
     suyo y no se escribe otra línea.
   - Si el negocio se aceptó o se perdió mientras el borrador esperaba, la
     línea va sin próximo contacto.
5. Antes de escribir otro, «Generar seguimiento» mira si un borrador
   anterior ya salió. Si uno todavía espera, se salta con el motivo «ya hay
   un borrador esperando en Outlook».

### 9.3 Costo

Cero tokens. Una consulta a Outlook por borrador que espera, como mucho cada
5 minutos y solo cuando alguien mira Cotizaciones. Cuando sale, una consulta
más para leer el hilo, una sola vez.

### 9.4 Los borradores del 17-10

Se cargan a mano en producción cuando suba (los 6 de Camila):

- 477 y 578 quedan esperando.
- 536 y 559 se anotan solos en la primera revisión.
- 607 y 493 quedan descartados.

### 9.5 La prueba del laboratorio (18-10, 02:45 UTC)

Con tres borradores de felipe@ (el único buzón del laboratorio), solo
leyendo Outlook:

| N° del lab | Caso | Resultado |
|---|---|---|
| 475 | El borrador de prueba sigue en Borradores | Queda esperando; la tarjeta muestra «Borrador en Outlook» y «Generar seguimiento» se salta («ya hay un borrador esperando en Outlook (felipe@)»), sin gastar IA |
| 436 | Un correo que ya salió de felipe@ | Línea «Asistente»: «Seguimiento con IA enviado desde felipe@ el 17-10. Próximo contacto por correo el 31-10, en 14 días.» |
| 437 | Un identificador que ya no existe | Descartado, sin línea |

Lo que enseñó la prueba: PostgREST vuelve a aplicar un filtro `or` sobre lo
que devuelve un update, y ahí la columna no venía (error 42703). La toma del
borrador quedó con filtros simples y el freno de 5 minutos en el servicio.

### 9.6 La subida a producción (18-10, 00:13 a 00:45 Chile)

Migración 141 en producción, PR #153 fusionada (`main` 82cd5a9, motor
`82cd5a9`), vitrina de producción `6ad43b7f`. Al cargar los 6 borradores del
17-10 apareció que `creado_por` tenía una llave a `user_profiles(id)` y el
motor guarda el id de la sesión: se quitó con la migración 142 en las dos
bases, sin reiniciar el motor (mapa 18 §23). La primera revisión, al abrir
Cotizaciones:

| N° | Resultado |
|---|---|
| 536 y 559 | Salieron: línea «Asistente» con próximo contacto por correo el 31-10, y dejaron la lista |
| 477 y 578 | Esperan en Borradores: aviso «Borrador en Outlook» |
| 607 y 493 | Se borraron sin enviarse: descartadas, vuelve el botón |

Respaldo de la carga: `02_RESPALDOS/cambios_de_datos/2026-10-18_seguimientos_con_ia_carga_del_17-10.json`.

