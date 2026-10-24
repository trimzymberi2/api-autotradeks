BEGIN;

CREATE TABLE IF NOT EXISTS rent_car_view_visitors (
  rent_car_id INTEGER NOT NULL REFERENCES rent_cars(id) ON DELETE CASCADE,
  visitor_hash TEXT NOT NULL,
  last_viewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (rent_car_id, visitor_hash)
);

CREATE TABLE IF NOT EXISTS rent_car_daily_views (
  rent_car_id INTEGER NOT NULL REFERENCES rent_cars(id) ON DELETE CASCADE,
  view_date DATE NOT NULL,
  views BIGINT NOT NULL DEFAULT 0 CHECK (views >= 0),
  PRIMARY KEY (rent_car_id, view_date)
);

COMMIT;
