-- ===========================================================================
-- BACKFILL de 68_personas.sql — los 10 cargos que Felipe ya usa
--
-- Salieron de contar el Excel "04 Nomina de Pagos", hoja por hoja. El orden
-- es por cuánto se usan de verdad, para que los frecuentes queden arriba en
-- la lista:
--
--   Cocina     165 días · 9 personas
--   Garzón     101 días · 16 personas
--   Cajera     101 días · 1 persona   (recibe propina el 82% de los días)
--   Mucama      52 días · 7 personas
--   Recepción    5 días · 2 personas  (nunca recibió propina)
--   Patio        3 días · 2 personas  (nunca recibió propina)
--   Desconche, Nochero, Monitor, Salvavidas — aparecen en las otras hojas
--
-- Se puede correr más de una vez sin duplicar nada.
-- ===========================================================================

-- ⚠ SOLO PARA VALLE DEL SOL. El sistema tiene más empresas (MDS Hoteles,
--   Vivo Corriendo) y estos cargos son de este negocio: "Desconche" o
--   "Salvavidas" no le sirven a un hotel. Cada empresa arma su propia
--   lista desde la pantalla de cargos.
INSERT INTO public.job_roles (company_id, name, sort_order)
SELECT c.id, v.name, v.sort_order
FROM public.companies c
CROSS JOIN (VALUES
  ('Garzón',      10),
  ('Cocina',      20),
  ('Cajera',      30),
  ('Mucama',      40),
  ('Desconche',   50),
  ('Recepción',   60),
  ('Patio',       70),
  ('Nochero',     80),
  ('Monitor',     90),
  ('Salvavidas', 100)
) AS v(name, sort_order)
WHERE c.name = 'Valle del Sol Quillón'
ON CONFLICT DO NOTHING;

-- Para revisar cómo quedó:
--   SELECT company_id, name, sort_order FROM public.job_roles ORDER BY company_id, sort_order;
