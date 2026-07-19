-- Insumos: merma y formato de compra (diseño validado contra Fudo).
--
-- 1) MERMA (%): vive en el insumo, una sola vez. Las recetas se ingresan
--    en NETO (lo que llega al plato); el sistema calcula la cantidad
--    BRUTA a comprar: neta / (1 - merma). Compras, Gestión, bodega de la
--    ficha y costos usan la bruta. Costo SIEMPRE lineal.
-- 2) FORMATO DE COMPRA: cómo se compra de verdad (botella 1,5 L a
--    $2.590; caja 22 kg; caja 360 huevos). El precio unificado por
--    unidad base se calcula solo en el formulario y sigue siendo el
--    canónico (columna price). package_qty queda en UNIDAD BASE.
--    En Compras se muestra la equivalencia informativa redondeada
--    hacia arriba ("47 L → 32 × botella de 1,5 L").
--
-- Todo opcional: merma 0 y sin formato = comportamiento idéntico al actual.

ALTER TABLE public.supplies
  ADD COLUMN IF NOT EXISTS waste_pct numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS package_name text,
  ADD COLUMN IF NOT EXISTS package_qty numeric,
  ADD COLUMN IF NOT EXISTS package_price numeric;
