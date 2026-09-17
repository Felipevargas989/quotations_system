-- Migración 116 — DE DÓNDE LLEGÓ CADA REGISTRO (18-09-2026).
--
-- QUÉ RESUELVE: el registro por cuenta propia (paso 4 del roadmap de
-- venta) crea la empresa, pero no guarda por qué canal llegó la persona.
-- El que vino de un anuncio de Google, el que vino de Instagram y el que
-- escribió la dirección a mano quedan idénticos en la Torre de Control.
-- Cuando se pague publicidad para vender Eventia (paso 6, lanzamiento),
-- la única pregunta que importa es qué canal trae empresas que PAGAN.
--
-- MISMO MOLDE QUE LA MIGRACIÓN 110 (origen del lead en cotizaciones y
-- consultas), a propósito: dos columnas, no una por plataforma.
--   `origen`          texto corto legible: "Google Ads", "Meta",
--                     "Búsqueda orgánica", "Directo", "Referido: x.cl".
--   `origen_detalle`  campo LIBRE (jsonb) con lo que traía la dirección:
--                     gclid, fbclid, utm_*, referente. Una red nueva NO
--                     necesita otra migración.
-- La etiqueta la decide el MOTOR (quotations/origen-del-lead.ts), nunca
-- el navegador.
--
-- VA EN DOS TABLAS: `companies` (la empresa que se creó) y `leads` (los
-- interesados, que se guardan ANTES del alta y también cuando la persona
-- no termina). Así se ve el origen tanto de los que llegaron como de los
-- que se quedaron a medio camino.
--
-- NULL significa "no se sabe": las empresas anteriores a esta migración y
-- las que Felipe crea a mano desde la Torre. "Directo" es distinto: se
-- registró por cuenta propia y no traía ninguna huella.
--
-- QUÉ NO HACE: no modifica ni una fila existente, no toca permisos ni
-- RLS, no crea índices (decenas de filas). El código viejo las ignora.
--
-- Aplicada en LAB el 18-09-2026. En PRODUCCIÓN: pendiente, ANTES del
-- deploy del motor de este sprint.
-- ============================================================

alter table public.companies
  add column if not exists origen text,
  add column if not exists origen_detalle jsonb;

alter table public.leads
  add column if not exists origen text,
  add column if not exists origen_detalle jsonb;

comment on column public.companies.origen is
  'Por qué canal llegó el registro (etiqueta legible, la decide el motor). NULL = no se sabe (anterior a la 116 o creada a mano).';
comment on column public.companies.origen_detalle is
  'Huellas crudas del aterrizaje: gclid, fbclid, utm_*, referrer (migración 116).';
comment on column public.leads.origen is
  'Por qué canal llegó el interesado (misma etiqueta que companies.origen).';
comment on column public.leads.origen_detalle is
  'Huellas crudas del aterrizaje (migración 116).';

-- ============================================================
-- REVERSA (solo si de verdad se abandona la función: BORRA lo capturado,
-- que no se puede reconstruir después):
--
-- alter table public.companies drop column if exists origen, drop column if exists origen_detalle;
-- alter table public.leads     drop column if exists origen, drop column if exists origen_detalle;
