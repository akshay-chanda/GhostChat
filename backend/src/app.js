const express = require('express');

const cookieParser = require('cookie-parser');

const applySecurity = require('./middleware/security');

const errorHandler = require('./middleware/errorHandler');

const roomRoutes = require('./routes/roomRoutes');

const fileRoutes = require('./routes/fileRoutes');

const env = require('./config/env');

const app = express();

applySecurity(app); // helmet + CORS — see middleware/security.js

app.use(cookieParser(env.SESSION_SECRET)); // signed cookies for the session id (see middleware/auth.js)

app.use(express.json({ limit: '256kb' })); // generous for JSON bodies; file bytes never go through this parser

app.get('/health', (req, res) => res.status(200).json({ status: 'ok' }));

app.use('/api/rooms', roomRoutes);

app.use('/api', fileRoutes); // fileRoutes declares its own '/rooms/:roomId/files' and '/files/...' paths

// Unmatched API routes get a clean 404 instead of falling through to

// Express's default HTML error page, which would leak stack info in

// some configurations.

app.use('/api', (req, res) => {

  res.status(404).json({ code: 'generic', message: 'Not found.' });

});

// Must be last — Express only treats a 4-arg middleware as an error

// handler, and only if it's registered after everything else.

app.use(errorHandler);

module.exports = app;