const express = require('express');
const multer = require('multer');

const fileController = require('../controllers/fileController');
const { requireSession } = require('../middleware/auth');
const { validateBody } = require('../middleware/validateRequest');
const { filesPerWindowLimiter } = require('../middleware/rateLimiter');
const { fileMetadataSchema } = require('../validators/fileSchemas');
const env = require('../config/env');

const router = express.Router();

// Memory storage, not disk — the file is ciphertext by the time it
// gets here (encrypted client-side before upload), so buffering it
// briefly in memory before fileStorageService writes it to disk
// under a random name is fine even at the 20MB ceiling. multer's own
// limit is set slightly above the app's stated max so our own
// size check in fileStorageService is what actually reports the
// friendly "too large" error, not a raw multer rejection.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.MAX_FILE_SIZE + 1024 },
});

router.post(
  '/rooms/:roomId/files',
  requireSession,
  filesPerWindowLimiter,
  upload.single('file'),
  validateBody(fileMetadataSchema),
  fileController.uploadFile
);

// IMPORTANT:
// requireSession needs :roomId in order to validate the
// X-Session-Id against the correct room.
router.get(
  '/rooms/:roomId/files/:fileId/download',
  requireSession,
  fileController.downloadFile
);

router.delete(
  '/files/:fileId',
  requireSession,
  fileController.deleteFile
);

module.exports = router;