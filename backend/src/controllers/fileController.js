const fileStorageService = require('../services/fileStorageService');
const roomManager = require('../services/roomManager');
const { createFileMessage } = require('../models/Message');
const logger = require('../utils/logger');

/**
 * Upload an already-encrypted file.
 *
 * IMPORTANT:
 * The browser encrypts the file before it reaches this controller.
 * The backend only temporarily stores the ciphertext.
 */
async function uploadFile(req, res, next) {
  try {
    const { roomId } = req.params;
    const {
      iv,
      originalName,
      mimeType,
      size,
    } = req.body;

    if (!req.file) {
      return res.status(400).json({
        code: 'generic',
        message: 'No file was uploaded.',
      });
    }

    const room =
      roomManager.getPublicRoomInfo(roomId);

    if (!room) {
      return res.status(404).json({
        code: 'roomNotFound',
        message: 'Room not found.',
      });
    }

    if (!room.fileSharingEnabled) {
      return res.status(403).json({
        code: 'unauthorized',
        message:
          'File sharing is disabled in this room.',
      });
    }

    const fileMeta =
      await fileStorageService.saveEncryptedFile({
        roomId,
        buffer: req.file.buffer,
        iv,
        originalName,
        mimeType,
        declaredSize: Number(size),
        expiresAt: room.expiresAt,
        uploaderSessionId:
          req.session.sessionId,
      });

    const messagePayload =
      createFileMessage({
        senderId:
          req.session.participantId ||
          req.session.sessionId,

        senderName:
          req.session.anonymousName,

        file: {
          id: fileMeta.id,

          originalName:
            fileMeta.originalName,

          size:
            fileMeta.size,

          mimeType:
            fileMeta.mimeType,

          /*
           * Keep the public URL short and room-independent.
           *
           * requireSession resolves the room from the
           * stored file metadata before authenticating it.
           */
          downloadUrl:
            `/api/files/${fileMeta.id}/download`,

          iv:
            fileMeta.iv,

          expiresAt:
            fileMeta.expiresAt,
        },
      });

    /*
     * The HTTP API must still work when the Socket.IO server
     * is not attached to the Express app.
     *
     * This is also important for tests and for any HTTP-only
     * deployment/startup path.
     */
    const io = req.app.get('io');

    if (io) {
      io.to(roomId).emit(
        'message:new',
        messagePayload
      );
    }

    return res.status(201).json(
      messagePayload
    );
  } catch (err) {
    if (
      err.code === 'FILE_TOO_LARGE' ||
      err.code === 'INVALID_FILE_TYPE'
    ) {
      return res.status(413).json({
        code: 'generic',
        message: err.message,
      });
    }

    logger.error(
      'File upload failed',
      {
        code: err.code,
        message: err.message,
      }
    );

    next(err);
  }
}

/**
 * Download the encrypted file bytes.
 *
 * The backend NEVER decrypts the file.
 * The frontend downloads these ciphertext bytes and decrypts
 * them locally using the room encryption key.
 */
async function downloadFile(
  req,
  res,
  next
) {
  try {
    const {
      fileId,
    } = req.params;

    const result =
      await fileStorageService.getFileStream(
        fileId
      );

    if (!result) {
      return res.status(404).json({
        code: 'generic',
        message:
          'File not found or has expired.',
      });
    }

    /*
     * requireSession has already verified that the
     * authenticated session belongs to the same room
     * as this file.
     *
     * Keep this second check as defense in depth.
     */
    if (
      req.session?.roomId &&
      result.meta.roomId !==
        req.session.roomId
    ) {
      return res.status(403).json({
        code: 'unauthorized',
        message:
          'This file does not belong to this room.',
      });
    }

    /*
     * Never trust the client-supplied MIME type when
     * serving encrypted bytes.
     *
     * Always force an attachment containing opaque
     * application/octet-stream data.
     */
    res.setHeader(
      'Content-Type',
      'application/octet-stream'
    );

    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${result.meta.storageFilename}"`
    );

    result.stream.pipe(res);

    return undefined;
  } catch (err) {
    next(err);
  }
}

/**
 * Delete a temporary file.
 *
 * Only:
 * - the uploader, or
 * - the room owner
 *
 * may delete it.
 */
async function deleteFile(
  req,
  res,
  next
) {
  try {
    const deleted =
      await fileStorageService.deleteFile(
        req.params.fileId,
        req.session.sessionId,
        req.session.isOwner
      );

    if (!deleted) {
      return res.status(403).json({
        code: 'unauthorized',
        message:
          'You can’t delete this file.',
      });
    }

    /*
     * HTTP deletion must work even if Socket.IO
     * is not currently attached.
     */
    const io = req.app.get('io');

    if (io) {
      io.to(req.session.roomId).emit(
        'message:delete',
        {
          messageId:
            req.params.fileId,
        }
      );
    }

    return res.status(200).json({
      deleted: true,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  uploadFile,
  downloadFile,
  deleteFile,
};