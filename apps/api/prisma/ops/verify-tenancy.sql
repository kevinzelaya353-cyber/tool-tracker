-- Verificación del aislamiento multi-tenant (solo lectura). Ejecutar DESPUÉS de 3_multi_tenant
-- y cuando se quiera auditar la base. Todas las filas de "problemas" deben dar 0.
--   psql "$DATABASE_URL" -f prisma/ops/verify-tenancy.sql

-- 1. Registros por organización.
SELECT o.name AS organizacion, o.active,
       (SELECT count(*) FROM users u WHERE u.organization_id = o.id)            AS usuarios,
       (SELECT count(*) FROM locations l WHERE l.organization_id = o.id)        AS ubicaciones,
       (SELECT count(*) FROM tools t WHERE t.organization_id = o.id)            AS herramientas,
       (SELECT count(*) FROM transfers t WHERE t.organization_id = o.id)        AS traslados,
       (SELECT count(*) FROM lifecycle_events e WHERE e.organization_id = o.id) AS eventos,
       (SELECT count(*) FROM photos p WHERE p.organization_id = o.id)           AS fotos
FROM organizations o ORDER BY o.name;

-- 2. Problemas de integridad (cada fila debe ser 0).
SELECT 'usuarios sin organización (no SuperAdmin)' AS problema, count(*) FROM users WHERE organization_id IS NULL AND role::text <> 'SUPERADMIN'
UNION ALL SELECT 'SuperAdmin con organización', count(*) FROM users WHERE organization_id IS NOT NULL AND role::text = 'SUPERADMIN'
UNION ALL SELECT 'herramienta con categoría de otra organización', count(*)
  FROM tools t JOIN tool_categories c ON c.id = t.category_id WHERE c.organization_id <> t.organization_id
UNION ALL SELECT 'herramienta en ubicación de otra organización', count(*)
  FROM tools t JOIN locations l ON l.id = t.current_location_id WHERE l.organization_id <> t.organization_id
UNION ALL SELECT 'herramienta a cargo de usuario de otra organización', count(*)
  FROM tools t JOIN users u ON u.id = t.current_custodian_id WHERE u.organization_id IS DISTINCT FROM t.organization_id
UNION ALL SELECT 'traslado con ubicación de otra organización', count(*)
  FROM transfers tr JOIN locations l ON l.id IN (tr.from_location_id, tr.to_location_id) WHERE l.organization_id <> tr.organization_id
UNION ALL SELECT 'ítem de traslado con herramienta de otra organización', count(*)
  FROM transfer_items i JOIN transfers tr ON tr.id = i.transfer_id JOIN tools t ON t.id = i.tool_id WHERE t.organization_id <> tr.organization_id
UNION ALL SELECT 'evento de otra organización que su herramienta', count(*)
  FROM lifecycle_events e JOIN tools t ON t.id = e.tool_id WHERE e.organization_id <> t.organization_id
UNION ALL SELECT 'reporte de daño de otra organización que su herramienta', count(*)
  FROM damage_reports d JOIN tools t ON t.id = d.tool_id WHERE d.organization_id <> t.organization_id
UNION ALL SELECT 'alquiler de otra organización que su herramienta', count(*)
  FROM rentals r JOIN tools t ON t.id = r.tool_id WHERE r.organization_id <> t.organization_id
UNION ALL SELECT 'foto de otra organización que su herramienta', count(*)
  FROM photos p JOIN tools t ON t.id = p.tool_id WHERE p.organization_id <> t.organization_id
UNION ALL SELECT 'foto de otra organización que su traslado', count(*)
  FROM photos p JOIN transfers tr ON tr.id = p.transfer_id WHERE p.organization_id <> tr.organization_id
UNION ALL SELECT 'triggers de aislamiento ausentes (deben existir 13)', 13 - count(*)
  FROM pg_trigger WHERE tgname IN ('users_tenant', 'locations_tenant', 'vehicles_tenant', 'tool_categories_tenant', 'tools_tenant',
    'transfers_tenant', 'lifecycle_events_tenant', 'damage_reports_tenant', 'rentals_tenant', 'photos_tenant',
    'transfer_items_tenant', 'impersonation_sessions_guard', 'audit_log_immutable');

-- 3. Sesiones de soporte abiertas en este momento.
SELECT s.id, a.username AS superadmin, t.username AS como, o.name AS organizacion, s.started_at, s.expires_at
FROM impersonation_sessions s
JOIN users a ON a.id = s.actor_id JOIN users t ON t.id = s.target_user_id JOIN organizations o ON o.id = s.organization_id
WHERE s.ended_at IS NULL AND s.expires_at > now();
