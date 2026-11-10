-- 201 · LA FACTURA DE RECEPCIÓN SIEMPRE VA COMO SOLICITUD (doc 19 §9.46)
--
-- Felipe, 10-11-2026: «no distingamos si la factura es contado o crédito…
-- hacemos 2 DTE, factura y boleta, entonces 2 procesos». La factura a
-- crédito de recepción también queda como solicitud. No trae medio de pago
-- (no entró plata a la caja), así que `medio_de_pago` deja de ser
-- obligatorio en `solicitudes_de_documento`; la boleta lo sigue exigiendo.
--
-- Se corre a mano en Supabase, en el laboratorio y en producción, ANTES de
-- que llegue el motor que guarda la solicitud a crédito. Idempotente.

alter table public.solicitudes_de_documento
  alter column medio_de_pago drop not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'solicitudes_boleta_con_medio'
  ) then
    alter table public.solicitudes_de_documento
      add constraint solicitudes_boleta_con_medio
      check (tipo = 33 or medio_de_pago is not null);
  end if;
end $$;

comment on column public.solicitudes_de_documento.medio_de_pago is
  'El medio con que se cobró. Nulo solo en la factura a crédito (§9.46): no entró plata y no cuenta en la caja.';
