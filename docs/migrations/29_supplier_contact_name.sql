-- Proveedores: persona de contacto (nombre del vendedor).
-- Un solo campo de texto libre — el resto (email, RUT, dirección) se
-- descartó a propósito: demasiado para lo que se usa.

ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS contact_name text;
