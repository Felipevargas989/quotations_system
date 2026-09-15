-- Migración 113 — EL PLAN DE CORTESÍA (15-09-2026).
--
-- QUÉ RESUELVE: la migración 112 dejó cuatro estados, y todos suponen que
-- la empresa paga o va a pagar. Pero hay empresas que NUNCA van a pagar y
-- no por eso están en falta: la propia Valle del Sol, la demo que se le
-- muestra a los interesados, o un cliente al que Felipe decida regalarle
-- el sistema. Hasta ahora quedaban como "activo", mezcladas con las que sí
-- pagan, y el día que exista el cobro automático habría que acordarse a
-- mano de no ir a cobrarles.
--
-- CÓMO: un quinto estado, `gratis`. Tiene exactamente los mismos derechos
-- que `activo` —usa todo lo de su plan, sin topes de vencimiento— pero el
-- cobro automático (paso 5 del roadmap) lo salta: no le pide medio de
-- pago, no lo pasa a moroso y no lo bloquea nunca. Lo decide Felipe desde
-- la Torre de Control, y es el único que puede.
--
-- Va aparte de la 112 y no dentro de ella porque la 112 ya está aplicada
-- en el laboratorio: una migración aplicada no se reescribe.
--
-- Aplicada en LAB el 15-09-2026. En PRODUCCIÓN: pendiente, junto con la
-- 112 y ANTES del deploy del motor.

alter table public.companies
  drop constraint if exists companies_estado_plan_check;

alter table public.companies
  add constraint companies_estado_plan_check
  check (estado_plan in ('prueba', 'activo', 'moroso', 'bloqueado', 'gratis'));

comment on column public.companies.estado_plan is
  'prueba (7 dias gratis, con los derechos de crece) | activo (pagado) | gratis (cortesia: usa todo su plan y el cobro no lo persigue) | moroso (vencio, en gracia, conserva todo) | bloqueado (sin derechos: solo Configuracion y Planes).';
