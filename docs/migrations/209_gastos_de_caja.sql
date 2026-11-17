-- 209 · LOS GASTOS DE LA CAJA DE RECEPCIÓN (doc 19 §9.56)
--
-- Felipe, 17-11-2026: *"en movimientos de turno, anotar movimiento debería
-- poder ingresarse algún gasto (podría ser una lista desplegable de tipo de
-- movimiento: ingreso, retiro, gasto) que incluya a la recepción con la
-- caja... ejemplo pago taxi"*.
--
-- - `retiros_de_caja.tipo` admite también 'gasto': plata que sale de la
--   caja para pagar algo (un taxi). Resta del efectivo esperado igual que un
--   retiro, pero se guarda y se muestra aparte. El motivo («en qué se
--   gastó») ya es obligatorio (1 a 120 caracteres desde la 199).
--
-- El motor de antes sigue andando: lee como retiro todo lo que no es
-- ingreso, así que un gasto le resta igual del efectivo esperado.
--
-- RLS y permisos sin cambios (service_role solo lee e inserta). Se corre a
-- mano en Supabase, en el laboratorio y en producción, ANTES de que llegue
-- el motor que anota gastos. Idempotente.

alter table public.retiros_de_caja
  drop constraint if exists retiros_de_caja_tipo_check;

alter table public.retiros_de_caja
  add constraint retiros_de_caja_tipo_check
  check (tipo in ('retiro', 'ingreso', 'gasto'));

comment on column public.retiros_de_caja.tipo is
  'retiro (sale plata), ingreso (la manda el dueño o la administradora; no es venta) o gasto (sale plata para pagar algo, con su motivo). doc 19 §9.51 y §9.56';
