-- 212 · LA DECLARACIÓN DE REPRESENTACIÓN AL FIRMAR EL CONVENIO (doc 24 §8)
--
-- Felipe, 19-11-2026: *"Igual lo tiene que firmar alguien que tenga al menos
-- la capacidad de representación de la empresa"* y *"la persona que firme
-- debe ser como algo que diga, acepto [en] nombre de la empresa y tengo la
-- capacidad de representación"*.
--
-- Una columna en `convenios`: la persona que acepta en línea marca
-- «Declaro que tengo facultades para representar a la empresa y acepto el
-- convenio en su nombre». El motor no acepta sin ella y la guarda junto a la
-- constancia (dato, no solo texto en el PDF).
--   - true  = aceptado en línea con la declaración (desde esta migración).
--   - null  = los ya firmados antes (no cambian) y los firmados en papel.
-- Idempotente. Sin backfill: lo ya firmado queda como está.

alter table public.convenios
  add column if not exists declara_representacion boolean;

comment on column public.convenios.declara_representacion is
  'true: quien aceptó en línea declaró tener facultades para representar a la empresa (doc 24 §8). null: firmado antes de la 212 o en papel.';
