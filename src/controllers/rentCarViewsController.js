import { createHash } from "node:crypto";
import jwt from "jsonwebtoken";
import pool from "../config/db.js";
import { logError } from "../utils/logError.js";

const VISITOR_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CAR_ID = /^[1-9][0-9]{0,9}$/;

export function createRentCarViewsController(db = pool, verifyToken = jwt.verify) {
  return {
    async recordView(req, res) {
      res.set("Cache-Control", "no-store");
      const { id } = req.params;
      const visitorId = req.body?.visitorId;
      if (!CAR_ID.test(id) || Number(id) > 2147483647 || typeof visitorId !== "string" || !VISITOR_ID.test(visitorId)) {
        return res.status(400).json({ message: "Invalid view request" });
      }
      // Ignore obvious crawlers. Counts remain approximate, not fraud-proof analytics.
      if (/bot|crawler|spider|headless/i.test(req.get("user-agent") || "")) {
        return res.sendStatus(204);
      }

      let userId = null;
      const authorization = req.get("authorization") || "";
      if (authorization.startsWith("Bearer ")) {
        try {
          const decoded = verifyToken(authorization.slice(7), process.env.JWT_SECRET);
          if (decoded.id != null) userId = String(decoded.id);
        } catch {
          // An expired login must not prevent a public listing from opening.
        }
      }

      const visitorHash = createHash("sha256").update(visitorId).digest("hex");
      try {
        // A single atomic statement deduplicates concurrent requests and updates totals.
        // No cache invalidation: public listing data does not contain these statistics.
        await db.query(
          `WITH accepted_view AS (
            INSERT INTO rent_car_view_visitors (rent_car_id, visitor_hash, last_viewed_at)
            SELECT id, $2, NOW() FROM rent_cars
            WHERE id = $1 AND ($3::text IS NULL OR user_id::text <> $3)
            ON CONFLICT (rent_car_id, visitor_hash) DO UPDATE
              SET last_viewed_at = EXCLUDED.last_viewed_at
              WHERE rent_car_view_visitors.last_viewed_at <= NOW() - INTERVAL '24 hours'
            RETURNING rent_car_id
          )
          INSERT INTO rent_car_daily_views (rent_car_id, view_date, views)
          SELECT rent_car_id, (NOW() AT TIME ZONE 'Europe/Belgrade')::date, 1
          FROM accepted_view
          ON CONFLICT (rent_car_id, view_date) DO UPDATE
            SET views = rent_car_daily_views.views + 1`,
          [id, visitorHash, userId]
        );
        return res.sendStatus(204);
      } catch (err) {
        logError("POST /api/rent-cars/:id/views", err);
        return res.status(503).json({ message: "View tracking temporarily unavailable" });
      }
    },

    async getOwnerViewStats(req, res) {
      res.set("Cache-Control", "no-store");
      try {
        const result = await db.query(
          `SELECT rc.id AS rent_car_id,
            COALESCE(SUM(d.views), 0) AS total_views,
            COALESCE(SUM(d.views) FILTER (WHERE d.view_date =
              (NOW() AT TIME ZONE 'Europe/Belgrade')::date), 0) AS today_views,
            COALESCE(SUM(d.views) FILTER (WHERE d.view_date >=
              (NOW() AT TIME ZONE 'Europe/Belgrade')::date - 6), 0) AS week_views
          FROM rent_cars rc
          LEFT JOIN rent_car_daily_views d ON d.rent_car_id = rc.id
          WHERE rc.user_id = $1
          GROUP BY rc.id`,
          [req.user.id]
        );
        return res.json({ stats: result.rows.map((row) => ({
          rent_car_id: row.rent_car_id,
          total_views: Number(row.total_views),
          today_views: Number(row.today_views),
          week_views: Number(row.week_views),
        })) });
      } catch (err) {
        logError("GET /api/rent-cars/user/view-stats", err);
        return res.status(503).json({ message: "View statistics temporarily unavailable" });
      }
    },
  };
}

export const { recordView, getOwnerViewStats } = createRentCarViewsController();
