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

## Fase 2 (pendiente)

Webhooks de Resend (abierto/click/rebote por destinatario), tablero por
campaña, "Reenviar a los que no abrieron" (solo no-abiertos
no-suprimidos, asunto variante), rebote duro suprime solo.

## Fase 3 (pendiente)

Segmentos finos: rango de presupuesto, aniversario de evento,
rechazadas por precio.

## Tablas (migración 91)

`marketing_contacts` (audiencia etiquetada, datos jsonb para la
satisfacción del Forms), `marketing_suppressions` (correo único por
empresa, motivo baja/rebote), `marketing_campaigns` (contenido + estado
borrador/enviada + sellos), `marketing_sends` (una fila por
destinatario por campaña, única por campaña+correo).
