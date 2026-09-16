-- Migración 111 — MÓDULOS PROPIOS (14-09-2026).
--
-- QUÉ RESUELVE: Eventia se vende por planes, pero dos módulos no se
-- venden: PERSONAL (directorio con nombres, planificación, liquidación,
-- propina, nómina) y MARKETING (campañas de correo). Son de Valle del Sol,
-- son muy particulares, y Marketing cuesta plata por correo. Decisión de
-- Felipe, 14-09-2026: "el módulo personal, el módulo de marketing,
-- debería ser solo para Valle del Sol".
--
-- CÓMO: cada empresa guarda qué módulos propios tiene encendidos. Por
-- defecto ninguno. La empresa 1 nace con los dos, así Valle del Sol no ve
-- ni un pixel distinto. La app esconde el menú y la pantalla; el motor
-- niega las rutas (ModulosPropiosGuard) salvo las siete de Personal que
-- usan Post-Venta y el Dashboard (sillas, fichas, costo, pagado por mes).
--
-- ORDEN EN PRODUCCIÓN: esta migración va ANTES del deploy del motor. El
-- motor recuerda los perfiles una hora y, si la columna no existe, la
-- lista queda vacía y Valle del Sol se quedaría sin Personal y Marketing.
--
-- Aplicada en LAB el 14-09-2026 y en PRODUCCIÓN el 15-09-2026, antes
-- del deploy del motor (PR #112).

alter table public.companies
  add column if not exists modulos_propios text[] not null default '{}';

comment on column public.companies.modulos_propios is
  'Módulos que no se venden y que esta empresa tiene encendidos: personal, marketing. Solo Valle del Sol (14-09-2026).';

-- Valle del Sol conserva lo que ya usa.
update public.companies
   set modulos_propios = array['personal', 'marketing']
 where id = 1;
