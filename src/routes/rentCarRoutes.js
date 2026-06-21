import express from "express";
import {
  createRentCar,
  getRentCars,
  getRentCarsByUser,
  getRentCarById,
  updateRentCar,
  deleteRentCar,
  getPromotedRentCars,
  getUnavailableDates,
  createUnavailableDate,
  deleteUnavailableDate,
} from "../controllers/rentCarController.js";
import { protect } from "../middleware/authMiddleware.js";
import upload, { processToWebP } from "../middleware/uploadMiddleware.js";

const router = express.Router();

router.get("/promoted", getPromotedRentCars);
router.get("/user/my-rent-cars", protect, getRentCarsByUser);
router.get("/", getRentCars);
router.get("/:id/unavailable-dates", protect, getUnavailableDates);
router.get("/:id", getRentCarById);

router.post("/", protect, upload.array("images", 20), processToWebP, createRentCar);
router.post("/:id/unavailable-dates", protect, createUnavailableDate);
router.put("/:id", protect, upload.array("images", 20), processToWebP, updateRentCar);
router.delete("/:id", protect, deleteRentCar);
router.delete("/:id/unavailable-dates/:blockId", protect, deleteUnavailableDate);

export default router;
