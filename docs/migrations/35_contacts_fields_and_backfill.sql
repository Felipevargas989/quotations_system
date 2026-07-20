-- Contactos por cliente, segunda pieza:
-- 1) email y teléfono OPCIONALES (solo el nombre es obligatorio: hay
--    contactos que se comunican solo por teléfono o solo por correo).
-- 2) BACKFILL: la persona de contacto que cada cliente ya tenía
--    (clients.contact_person) pasa a ser su primer contacto real.
--    La relación fina (contacto principal, roles) se discute en Etapa 4.

ALTER TABLE public.client_contacts
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS phone text;

INSERT INTO public.client_contacts (company_id, client_id, name)
SELECT c.company_id, c.id, trim(c.contact_person)
FROM public.clients c
WHERE c.contact_person IS NOT NULL
  AND trim(c.contact_person) <> ''
ON CONFLICT (client_id, name) DO NOTHING;
