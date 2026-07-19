-- Proveedores: foto en compras + reglas de uso.
--
-- 1) FOTO DE PROVEEDOR en cada provisión (id + nombre al momento de
--    comprar). Misma filosofía que los items de las cotizaciones: la
--    historia no se reescribe si después el insumo cambia de proveedor,
--    el proveedor se renombra o se elimina. Backfill con el proveedor
--    actual de cada insumo (lo mejor posible para las compras ya hechas).
-- 2) Recursos tipo PERSONA sin proveedor: esa figura es gente que se
--    contrata directo, no por agencia. Limpieza de los que lo tenían.
-- 3) Reglas de app (sin DDL): eliminar proveedor solo SIN insumos ni
--    recursos asociados; con historia, el ojo lo DA DE BAJA (deja de
--    ofrecerse en los selectores, va al final de la lista) con aviso de
--    que sus insumos siguen apuntándole.

ALTER TABLE public.event_supply_provisions
  ADD COLUMN IF NOT EXISTS supplier_id bigint
    REFERENCES public.suppliers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS supplier_name text;

UPDATE public.event_supply_provisions esp
SET supplier_id = s.supplier_id,
    supplier_name = sup.name
FROM public.supplies s
LEFT JOIN public.suppliers sup ON sup.id = s.supplier_id
WHERE esp.supply_id = s.id
  AND esp.supplier_id IS NULL
  AND esp.supplier_name IS NULL;

UPDATE public.management_resources
SET supplier_id = NULL
WHERE type = 'personal' AND supplier_id IS NOT NULL;
