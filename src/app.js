import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import multer from "multer";

import authRoutes from "./routes/authRoutes.js";
import rentCarRoutes from "./routes/rentCarRoutes.js";

import { protect } from "./middleware/authMiddleware.js";
import carRoutes from "./routes/carRoutes.js";
import { logError } from "./utils/logError.js";

const app = express();

app.use(cors({
  origin: [
    "http://localhost:5173",
    "https://autotradeks.com",
    "https://www.autotradeks.com",
    "https://autotradeks.netlify.app",
    "https://www.rentacarks.com",
    "https://rentacar-ks.netlify.app"
  ],
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
  credentials: true
}));

app.use(express.json());

app.use("/api/auth", authRoutes);
app.use("/api/cars", carRoutes);
app.use("/api/rent-cars", rentCarRoutes);
app.get("/api/protected", protect, (req, res) => {
  res.json({ message: "You are authorized", user: req.user });
});

app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    logError(`${req.method} ${req.originalUrl} - multer`, err);
    return res.status(400).json({
      message: "Multer error",
      error: err.message,
      field: err.field,
    });
  }

  logError(`${req.method} ${req.originalUrl}`, err);
  return res.status(500).json({
    message: "Server error",
    error: err.message,
  });
});
// app.use("/api/cars", carRoutes);

export default app;