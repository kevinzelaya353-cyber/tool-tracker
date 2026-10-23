-- =====================================================================================
-- Multi-tenant: organizaciones, SuperAdmin, sesiones de soporte y auditoría ampliada.
--
-- NO destructiva: no borra ni modifica datos de negocio. Los registros existentes (de la época
-- de una sola empresa) se asignan a UNA organización, "Ingenieria H" (confirmado por el dueño
-- del sistema). En una base nueva (sin usuarios ni datos) no se crea ninguna organización.
--
-- Prisma aplica el archivo completo en una sola transacción: si algo falla, no queda nada a medias.
-- Antes de aplicarla en un servidor: respaldo (deploy/servidor hace pg_dump) y
-- prisma/verify-tenancy.sql para comparar conteos antes y después. Reversión: docs/MULTI_TENANT.md.
-- =====================================================================================

-- El valor nuevo no se puede usar en esta misma transacción: los CHECK comparan role::text.
-- IF NOT EXISTS: la reversión (prisma/ops) conserva el valor, así la migración se puede volver a aplicar.
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'SUPERADMIN' BEFORE 'ADMIN';

-- ---------- Tablas nuevas ----------

CREATE TABLE "organizations" (
    "id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "slug" VARCHAR(60) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "legal_name" VARCHAR(160),
    "tax_id" VARCHAR(40),
    "contact_email" VARCHAR(254),
    "contact_phone" VARCHAR(40),
    "address" VARCHAR(250),
    "currency" CHAR(3) NOT NULL DEFAULT 'HNL',
    "brand_color" VARCHAR(7),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "organizations_slug_key" ON "organizations"("slug");

CREATE TABLE "impersonation_sessions" (
    "id" UUID NOT NULL,
    "actor_id" UUID NOT NULL,
    "target_user_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "reason" VARCHAR(300) NOT NULL,
    "started_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "ended_at" TIMESTAMPTZ(3),
    "end_reason" VARCHAR(10),
    "ended_by" UUID,
    "ip" VARCHAR(45),

    CONSTRAINT "impersonation_sessions_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "impersonation_sessions_actor_id_started_at_idx" ON "impersonation_sessions"("actor_id", "started_at");
CREATE INDEX "impersonation_sessions_target_user_id_idx" ON "impersonation_sessions"("target_user_id");

-- ---------- Columnas nuevas (primero admiten NULL para poder asignarlas) ----------

ALTER TABLE "users"
  ADD COLUMN "organization_id" UUID,
  ADD COLUMN "must_change_password" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "password_changed_at" TIMESTAMPTZ(3);
ALTER TABLE "locations"        ADD COLUMN "organization_id" UUID;
ALTER TABLE "vehicles"         ADD COLUMN "organization_id" UUID;
ALTER TABLE "tool_categories"  ADD COLUMN "organization_id" UUID;
ALTER TABLE "tools"            ADD COLUMN "organization_id" UUID;
ALTER TABLE "transfers"        ADD COLUMN "organization_id" UUID;
ALTER TABLE "lifecycle_events" ADD COLUMN "organization_id" UUID;
ALTER TABLE "damage_reports"   ADD COLUMN "organization_id" UUID;
ALTER TABLE "rentals"          ADD COLUMN "organization_id" UUID;
ALTER TABLE "photos"           ADD COLUMN "organization_id" UUID;
ALTER TABLE "audit_log"
  ADD COLUMN "organization_id" UUID,
  ADD COLUMN "effective_user_id" UUID,
  ADD COLUMN "impersonation_id" UUID,
  ADD COLUMN "result" VARCHAR(10) NOT NULL DEFAULT 'SUCCESS',
  ADD COLUMN "user_agent" VARCHAR(200);

-- ---------- Asignación de los datos existentes ----------

DO $$
DECLARE
  org UUID;
BEGIN
  IF EXISTS (SELECT 1 FROM users) OR EXISTS (SELECT 1 FROM locations) OR EXISTS (SELECT 1 FROM vehicles)
     OR EXISTS (SELECT 1 FROM tools) OR EXISTS (SELECT 1 FROM photos) THEN
    org := gen_random_uuid();
    INSERT INTO organizations (id, name, slug, updated_at) VALUES (org, 'Ingenieria H', 'ingenieria-h', CURRENT_TIMESTAMP);

    UPDATE users            SET organization_id = org;
    UPDATE locations        SET organization_id = org;
    UPDATE vehicles         SET organization_id = org;
    UPDATE tool_categories  SET organization_id = org;
    UPDATE tools            SET organization_id = org;
    UPDATE transfers        SET organization_id = org;
    UPDATE photos           SET organization_id = org;
    -- Todo lo auditado hasta hoy ocurrió en la única empresa que existía.
    UPDATE audit_log        SET organization_id = org;

    -- Tablas de solo inserción: se suspende su protección SOLO para esta asignación (misma
    -- transacción, nada más las modifica) y se reactiva de inmediato.
    ALTER TABLE lifecycle_events DISABLE TRIGGER lifecycle_events_immutable;
    UPDATE lifecycle_events SET organization_id = org;
    ALTER TABLE lifecycle_events ENABLE TRIGGER lifecycle_events_immutable;

    ALTER TABLE damage_reports DISABLE TRIGGER damage_reports_immutable;
    UPDATE damage_reports SET organization_id = org;
    ALTER TABLE damage_reports ENABLE TRIGGER damage_reports_immutable;

    ALTER TABLE rentals DISABLE TRIGGER rentals_guard;
    UPDATE rentals SET organization_id = org;
    ALTER TABLE rentals ENABLE TRIGGER rentals_guard;
  ELSE
    -- Base nueva: las categorías que sembró 1_categorias_comunes no tienen dueño. Cada
    -- organización recibe las suyas al crearse. Solo se quitan las que ninguna herramienta usa.
    DELETE FROM tool_categories c WHERE NOT EXISTS (SELECT 1 FROM tools t WHERE t.category_id = c.id);
  END IF;
END $$;

-- ---------- Obligatoria desde ahora ----------

ALTER TABLE "locations"        ALTER COLUMN "organization_id" SET NOT NULL;
ALTER TABLE "vehicles"         ALTER COLUMN "organization_id" SET NOT NULL;
ALTER TABLE "tool_categories"  ALTER COLUMN "organization_id" SET NOT NULL;
ALTER TABLE "tools"            ALTER COLUMN "organization_id" SET NOT NULL;
ALTER TABLE "transfers"        ALTER COLUMN "organization_id" SET NOT NULL;
ALTER TABLE "lifecycle_events" ALTER COLUMN "organization_id" SET NOT NULL;
ALTER TABLE "damage_reports"   ALTER COLUMN "organization_id" SET NOT NULL;
ALTER TABLE "rentals"          ALTER COLUMN "organization_id" SET NOT NULL;
ALTER TABLE "photos"           ALTER COLUMN "organization_id" SET NOT NULL;

-- Solo el SuperAdmin existe fuera de una organización.
ALTER TABLE "users"
  ADD CONSTRAINT users_superadmin_without_org CHECK ((role::text = 'SUPERADMIN') = (organization_id IS NULL));

ALTER TABLE "organizations"
  ADD CONSTRAINT organizations_currency_iso CHECK (currency ~ '^[A-Z]{3}$'),
  ADD CONSTRAINT organizations_brand_color_hex CHECK (brand_color IS NULL OR brand_color ~ '^#[0-9A-Fa-f]{6}$');

ALTER TABLE "audit_log"
  ADD CONSTRAINT audit_log_result_values CHECK (result IN ('SUCCESS', 'FAILURE', 'DENIED'));

ALTER TABLE "impersonation_sessions"
  ADD CONSTRAINT impersonation_end_consistent CHECK ((ended_at IS NULL) = (end_reason IS NULL)),
  ADD CONSTRAINT impersonation_end_reason_values CHECK (end_reason IS NULL OR end_reason IN ('ENDED', 'REVOKED')),
  ADD CONSTRAINT impersonation_expires_after_start CHECK (expires_at > started_at);

-- ---------- Únicos: ahora dentro de cada organización ----------
-- (dos empresas pueden tener la herramienta TAL-0001 o la "Bodega principal").

DROP INDEX "locations_name_type_key";
DROP INDEX "vehicles_plate_key";
DROP INDEX "tool_categories_name_key";
DROP INDEX "tools_code_key";

CREATE UNIQUE INDEX "locations_organization_id_name_type_key" ON "locations"("organization_id", "name", "type");
CREATE UNIQUE INDEX "vehicles_organization_id_plate_key" ON "vehicles"("organization_id", "plate");
CREATE UNIQUE INDEX "tool_categories_organization_id_name_key" ON "tool_categories"("organization_id", "name");
CREATE UNIQUE INDEX "tools_organization_id_code_key" ON "tools"("organization_id", "code");

CREATE INDEX "users_organization_id_idx" ON "users"("organization_id");
CREATE INDEX "tools_organization_id_status_idx" ON "tools"("organization_id", "status");
CREATE INDEX "transfers_organization_id_moved_at_idx" ON "transfers"("organization_id", "moved_at");
CREATE INDEX "lifecycle_events_organization_id_type_occurred_at_idx" ON "lifecycle_events"("organization_id", "type", "occurred_at");
CREATE INDEX "damage_reports_organization_id_idx" ON "damage_reports"("organization_id");
CREATE INDEX "rentals_organization_id_status_idx" ON "rentals"("organization_id", "status");
CREATE INDEX "photos_organization_id_idx" ON "photos"("organization_id");
CREATE INDEX "audit_log_organization_id_at_idx" ON "audit_log"("organization_id", "at");
CREATE INDEX "audit_log_actor_id_at_idx" ON "audit_log"("actor_id", "at");
CREATE INDEX "audit_log_impersonation_id_idx" ON "audit_log"("impersonation_id");

-- ---------- Claves foráneas ----------

ALTER TABLE "users" ADD CONSTRAINT "users_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "locations" ADD CONSTRAINT "locations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "tool_categories" ADD CONSTRAINT "tool_categories_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "tools" ADD CONSTRAINT "tools_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "lifecycle_events" ADD CONSTRAINT "lifecycle_events_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "damage_reports" ADD CONSTRAINT "damage_reports_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "rentals" ADD CONSTRAINT "rentals_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "photos" ADD CONSTRAINT "photos_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_effective_user_id_fkey" FOREIGN KEY ("effective_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_impersonation_id_fkey" FOREIGN KEY ("impersonation_id") REFERENCES "impersonation_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "impersonation_sessions" ADD CONSTRAINT "impersonation_sessions_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "impersonation_sessions" ADD CONSTRAINT "impersonation_sessions_target_user_id_fkey" FOREIGN KEY ("target_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "impersonation_sessions" ADD CONSTRAINT "impersonation_sessions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------- Aislamiento en la base de datos (defensa en profundidad) ----------
-- La API ya filtra cada consulta por organización; estos triggers impiden además que un error
-- de programación relacione registros de dos organizaciones o mueva un registro a otra.

-- Argumentos: pares (columna, tabla referida). Un usuario sin organización es un SuperAdmin:
-- puede figurar como autor (reportó, subió, registró) de acciones en cualquier organización.
CREATE OR REPLACE FUNCTION tenant_guard() RETURNS trigger AS $$
DECLARE
  rec JSONB := to_jsonb(NEW);
  org UUID := (rec ->> 'organization_id')::uuid;
  ref_id TEXT;
  ref_org UUID;
  found_rows INT;
BEGIN
  IF TG_OP = 'UPDATE' AND (to_jsonb(OLD) ->> 'organization_id') IS DISTINCT FROM (rec ->> 'organization_id') THEN
    RAISE EXCEPTION 'TENANT_MISMATCH: un registro de % no puede cambiar de organización', TG_TABLE_NAME;
  END IF;
  FOR i IN 0 .. TG_NARGS - 1 BY 2 LOOP
    ref_id := rec ->> TG_ARGV[i];
    CONTINUE WHEN ref_id IS NULL;
    EXECUTE format('SELECT organization_id FROM %I WHERE id = $1', TG_ARGV[i + 1]) INTO ref_org USING ref_id::uuid;
    GET DIAGNOSTICS found_rows = ROW_COUNT;
    CONTINUE WHEN found_rows = 0; -- inexistente: lo rechaza la clave foránea
    CONTINUE WHEN TG_ARGV[i + 1] = 'users' AND ref_org IS NULL;
    IF ref_org IS DISTINCT FROM org THEN
      RAISE EXCEPTION 'TENANT_MISMATCH: %.% apunta a un registro de otra organización', TG_TABLE_NAME, TG_ARGV[i];
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER users_tenant BEFORE INSERT OR UPDATE OF organization_id, default_vehicle_id ON users
  FOR EACH ROW EXECUTE FUNCTION tenant_guard('default_vehicle_id', 'vehicles');
CREATE TRIGGER locations_tenant BEFORE UPDATE OF organization_id ON locations
  FOR EACH ROW EXECUTE FUNCTION tenant_guard();
CREATE TRIGGER vehicles_tenant BEFORE UPDATE OF organization_id ON vehicles
  FOR EACH ROW EXECUTE FUNCTION tenant_guard();
CREATE TRIGGER tool_categories_tenant BEFORE UPDATE OF organization_id ON tool_categories
  FOR EACH ROW EXECUTE FUNCTION tenant_guard();
CREATE TRIGGER tools_tenant
  BEFORE INSERT OR UPDATE OF organization_id, category_id, current_location_id, current_custodian_id, cover_photo_id ON tools
  FOR EACH ROW EXECUTE FUNCTION tenant_guard(
    'category_id', 'tool_categories', 'current_location_id', 'locations',
    'current_custodian_id', 'users', 'cover_photo_id', 'photos');
CREATE TRIGGER transfers_tenant
  BEFORE INSERT OR UPDATE OF organization_id, from_location_id, to_location_id, delivered_by, received_by,
    created_by, driver_id, reception_by, vehicle_id ON transfers
  FOR EACH ROW EXECUTE FUNCTION tenant_guard(
    'from_location_id', 'locations', 'to_location_id', 'locations', 'delivered_by', 'users',
    'received_by', 'users', 'created_by', 'users', 'driver_id', 'users', 'reception_by', 'users',
    'vehicle_id', 'vehicles');
CREATE TRIGGER lifecycle_events_tenant BEFORE INSERT ON lifecycle_events
  FOR EACH ROW EXECUTE FUNCTION tenant_guard(
    'tool_id', 'tools', 'location_id', 'locations', 'transfer_id', 'transfers', 'reported_by', 'users');
CREATE TRIGGER damage_reports_tenant BEFORE INSERT ON damage_reports
  FOR EACH ROW EXECUTE FUNCTION tenant_guard(
    'tool_id', 'tools', 'rental_id', 'rentals', 'reported_by', 'users', 'lifecycle_event_id', 'lifecycle_events');
CREATE TRIGGER rentals_tenant
  BEFORE INSERT OR UPDATE OF organization_id, tool_id, location_id, received_by, returned_by,
    receive_event_id, return_event_id ON rentals
  FOR EACH ROW EXECUTE FUNCTION tenant_guard(
    'tool_id', 'tools', 'location_id', 'locations', 'received_by', 'users', 'returned_by', 'users',
    'receive_event_id', 'lifecycle_events', 'return_event_id', 'lifecycle_events');
CREATE TRIGGER photos_tenant
  BEFORE INSERT OR UPDATE OF organization_id, uploaded_by, tool_id, transfer_id, lifecycle_event_id,
    damage_report_id, rental_id ON photos
  FOR EACH ROW EXECUTE FUNCTION tenant_guard(
    'uploaded_by', 'users', 'tool_id', 'tools', 'transfer_id', 'transfers',
    'lifecycle_event_id', 'lifecycle_events', 'damage_report_id', 'damage_reports', 'rental_id', 'rentals');

-- Los ítems no llevan organización propia: la herramienta debe ser de la misma que el traslado.
CREATE OR REPLACE FUNCTION transfer_item_tenant_guard() RETURNS trigger AS $$
BEGIN
  IF (SELECT organization_id FROM tools WHERE id = NEW.tool_id)
     IS DISTINCT FROM (SELECT organization_id FROM transfers WHERE id = NEW.transfer_id) THEN
    RAISE EXCEPTION 'TENANT_MISMATCH: la herramienta y el traslado son de organizaciones distintas';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER transfer_items_tenant BEFORE INSERT OR UPDATE OF tool_id, transfer_id ON transfer_items
  FOR EACH ROW EXECUTE FUNCTION transfer_item_tenant_guard();

-- Sesión de soporte: la abre un SuperAdmin y el usuario destino pertenece a esa organización
-- (nunca otro SuperAdmin). La sesión solo puede cerrarse: el resto de sus datos no cambia.
CREATE OR REPLACE FUNCTION impersonation_guard() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'impersonation_sessions no se borra';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF OLD.ended_at IS NOT NULL THEN
      RAISE EXCEPTION 'la sesión de soporte % ya terminó', OLD.id;
    END IF;
    IF (NEW.actor_id, NEW.target_user_id, NEW.organization_id, NEW.reason, NEW.started_at, NEW.expires_at, NEW.ip)
       IS DISTINCT FROM
       (OLD.actor_id, OLD.target_user_id, OLD.organization_id, OLD.reason, OLD.started_at, OLD.expires_at, OLD.ip) THEN
      RAISE EXCEPTION 'la sesión de soporte % solo puede finalizarse', OLD.id;
    END IF;
    RETURN NEW;
  END IF;
  IF (SELECT role::text FROM users WHERE id = NEW.actor_id) IS DISTINCT FROM 'SUPERADMIN' THEN
    RAISE EXCEPTION 'TENANT_MISMATCH: solo un SuperAdmin abre sesiones de soporte';
  END IF;
  IF (SELECT organization_id FROM users WHERE id = NEW.target_user_id) IS DISTINCT FROM NEW.organization_id THEN
    RAISE EXCEPTION 'TENANT_MISMATCH: el usuario no pertenece a la organización de la sesión';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER impersonation_sessions_guard BEFORE INSERT OR UPDATE OR DELETE ON impersonation_sessions
  FOR EACH ROW EXECUTE FUNCTION impersonation_guard();

-- La auditoría es de solo inserción (antes no tenía protección en la BD).
CREATE TRIGGER audit_log_immutable BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();

-- ---------- Verificación final de integridad ----------
DO $$
DECLARE
  bad INT;
BEGIN
  SELECT count(*) INTO bad FROM users WHERE (role::text = 'SUPERADMIN') <> (organization_id IS NULL);
  IF bad > 0 THEN RAISE EXCEPTION 'Verificación: % usuario(s) sin organización', bad; END IF;

  SELECT count(*) INTO bad FROM tools t JOIN tool_categories c ON c.id = t.category_id
   WHERE c.organization_id <> t.organization_id;
  IF bad > 0 THEN RAISE EXCEPTION 'Verificación: % herramienta(s) con categoría de otra organización', bad; END IF;

  SELECT count(*) INTO bad FROM lifecycle_events e JOIN tools t ON t.id = e.tool_id
   WHERE e.organization_id <> t.organization_id;
  IF bad > 0 THEN RAISE EXCEPTION 'Verificación: % evento(s) de otra organización', bad; END IF;

  SELECT count(*) INTO bad FROM transfer_items i JOIN transfers tr ON tr.id = i.transfer_id JOIN tools t ON t.id = i.tool_id
   WHERE tr.organization_id <> t.organization_id;
  IF bad > 0 THEN RAISE EXCEPTION 'Verificación: % ítem(s) de traslado cruzados', bad; END IF;
END $$;
