const fileStorageService = require('../services/fileStorageService');
const store = require('../storage/memoryStore');
const { createFileMessage } = require('../models/Message');
const logger = require('../utils/logger');

/**
 * Upload an already-encrypted file.
 *
 * The frontend encrypts the file before sending it.
 * The backend stores only the encrypted bytes.
 */
async function uploadFile(req, res) {
  try {
    const { roomId } = req.params;

    if (!req.session) {
      return res.status(401).json({
        error: 'Authentication required.',
      });
    }

    const {
      originalName,
      mimeType,
      size,
      iv,
    } = req.body;

    const encryptedFile = req.file;

    if (!encryptedFile || !encryptedFile.buffer) {
      return res.status(400).json({
        error: 'Encrypted file data is required.',
      });
    }

    if (!originalName) {
      return res.status(400).json({
        error: 'Original file name is required.',
      });
    }

    if (!iv) {
      return res.status(400).json({
        error: 'Encryption IV is required.',
      });
    }

    if (!roomId) {
      return res.status(400).json({
        error: 'Room ID is required.',
      });
    }

    /*
     * Make sure the authenticated session belongs to this room.
     */
    if (req.session.roomId !== roomId) {
      return res.status(403).json({
        error: 'You are not a member of this room.',
      });
    }

    /*
     * Use memoryStore directly.
     *
     * roomManager does not expose getRoom().
     */
    const room = store.getRoom(roomId);

    if (!room) {
      return res.status(404).json({
        error: 'Room not found.',
      });
    }

    /*
     * Store only encrypted bytes.
     */
    const fileMeta =
      await fileStorageService.saveEncryptedFile({
        roomId,
        buffer: encryptedFile.buffer,
        originalName,
        mimeType,
        declaredSize: size,
        iv,
        uploaderSessionId: req.session.sessionId,
      });

    /*
     * Use participantId as the public sender identifier.
     *
     * The private sessionId is never exposed in the message payload.
     */
    const senderId =
      req.session.participantId ||
      req.session.sessionId;

    const senderName =
      req.session.anonymousName ||
      'Anonymous';

    const messagePayload =
      createFileMessage({
        senderId,
        senderName,
        file: {
          id: fileMeta.id,
          originalName:
            fileMeta.originalName,
          size: fileMeta.size,
          mimeType:
            fileMeta.mimeType,
          downloadUrl:
            `/api/files/${fileMeta.id}/download`,
          iv: fileMeta.iv,
          expiresAt:
            fileMeta.expiresAt,
        },
      });

    /*
     * IMPORTANT:
     * Store the message before broadcasting it.
     *
     * The Socket.IO message:delete handler uses memoryStore
     * to locate the message and determine whether the sender
     * is allowed to delete it.
     */
    store.addMessage(
      roomId,
      messagePayload
    );

    const io =
      req.app.get('io');

    if (io) {
      io.to(roomId).emit(
        'message:new',
        messagePayload
      );
    }

    logger.info(
      `File uploaded successfully: ${fileMeta.id} in room ${roomId}`
    );

    return res.status(201).json({
      success: true,
      message: messagePayload,
    });
  } catch (error) {
    logger.error(
      'File upload failed:',
      error
    );

    return res.status(500).json({
      error:
        error.message ||
        'File upload failed.',
    });
  }
}

/**
 * Download an encrypted file.
 *
 * The server never decrypts the file.
 * The frontend downloads the encrypted bytes
 * and decrypts them locally.
 */
