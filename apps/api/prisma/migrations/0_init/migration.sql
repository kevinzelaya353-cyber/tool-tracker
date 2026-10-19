-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'BODEGUERO', 'SUPERVISOR', 'CHOFER', 'LECTOR');

-- CreateEnum
CREATE TYPE "ToolStatus" AS ENUM ('BODEGA', 'EN_PROYECTO', 'EN_TRANSITO', 'EN_MANTENIMIENTO', 'DANADA', 'EXTRAVIADA', 'DADA_DE_BAJA');

-- CreateEnum
CREATE TYPE "TransferStatus" AS ENUM ('EN_TRANSITO', 'RECIBIDO');

-- CreateEnum
CREATE TYPE "ItemOutcome" AS ENUM ('RECIBIDA', 'DANADA', 'NO_LLEGO');

-- CreateEnum
CREATE TYPE "ReceptionMethod" AS ENUM ('SESION', 'PIN', 'SUPERVISION');

-- CreateEnum
CREATE TYPE "LocationType" AS ENUM ('BODEGA', 'PROYECTO');

-- CreateEnum
CREATE TYPE "EventType" AS ENUM ('PURCHASE', 'DISPATCH', 'TRANSFER', 'MAINTENANCE_START', 'MAINTENANCE_END', 'DAMAGE', 'LOSS', 'RECOVERY', 'DECOMMISSION');

