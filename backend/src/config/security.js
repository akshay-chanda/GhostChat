const env = require('./env');

const helmetOptions = {
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'"],
      imgSrc: ["'self'", 'data:'],
      connectSrc: ["'self'", env.CORS_ORIGIN],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
    },
  },
  crossOriginResourcePolicy: { policy: 'same-site' },
  referrerPolicy: { policy: 'no-referrer' },
};

const corsOptions = {
  origin: env.CORS_ORIGIN,
  credentials: true,
  methods: ['GET', 'POST', 'DELETE'],
};

// Deliberately above the library's defaults — Argon2id's cost
// parameters are the actual defense against offline brute-forcing a
// stolen password hash, so this isn't a place to accept "good enough."
const argon2Options = {
  type: 2, // argon2id
  memoryCost: 19456, // ~19MB, OWASP-recommended minimum for argon2id
  timeCost: 2,
  parallelism: 1,
};

module.exports = { helmetOptions, corsOptions, argon2Options };
