-- Migración 41 (APLICADA 28-07-2026): barrida final del rol anónimo.
-- companies: su lectura pública ahora va por el backend
-- (/companies/public/:id, campos restringidos) — el directo sobra.
-- company_quotation_counters: privilegios por defecto que Supabase le
-- dio al crear la tabla (migración 38); RLS ya los bloqueaba.
-- Resultado tras 40+41: CERO privilegios y CERO políticas para
-- anon/authenticated en el esquema public. La base solo conversa con
-- el backend.

REVOKE ALL ON companies FROM anon;
REVOKE ALL ON company_quotation_counters FROM anon;

DO $$
DECLARE p RECORD;
BEGIN
  FOR p IN
    SELECT schemaname, tablename, policyname FROM pg_policies
    WHERE schemaname = 'public' AND 'anon' = ANY(string_to_array(trim(both '{}' from roles::text), ','))
  LOOP
    EXECUTE format('DROP POLICY %I ON %I.%I', p.policyname, p.schemaname, p.tablename);
  END LOOP;
END $$;
