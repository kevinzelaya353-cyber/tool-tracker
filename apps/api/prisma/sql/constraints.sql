-- Restricciones que Prisma no expresa en schema.prisma.
-- Se agregan al final de la primera migración (ver README):
--   pnpm --filter @tt/api exec prisma migrate dev --create-only --name init
--   (pegar este archivo al final de migrations/<ts>_init/migration.sql)
--   pnpm db:migrate

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
