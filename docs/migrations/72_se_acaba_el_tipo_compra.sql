-- ===========================================================================
-- SE ACABA EL TIPO "COMPRA"
--
-- Decisión de Felipe el 14-08: *"las compras no tienen sentido"* como
-- categoría. Quedan DOS tipos de recurso:
--     personal
--     arriendo  → en pantalla, "Arriendos y servicios externos"
-- Ahí caben los toldos, las vans, el audiovisual, los masajes: todo lo que
-- se contrata afuera.
--
-- Los 7 que estaban como compra son EXACTAMENTE eso — Arco de flores,
-- Florería Básica, Florería graduación, Packaging Completo, Set de juegos
-- de patio, Tour Jelinek, Tour Viña Mannle. Y ninguno tiene un solo uso en
-- event_resources, así que la conversión NO toca el costo de ningún evento.
--
-- NO SE BORRA NADA: cambian de tipo y siguen activos. Si alguno no calza,
-- se apaga desde el catálogo.
--
-- ⚠ NO LA CORRE EL SISTEMA. Aplicada y verificada en el laboratorio.
-- ===========================================================================

UPDATE public.management_resources
SET type = 'arriendo'
WHERE type = 'compra';

-- Comprobación: tiene que dar 0.
--   SELECT count(*) FROM public.management_resources WHERE type = 'compra';
