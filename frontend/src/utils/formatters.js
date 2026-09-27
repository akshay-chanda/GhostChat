// Display formatting only — never used for anything security-relevant
// (durations here are for the countdown UI, not the server's actual
// expiration enforcement).

export function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatClockTime(timestamp) {
  return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function formatCountdown(totalSeconds) {
  const clamped = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(clamped / 3600);
  const m = Math.floor((clamped % 3600) / 60);
  const s = clamped % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

export function truncate(text, maxLength = 200) {
  if (!text || text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1)}\u2026`;
}
