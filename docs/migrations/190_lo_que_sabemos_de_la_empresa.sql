-- 190: LO QUE EVENTIA SABE DE TU EMPRESA (07-11-2026, decisión 119,
-- parte 3, doc 17).
--
-- Felipe: "pincho una licitación y le faltan 5 preguntas... si tengo
-- rampla, si no tengo rampla... Vuelvo a la licitación, me aparece el modal
-- de lo que me falta, yo respondo las preguntas y lo genera. Pero una vez
-- que ya lo generó, en la siguiente cotización no me vuelve a preguntar si
-- tengo ramplas, po. Lo aprende como parte del conocimiento de la empresa."
--
-- Una fila por respuesta de la empresa: la pregunta, lo que respondió
-- (lo_tengo / no_puedo), un detalle opcional y la licitación de donde
-- salió. La clave es la exigencia en minúsculas y sin tildes, igual que las
-- marcas de «Bases y criterios» (migración 152): una sola respuesta por
-- exigencia y por empresa. Se ve y se corrige en «Mi empresa».
--
-- Tabla nueva: no cambia ninguna de las que ya existen. Sin la tabla, el
-- motor arma como antes (no pregunta y no recuerda).
-- Primero en el laboratorio (Cotizador); a producción, con el OK de Felipe.

create table if not exists public.oportunidades_lo_que_sabemos (
  id bigint generated always as identity primary key,
  company_id bigint not null references public.companies(id) on delete cascade,
  clave text not null check (char_length(clave) between 1 and 400),
  pregunta text not null check (char_length(pregunta) between 1 and 400),
  exigencia text check (exigencia is null or char_length(exigencia) <= 1000),
  respuesta text not null check (respuesta in ('lo_tengo', 'no_puedo')),
  detalle text check (detalle is null or char_length(detalle) <= 500),
  oportunidad_id bigint
    references public.oportunidades(id) on delete set null,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

create unique index if not exists oportunidades_lo_que_sabemos_clave
  on public.oportunidades_lo_que_sabemos (company_id, clave);

comment on table public.oportunidades_lo_que_sabemos is
  'Lo que Eventia sabe de cada empresa para postular: lo que respondió en el modal de «Armar postulación» o marcó en «Bases y criterios» (migración 190, decisión 119).';

alter table public.oportunidades_lo_que_sabemos enable row level security;
revoke all on public.oportunidades_lo_que_sabemos from anon, authenticated;
grant select, insert, update, delete
  on public.oportunidades_lo_que_sabemos to service_role;
