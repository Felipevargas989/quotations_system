-- 213 · LA FOTO DE LO PAGADO (doc 10 §15, 20-11-2026)
--
-- La nómina no guardaba montos: sumaba el monto de HOY de cada fila
-- sellada. Una fila ya pagada que cambiaba de monto (el 19-11, de $25.000
-- a $20.000) cambiaba lo que decía su nómina, aunque el banco ya hubiera
-- pagado. Desde aquí, al sellar una fila en una nómina se guarda lo que
-- se pagó, y la nómina muestra y suma esa foto.
--
-- Va con su relleno: 213_foto_de_lo_pagado.backfill.sql.
-- Aplicar ANTES de publicar el motor que la lee.

alter table public.event_staff
  add column if not exists monto_pagado numeric,
  add column if not exists propina_pagada numeric,
  add column if not exists foto_reconstruida boolean not null default false;

comment on column public.event_staff.monto_pagado is
  'La jornada que se pagó al sellar la fila en su nómina (payroll_id). La nómina suma esto, no amount.';
comment on column public.event_staff.propina_pagada is
  'La propina que se pagó al sellar la fila en su nómina (tip_payroll_id). La nómina suma esto, no tip_amount.';
comment on column public.event_staff.foto_reconstruida is
  'true = la foto se rellenó con el valor que tenía la fila el día de la migración 213, no se midió al pagar.';
