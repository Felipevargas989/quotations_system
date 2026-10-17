# 18 · Seguimiento con IA (el botón «Generar seguimiento»)

> **Estado: PLAN, sin construir (17-10-2026).** Espera el OK de Felipe. Se
> construye después de pasar a producción la corrección de «✨ Crear con
> IA» (PR #143). Este documento manda sobre la memoria de cualquier sesión:
> si una conversación cambia una decisión, se actualiza aquí en el mismo
> movimiento.

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
- Con el **compromiso vivo vencido**: la nota más reciente de la bitácora
  que tiene fecha y no está cumplida, con la fecha antes de hoy (hora de
  Chile). Es el mismo «Contacto comprometido» que muestra el panel.
- Y **el botoncito de esa nota es Correo**. Felipe, 17-10, con la 607: el
  tipo de la nota que deja la fecha ES el tipo del próximo contacto. No se
  agrega ningún campo.

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
   - **Con hilo:** borrador de seguimiento sobre el último mensaje de la
     casa, dirigido al cliente y con las mismas copias.
   - **Sin hilo:** correo nuevo en contacto@, con el asunto de la casa.
4. **Escribe** con las reglas de correo (sección 4) y deja el borrador con
   el aviso ámbar de la casa. **Nunca envía, nunca borra ni mueve.**
5. **Bitácora:** una línea a nombre de «Asistente», tipo correo, sin
   cifras: «Borrador de seguimiento listo en el hilo de contacto@:
   <ángulo>. Pendiente de revisión y envío.» Sin próxima fecha: la pone
   quien envía, como en la skill.

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
  `graph_borrador.py`, con `Mail.ReadWrite` (revisado el 18-09). Felipe la
  copia en Railway, en el laboratorio y en producción: son tres valores
  (inquilino, aplicación y secreto). El motor toca SOLO los cinco buzones de
  la lista y SOLO crea borradores. El código sigue a `graph_borrador.py`
  (buscar, leer, seguimiento, nuevo), que ya resolvió el hilo, las copias y
  el aviso ámbar.
- **Claude** (`claude-opus-5-5`, como «Crear con IA»): un viaje por
  cotización, con salida de estructura fija: cuerpo del correo, asunto si
  es nuevo y ángulo, o «saltar» con el motivo.
- **Laboratorio:** sus clientes son de prueba. Ahí el borrador se crea
  solo en un buzón de ensayo (felipe@), para no ensuciar contacto@.
- **Costo estimado:** US$ 0,05 a 0,10 por seguimiento. Se mide en la
  primera prueba.

## 7. Pasos

1. `REGLAS_DE_CORREO.md` y el motor con Outlook y Claude, en el
   laboratorio, con la llave de Outlook en el Railway del laboratorio.
2. Los botones: fila, arriba y ficha.
3. Prueba en producción con las cotizaciones del día: quedan borradores,
   nada se envía, y Felipe los revisa. Sus correcciones van a «Lecciones».
4. Producción: la migración del derecho (número a coordinar: de la 131 en
   adelante son de Oportunidades) y la llave en el Railway de producción.

## 8. Preguntas abiertas

- La llave de Outlook en Railway la pone Felipe. Sin ella, Eventia no
  puede dejar borradores.
- Quién aprieta el botón. Propuesta: ventas y administración, los mismos
  de «Crear con IA».