async function downloadFile(req, res) {
  try {
    const { fileId } =
      req.params;

    if (!fileId) {
      return res.status(400).json({
        error: 'File ID is required.',
      });
    }

    if (!req.session) {
      return res.status(401).json({
        error: 'Authentication required.',
      });
    }

    const fileMeta =
      store.getFile(fileId);

    if (!fileMeta) {
      return res.status(404).json({
        error: 'File not found.',
      });
    }

    /*
     * Make sure the file belongs to the
     * authenticated room.
     */
    if (
      fileMeta.roomId !==
      req.session.roomId
    ) {
      return res.status(403).json({
        error:
          'You do not have access to this file.',
      });
    }

    /*
     * getFileStream also handles expiry
     * and removes expired files.
     */
    const fileStreamResult =
      await fileStorageService.getFileStream(
        fileId
      );

    if (!fileStreamResult) {
      return res.status(404).json({
        error:
          'File not found or expired.',
      });
    }

    /*
     * fileStorageService returns:
     *
     * {
     *   stream,
     *   meta
     * }
     *
     * Normalize it here so the rest of
     * this controller uses "file".
     */
    const stream =
      fileStreamResult.stream;

    const file =
      fileStreamResult.meta;

    if (!stream || !file) {
      return res.status(404).json({
        error:
          'File data is unavailable.',
      });
    }

    /*
     * Always return encrypted bytes.
     *
     * The frontend performs decryption.
     */
    res.setHeader(
      'Content-Type',
      'application/octet-stream'
    );

    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(
        file.originalName ||
          'download'
      )}"`
    );

    if (file.size != null) {
      res.setHeader(
        'Content-Length',
        String(file.size)
      );
    }

    stream.on(
      'error',
      (error) => {
        logger.error(
          `File download stream failed for ${fileId}:`,
          error
        );

        if (!res.headersSent) {
          res.status(500).json({
            error:
              'File download failed.',
          });
        } else {
          res.destroy(error);
        }
      }
    );

    stream.pipe(res);
  } catch (error) {
    logger.error(
      'File download failed:',
      error
    );

    if (!res.headersSent) {
      return res.status(500).json({
        error:
          error.message ||
          'File download failed.',
      });
    }

    res.destroy(error);
  }
}

/**
 * Delete a file and its associated chat message.
 *
 * This is important for both normal files
 * and voice messages, because voice messages
 * use the same file-message architecture.
 */
async function deleteFile(req, res) {
  try {
    const { fileId } =
      req.params;

    if (!fileId) {
      return res.status(400).json({
        error: 'File ID is required.',
      });
    }

    if (!req.session) {
      return res.status(401).json({
        error: 'Authentication required.',
      });
    }

    const roomId =
      req.session.roomId;

    if (!roomId) {
      return res.status(400).json({
        error:
          'Session is not associated with a room.',
      });
    }

    /*
     * Find the associated message before deleting anything.
     *
     * File-message IDs are intentionally
     * the same as file IDs.
     */
    const message =
      store.getMessage(
        roomId,
        fileId
      );

    if (
      message &&
      (
        message.type !== 'file' ||
        !message.file ||
        message.file.id !== fileId
      )
    ) {
      return res.status(409).json({
        error:
          'The file is not associated with a valid file message.',
      });
    }

    /*
     * Delete the encrypted bytes and
     * file metadata.
     *
     * fileStorageService performs
     * uploader/owner authorization.
     */
    const deleted =
      await fileStorageService.deleteFile(
        fileId,
        req.session.sessionId,
        Boolean(
          req.session.isOwner
        )
      );

    if (!deleted) {
      return res.status(404).json({
        error:
          'File not found or you are not allowed to delete it.',
      });
    }

    /*
     * Remove the associated chat message
     * from memoryStore as well.
     *
     * Without this, the UI disappears temporarily
     * because of message:delete, but the old message
     * can come back after reconnect/history loading.
     */
    if (message) {
      const removedMessage =
        store.removeMessage(
          roomId,
          message.id
        );

      if (!removedMessage) {
        logger.warn(
          `File ${fileId} was deleted but its message ${message.id} could not be removed from room ${roomId}.`
        );
      }
    }

    /*
     * Notify every connected participant
     * so the message disappears from everyone's
     * chat immediately.
     *
     * The file message ID equals the file ID.
     */
    const io =
      req.app.get('io');

    if (io) {
      io.to(roomId).emit(
        'message:delete',
        {
          messageId: fileId,
        }
      );
    }

    logger.info(
      `File deleted successfully: ${fileId} from room ${roomId}`
    );

    return res.json({
      success: true,
      messageId: fileId,
    });
  } catch (error) {
    logger.error(
      'File deletion failed:',
      error
    );

    return res.status(500).json({
      error:
        error.message ||
        'File deletion failed.',
    });
  }
}

module.exports = {
  uploadFile,
  downloadFile,
  deleteFile,
};