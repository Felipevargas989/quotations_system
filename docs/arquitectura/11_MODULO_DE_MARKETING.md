# 11 · Módulo de Marketing

Acordado con Felipe el 25-08-2026 ("ok vamos"), heredando las decisiones
del proyecto de mailing del 30-07 (chat aparte): **sin Brevo** (lo usó y
no le gustó), motor **Resend** (ya contratado, la clave vive en Railway),
y las 396 respuestas de cabañas del Forms como audiencia importada.

**La pregunta que zanjó dónde vive:** "¿otro sistema o acá no más?" —
acá. La audiencia ES la base de Eventia (clientes, eventos, precios):
el filtro "empresas sin cotización 2026" se calcula en vivo; en un SaaS
sería exportar planillas que envejecen en una semana.

## Las reglas de fierro

1. **Marketing LEE el CRM, jamás le escribe.** Los contactos importados
   (cabañas) viven en tablas propias — no son clientes de eventos.
2. **Baja obligatoria**: todo correo lleva link de baja (ley chilena de
   correos comerciales). La baja cae a la lista de supresión y NINGUNA
   campaña puede saltársela.
3. **Regla de una vez**: un correo jamás recibe dos veces la misma
   campaña (único por campaña+correo en la base).
4. **Sin prueba no hay envío**: el botón de envío real se abre solo
   después de "Prueba a mi casilla".
5. **Reputación separada**: el masivo debe salir por un remitente
   aparte del transaccional (`MARKETING_FROM`; mientras Felipe no
   configure el subdominio en Resend —2-3 registros DNS— se usa el
   dominio actual, anotado como deuda).
6. Sin editor libre ni journeys: plantilla de la casa con campos
   (título, cuerpo, botón), campañas disparadas a mano.

## Fase 1 (construida)

- **Audiencias**: dinámicas ("Clientes por tipo", multi-selección de
  client_type, solo con correo) e importadas (CSV → etiqueta de
  audiencia; dedupe y correos inválidos reportados al importar).
- **Campañas**: nombre interno, asunto, título, cuerpo, botón opcional;
  personalización `{nombre}` y `{empresa}`; prueba a la casilla del
  usuario; envío por Resend en LOTES (batch API); registro por
  destinatario (enviado/fallido); historial con totales.
- **Baja**: endpoint público firmado (HMAC del correo) que suprime y
  responde una página simple.

## Fase 2 (construida el 25-08)

Webhook público `/marketing/webhook` (firma Svix verificada cuando
`RESEND_WEBHOOK_SECRET` está puesto; sin él procesa igual — un evento
solo marca sellos si su resend_id existe acá). Sellos por destinatario
(abierto/click/rebote), contadores en la fila de la campaña
(👁 · 🔗 · ↩), **"Reenviar a los que no abrieron"** (una sola segunda
pasada por destinatario, asunto variante "¿Lo viste? …", solo
no-abiertos no-rebotados no-suprimidos), y el rebote duro o queja
**suprime solo**.

**Pendiente de Felipe para que los contadores vivan**: crear el webhook
en el panel de Resend apuntando a
`https://api-rest-production-d404.up.railway.app/marketing/webhook`
(eventos: opened, clicked, bounced, complained) y poner el
`RESEND_WEBHOOK_SECRET` en Railway.

## Fase 3 (construida el 25-08)

