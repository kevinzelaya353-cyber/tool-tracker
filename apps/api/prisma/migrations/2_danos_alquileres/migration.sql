-- Reportes de daño con fotos, herramientas rentadas y períodos de alquiler.
-- Solo agrega: no borra ni modifica datos existentes (las herramientas actuales quedan como PROPIA).

-- CreateEnum
CREATE TYPE "ToolOwnership" AS ENUM ('PROPIA', 'RENTADA');

-- CreateEnum
CREATE TYPE "DamageKind" AS ENUM ('GOLPE', 'FALLA', 'PIEZA_FALTANTE', 'ROTURA', 'DESGASTE', 'OTRO');

-- CreateEnum
CREATE TYPE "ToolCondition" AS ENUM ('BUENO', 'CON_DETALLES', 'NO_OPERATIVA');

-- CreateEnum
CREATE TYPE "RentalStatus" AS ENUM ('ACTIVO', 'DEVUELTO');

-- AlterEnum
ALTER TYPE "ToolStatus" ADD VALUE 'DEVUELTA';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "EventType" ADD VALUE 'RENTAL_RECEIVE';
ALTER TYPE "EventType" ADD VALUE 'RENTAL_RETURN';

-- AlterEnum
ALTER TYPE "PhotoStage" ADD VALUE 'DEVOLUCION';

-- AlterTable
ALTER TABLE "tools" ADD COLUMN     "ownership" "ToolOwnership" NOT NULL DEFAULT 'PROPIA';

-- AlterTable
ALTER TABLE "photos" ADD COLUMN     "damage_report_id" UUID,
ADD COLUMN     "rental_id" UUID;

