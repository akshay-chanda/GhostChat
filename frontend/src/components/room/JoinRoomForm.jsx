import { useEffect, useState } from 'react';
import {
  useNavigate,
  useSearchParams,
} from 'react-router-dom';
import { joinRoom } from '../../services/roomService';

export default function JoinRoomForm({
  initialRoomId = '',
}) {
  const navigate = useNavigate();
  const [searchParams] =
    useSearchParams();

  const [roomId, setRoomId] =
    useState(initialRoomId);

  const [password, setPassword] =
    useState('');

  const [submitting, setSubmitting] =
    useState(false);

  const [error, setError] =
    useState(null);

  /*
   * Automatically fill Room ID and Password
   * from:
   *
   * - Share Link
   * - Copy Link
   * - QR code
   *
   * Example:
   * /join?room=ABC123&password=hello123
   *
   * IMPORTANT:
   * The URL contains only the room ID and room password.
   * It never contains sessionId or sessionSecret.
   */
  useEffect(() => {
    const roomFromUrl =
      searchParams.get('room');

    const passwordFromUrl =
      searchParams.get('password');

    if (roomFromUrl) {
      setRoomId(
        roomFromUrl
          .trim()
          .toUpperCase()
      );
    }

    if (passwordFromUrl !== null) {
      setPassword(passwordFromUrl);
    }
  }, [searchParams]);

  const handleSubmit = async (e) => {
    e.preventDefault();

    setError(null);
    setSubmitting(true);

    try {
      const normalizedRoomId =
        roomId
          .trim()
          .toUpperCase();

      const session =
        await joinRoom({
          roomId: normalizedRoomId,
          password,
        });

      /*
       * The backend returns the joining participant's
       * private authentication credentials:
       *
       *   sessionId
       *   sessionSecret
       *
       * It also returns the public participantId.
       *
       * These are passed through router state to
       * ChatRoomPage, which persists the session
       * privately in sessionStorage.
       */
      navigate(
        `/room/${session.roomId}`,
        {
          state: {
            password,

            // PRIVATE authentication credentials.
            sessionId:
              session.sessionId,

            sessionSecret:
              session.sessionSecret,

            // PUBLIC participant identity.
            participantId:
              session.participantId,

            anonymousName:
              session.anonymousName,

            isOwner: false,
          },
        }
      );
    } catch (err) {
      const status =
        err?.status;

      if (status === 429) {
        setError(
          'Too many attempts. Wait a moment before trying again.'
        );
      } else if (status === 409) {
        setError(
          'This room is full.'
        );
      } else {
        setError(
          'Room ID or password is incorrect.'
        );
      }
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
        max-w-sm
        min-w-0
      "
    >
      {/* Heading */}

      <div className="text-left">
        <h1
          className="
            text-2xl
            font-semibold
            tracking-tight
            text-[#F8FAFC]
          "
        >
          Join a room
        </h1>

        <p
          className="
            mt-2
            text-sm
            leading-6
            text-[#94A3B8]
          "
        >
          No account required. Your identity stays anonymous.
        </p>
      </div>

      {/* Form fields */}

      <div
        className="
          mt-6
          space-y-5
          sm:mt-8
        "
      >
        {/* Room ID */}

        <div>
          <label
            htmlFor="roomId"
            className="
              mb-1.5
              block
              text-left
              text-sm
              text-[#F8FAFC]
            "
          >
            Room ID
          </label>

          <input
            id="roomId"
            type="text"
            value={roomId}
            onChange={(e) =>
              setRoomId(
                e.target.value.toUpperCase()
              )
            }
            required
            autoComplete="off"
            placeholder="7F3K9A2M"
            className="
              min-h-11
              w-full
              rounded-lg
              border
              border-white/10
              bg-[#111827]
              px-3.5
              py-2.5
              text-base
              text-[#F8FAFC]
              placeholder:text-[#94A3B8]/60
              focus:border-transparent
              focus:outline-none
              focus-visible:ring-2
              focus-visible:ring-[#00D9FF]
              sm:text-sm
            "
          />
        </div>

        {/* Password */}

        <div>
          <label
            htmlFor="joinPassword"
            className="
              mb-1.5
              block
              text-left
              text-sm
              text-[#F8FAFC]
            "
          >
            Password
          </label>

          <input
            id="joinPassword"
            type="password"
            value={password}
            onChange={(e) =>
              setPassword(e.target.value)
            }
            required
            autoComplete="current-password"
            placeholder="••••••••"
            className="
              min-h-11
              w-full
              rounded-lg
              border
              border-white/10
              bg-[#111827]
              px-3.5
              py-2.5
              text-base
              text-[#F8FAFC]
              placeholder:text-[#94A3B8]/60
              focus:border-transparent
              focus:outline-none
              focus-visible:ring-2
              focus-visible:ring-[#00D9FF]
              sm:text-sm
            "
          />
        </div>

        {/* Error */}

        {error && (
          <p
            role="alert"
            className="
              rounded-lg
              border
              border-[#EF4444]/20
              bg-[#EF4444]/5
              px-3
              py-2.5
              text-left
              text-sm
              leading-5
              text-[#EF4444]
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
            flex
            min-h-11
            w-full
            items-center
            justify-center
            rounded-lg
            bg-[#00D9FF]
            px-4
            py-3
            text-sm
            font-medium
            text-[#0B0F14]
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
            ? 'Joining…'
            : 'Join secure room'}
        </button>
      </div>
    </form>
  );
}