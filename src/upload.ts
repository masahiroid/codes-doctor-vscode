import express, { Router } from 'express';
import multer, { StorageEngine } from 'multer';
import path from 'node:path';
import { v4 as uuidv4 } from 'uuid';
import { getConfig } from './config';
import { extractZip } from './zipExtractor';
import { cleanupDir } from './fileWalker';
import fs from 'node:fs';

const router = Router();

// Create storage configuration
function createStorage(): StorageEngine {
  const config = getConfig();
  return multer.diskStorage({
    destination: (req, file, cb) => {
      const uploadDir = config.paths.uploads;
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }
      cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
      const analysisId = uuidv4();
      req.body.analysisId = analysisId; // Store for later use
      cb(null, `${analysisId}.zip`);
    },
  });
}

// Create upload middleware
const upload = multer({
  storage: createStorage(),
  fileFilter: (req, file, cb) => {
    // Only accept .zip files
    if (file.originalname.endsWith('.zip') && file.mimetype === 'application/zip') {
      cb(null, true);
    } else {
      cb(new Error('Only .zip files are allowed'));
    }
  },
  limits: {
    fileSize: getConfig().limits.maxFileSize,
  },
});

/**
 * POST /api/upload - Handle ZIP file upload
 * Query params: ?language=typescript|javascript|php|dart|python (default: auto)
 */
router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file uploaded' });
    }

    const analysisId = req.body.analysisId;
    const language = (req.query.language as string) || 'auto';
    const config = getConfig();
    const zipPath = req.file.path;
    const extractedPath = path.join(config.paths.temp, analysisId);

    console.log(
      `[UPLOAD] File: ${req.file.originalname} (Analysis ID: ${analysisId}, Language: ${language})`
    );

    // Extract ZIP
    try {
      await extractZip(zipPath, extractedPath);
      console.log(`[OK] Extracted to: ${extractedPath}`);
    } catch (error) {
      console.error(`[ERROR] Extraction failed:`, error);
      await cleanupDir(extractedPath);
      try {
        fs.unlinkSync(zipPath); // Delete ZIP
      } catch (e) {
        console.warn('Failed to delete ZIP file:', e);
      }
      return res.status(500).json({ success: false, error: 'Failed to extract ZIP' });
    }

    // Delete original ZIP after extraction
    try {
      fs.unlinkSync(zipPath);
    } catch (error) {
      console.warn(`Warning: Failed to delete ZIP file:`, error);
    }

    // Return response
    return res.json({
      success: true,
      analysisId,
      extractedPath,
      language, // Pass language to client
    });
  } catch (error) {
    console.error('[ERROR] Upload error:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Upload failed',
    });
  }
});

/**
 * Multer error handling middleware
 */
router.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction): void => {
  if (err instanceof multer.MulterError) {
    console.error('[ERROR] Multer error:', err.code, err.message);
    
    if (err.code === 'LIMIT_FILE_SIZE') {
      const maxSize = getConfig().limits.maxFileSize;
      res.status(413).json({
        success: false,
        error: `File too large. Maximum file size: ${Math.round(maxSize / 1024 / 1024)}MB`,
      });
      return;
    } else if (err.code === 'LIMIT_FILE_COUNT') {
      res.status(400).json({
        success: false,
        error: 'Too many files. Upload one file at a time.',
      });
      return;
    } else {
      res.status(400).json({
        success: false,
        error: `Upload error: ${err.message}`,
      });
      return;
    }
  }
  
  if (err instanceof Error) {
    console.error('[ERROR] Upload middleware error:', err.message);
    res.status(400).json({
      success: false,
      error: err.message,
    });
    return;
  }
  
  next(err);
});

export default router;
