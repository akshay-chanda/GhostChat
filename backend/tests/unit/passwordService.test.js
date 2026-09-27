const { hashPassword, verifyPassword } = require('../../src/services/passwordService');

describe('passwordService', () => {
  it('hashPassword never returns the plaintext password itself', async () => {
    const hash = await hashPassword('correct-horse-battery-staple');
    expect(hash).not.toContain('correct-horse-battery-staple');
  });

  it('hashPassword produces an Argon2id hash (identifiable by its prefix)', async () => {
    const hash = await hashPassword('correct-horse-battery-staple');
    expect(hash.startsWith('$argon2id$')).toBe(true);
  });

  it('hashing the same password twice produces different hashes (random salt per hash)', async () => {
    const hash1 = await hashPassword('same-password');
    const hash2 = await hashPassword('same-password');
    expect(hash1).not.toBe(hash2);
  });

  it('verifyPassword returns true for the correct password', async () => {
    const hash = await hashPassword('my-room-password');
    await expect(verifyPassword('my-room-password', hash)).resolves.toBe(true);
  });

  it('verifyPassword returns false for an incorrect password', async () => {
    const hash = await hashPassword('my-room-password');
    await expect(verifyPassword('wrong-password', hash)).resolves.toBe(false);
  });

  it('verifyPassword fails closed on a malformed hash rather than throwing', async () => {
    await expect(verifyPassword('anything', 'not-a-real-hash')).resolves.toBe(false);
  });
});
