-- 94 · Los candados de no-duplicar calzan con el upsert (25-08-2026)
--
-- El 42P10 del laboratorio: los indices unicos de contactos y bajas
-- usaban lower(email) (indice por FORMULA), pero los upsert declaran
-- el conflicto por COLUMNAS (company_id,audiencia,email) — y Postgres
-- no los reconoce como el mismo candado. Como el backend SIEMPRE
-- guarda el correo en minusculas antes de insertar (importarContactos
-- y suprimir lo normalizan), la formula sobra: candado por columnas.

DROP INDEX IF EXISTS public.marketing_contacts_unicos;
CREATE UNIQUE INDEX IF NOT EXISTS marketing_contacts_unicos
  ON public.marketing_contacts (company_id, audiencia, email);

DROP INDEX IF EXISTS public.marketing_suppressions_unicas;
CREATE UNIQUE INDEX IF NOT EXISTS marketing_suppressions_unicas
  ON public.marketing_suppressions (company_id, email);
