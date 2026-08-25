-- 91 · Modulo de Marketing, Fase 1 (25-08-2026)
-- Ver docs/arquitectura/11_MODULO_DE_MARKETING.md

CREATE TABLE IF NOT EXISTS public.marketing_contacts (
  id bigserial PRIMARY KEY,
  company_id bigint NOT NULL REFERENCES public.companies(id),
  audiencia text NOT NULL,
  email text NOT NULL,
  name text,
  empresa text,
  datos jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS marketing_contacts_unicos
  ON public.marketing_contacts (company_id, audiencia, lower(email));

CREATE TABLE IF NOT EXISTS public.marketing_suppressions (
  id bigserial PRIMARY KEY,
  company_id bigint NOT NULL REFERENCES public.companies(id),
  email text NOT NULL,
  motivo text NOT NULL CHECK (motivo IN ('baja','rebote')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS marketing_suppressions_unicas
  ON public.marketing_suppressions (company_id, lower(email));

CREATE TABLE IF NOT EXISTS public.marketing_campaigns (
  id bigserial PRIMARY KEY,
  company_id bigint NOT NULL REFERENCES public.companies(id),
  nombre text NOT NULL,
  asunto text NOT NULL,
  titulo text NOT NULL,
  cuerpo text NOT NULL,
  boton_texto text,
  boton_url text,
  audiencia_tipo text NOT NULL CHECK (audiencia_tipo IN ('clientes','importada')),
  audiencia_ref text,
  tipos_cliente text[],
  estado text NOT NULL DEFAULT 'borrador' CHECK (estado IN ('borrador','enviada')),
  prueba_enviada_at timestamptz,
  enviada_at timestamptz,
  total_destinatarios integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.marketing_sends (
  id bigserial PRIMARY KEY,
  company_id bigint NOT NULL REFERENCES public.companies(id),
  campaign_id bigint NOT NULL REFERENCES public.marketing_campaigns(id) ON DELETE CASCADE,
  email text NOT NULL,
  name text,
  estado text NOT NULL CHECK (estado IN ('enviado','fallido')),
  error text,
  resend_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS marketing_sends_una_vez
  ON public.marketing_sends (campaign_id, lower(email));

-- PERMISOS (25-08, aprendido a golpe en el laboratorio): las tablas
-- creadas por SQL directo NO heredan los grants del rol del backend
-- (service_role) y todo el modulo respondia 42501 "permission denied".
-- Estos GRANT son PARTE de la migracion.
GRANT ALL ON TABLE public.marketing_contacts, public.marketing_suppressions,
  public.marketing_campaigns, public.marketing_sends TO service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO service_role;
