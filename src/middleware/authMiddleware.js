import jwt from "jsonwebtoken";
import pool from "../config/db.js";
import { logError } from "../utils/logError.js";

export const protect = async (req, res, next) => {
  if (!req.headers.authorization?.startsWith("Bearer")) {
    return res.status(401).json({ message: "No token" });
  }

  try {
    const token = req.headers.authorization.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const result = await pool.query(
      "SELECT id FROM users WHERE id=$1",
      [decoded.id]
    );

    if (!result.rows[0]) {
      return res.status(401).json({ message: "Not authorized" });
    }

    req.user = result.rows[0];
    next();
  } catch (err) {
    logError("authMiddleware protect", err);
    res.status(401).json({ message: "Not authorized" });
  }
};
