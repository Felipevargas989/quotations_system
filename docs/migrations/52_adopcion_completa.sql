-- Migración 52 — LA ADOPCIÓN COMPLETA (30-07-2026, pillada de Felipe
-- con el caso Paulina Smith / Abastible). La migración 50 adoptó datos
-- de la ficha solo para clientes SIN ninguna persona; quedaron 214
-- personas principales "solo nombre" (herencia del sistema antiguo)
-- cuyo correo/teléfono vivía suelto en la ficha del cliente.
--
-- Regla: el dato se MUDA a la persona PRINCIPAL, y solo se llenan
-- vacíos — jamás se sobreescribe algo que la persona ya tenga.
-- La ficha conserva sus campos como espejo interno (anti-duplicados);
-- la pantalla deja de mostrarlos (va en el mismo despliegue).

UPDATE public.client_contacts cc
SET email = coalesce(cc.email, nullif(trim(c.email), '')),
    phone = coalesce(cc.phone, nullif(trim(c.phone), ''))
FROM public.clients c
WHERE c.id = cc.client_id
  AND cc.is_primary
  AND (
    (cc.email IS NULL AND coalesce(trim(c.email), '') <> '')
    OR (cc.phone IS NULL AND coalesce(trim(c.phone), '') <> '')
  );
