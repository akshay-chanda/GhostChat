const http = require('http');

const app = require('./src/app');
const initSocketServer = require('./src/sockets');
const env = require('./src/config/env');
const logger = require('./src/utils/logger');

const httpServer = http.createServer(app);

/**
 * Socket.IO initialization is asynchronous because the Redis
 * adapter must connect and be attached before the server starts
 * accepting traffic.
 */
let io = null;

/**
 * Controllers reach the socket server through req.app.get('io') to
 * broadcast HTTP-triggered events (file uploads, owner lock/destroy
 * actions) into the room — this is the one place that wiring happens.
 */
async function startServer() {
  try {
    io = await initSocketServer(
      httpServer
    );

    app.set('io', io);

    httpServer.listen(
      env.PORT,
      () => {
        logger.info(
          `GhostChat server listening on port ${env.PORT}`,
          {
            env: env.NODE_ENV,
          }
        );
      }
    );
  } catch (err) {
    logger.error(
      'Failed to initialize GhostChat server',
      {
        message: err?.message,
      }
    );

    process.exit(1);
  }
}

/**
 * Graceful shutdown: stop accepting new connections,
 * let in-flight requests finish, then exit.
 *
 * Room state itself is in-memory and is intentionally
 * lost on shutdown — that's consistent with the
 * "zero intentional persistent chat storage" design.
 */
function shutdown(signal) {
  logger.info(
    `Received ${signal}, shutting down`
  );

  if (io) {
    io.close();
  }

  httpServer.close(() => {
    logger.info(
      'Server closed'
    );

    process.exit(0);
  });

  // Don't hang forever if a connection refuses to close.
  setTimeout(
    () => process.exit(1),
    10_000
  ).unref();
}

process.on(
  'SIGTERM',
  () => shutdown('SIGTERM')
);

process.on(
  'SIGINT',
  () => shutdown('SIGINT')
);

process.on(
  'unhandledRejection',
  (err) => {
    logger.error(
      'Unhandled promise rejection',
      {
        message: err?.message,
      }
    );
  }
);

startServer();