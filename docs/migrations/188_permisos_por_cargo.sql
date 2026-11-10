-- ============================================================
-- 188 · PERMISOS POR CARGO (05-11-2026)
-- ============================================================
-- Doc 22. Felipe, 05-11-2026: «deberíamos transformar hoy todos los
-- permisos existentes en pestañas que se puedan deslizar como botones (lo
-- típico en estos casos) y así prendo y/o apago los permisos existentes».
-- Aprobó la maqueta («si me parece perfecto») y el catálogo («ok al
-- catalogo vamos»), con el Calendario del vendedor prendido. Número
-- reservado ese día con las otras sesiones (la 186 es de recepción y la 187
-- de facturación).
--
-- 1) `permisos_por_cargo`: por empresa, SOLO lo que se aparta de fábrica.
--    Lo de fábrica vive en el motor (`api-rest/src/auth/permisos.ts`) y es
--    lo de hoy: con la tabla vacía, nadie gana ni pierde nada. «Volver a lo
--    de fábrica» borra las filas de la empresa, y un permiso nuevo que
--    agregue el código llega a todas con su valor de fábrica.
-- 2) `permisos_por_cargo_cambios`: el registro, quién cambió qué y cuándo.
--    De ahí sale el «Último cambio» de la pantalla.
-- 3) Dos funciones que cambian y anotan en un solo paso: un cambio nunca
--    queda sin anotar, ni una anotación sin su cambio.
--
-- La clave del permiso no lleva CHECK a propósito: el catálogo crece en el
-- código (Facturación suma cuatro en el laboratorio), y el motor solo
-- acepta las que conoce.
--
-- Datos de cada empresa, con company_id: RLS sin políticas, nada para anon
-- ni authenticated; solo el motor (service_role). Sin ese GRANT la
-- pantalla queda en error 42501 (mapa 18). Idempotente; primero en el
-- laboratorio y, con el «a producción» de Felipe, en producción ANTES del
-- motor (el motor sin la tabla igual funciona: usa lo de fábrica).
-- ============================================================

create table if not exists public.permisos_por_cargo (
  company_id bigint not null references public.companies(id) on delete cascade,
  cargo text not null
    check (cargo in ('recepcion', 'vendedor', 'operaciones', 'administrador')),
  permiso text not null,
  prendido boolean not null,
  -- El id de la SESIÓN (`user.id`, el de auth), sin llave, como en la 181.
  cambiado_por uuid,
  cambiado_en timestamptz not null default now(),
  primary key (company_id, cargo, permiso)
);

create table if not exists public.permisos_por_cargo_cambios (
  id bigint generated always as identity primary key,
  company_id bigint not null references public.companies(id) on delete cascade,
  usuario_id uuid,
  -- El nombre como estaba ese día: el registro no cambia si la persona se
  -- va o se cambia el nombre.
  usuario_nombre text,
  -- 'cambio' = un interruptor; 'fabrica' = «Volver a lo de fábrica».
  accion text not null check (accion in ('cambio', 'fabrica')),
  cargo text,
  permiso text,
  prendido boolean,
  creado_en timestamptz not null default now()
);

create index if not exists idx_permisos_por_cargo_cambios_empresa
  on public.permisos_por_cargo_cambios (company_id, id desc);

-- ------------------------------------------------------------
-- Cambiar y anotar en un solo paso
-- ------------------------------------------------------------
-- Si el permiso queda como viene de fábrica, se borra la fila (la tabla
-- guarda solo lo apartado); si no, se guarda. Y siempre se anota.
create or replace function public.permisos_por_cargo_cambiar(
  p_company_id bigint,
  p_cargo text,
  p_permiso text,
  p_prendido boolean,
  p_de_fabrica boolean,
  p_usuario_id uuid,
  p_usuario_nombre text
) returns void
language plpgsql
set search_path = ''
as $$
begin
  if p_prendido = p_de_fabrica then
    delete from public.permisos_por_cargo
     where company_id = p_company_id
       and cargo = p_cargo
       and permiso = p_permiso;
  else
    insert into public.permisos_por_cargo
      (company_id, cargo, permiso, prendido, cambiado_por, cambiado_en)
    values
      (p_company_id, p_cargo, p_permiso, p_prendido, p_usuario_id, now())
    on conflict (company_id, cargo, permiso) do update
      set prendido = excluded.prendido,
          cambiado_por = excluded.cambiado_por,
          cambiado_en = excluded.cambiado_en;
  end if;
  insert into public.permisos_por_cargo_cambios
    (company_id, usuario_id, usuario_nombre, accion, cargo, permiso, prendido)
  values
    (p_company_id, p_usuario_id, p_usuario_nombre, 'cambio', p_cargo,
     p_permiso, p_prendido);
end
$$;

-- «Volver a lo de fábrica»: borra lo apartado y lo anota.
create or replace function public.permisos_por_cargo_a_fabrica(
  p_company_id bigint,
  p_usuario_id uuid,
  p_usuario_nombre text
) returns void
language plpgsql
set search_path = ''
as $$
begin
  delete from public.permisos_por_cargo where company_id = p_company_id;
  insert into public.permisos_por_cargo_cambios
    (company_id, usuario_id, usuario_nombre, accion)
  values (p_company_id, p_usuario_id, p_usuario_nombre, 'fabrica');
end
$$;

-- ------------------------------------------------------------
-- Qué es cada cosa
-- ------------------------------------------------------------
comment on table public.permisos_por_cargo is
  'Permisos por cargo (doc 22): por empresa, solo lo que se aparta de fábrica. Lo de fábrica vive en el motor (auth/permisos.ts) y es lo de hoy. La escriben las funciones permisos_por_cargo_cambiar y permisos_por_cargo_a_fabrica (migración 188).';
comment on table public.permisos_por_cargo_cambios is
  'El registro de los permisos por cargo: quién cambió qué y cuándo. accion = cambio (un interruptor) o fabrica («Volver a lo de fábrica»). De acá sale el «Último cambio» de la pantalla.';

-- ------------------------------------------------------------
-- Permisos: solo el motor
-- ------------------------------------------------------------
alter table public.permisos_por_cargo enable row level security;
alter table public.permisos_por_cargo_cambios enable row level security;
revoke all on public.permisos_por_cargo, public.permisos_por_cargo_cambios
  from anon, authenticated;
grant select, insert, update, delete on public.permisos_por_cargo
  to service_role;
grant select, insert on public.permisos_por_cargo_cambios to service_role;

revoke all on function
  public.permisos_por_cargo_cambiar(bigint, text, text, boolean, boolean, uuid, text),
  public.permisos_por_cargo_a_fabrica(bigint, uuid, text)
  from public, anon, authenticated;
grant execute on function
  public.permisos_por_cargo_cambiar(bigint, text, text, boolean, boolean, uuid, text),
  public.permisos_por_cargo_a_fabrica(bigint, uuid, text)
  to service_role;