-- CreateTable
CREATE TABLE "damage_reports" (
    "id" UUID NOT NULL,
    "tool_id" UUID NOT NULL,
    "rental_id" UUID,
    "kind" "DamageKind" NOT NULL,
    "condition" "ToolCondition" NOT NULL,
    "tool_status" "ToolStatus" NOT NULL,
    "description" VARCHAR(500) NOT NULL,
    "notes" VARCHAR(500),
    "occurred_at" TIMESTAMPTZ(3) NOT NULL,
    "reported_by" UUID NOT NULL,
    "lifecycle_event_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT clock_timestamp(),

    CONSTRAINT "damage_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rentals" (
    "id" UUID NOT NULL,
    "tool_id" UUID NOT NULL,
    "lessor" VARCHAR(120) NOT NULL,
    "status" "RentalStatus" NOT NULL DEFAULT 'ACTIVO',
    "location_id" UUID NOT NULL,
    "received_at" TIMESTAMPTZ(3) NOT NULL,
    "expected_return_at" TIMESTAMPTZ(3),
    "notes" VARCHAR(500),
    "reception_condition" "ToolCondition" NOT NULL,
    "reception_description" VARCHAR(500),
    "reception_notes" VARCHAR(500),
    "received_by" UUID NOT NULL,
    "receive_event_id" UUID NOT NULL,
    "returned_at" TIMESTAMPTZ(3),
    "return_condition" "ToolCondition",
    "return_description" VARCHAR(500),
    "return_notes" VARCHAR(500),
    "return_differences" VARCHAR(500),
    "returned_by" UUID,
    "return_event_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "rentals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "damage_reports_lifecycle_event_id_key" ON "damage_reports"("lifecycle_event_id");

-- CreateIndex
CREATE INDEX "damage_reports_tool_id_occurred_at_idx" ON "damage_reports"("tool_id", "occurred_at");

-- CreateIndex
CREATE INDEX "damage_reports_rental_id_idx" ON "damage_reports"("rental_id");

-- CreateIndex
CREATE UNIQUE INDEX "rentals_receive_event_id_key" ON "rentals"("receive_event_id");

-- CreateIndex
CREATE UNIQUE INDEX "rentals_return_event_id_key" ON "rentals"("return_event_id");

-- CreateIndex
CREATE INDEX "rentals_tool_id_received_at_idx" ON "rentals"("tool_id", "received_at");

-- CreateIndex
CREATE INDEX "rentals_status_idx" ON "rentals"("status");

-- CreateIndex
CREATE INDEX "photos_damage_report_id_idx" ON "photos"("damage_report_id");

-- CreateIndex
CREATE INDEX "photos_rental_id_idx" ON "photos"("rental_id");

-- AddForeignKey
ALTER TABLE "damage_reports" ADD CONSTRAINT "damage_reports_tool_id_fkey" FOREIGN KEY ("tool_id") REFERENCES "tools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "damage_reports" ADD CONSTRAINT "damage_reports_rental_id_fkey" FOREIGN KEY ("rental_id") REFERENCES "rentals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "damage_reports" ADD CONSTRAINT "damage_reports_reported_by_fkey" FOREIGN KEY ("reported_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "damage_reports" ADD CONSTRAINT "damage_reports_lifecycle_event_id_fkey" FOREIGN KEY ("lifecycle_event_id") REFERENCES "lifecycle_events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rentals" ADD CONSTRAINT "rentals_tool_id_fkey" FOREIGN KEY ("tool_id") REFERENCES "tools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rentals" ADD CONSTRAINT "rentals_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rentals" ADD CONSTRAINT "rentals_received_by_fkey" FOREIGN KEY ("received_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rentals" ADD CONSTRAINT "rentals_returned_by_fkey" FOREIGN KEY ("returned_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rentals" ADD CONSTRAINT "rentals_receive_event_id_fkey" FOREIGN KEY ("receive_event_id") REFERENCES "lifecycle_events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rentals" ADD CONSTRAINT "rentals_return_event_id_fkey" FOREIGN KEY ("return_event_id") REFERENCES "lifecycle_events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "photos" ADD CONSTRAINT "photos_damage_report_id_fkey" FOREIGN KEY ("damage_report_id") REFERENCES "damage_reports"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "photos" ADD CONSTRAINT "photos_rental_id_fkey" FOREIGN KEY ("rental_id") REFERENCES "rentals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ---------- Integridad (escrito a mano) ----------
-- Nota: no se usan aquí los valores nuevos de enums existentes (DEVUELTA, DEVOLUCION…): PostgreSQL
-- no permite usarlos en la misma transacción en que se agregan.

-- Sin estado anterior: la compra o la primera recepción de una herramienta rentada (nace con ella).
-- Se compara como texto para no usar el valor nuevo del enum en esta misma transacción.
ALTER TABLE lifecycle_events DROP CONSTRAINT lifecycle_from_status_required;
ALTER TABLE lifecycle_events
  ADD CONSTRAINT lifecycle_from_status_required CHECK (type::text IN ('PURCHASE', 'RENTAL_RECEIVE') OR from_status IS NOT NULL);

-- Una foto pertenece a lo sumo a un traslado, evento, reporte de daño o alquiler.
ALTER TABLE photos DROP CONSTRAINT photos_single_owner;
ALTER TABLE photos
  ADD CONSTRAINT photos_single_owner CHECK (
    num_nonnulls(transfer_id, lifecycle_event_id, damage_report_id, rental_id) <= 1
  );

-- La etapa también aplica a las fotos de alquiler (recepción / devolución).
ALTER TABLE photos DROP CONSTRAINT photos_stage_only_transfer;
ALTER TABLE photos
  ADD CONSTRAINT photos_stage_only_transfer CHECK (stage IS NULL OR transfer_id IS NOT NULL OR rental_id IS NOT NULL);
ALTER TABLE photos
  ADD CONSTRAINT photos_rental_has_stage CHECK (rental_id IS NULL OR stage IS NOT NULL);

-- Una herramienta rentada no es un activo de la empresa: no suma al inventario ni a las pérdidas.
ALTER TABLE tools
  ADD CONSTRAINT tools_rented_no_price CHECK (ownership = 'PROPIA' OR purchase_price = 0);

-- Un solo período de alquiler activo por herramienta (varios períodos en fechas distintas sí).
CREATE UNIQUE INDEX rentals_one_active_per_tool ON rentals (tool_id) WHERE status = 'ACTIVO';

-- Devuelto ⇔ la devolución está completa.
ALTER TABLE rentals
  ADD CONSTRAINT rentals_return_complete CHECK (
    (status = 'ACTIVO' AND returned_at IS NULL AND return_condition IS NULL AND returned_by IS NULL AND return_event_id IS NULL)
    OR (status = 'DEVUELTO' AND returned_at IS NOT NULL AND return_condition IS NOT NULL AND returned_by IS NOT NULL AND return_event_id IS NOT NULL)
  ),
  ADD CONSTRAINT rentals_return_after_reception CHECK (returned_at IS NULL OR returned_at >= received_at);

-- Reportes de daño: solo inserción, como lifecycle_events.
CREATE OR REPLACE FUNCTION forbid_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '% es de solo inserción', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER damage_reports_immutable
  BEFORE UPDATE OR DELETE ON damage_reports
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();

-- Alquileres: no se borran; la recepción (evidencia original) no cambia nunca y un alquiler
-- devuelto queda cerrado. Lo único permitido es registrar la devolución una vez.
CREATE OR REPLACE FUNCTION guard_rental_update() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'rentals no se borra';
  END IF;
  IF OLD.status = 'DEVUELTO' THEN
    RAISE EXCEPTION 'el alquiler % ya fue devuelto', OLD.id;
  END IF;
  IF (NEW.tool_id, NEW.lessor, NEW.location_id, NEW.received_at, NEW.expected_return_at, NEW.notes,
      NEW.reception_condition, NEW.reception_description, NEW.reception_notes, NEW.received_by,
      NEW.receive_event_id, NEW.created_at)
     IS DISTINCT FROM
     (OLD.tool_id, OLD.lessor, OLD.location_id, OLD.received_at, OLD.expected_return_at, OLD.notes,
      OLD.reception_condition, OLD.reception_description, OLD.reception_notes, OLD.received_by,
      OLD.receive_event_id, OLD.created_at) THEN
    RAISE EXCEPTION 'la recepción del alquiler % no se puede modificar', OLD.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER rentals_guard
  BEFORE UPDATE OR DELETE ON rentals
  FOR EACH ROW EXECUTE FUNCTION guard_rental_update();

-- Las fotos de un alquiler o reporte no cambian de dueño una vez asociadas (sí pueden ocultarse).
CREATE OR REPLACE FUNCTION guard_photo_owner() RETURNS trigger AS $$
BEGIN
  IF (OLD.damage_report_id IS NOT NULL AND NEW.damage_report_id IS DISTINCT FROM OLD.damage_report_id)
     OR (OLD.rental_id IS NOT NULL AND (NEW.rental_id IS DISTINCT FROM OLD.rental_id OR NEW.stage IS DISTINCT FROM OLD.stage)) THEN
    RAISE EXCEPTION 'la foto % ya es evidencia y no puede reasignarse', OLD.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER photos_evidence_owner
  BEFORE UPDATE ON photos
  FOR EACH ROW EXECUTE FUNCTION guard_photo_owner();
