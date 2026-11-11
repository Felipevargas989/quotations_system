-- 202 · LA GUÍA DE LA CASA (doc 20 §18)
--
-- Felipe, 10-11-2026: «quiero que BelIA sea un cerebro para guiar a mi
-- personal: que pase los correos tipo, mensajes automáticos, horarios,
-- valores, precios, cosas típicas que un chat ya debería saber». Y: «BelIA
-- será quien responda todo esto». La edita solo administración, en
-- Mi empresa → «Guía de la casa».
--
-- Una fila por empresa con sus temas en orden (`secciones`: una lista de
-- { titulo, texto }). La lee toda la IA de la empresa al final del cerebro
-- común (`api-rest/src/cerebro/`): BelIA en el chat y los correos de
-- seguimiento. El motor la guarda en su memoria al arrancar, cada 5
-- minutos y apenas administración la guarda.
--
-- Número reservado el 10-11-2026 con las sesiones de Facturación (la 201
-- se usó y se deshizo en el laboratorio).
create table if not exists public.guias_de_la_casa (
  company_id bigint primary key
    references public.companies(id) on delete cascade,
  secciones jsonb not null default '[]'::jsonb
    check (jsonb_typeof(secciones) = 'array'),
  -- El id de la SESIÓN de quien la guardó (`user.id`), sin llave, como en
  -- la 181 a la 185.
  actualizada_por uuid,
  actualizada_por_nombre text,
  updated_at timestamptz not null default now()
);

-- Igual que la 180 a la 185: cerrada a la llave pública, solo el motor.
alter table public.guias_de_la_casa enable row level security;
revoke all on public.guias_de_la_casa from anon, authenticated;
grant select, insert, update on public.guias_de_la_casa to service_role;
-- Nada se borra: en producción la tabla nace con todos los permisos para
-- service_role (los de siempre de Supabase), y se le quitan los de borrar.
revoke delete, truncate on public.guias_de_la_casa from service_role;
