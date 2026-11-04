-- 182 · BelIA recuerda la conversación de cada persona (doc 20 §13).
--
-- Felipe, 04-11-2026: "que vaya guardando como cierto contexto cuando se
-- cierra la ventana ... por cada usuario ... cada usuario debería estar
-- como medio limitado a sus roles".
--
-- Una fila por persona y empresa, con los turnos como los muestra la
-- ventanilla (los 30 más nuevos, con sus tarjetas). La leen y la escriben
-- solo el motor y con la sesión de esa persona: nadie más ve la
-- conversación de otro. Guarda el cargo con que se conversó: si a la
-- persona le cambian el cargo, la conversación parte de cero y no arrastra
-- lo que vio con el anterior. Se borra sola a los 90 días sin uso (el
-- motor limpia las viejas de la empresa cada vez que guarda una).
--
-- Las tarjetas que vienen adentro son solo para pintarlas de nuevo: el
-- «Sí, aplicar» se revisa contra `asistente_propuestas` (migración 181),
-- nunca contra esto.

create table if not exists public.asistente_conversaciones (
  company_id bigint not null references public.companies(id) on delete cascade,
  -- El id de la SESIÓN (`user.id`, el de auth), sin llave, como en la 181.
  usuario_id uuid not null,
  -- El cargo con que se conversó: 'administrador', 'operaciones',
  -- 'vendedor' o 'recepcion'.
  cargo text not null,
  turnos jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (company_id, usuario_id)
);

-- La limpieza de las que llevan 90 días sin uso.
create index if not exists idx_asistente_conversaciones_uso
  on public.asistente_conversaciones (company_id, updated_at);

-- Igual que la 180 y la 181: cerrada a la llave pública, solo el motor.
alter table public.asistente_conversaciones enable row level security;
revoke all on public.asistente_conversaciones from anon, authenticated;
grant select, insert, update, delete on public.asistente_conversaciones
  to service_role;
