-- Migración 110 — ORIGEN DEL LEAD (12-09-2026).
--
-- QUÉ RESUELVE: hoy una cotización o consulta del formulario público no
-- guarda de dónde llegó la persona. El que llegó desde un anuncio pagado,
-- el que llegó desde Instagram y el que escribió la dirección a mano
-- quedan IDÉNTICOS en la ficha. Con eso es imposible responder la única
-- pregunta que importa cuando se paga publicidad: ¿qué canal trae los
-- eventos que se CIERRAN? (no los que cotizan — los que se cierran).
--
-- POR QUÉ DOS COLUMNAS Y NO UNA POR PLATAFORMA:
--   `origen`          texto corto y legible por un humano y por la
--                     pantalla: "Google Ads", "Meta", "WhatsApp",
--                     "Instagram", "Búsqueda orgánica", "Directo".
--   `origen_detalle`  campo LIBRE (jsonb) con lo que haya traído la
--                     dirección: gclid, fbclid, utm_source, utm_medium,
--                     utm_campaign, utm_term, utm_content, referrer.
--
-- Lo segundo es a propósito: si mañana aparece TikTok, Threads o lo que
-- sea, NO hace falta otra migración. Eventia se vende a terceros; una
-- columna por plataforma obligaría a tocar la base de datos cada vez que
-- el mundo publicitario invente algo. Este campo libre absorbe todo.
--
-- LAS HUELLAS (gclid de Google, fbclid de Meta) son identificadores del
-- CLIC, no de la persona: no son dato personal, pero sí conviene que la
-- política de privacidad de Eventia los mencione. Anotado como pendiente.
--
-- QUÉ NO HACE: no modifica ni una fila existente, no cambia permisos, no
-- toca RLS, no crea índices (441 cotizaciones; un índice acá sería
-- decoración). Las columnas nacen vacías y el código viejo las ignora.
--
-- DÓNDE SE USA: api-rest/src/quotations/quotations.service.ts (createPublic)
-- y api-rest/src/consultas/consultas.service.ts (registrar). El formulario
-- público termina en UNA de las dos según si el tipo de evento tiene
-- brochure configurado (el embudo del 05-09) — por eso van las dos tablas
-- o se pierde la mitad de los leads.

ALTER TABLE public.quotations
  ADD COLUMN IF NOT EXISTS origen text,
  ADD COLUMN IF NOT EXISTS origen_detalle jsonb;

ALTER TABLE public.consultas
  ADD COLUMN IF NOT EXISTS origen text,
  ADD COLUMN IF NOT EXISTS origen_detalle jsonb;

COMMENT ON COLUMN public.quotations.origen IS
  'De dónde llegó el lead, legible: Google Ads / Meta / WhatsApp / Instagram / Búsqueda orgánica / Directo. Vacío en todo lo anterior al 12-09-2026.';
COMMENT ON COLUMN public.quotations.origen_detalle IS
  'Crudo de la dirección: gclid, fbclid, utm_*, referrer. Campo libre a propósito: plataforma nueva NO necesita migración.';
COMMENT ON COLUMN public.consultas.origen IS
  'De dónde llegó el lead, legible: Google Ads / Meta / WhatsApp / Instagram / Búsqueda orgánica / Directo. Vacío en todo lo anterior al 12-09-2026.';
COMMENT ON COLUMN public.consultas.origen_detalle IS
  'Crudo de la dirección: gclid, fbclid, utm_*, referrer. Campo libre a propósito: plataforma nueva NO necesita migración.';
