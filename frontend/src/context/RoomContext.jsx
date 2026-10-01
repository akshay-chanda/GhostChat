import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
} from 'react';

import { useNavigate } from 'react-router-dom';

import { deriveRoomKey } from '../crypto/keyExchange';

import { useSocket } from '../hooks/useSocket';
import { useReconnect } from '../hooks/useReconnect';
import { useTypingIndicator } from '../hooks/useTypingIndicator';

import { uploadFile } from '../services/fileService';

import {
  onMessage,
  on,
  disconnectSocket,
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
} from '../services/socketService';

const RoomContext = createContext(null);

// --------------------------------------------------
// Room Provider
// --------------------------------------------------

export function RoomProvider({
  roomId,
  sessionId,
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
    /*
     * IMPORTANT:
     *
     * Completely destroy the client-side socket before
     * navigating away from the room.
     *
     * This prevents the old Socket.IO connection from
     * remaining alive/reconnecting and interfering with
     * the next room.
     */
    disconnectSocket();

    /*
     * Clear all old room state.
     */
    resetRoomState();

    /*
     * Navigate to the home page.
     */
    if (onRoomClosed) {
      onRoomClosed();
    } else {
      navigate('/', {
        replace: true,
      });
    }
  }, [
    resetRoomState,
    onRoomClosed,
    navigate,
  ]);

  // --------------------------------------------------
  // Cleanup socket when RoomProvider is unmounted
  // --------------------------------------------------

  useEffect(() => {
    return () => {
      /*
       * Make sure the old socket is completely removed
       * when leaving the room page.
       */
      disconnectSocket();
    };
  }, []);

  // --------------------------------------------------
  // Derive encryption key
  // --------------------------------------------------

  useEffect(() => {
    let cancelled = false;

    if (!password || !roomId) {
      setRoomKey(null);
      return undefined;
    }

    /*
     * Clear the previous room key while the new key
     * is being generated.
     */
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
         * ------------------------------------------------
         * SYSTEM MESSAGE DUPLICATE PROTECTION
         * ------------------------------------------------
         *
         * The backend can send:
         *
         *   message:new
         *
         * when someone leaves.
         *
         * The room:user-left handler below can also
         * create a local fallback message.
         *
         * Do not add the same system message twice.
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

        // ------------------------------------------------
        // Get reply message ID
        // ------------------------------------------------

        const replyToMessageId =
          incoming.replyToMessageId ??
          incoming.replyTo?.messageId ??
          incoming.replyTo?.id ??
          null;

        // ------------------------------------------------
        // Find original message
        // ------------------------------------------------

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

        // ------------------------------------------------
        // Create updated incoming message
        // ------------------------------------------------

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

        // ------------------------------------------------
        // Prevent duplicate normal messages
        // ------------------------------------------------

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

        // ------------------------------------------------
        // Add new message
        // ------------------------------------------------

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
    // A new user joined the room
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
    // A user left the room
    // ------------------------------------------------

    const offLeft = on(
      'room:user-left',
      (payload = {}) => {
        const leavingId =
          payload.id ||
          payload.sessionId;

        if (!leavingId) {
          console.warn(
            '[RoomContext] room:user-left received without participant id:',
            payload
          );

          return;
        }

        /*
         * Find the participant before removing them.
         */
        let leavingParticipant = null;

        setParticipants(
          (previousParticipants) => {
            leavingParticipant =
              previousParticipants.find(
                (participant) =>
                  participant.id ===
                  leavingId
              );

            /*
             * Remove immediately from the online
             * participant list.
             */
            return previousParticipants.filter(
              (participant) =>
                participant.id !==
                leavingId
            );
          }
        );

        /*
         * React state updates are scheduled, so
         * leavingParticipant may not be available
         * synchronously.
         *
         * If available, create a local fallback
         * system message.
         */
        if (leavingParticipant) {
          const leavingName =
            leavingParticipant.anonymousName ||
            leavingParticipant.name ||
            'A participant';

          const leaveMessage =
            `${leavingName} left the room.`;

          setMessages(
            (previousMessages) => {
              /*
               * Do not add a duplicate if the
               * backend message already arrived.
               */
              const alreadyExists =
                previousMessages.some(
                  (message) =>
                    message.type === 'system' &&
                    message.content ===
                      leaveMessage
                );

              if (alreadyExists) {
                return previousMessages;
              }

              const messageId =
                `leave-${leavingId}-${Date.now()}`;

              return [
                ...previousMessages,
                {
                  id: messageId,
                  clientId: messageId,
                  type: 'system',
                  senderId: leavingId,
                  senderName: 'System',
                  content: leaveMessage,
                  timestamp:
                    new Date().toISOString(),
                },
              ];
            }
          );
        }
      }
    );

    // ------------------------------------------------
    // Room information updated
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
    // Successfully joined the room
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
    // A single message was deleted
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
    // Messages cleared
    // ------------------------------------------------

    const offCleared = on(
      'message:cleared',
      () => {
        setMessages([]);
      }
    );

    // ------------------------------------------------
    // Room expired / destroyed
    // ------------------------------------------------

    const offExpired = on(
      'room:expired',
      () => {
        /*
         * The room is gone.
         *
         * Completely clean the old socket and
         * return to home.
         */
        leaveRoomAndGoHome();
      }
    );

    // ------------------------------------------------
    // Current user was removed by host
    // ------------------------------------------------

    const offRemoved = on(
      'room:removed',
      () => {
        /*
         * Completely clean the old socket and
         * return to home.
         */
        leaveRoomAndGoHome();
      }
    );

    // ------------------------------------------------
    // Cleanup event listeners
    // ------------------------------------------------

    return () => {
      offJoined?.();
      offLeft?.();
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

      setMessages((previousMessages) => [
        ...previousMessages,
        {
          id: clientId,
          clientId,
          type: 'text',
          senderId: sessionId,
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
      sessionId,
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
    ]
  );

  // --------------------------------------------------
  // Leave room manually
  // --------------------------------------------------

  const handleLeaveRoom = useCallback(() => {
    /*
     * Tell the backend this is an intentional leave.
     */
    emitLeaveRoom();

    /*
     * Immediately clean the client socket and
     * navigate home.
     */
    leaveRoomAndGoHome();
  }, [
    leaveRoomAndGoHome,
  ]);

  // --------------------------------------------------
  // Lock room
  // --------------------------------------------------

  const handleLockRoom = useCallback(() => {
    emitLockRoom();
  }, []);

  // --------------------------------------------------
  // Unlock room
  // --------------------------------------------------

  const handleUnlockRoom = useCallback(() => {
    emitUnlockRoom();
  }, []);

  // --------------------------------------------------
  // Destroy room
  // --------------------------------------------------

  const handleDestroyRoom =
    useCallback(async () => {
      try {
        /*
         * Wait for the backend acknowledgement.
         */
        await emitDestroyRoom();

        console.log(
          '[RoomContext] Room destruction confirmed'
        );

        /*
         * Do NOT manually navigate here.
         *
         * The backend sends:
         *
         *   room:expired
         *
         * which is handled by offExpired.
         */
      } catch (error) {
        console.error(
          '[RoomContext] Failed to destroy room:',
          error
        );

        /*
         * Keep the host in the room if the
         * server did not confirm destruction.
         */
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
    useCallback((participantId) => {
      emitRemoveParticipant(
        participantId
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

  const value = {
    // ------------------------------------------------
    // Room identity
    // ------------------------------------------------

    roomId,
    sessionId,

    // ------------------------------------------------
    // Encryption
    // ------------------------------------------------

    roomKey,

    // ------------------------------------------------
    // Room state
    // ------------------------------------------------

    room,
    participants,
    messages,

    // ------------------------------------------------
    // Connection
    // ------------------------------------------------

    typingUsers,
    connectionState,
    retryConnection,

    // ------------------------------------------------
    // Replies
    // ------------------------------------------------

    replyTo,
    setReplyTo,

    // ------------------------------------------------
    // Messages
    // ------------------------------------------------

    sendMessage,
    deleteMessage,

    // ------------------------------------------------
    // Files
    // ------------------------------------------------

    sendFile,
    uploadProgress,

    // ------------------------------------------------
    // Typing
    // ------------------------------------------------

    startTyping,
    stopTyping,

    // ------------------------------------------------
    // Ownership
    // ------------------------------------------------

    isOwner,

    // ------------------------------------------------
    // Room controls
    // ------------------------------------------------

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

    // ------------------------------------------------
    // Leave
    // ------------------------------------------------

    leaveRoom:
      handleLeaveRoom,

    // ------------------------------------------------
    // Ready
    // ------------------------------------------------

    ready: Boolean(roomKey),
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