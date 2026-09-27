/**
 * Broadcast-only, no stored state — "who's typing" is inherently
 * transient, so there's nothing here for memoryStore to hold. Uses
 * socket.to() (excludes the sender) since a client never needs to
 * see its own typing indicator echoed back.
 */
function registerTypingEvents(io, socket) {
  const { roomId, sessionId, anonymousName } = socket.data;

  socket.on('typing:start', () => {
    socket.to(roomId).emit('typing:start', { id: sessionId, anonymousName });
  });

  socket.on('typing:stop', () => {
    socket.to(roomId).emit('typing:stop', { id: sessionId });
  });

  socket.on('disconnect', () => {
    socket.to(roomId).emit('typing:stop', { id: sessionId });
  });
}

module.exports = registerTypingEvents;
