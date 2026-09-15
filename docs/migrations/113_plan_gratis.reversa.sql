-- Reversa de la migración 113 — EL PLAN DE CORTESÍA (15-09-2026).
--
-- OJO: si alguna empresa quedó en `gratis`, esta reversa falla. Primero
-- hay que decidir qué pasa con ella (lo natural es dejarla en `activo`,
-- que le da los mismos derechos):
--   update public.companies set estado_plan = 'activo' where estado_plan = 'gratis';

alter table public.companies
  drop constraint if exists companies_estado_plan_check;

alter table public.companies
  add constraint companies_estado_plan_check
  check (estado_plan in ('prueba', 'activo', 'moroso', 'bloqueado'));
