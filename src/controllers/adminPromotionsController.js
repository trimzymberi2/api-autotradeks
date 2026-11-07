import { createHash } from 'node:crypto';
import pool from '../config/db.js';
import { clearRentCarCache } from '../utils/cache.js';
import { logError } from '../utils/logError.js';

const ORDER = 'position ASC, created_at DESC, rent_car_id ASC';
export const promotionRevision = (rows) => createHash('sha256').update(JSON.stringify(rows.map(row => [Number(row.rent_car_id), Number(row.position)]))).digest('hex');
export function validPromotionRequest(body) {
  return Array.isArray(body?.carIds) && body.carIds.length <= 200 &&
    body.carIds.every(id => Number.isInteger(id) && id > 0 && id <= 2147483647) &&
    new Set(body.carIds).size === body.carIds.length && /^[a-f0-9]{64}$/.test(body.revision || '');
}

export function createAdminPromotionsController(db = pool, invalidate = clearRentCarCache) {
  return {
    async getPromotions(req, res) {
      try {
        const result = await db.query(`SELECT p.rent_car_id, p.position, rc.id, rc.title, rc.brand, rc.model,
            rc.price_per_day, rc.city, u.name AS owner_name,
            (SELECT image_url FROM rent_car_images WHERE rent_car_id = rc.id LIMIT 1) AS image
          FROM promoted_rent_cars p JOIN rent_cars rc ON rc.id = p.rent_car_id JOIN users u ON u.id = rc.user_id
          WHERE p.is_active = true ORDER BY p.position ASC, p.created_at DESC, p.rent_car_id ASC`);
        res.json({ cars: result.rows, revision: promotionRevision(result.rows) });
      } catch (error) {
        logError('GET /api/admin/promotions', error);
        res.status(503).json({ message: 'Promovimet nuk mund te ngarkohen.' });
      }
    },
    async searchCars(req, res) {
      const q = String(req.query.q || '').trim().slice(0, 100);
      const page = Math.max(1, Math.min(100000, parseInt(req.query.page, 10) || 1));
      const limit = 12;
      const filter = `($1 = '' OR rc.title ILIKE $2 OR rc.brand ILIKE $2 OR rc.model ILIKE $2
        OR u.name ILIKE $2 OR u.email ILIKE $2 OR rc.id::text = $1)`;
      try {
        const [count, result] = await Promise.all([
          db.query(`SELECT COUNT(*)::int AS total FROM rent_cars rc JOIN users u ON u.id = rc.user_id WHERE ${filter}`, [q, `%${q}%`]),
          db.query(`SELECT rc.id, rc.title, rc.brand, rc.model, rc.price_per_day, rc.city, u.name AS owner_name,
              (SELECT image_url FROM rent_car_images WHERE rent_car_id = rc.id LIMIT 1) AS image
            FROM rent_cars rc JOIN users u ON u.id = rc.user_id WHERE ${filter}
            ORDER BY rc.created_at DESC, rc.id DESC LIMIT $3 OFFSET $4`, [q, `%${q}%`, limit, (page - 1) * limit]),
        ]);
        res.json({ cars: result.rows, total: count.rows[0].total, page, totalPages: Math.max(1, Math.ceil(count.rows[0].total / limit)) });
      } catch (error) {
        logError('GET /api/admin/cars', error);
        res.status(503).json({ message: 'Veturat nuk mund te ngarkohen.' });
      }
    },
    async savePromotions(req, res) {
      if (!validPromotionRequest(req.body)) return res.status(400).json({ message: 'Lista e promovimeve eshte e pavlefshme (maksimum 200 vetura, pa perseritje).' });
      let client;
      try {
        client = await db.connect();
        await client.query('BEGIN');
        // Serialize administrators and reject overwriting a list changed since it was loaded.
        await client.query('LOCK TABLE promoted_rent_cars IN EXCLUSIVE MODE');
        const current = await client.query(`SELECT rent_car_id, position FROM promoted_rent_cars WHERE is_active = true ORDER BY ${ORDER}`);
        if (promotionRevision(current.rows) !== req.body.revision) {
          await client.query('ROLLBACK');
          return res.status(409).json({ message: 'Lista ka ndryshuar. Rifreskojeni perpara se te ruani perseri.' });
        }
        const ids = req.body.carIds;
        const existing = await client.query('SELECT id FROM rent_cars WHERE id = ANY($1::int[]) FOR KEY SHARE', [ids]);
        if (existing.rows.length !== ids.length) {
          await client.query('ROLLBACK');
          return res.status(400).json({ message: 'Nje nga veturat nuk ekziston me. Rifreskojeni listen.' });
        }
        // Only promotional memberships are replaced; rental cars and their images are untouched.
        await client.query('DELETE FROM promoted_rent_cars WHERE is_active = true OR rent_car_id = ANY($1::int[])', [ids]);
        if (ids.length > 0) await client.query(`INSERT INTO promoted_rent_cars (rent_car_id, position, is_active, created_at)
          SELECT id, ordinal::int, true, NOW() FROM unnest($1::int[]) WITH ORDINALITY AS selected(id, ordinal)`, [ids]);
        await client.query('COMMIT');
        invalidate();
        res.json({ revision: promotionRevision(ids.map((id, index) => ({ rent_car_id: id, position: index + 1 }))), message: 'Promovimet dhe renditja u ruajten.' });
      } catch (error) {
        if (client) await client.query('ROLLBACK').catch(() => {});
        logError('PUT /api/admin/promotions', error);
        res.status(503).json({ message: 'Ruajtja deshtoi. Lista e meparshme u ruajt.' });
      } finally { client?.release(); }
    },
  };
}
export const { getPromotions, searchCars, savePromotions } = createAdminPromotionsController();
