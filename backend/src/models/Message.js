const crypto = require('crypto');

/**
 * Three message shapes share one `type` discriminant so the client's
 * message list can render them polymorphically (see the frontend's
 * ChatWindow, which branches on msg.type).
 *
 * SECURITY:
 * For text and file messages, senderId is the PUBLIC participantId.
 * The PRIVATE sessionId must never be passed into these message
 * factories.
 *
 * The server only ever holds ciphertext for 'text' messages — it has
 * no way to produce message content itself, only metadata around it.
 */

function createTextMessage({
  clientId,
  senderId,
  senderName,
  ciphertext,
  iv,
  replyToMessageId,
}) {
  return {
    id: crypto.randomUUID(),
    clientId,
    type: 'text',

    // PUBLIC participant identifier.
    // Never pass a private sessionId here.
    senderId,

    senderName,
    ciphertext,
    iv,
    replyToMessageId,
    timestamp: new Date().toISOString(),
  };
}

/**
 * System messages (joins, leaves, lock/unlock notices) carry plain
 * text — there's nothing to encrypt, since they never contain
 * anything a participant typed.
 */
function createSystemMessage(content) {
  return {
    id: crypto.randomUUID(),
    type: 'system',
    content,
    timestamp: new Date().toISOString(),
  };
}

function createFileMessage({
  senderId,
  senderName,
  file,
}) {
  return {
    id: file.id,
    type: 'file',

    // PUBLIC participant identifier.
    // Never pass a private sessionId here.
    senderId,

    senderName,
    file,
    timestamp: new Date().toISOString(),
  };
}

module.exports = {
  createTextMessage,
  createSystemMessage,
  createFileMessage,
};