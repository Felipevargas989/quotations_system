-- Persona de contacto de la cotización (texto libre).
-- Puente hacia la Etapa 4 (empresas con múltiples contactos): cuando
-- exista el modelo empresa ↔ contactos 1:N, este campo pasa a llenarse
-- desde un selector; el texto guardado queda como foto histórica.

ALTER TABLE public.quotations
  ADD COLUMN IF NOT EXISTS contact_name text;
