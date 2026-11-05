-- 186 · Recepción cotiza a los particulares (doc 21) y BelIA corrige
-- clientes mal clasificados.
--
-- Felipe, 04-11-2026: "creo que recepción podría ver la parte de
-- cotizaciones de personas naturales... mostrar los precios... solo
-- personas naturales". Número reservado ese día con Facturación.
--
-- 1) Cada empresa marca cuál de sus tipos de cliente es «particulares»: con
--    sus cotizaciones trabaja recepción (doc 21 §3). Queda marcado el que se
--    llame «Particular…» o «Persona(s) natural(es)»; en Valle del Sol,
--    «Particulares». Sin ninguno marcado, recepción sigue con solo
--    requerimientos.
alter table public.client_types
  add column if not exists es_particular boolean not null default false;
update public.client_types
   set es_particular = true
 where es_particular = false
   and (name ilike 'particular%' or name ilike 'persona% natural%');

-- 2) El tipo de propuesta de BelIA para corregir un cliente mal
--    clasificado: su tipo o su nombre (doc 21 §6), con la tarjeta de
--    siempre.
alter table public.asistente_propuestas
  drop constraint if exists asistente_propuestas_tipo_check;
alter table public.asistente_propuestas
  add constraint asistente_propuestas_tipo_check
  check (tipo in ('servicios', 'nota', 'cotizacion_nueva', 'seguimiento',
                  'leccion', 'leccion_estado', 'cliente'));
