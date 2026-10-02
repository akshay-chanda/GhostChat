import {
  useState,
  useCallback,
  useEffect,
} from 'react';

import {
  useParams,
  useLocation,
  useNavigate,
} from 'react-router-dom';

import {
  Settings,
  LogOut,
  Users,
  X,
  LockKeyhole,
  ShieldCheck,
} from 'lucide-react';

import {
  RoomProvider,
  useRoom,
} from '../context/RoomContext';

import {
  setSessionCredentials,
  clearSessionCredentials,
} from '../services/api';

import { useRoomTimer } from '../hooks/useRoomTimer';
import { useScreenshotDetection } from '../hooks/useScreenshotDetection';

import ChatWindow from '../components/chat/ChatWindow';
import MessageInput from '../components/chat/MessageInput';
import ParticipantList from '../components/chat/ParticipantList';
import RoomTimer from '../components/room/RoomTimer';
import SettingsModal from '../components/room/SettingsModal';
import ConfirmationModal from '../components/room/ConfirmationModal';
import Watermark from '../components/security/Watermark';
import UploadProgress from '../components/files/UploadProgress';
import Toast from '../components/common/Toast';
import LoadingSpinner from '../components/common/LoadingSpinner';

// --------------------------------------------------
// ChatRoomPage
// --------------------------------------------------