-- CreateEnum
CREATE TYPE "PhotoStage" AS ENUM ('ENTREGA', 'RECEPCION');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "email" VARCHAR(254),
    "username" VARCHAR(30),
    "password_hash" TEXT,
    "role" "Role" NOT NULL DEFAULT 'LECTOR',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "failed_logins" INTEGER NOT NULL DEFAULT 0,
    "locked_at" TIMESTAMPTZ(3),
    "default_vehicle_id" UUID,
    "last_login_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "locations" (
    "id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "type" "LocationType" NOT NULL,
    "address" VARCHAR(250),
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "started_at" DATE,
    "closed_at" DATE,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicles" (
    "id" UUID NOT NULL,
    "plate" VARCHAR(15) NOT NULL,
    "description" VARCHAR(120),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vehicles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tool_categories" (
    "id" UUID NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tool_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tools" (
    "id" UUID NOT NULL,
    "code" VARCHAR(30) NOT NULL,
    "category_id" UUID NOT NULL,
    "brand" VARCHAR(60) NOT NULL,
    "model" VARCHAR(60),
    "serial" VARCHAR(80),
    "purchase_price" DECIMAL(12,2) NOT NULL,
    "purchase_date" DATE NOT NULL,
    "supplier" VARCHAR(120),
    "cover_photo_id" UUID,
    "status" "ToolStatus" NOT NULL DEFAULT 'BODEGA',
    "current_location_id" UUID,
    "current_custodian_id" UUID,
    "status_changed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "tools_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transfers" (
    "id" UUID NOT NULL,
    "from_location_id" UUID NOT NULL,
    "to_location_id" UUID NOT NULL,
    "delivered_by" UUID NOT NULL,
    "received_by" UUID NOT NULL,
    "driver_id" UUID,
    "vehicle_id" UUID,
    "status" "TransferStatus" NOT NULL DEFAULT 'RECIBIDO',
    "received_at" TIMESTAMPTZ(3),
    "reception_by" UUID,
    "reception_method" "ReceptionMethod",
    "reception_notes" VARCHAR(500),
    "reception_recorded_at" TIMESTAMPTZ(3),
    "moved_at" TIMESTAMPTZ(3) NOT NULL,
    "notes" VARCHAR(500),
    "route_geometry" JSONB,
    "route_distance_m" INTEGER,
    "route_duration_s" INTEGER,
    "map_key" VARCHAR(120),
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transfers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transfer_items" (
    "id" UUID NOT NULL,
    "transfer_id" UUID NOT NULL,
    "tool_id" UUID NOT NULL,
    "condition_note" VARCHAR(250),
    "outcome" "ItemOutcome",
    "reception_note" VARCHAR(250),

    CONSTRAINT "transfer_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lifecycle_events" (
    "id" UUID NOT NULL,
    "tool_id" UUID NOT NULL,
    "type" "EventType" NOT NULL,
    "from_status" "ToolStatus",
    "to_status" "ToolStatus" NOT NULL,
    "occurred_at" TIMESTAMPTZ(3) NOT NULL,
    "cost" DECIMAL(12,2),
    "description" VARCHAR(500),
    "location_id" UUID,
    "transfer_id" UUID,
    "reported_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT clock_timestamp(),

    CONSTRAINT "lifecycle_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "photos" (
    "id" UUID NOT NULL,
    "storage_key" VARCHAR(300) NOT NULL,
    "thumb_key" VARCHAR(300),
    "mime" VARCHAR(40) NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "uploaded_by" UUID NOT NULL,
    "tool_id" UUID,
    "transfer_id" UUID,
    "lifecycle_event_id" UUID,
    "stage" "PhotoStage",
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "accuracy_m" INTEGER,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "hidden_at" TIMESTAMPTZ(3),

    CONSTRAINT "photos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" VARCHAR(128) NOT NULL,
    "family" UUID NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "revoked_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" BIGSERIAL NOT NULL,
    "actor_id" UUID,
    "action" VARCHAR(60) NOT NULL,
    "entity" VARCHAR(60) NOT NULL,
    "entity_id" VARCHAR(64),
    "diff" JSONB,
    "ip" VARCHAR(45),
    "at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "locations_name_type_key" ON "locations"("name", "type");

-- CreateIndex
CREATE UNIQUE INDEX "vehicles_plate_key" ON "vehicles"("plate");

-- CreateIndex
CREATE UNIQUE INDEX "tool_categories_name_key" ON "tool_categories"("name");

-- CreateIndex
CREATE UNIQUE INDEX "tools_code_key" ON "tools"("code");

-- CreateIndex
CREATE UNIQUE INDEX "tools_cover_photo_id_key" ON "tools"("cover_photo_id");

-- CreateIndex
CREATE INDEX "tools_status_idx" ON "tools"("status");

-- CreateIndex
CREATE INDEX "tools_category_id_idx" ON "tools"("category_id");

-- CreateIndex
CREATE INDEX "tools_current_location_id_idx" ON "tools"("current_location_id");

-- CreateIndex
CREATE INDEX "tools_purchase_date_idx" ON "tools"("purchase_date");

-- CreateIndex
CREATE INDEX "transfers_moved_at_idx" ON "transfers"("moved_at");

-- CreateIndex
CREATE INDEX "transfers_status_driver_id_idx" ON "transfers"("status", "driver_id");

-- CreateIndex
CREATE INDEX "transfers_status_received_by_idx" ON "transfers"("status", "received_by");

-- CreateIndex
CREATE INDEX "transfers_from_location_id_idx" ON "transfers"("from_location_id");

-- CreateIndex
CREATE INDEX "transfers_to_location_id_idx" ON "transfers"("to_location_id");

-- CreateIndex
CREATE INDEX "transfer_items_tool_id_idx" ON "transfer_items"("tool_id");

-- CreateIndex
CREATE UNIQUE INDEX "transfer_items_transfer_id_tool_id_key" ON "transfer_items"("transfer_id", "tool_id");

-- CreateIndex
CREATE INDEX "lifecycle_events_tool_id_occurred_at_idx" ON "lifecycle_events"("tool_id", "occurred_at");

-- CreateIndex
CREATE INDEX "lifecycle_events_type_occurred_at_idx" ON "lifecycle_events"("type", "occurred_at");

-- CreateIndex
CREATE UNIQUE INDEX "photos_storage_key_key" ON "photos"("storage_key");

-- CreateIndex
CREATE INDEX "photos_transfer_id_idx" ON "photos"("transfer_id");

-- CreateIndex
CREATE INDEX "photos_lifecycle_event_id_idx" ON "photos"("lifecycle_event_id");

-- CreateIndex
CREATE INDEX "photos_tool_id_idx" ON "photos"("tool_id");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_hash_key" ON "refresh_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "refresh_tokens_user_id_idx" ON "refresh_tokens"("user_id");

-- CreateIndex
CREATE INDEX "refresh_tokens_family_idx" ON "refresh_tokens"("family");

-- CreateIndex
CREATE INDEX "audit_log_entity_entity_id_idx" ON "audit_log"("entity", "entity_id");

-- CreateIndex
CREATE INDEX "audit_log_at_idx" ON "audit_log"("at");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_default_vehicle_id_fkey" FOREIGN KEY ("default_vehicle_id") REFERENCES "vehicles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tools" ADD CONSTRAINT "tools_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "tool_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tools" ADD CONSTRAINT "tools_current_location_id_fkey" FOREIGN KEY ("current_location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tools" ADD CONSTRAINT "tools_current_custodian_id_fkey" FOREIGN KEY ("current_custodian_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tools" ADD CONSTRAINT "tools_cover_photo_id_fkey" FOREIGN KEY ("cover_photo_id") REFERENCES "photos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_from_location_id_fkey" FOREIGN KEY ("from_location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_to_location_id_fkey" FOREIGN KEY ("to_location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_delivered_by_fkey" FOREIGN KEY ("delivered_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_received_by_fkey" FOREIGN KEY ("received_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_reception_by_fkey" FOREIGN KEY ("reception_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfer_items" ADD CONSTRAINT "transfer_items_transfer_id_fkey" FOREIGN KEY ("transfer_id") REFERENCES "transfers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfer_items" ADD CONSTRAINT "transfer_items_tool_id_fkey" FOREIGN KEY ("tool_id") REFERENCES "tools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lifecycle_events" ADD CONSTRAINT "lifecycle_events_tool_id_fkey" FOREIGN KEY ("tool_id") REFERENCES "tools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lifecycle_events" ADD CONSTRAINT "lifecycle_events_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lifecycle_events" ADD CONSTRAINT "lifecycle_events_transfer_id_fkey" FOREIGN KEY ("transfer_id") REFERENCES "transfers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lifecycle_events" ADD CONSTRAINT "lifecycle_events_reported_by_fkey" FOREIGN KEY ("reported_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "photos" ADD CONSTRAINT "photos_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "photos" ADD CONSTRAINT "photos_tool_id_fkey" FOREIGN KEY ("tool_id") REFERENCES "tools"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "photos" ADD CONSTRAINT "photos_transfer_id_fkey" FOREIGN KEY ("transfer_id") REFERENCES "transfers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "photos" ADD CONSTRAINT "photos_lifecycle_event_id_fkey" FOREIGN KEY ("lifecycle_event_id") REFERENCES "lifecycle_events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Reglas que Prisma no expresa en schema.prisma (antes prisma/sql/constraints.sql).

ALTER TABLE tools
  ADD CONSTRAINT tools_purchase_price_nonneg CHECK (purchase_price >= 0);

ALTER TABLE transfers
  ADD CONSTRAINT transfers_distinct_locations CHECK (from_location_id <> to_location_id),
  ADD CONSTRAINT transfers_distinct_people    CHECK (delivered_by <> received_by);

ALTER TABLE lifecycle_events
  ADD CONSTRAINT lifecycle_cost_nonneg CHECK (cost IS NULL OR cost >= 0),
  ADD CONSTRAINT lifecycle_from_status_required CHECK (type = 'PURCHASE' OR from_status IS NOT NULL);

-- Una foto pertenece a lo sumo a un movimiento o a un evento.
ALTER TABLE photos
  ADD CONSTRAINT photos_single_owner CHECK (NOT (transfer_id IS NOT NULL AND lifecycle_event_id IS NOT NULL));

-- Una herramienta EN_PROYECTO o en BODEGA siempre tiene ubicación.
ALTER TABLE tools
  ADD CONSTRAINT tools_location_when_placed
  CHECK (status NOT IN ('BODEGA', 'EN_PROYECTO') OR current_location_id IS NOT NULL);

-- Historial inmutable: los eventos no se editan ni se borran.
CREATE OR REPLACE FUNCTION forbid_lifecycle_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'lifecycle_events es de solo inserción';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER lifecycle_events_immutable
  BEFORE UPDATE OR DELETE ON lifecycle_events
  FOR EACH ROW EXECUTE FUNCTION forbid_lifecycle_mutation();

-- Coordenadas completas (ambas o ninguna) y dentro de rango.
ALTER TABLE locations
  ADD CONSTRAINT locations_coords_pair CHECK ((latitude IS NULL) = (longitude IS NULL)),
  ADD CONSTRAINT locations_coords_range CHECK (latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180);

-- La etapa (entrega/recepción) solo tiene sentido en fotos de traslado.
ALTER TABLE photos
  ADD CONSTRAINT photos_stage_only_transfer CHECK (stage IS NULL OR transfer_id IS NOT NULL);

-- Traslado con chofer: mientras está en tránsito tiene chofer y aún no tiene llegada.
ALTER TABLE transfers
  ADD CONSTRAINT transfers_transit_has_driver
  CHECK (status <> 'EN_TRANSITO' OR (driver_id IS NOT NULL AND received_at IS NULL AND reception_by IS NULL));

-- Una herramienta en tránsito siempre tiene a alguien a cargo (el chofer).
ALTER TABLE tools
  ADD CONSTRAINT tools_transit_has_custodian
  CHECK (status <> 'EN_TRANSITO' OR current_custodian_id IS NOT NULL);

-- Ubicación de la foto completa (ambas o ninguna) y dentro de rango.
ALTER TABLE photos
  ADD CONSTRAINT photos_coords_pair CHECK ((latitude IS NULL) = (longitude IS NULL)),
  ADD CONSTRAINT photos_coords_range CHECK (latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180);
