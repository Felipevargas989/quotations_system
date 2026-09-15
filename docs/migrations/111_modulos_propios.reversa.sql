-- Reversa de la 111: la columna desaparece y todo el mundo vuelve a ver
-- Personal y Marketing (el guardián deja pasar cuando no hay columna...
-- NO: sin columna la lista queda vacía y se CIERRAN. Revertir la 111
-- exige revertir también el código del guardián). Solo para emergencias.
alter table public.companies drop column if exists modulos_propios;
