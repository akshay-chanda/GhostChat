const fileStorageService = require('../services/fileStorageService');
const roomManager = require('../services/roomManager');
const { createFileMessage } = require('../models/Message');
const logger = require('../utils/logger');

/**
 * Every field here — size, mimeType, extension — is re-validated
 * inside fileStorageService regardless of what multer or the client
 * form fields claim. req.file.buffer is ciphertext; this controller
 * never sees or logs plaintext file content.
 */
async function uploadFile(req, res, next) {
  try {
    const { roomId } = req.params;
    const { iv, originalName, mimeType, size } = req.body;

    if (!req.file) {
      return res.status(400).json({
        code: 'generic',
        message: 'No file was uploaded.',
      });
    }

    const room = roomManager.getPublicRoomInfo(roomId);

    if (!room) {
      return res.status(404).json({
        code: 'roomNotFound',
        message: 'Room not found.',
      });
    }

    if (!room.fileSharingEnabled) {
      return res.status(403).json({
        code: 'unauthorized',
        message: 'File sharing is disabled in this room.',
      });
    }

    const fileMeta = await fileStorageService.saveEncryptedFile({
      roomId,
      buffer: req.file.buffer,
      iv,
      originalName,
      mimeType,
      declaredSize: Number(size),
      expiresAt: room.expiresAt,
      uploaderSessionId: req.session.sessionId,
    });

    const messagePayload = createFileMessage({
      senderId: req.session.sessionId,
      senderName: req.session.anonymousName,
      file: {
        id: fileMeta.id,
        originalName: fileMeta.originalName,
        size: fileMeta.size,
        mimeType: fileMeta.mimeType,

        // IMPORTANT:
        // The download route now contains roomId because
        // requireSession needs it to validate the session.
        downloadUrl: `/api/rooms/${roomId}/files/${fileMeta.id}/download`,

        iv: fileMeta.iv,
        expiresAt: fileMeta.expiresAt,
      },
    });

    // Broadcast through the same message channel the chat window
    // already listens on (message:new) rather than a separate file
    // event, so a shared file simply appears as another message —
    // including for the uploader, instead of being handled twice.
    req.app.get('io').to(roomId).emit('message:new', messagePayload);

    res.status(201).json(messagePayload);
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

    logger.error('File upload failed', {
      code: err.code,
    });

    next(err);
  }
}

async function downloadFile(req, res, next) {
  try {
    const { roomId, fileId } = req.params;

    const result = await fileStorageService.getFileStream(fileId);

    if (!result) {
      return res.status(404).json({
        code: 'generic',
        message: 'File not found or has expired.',
      });
    }

    // Make sure the file actually belongs to the room whose session
    // was authenticated by requireSession.
    if (result.meta.roomId && result.meta.roomId !== roomId) {
      return res.status(403).json({
        code: 'unauthorized',
        message: 'This file does not belong to this room.',
      });
    }

    res.setHeader(
      'Content-Type',
      'application/octet-stream'
    );

    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${result.meta.storageFilename}"`
    );

    result.stream.pipe(res);
  } catch (err) {
    next(err);
  }
}

async function deleteFile(req, res, next) {
  try {
    const deleted = await fileStorageService.deleteFile(
      req.params.fileId,
      req.session.sessionId,
      req.session.isOwner
    );

    if (!deleted) {
      return res.status(403).json({
        code: 'unauthorized',
        message: 'You can’t delete this file.',
      });
    }

    req.app
      .get('io')
      .to(req.session.roomId)
      .emit('message:delete', {
        messageId: req.params.fileId,
      });

    res.status(200).json({
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