-- 156 — LA LECTURA DE «SE VIENE» (decisión 62 del doc 17, 20-10-2026).
--
-- Felipe, con «Se viene» a la vista: "deberíamos filtrar con el mismo
-- semáforo, no tiene sentido analizar 400 opciones". «Se viene» anuncia lo
-- que el mismo comprador publicó en años anteriores, y esas licitaciones
-- viejas nunca pasaron por la lectura del radar: el semáforo de la bandeja
-- solo existe para lo abierto desde el 17-10. Aquí se guarda la misma
-- lectura (Haiku 5.5, las mismas instrucciones y las mismas reglas fijas)
-- de la última vez que salió cada serie, por empresa.
--
-- Aparte de `oportunidades` a propósito: lo que se guarda ahí aparece en la
-- bandeja y en su historial, y estas son licitaciones de años anteriores.

create table if not exists public.oportunidades_se_viene (
  id bigint generated always as identity primary key,
  company_id bigint not null references public.companies(id) on delete cascade,
  -- La última vez que salió la serie (código de Mercado Público).
  codigo text not null,
  semaforo text not null check (semaforo in ('verde', 'amarillo', 'rojo')),
  etiquetas text[] not null default '{}',
  se_hace_en_el_complejo text not null
    check (se_hace_en_el_complejo in ('si', 'no', 'dudoso')),
  razon text not null default '',
  -- Con qué se leyó (LECTURA_ACTUAL del motor).
  modelo text not null,
  leido_en timestamptz not null default now()
);
create unique index if not exists oportunidades_se_viene_una_vez
  on public.oportunidades_se_viene (company_id, codigo);
alter table public.oportunidades_se_viene enable row level security;
revoke all on public.oportunidades_se_viene from anon, authenticated;
grant select, insert, update, delete on public.oportunidades_se_viene
  to service_role;
grant usage, select on sequence public.oportunidades_se_viene_id_seq
  to service_role;
