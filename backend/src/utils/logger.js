// A thin console wrapper, not a full logging library.
// This project doesn't need log shipping/rotation.
// It needs a single choke point that makes it structurally
// difficult to accidentally log passwords, message content,
// or encryption keys.

const FORBIDDEN_KEY_PATTERNS = [
  /pass(word)?/i,
  /cipher.*text/i,
  /^iv$/i,
  /content/i,
  /room.*key/i,
  /encryption.*key/i,
  /plain.*text/i,
];

function isForbiddenKey(key) {
  if (typeof key !== 'string') {
    return false;
  }

  return FORBIDDEN_KEY_PATTERNS.some(
    (pattern) =>
      pattern.test(key)
  );
}

function redact(meta) {
  if (!meta || typeof meta !== 'object') {
    return meta;
  }

  /*
   * Handle arrays recursively so sensitive values
   * cannot appear inside nested structures.
   */
  if (Array.isArray(meta)) {
    return meta.map((value) =>
      redact(value)
    );
  }

  const clean = {};

  for (const [key, value] of Object.entries(meta)) {
    if (isForbiddenKey(key)) {
      clean[key] = '[redacted]';
      continue;
    }

    if (
      value &&
      typeof value === 'object'
    ) {
      clean[key] = redact(value);
      continue;
    }

    clean[key] = value;
  }

  return clean;
}

function normalizeMeta(meta) {
  if (!meta) {
    return undefined;
  }

  /*
   * Error objects need special handling because their useful
   * properties are non-enumerable and therefore disappear when
   * using Object.entries().
   */
  if (meta instanceof Error) {
    return {
      name: meta.name,
      message: meta.message,
      stack: meta.stack,
      code: meta.code,
    };
  }

  return redact(meta);
}

function log(
  level,
  message,
  meta
) {
  const normalizedMeta =
    normalizeMeta(meta);

  const entry = {
    level,
    message,
    ...(normalizedMeta !== undefined
      ? {
          meta: normalizedMeta,
        }
      : {}),
    timestamp:
      new Date().toISOString(),
  };

  const line =
    JSON.stringify(entry);

  if (level === 'error') {
    console.error(line);
  } else if (level === 'warn') {
    console.warn(line);
  } else {
    console.log(line);
  }
}

module.exports = {
  info: (message, meta) =>
    log(
      'info',
      message,
      meta
    ),

  warn: (message, meta) =>
    log(
      'warn',
      message,
      meta
    ),

  error: (message, meta) =>
    log(
      'error',
      message,
      meta
    ),
};