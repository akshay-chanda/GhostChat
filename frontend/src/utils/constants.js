// Central, canonical values — components built before this file
// (CreateRoomForm, MessageInput, FileUpload, RoomTimer) currently
// hardcode a few of these locally; new code should import from here
// instead of re-declaring them.

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';
export const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || '/';

export const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB
export const MAX_MESSAGE_LENGTH = 5000;
export const MIN_PASSWORD_LENGTH = 8;

export const ROOM_DURATIONS = [
  { value: 300, label: '5 minutes' },
  { value: 600, label: '10 minutes' },
  { value: 1800, label: '30 minutes' },
  { value: 3600, label: '1 hour' },
  { value: 21600, label: '6 hours' },
  { value: 43200, label: '12 hours' },
  { value: 86400, label: '24 hours' },
];

export const PARTICIPANT_LIMITS = [2, 5, 10, 20, 50];
export const DEFAULT_MAX_PARTICIPANTS = 20;
export const HARD_MAX_PARTICIPANTS = 50;

export const TIMER_WARNING_THRESHOLD_SECONDS = 5 * 60;

export const BLOCKED_FILE_EXTENSIONS = ['.exe', '.bat', '.cmd', '.ps1', '.scr', '.js', '.vbs', '.msi', '.jar'];
export const PREVIEWABLE_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

export const ROOM_ID_PATTERN = /^[A-Z0-9]{6,10}$/;

export const TYPING_STOP_DELAY_MS = 2000;
export const RECONNECT_MAX_ATTEMPTS = 6;
export const RECONNECT_BASE_DELAY_MS = 1000;
