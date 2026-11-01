import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import { requireAdmin } from "../middleware/adminMiddleware.js";
import { overview, users, userDetails } from "../controllers/adminController.js";

const router = express.Router();
router.use(protect, requireAdmin);
router.get("/overview", overview);
router.get("/users", users);
router.get("/users/:id", userDetails);
export default router;
