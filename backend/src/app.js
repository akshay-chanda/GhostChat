const express = require('express');
const cookieParser = require('cookie-parser');

const applySecurity = require('./middleware/security');
const errorHandler = require('./middleware/errorHandler');

const roomRoutes = require('./routes/roomRoutes');
const fileRoutes = require('./routes/fileRoutes');

const env = require('./config/env');

const app = express();

/*
 * GhostChat is deployed behind Render's reverse proxy.
 *
 * Trust the first proxy so Express can correctly determine
 * the original client IP. This is important for rate limiting
 * and other security middleware in production.
 */
if (env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

/*
 * Security middleware:
 * - Helmet
 * - CORS
 */
applySecurity(app);

/*
 * Signed cookies are used for the GhostChat session.
 */
app.use(cookieParser(env.SESSION_SECRET));

/*
 * JSON request body parser.
 *
 * File bytes are handled separately by the file upload routes.
 */
app.use(
  express.json({
    limit: '256kb',
  })
);

/*
 * Health check.
 */
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
  });
});

/*
 * Room routes.
 *
 * Includes:
 * POST /api/rooms
 * POST /api/rooms/join
 * GET  /api/rooms/:roomId
 * etc.
 */
app.use('/api/rooms', roomRoutes);

/*
 * File routes.
 *
 * fileRoutes defines its own:
 * /rooms/:roomId/files
 * /files/...
 */
app.use('/api', fileRoutes);

/*
 * Clean JSON response for unknown API routes.
 */
app.use('/api', (req, res) => {
  res.status(404).json({
    code: 'generic',
    message: 'Not found.',
  });
});

/*
 * Global error handler.
 *
 * This must always be the final middleware.
 */
app.use(errorHandler);

module.exports = app;