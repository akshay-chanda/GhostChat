const fileStorageService = require('../services/fileStorageService');

function emitError(socket, message) {
  socket.emit('connection:error', { message });
}

/**
 * Upload itself deliberately goes through HTTP + multer instead of
 * a socket event (see routes/fileRoutes.js) — that's the only way to
 * get real upload-progress callbacks on the client, which fetch/
 * socket.io can't provide. file:shared is broadcast directly from
 * fileController once the HTTP upload completes, reusing the
 * message:new channel. This file only handles delete, so a client
 * has a real-time option that doesn't require a second HTTP round
 * trip if it already has the socket open.
 */
function registerFileEvents(io, socket) {
  const { roomId, sessionId, isOwner } = socket.data;

  socket.on('file:delete', async ({ fileId } = {}) => {
    try {
      const deleted = await fileStorageService.deleteFile(fileId, sessionId, isOwner);
      if (!deleted) return emitError(socket, 'You can\u2019t delete this file.');
      io.to(roomId).emit('message:delete', { messageId: fileId });
    } catch {
      emitError(socket, 'Could not delete that file.');
    }
  });
}

module.exports = registerFileEvents;