export default function ChatRoomPage() {
  const { roomId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();

  // --------------------------------------------------
  // Get room session
  //
  // Session credentials are intentionally kept only
  // in React/router memory and the api.js module memory.
  //
  // IMPORTANT:
  //
  // sessionId       -> private
  // sessionSecret   -> private
  // password        -> private
  // participantId   -> public participant identifier
  //
  // We DO NOT store any of these credentials in:
  //
  //   localStorage
  //   sessionStorage
  //   URL parameters
  //   cross-origin cookies
  //
  // A browser refresh clears React/router memory.
  // The user will therefore need to join the room again.
  // --------------------------------------------------

  const [session] = useState(() => {
    /*
     * Normal navigation from Join Room / Create Room.
     *
     * All required private credentials must be supplied
     * through router state.
     */
    if (
      location.state?.password &&
      location.state?.sessionId &&
      location.state?.sessionSecret
    ) {
      return {
        ...location.state,
        roomId:
          location.state.roomId ||
          roomId,
      };
    }

    /*
     * No session is restored from browser storage.
     *
     * This is intentional for security.
     */
    return null;
  });

  // --------------------------------------------------
  // Register HTTP authentication credentials
  //
  // api.js keeps these credentials only in JavaScript
  // memory and sends them through private HTTP headers:
  //
  //   X-Session-Id
  //   X-Session-Secret
  //
  // No cookie is required.
  // --------------------------------------------------

  useEffect(() => {
    if (
      session?.sessionId &&
      session?.sessionSecret
    ) {
      setSessionCredentials(
        session.sessionId,
        session.sessionSecret
      );
    }

    return () => {
      clearSessionCredentials();
    };
  }, [
    session?.sessionId,
    session?.sessionSecret,
  ]);

  // --------------------------------------------------
  // Validate session
  // --------------------------------------------------

  useEffect(() => {
    if (
      !session?.password ||
      !session?.sessionId ||
      !session?.sessionSecret
    ) {
      navigate(`/join/${roomId}`, {
        replace: true,
      });
    }
  }, [
    session,
    roomId,
    navigate,
  ]);

  // --------------------------------------------------
  // No valid session
  // --------------------------------------------------

  if (
    !session?.password ||
    !session?.sessionId ||
    !session?.sessionSecret
  ) {
    return null;
  }

  return (
    <RoomProvider
      roomId={roomId}
      sessionId={session.sessionId}
      sessionSecret={session.sessionSecret}
      participantId={session.participantId}
      password={session.password}
      isOwner={Boolean(session.isOwner)}
      onRoomClosed={() => {
        clearSessionCredentials();

        navigate('/room-expired', {
          replace: true,
        });
      }}
    >
      <ChatRoomLayout
        roomId={roomId}
        sessionId={session.sessionId}
        anonymousName={session.anonymousName}
      />
    </RoomProvider>
  );
}

// --------------------------------------------------
// ChatRoomLayout
// --------------------------------------------------

function ChatRoomLayout({
  roomId,
  sessionId,
  anonymousName,
}) {
  const navigate = useNavigate();

  const {
    room,
    participants,
    messages,
    typingUsers,
    connectionState,

    participantId,

    replyTo,
    setReplyTo,

    sendMessage,
    deleteMessage,

    sendFile,
    uploadProgress,

    startTyping,
    stopTyping,

    isOwner,

    lockRoom,
    unlockRoom,

    setAcceptingNewMembers,
    setFileSharingEnabled,
    setMaxParticipants,
    extendExpiration,

    destroyRoom,
    removeParticipant,
    clearMessages,

    leaveRoom,

    ready,
  } = useRoom();

  const [settingsOpen, setSettingsOpen] =
    useState(false);

  const [confirmAction, setConfirmAction] =
    useState(null);

  const [uploadError, setUploadError] =
    useState(null);

  // Mobile participant drawer
  const [participantsOpen, setParticipantsOpen] =
    useState(false);

  // --------------------------------------------------
  // Leave room
  // --------------------------------------------------

  const handleLeaveRoom = useCallback(() => {
    setConfirmAction(null);
    setSettingsOpen(false);
    setParticipantsOpen(false);

    if (typeof leaveRoom === 'function') {
      leaveRoom();
    }

    /*
     * Remove the private HTTP credentials from memory
     * before leaving the room.
     */
    clearSessionCredentials();

    navigate('/', {
      replace: true,
    });
  }, [
    leaveRoom,
    navigate,
  ]);

  // --------------------------------------------------
  // Destroy room
  //
  // Host action:
  //   1. Destroy the room on the backend.
  //   2. Clear private credentials.
  //   3. Return to the home page.
  // --------------------------------------------------

  const handleDestroyRoom = useCallback(async () => {
    setConfirmAction(null);
    setSettingsOpen(false);
    setParticipantsOpen(false);

    try {
      if (typeof destroyRoom === 'function') {
        await destroyRoom();
      }

      /*
       * Remove the private HTTP credentials from memory
       * after the backend confirms room destruction.
       */
      clearSessionCredentials();

      navigate('/', {
        replace: true,
      });
    } catch (error) {
      console.error(
        'Failed to destroy room:',
        error
      );

      // Keep the user inside the room if the
      // destroy request failed.
      setConfirmAction(null);
    }
  }, [
    destroyRoom,
    navigate,
  ]);

  // --------------------------------------------------
  // Room expiration
  // --------------------------------------------------

  const handleExpire = useCallback(() => {
    setConfirmAction(null);
    setSettingsOpen(false);
    setParticipantsOpen(false);

    if (typeof leaveRoom === 'function') {
      leaveRoom();
    }

    /*
     * Remove the private HTTP credentials from memory.
     */
    clearSessionCredentials();

    navigate('/room-expired', {
      replace: true,
    });
  }, [
    leaveRoom,
    navigate,
  ]);

  const validExpiresAt = room?.expiresAt
    ? new Date(room.expiresAt).getTime()
    : null;

  useRoomTimer(validExpiresAt, {
    onExpire: handleExpire,
  });

  // --------------------------------------------------
  // Screenshot detection
  // --------------------------------------------------

  const {
    detected: screenshotDetected,
    dismiss: dismissScreenshotToast,
  } = useScreenshotDetection();

  // --------------------------------------------------
  // File attachment
  // --------------------------------------------------

  const handleAttachFile = async (file) => {
    setUploadError(null);

    try {
      await sendFile(file);
    } catch (error) {
      console.error(
        'File upload failed:',
        error
      );

      setUploadError(
        'Could not upload that file. Try again.'
      );
    }
  };

  // --------------------------------------------------
  // Close mobile participant drawer when room changes
  // --------------------------------------------------

  useEffect(() => {
    setParticipantsOpen(false);
  }, [roomId]);

  // --------------------------------------------------
  // Prevent body horizontal overflow while inside room
  // --------------------------------------------------

  useEffect(() => {
    const previousOverflowX =
      document.body.style.overflowX;

    document.body.style.overflowX = 'hidden';

    return () => {
      document.body.style.overflowX =
        previousOverflowX;
    };
  }, []);

  // --------------------------------------------------
  // Lock body scroll when mobile drawer is open
  // --------------------------------------------------

  useEffect(() => {
    if (!participantsOpen) {
      return undefined;
    }

    const previousOverflow =
      document.body.style.overflow;

    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow =
        previousOverflow;
    };
  }, [participantsOpen]);

  // --------------------------------------------------
  // Loading screen
  // --------------------------------------------------

  if (!ready) {
    return (
      <div
        className="
          flex
          min-h-[100dvh]
          w-full
          items-center
          justify-center
          bg-[#0B0F14]
          px-4
          pt-[env(safe-area-inset-top)]
          pb-[env(safe-area-inset-bottom)]
        "
      >
        <LoadingSpinner
          size="lg"
          label="Connecting to room"
        />
      </div>
    );
  }

  // --------------------------------------------------
  // Main layout
  // --------------------------------------------------

  return (
    <div
      className="
        flex
        h-[100dvh]
        w-full
        min-w-0
        flex-col
        overflow-hidden
        bg-[#0B0F14]
      "
    >
      <Watermark
        anonymousName={anonymousName}
        roomId={roomId}
      />

      {screenshotDetected && (
        <div
          className="
            pointer-events-none
            fixed
            left-2
            right-2
            top-3
            z-[10000]
            flex
            justify-center
            sm:left-3
            sm:right-3
            sm:top-4
          "
        >
          <div
            className="
              pointer-events-auto
              min-w-0
              max-w-full
            "
          >
            <Toast
              message="Screenshot detected"
              variant="warning"
              onDismiss={
                dismissScreenshotToast
              }
            />
          </div>
        </div>
      )}

      {/* =================================================
          ROOM HEADER
      ================================================= */}

      <header
        className="
          relative
          z-[9999]
          flex
          h-14
          shrink-0
          items-center
          justify-between
          gap-1
          border-b
          border-white/5
          bg-[#0B0F14]
          px-2
          pt-[env(safe-area-inset-top)]
          xs:gap-1.5
          xs:px-3
          sm:h-16
          sm:gap-2
          sm:px-4
          md:px-6
        "
      >
        {/* Tablet / laptop / desktop header */}

        <div
          className="
            hidden
            min-w-0
            flex-1
            items-center
            gap-3
            overflow-hidden
            md:flex
            lg:gap-4
          "
        >
          <div
            className="
              flex
              shrink-0
              items-center
              gap-2
            "
          >
            <ShieldCheck
              className="
                h-5
                w-5
                shrink-0
                text-[#00D9FF]
                lg:h-6
                lg:w-6
              "
            />

            <span
              className="
                whitespace-nowrap
                text-base
                font-bold
                leading-none
                tracking-tight
                text-[#F8FAFC]
                lg:text-lg
              "
            >
              GhostChat
            </span>
          </div>

          <div
            className="
              flex
              h-10
              shrink-0
              items-center
              gap-2
              rounded-full
              border
              border-[#26313D]
              bg-[#11161D]
              px-3
              text-sm
              text-[#CBD5E1]
              lg:px-4
            "
          >
            <LockKeyhole
              className="
                h-4
                w-4
                shrink-0
                text-[#22C55E]
              "
            />

            <span className="whitespace-nowrap">
              Secure room
            </span>
          </div>

          <span
            className="
              max-w-[120px]
              shrink-0
              truncate
              text-base
              font-semibold
              leading-none
              text-[#F8FAFC]
              lg:max-w-[180px]
            "
            title={roomId}
          >
            {roomId}
          </span>
        </div>

        {/* Mobile header */}

        <div
          className="
            flex
            min-w-0
            flex-1
            items-center
            gap-2
            overflow-hidden
            xs:gap-3
            md:hidden
          "
        >
          <div
            className="
              flex
              shrink-0
              items-center
              gap-1.5
            "
          >
            <ShieldCheck
              className="
                h-4
                w-4
                shrink-0
                text-[#00D9FF]
                xs:h-5
                xs:w-5
              "
            />

            <span
              className="
                whitespace-nowrap
                text-sm
                font-bold
                leading-none
                tracking-tight
                text-[#F8FAFC]
                xs:text-base
              "
            >
              GhostChat
            </span>
          </div>

          <span
            className="
              min-w-0
              max-w-[120px]
              truncate
              text-[11px]
              font-medium
              text-[#F8FAFC]
              xs:max-w-[160px]
              xs:text-xs
              sm:max-w-[260px]
              sm:text-sm
            "
            title={roomId}
          >
            {roomId}
          </span>
        </div>

        {/* Header controls */}

        <div
          className="
            flex
            shrink-0
            items-center
            gap-0
            xs:gap-0.5
            sm:gap-2
          "
        >
          {room?.expiresAt && (
            <div
              className="
                max-w-[76px]
                shrink-0
                overflow-hidden
                xs:max-w-[100px]
                sm:max-w-none
              "
            >
              <RoomTimer
                expiresAt={room.expiresAt}
                onExpire={handleExpire}
              />
            </div>
          )}

          <button
            type="button"
            onClick={() => {
              setParticipantsOpen(true);
            }}
            title="Participants"
            aria-label="Open participants"
            className="
              relative
              z-50
              flex
              min-h-10
              min-w-10
              shrink-0
              cursor-pointer
              items-center
              justify-center
              rounded-lg
              p-1.5
              text-[#94A3B8]
              transition
              hover:bg-white/5
              hover:text-[#F8FAFC]
              active:scale-95
              touch-manipulation
              md:hidden
              xs:p-2
            "
          >
            <Users
              className="
                pointer-events-none
                h-4
                w-4
                xs:h-5
                xs:w-5
              "
            />

            {participants.length > 0 && (
              <span
                className="
                  absolute
                  -right-0.5
                  -top-0.5
                  flex
                  h-4
                  min-w-4
                  items-center
                  justify-center
                  rounded-full
                  bg-[#00D9FF]
                  px-1
                  text-[9px]
                  font-bold
                  leading-none
                  text-[#0B0F14]
                "
              >
                {participants.length}
              </span>
            )}
          </button>

          {isOwner && (
            <button
              type="button"
              onClick={() => {
                setSettingsOpen(true);
              }}
              title="Room settings"
              aria-label="Room settings"
              className="
                relative
                z-50
                flex
                min-h-10
                min-w-10
                shrink-0
                cursor-pointer
                items-center
                justify-center
                rounded-lg
                p-1.5
                text-[#94A3B8]
                transition
                hover:bg-white/5
                hover:text-[#F8FAFC]
                active:scale-95
                touch-manipulation
                xs:p-2
              "
            >
              <Settings
                className="
                  pointer-events-none
                  h-4
                  w-4
                  xs:h-5
                  xs:w-5
                "
              />
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              setConfirmAction('leave');
            }}
            title="Leave room"
            aria-label="Leave room"
            className="
              relative
              z-[10000]
              flex
              min-h-10
              min-w-10
              shrink-0
              cursor-pointer
              items-center
              justify-center
              rounded-lg
              p-1.5
              text-[#94A3B8]
              transition
              hover:bg-white/5
              hover:text-[#F8FAFC]
              active:scale-95
              touch-manipulation
              xs:p-2
            "
          >
            <LogOut
              className="
                pointer-events-none
                h-4
                w-4
                xs:h-5
                xs:w-5
              "
            />
          </button>
        </div>
      </header>

      {/* =================================================
          MAIN CONTENT
      ================================================= */}

      <div
        className="
          relative
          flex
          min-h-0
          min-w-0
          flex-1
          overflow-hidden
        "
      >
        <div
          className="
            flex
            min-h-0
            min-w-0
            flex-1
            flex-col
          "
        >
          <div
            className="
              min-h-0
              min-w-0
              flex-1
            "
          >
            <ChatWindow
              messages={messages}
              currentSessionId={participantId}
              typingUsers={typingUsers}
              connectionState={connectionState}
              onDeleteMessage={deleteMessage}
              onReplyTo={setReplyTo}
            />
          </div>

          {uploadProgress && (
            <div
              className="
                min-w-0
                shrink-0
                px-2
                pb-1
                xs:px-3
                xs:pb-1.5
                sm:px-4
                sm:pb-2
                md:px-6
              "
            >
              <UploadProgress
                fileName={uploadProgress.fileName}
                percent={uploadProgress.percent}
              />
            </div>
          )}

          {uploadError && (
            <div
              className="
                min-w-0
                shrink-0
                px-2
                pb-1
                xs:px-3
                xs:pb-1.5
                sm:px-4
                sm:pb-2
                md:px-6
              "
            >
              <p
                className="
                  break-words
                  text-[10px]
                  text-[#EF4444]
                  xs:text-[11px]
                  sm:text-xs
                "
              >
                {uploadError}
              </p>
            </div>
          )}

          <div
            className="
              min-w-0
              shrink-0
              pb-[env(safe-area-inset-bottom)]
            "
          >
            <MessageInput
              onSend={sendMessage}
              onTypingStart={startTyping}
              onTypingStop={stopTyping}
              onAttachFile={handleAttachFile}
              replyTo={replyTo}
              onCancelReply={() =>
                setReplyTo(null)
              }
              fileSharingEnabled={
                room?.fileSharingEnabled ?? true
              }
              disabled={
                connectionState === 'disconnected'
              }
              disabledReason={
                connectionState === 'disconnected'
                  ? 'Reconnecting…'
                  : undefined
              }
            />
          </div>
        </div>

        {/* Desktop participant sidebar */}

        <aside
          className="
            hidden
            w-56
            shrink-0
            overflow-hidden
            border-l
            border-white/5
            md:block
            lg:w-64
            xl:w-72
          "
        >
          <ParticipantList
            participants={participants}
            currentSessionId={participantId}
            roomOwnerId={room?.ownerId}
            maxParticipants={room?.maxParticipants}
            onRemoveParticipant={removeParticipant}
          />
        </aside>
      </div>

      {/* Mobile participant drawer */}

      {participantsOpen && (
        <div
          className="
            fixed
            inset-0
            z-[10001]
            md:hidden
          "
        >
          <button
            type="button"
            aria-label="Close participants"
            onClick={() =>
              setParticipantsOpen(false)
            }
            className="
              absolute
              inset-0
              h-full
              w-full
              cursor-default
              bg-black/60
              backdrop-blur-[2px]
            "
          />

          <aside
            className="
              absolute
              right-0
              top-0
              flex
              h-[100dvh]
              w-[min(88vw,360px)]
              max-w-full
              flex-col
              border-l
              border-white/10
              bg-[#0B0F14]
              pb-[env(safe-area-inset-bottom)]
              pt-[env(safe-area-inset-top)]
              shadow-2xl
            "
          >
            <div
              className="
                flex
                min-h-14
                shrink-0
                items-center
                justify-between
                gap-3
                border-b
                border-white/5
                px-3
                xs:px-4
                sm:min-h-16
              "
            >
              <div
                className="
                  flex
                  min-w-0
                  items-center
                  gap-2
                "
              >
                <Users
                  className="
                    h-4
                    w-4
                    shrink-0
                    text-[#00D9FF]
                  "
                />

                <h2
                  className="
                    truncate
                    text-sm
                    font-medium
                    text-[#F8FAFC]
                  "
                >
                  Participants
                </h2>

                <span
                  className="
                    flex
                    h-5
                    min-w-5
                    shrink-0
                    items-center
                    justify-center
                    rounded-full
                    bg-white/5
                    px-1.5
                    text-[10px]
                    text-[#94A3B8]
                  "
                >
                  {participants.length}
                </span>
              </div>

              <button
                type="button"
                onClick={() =>
                  setParticipantsOpen(false)
                }
                title="Close participants"
                aria-label="Close participants"
                className="
                  flex
                  min-h-10
                  min-w-10
                  shrink-0
                  items-center
                  justify-center
                  rounded-lg
                  p-2
                  text-[#94A3B8]
                  transition
                  hover:bg-white/5
                  hover:text-[#F8FAFC]
                  touch-manipulation
                "
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div
              className="
                min-h-0
                flex-1
                overflow-y-auto
                overscroll-contain
              "
            >
              <ParticipantList
                participants={participants}
                currentSessionId={participantId}
                roomOwnerId={room?.ownerId}
                maxParticipants={room?.maxParticipants}
                onRemoveParticipant={removeParticipant}
              />
            </div>
          </aside>
        </div>
      )}

      {/* Settings modal */}

      {isOwner && (
        <SettingsModal
          open={settingsOpen}
          onClose={() =>
            setSettingsOpen(false)
          }
          room={room}
          participants={participants}
          onToggleLock={() => {
            if (room?.locked) {
              unlockRoom();
            } else {
              lockRoom();
            }
          }}
          onToggleAcceptingNewMembers={(enabled) => {
            setAcceptingNewMembers(enabled);
          }}
          onToggleFileSharing={(enabled) => {
            setFileSharingEnabled(enabled);
          }}
          onChangeExpiration={(seconds) => {
            extendExpiration(seconds);
          }}
          onChangeMaxParticipants={(maxParticipants) => {
            setMaxParticipants(maxParticipants);
          }}
          onRemoveParticipant={removeParticipant}
          onClearMessages={clearMessages}
          onEndRoom={() => {
            setSettingsOpen(false);
            setConfirmAction('destroy');
          }}
        />
      )}

      {/* Leave confirmation */}

      <ConfirmationModal
        open={confirmAction === 'leave'}
        title="Leave this room?"
        description="Your temporary session will be disconnected."
        confirmLabel="Leave room"
        onConfirm={handleLeaveRoom}
        onCancel={() =>
          setConfirmAction(null)
        }
      />

      {/* Destroy confirmation */}

      <ConfirmationModal
        open={confirmAction === 'destroy'}
        title="Destroy this room?"
        description="All temporary room data and active sessions will be removed. This action cannot be undone."
        confirmLabel="Destroy room"
        onConfirm={handleDestroyRoom}
        onCancel={() =>
          setConfirmAction(null)
        }
      />
    </div>
  );
}