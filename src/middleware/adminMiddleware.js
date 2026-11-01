import { isAdminUser } from "../utils/adminAccess.js";

export function requireAdmin(req, res, next) {
  res.set("Cache-Control", "no-store");
  if (!req.user) return res.status(401).json({ message: "Authentication required" });
  if (!isAdminUser(req.user.id)) return res.status(403).json({ message: "Admin access required" });
  next();
}
