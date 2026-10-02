import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Copy,
  Check,
  QrCode,
  Share2,
} from 'lucide-react';

/**
 * RoomCreatedCard
 *
 * Displays the room credentials and the temporary
 * frontend invitation link returned by the backend.
 *
 * Expected shareLink:
 *
 *   http://localhost:5173/join?invite=TOKEN
 *
 * or production:
 *
 *   https://ghost-chat-akshay.vercel.app/join?invite=TOKEN
 *
 * IMPORTANT:
 * - Password is NOT included in the URL.
 * - sessionId/sessionSecret are NOT included in the URL.
 * - The exact same shareLink is used for copy, share and QR.
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

  const [sharing, setSharing] =
    useState(false);

  /*
   * Always use the URL supplied by the backend.
   *
   * Do NOT create a URL containing:
   * ?room=...
   * ?password=...
   *
   * The backend-generated invite token is the
   * authentication mechanism for the invitation.
   */
  const frontendShareLink =
    typeof shareLink === 'string'
      ? shareLink.trim()
      : '';

  /*
   * Copy text to clipboard.
   *
   * Works with:
   * 1. navigator.clipboard
   * 2. document.execCommand fallback
   */
  const copyToClipboard = async (value) => {
    if (!value) {
      throw new Error('Nothing to copy');
    }

    /*
     * Modern Clipboard API.
     */
    if (
      navigator.clipboard &&
      typeof navigator.clipboard.writeText === 'function'
    ) {
      try {
        await navigator.clipboard.writeText(value);
        return true;
      } catch (error) {
        console.warn(
          'Clipboard API failed, trying fallback:',
          error
        );
      }
    }

    /*
     * Fallback for localhost / older browsers.
     */
    const textarea =
      document.createElement('textarea');

    textarea.value = value;

    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    textarea.style.top = '0';
    textarea.style.opacity = '0';

    document.body.appendChild(textarea);

    textarea.focus();
    textarea.select();
    textarea.setSelectionRange(
      0,
      textarea.value.length
    );

    let successful = false;

    try {
      successful =
        document.execCommand('copy');
    } catch (error) {
      console.error(
        'Fallback clipboard copy failed:',
        error
      );
    }

    document.body.removeChild(textarea);

    if (!successful) {
      throw new Error(
        'Browser could not copy the link'
      );
    }

    return true;
  };

  /*
   * Copy button handler.
   */
  const handleCopy = async (
    field,
    value
  ) => {
    if (!value) {
      console.error(
        `Cannot copy ${field}: value is empty`
      );
      return;
    }

    try {
      await copyToClipboard(value);

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
        `Copy ${field} failed:`,
        error
      );
    }
  };

  /*
   * Native device/browser share.
   *
   * If Web Share API isn't available,
   * fall back to copying the link.
   */
  const handleShare = async () => {
    if (!frontendShareLink) {
      console.error(
        'Share failed: shareLink is empty'
      );
      return;
    }

    try {
      setSharing(true);

      /*
       * Native Share API.
       */
      if (
        typeof navigator.share === 'function'
      ) {
        await navigator.share({
          title: 'Join my GhostChat room',
          text: 'Use this link to join my temporary GhostChat room.',
          url: frontendShareLink,
        });

        return;
      }

      /*
       * Fallback to copy.
       */
      await copyToClipboard(frontendShareLink);

      setCopiedField('share');

      setTimeout(() => {
        setCopiedField((current) =>
          current === 'share'
            ? null
            : current
        );
      }, 1800);
    } catch (error) {
      /*
       * User cancelling native share is not
       * considered an application error.
       */
      if (
        error?.name !== 'AbortError'
      ) {
        console.error(
          'Share failed:',
          error
        );
      }
    } finally {
      setSharing(false);
    }
  };

  const rows = [
    {
      key: 'roomId',
      label: 'Room ID',
      value: roomId || '',
      mono: true,
    },
    {
      key: 'password',
      label: 'Password',
      value: revealPassword
        ? password || ''
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
                {row.value || 'Unavailable'}
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
                disabled={!row.value}
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
                  disabled:cursor-not-allowed
                  disabled:opacity-40
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

      {/* ACTION BUTTONS */}
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
        {/* SHARE */}
        <button
          type="button"
          onClick={handleShare}
          disabled={
            !frontendShareLink ||
            sharing
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
            disabled:cursor-not-allowed
            disabled:opacity-50
            touch-manipulation
          "
        >
          {copiedField === 'share' ? (
            <Check
              className="
                h-4 w-4
                text-[#22C55E]
              "
              aria-hidden="true"
            />
          ) : (
            <Share2
              className="
                h-4 w-4
                shrink-0
              "
              aria-hidden="true"
            />
          )}

          <span>
            {sharing
              ? 'Sharing...'
              : copiedField === 'share'
                ? 'Link copied'
                : 'Share link'}
          </span>
        </button>

        {/* QR CODE */}
        <button
          type="button"
          onClick={() =>
            onShowQr?.(frontendShareLink)
          }
          disabled={!frontendShareLink}
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
            disabled:cursor-not-allowed
            disabled:opacity-50
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
      </div>

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
          mt-2.5
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
  );
}