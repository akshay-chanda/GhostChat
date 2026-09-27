jest.mock('fs/promises', () => ({
  mkdir: jest.fn().mockResolvedValue(undefined),
  writeFile: jest.fn().mockResolvedValue(undefined),
  access: jest.fn().mockResolvedValue(undefined),
  unlink: jest.fn().mockResolvedValue(undefined),
}));

const fsPromises = require('fs/promises');
const { saveEncryptedFile } = require('../../src/services/fileStorageService');

const baseArgs = {
  roomId: 'ROOM1234',
  buffer: Buffer.from('encrypted-bytes-not-real-plaintext'),
  iv: 'base64iv==',
  originalName: 'notes.txt',
  mimeType: 'text/plain',
  declaredSize: Buffer.from('encrypted-bytes-not-real-plaintext').length,
  expiresAt: new Date(Date.now() + 60_000).toISOString(),
  uploaderSessionId: 'session-abc',
};

describe('fileStorageService server-side validation', () => {
  beforeEach(() => jest.clearAllMocks());

  it('accepts a well-formed file within the size limit', async () => {
    const record = await saveEncryptedFile(baseArgs);
    expect(record.originalName).toBe('notes.txt');
    expect(fsPromises.writeFile).toHaveBeenCalledTimes(1);
  });

  it('rejects a buffer larger than the 20MB limit, regardless of declaredSize', async () => {
    const oversized = Buffer.alloc(20 * 1024 * 1024 + 1);
    await expect(
      saveEncryptedFile({ ...baseArgs, buffer: oversized, declaredSize: oversized.length })
    ).rejects.toMatchObject({ code: 'FILE_TOO_LARGE' });
  });

  it('rejects when declaredSize disagrees with the real buffer length', async () => {
    await expect(
      saveEncryptedFile({ ...baseArgs, declaredSize: baseArgs.buffer.length + 100_000 })
    ).rejects.toMatchObject({ code: 'INVALID_FILE_TYPE' });
  });

  it('rejects a blocked executable extension even with a benign mimeType', async () => {
    await expect(
      saveEncryptedFile({ ...baseArgs, originalName: 'installer.exe', mimeType: 'text/plain' })
    ).rejects.toMatchObject({ code: 'INVALID_FILE_TYPE' });
  });

  it('rejects an extension outside the allow-list even if not explicitly blocked', async () => {
    await expect(
      saveEncryptedFile({ ...baseArgs, originalName: 'archive.tar.gz' })
    ).rejects.toMatchObject({ code: 'INVALID_FILE_TYPE' });
  });

  it('never trusts the client mimeType alone to decide validity', async () => {
    // A blocked extension disguised with an allowed-looking mimeType
    // must still be rejected — the decision is extension-based, not
    // mimeType-based, since mimeType is entirely client-supplied.
    await expect(
      saveEncryptedFile({ ...baseArgs, originalName: 'payload.js', mimeType: 'image/png' })
    ).rejects.toMatchObject({ code: 'INVALID_FILE_TYPE' });
  });

  it('never writes the file to disk under its original name', async () => {
    await saveEncryptedFile(baseArgs);
    const [writtenPath] = fsPromises.writeFile.mock.calls[0];
    expect(writtenPath).not.toContain('notes.txt');
    expect(writtenPath).toMatch(/f_[0-9a-f]{32}\.bin$/);
  });

  it('sanitizes a path-traversal attempt in the original filename', async () => {
    const record = await saveEncryptedFile({ ...baseArgs, originalName: '../../secrets/passwd.txt' });
    expect(record.originalName).not.toContain('..');
    expect(record.originalName).not.toContain('/');
    expect(record.originalName).toBe('passwd.txt');
  });
});
