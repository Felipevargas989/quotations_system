-- Migración 112 — DERECHOS POR PLAN (14-09-2026, paso 3.2 del roadmap).
--
-- QUÉ RESUELVE: hasta hoy toda empresa ve todo Eventia. Los tres planes
-- (Cotiza $19.900, Gestiona y Cobra $49.900, Opera y Crece $119.900) están
-- definidos y publicados, pero nada los hace cumplir. Esta migración le
-- enseña a la base qué plan tiene cada empresa y en qué estado está.
--
-- CÓMO (patrón de la industria, "entitlements"): la empresa NO se pregunta
-- por su plan en el código. El plan rellena una LISTA DE DERECHOS
-- (calendario, post_venta, varios_dias...) que el motor calcula en
-- auth/derechos.ts, y el código pregunta siempre por el derecho. Así Felipe
-- puede cambiar precios, nombres o armado de paquetes sin tocar una línea.
-- `modulos_propios` (migración 111) se suma a esa lista: Personal y
-- Marketing son dos derechos más, y siguen siendo solo de Valle del Sol.
--
-- LAS TRES EMPRESAS VIVAS QUEDAN EN CRECE ACTIVO, en esta misma migración,
-- ANTES de que exista ningún candado. Regla de Felipe, textual: "no quiero
-- tocar nada en la empresa Valle del Sol". La empresa 1 conserva además sus
-- módulos propios, así que su menú, sus flujos y sus correos no cambian.
--
-- ORDEN EN PRODUCCIÓN: esta migración va ANTES del deploy del motor, igual
-- que la 111. El motor recuerda los perfiles una hora; sin estas columnas
-- no sabría el plan y trataría a todos como recién llegados.
--
-- Aplicada en LAB el 14-09-2026. En PRODUCCIÓN: pendiente.

alter table public.companies
  add column if not exists plan text not null default 'cotiza',
  add column if not exists estado_plan text not null default 'prueba',
  add column if not exists prueba_vence timestamptz,
  add column if not exists plan_cambiado_en timestamptz not null default now();

-- Los valores posibles, con nombre de negocio. Se agregan aparte y con
-- `not valid` + `validate` para que la tabla no se bloquee si algún día
-- tiene muchas filas.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'companies_plan_check') then
    alter table public.companies
      add constraint companies_plan_check
      check (plan in ('cotiza', 'gestiona', 'crece')) not valid;
    alter table public.companies validate constraint companies_plan_check;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'companies_estado_plan_check') then
    alter table public.companies
      add constraint companies_estado_plan_check
      check (estado_plan in ('prueba', 'activo', 'moroso', 'bloqueado')) not valid;
    alter table public.companies validate constraint companies_estado_plan_check;
  end if;
end $$;

comment on column public.companies.plan is
  'Plan contratado: cotiza, gestiona o crece. El plan NO se consulta en el código: rellena la lista de derechos de auth/derechos.ts (14-09-2026).';
comment on column public.companies.estado_plan is
  'prueba (7 dias gratis, con los derechos de crece) | activo (pagado) | moroso (venció, en gracia, conserva todo) | bloqueado (sin derechos: solo Configuración y Planes).';
comment on column public.companies.prueba_vence is
  'Cuándo termina la prueba gratis. Null si no está en prueba. El reloj de las 11:00 pasa a bloqueado las vencidas.';
comment on column public.companies.plan_cambiado_en is
  'Última vez que cambió el plan o el estado, para la Torre de Control.';

-- Las tres empresas que existen hoy: Valle del Sol (1), MDS Hoteles (51) y
-- la demo Vivo Corriendo (52). Crece activo y sin vencimiento: nada les
-- cambia el día que se encienda el candado.
update public.companies
   set plan = 'crece',
       estado_plan = 'activo',
       prueba_vence = null
 where id in (1, 51, 52);
