-- Migration 5: multi-category variable services + per-category ordering.
-- A variable service can belong to MANY categories (no more duplicated rows),
-- and its position is ordered per category. Categories become a real entity
-- (service_categories) and gain their own ordering.
-- Run in the Supabase SQL editor. Additive + a controlled merge of existing
-- duplicates; variable_services.category (legacy text) is kept for rollback.

-- 1) Category ordering
ALTER TABLE public.service_categories
  ADD COLUMN IF NOT EXISTS sort_order integer;

-- 2) Link table: service <-> category, with per-category sort_order
CREATE TABLE IF NOT EXISTS public.variable_service_categories (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id bigint NOT NULL REFERENCES public.companies(id),
  variable_service_id bigint NOT NULL REFERENCES public.variable_services(id) ON DELETE CASCADE,
  category_id bigint NOT NULL REFERENCES public.service_categories(id) ON DELETE CASCADE,
  sort_order integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vsc_unique UNIQUE (variable_service_id, category_id)
);
CREATE INDEX IF NOT EXISTS idx_vsc_company ON public.variable_service_categories(company_id);
CREATE INDEX IF NOT EXISTS idx_vsc_category ON public.variable_service_categories(category_id);

-- 3) Ensure every used category exists as a real category row (normalized name)
INSERT INTO public.service_categories (company_id, name, is_active)
SELECT DISTINCT vs.company_id, btrim(vs.category), true
FROM public.variable_services vs
WHERE vs.category IS NOT NULL AND btrim(vs.category) <> ''
ON CONFLICT (company_id, name) DO NOTHING;

-- 3b) Initial category order (alphabetical) where missing
WITH ord AS (
  SELECT id, row_number() OVER (PARTITION BY company_id ORDER BY name) AS rn
  FROM public.service_categories
)
UPDATE public.service_categories sc
SET sort_order = ord.rn
FROM ord WHERE ord.id = sc.id AND sc.sort_order IS NULL;

-- 4) One link per current service to its (single) category
INSERT INTO public.variable_service_categories (company_id, variable_service_id, category_id, sort_order)
SELECT vs.company_id, vs.id, sc.id,
       row_number() OVER (PARTITION BY vs.company_id, sc.id ORDER BY vs.name, vs.id)
FROM public.variable_services vs
JOIN public.service_categories sc
  ON sc.company_id = vs.company_id AND sc.name = btrim(vs.category)
ON CONFLICT (variable_service_id, category_id) DO NOTHING;

-- 5) Merge mergeable duplicates: same (company_id, name) AND a single price.
--    Price-conflict duplicates are intentionally left untouched (reported separately).
CREATE TEMP TABLE _merge_map ON COMMIT DROP AS
WITH grp AS (
  SELECT company_id, name, min(id) AS survivor_id
  FROM public.variable_services
  GROUP BY company_id, name
  HAVING count(*) > 1 AND count(DISTINCT price) = 1
)
SELECT vs.id AS dup_id, g.survivor_id
FROM public.variable_services vs
JOIN grp g ON g.company_id = vs.company_id AND g.name = vs.name
WHERE vs.id <> g.survivor_id;

-- 5a) Repoint packages (service_group_items) to the surviving service
UPDATE public.service_group_items sgi
SET variable_service_id = m.survivor_id
FROM _merge_map m
WHERE sgi.variable_service_id = m.dup_id
  AND NOT EXISTS (
    SELECT 1 FROM public.service_group_items x
    WHERE x.group_id = sgi.group_id AND x.variable_service_id = m.survivor_id
  );
-- drop any now-redundant package items (survivor already present in that group)
DELETE FROM public.service_group_items sgi
USING _merge_map m
WHERE sgi.variable_service_id = m.dup_id;

-- 5b) Move category links from duplicates to the survivor (skip conflicts)
DELETE FROM public.variable_service_categories vsc
USING _merge_map m
WHERE vsc.variable_service_id = m.dup_id
  AND EXISTS (
    SELECT 1 FROM public.variable_service_categories s
    WHERE s.variable_service_id = m.survivor_id AND s.category_id = vsc.category_id
  );
UPDATE public.variable_service_categories vsc
SET variable_service_id = m.survivor_id
FROM _merge_map m
WHERE vsc.variable_service_id = m.dup_id;

-- 5c) Delete the now-merged duplicate service rows
DELETE FROM public.variable_services vs
USING _merge_map m
WHERE vs.id = m.dup_id;
