const { Server } = require('socket.io');
const socketAuth = require('./socketAuth');
const registerRoomEvents = require('./roomEvents');
const registerMessageEvents = require('./messageEvents');
const registerTypingEvents = require('./typingEvents');
const registerFileEvents = require('./fileEvents');
const roomManager = require('../services/roomManager');
const store = require('../storage/memoryStore');
const { createSystemMessage } = require('../models/Message');
const { corsOptions } = require('../config/security');
const { isRedisEnabled, redisClient } = require('../config/redis');
const logger = require('../utils/logger');

/**
 * Creates and wires the one Socket.IO server for the app. Called
 * once from server.js with the underlying HTTP server. Everything
 * room-specific (auth, presence, events) composes onto each socket
 * here rather than being scattered across app.js.
 */
function initSocketServer(httpServer) {
  const io = new Server(httpServer, {
    cors: corsOptions,
    transports: ['websocket'],
  });

  // Multi-instance scaling: the Redis adapter makes io.to(roomId)
  // broadcasts reach sockets connected to *any* instance, not just
  // the one that received the event. Single-instance deployments
  // (the default) never load this.
  if (isRedisEnabled) {
    const { createAdapter } = require('@socket.io/redis-adapter');
    const subClient = redisClient.duplicate();
    subClient.connect().then(() => {
      io.adapter(createAdapter(redisClient, subClient));
      logger.info('Socket.IO Redis adapter enabled');
    });
  }

  io.use(socketAuth);

  io.on('connection', (socket) => {
    const { roomId, sessionId } = socket.data;
    socket.join(roomId);

    // Initial roster/state snapshot to the connecting socket only —
    // everyone else in the room already has this, they just need
    // the user-joined notice below. Normalized to the same
    // {id, anonymousName, isOwner} shape as room:user-joined/
    // room:user-left below — the frontend keys and filters its
    // participant list by `.id`, so sending the raw store record
    // here (which uses `.sessionId`) would leave anyone from this
    // initial snapshot impossible to ever remove from that list.
    socket.emit('room:joined', {
      room: roomManager.getPublicRoomInfo(roomId),
      participants: store.getParticipants(roomId).map((p) => ({
        id: p.sessionId,
        anonymousName: p.anonymousName,
        isOwner: p.isOwner,
      })),
    });

    socket.to(roomId).emit('room:user-joined', {
      id: sessionId,
      anonymousName: socket.data.anonymousName,
      isOwner: socket.data.isOwner,
    });

    // room:user-joined updates the participant sidebar; this posts
    // the same event into the visible chat as a system message
    // (see SystemMessage.jsx client-side) — the two are separate
    // concerns even though they fire from the same moment.
    const joinNotice = createSystemMessage(`${socket.data.anonymousName} joined the room.`);
    store.addMessage(roomId, joinNotice);
    io.to(roomId).emit('message:new', joinNotice);

    registerRoomEvents(io, socket);
    registerMessageEvents(io, socket);
    registerTypingEvents(io, socket);
    registerFileEvents(io, socket);

    logger.info('Socket connected', { roomId });
  });

  io.engine.on('connection_error', (err) => {
    logger.warn('Socket connection rejected', { message: err.message });
  });

  return io;
}

module.exports = initSocketServer;