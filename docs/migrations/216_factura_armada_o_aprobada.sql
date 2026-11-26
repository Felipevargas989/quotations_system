-- 216 · LA FACTURA ARMADA, APARTE DE LA APROBADA (doc 19 §9.60)
--
-- Felipe, 25-11-2026, con las 4 facturas de la OC 4505522493 de Transportes
-- CCU (#407) que se dejaron listas por él: *"por que dice que yo la aprobe?"*.
-- Hasta hoy la única forma de guardar una factura de «Facturar
-- seleccionados» era «Aprobar», así que quien la dejaba lista la aprobaba a
-- nombre de la sesión. Desde hoy son dos pasos: «Dejar armada» (lista para
-- revisar, en ámbar) y «Aprobar» (revisada y conforme, en verde). Solo las
-- aprobadas se facturan con «Facturar las N aprobadas».
--
-- `estado`: 'armada' o 'aprobada'. Las que hay quedan aprobadas, como eran.
-- `aprobada_por` y `aprobada_por_nombre` pasan a decir quién la guardó en su
-- estado (quién la armó, o quién la aprobó).
--
-- Se corre a mano en Supabase, en el laboratorio y en producción, ANTES de
-- que llegue el motor que la lee. Idempotente.

alter table public.facturas_aprobadas
  add column if not exists estado text not null default 'aprobada'
    check (estado in ('armada', 'aprobada'));

comment on column public.facturas_aprobadas.estado is
  'armada: lista para revisar, sin aprobar; aprobada: revisada y conforme, se factura con «Facturar las N aprobadas» (doc 19 §9.60).';
