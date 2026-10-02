import { useEffect, useState } from 'react';
import {
  useNavigate,
  useSearchParams,
} from 'react-router-dom';
import { joinRoom } from '../../services/roomService';

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ||
  '/api';

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

  const [loadingInvite, setLoadingInvite] =
    useState(false);

  const [error, setError] =
    useState(null);

  /*
   * Resolve a temporary invite token.
   *
   * New secure share links look like:
   *
   *   /join?invite=TEMPORARY_TOKEN
   *
   * The password is NOT stored in the URL.
   *
   * The backend resolves the temporary token and
   * returns the Room ID and password over HTTPS.
   */
  useEffect(() => {
    const inviteToken =
      searchParams.get('invite');

    /*
     * Backward compatibility:
     *
     * If there is no invite token, we still allow
     * normal manual Room ID/password entry.
     *
     * We intentionally do NOT support reading a
     * password from the URL anymore.
     */
    if (!inviteToken) {
      const roomFromUrl =
        searchParams.get('room');

      if (roomFromUrl) {
        setRoomId(
          roomFromUrl
            .trim()
            .toUpperCase()
        );
      }

      return;
    }

    let cancelled = false;

    const resolveInvite = async () => {
      setLoadingInvite(true);
      setError(null);

      try {
        const response = await fetch(
          `${API_BASE_URL}/rooms/invite/${encodeURIComponent(
            inviteToken
          )}`,
          {
            method: 'GET',
            credentials: 'include',
            headers: {
              Accept: 'application/json',
            },
          }
        );

        let data = null;

        try {
          data = await response.json();
        } catch {
          data = null;
        }

        if (!response.ok) {
          throw new Error(
            data?.message ||
              'This invite link is invalid or has expired.'
          );
        }

        if (
          !data?.roomId ||
          typeof data.password !== 'string'
        ) {
          throw new Error(
            'The invite link returned invalid room information.'
          );
        }

        if (cancelled) {
          return;
        }

        setRoomId(
          data.roomId
            .trim()
            .toUpperCase()
        );

        setPassword(data.password);
      } catch (err) {
        if (cancelled) {
          return;
        }

        setError(
          err?.message ||
            'This invite link is invalid or has expired.'
        );
      } finally {
        if (!cancelled) {
          setLoadingInvite(false);
        }
      }
    };

    resolveInvite();

    return () => {
      cancelled = true;
    };
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
      } else if (status === 403) {
        setError(
          'This room is currently locked.'
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

  const inviteLoading =
    loadingInvite;

  const disableForm =
    submitting ||
    loadingInvite;

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

      {/* Invite loading */}

      {inviteLoading && (
        <div
          className="
            mt-5
            rounded-lg
            border
            border-[#00D9FF]/20
            bg-[#00D9FF]/5
            px-3
            py-2.5
            text-left
            text-sm
            leading-5
            text-[#00D9FF]
          "
        >
          Loading secure invite…
        </div>
      )}

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
            disabled={disableForm}
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
              disabled:cursor-not-allowed
              disabled:opacity-60
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
            disabled={disableForm}
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
              disabled:cursor-not-allowed
              disabled:opacity-60
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
          disabled={disableForm}
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
          {loadingInvite
            ? 'Loading invite…'
            : submitting
              ? 'Joining…'
              : 'Join secure room'}
        </button>
      </div>
    </form>
  );
}