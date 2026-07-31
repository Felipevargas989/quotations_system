-- Migración 56 — PERSONA PRINCIPAL GARANTIZADA (31-07-2026, regla de
-- Felipe: "que haya SIEMPRE la persona principal; las personas cambian
-- de trabajo y debo poder actualizarlas — no un dato en piedra").
-- Cierra los hoyos que dejaron los caminos de creación que no
-- sembraban persona (24 espejos vacíos detectados, caso Natalia/
-- Agrupación Trisomía). Desde hoy el backend siembra la persona al
-- crear todo cliente; esta pasada repara la herencia.

-- 1. Clientes SIN ninguna persona: se crea la principal desde los
--    datos de la ficha (nombre de contacto si existe; si no, el del
--    cliente; correo/teléfono los que haya).
INSERT INTO public.client_contacts
  (company_id, client_id, name, email, phone, is_primary)
SELECT c.company_id, c.id,
  coalesce(nullif(trim(c.contact_person), ''), c.name),
  nullif(trim(c.email), ''),
  nullif(trim(c.phone), ''),
  true
FROM public.clients c
WHERE NOT EXISTS
  (SELECT 1 FROM public.client_contacts cc WHERE cc.client_id = c.id);

-- 2. Clientes con personas pero NINGUNA principal: la más antigua
--    asume (invariante: siempre exactamente una principal por cliente).
UPDATE public.client_contacts cc
SET is_primary = true
WHERE cc.id = (
  SELECT cc2.id FROM public.client_contacts cc2
  WHERE cc2.client_id = cc.client_id
  ORDER BY cc2.id LIMIT 1
)
AND NOT EXISTS (
  SELECT 1 FROM public.client_contacts cc3
  WHERE cc3.client_id = cc.client_id AND cc3.is_primary
);
