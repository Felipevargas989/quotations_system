-- 210 · EL HISTORIAL DE TIPO DE UNA PERSONA: LA VENTANA «DESDE» (doc 10 §12)
--
-- Felipe, 17-11-2026: *"la ventana desde desarrollemos en el laboratorio"*.
-- Caso real: Sofía pasó a planta el 01-11, pero se registró después, y hasta
-- hoy el cambio de tipo regía desde el día en que se guardaba la ficha.
--
-- Cada cambio de planta a freelance (o al revés) queda como una fila:
--   - `kind`     : el tipo nuevo ('planta' o 'freelance');
--   - `anterior` : el tipo que tenía justo antes de `desde` (así se sabe qué
--                  regía antes del primer cambio sin mirar `people`);
--   - `desde`    : el día desde el que rige (puede ser pasado o futuro);
--   - quién lo registró (`registrado_por`, `registrado_por_nombre`) y
--     cuándo (`registrado_en`).
--
-- El tipo que rige un día se DERIVA de esta tabla (el último cambio con
-- `desde` <= ese día; antes del primero, su `anterior`). `people.default_kind`
-- queda como el tipo de hoy; un cambio a futuro no necesita reloj: el motor
-- lee el historial al proyectar la planta y al mostrar la ficha.
--
-- Es un registro: no se edita ni se borra (service_role solo lee e inserta),
-- igual que los movimientos de la caja (199, 207). Si se borra la persona,
-- su historial se va con ella (una persona con jornadas no se puede borrar).
--
-- RLS encendida y nada para anon/authenticated: el motor entra con
-- service_role y filtra por company_id. NUNCA «ALL TABLES IN SCHEMA».
--
-- Se corre a mano en Supabase, en el laboratorio y en producción, ANTES de
-- que llegue el motor que la escribe. Idempotente. El motor que la lee
-- aguanta que todavía no exista (lee el historial como vacío).

create table if not exists public.historial_de_tipo (
  id bigint generated always as identity primary key,
  company_id bigint not null references public.companies(id) on delete cascade,
  person_id bigint not null references public.people(id) on delete cascade,
  kind text not null check (kind in ('planta', 'freelance')),
  anterior text not null check (anterior in ('planta', 'freelance')),
  desde date not null,
  registrado_por uuid,
  registrado_por_nombre text
    check (registrado_por_nombre is null
           or char_length(registrado_por_nombre) between 1 and 120),
  registrado_en timestamptz not null default now(),
  constraint historial_de_tipo_cambia check (kind <> anterior)
);

create index if not exists historial_de_tipo_persona_idx
  on public.historial_de_tipo (company_id, person_id, desde);

comment on table public.historial_de_tipo is
  'Cada cambio de planta a freelance (o al revés) de una persona, con el día desde el que rige y quién lo registró. El tipo de un día se deriva de acá. doc 10 §12';
comment on column public.historial_de_tipo.anterior is
  'El tipo que regía justo antes de «desde». doc 10 §12';
comment on column public.historial_de_tipo.desde is
  'El día desde el que rige el tipo nuevo; puede ser pasado o futuro. doc 10 §12';

alter table public.historial_de_tipo enable row level security;
revoke all on public.historial_de_tipo from anon, authenticated;
grant select, insert on public.historial_de_tipo to service_role;
revoke update, delete, truncate on public.historial_de_tipo from service_role;
