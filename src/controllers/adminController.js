import pool from "../config/db.js";
import { logError } from "../utils/logError.js";

const TODAY = "(NOW() AT TIME ZONE 'Europe/Belgrade')::date";
const VIEW_SUMS = `COALESCE(SUM(views), 0)::text AS total_views,
  COALESCE(SUM(views) FILTER (WHERE view_date = ${TODAY}), 0)::text AS today_views,
  COALESCE(SUM(views) FILTER (WHERE view_date >= ${TODAY} - 6), 0)::text AS week_views`;
const CAR_STATS = `WITH car_views AS (
  SELECT rent_car_id, ${VIEW_SUMS} FROM rent_car_daily_views GROUP BY rent_car_id
)`;

function pagination(query = {}) {
  const page = Math.max(1, Math.min(1000000, Number.parseInt(query.page, 10) || 1));
  const limit = Math.max(1, Math.min(50, Number.parseInt(query.limit, 10) || 20));
  return { page, limit, offset: (page - 1) * limit };
}
const numberStats = (row) => ({ ...row,
  total_views: Number(row.total_views || 0), today_views: Number(row.today_views || 0),
  week_views: Number(row.week_views || 0),
});

export function createAdminController(db = pool) {
  return {
    async overview(req, res) {
      try {
        const [totals, daily] = await Promise.all([
          db.query(`SELECT (SELECT COUNT(*) FROM users)::int AS total_users,
            (SELECT COUNT(*) FROM rent_cars)::int AS total_cars, ${VIEW_SUMS}
            FROM rent_car_daily_views`),
          db.query(`SELECT to_char(day, 'YYYY-MM-DD') AS date, COALESCE(SUM(d.views), 0)::text AS views
            FROM generate_series(${TODAY} - 29, ${TODAY}, INTERVAL '1 day') day
            LEFT JOIN rent_car_daily_views d ON d.view_date = day::date
            GROUP BY day ORDER BY day`),
        ]);
        res.json({ totals: numberStats(totals.rows[0]), daily: daily.rows.map((row) => ({ ...row, views: Number(row.views) })) });
      } catch (error) {
        logError("GET /api/admin/overview", error);
        res.status(503).json({ message: "Admin statistics temporarily unavailable" });
      }
    },
    async users(req, res) {
      const { page, limit, offset } = pagination(req.query);
      const search = String(req.query.q || "").trim().slice(0, 100);
      const filter = "($1 = '' OR u.name ILIKE $2 OR u.email ILIKE $2 OR u.phone ILIKE $2)";
      try {
        const [count, result] = await Promise.all([
          db.query(`SELECT COUNT(*)::int AS total FROM users u WHERE ${filter}`, [search, `%${search}%`]),
          db.query(`${CAR_STATS}, owner_stats AS (
              SELECT rc.user_id, COUNT(*)::int AS car_count,
                SUM(COALESCE(v.total_views::bigint, 0))::text AS total_views,
                SUM(COALESCE(v.today_views::bigint, 0))::text AS today_views,
                SUM(COALESCE(v.week_views::bigint, 0))::text AS week_views
              FROM rent_cars rc LEFT JOIN car_views v ON v.rent_car_id = rc.id GROUP BY rc.user_id
            ) SELECT u.id, u.name, u.email, u.phone, COALESCE(s.car_count, 0) AS car_count,
              COALESCE(s.total_views, '0') AS total_views, COALESCE(s.today_views, '0') AS today_views,
              COALESCE(s.week_views, '0') AS week_views
            FROM users u LEFT JOIN owner_stats s ON s.user_id = u.id WHERE ${filter}
            ORDER BY u.id DESC LIMIT $3 OFFSET $4`, [search, `%${search}%`, limit, offset]),
        ]);
        res.json({ users: result.rows.map(numberStats), page, limit, total: count.rows[0].total,
          totalPages: Math.max(1, Math.ceil(count.rows[0].total / limit)) });
      } catch (error) {
        logError("GET /api/admin/users", error);
        res.status(503).json({ message: "Users temporarily unavailable" });
      }
    },
    async userDetails(req, res) {
      const id = String(req.params.id);
      if (!/^[1-9][0-9]{0,9}$/.test(id) || Number(id) > 2147483647) return res.status(400).json({ message: "Invalid user ID" });
      const { page, limit, offset } = pagination(req.query);
      try {
        const user = await db.query("SELECT id, name, email, phone FROM users WHERE id = $1", [id]);
        if (!user.rows[0]) return res.status(404).json({ message: "User not found" });
        const [summary, cars] = await Promise.all([
          db.query(`${CAR_STATS} SELECT COUNT(*)::int AS car_count,
              COALESCE(SUM(v.total_views::bigint), 0)::text AS total_views,
              COALESCE(SUM(v.today_views::bigint), 0)::text AS today_views,
              COALESCE(SUM(v.week_views::bigint), 0)::text AS week_views
            FROM rent_cars rc LEFT JOIN car_views v ON v.rent_car_id = rc.id WHERE rc.user_id = $1`, [id]),
          db.query(`${CAR_STATS} SELECT rc.id, rc.title, rc.brand, rc.model, rc.price_per_day,
              rc.city, rc.pickup_locations, rc.created_at,
              (SELECT image_url FROM rent_car_images WHERE rent_car_id = rc.id LIMIT 1) AS image,
              COALESCE(v.total_views, '0') AS total_views, COALESCE(v.today_views, '0') AS today_views,
              COALESCE(v.week_views, '0') AS week_views
            FROM rent_cars rc LEFT JOIN car_views v ON v.rent_car_id = rc.id WHERE rc.user_id = $1
            ORDER BY rc.created_at DESC, rc.id DESC LIMIT $2 OFFSET $3`, [id, limit, offset]),
        ]);
        const totals = numberStats(summary.rows[0]);
        res.json({ user: user.rows[0], totals, cars: cars.rows.map(numberStats), page, limit,
          totalPages: Math.max(1, Math.ceil(totals.car_count / limit)) });
      } catch (error) {
        logError("GET /api/admin/users/:id", error);
        res.status(503).json({ message: "User details temporarily unavailable" });
      }
    },
  };
}

export const { overview, users, userDetails } = createAdminController();
