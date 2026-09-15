-- Reversa de la migración 112 — DERECHOS POR PLAN (14-09-2026).
--
-- Devuelve companies a como estaba: sin plan, sin estado, sin prueba. El
-- candado por plan deja de existir y toda empresa vuelve a ver todo, que
-- es el comportamiento anterior al paso 3.2.
--
-- NO toca `modulos_propios` (migración 111): Personal y Marketing siguen
-- siendo solo de Valle del Sol, con su propia reversa.

alter table public.companies
  drop constraint if exists companies_plan_check,
  drop constraint if exists companies_estado_plan_check;

alter table public.companies
  drop column if exists plan,
  drop column if exists estado_plan,
  drop column if exists prueba_vence,
  drop column if exists plan_cambiado_en;
