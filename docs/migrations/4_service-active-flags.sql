-- Feature: activate/deactivate individual services (items) AND whole categories.
-- Deactivated items/categories are hidden from the "new quotation" form, but
-- already-created quotations keep displaying them normally (the frontend keeps
-- the full catalog and only filters the picker).
-- Run this in the Supabase SQL editor.

-- 1) Per-item activation flag on both service kinds. Default true = active,
--    so every existing row stays visible after the migration.
ALTER TABLE public.variable_services
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

ALTER TABLE public.fixed_services
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

-- 2) Category activation. Categories are free-text strings on
--    variable_services.category (there is no categories table), so activation
--    state is stored per (company_id, name). A category with NO row here is
--    considered active by default; deactivating one upserts a row.
CREATE TABLE IF NOT EXISTS public.service_categories (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id bigint NOT NULL REFERENCES public.companies(id),
  name varchar NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT service_categories_company_id_name_unique UNIQUE (company_id, name)
);

CREATE INDEX IF NOT EXISTS idx_service_categories_company_id
  ON public.service_categories(company_id);

-- 3) Backfill: seed one active row per distinct (company_id, category) that
--    already exists in variable_services. This is optional (categories with no
--    row are treated as active anyway), but it pre-populates the admin panel so
--    every existing category shows up immediately. Idempotent: re-running it
--    skips categories that are already present and never overwrites a manually
--    toggled is_active value.
INSERT INTO public.service_categories (company_id, name, is_active)
SELECT DISTINCT vs.company_id, vs.category, true
FROM public.variable_services vs
WHERE vs.category IS NOT NULL
  AND btrim(vs.category) <> ''
ON CONFLICT (company_id, name) DO NOTHING;
