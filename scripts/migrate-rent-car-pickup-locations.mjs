import "dotenv/config";
import { readFile } from "node:fs/promises";
const { default: pool } = await import("../src/config/db.js");
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL must be set before running the migration");
const sql = await readFile(new URL("../migrations/20261024_rent_car_pickup_locations.sql", import.meta.url), "utf8");
const client = await pool.connect();
try {
  await client.query(sql);
  console.log("Rental pickup locations column and index are ready.");
} catch (error) {
  await client.query("ROLLBACK");
  console.error("Migration failed:", error.code || error.name);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
