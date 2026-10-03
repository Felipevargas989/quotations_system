-- Migración 117 — LOS TIPOS BASE PARA LAS EMPRESAS QUE NACIERON VACÍAS
-- (02-10-2026, Felipe: "deja para todos los nuevos clientes por defecto
-- los míos, sin perjuicio que se pueden editar ... rellena las vacías").
--
-- QUÉ RESUELVE: hasta hoy una empresa nueva nacía sin tipos de cliente
-- ni tipos de evento (el formulario público caía a una lista fija del
-- código que no se puede editar). Desde el 02-10 el motor los siembra al
-- crear la empresa (SuperAdminRepository.sembrarTiposBase). Esta
-- migración rellena, UNA vez, las empresas que ya existían vacías.
--
-- REGLAS (las mismas del motor):
--   * La plantilla es Valle del Sol (empresa 1), con su orden.
--   * Se rellena tabla por tabla y SOLO si la empresa no tiene ninguna
--     fila en esa tabla: lo que una empresa ya creó no se toca.
--   * Todos los tipos de evento entran como 'cotizacion': 'consulta'
--     manda un brochure automático y estas empresas no han subido el suyo.
--   * Valle del Sol (la plantilla) nunca se toca.
--
-- Idempotente: correrla dos veces no duplica nada.
-- Aplicada en LAB y en PRODUCCIÓN el 02-10-2026.
-- ============================================================

insert into public.client_types (company_id, name, sort_order)
select c.id, t.name, t.sort_order
from public.companies c
cross join public.client_types t
where t.company_id = 1
  and c.id <> 1
  and not exists (select 1 from public.client_types x where x.company_id = c.id);

insert into public.event_types (company_id, name, entrada, activo, sort_order)
select c.id, t.name, 'cotizacion', t.activo, t.sort_order
from public.companies c
cross join public.event_types t
where t.company_id = 1
  and c.id <> 1
  and not exists (select 1 from public.event_types x where x.company_id = c.id);

-- ============================================================
-- REVERSA: no tiene sentido general (las empresas pueden haber editado
-- sus tipos después). Si hiciera falta, se borran a mano por empresa.
