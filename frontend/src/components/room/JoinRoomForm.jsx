import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { joinRoom } from '../../services/roomService';

/**
 * JoinRoomForm
 *
 * Supports normal manual joining and invitation links.
 *
 * Invitation URL format:
 *
 *   /join?room=ROOM_ID&password=PASSWORD
 *
 * When a user opens a Share Link or scans the QR code,
 * the Room ID and Password are automatically filled.
 *
 * The user can still edit both fields manually.
 */
export default function JoinRoomForm({
  initialRoomId = '',
}) {
  const navigate = useNavigate();

  const [searchParams] = useSearchParams();

  const [roomId, setRoomId] =
    useState(initialRoomId);

  const [password, setPassword] =
    useState('');

  const [submitting, setSubmitting] =
    useState(false);

  const [error, setError] =
    useState(null);

  /*
   * Read invitation information from the URL.
   *
   * Example:
   *
   * /join?room=ABC123&password=hello123
   */
  useEffect(() => {
    const roomFromUrl =
      searchParams.get('room');

    const passwordFromUrl =
      searchParams.get('password');

    /*
     * Automatically fill Room ID.
     */
    if (roomFromUrl) {
      setRoomId(
        roomFromUrl.trim().toUpperCase()
      );
    }

    /*
     * Automatically fill Password.
     *
     * Do NOT trim the password because spaces
     * could technically be part of a password.
     */
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
        roomId.trim().toUpperCase();

      const session = await joinRoom({
        roomId: normalizedRoomId,
        password,
      });

      navigate(`/room/${session.roomId}`, {
        state: {
          password,
          sessionId: session.sessionId,
          anonymousName:
            session.anonymousName,
          isOwner: false,
        },
      });
    } catch (err) {
      const status = err?.status;

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
      <h1
        className="
          text-xl
          xs:text-2xl
          font-semibold
          leading-tight
          text-[#F8FAFC]
        "
      >
        Join a room
      </h1>

      <p
        className="
          mt-1.5
          text-sm
          leading-5
          text-[#94A3B8]
        "
      >
        No account required. Your identity stays anonymous.
      </p>

      <div
        className="
          mt-6
          xs:mt-8
          space-y-5
        "
      >
        {/* Room ID */}

        <div className="min-w-0">
          <label
            htmlFor="roomId"
            className="
              mb-1.5
              block
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
              setRoomId(e.target.value)
            }
            required
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck="false"
            placeholder="7F3K9A2M"
            className="
              min-h-11
              w-full
              min-w-0
              rounded-lg
              border border-white/10
              bg-[#111827]
              px-3.5
              py-2.5
              text-base
              font-mono
              tracking-wider
              text-[#F8FAFC]
              placeholder:font-mono
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
            htmlFor="joinPassword"
            className="
              mb-1.5
              block
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
              min-w-0
              rounded-lg
              border border-white/10
              bg-[#111827]
              px-3.5
              py-2.5
              text-base
              text-[#F8FAFC]
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

        {/* Error */}

        {error && (
          <p
            role="alert"
            className="
              rounded-lg
              border border-[#EF4444]/20
              bg-[#EF4444]/5
              px-3
              py-2.5
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