-- Backfill de la migración 67 — jubilar a los 6 impostores
-- 13-08-2026
--
-- Traduce lo que hoy está disfrazado de menú a servicios sueltos del
-- paquete, y recién entonces borra los disfraces. Es idempotente:
-- correrlo dos veces no duplica nada (ON CONFLICT DO NOTHING).
--
-- ORDEN IMPORTANTE: primero se copian los datos, después se borra.

-- 1. El alojamiento: cada paquete se lleva su servicio con las noches
--    que traía el menú impostor.
INSERT INTO service_group_collection_services (collection_id, variable_service_id, quantity)
SELECT ci.collection_id, i.variable_service_id, i.quantity
FROM service_group_collection_items ci
JOIN service_groups g ON g.id = ci.service_group_id
JOIN service_group_items i ON i.group_id = g.id
WHERE g.name LIKE 'Sernatur Alojamiento % noches'
ON CONFLICT (collection_id, variable_service_id) DO NOTHING;

-- 2. La fiesta: el paquete la lleva suelta, y su menú "con fiesta"
--    vuelve a ser la cena normal.
INSERT INTO service_group_collection_services (collection_id, variable_service_id, quantity)
SELECT DISTINCT ci.collection_id, i.variable_service_id, 1
FROM service_group_collection_items ci
JOIN service_groups g ON g.id = ci.service_group_id
JOIN service_group_items i ON i.group_id = g.id
JOIN variable_services v ON v.id = i.variable_service_id
WHERE g.name LIKE 'Sernatur Cena Día % con fiesta'
  AND v.name = 'Fiesta despedida'
ON CONFLICT (collection_id, variable_service_id) DO NOTHING;

-- 3. Cada paquete apunta ahora a la cena LIMPIA en vez de a la copia.
UPDATE service_group_collection_items ci
SET service_group_id = limpio.id
FROM service_groups copia
JOIN service_groups limpio
  ON limpio.company_id = copia.company_id
 AND limpio.name = replace(copia.name, ' con fiesta', '')
WHERE ci.service_group_id = copia.id
  AND copia.name LIKE 'Sernatur Cena Día % con fiesta';

-- 4. Fuera los 6 impostores (sus vínculos se van en cascada).
DELETE FROM service_groups
WHERE company_id = 1
  AND (name LIKE 'Sernatur Alojamiento % noches'
    OR name LIKE 'Sernatur Cena Día % con fiesta');
