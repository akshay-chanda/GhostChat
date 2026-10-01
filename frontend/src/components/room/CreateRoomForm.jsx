import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Dice5 } from 'lucide-react';
import { createRoom } from '../../services/roomService';
import { generateStrongPassword } from '../../utils/idGenerator';

const DURATIONS = [
  { value: 300, label: '5 minutes' },
  { value: 600, label: '10 minutes' },
  { value: 1800, label: '30 minutes' },
  { value: 3600, label: '1 hour' },
  { value: 21600, label: '6 hours' },
  { value: 43200, label: '12 hours' },
  { value: 86400, label: '24 hours' },
];

const PARTICIPANT_LIMITS = [2, 5, 10, 20, 50];

function scorePassword(pw) {
  if (!pw) return 0;

  let score = 0;

  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
  if (/\d/.test(pw) && /[^A-Za-z0-9]/.test(pw)) score++;

  return Math.min(score, 3);
}

const STRENGTH_LABEL = [
  'Too short',
  'Weak',
  'Medium',
  'Strong',
];

const STRENGTH_COLOR = [
  '#EF4444',
  '#EF4444',
  '#F59E0B',
  '#22C55E',
];

/**
 * CreateRoomForm
 *
 * Collects everything needed to spin up a room. Validation is
 * client-side for feedback only — the server re-validates and is
 * the source of truth for what's actually allowed.
 *
 * SECURITY:
 * The backend returns:
 * - sessionId      -> private authentication credential
 * - sessionSecret  -> private authentication credential
 * - participantId  -> public participant identity
 *
 * These values are passed through to the room-created page so the
 * session can be persisted there. They must never be included in
 * public room information or shared with other participants.
 */
