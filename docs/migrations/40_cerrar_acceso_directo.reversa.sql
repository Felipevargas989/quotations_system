-- REVERSA de la 40: reabre el acceso directo de usuarios conectados
-- (el estado que dejó la Fase 0). Solo si una pantalla no censada
-- quedara rota — restaura en un minuto.

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;

DO $$
DECLARE t RECORD;
BEGIN
  FOR t IN
    SELECT tablename FROM pg_tables WHERE schemaname = 'public'
  LOOP
    EXECUTE format(
      'CREATE POLICY app_authenticated ON public.%I FOR ALL TO authenticated USING (true) WITH CHECK (true)',
      t.tablename
    );
  END LOOP;
END $$;
