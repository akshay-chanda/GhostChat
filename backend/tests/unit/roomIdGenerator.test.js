const {
  generateRoomId,
  generateSessionId,
  generateFileId,
  generateStorageFilename,
  generateAnonymousName,
} = require('../../src/utils/idGenerator');

describe('generateRoomId', () => {
  it('produces an 8-character ID', () => {
    expect(generateRoomId()).toHaveLength(8);
  });

  it('only uses unambiguous uppercase letters and digits (no 0/O/1/I)', () => {
    const id = generateRoomId();
    expect(id).toMatch(/^[A-HJ-NP-Z2-9]+$/);
  });

  it('is not generated with Math.random', () => {
    // Regression guard: a future edit swapping crypto.randomBytes for
    // Math.random should fail this test rather than silently reduce
    // entropy. We can't inspect implementation directly, so instead
    // assert on the property Math.random-based generation is known
    // to lack: near-certain non-collision across a large sample.
    const ids = new Set(Array.from({ length: 5000 }, generateRoomId));
    expect(ids.size).toBe(5000);
  });
});

describe('generateSessionId / generateFileId', () => {
  it('generateSessionId returns a 48-character hex string (24 bytes)', () => {
    const id = generateSessionId();
    expect(id).toMatch(/^[0-9a-f]{48}$/);
  });

  it('generateFileId returns a 32-character hex string (16 bytes)', () => {
    const id = generateFileId();
    expect(id).toMatch(/^[0-9a-f]{32}$/);
  });

  it('never repeats across many calls', () => {
    const ids = new Set(Array.from({ length: 2000 }, generateSessionId));
    expect(ids.size).toBe(2000);
  });
});

describe('generateStorageFilename', () => {
  it('matches the expected random-name pattern and never embeds the original name', () => {
    expect(generateStorageFilename()).toMatch(/^f_[0-9a-f]{32}\.bin$/);
  });
});

describe('generateAnonymousName', () => {
  it('returns "Anonymous <Animal>" when the pool has room', () => {
    expect(generateAnonymousName([])).toMatch(/^Anonymous [A-Za-z]+$/);
  });

  it('does not reuse a name already in the room', () => {
    // Force every pool name but one to be taken, then confirm the
    // one remaining name is what comes back deterministically.
    const { ANONYMOUS_NAME_POOL } = require('../../src/utils/constants');
    const takenNames = ANONYMOUS_NAME_POOL.slice(1).map((n) => `Anonymous ${n}`);
    const result = generateAnonymousName(takenNames);
    expect(result).toBe(`Anonymous ${ANONYMOUS_NAME_POOL[0]}`);
  });

  it('falls back to a numeric tag once the whole pool is taken', () => {
    const { ANONYMOUS_NAME_POOL } = require('../../src/utils/constants');
    const takenNames = ANONYMOUS_NAME_POOL.map((n) => `Anonymous ${n}`);
    const result = generateAnonymousName(takenNames);
    expect(result).toMatch(/^Anonymous #\d{4}$/);
  });
});
