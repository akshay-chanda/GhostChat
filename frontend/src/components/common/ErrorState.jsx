import { AlertTriangle, Clock, Lock, Users, Ban } from 'lucide-react';

// Maps the app's known error codes to an icon + default copy, so
// callers can pass just a `code` for the common cases (Room Not
// Found, Room Expired, etc. from the spec's error catalogue) and
// override title/description only when they need something specific.
const PRESETS = {
  roomNotFound: { Icon: AlertTriangle, title: 'Room not found', description: 'Check the room ID and try again.' },
  incorrectCredentials: { Icon: Lock, title: 'Incorrect room ID or password', description: 'Double-check both and try again.' },
  roomExpired: { Icon: Clock, title: 'Room expired', description: 'All temporary room data has been destroyed.' },
  roomFull: { Icon: Users, title: 'Room is full', description: 'This room has reached its participant limit.' },
  roomLocked: { Icon: Lock, title: 'Room is locked', description: 'The room owner has disabled new participants.' },
  tooManyRequests: { Icon: Ban, title: 'Too many attempts', description: 'Wait a moment before trying again.' },
  connectionLost: { Icon: AlertTriangle, title: 'Unable to reconnect', description: 'Your session may have expired.' },
  unauthorized: { Icon: Lock, title: 'Unauthorized', description: 'You don\u2019t have permission to do that.' },
  generic: { Icon: AlertTriangle, title: 'Something went wrong', description: 'Please try again.' },
};

/**
 * ErrorState
 *
 * Deliberately never surfaces raw server error text — only the
 * mapped preset or an explicit override — so internal error detail
 * can't leak to the client (per the "don't expose internal errors"
 * requirement).
 */
export default function ErrorState({ code = 'generic', title, description, actionLabel, onAction }) {
  const preset = PRESETS[code] || PRESETS.generic;
  const Icon = preset.Icon;

  return (
    <div className="flex flex-col items-center justify-center text-center py-16 px-4">
      <div className="flex items-center justify-center h-12 w-12 rounded-full bg-[#EF4444]/10">
        <Icon className="h-5 w-5 text-[#EF4444]" aria-hidden="true" />
      </div>
      <h2 className="mt-4 text-base font-medium text-[#F8FAFC]">{title || preset.title}</h2>
      <p className="mt-1.5 text-sm text-[#94A3B8] max-w-xs">{description || preset.description}</p>

      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="mt-6 text-sm font-medium bg-[#00D9FF] text-[#0B0F14] px-4 py-2 rounded-lg hover:bg-[#5CE7FF] transition-colors"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}
