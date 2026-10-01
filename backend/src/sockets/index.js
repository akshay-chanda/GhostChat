const { Server } = require('socket.io');

const socketAuth = require('./socketAuth');
const registerRoomEvents = require('./roomEvents');
const registerMessageEvents = require('./messageEvents');
const registerTypingEvents = require('./typingEvents');
const registerFileEvents = require('./fileEvents');

const roomManager = require('../services/roomManager');
const store = require('../storage/memoryStore');
const {
  createSystemMessage,
} = require('../models/Message');

const {
  corsOptions,
} = require('../config/security');

const {
  isRedisEnabled,
  redisClient,
  redisReady,
} = require('../config/redis');

const logger = require('../utils/logger');

/**
 * Creates and wires the one Socket.IO server for the app.
 *
 * IMPORTANT:
 *
 * A Socket.IO reconnect creates a new socket connection,
 * but it does NOT create a new participant.
 *
 * Therefore a reconnect must not generate another:
 *
 * - room:user-joined event
 * - "joined the room" system message
 *
 * The participant already exists in the room.
 */
async function initSocketServer(httpServer) {
  const io = new Server(httpServer, {
    cors: corsOptions,

    // Keep WebSocket-only behavior for the deployed application.
    transports: ['websocket'],
  });

  /**
   * Multi-instance scaling with Redis.
   *
   * Socket.IO's Redis adapter uses Redis Pub/Sub to forward
   * broadcasts between different Socket.IO server instances.
   */
  if (isRedisEnabled) {
    let subClient = null;

    try {
      const {
        createAdapter,
      } = require('@socket.io/redis-adapter');

      /*
       * redis.js starts the main Redis connection.
       *
       * Wait for that existing connection instead of calling
       * redisClient.connect() a second time.
       */
      await redisReady;

      /*
       * The subscriber must use a separate Redis connection.
       */
      subClient = redisClient.duplicate();

      await subClient.connect();

      io.adapter(
        createAdapter(
          redisClient,
          subClient
        )
      );

      logger.info(
        'Socket.IO Redis adapter enabled'
      );
    } catch (err) {
      if (subClient) {
        try {
          await subClient.quit();
        } catch {
          // Ignore subscriber cleanup errors.
        }
      }

      logger.error(
        'Failed to initialize Socket.IO Redis adapter',
        {
          message: err?.message,
        }
      );

      /*
       * Do not silently start without Redis when Redis has
       * explicitly been configured.
       *
       * Starting without the adapter could make the application
       * appear healthy while broadcasts remain isolated to
       * individual server instances.
       */
      throw err;
    }
  } else {
    logger.info(
      'Socket.IO Redis adapter disabled; using in-memory adapter'
    );
  }

  io.use(socketAuth);

  io.on('connection', (socket) => {
    const {
      roomId,
    } = socket.data;

    /*
     * Check whether this participant already has an active
     * socket connection in this room.
     *
     * A reconnect creates a new Socket.IO socket, but the
     * participantId remains the same.
     */
    const existingSocket = Array
      .from(
        io.sockets.sockets.values()
      )
      .find(
        (connectedSocket) =>
          connectedSocket.id !== socket.id &&
          connectedSocket.data?.roomId === roomId &&
          connectedSocket.data?.participantId ===
            socket.data.participantId
      );

    socket.join(roomId);

    /*
     * IMPORTANT SECURITY RULE:
     *
     * sessionId is PRIVATE.
     * It must never be sent to the frontend or another participant.
     *
     * participantId is PUBLIC.
     * It is safe to use for participant-facing events.
     */

    const participants = store
      .getParticipants(roomId)
      .map((participant) => ({
        id:
          participant.participantId,

        anonymousName:
          participant.anonymousName,

        isOwner:
          participant.isOwner,
      }));

    /*
     * Send the current room state only to the
     * connecting socket.
     *
     * This happens for both:
     *
     * - first connection
     * - reconnect/reload
     */
    socket.emit('room:joined', {
      room:
        roomManager.getPublicRoomInfo(
          roomId
        ),

      participants,
    });

    /*
     * Register all room/socket events before creating
     * any reconnect-sensitive event handling.
     *
     * roomEvents.js immediately cancels the pending
     * disconnect timer for this participant.
     *
     * This is important during a browser reload:
     *
     * old socket disconnects
     *       ↓
     * 5-second reconnect grace period starts
     *       ↓
     * browser creates new socket
     *       ↓
     * pending disconnect is cancelled
     *       ↓
     * same participant continues
     */
    registerRoomEvents(
      io,
      socket
    );

    registerMessageEvents(
      io,
      socket
    );

    registerTypingEvents(
      io,
      socket
    );

    registerFileEvents(
      io,
      socket
    );

    /*
     * ONLY a genuinely new socket connection without
     * another active socket for the same participant
     * should generate the visible join notification.
     *
     * If another socket with the same participantId
     * is already connected, this is a duplicate/reconnect
     * connection and must not create another join message.
     *
     * The reconnect grace period in roomEvents.js handles
     * the more common browser-reload case where the old
     * socket has already disconnected before the new socket
     * connects.
     */
    if (!existingSocket) {
      socket
        .to(roomId)
        .emit('room:user-joined', {
          id:
            socket.data.participantId,

          anonymousName:
            socket.data.anonymousName,

          isOwner:
            socket.data.isOwner,
        });

      /*
       * Add visible system message only for an actual
       * participant connection.
       */
      const joinNotice =
        createSystemMessage(
          `${socket.data.anonymousName} joined the room.`
        );

      store.addMessage(
        roomId,
        joinNotice
      );

      io.to(roomId).emit(
        'message:new',
        joinNotice
      );
    }

    logger.info(
      'Socket connected',
      {
        roomId,
        participantId:
          socket.data.participantId,
        reconnect:
          Boolean(existingSocket),
      }
    );
  });

  io.engine.on(
    'connection_error',
    (err) => {
      logger.warn(
        'Socket connection rejected',
        {
          message:
            err.message,
        }
      );
    }
  );

  return io;
}

module.exports =
  initSocketServer;