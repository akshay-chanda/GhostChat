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
    resetRoomState();

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
         * The backend sends:
         *
         *   message:new
         *
         * when someone leaves.
         *
         * The room:user-left handler below can also
         * create a local fallback message.
         *
         * Therefore, don't add the same system message
         * twice.
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

        // Add the new message.
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
         * Find the participant BEFORE removing them.
         *
         * We need their anonymous name for the
         * chat system message.
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
             * Remove immediately from the Online
             * participant list.
             */
            const updatedParticipants =
              previousParticipants.filter(
                (participant) =>
                  participant.id !==
                  leavingId
              );

            return updatedParticipants;
          }
        );

        /*
         * React state updates are scheduled, so
         * leavingParticipant may not be available
         * synchronously after setParticipants().
         *
         * Therefore, if the backend already sends
         * message:new, that message is responsible
         * for the chat update.
         *
         * We only create a fallback here when the
         * participant information is available.
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
               * backend message has already arrived.
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
        leaveRoomAndGoHome();
      }
    );

    // ------------------------------------------------
    // Current user was removed by host.
    // ------------------------------------------------

    const offRemoved = on(
      'room:removed',
      () => {
        leaveRoomAndGoHome();
      }
    );

    // ------------------------------------------------
    // Cleanup
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
     * This is an intentional leave.
     *
     * Do not change this to socket.disconnect()
     * before emitting room:leave.
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
        /*
         * Wait for the backend acknowledgement.
         */
        await emitDestroyRoom();

        console.log(
          '[RoomContext] Room destruction confirmed'
        );

        /*
         * Do NOT navigate manually here.
         *
         * The backend sends room:expired,
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
    // Room identity
    roomId,
    sessionId,

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