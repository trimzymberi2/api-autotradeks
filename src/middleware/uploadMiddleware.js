import multer from "multer";
import sharp from "sharp";
import path from "path";
import fs from "fs";
import { logError } from "../utils/logError.js";

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/");
  },
  filename: (req, file, cb) => {
    const uniqueName = Date.now() + "-" + Math.random().toString(36).substring(7);
    cb(null, uniqueName + ".webp");
  },
});

const upload = multer({ 
  storage,
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|webp|gif/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    if (extname && mimetype) {
      cb(null, true);
    } else {
      cb(new Error("Only images are allowed"));
    }
  },
});

// Process uploaded files to WebP
export const processToWebP = async (req, res, next) => {
  if (!req.files || req.files.length === 0) {
    return next();
  }

  try {
    const processedFiles = await Promise.all(
      req.files.map(async (file) => {
        // Read the original file into buffer
        const inputBuffer = fs.readFileSync(file.path);
        
        // Auto-orient phone photos from EXIF metadata before converting to WebP.
        const webpBuffer = await sharp(inputBuffer)
          .rotate()
          .webp({ quality: 80 })
          .toBuffer();

        // Write to a new file with .webp extension
        const webpFilename = Date.now() + "-" + Math.random().toString(36).substring(7) + ".webp";
        const outputPath = path.join("uploads/", webpFilename);
        
        fs.writeFileSync(outputPath, webpBuffer);

        // Delete original file
        fs.unlinkSync(file.path);

        return {
          ...file,
          path: outputPath,
          filename: webpFilename,
        };
      })
    );

    req.files = processedFiles;
    next();
  } catch (error) {
    logError("uploadMiddleware processToWebP", error);
    next(error);
  }
};

export default upload;