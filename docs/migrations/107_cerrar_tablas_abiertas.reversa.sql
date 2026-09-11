-- REVERSA de la migración 107 — devuelve las 12 tablas al estado abierto
-- que tenían antes del 11-09-2026.
--
-- OJO: esto REABRE las tablas a los roles públicos `anon` y
-- `authenticated`, es decir vuelve a dejar la lista de contactos de
-- marketing y las notas comerciales al alcance de cualquiera que saque la
-- llave publicable del bundle del frontend. Existe solo por prolijidad del
-- procedimiento (toda migración lleva su reversa) y para poder volver atrás
-- rápido si algo inesperado se rompiera.
--
-- Si hay que revertir porque algo se rompió: revertir PRIMERO, avisar, y
-- recién después investigar qué pieza dependía del acceso directo.

BEGIN;

ALTER TABLE public.portal_receipts                         DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.fixed_service_sections                  DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.quotation_followups                     DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_contacts                      DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_suppressions                  DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_campaigns                     DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_sends                         DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_audiences                     DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_group_collection_fixed_services DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.consultas                               DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.consulta_config                         DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_types                             DISABLE ROW LEVEL SECURITY;

GRANT ALL ON TABLE
  public.portal_receipts,
  public.fixed_service_sections,
  public.quotation_followups,
  public.marketing_contacts,
  public.marketing_suppressions,
  public.marketing_campaigns,
  public.marketing_sends,
  public.marketing_audiences,
  public.service_group_collection_fixed_services,
  public.consultas,
  public.consulta_config,
  public.event_types
TO anon, authenticated;

COMMIT;
