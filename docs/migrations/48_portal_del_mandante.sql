-- Migración 48 — PORTAL DEL MANDANTE (30-07-2026, diseño de Felipe).
-- El portal es de la PERSONA (el contacto/mandante), no de la
-- cotización: un contacto tiene UN enlace secreto y ve TODAS sus
-- cotizaciones — y solo las suyas (distintas áreas de un mismo
-- cliente no se ven entre sí).
--
-- 1. Vínculo REAL mandante↔cotización (antes: texto libre contact_name)
-- 2. El enlace secreto vive en el contacto
-- 3. Backfills (decisión A de Felipe): mandante por calce de nombre
--    (28/28 calzaban, medido); las vigentes sin mandante cuelgan del
--    contacto PRINCIPAL del cliente.
-- Nota: quotations.portal_token (migración 47) queda sin uso; se
-- limpiará en una migración futura cuando el portal esté asentado.

ALTER TABLE public.quotations
  ADD COLUMN IF NOT EXISTS client_contact_id bigint
    REFERENCES public.client_contacts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_quotations_client_contact
  ON public.quotations(client_contact_id);

ALTER TABLE public.client_contacts
  ADD COLUMN IF NOT EXISTS portal_token text UNIQUE;

-- Backfill 1: mandante escrito que calza con un contacto del cliente.
UPDATE public.quotations q
SET client_contact_id = cc.id
FROM public.client_contacts cc
WHERE q.client_contact_id IS NULL
  AND q.contact_name IS NOT NULL
  AND trim(q.contact_name) <> ''
  AND cc.client_id = q.client_id
  AND lower(trim(cc.name)) = lower(trim(q.contact_name));

-- Backfill 2 (decisión A): vigentes sin mandante → contacto principal.
UPDATE public.quotations q
SET client_contact_id = cc.id
FROM public.client_contacts cc
WHERE q.client_contact_id IS NULL
  AND cc.client_id = q.client_id
  AND cc.is_primary = true
  AND q.quotation_status IN
    ('enviada', 'en_negociacion', 'aceptada', 'realizada');

-- Enlace secreto para todo contacto con al menos una cotización.
UPDATE public.client_contacts cc
SET portal_token = replace(
  gen_random_uuid()::text || gen_random_uuid()::text, '-', ''
)
WHERE cc.portal_token IS NULL
  AND EXISTS (
    SELECT 1 FROM public.quotations q WHERE q.client_contact_id = cc.id
  );
