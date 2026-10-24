BEGIN;

ALTER TABLE rent_cars
  ADD COLUMN IF NOT EXISTS pickup_locations TEXT[] NOT NULL DEFAULT '{}';

UPDATE rent_cars
SET pickup_locations = ARRAY[BTRIM(city)]
WHERE cardinality(pickup_locations) = 0
  AND city IS NOT NULL AND BTRIM(city) <> '';

CREATE INDEX IF NOT EXISTS rent_cars_pickup_locations_idx
  ON rent_cars USING GIN (pickup_locations);

COMMIT;
