-- ============================================================
-- 115 · El cambio de plan: subir con proporcional, bajar agendado
-- ============================================================
-- Escrita el 18-09-2026. Decisión de Felipe del 17-09 (mejora la
-- decisión 4 del plan de venta, PLAN_VENTA_AUTOMATICA.md §6):
--
--   SUBIR de plan rige al instante y se cobra hoy el proporcional de
--   la diferencia por los días que quedan del mes ya pagado; el
--   próximo cobro mensual sale con el precio nuevo.
--
--   BAJAR de plan rige cuando termina el mes ya pagado: el cliente
--   conserva lo que pagó y desde el siguiente cobro paga (y tiene) el
--   plan menor. Nada se borra.
--
-- Para la bajada hace falta RECORDAR el plan que viene: esta columna.
-- La subida no necesita nada nuevo — se aplica cuando llega el aviso
-- del pago del proporcional (external_reference `cambio:empresa:plan`).
--
-- Aplicada en LAB el 18-09-2026 y en PRODUCCIÓN el 18-09-2026 (antes del
-- deploy del motor de este sprint, PR #117).
-- ============================================================

alter table public.companies
  add column if not exists plan_programado text
    check (plan_programado in ('cotiza', 'gestiona', 'crece'));

comment on column public.companies.plan_programado is
  'El plan menor al que baja la empresa cuando termine su mes pagado (decisión de Felipe, 17-09-2026). NULL = no hay bajada agendada. Lo aplica el aviso del siguiente cobro o el reloj de las 11:10, y lo limpia al aplicarlo.';
