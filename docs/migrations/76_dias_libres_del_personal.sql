-- ============================================================
-- 76 — DÍAS LIBRES DEL PERSONAL DE PLANTA (15-08)
--
-- Pedido de Felipe: "para el personal de planta faltan los días
-- libres que tienen para que se carguen solos".
--
-- La ficha de cada persona guarda qué días de la semana tiene
-- libres (0 = domingo … 6 = sábado, el orden chileno de la
-- sábana). El botón "Cargar planta" de la sábana llena el rango
-- completo con la planta activa SALTÁNDOSE estos días. En la
-- casilla de un día igual se puede poner a alguien de libre
-- (a veces se le paga aparte), pero el buscador lo avisa.
--
-- Es una columna sobre `people` (tabla ya con GRANT + RLS de la
-- migración 68), así que acá no hacen falta permisos nuevos.
--
-- Aplicada en LABORATORIO: 15-08-2026.
-- Aplicada en PRODUCCIÓN: pendiente (va en el paquete 68→76).
-- ============================================================

ALTER TABLE public.people ADD COLUMN IF NOT EXISTS days_off integer[];

COMMENT ON COLUMN public.people.days_off IS
  'Dias libres semanales (0=domingo..6=sabado). La carga automatica de planta se los salta.';