**El constructor de segmentos** ("quiero ver cómo crear audiencias
desde los datos que ya tengo"): condiciones que se SUMAN — tipo de
cliente, su historia (evento realizado/aceptado/rechazado, con rango de
fechas), aniversario (evento realizado hace 11-13 meses), dormidos (sin
cotizar desde una fecha), presupuesto histórico (su mayor evento
aceptado/realizado ≥ X) y tipo de evento. **Previa en vivo** (cuántos y
quiénes, bajas ya descontadas) en la pestaña Audiencias y dentro de
Nueva campaña ("Segmento de tu base"). El segmento se guarda como
filtro en la campaña y se recalcula al enviar: nunca listas viejas.
Resolvedor puro con pruebas (`segmento.spec.ts`).

## Tablas (migración 91)

`marketing_contacts` (audiencia etiquetada, datos jsonb para la
satisfacción del Forms), `marketing_suppressions` (correo único por
empresa, motivo baja/rebote), `marketing_campaigns` (contenido + estado
borrador/enviada + sellos), `marketing_sends` (una fila por
destinatario por campaña, única por campaña+correo).

## Audiencias guardadas y el flujo definitivo (validado por Felipe el 25-08)

Tras revisar cómo trabajan los grandes (Mailchimp como patrón), Felipe
validó el plan de 5 puntos + formato. El flujo quedó:
**Audiencias (crear y guardar) → Campañas (elegir audiencia + contenido
+ prueba + enviar) → Resultados (y segunda pasada)**.

1. **La audiencia es una PREGUNTA guardada con nombre** (consulta
   viva): tabla `marketing_audiences` (migración 93) con `filtro`
   jsonb. El conteo se recalcula contra la base al mirarla y al
   enviar — "si mañana entran 2 que calzan, quedan adentro solos".
   La pestaña Audiencias es la estantería: guardadas (chip "De tu
   base", conteo de hoy) e importadas (chip "Importada", lista fija)
   en una sola lista.
2. **La campaña no arma audiencias: ELIGE una** — un solo selector
   (`SelectWithSearch` con grupos): "Todos los clientes" (= filtro
   vacío), guardadas, importadas. La campaña guarda `audiencia_id` +
   una FOTO del filtro (respaldo si la audiencia se borra; al enviar
   manda el filtro DE HOY de la audiencia).
3. **Nombres de negocio**: la sección se llama "Qué pasó con ellos" y
   los chips "Nos compró" (aceptada+realizada) / "No nos compró"
   (rechazada+anulada). Decisión de Felipe.
4. **Preencabezado** (`preencabezado` en la campaña): la frase gris de
   la bandeja; va oculto al inicio del HTML. Optativo.
5. **Reenvío con manual**: el modal muestra "enviada hace X días" y
   guía 2-7 días (ámbar si es antes, verde en ventana, gris si tarde);
   el asunto nuevo es OBLIGATORIO y distinto al original
   (`validarAsuntoDeReenvio`, puro con pruebas). Queda registrado en
   `reenviada_con_asunto`.

**Formato de la casa**: la plantilla de campañas usa el MISMO azul,
cabecera, botón y pie que `email/templates/baseLayout.ts` (cotizaciones
y seguimientos) — pedido de Felipe: "homogéneo, estructurado y
elegante". Con estilos en línea (correo no confía en <style>) más las
dos piezas propias: preencabezado oculto y baja obligatoria.

Lo que a propósito NO se trajo: editor de bloques, journeys, A/B.

## A personas, no a fichas (26-08, pregunta de Felipe)

Las audiencias de la base resuelven a **PERSONAS**: el filtro decide
por la historia del CLIENTE, y cada cliente que calza se expande a
todos sus contactos con correo (`client_contacts` — el multi-contacto
del CRM). `{nombre}` es la persona ("Hola Sandra"), `{empresa}` el
cliente. Cliente sin contactos con correo: respaldo al correo simple
de la ficha. La regla de una vez sigue siendo POR CORREO, igual que
las bajas. Además el sobre lleva replyTo al "Responder a" de
Configuración → Notificaciones, y las importadas muestran el conteo
con bajas descontadas y visibles ("2 contactos · 1 baja").

## Pendiente menor de DNS (26-08, sin urgencia)

En `send.eventi-app.com` conviven DOS registros TXT SPF (uno fusionado
correcto + un duplicado corto que GoDaddy protege y no deja borrar ni
editar — es de un servicio propio de ellos, `_spfm`). Dos SPF en el
mismo nombre se invalidan entre sí; el correo llega igual porque DKIM
firma y DMARC pasa por ese lado. Estado idéntico al que existía desde
julio: higiene, no urgencia. Resolución futura: llamar a soporte
GoDaddy para que quiten su registro `send` corto (el fusionado ya
contiene ambos permisos). DMARC quedó único (p=quarantine) y el
subdominio de rastreo track.eventi-app.com verificado con aperturas y
clics encendidos.

## Programar envío + la recomendación de horario (04-09-2026, "ok vamos")

Pedido de Felipe: dejar una campaña programada para un día y hora, y
que la pantalla recomiende CUÁNDO — asociado a sus audiencias.

**La ruta elegida es el RELOJ DEL MOTOR (ruta B), no el scheduled_at
de Resend**: el batch de Resend no acepta programación (solo el envío
de a uno), y partir el despacho en dos caminos duplicaría el flujo ya
validado con campañas reales. En cambio: la campaña guarda su hora, y
un cron del motor (Railway, 24/7 — no depende del computador de nadie)
dispara EL MISMO despacho de siempre a la hora dicha.

**Reglas:**

1. Programar exige lo mismo que enviar: campaña en borrador CON prueba
   hecha, y una fecha futura. Al programar, la campaña pasa al estado
   **`programada`** — que además la deja no-editable (los candados de
   "solo borrador se edita" la protegen solos). Para editarla, primero
   se cancela la programación (vuelve a borrador, sin perder nada).
2. El cron corre cada minuto (solo producción, como todos los crones
   de la casa): toma las campañas programadas cuya hora llegó, con un
   candado atómico anti-doble-disparo, y llama al despacho existente —
   lotes, regla de una vez, supresiones DE HOY, audiencia recalculada
   al enviar ("nunca listas viejas") y la copia del capitán a QUIEN LA
   PROGRAMÓ (`programada_por`).
3. Si el despacho falla, la campaña vuelve a borrador con su
   programación limpia y el error queda en el log — nada de reintentos
   infinitos en silencio.
4. En el laboratorio el cron no corre (los crones son solo de
   producción): allá se valida la pantalla completa; el disparo real
   se valida en producción con una campaña a una audiencia de una sola
   persona (el propio Felipe).

**La recomendación de horario, POR AUDIENCIA (regla de Felipe):**

Cada audiencia de la campaña muestra su recomendación en la ventana de
programar:

- **Con historial propio** (≥ 30 aperturas de campañas pasadas a esa
  audiencia): "Tus [Empresas] abren más los martes entre 10 y 12 h" —
  calculado de los `opened_at` reales (migración 92) agrupados por día
  de semana y bloque de 2 horas, en hora de Chile.
- **Sin historial**, el respaldo de los estudios según el público de
  la audiencia (clasificador puro `publicoDeAudiencia`, con pruebas):
  - Público de OFICINA (empresas, colegios/universidades, convenios,
    instituciones, tour operadores, empresas públicas): **martes o
    jueves, 9:30–11:00** — llegan al escritorio con la bandeja fresca.
  - Público de CASA (particulares, paseos de curso —los cotiza el
    apoderado, no el colegio—, iglesias, cabañas): **martes a jueves,
    17:00–19:00** — el celular en la casa.
  - Sin señales (importada sin tipos reconocibles): casa.

Migración 103: `programada_para` (timestamptz) y `programada_por`
(text) en `marketing_campaigns`.
