-- 93 · Audiencias guardadas con nombre (25-08-2026)
-- Ver docs/arquitectura/11_MODULO_DE_MARKETING.md
--
-- El modelo Mailchimp que valido Felipe: la audiencia es una PREGUNTA
-- guardada con nombre — una consulta viva que se recalcula contra la
-- base cada vez que se usa. No se guarda la lista, se guarda el filtro.
-- La campana deja de armar audiencias: ELIGE una.

CREATE TABLE IF NOT EXISTS public.marketing_audiences (
  id bigserial PRIMARY KEY,
  company_id bigint NOT NULL REFERENCES public.companies(id),
  nombre text NOT NULL,
  filtro jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS marketing_audiences_unicas
  ON public.marketing_audiences (company_id, lower(nombre));

ALTER TABLE public.marketing_campaigns
  -- La campana apunta a su audiencia guardada; si la audiencia se
  -- borra, la campana conserva su foto del filtro (columna filtro).
  ADD COLUMN IF NOT EXISTS audiencia_id bigint
    REFERENCES public.marketing_audiences(id) ON DELETE SET NULL,
  -- El "segundo asunto": la frase gris de la bandeja de entrada.
  ADD COLUMN IF NOT EXISTS preencabezado text,
  -- Con que asunto salio la segunda pasada (el reenvio exige asunto nuevo).
  ADD COLUMN IF NOT EXISTS reenviada_con_asunto text;

-- PERMISOS (leccion de la migracion 91): las tablas creadas por SQL
-- directo NO heredan los grants del rol del backend (service_role).
GRANT ALL ON TABLE public.marketing_audiences TO service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO service_role;
