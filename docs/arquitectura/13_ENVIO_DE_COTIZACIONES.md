# 13 — Envío de cotizaciones por correo (con PDF del motor)

**Estado: EN PRODUCCIÓN desde el 05-09-2026 (PR #92), validado por
Felipe en el laboratorio con envíos reales.** De la validación salieron
además: el correo espejo de la hoja de valores, el reenvío con
"Hemos actualizado tu cotización" (asunto propio y sello de versión
contra el recorte de Gmail), la tipografía Inter incrustada en la hoja
y la fecha de emisión en hora de Chile. El motor necesita las
librerías del navegador declaradas en Railway
(`RAILPACK_DEPLOY_APT_PACKAGES`: nss, nspr, expat, gbm, xkbcommon,
drm, fontconfig y fuentes Liberation/DejaVu) — ya declaradas en lab y
producción; sin ellas Chromium no arranca o imprime sin letras.

Este documento manda sobre la memoria de cualquier sesión. Si una
conversación cambia una decisión, se actualiza aquí en el mismo
movimiento.

## El caso de negocio

Hoy enviar una cotización es artesanal: el botón de correo de la ficha
del negocio abre un borrador vacío en Outlook y el vendedor redacta a
mano, genera el PDF desde el visor (imprimir → guardar como PDF) y lo
adjunta. La evidencia de que el PDF no es un capricho: el jefe de
Abastecimiento de Santo Tomás lo pide "en formato PDF" — los
departamentos de compras archivan documentos, no correos.

Lo que se construye: **un botón "Enviar cotización" en la ficha del
negocio** que envía por Resend un correo tipo con el detalle de la
cotización en el cuerpo y **el PDF adjunto, generado por el motor**.

Decisiones de alcance ya tomadas con Felipe:

- **Correo tipo determinista, NADA de LLM por envío.** La plantilla
  sigue las reglas de la skill de correos de Valle del Sol (ver abajo).
  Los correos finos (cliente que repite, alzas de precio) siguen
  siendo artesanales con la skill.
- El botón de Outlook **se eliminó** (Felipe, validando en el lab el
  05-09: "me gusta el botón pero eliminaria el botón correo"). El
  correo artesanal sigue posible copiando el correo del mandante desde
  la misma ficha. Antes de esa validación el plan era conservarlo.
- Costo aceptado: Chromium engorda la imagen del motor en Railway y
  cada envío consume memoria mientras imprime. **Monitorear memoria
  tras el pase a producción.**

## La regla de oro: UNA sola plantilla

**El motor no dibuja un segundo PDF.** Hace lo mismo que hace una
persona: abre la hoja de la cotización en un navegador y la imprime —
solo que el navegador es invisible y vive en el servidor.

La hoja es `frontend/src/utils/quotationPrintDoc.ts`
(`buildQuotationPrintDoc`, función pura extraída del visor el
30-07-2026), la MISMA que ven el equipo (QuotationViewer), el portal
del mandante y ahora el PDF adjunto. Garantía que se preserva: **el
PDF es exactamente lo que se ve en pantalla.** Cualquier cambio de
diseño de la hoja se hace allá y aplica a los tres mundos solo.

## Las piezas (todas reusadas)

| Necesidad | Pieza que ya existía | Dónde |
|---|---|---|
| Datos de la hoja con lista blanca | `getPortalQuotation` (portal del mandante) | `quotations.service.ts` |
| La hoja HTML | `buildQuotationPrintDoc` | `frontend/src/utils/quotationPrintDoc.ts` |
| Marca del correo | `plantillaCampana` + `marcaDesdeFila` | `marketing/plantilla.ts`, `marketing/marca.ts` |
| A quién se envía | la regla `contactoDe` de la ficha | `NegocioPage.tsx` (se replica en el motor) |
| Registro del envío | bitácora de Seguimiento | `quotation_followups` |
| Adjuntos por Resend | patrón del embudo de consultas | `consultas.service.ts` |

No hay migración de base de datos: el envío se registra como una
anotación más de la bitácora.

## Cómo funciona el circuito

1. El vendedor aprieta **"Enviar cotización"** en la ficha del negocio
   y confirma (se le muestra a qué correo saldrá).
2. El motor pasa el **portero del envío** (abajo). Si hay reparos,
   devuelve el error y no sale nada.
3. El motor firma un **token de impresión** de corta vida (HMAC,
   15 minutos, solo esa cotización) y navega con Chromium headless a
   `FRONTEND_URL/imprimir/<token>` — una ruta pública nueva del
   frontend que pinta la hoja con `buildQuotationPrintDoc`.
4. `page.pdf()` produce el adjunto. El navegador se cierra siempre
   (finally), un envío a la vez.
5. Sale el correo por Resend: cuerpo tipo + PDF adjunto,
   `from` = `{empresa} <hola@eventi-app.com>`, `replyTo` = el correo
   del usuario que envió (las respuestas le llegan al vendedor).
6. Queda la anotación en la bitácora de Seguimiento: "Cotización
   enviada por correo a {destinatario}".

### El token de impresión

- HMAC-SHA256 con el mismo secreto de las bajas de marketing
  (`MARKETING_BAJA_SECRET`, con respaldo en `RESEND_API_KEY`).
- Contenido: id de la cotización + vencimiento (15 min). Token
  vencido o adulterado = 404 sin pistas, igual que el portal.
- La puerta pública `GET /quotations/imprimir/:token` devuelve
  EXACTAMENTE la misma lista blanca que la puerta del portal (helper
  compartido): jamás costos internos.

### El destinatario

La misma regla de la ficha: el contacto de la cotización
(`contact_name` buscado en los contactos del cliente) y su correo;
si no hay, el correo del cliente. **Sin correo → el portero frena.**

## El portero del envío (frenos deterministas)

Frenos que BLOQUEAN, con mensaje claro de qué reparar:

1. **Sin correo de destino** — ni el contacto ni el cliente tienen.
2. **Total en cero** — cotización sin monto no se envía.
3. **Servicio con precio $0** — un ítem variable o fijo en cero es
   casi siempre un olvido; se corrige o se borra antes de enviar.

Sin frenos por estado de la cotización: quien aprieta el botón decide.
NADA de validación por LLM.

## El correo tipo (reglas de la skill, hechas código)

- Asunto: `Cotización {tipo de evento} {cliente} — {día de semana}
  {fecha}` (el día de semana se CALCULA de la fecha, jamás se asume;
  fechas de evento son UTC medianoche — formatear con timeZone UTC
  como hace la hoja).
- Saludo cálido con el primer nombre del contacto; cierre invitando a
  responder este mismo correo.
- Tabla de servicios con precios (los mismos grupos que la hoja:
  servicios por persona con su valor, servicios fijos con el suyo).
- Bloque de totales: **neto + IVA + total, nunca el neto solo**. El
  cálculo replica el de la hoja: la propina se descuenta del total
  para obtener el monto con IVA; neto = total con IVA / 1,19.
- Condiciones neutras: no se promete bloqueo de fecha (la fecha se
  bloquea contra abono, y eso se conversa, no se promete en el tipo).
- Sin guion largo en el texto; sin frases prohibidas de la skill
  ("no dudes en", "quedo atento a sus comentarios", etc.).
- La plantilla visual es `plantillaCampana` sin línea de baja (es un
  correo transaccional, respuesta a una solicitud) y sin botones de
  campaña.

## Chromium en Railway

- `puppeteer-core` + `@sparticuz/chromium` (trae el binario y sus
  librerías empaquetadas — no hay que tocar la imagen de Nixpacks ni
  agregar configuración a Railway).
- En desarrollo local (Mac) se usa el Chrome instalado vía
  `PUPPETEER_EXECUTABLE_PATH`; en Railway, el binario de
  `@sparticuz/chromium`.
- Un navegador por envío, cerrado en finally. Si algún día el volumen
  lo pide, se evalúa un navegador persistente — hoy no.
- Riesgo conocido: memoria (~300–400 MB por impresión). Aceptado por
  Felipe; monitorear en Railway tras el pase.

## Lo que NO es este módulo

- No lee respuestas del buzón (eso sigue siendo humano).
- No reemplaza los correos artesanales (siguen con la skill, partiendo
  por copiar el correo del mandante desde la ficha).
- No genera un segundo diseño de PDF.
- No envía masivo: un clic, un correo, una cotización.
