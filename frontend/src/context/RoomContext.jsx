import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
} from 'react';

import { useNavigate } from 'react-router-dom';

import { deriveRoomKey } from '../crypto/keyExchange';

import { useSocket } from '../hooks/useSocket';
import { useReconnect } from '../hooks/useReconnect';
import { useTypingIndicator } from '../hooks/useTypingIndicator';

import { uploadFile } from '../services/fileService';

import {
  onMessage,
  leaveRoom as emitLeaveRoom,
  deleteMessage as emitDeleteMessage,
  lockRoom as emitLockRoom,
  unlockRoom as emitUnlockRoom,
  setAcceptingNewMembers as emitSetAcceptingNewMembers,
  setFileSharingEnabled as emitSetFileSharingEnabled,
  setMaxParticipants as emitSetMaxParticipants,
  extendExpiration as emitExtendExpiration,
  destroyRoom as emitDestroyRoom,
  removeParticipant as emitRemoveParticipant,
  clearMessages as emitClearMessages,
  on,
} from '../services/socketService';

const RoomContext = createContext(null);

// --------------------------------------------------
// Room Provider
// --------------------------------------------------

export function RoomProvider({
  roomId,
  sessionId,
  sessionSecret,
  participantId,
  password,
  isOwner,
  onRoomClosed,
  children,
}) {
  const navigate = useNavigate();

  const [roomKey, setRoomKey] = useState(null);
  const [room, setRoom] = useState(null);
  const [participants, setParticipants] = useState([]);
  const [messages, setMessages] = useState([]);
  const [replyTo, setReplyTo] = useState(null);
  const [uploadProgress, setUploadProgress] =
    useState(null);

  /*
   * Track whether the CURRENT USER intentionally
   * destroyed the room.
   */
  const destroyingRoomRef = useRef(false);

  // --------------------------------------------------
  // Reset room state
  // --------------------------------------------------

  const resetRoomState = useCallback(() => {
    setRoomKey(null);
    setRoom(null);
    setParticipants([]);
    setMessages([]);
    setReplyTo(null);
    setUploadProgress(null);
  }, []);

  // --------------------------------------------------
  // Navigate to Home
  // --------------------------------------------------

  const leaveRoomAndGoHome = useCallback(() => {
    resetRoomState();

    navigate('/', {
      replace: true,
    });
  }, [
    resetRoomState,
    navigate,
  ]);

  // --------------------------------------------------
  // Handle room closed externally
  // --------------------------------------------------

  const handleRoomClosed = useCallback(() => {
    resetRoomState();

    if (onRoomClosed) {
      onRoomClosed();
    } else {
      navigate('/room-expired', {
        replace: true,
      });
    }
  }, [
    resetRoomState,
    onRoomClosed,
    navigate,
  ]);

  // --------------------------------------------------
  // Derive encryption key
  // --------------------------------------------------

  useEffect(() => {
    let cancelled = false;

    if (!password || !roomId) {
      setRoomKey(null);
      return undefined;
    }

    setRoomKey(null);

    deriveRoomKey(password, roomId)
      .then((key) => {
        if (!cancelled) {
          setRoomKey(key);
        }
      })
      .catch((error) => {
        console.error(
          'Failed to derive room key:',
          error
        );

        if (!cancelled) {
          setRoomKey(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [password, roomId]);

  // --------------------------------------------------
  // Socket connection
  // --------------------------------------------------

  const { send } = useSocket({
    roomId,
    sessionId,
    sessionSecret,
    roomKey,
  });

  const {
    connectionState,
    retry: retryConnection,
  } = useReconnect(roomKey);

  const {
    typingUsers,
    startTyping,
    stopTyping,
  } = useTypingIndicator(roomKey);

  // --------------------------------------------------
  // Receive messages
  // --------------------------------------------------

  useEffect(() => {
    if (!roomKey) {
      return undefined;
    }

    const cleanup = onMessage((incoming) => {
      setMessages((previousMessages) => {
        /*
         * Prevent duplicate system messages.
         */
        if (
          incoming.type === 'system' &&
          incoming.content
        ) {
          const alreadyExists =
            previousMessages.some(
              (message) =>
                message.type === 'system' &&
                message.content ===
                  incoming.content
            );

          if (alreadyExists) {
            return previousMessages;
          }
        }

        // Get the ID of the message being replied to.
        const replyToMessageId =
          incoming.replyToMessageId ??
          incoming.replyTo?.messageId ??
          incoming.replyTo?.id ??
          null;

        // Find the original message.
        const originalMessage =
          replyToMessageId
            ? previousMessages.find(
                (message) =>
                  message.id ===
                    replyToMessageId ||
                  message.clientId ===
                    replyToMessageId
              )
            : null;

        // Create the updated incoming message.
        const updatedIncomingMessage = {
          ...incoming,

          replyTo: originalMessage
            ? {
                messageId:
                  originalMessage.id,
                senderName:
                  originalMessage.senderName,
                content:
                  originalMessage.content,
              }
            : incoming.replyTo ?? null,
        };

        // Prevent duplicate normal messages.
        if (
          incoming.clientId &&
          previousMessages.some(
            (message) =>
              message.clientId ===
              incoming.clientId
          )
        ) {
          return previousMessages.map(
            (message) =>
              message.clientId ===
              incoming.clientId
                ? {
                    ...message,
                    ...updatedIncomingMessage,
                  }
                : message
          );
        }

        return [
          ...previousMessages,
          updatedIncomingMessage,
        ];
      });
    });

    return cleanup;
  }, [roomKey]);

  // --------------------------------------------------
  // Room events
  // --------------------------------------------------

  useEffect(() => {
    if (!roomKey) {
      return undefined;
    }

    // ------------------------------------------------
    // A new user joined the room.
    // ------------------------------------------------

    const offJoined = on(
      'room:user-joined',
      (participant) => {
        if (!participant?.id) {
          return;
        }

        setParticipants(
          (previousParticipants) => {
            const alreadyExists =
              previousParticipants.some(
                (item) =>
                  item.id ===
                  participant.id
              );

            if (alreadyExists) {
              return previousParticipants;
            }

            return [
              ...previousParticipants,
              participant,
            ];
          }
        );
      }
    );

    // ------------------------------------------------
    // A user left the room.
    // ------------------------------------------------

    const offLeft = on(
      'room:user-left',
      (payload = {}) => {
        /*
         * SECURITY:
         *
         * The backend sends the PUBLIC
         * participantId as `id`.
         *
         * sessionId is private and must NEVER
         * be used as a public participant ID.
         */
        const leavingId = payload.id;

        if (!leavingId) {
          console.warn(
            '[RoomContext] room:user-left received without participant id:',
            payload
          );

          return;
        }

        /*
         * Only update the participant roster here.
         *
         * IMPORTANT:
         *
         * Do NOT create a "left the room"
         * system message here.
         *
         * The backend already creates the
         * authoritative system message.
         */
        setParticipants(
          (previousParticipants) =>
            previousParticipants.filter(
              (participant) =>
                participant.id !==
                leavingId
            )
        );
      }
    );

    // ------------------------------------------------
    // A participant was removed by the host.
    // ------------------------------------------------

    const offRemovedParticipant = on(
      'room:user-removed',
      (payload = {}) => {
        const removedId =
          payload.id;

        if (!removedId) {
          console.warn(
            '[RoomContext] room:user-removed received without participant id:',
            payload
          );

          return;
        }

        /*
         * Only update the participant roster.
         *
         * The backend is responsible for creating
         * and broadcasting:
         *
         * "Anonymous Cobra was removed from the room."
         */
        setParticipants(
          (previousParticipants) =>
            previousParticipants.filter(
              (participant) =>
                participant.id !==
                removedId
            )
        );
      }
    );

    // ------------------------------------------------
    // Room information updated.
    // ------------------------------------------------

    const offRoomUpdate = on(
      'room:updated',
      (updatedRoom) => {
        if (!updatedRoom) {
          return;
        }

        setRoom(updatedRoom);
      }
    );

    // ------------------------------------------------
    // Successfully joined the room.
    // ------------------------------------------------

    const offRoster = on(
      'room:joined',
      ({
        room: initialRoom,
        participants:
          initialParticipants,
      } = {}) => {
        if (initialRoom) {
          setRoom(initialRoom);
        }

        setParticipants(
          Array.isArray(initialParticipants)
            ? initialParticipants
            : []
        );
      }
    );

    // ------------------------------------------------
    // A single message was deleted.
    // ------------------------------------------------

    const offDeleted = on(
      'message:delete',
      ({ messageId } = {}) => {
        if (!messageId) {
          return;
        }

        setMessages(
          (previousMessages) =>
            previousMessages.filter(
              (message) =>
                message.id !== messageId
            )
        );
      }
    );

    // ------------------------------------------------
    // Messages cleared.
    // ------------------------------------------------

    const offCleared = on(
      'message:cleared',
      () => {
        setMessages([]);
      }
    );

    // ------------------------------------------------
    // Room expired / destroyed.
    // ------------------------------------------------

    const offExpired = on(
      'room:expired',
      () => {
        if (destroyingRoomRef.current) {
          destroyingRoomRef.current = false;

          leaveRoomAndGoHome();

          return;
        }

        handleRoomClosed();
      }
    );

    // ------------------------------------------------
    // Current user was removed by host.
    // ------------------------------------------------

    const offRemoved = on(
      'room:removed',
      () => {
        handleRoomClosed();
      }
    );

    // ------------------------------------------------
    // Cleanup
    // ------------------------------------------------

    return () => {
      offJoined?.();
      offLeft?.();
      offRemovedParticipant?.();
      offRoomUpdate?.();
      offRoster?.();
      offDeleted?.();
      offCleared?.();
      offExpired?.();
      offRemoved?.();
    };
  }, [
    roomKey,
    leaveRoomAndGoHome,
    handleRoomClosed,
  ]);

  // --------------------------------------------------
  // Send message
  // --------------------------------------------------

  const sendMessage = useCallback(
    async (content) => {
      const clientId = await send(
        content,
        replyTo
      );

      /*
       * SECURITY:
       *
       * participantId is PUBLIC.
       *
       * sessionId and sessionSecret are PRIVATE.
       */
      const currentParticipantId =
        participantId || null;

      setMessages((previousMessages) => [
        ...previousMessages,
        {
          id: clientId,
          clientId,
          type: 'text',
          senderId:
            currentParticipantId,
          senderName: 'You',
          content,

          replyTo: replyTo
            ? {
                messageId: replyTo.id,
                senderName:
                  replyTo.senderName,
                content:
                  replyTo.content,
              }
            : undefined,

          timestamp:
            new Date().toISOString(),
        },
      ]);

      setReplyTo(null);
    },
    [
      send,
      replyTo,
      participantId,
    ]
  );

  // --------------------------------------------------
  // Delete message
  // --------------------------------------------------

  const deleteMessage = useCallback(
    (messageId) => {
      emitDeleteMessage(messageId);

      setMessages(
        (previousMessages) =>
          previousMessages.filter(
            (message) =>
              message.id !== messageId
          )
      );
    },
    []
  );

  // --------------------------------------------------
  // Send file
  // --------------------------------------------------

  const sendFile = useCallback(
    async (file) => {
      if (!roomKey) {
        throw new Error(
          'Room key is not ready'
        );
      }

      if (!sessionId) {
        throw new Error(
          'Session authentication is not ready'
        );
      }

      if (!sessionSecret) {
        throw new Error(
          'Session authentication is not ready'
        );
      }

      setUploadProgress({
        fileName: file.name,
        percent: 0,
      });

      try {
        await uploadFile({
          roomId,
          file,
          key: roomKey,
          sessionId,
          sessionSecret,

          onProgress: (percent) => {
            setUploadProgress({
              fileName: file.name,
              percent,
            });
          },
        });
      } finally {
        setUploadProgress(null);
      }
    },
    [
      roomId,
      roomKey,
      sessionId,
      sessionSecret,
    ]
  );

  // --------------------------------------------------
  // Leave room manually
  // --------------------------------------------------

  const handleLeaveRoom = useCallback(() => {
    /*
     * This is an intentional leave.
     *
     * Emit room:leave before leaving the page.
     */
    emitLeaveRoom();

    leaveRoomAndGoHome();
  }, [
    leaveRoomAndGoHome,
  ]);

  // --------------------------------------------------
  // Room controls
  // --------------------------------------------------

  const handleLockRoom = useCallback(() => {
    emitLockRoom();
  }, []);

  const handleUnlockRoom = useCallback(() => {
    emitUnlockRoom();
  }, []);

  // --------------------------------------------------
  // Destroy room
  // --------------------------------------------------

  const handleDestroyRoom =
    useCallback(async () => {
      try {
        destroyingRoomRef.current = true;

        await emitDestroyRoom();

        console.log(
          '[RoomContext] Room destruction confirmed'
        );
      } catch (error) {
        destroyingRoomRef.current = false;

        console.error(
          '[RoomContext] Failed to destroy room:',
          error
        );

        throw error;
      }
    }, []);

  // --------------------------------------------------
  // Accepting new members
  // --------------------------------------------------

  const handleSetAcceptingNewMembers =
    useCallback((enabled) => {
      emitSetAcceptingNewMembers(
        enabled
      );
    }, []);

  // --------------------------------------------------
  // File sharing
  // --------------------------------------------------

  const handleSetFileSharingEnabled =
    useCallback((enabled) => {
      emitSetFileSharingEnabled(
        enabled
      );
    }, []);

  // --------------------------------------------------
  // Maximum participants
  // --------------------------------------------------

  const handleSetMaxParticipants =
    useCallback((maxParticipants) => {
      emitSetMaxParticipants(
        maxParticipants
      );
    }, []);

  // --------------------------------------------------
  // Extend expiration
  // --------------------------------------------------

  const handleExtendExpiration =
    useCallback((minutes) => {
      emitExtendExpiration(minutes);
    }, []);

  // --------------------------------------------------
  // Remove participant
  // --------------------------------------------------

  const handleRemoveParticipant =
    useCallback((targetParticipantId) => {
      /*
       * targetParticipantId is PUBLIC.
       *
       * Never send another participant's
       * sessionId to the socket service.
       */
      emitRemoveParticipant(
        targetParticipantId
      );
    }, []);

  // --------------------------------------------------
  // Clear messages
  // --------------------------------------------------

  const handleClearMessages =
    useCallback(() => {
      emitClearMessages();
    }, []);

  // --------------------------------------------------
  // Context value
  // --------------------------------------------------

  /*
   * Find the current user by their PUBLIC
   * participantId, never by isOwner.
   */
  const currentParticipant =
    participantId
      ? participants.find(
          (participant) =>
            participant.id ===
            participantId
        ) || null
      : null;

  const value = {
    // Room identity
    roomId,

    // PRIVATE
    sessionId,

    // PRIVATE
    sessionSecret,

    // PUBLIC
    participantId:
      participantId ||
      currentParticipant?.id ||
      null,

    // Encryption
    roomKey,

    // Room state
    room,
    participants,
    messages,

    // Connection
    typingUsers,
    connectionState,
    retryConnection,

    // Replies
    replyTo,
    setReplyTo,

    // Messages
    sendMessage,
    deleteMessage,

    // Files
    sendFile,
    uploadProgress,

    // Typing
    startTyping,
    stopTyping,

    // Ownership
    isOwner,

    // Room controls
    lockRoom:
      handleLockRoom,

    unlockRoom:
      handleUnlockRoom,

    setAcceptingNewMembers:
      handleSetAcceptingNewMembers,

    setFileSharingEnabled:
      handleSetFileSharingEnabled,

    setMaxParticipants:
      handleSetMaxParticipants,

    extendExpiration:
      handleExtendExpiration,

    destroyRoom:
      handleDestroyRoom,

    removeParticipant:
      handleRemoveParticipant,

    clearMessages:
      handleClearMessages,

    // Leave
    leaveRoom:
      handleLeaveRoom,

    // Ready
    ready:
      Boolean(
        roomKey &&
        sessionId &&
        sessionSecret
      ),
  };

  return (
    <RoomContext.Provider
      value={value}
    >
      {children}
    </RoomContext.Provider>
  );
}

// --------------------------------------------------
// useRoom hook
// --------------------------------------------------

export function useRoom() {
  const context =
    useContext(RoomContext);

  if (!context) {
    throw new Error(
      'useRoom must be used within a RoomProvider'
    );
  }

  return context;
}