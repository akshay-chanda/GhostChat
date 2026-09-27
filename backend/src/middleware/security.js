const helmet = require('helmet');
const cors = require('cors');
const { helmetOptions, corsOptions } = require('../config/security');

/**
 * One function called once from app.js, rather than scattering
 * app.use(helmet(...)) calls across the entry file — keeps every
 * security header/CORS decision traceable back to config/security.js.
 */
function applySecurity(app) {
  app.use(helmet(helmetOptions));
  app.use(cors(corsOptions));
  app.disable('x-powered-by');
}

module.exports = applySecurity;
