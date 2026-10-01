const express = require('express');
const multer = require('multer');

const fileController =
  require('../controllers/fileController');

const {
  requireSession,
} = require('../middleware/auth');

const {
  validateBody,
} = require('../middleware/validateRequest');

const {
  filesPerWindowLimiter,
} = require('../middleware/rateLimiter');

const {
  fileMetadataSchema,
} = require('../validators/fileSchemas');

const env =
  require('../config/env');

const router =
  express.Router();

/*
 * Keep uploaded ciphertext in memory temporarily.
 *
 * It is written to the temporary storage directory by
 * fileStorageService using a server-generated random filename.
 */
const upload = multer({
  storage:
    multer.memoryStorage(),

  limits: {
    fileSize:
      env.MAX_FILE_SIZE,
  },
});

/**
 * Convert Multer's raw size-limit error into the same
 * 413 response used by fileStorageService.
 */
function uploadSingleFile(
  req,
  res,
  next
) {
  upload.single('file')(
    req,
    res,
    (error) => {
      if (
        error?.code ===
        'LIMIT_FILE_SIZE'
      ) {
        return res.status(413).json({
          code: 'generic',
          message:
            'File is larger than the 20MB limit.',
        });
      }

      if (error) {
        return next(error);
      }

      next();
    }
  );
}

/*
 * Upload encrypted file.
 */
router.post(
  '/rooms/:roomId/files',
  requireSession,
  filesPerWindowLimiter,
  uploadSingleFile,
  validateBody(
    fileMetadataSchema
  ),
  fileController.uploadFile
);

/*
 * Primary download route.
 *
 * The room is resolved from the stored file metadata
 * by requireSession.
 */
router.get(
  '/files/:fileId/download',
  requireSession,
  fileController.downloadFile
);

/*
 * Backwards-compatible room-scoped download route.
 *
 * Keeping this route is harmless and allows older frontend
 * messages/URLs to continue working.
 */
router.get(
  '/rooms/:roomId/files/:fileId/download',
  requireSession,
  fileController.downloadFile
);

/*
 * Delete a temporary file.
 */
router.delete(
  '/files/:fileId',
  requireSession,
  fileController.deleteFile
);

module.exports = router;