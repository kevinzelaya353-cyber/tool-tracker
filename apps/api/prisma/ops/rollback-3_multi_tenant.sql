-- =====================================================================================
-- Reversión de 3_multi_tenant (deja la base como la espera la versión anterior de la API).
--
-- SOLO es segura mientras exista UNA organización: con dos o más, los códigos, placas y nombres
-- pueden repetirse entre empresas y la versión anterior no sabría a quién pertenece cada registro.
-- En ese caso el script se detiene: restaura el respaldo tomado antes de migrar.
--
-- Pierde: la tabla de organizaciones, las sesiones de soporte, y las columnas nuevas de auditoría
-- (actor efectivo, organización, resultado). Las cuentas SuperAdmin quedan como ADMIN INACTIVAS
-- (la versión anterior no conoce ese rol). El valor 'SUPERADMIN' del enum se conserva (sin uso).
--
--   1. Detén la API nueva.   2. psql "$DATABASE_URL" -1 -f prisma/ops/rollback-3_multi_tenant.sql
--   3. Despliega la versión anterior de la API y de la app.
-- =====================================================================================

DO $$
BEGIN
  IF (SELECT count(*) FROM organizations) > 1 THEN
    RAISE EXCEPTION 'Hay más de una organización: restaura el respaldo previo a la migración en lugar de revertir';
  END IF;
END $$;

-- Protecciones nuevas
DROP TRIGGER IF EXISTS users_tenant ON users;
DROP TRIGGER IF EXISTS locations_tenant ON locations;
DROP TRIGGER IF EXISTS vehicles_tenant ON vehicles;
DROP TRIGGER IF EXISTS tool_categories_tenant ON tool_categories;
DROP TRIGGER IF EXISTS tools_tenant ON tools;
DROP TRIGGER IF EXISTS transfers_tenant ON transfers;
DROP TRIGGER IF EXISTS lifecycle_events_tenant ON lifecycle_events;
DROP TRIGGER IF EXISTS damage_reports_tenant ON damage_reports;
DROP TRIGGER IF EXISTS rentals_tenant ON rentals;
DROP TRIGGER IF EXISTS photos_tenant ON photos;
DROP TRIGGER IF EXISTS transfer_items_tenant ON transfer_items;
DROP TRIGGER IF EXISTS impersonation_sessions_guard ON impersonation_sessions;
DROP TRIGGER IF EXISTS audit_log_immutable ON audit_log;
DROP FUNCTION IF EXISTS tenant_guard();
DROP FUNCTION IF EXISTS transfer_item_tenant_guard();
DROP FUNCTION IF EXISTS impersonation_guard();

-- Auditoría y sesiones de soporte
ALTER TABLE audit_log DROP CONSTRAINT IF EXISTS audit_log_result_values;
DROP INDEX IF EXISTS audit_log_actor_id_at_idx; -- sobre columnas que se conservan: no cae sola
ALTER TABLE audit_log
  DROP COLUMN IF EXISTS impersonation_id,
  DROP COLUMN IF EXISTS effective_user_id,
  DROP COLUMN IF EXISTS organization_id,
  DROP COLUMN IF EXISTS result,
  DROP COLUMN IF EXISTS user_agent;
DROP TABLE IF EXISTS impersonation_sessions;

-- Usuarios
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_superadmin_without_org;
UPDATE users SET role = 'ADMIN', active = false WHERE role::text = 'SUPERADMIN';
UPDATE refresh_tokens SET revoked_at = now() WHERE revoked_at IS NULL AND user_id IN (SELECT id FROM users WHERE organization_id IS NULL);
ALTER TABLE users
  DROP COLUMN IF EXISTS organization_id,
  DROP COLUMN IF EXISTS must_change_password,
  DROP COLUMN IF EXISTS password_changed_at;

-- Únicos globales de antes
DROP INDEX IF EXISTS locations_organization_id_name_type_key;
DROP INDEX IF EXISTS vehicles_organization_id_plate_key;
DROP INDEX IF EXISTS tool_categories_organization_id_name_key;
DROP INDEX IF EXISTS tools_organization_id_code_key;
CREATE UNIQUE INDEX locations_name_type_key ON locations(name, type);
CREATE UNIQUE INDEX vehicles_plate_key ON vehicles(plate);
CREATE UNIQUE INDEX tool_categories_name_key ON tool_categories(name);
CREATE UNIQUE INDEX tools_code_key ON tools(code);

-- Columnas de organización (los índices y claves foráneas caen con ellas)
ALTER TABLE locations        DROP COLUMN organization_id;
ALTER TABLE vehicles         DROP COLUMN organization_id;
ALTER TABLE tool_categories  DROP COLUMN organization_id;
ALTER TABLE tools            DROP COLUMN organization_id;
ALTER TABLE transfers        DROP COLUMN organization_id;
ALTER TABLE lifecycle_events DROP COLUMN organization_id;
ALTER TABLE damage_reports   DROP COLUMN organization_id;
ALTER TABLE rentals          DROP COLUMN organization_id;
ALTER TABLE photos           DROP COLUMN organization_id;
DROP TABLE organizations;

-- Para que `prisma migrate deploy` la vuelva a aplicar si se reintenta más adelante.
DELETE FROM _prisma_migrations WHERE migration_name = '3_multi_tenant';
