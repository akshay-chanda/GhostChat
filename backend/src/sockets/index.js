const { Server } = require('socket.io');

const socketAuth = require('./socketAuth');
const registerRoomEvents = require('./roomEvents');
const registerMessageEvents = require('./messageEvents');
const registerTypingEvents = require('./typingEvents');
const registerFileEvents = require('./fileEvents');

const roomManager = require('../services/roomManager');
const store = require('../storage/memoryStore');

const { corsOptions } = require('../config/security');
const { isRedisEnabled, redisClient } = require('../config/redis');
const logger = require('../utils/logger');

/**
 * Creates and wires the one Socket.IO server for the app.
 *
 * Room presence events are handled by roomEvents.js.
 * This file is responsible only for:
 *
 * - creating the Socket.IO server
 * - authenticating sockets
 * - joining the Socket.IO room
 * - sending the initial room snapshot
 * - registering socket event handlers
 */
function initSocketServer(httpServer) {
  const io = new Server(httpServer, {
    cors: corsOptions,
    transports: ['websocket'],
  });

  // Multi-instance scaling.
  if (isRedisEnabled) {
    const { createAdapter } = require('@socket.io/redis-adapter');

    const subClient = redisClient.duplicate();

    subClient.connect().then(() => {
      io.adapter(createAdapter(redisClient, subClient));

      logger.info('Socket.IO Redis adapter enabled');
    });
  }

  // Authenticate every socket before connection.
  io.use(socketAuth);

  io.on('connection', (socket) => {
    const { roomId, sessionId } = socket.data;

    /*
     * Join the Socket.IO room.
     *
     * This does NOT announce a new participant.
     * Presence announcements are handled by roomEvents.js.
     */
    socket.join(roomId);

    /*
     * Send the current room state ONLY to the newly connected socket.
     *
     * The participant list is normalized to:
     *
     * {
     *   id,
     *   anonymousName,
     *   isOwner
     * }
     *
     * because the frontend uses `id` to track participants.
     */
    socket.emit('room:joined', {
      room: roomManager.getPublicRoomInfo(roomId),

      participants: store.getParticipants(roomId).map((participant) => ({
        id: participant.sessionId,
        anonymousName: participant.anonymousName,
        isOwner: participant.isOwner,
      })),
    });

    /*
     * IMPORTANT:
     *
     * Do NOT emit room:user-joined here.
     * Do NOT create the "joined the room" system message here.
     *
     * roomEvents.js is responsible for presence events.
     */

    // Register room lifecycle / presence events.
    registerRoomEvents(io, socket);

    // Register chat messages.
    registerMessageEvents(io, socket);

    // Register typing indicators.
    registerTypingEvents(io, socket);

    // Register file events.
    registerFileEvents(io, socket);

    logger.info('Socket connected', {
      roomId,
      sessionId,
    });
  });

  io.engine.on('connection_error', (err) => {
    logger.warn('Socket connection rejected', {
      message: err.message,
    });
  });

  return io;
}

module.exports = initSocketServer;