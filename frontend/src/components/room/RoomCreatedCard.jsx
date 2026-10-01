import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Copy, Check, QrCode } from 'lucide-react';

/**
 * RoomCreatedCard
 *
 * Shown immediately after room creation.
 *
 * The share URL contains:
 *
 *   /join?room=ROOM_ID&password=PASSWORD
 *
 * This allows the Join Room page to automatically
 * fill in the Room ID and Password.
 *
 * IMPORTANT:
 * The private session credentials are NEVER included
 * in the share URL or QR code.
 *
 * Private:
 *   sessionId
 *   sessionSecret
 *
 * Public:
 *   participantId
 */
export default function RoomCreatedCard({
  roomId,
  password,
  shareLink,
  sessionId,
  sessionSecret,
  participantId,
  anonymousName,
  isOwner,
  onShowQr,
}) {
  const navigate = useNavigate();

  const [revealPassword, setRevealPassword] =
    useState(false);

  const [copiedField, setCopiedField] =
    useState(null);

  /*
   * Generate the frontend join URL.
   *
   * IMPORTANT:
   * We do NOT use the backend shareLink when roomId exists.
   *
   * The URL contains:
   *
   *   room     = Room ID
   *   password = Room password
   *
   * It MUST NOT contain:
   *
   *   sessionId
   *   sessionSecret
   *   participantId
   */
  const frontendShareLink = useMemo(() => {
    if (
      typeof window === 'undefined' ||
      !roomId
    ) {
      return '';
    }

    const params = new URLSearchParams();

    params.set(
      'room',
      roomId.trim().toUpperCase()
    );

    if (
      password !== undefined &&
      password !== null
    ) {
      params.set('password', password);
    }

    return `${window.location.origin}/join?${params.toString()}`;
  }, [roomId, password]);

  /*
   * Copy text to clipboard.
   *
   * Uses the modern Clipboard API first.
   *
   * Falls back to a temporary textarea if
   * clipboard access is unavailable.
   */
  const handleCopy = async (
    field,
    value
  ) => {
    if (!value) return;

    try {
      if (
        navigator.clipboard &&
        window.isSecureContext
      ) {
        await navigator.clipboard.writeText(value);
      } else {
        const textarea =
          document.createElement('textarea');

        textarea.value = value;

        textarea.style.position = 'fixed';
        textarea.style.left = '-9999px';
        textarea.style.top = '0';

        document.body.appendChild(textarea);

        textarea.focus();
        textarea.select();

        const successful =
          document.execCommand('copy');

        document.body.removeChild(textarea);

        if (!successful) {
          throw new Error(
            'Clipboard copy failed'
          );
        }
      }

      setCopiedField(field);

      setTimeout(() => {
        setCopiedField((current) =>
          current === field
            ? null
            : current
        );
      }, 1800);
    } catch (error) {
      console.error(
        'Copy failed:',
        error
      );
    }
  };

  const rows = [
    {
      key: 'roomId',
      label: 'Room ID',
      value: roomId,
      mono: true,
    },
    {
      key: 'password',
      label: 'Password',
      value: revealPassword
        ? password
        : '•'.repeat(password?.length || 8),
      mono: true,
    },
    {
      key: 'link',
      label: 'Share link',
      value: frontendShareLink,
      mono: false,
    },
  ];

  return (
    <div
      className="
        mx-auto
        w-full
        max-w-md
        min-w-0
        rounded-xl
        xs:rounded-2xl
        border border-white/10
        bg-[#111827]
        p-4
        xs:p-5
        sm:p-7
      "
    >
      <h1
        className="
          text-xl
          font-semibold
          leading-tight
          text-[#F8FAFC]
        "
      >
        Room created
      </h1>

      <p
        className="
          mt-1.5
          text-sm
          leading-5
          text-[#94A3B8]
        "
      >
        Save this now — the password won&apos;t be
        shown again after you leave this page.
      </p>

      <div
        className="
          mt-5
          space-y-3
          xs:mt-6
        "
      >
        {rows.map((row) => (
          <div
            key={row.key}
            className="
              flex
              min-w-0
              items-center
              justify-between
              gap-2
              rounded-lg
              border border-white/5
              bg-[#0B0F14]
              px-3
              py-2.5
              xs:gap-3
              xs:px-3.5
            "
          >
            <div className="min-w-0 flex-1">
              <p className="text-xs text-[#94A3B8]">
                {row.label}
              </p>

              <p
                className={`
                  mt-0.5
                  min-w-0
                  truncate
                  text-sm
                  text-[#F8FAFC]
                  ${
                    row.mono
                      ? 'font-mono tracking-wide'
                      : ''
                  }
                `}
                title={
                  row.key === 'password' &&
                  !revealPassword
                    ? undefined
                    : row.value
                }
              >
                {row.value}
              </p>
            </div>

            <div
              className="
                flex
                shrink-0
                items-center
                gap-0.5
              "
            >
              {row.key === 'password' && (
                <button
                  type="button"
                  onClick={() =>
                    setRevealPassword(
                      (value) => !value
                    )
                  }
                  className="
                    flex
                    min-h-10
                    min-w-10
                    items-center
                    justify-center
                    rounded-md
                    px-2
                    text-xs
                    text-[#94A3B8]
                    transition-colors
                    hover:bg-white/5
                    hover:text-[#F8FAFC]
                    focus:outline-none
                    focus-visible:ring-2
                    focus-visible:ring-[#00D9FF]
                    touch-manipulation
                  "
                  aria-label={
                    revealPassword
                      ? 'Hide password'
                      : 'Show password'
                  }
                >
                  {revealPassword
                    ? 'Hide'
                    : 'Show'}
                </button>
              )}

              <button
                type="button"
                onClick={() =>
                  handleCopy(
                    row.key,
                    row.key === 'password'
                      ? password
                      : row.value
                  )
                }
                className="
                  flex
                  min-h-10
                  min-w-10
                  items-center
                  justify-center
                  rounded-md
                  text-[#94A3B8]
                  transition-colors
                  hover:bg-white/5
                  hover:text-[#F8FAFC]
                  focus:outline-none
                  focus-visible:ring-2
                  focus-visible:ring-[#00D9FF]
                  touch-manipulation
                "
                title={`Copy ${row.label.toLowerCase()}`}
                aria-label={`Copy ${row.label.toLowerCase()}`}
              >
                {copiedField === row.key ? (
                  <Check
                    className="
                      h-4 w-4
                      text-[#22C55E]
                    "
                    aria-hidden="true"
                  />
                ) : (
                  <Copy
                    className="h-4 w-4"
                    aria-hidden="true"
                  />
                )}
              </button>
            </div>
          </div>
        ))}
      </div>

      <div
        className="
          mt-5
          grid
          grid-cols-1
          gap-2.5
          xs:grid-cols-2
          sm:mt-6
        "
      >
        {/* QR CODE */}
        <button
          type="button"
          onClick={() =>
            onShowQr?.(frontendShareLink)
          }
          className="
            flex
            min-h-11
            w-full
            items-center
            justify-center
            gap-2
            rounded-lg
            border border-white/10
            px-4
            py-2.5
            text-sm
            text-[#F8FAFC]
            transition-colors
            hover:border-white/25
            hover:bg-white/5
            focus:outline-none
            focus-visible:ring-2
            focus-visible:ring-[#00D9FF]
            touch-manipulation
          "
        >
          <QrCode
            className="
              h-4 w-4
              shrink-0
            "
            aria-hidden="true"
          />

          <span>
            Show QR code
          </span>
        </button>

        {/* ENTER ROOM */}
        <button
          type="button"
          onClick={() =>
            navigate(`/room/${roomId}`, {
              state: {
                password,

                // PRIVATE authentication credentials.
                sessionId,
                sessionSecret,

                // PUBLIC participant identity.
                participantId,

                anonymousName,
                isOwner: Boolean(isOwner),
              },
            })
          }
          className="
            flex
            min-h-11
            w-full
            items-center
            justify-center
            rounded-lg
            bg-[#00D9FF]
            px-4
            py-2.5
            text-sm
            font-medium
            text-[#0B0F14]
            transition-colors
            hover:bg-[#5CE7FF]
            focus:outline-none
            focus-visible:ring-2
            focus-visible:ring-[#00D9FF]
            focus-visible:ring-offset-2
            focus-visible:ring-offset-[#111827]
            touch-manipulation
          "
        >
          Enter room
        </button>
      </div>
    </div>
  );
}