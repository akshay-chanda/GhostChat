const store = require('../storage/memoryStore');
const roomManager = require('../services/roomManager');
const { messageSendSchema, messageDeleteSchema } = require('../validators/messageSchemas');
const { createTextMessage } = require('../models/Message');
const { RATE_LIMITS } = require('../utils/constants');

function emitError(socket, message) {
  socket.emit('connection:error', { message });
}

// A minimal per-socket sliding-window counter for message flooding.
// Full HTTP-side rate limiting lives in middleware/rateLimiter.js;
// this is the WebSocket-side equivalent since express-rate-limit
// doesn't apply to socket events at all.
const messageTimestamps = new Map(); // sessionId -> number[]

function isRateLimited(sessionId) {
  const now = Date.now();
  const { windowMs, max } = RATE_LIMITS.messagesPerWindow;
  const timestamps = (messageTimestamps.get(sessionId) || []).filter((t) => now - t < windowMs);
  timestamps.push(now);
  messageTimestamps.set(sessionId, timestamps);
  return timestamps.length > max;
}

/**
 * The server never decrypts a text message — ciphertext and iv pass
 * through exactly as received. This is the concrete implementation
 * of "the server should not need access to plaintext message
 * content" from the spec's encryption model.
 */
function registerMessageEvents(io, socket) {
  const { roomId, sessionId, anonymousName } = socket.data;

  socket.on('message:send', (payload) => {
    try {
      if (isRateLimited(sessionId)) {
        return emitError(socket, 'You\u2019re sending messages too quickly.');
      }

      const result = messageSendSchema.safeParse(payload);
      if (!result.success) {
        return emitError(socket, 'Malformed message.');
      }
      const { clientId, ciphertext, iv, replyToMessageId } = result.data;

      const message = createTextMessage({
        clientId,
        senderId: sessionId,
        senderName: anonymousName,
        ciphertext,
        iv,
        replyToMessageId,
      });

      store.addMessage(roomId, message);
      io.to(roomId).emit('message:new', message);
    } catch {
      emitError(socket, 'Could not send that message.');
    }
  });

  socket.on('message:delete', (payload) => {
    const result = messageDeleteSchema.safeParse(payload);
    if (!result.success) return;
    const { messageId } = result.data;

    const message = store.getMessage(roomId, messageId);
    if (!message) return;
    if (message.senderId !== sessionId && !roomManager.isOwner(roomId, sessionId)) {
      return emitError(socket, 'You can\u2019t delete this message.');
    }
    store.removeMessage(roomId, messageId);
    io.to(roomId).emit('message:delete', { messageId });
  });

  socket.on('message:clear', () => {
    try {
      if (!roomManager.isOwner(roomId, sessionId)) throw new Error('Only the room owner can clear messages.');
      store.clearMessages(roomId);
      io.to(roomId).emit('message:cleared');
    } catch (err) {
      emitError(socket, err.message);
    }
  });

  socket.on('disconnect', () => {
    messageTimestamps.delete(sessionId);
  });
}

module.exports = registerMessageEvents;
