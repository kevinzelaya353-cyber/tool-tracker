-- Conteo de registros por tabla (solo lectura). Ejecutar ANTES y DESPUÉS de la migración
-- 3_multi_tenant y comparar: los números deben ser idénticos (la migración no borra datos de negocio).
--   psql "$DATABASE_URL" -f prisma/ops/counts.sql
SELECT 'users' AS tabla, count(*) FROM users
UNION ALL SELECT 'locations', count(*) FROM locations
UNION ALL SELECT 'vehicles', count(*) FROM vehicles
UNION ALL SELECT 'tool_categories', count(*) FROM tool_categories
UNION ALL SELECT 'tools', count(*) FROM tools
UNION ALL SELECT 'transfers', count(*) FROM transfers
UNION ALL SELECT 'transfer_items', count(*) FROM transfer_items
UNION ALL SELECT 'lifecycle_events', count(*) FROM lifecycle_events
UNION ALL SELECT 'damage_reports', count(*) FROM damage_reports
UNION ALL SELECT 'rentals', count(*) FROM rentals
UNION ALL SELECT 'photos', count(*) FROM photos
UNION ALL SELECT 'audit_log', count(*) FROM audit_log
UNION ALL SELECT 'refresh_tokens', count(*) FROM refresh_tokens
UNION ALL SELECT 'suma_precios_compra', sum(purchase_price)::bigint FROM tools
ORDER BY 1;
