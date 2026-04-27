import express from "express";
import {
  createCar,
  getCars,
  getCarById,
  updateCar,
  deleteCar,
} from "../controllers/carController.js";
import { protect } from "../middleware/authMiddleware.js";
import upload, { processToWebP } from "../middleware/uploadMiddleware.js";

const router = express.Router();

router.get("/", getCars);
router.get("/:id", getCarById);

router.post("/", protect, upload.array("images", 20), processToWebP, createCar);
router.put("/:id", protect, updateCar);
router.delete("/:id", protect, deleteCar);

export default router;