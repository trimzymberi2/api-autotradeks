import express from "express";
import {
  createRentCar,
  getRentCars,
  getRentCarById,
  getPromotedRentCars,
} from "../controllers/rentCarController.js";
import { protect } from "../middleware/authMiddleware.js";
import upload, { processToWebP } from "../middleware/uploadMiddleware.js";

const router = express.Router();

router.get("/promoted", getPromotedRentCars);
router.get("/", getRentCars);
router.get("/:id", getRentCarById);

router.post("/", protect, upload.array("images", 20), processToWebP, createRentCar);

export default router;