const { z } = require('zod');
const { MAX_FILE_SIZE } = require('../utils/constants');

/**
 * Validates only the non-file form fields multer parses onto
 * req.body (iv, originalName, mimeType, size arrive as strings —
 * multipart/form-data has no native number type). The actual file
 * bytes are re-validated separately in fileStorageService, which
 * checks the real buffer length against MAX_FILE_SIZE rather than
 * trusting this declared `size` field at all — this schema exists
 * to reject malformed metadata early, not to establish trust in it.
 */
const fileMetadataSchema = z.object({
  iv: z.string().min(1).max(64),
  originalName: z.string().min(1).max(255),
  mimeType: z.string().min(1).max(128),
  size: z
    .string()
    .regex(/^\d+$/, 'Size must be a number.')
    .refine((v) => Number(v) <= MAX_FILE_SIZE, 'File exceeds the size limit.'),
});

module.exports = { fileMetadataSchema };