export default function CreateRoomForm() {
  const navigate = useNavigate();

  const [roomName, setRoomName] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [duration, setDuration] = useState(1800);
  const [maxParticipants, setMaxParticipants] = useState(10);
  const [allowFiles, setAllowFiles] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const strength = useMemo(
    () => scorePassword(password),
    [password]
  );

  const handleGeneratePassword = () => {
    setPassword(generateStrongPassword());
    setShowPassword(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError(
        'Password must be at least 8 characters.'
      );
      return;
    }

    setSubmitting(true);

    try {
      const room = await createRoom({
        roomName:
          roomName.trim() || undefined,
        password,
        duration,
        maxParticipants,
        allowFiles,
      });

      /**
       * The API response contains the owner's private
       * authentication credentials.
       *
       * Do not log these values or put them into a URL.
       *
       * RoomCreatedPage will persist them in the private
       * session storage entry for this room.
       */
      navigate('/room-created', {
        state: {
          ...room,
          password,
          sessionId: room.sessionId,
          sessionSecret: room.sessionSecret,
          participantId: room.participantId,
        },
      });
    } catch (err) {
      setError(
        err?.message ||
          'Could not create the room. Try again.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="
        mx-auto
        w-full
        max-w-md
        min-w-0
      "
    >
      <h1 className="text-xl xs:text-2xl font-semibold leading-tight text-[#F8FAFC]">
        Create a room
      </h1>

      <p className="mt-1.5 text-sm leading-5 text-[#94A3B8]">
        No account needed. Anyone with the ID and password can join.
      </p>

      <div className="mt-6 xs:mt-8 space-y-5">
        {/* Room name */}
        <div className="min-w-0">
          <label
            htmlFor="roomName"
            className="mb-1.5 block text-sm text-[#F8FAFC]"
          >
            Room name{' '}
            <span className="text-[#94A3B8]">
              (optional)
            </span>
          </label>

          <input
            id="roomName"
            type="text"
            value={roomName}
            onChange={(e) =>
              setRoomName(e.target.value)
            }
            maxLength={40}
            placeholder="e.g. Design sync"
            autoComplete="off"
            className="
              min-h-11 w-full rounded-lg
              border border-white/10
              bg-[#111827]
              px-3.5 py-2.5
              text-base text-[#F8FAFC]
              placeholder:text-[#94A3B8]/60
              transition-colors
              focus:border-transparent
              focus:outline-none
              focus-visible:ring-2
              focus-visible:ring-[#00D9FF]
              sm:text-sm
            "
          />
        </div>

        {/* Password */}
        <div className="min-w-0">
          <label
            htmlFor="roomPassword"
            className="mb-1.5 block text-sm text-[#F8FAFC]"
          >
            Room password
          </label>

          <div className="relative min-w-0">
            <input
              id="roomPassword"
              type={
                showPassword
                  ? 'text'
                  : 'password'
              }
              value={password}
              onChange={(e) =>
                setPassword(e.target.value)
              }
              required
              minLength={8}
              placeholder="At least 8 characters"
              autoComplete="new-password"
              className="
                min-h-11 w-full rounded-lg
                border border-white/10
                bg-[#111827]
                px-3.5 py-2.5
                pr-24
                text-base text-[#F8FAFC]
                placeholder:text-[#94A3B8]/60
                transition-colors
                focus:border-transparent
                focus:outline-none
                focus-visible:ring-2
                focus-visible:ring-[#00D9FF]
                sm:text-sm
              "
            />

            <div className="absolute inset-y-0 right-1 flex items-center gap-0.5">
              <button
                type="button"
                onClick={
                  handleGeneratePassword
                }
                title="Generate a strong password"
                aria-label="Generate a strong password"
                className="
                  flex min-h-10 min-w-10 items-center justify-center
                  rounded-md
                  text-[#94A3B8]
                  transition-colors
                  hover:bg-white/5 hover:text-[#F8FAFC]
                  focus:outline-none
                  focus-visible:ring-2
                  focus-visible:ring-[#00D9FF]
                  touch-manipulation
                "
              >
                <Dice5
                  className="h-4.5 w-4.5"
                  aria-hidden="true"
                />
              </button>

              <button
                type="button"
                onClick={() =>
                  setShowPassword(
                    (v) => !v
                  )
                }
                title={
                  showPassword
                    ? 'Hide password'
                    : 'Show password'
                }
                aria-label={
                  showPassword
                    ? 'Hide password'
                    : 'Show password'
                }
                className="
                  flex min-h-10 min-w-10 items-center justify-center
                  rounded-md
                  text-[#94A3B8]
                  transition-colors
                  hover:bg-white/5 hover:text-[#F8FAFC]
                  focus:outline-none
                  focus-visible:ring-2
                  focus-visible:ring-[#00D9FF]
                  touch-manipulation
                "
              >
                {showPassword ? (
                  <EyeOff
                    className="h-4.5 w-4.5"
                    aria-hidden="true"
                  />
                ) : (
                  <Eye
                    className="h-4.5 w-4.5"
                    aria-hidden="true"
                  />
                )}
              </button>
            </div>
          </div>

          {password.length > 0 && (
            <div className="mt-2 flex min-w-0 items-center gap-2">
              <div
                className="flex min-w-0 flex-1 gap-1"
                aria-hidden="true"
              >
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className="h-1 flex-1 rounded-full transition-colors"
                    style={{
                      backgroundColor:
                        i < strength
                          ? STRENGTH_COLOR[
                              strength
                            ]
                          : 'rgba(255,255,255,0.08)',
                    }}
                  />
                ))}
              </div>

              <span
                className="shrink-0 text-xs"
                style={{
                  color:
                    STRENGTH_COLOR[
                      strength
                    ],
                }}
              >
                {
                  STRENGTH_LABEL[
                    strength
                  ]
                }
              </span>
            </div>
          )}
        </div>

        {/* Duration + participants */}
        <div className="grid grid-cols-1 gap-5 xs:grid-cols-2 xs:gap-3 sm:gap-4">
          <div className="min-w-0">
            <label
              htmlFor="duration"
              className="mb-1.5 block text-sm text-[#F8FAFC]"
            >
              Room duration
            </label>

            <select
              id="duration"
              value={duration}
              onChange={(e) =>
                setDuration(
                  Number(e.target.value)
                )
              }
              className="
                min-h-11 w-full min-w-0 rounded-lg
                border border-white/10
                bg-[#111827]
                px-3.5 py-2.5
                text-base text-[#F8FAFC]
                focus:outline-none
                focus-visible:ring-2
                focus-visible:ring-[#00D9FF]
                sm:text-sm
              "
            >
              {DURATIONS.map((d) => (
                <option
                  key={d.value}
                  value={d.value}
                >
                  {d.label}
                </option>
              ))}
            </select>
          </div>

          <div className="min-w-0">
            <label
              htmlFor="maxParticipants"
              className="mb-1.5 block text-sm text-[#F8FAFC]"
            >
              Max participants
            </label>

            <select
              id="maxParticipants"
              value={maxParticipants}
              onChange={(e) =>
                setMaxParticipants(
                  Number(e.target.value)
                )
              }
              className="
                min-h-11 w-full min-w-0 rounded-lg
                border border-white/10
                bg-[#111827]
                px-3.5 py-2.5
                text-base text-[#F8FAFC]
                focus:outline-none
                focus-visible:ring-2
                focus-visible:ring-[#00D9FF]
                sm:text-sm
              "
            >
              {PARTICIPANT_LIMITS.map(
                (n) => (
                  <option
                    key={n}
                    value={n}
                  >
                    {n}
                  </option>
                )
              )}
            </select>
          </div>
        </div>

        {/* File sharing toggle */}
        <label
          className="
            flex min-h-11 cursor-pointer items-center gap-3
            rounded-lg
            text-sm text-[#F8FAFC]
            touch-manipulation
          "
        >
          <input
            type="checkbox"
            checked={allowFiles}
            onChange={(e) =>
              setAllowFiles(
                e.target.checked
              )
            }
            className="
              h-5 w-5 shrink-0
              rounded
              border-white/20
              bg-[#111827]
              text-[#00D9FF]
              focus:ring-2
              focus:ring-[#00D9FF]
              focus:ring-offset-0
            "
          />

          <span>
            Allow file sharing
          </span>
        </label>

        {/* Error */}
        {error && (
          <p
            role="alert"
            className="
              rounded-lg border border-[#EF4444]/20
              bg-[#EF4444]/5
              px-3 py-2.5
              text-sm leading-5 text-[#EF4444]
            "
          >
            {error}
          </p>
        )}

        {/* Submit */}
        <button
          type="submit"
          disabled={submitting}
          className="
            flex min-h-11 w-full items-center justify-center
            rounded-lg
            bg-[#00D9FF]
            px-4 py-3
            text-sm font-medium text-[#0B0F14]
            transition-colors
            hover:bg-[#5CE7FF]
            focus:outline-none
            focus-visible:ring-2
            focus-visible:ring-[#00D9FF]
            focus-visible:ring-offset-2
            focus-visible:ring-offset-[#0B0F14]
            disabled:cursor-not-allowed
            disabled:opacity-60
            touch-manipulation
          "
        >
          {submitting
            ? 'Creating room…'
            : 'Create secure room'}
        </button>
      </div>
    </form>
  );
}