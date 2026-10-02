const env = require('./env');

const helmetOptions = {
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],

      scriptSrc: ["'self'"],

      styleSrc: ["'self'"],

      imgSrc: ["'self'", 'data:'],

      connectSrc: [
        "'self'",
        env.CORS_ORIGIN,
      ],

      objectSrc: ["'none'"],

      frameAncestors: ["'none'"],
    },
  },

  /**
   * Vercel frontend and Render backend are different origins.
   *
   * Allow resources to be requested across the deployment
   * boundary. Authentication is handled through explicit
   * session headers, not cookies.
   */
  crossOriginResourcePolicy: {
    policy: 'cross-origin',
  },

  referrerPolicy: {
    policy: 'no-referrer',
  },
};

const corsOptions = {
  origin: env.CORS_ORIGIN,

  /*
   * Cookie authentication has been removed.
   *
   * The frontend authenticates using:
   *
   *   X-Session-Id
   *   X-Session-Secret
   *
   * Therefore cross-origin credentials are not required.
   */
  credentials: false,

  methods: [
    'GET',
    'POST',
    'DELETE',
  ],

  allowedHeaders: [
    'Content-Type',
    'X-Session-Id',
    'X-Session-Secret',
  ],
};

// Argon2id password hashing configuration.
const argon2Options = {
  type: 2,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
};

module.exports = {
  helmetOptions,
  corsOptions,
  argon2Options,
};