const express = require('express');

const applySecurity = require('./middleware/security');

const errorHandler = require('./middleware/errorHandler');

const roomRoutes = require('./routes/roomRoutes');

const fileRoutes = require('./routes/fileRoutes');

const app = express();

applySecurity(app); // helmet + CORS

app.use(
  express.json({
    limit: '256kb',
  })
); // File bytes never go through this parser.

app.get(
  '/health',
  (req, res) =>
    res.status(200).json({
      status: 'ok',
    })
);

app.use(
  '/api/rooms',
  roomRoutes
);

app.use(
  '/api',
  fileRoutes
); // fileRoutes declares its own room/file paths.

/*
 * Unmatched API routes get a clean JSON 404
 * instead of Express's default HTML response.
 */
app.use(
  '/api',
  (req, res) => {
    res.status(404).json({
      code: 'generic',
      message: 'Not found.',
    });
  }
);

/*
 * Must be last.
 */
app.use(errorHandler);

module.exports = app;