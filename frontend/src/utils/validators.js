import {
  MIN_PASSWORD_LENGTH,
  MAX_MESSAGE_LENGTH,
  MAX_FILE_SIZE,
  BLOCKED_FILE_EXTENSIONS,
  ROOM_ID_PATTERN,
} from './constants';

// These checks are for immediate UI feedback only. The server is the
// authority on every one of these rules and re-validates independently —
// nothing here should be treated as a security control.

export function isValidRoomId(roomId) {
  return ROOM_ID_PATTERN.test((roomId || '').trim().toUpperCase());
}

export function getPasswordStrength(password) {
  if (!password) return 0;
  let score = 0;
  if (password.length >= MIN_PASSWORD_LENGTH) score++;
  if (password.length >= 12) score++;
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score++;
  if (/\d/.test(password) && /[^A-Za-z0-9]/.test(password)) score++;
  return Math.min(score, 3);
}

export function isValidPassword(password) {
  return Boolean(password) && password.length >= MIN_PASSWORD_LENGTH;
}

export function isValidMessage(content) {
  const trimmed = (content || '').trim();
  return trimmed.length > 0 && trimmed.length <= MAX_MESSAGE_LENGTH;
}

export function getFileValidationError(file) {
  if (!file) return 'No file selected.';
  const ext = `.${file.name.split('.').pop()?.toLowerCase()}`;
  if (BLOCKED_FILE_EXTENSIONS.includes(ext)) {
    return 'This file type isn\u2019t allowed.';
  }
  if (file.size > MAX_FILE_SIZE) {
    return 'File is larger than the 20MB limit.';
  }
  return null;
}
