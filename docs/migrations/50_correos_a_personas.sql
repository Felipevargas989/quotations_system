-- Migración 50 — CORREOS A PERSONAS Y PUNTO (30-07-2026, regla de
-- Felipe). El correo general de la ficha deja de ser destinatario:
-- toda cotización debe tener su mandante (persona). Este catastro
-- cierra el hoyo que la 48 dejó a propósito (solo vinculó vigentes):
-- en producción había 160 cotizaciones sin mandante — 86% rechazadas —
-- y 22 clientes sin ninguna persona (21 con datos en la ficha para
-- crearla: el "caso Brayan", herencia de la migración del sistema
-- antiguo, que guardaba el correo en el cliente).

-- Parte 1: crear la persona principal para clientes sin ninguna
-- persona que tengan cotizaciones sin mandante, ADOPTANDO los datos
-- de la ficha (nombre de contacto si existe; si no, el del cliente).
INSERT INTO public.client_contacts
  (company_id, client_id, name, email, phone, is_primary)
SELECT c.company_id, c.id,
  coalesce(nullif(trim(c.contact_person), ''), c.name),
  nullif(trim(c.email), ''),
  nullif(trim(c.phone), ''),
  true
FROM public.clients c
WHERE NOT EXISTS
    (SELECT 1 FROM public.client_contacts cc WHERE cc.client_id = c.id)
  AND EXISTS
    (SELECT 1 FROM public.quotations q
      WHERE q.client_id = c.id AND q.client_contact_id IS NULL);

-- Parte 2a: vincular por calce de nombre del mandante escrito
-- (mismo criterio de la 48, ahora para TODOS los estados).
UPDATE public.quotations q
SET client_contact_id = cc.id
FROM public.client_contacts cc
WHERE q.client_contact_id IS NULL
  AND q.contact_name IS NOT NULL
  AND trim(q.contact_name) <> ''
  AND cc.client_id = q.client_id
  AND lower(trim(cc.name)) = lower(trim(q.contact_name));

-- Parte 2b: el resto, a la persona principal del cliente (o a la más
-- antigua si ninguna está marcada como principal).
UPDATE public.quotations q
SET client_contact_id = sub.id
FROM (
  SELECT DISTINCT ON (client_id) client_id, id
  FROM public.client_contacts
  ORDER BY client_id, is_primary DESC, id
) sub
WHERE q.client_contact_id IS NULL
  AND sub.client_id = q.client_id;

-- Parte 3: enlace secreto de portal para toda persona con cotización.
UPDATE public.client_contacts cc
SET portal_token = replace(
  gen_random_uuid()::text || gen_random_uuid()::text, '-', ''
)
WHERE cc.portal_token IS NULL
  AND EXISTS
    (SELECT 1 FROM public.quotations q WHERE q.client_contact_id = cc.id);
