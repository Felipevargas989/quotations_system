-- 208 · LOS INGRESOS DE LA CAJA DE RECEPCIÓN (doc 19 §9.51)
--
-- Felipe, 16-11-2026, mirando «Retiros del turno»: *"esto debería ser
-- retiros y abonos, en caso que mande dinero, o sencillo"*; los ingresos son
-- *"solo lo que yo o camila mandamos"* (no abonos de clientes).
--
-- - `retiros_de_caja.tipo`: 'retiro' (sale plata) o 'ingreso' (entra plata
--   que mandan el dueño o la administradora). Lo ya anotado queda como
--   retiro (el default). La tabla no se renombra: guarda los dos tipos.
--   Un ingreso no es venta: solo suma al efectivo esperado del cierre.
-- - `retiros_de_caja.creado_por_nombre`: el nombre del perfil de quien lo
--   anotó, desde ahora y para los dos tipos (nulo en las filas de antes).
--
-- El motor de antes sigue andando con las columnas nuevas (no las lee y el
-- default llena el tipo). OJO: el motor de antes lee todas las filas como
-- retiros; si se vuelve a él después de anotar un ingreso, ese ingreso se
-- restaría. Solo el motor nuevo crea ingresos.
--
-- RLS y permisos sin cambios (service_role solo lee e inserta). Se corre a
-- mano en Supabase, en el laboratorio y en producción, ANTES de que llegue
-- el motor que la lee. Idempotente.

alter table public.retiros_de_caja
  add column if not exists tipo text not null default 'retiro';

alter table public.retiros_de_caja
  add column if not exists creado_por_nombre text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'retiros_de_caja_tipo_check'
       and conrelid = 'public.retiros_de_caja'::regclass
  ) then
    alter table public.retiros_de_caja
      add constraint retiros_de_caja_tipo_check
      check (tipo in ('retiro', 'ingreso'));
  end if;
  if not exists (
    select 1 from pg_constraint
     where conname = 'retiros_de_caja_creado_por_nombre_check'
       and conrelid = 'public.retiros_de_caja'::regclass
  ) then
    alter table public.retiros_de_caja
      add constraint retiros_de_caja_creado_por_nombre_check
      check (creado_por_nombre is null
             or char_length(creado_por_nombre) between 1 and 60);
  end if;
end $$;

comment on column public.retiros_de_caja.tipo is
  'retiro (sale plata) o ingreso (la manda el dueño o la administradora; no es venta). doc 19 §9.51';
comment on column public.retiros_de_caja.creado_por_nombre is
  'El nombre del perfil de quien lo anotó (desde la 208). doc 19 §9.51';
