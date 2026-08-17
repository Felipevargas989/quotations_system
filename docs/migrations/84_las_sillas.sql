-- ============================================================
-- 84 — LAS SILLAS: el personal de un evento vive en UNA tabla (17-08)
--
-- Diseño de Felipe, con sus palabras: la venta pone las sillas ("voy a
-- necesitar tres garzones el 23, a $27.000"), y Planificación les pone
-- nombre. "Así la tabla siempre se mantiene actualizada, siempre leen
-- el mismo repositorio de datos."
--
-- Hasta hoy eran dos tablas sin cable de vuelta: el plan en
-- event_resources (cargo, día, cantidad, valor) y la realidad en
-- event_staff (persona, día, monto). Poner un cuarto garzón o acordar
-- $32.000 con alguien no movía a Gestión, que seguía mostrando el plan
-- viejo — el QA del 17-08 lo pilló en la cot 415: "3 × $27.000 =
-- $81.000" habiendo 4 personas y dos tarifas.
--
-- Ahora una fila de event_staff puede ser una SILLA VACÍA: cargo, día y
-- valor, sin nombre todavía. Gestión cuenta sillas por cargo;
-- Planificación las va sentando. Un solo costo, por construcción:
-- sillas con nombre al monto acordado, vacías al estimado.
--
-- Tres reglas que el código acompaña:
--  · una silla sin nombre JAMÁS llega a liquidación ni a nómina;
--  · al cerrar la ficha, las sillas que quedaron vacías se van (no se
--    contrató a nadie: el costo converge a lo real);
--  · el personal deja event_resources, que queda solo con arriendos.
--
-- La conversión respeta la historia: en los eventos con ficha CERRADA
-- no se crean sillas vacías — su costo ya es la realidad con nombres, y
-- inventarles cupos pendientes inflaría números históricos del
-- Dashboard. Medido en laboratorio antes de escribir esto: 27 líneas
-- (29 cupos) de fichas abiertas se convierten; 9 líneas (11 cupos) de
-- fichas cerradas solo se retiran.
--
-- Aplicada en LABORATORIO: 17-08-2026.
-- Aplicada en PRODUCCIÓN: pendiente (paquete 68→84).
-- ============================================================

-- 1) Las amarras: una silla puede no tener nombre, y (solo en eventos)
--    puede no tener día todavía — es el "por ubicar" del plan.
ALTER TABLE public.event_staff ALTER COLUMN person_id DROP NOT NULL;
ALTER TABLE public.event_staff ALTER COLUMN day DROP NOT NULL;
ALTER TABLE public.event_staff
  ADD CONSTRAINT event_staff_dia_o_evento
  CHECK (quotation_id IS NOT NULL OR day IS NOT NULL);
ALTER TABLE public.event_staff
  ADD CONSTRAINT event_staff_silla_con_cargo
  CHECK (person_id IS NOT NULL OR role_id IS NOT NULL);

COMMENT ON COLUMN public.event_staff.person_id IS
  'NULL = silla vacia: cupo planificado sin nombre. Cuenta para el costo, jamas para la nomina.';

-- 2) La conversión: cada cupo del plan que la realidad no cubrió se
--    vuelve una silla vacía, con el valor de su línea. Los cupos ya
--    cubiertos por gente con nombre no se duplican.
WITH cupos AS (
  SELECT er.company_id, er.quotation_id, er.resource_id AS role_id,
         er.day, er.price_fixed,
         row_number() OVER (
           PARTITION BY er.quotation_id, er.resource_id, er.day
           ORDER BY er.id, gs
         ) AS n
  FROM public.event_resources er
  JOIN public.management_resources mr
    ON mr.id = er.resource_id AND mr.type = 'personal'
  LEFT JOIN public.staff_sheets ss ON ss.quotation_id = er.quotation_id
  CROSS JOIN LATERAL generate_series(1, GREATEST(er.quantity, 0)::int) gs
  WHERE er.quotation_id IS NOT NULL
    AND ss.closed_at IS NULL
),
ocupadas AS (
  SELECT quotation_id, role_id, day, count(*) AS gente
  FROM public.event_staff
  GROUP BY 1, 2, 3
)
INSERT INTO public.event_staff
  (company_id, quotation_id, person_id, day, role_id, kind, status, amount)
SELECT c.company_id, c.quotation_id, NULL, c.day, c.role_id,
       'freelance', 'por_confirmar', c.price_fixed
FROM cupos c
LEFT JOIN ocupadas o
  ON o.quotation_id = c.quotation_id
 AND o.role_id IS NOT DISTINCT FROM c.role_id
 AND o.day IS NOT DISTINCT FROM c.day
WHERE c.n > COALESCE(o.gente, 0);

-- 3) El personal se retira de event_resources: esa tabla queda con los
--    arriendos y servicios externos, que sí son suyos.
DELETE FROM public.event_resources er
USING public.management_resources mr
WHERE mr.id = er.resource_id AND mr.type = 'personal';
