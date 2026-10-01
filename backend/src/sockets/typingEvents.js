/**
 * Broadcast-only, no stored state — "who's typing" is inherently
 * transient, so there's nothing here for memoryStore to hold.
 *
 * SECURITY:
 * - sessionId is PRIVATE and must never be broadcast.
 * - participantId is PUBLIC and is safe to send to other users.
 *
 * Uses socket.to() (excludes the sender) since a client never needs
 * to see its own typing indicator echoed back.
 */
function registerTypingEvents(io, socket) {
  const {
    roomId,
    participantId,
    anonymousName,
  } = socket.data;

  socket.on('typing:start', () => {
    socket.to(roomId).emit(
      'typing:start',
      {
        id: participantId,
        anonymousName,
      }
    );
  });

  socket.on('typing:stop', () => {
    socket.to(roomId).emit(
      'typing:stop',
      {
        id: participantId,
      }
    );
  });

  socket.on('disconnect', () => {
    socket.to(roomId).emit(
      'typing:stop',
      {
        id: participantId,
      }
    );
  });
}

module.exports = registerTypingEvents;