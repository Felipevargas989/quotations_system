-- Contacto PRINCIPAL por cliente (gestión multi-contactos en el módulo
-- de clientes). Uno por cliente, garantizado por índice único parcial.
-- El campo antiguo clients.contact_person queda como espejo del nombre
-- del principal (lo sincroniza la aplicación); deja de editarse a mano.

ALTER TABLE public.client_contacts
  ADD COLUMN IF NOT EXISTS is_primary boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_primary_contact_per_client
  ON public.client_contacts(client_id)
  WHERE is_primary;

-- Principal inicial: el contacto que coincide con el contact_person del
-- cliente; si el cliente tiene un solo contacto, ese.
UPDATE public.client_contacts cc
SET is_primary = true
FROM public.clients c
WHERE cc.client_id = c.id
  AND cc.is_primary = false
  AND (
    lower(trim(coalesce(c.contact_person, ''))) = lower(cc.name)
    OR (SELECT count(*) FROM public.client_contacts x
        WHERE x.client_id = cc.client_id) = 1
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.client_contacts p
    WHERE p.client_id = cc.client_id AND p.is_primary
  );
