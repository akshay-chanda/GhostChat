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

// ============================================================
// ROOM PROVIDER
// ============================================================

export function RoomProvider({
  roomId,
  sessionId,
  password,
  isOwner,
  onRoomClosed,
  children,
}) {
  const navigate = useNavigate();

  const [roomKey, setRoomKey] =
    useState(null);

  const [room, setRoom] =
    useState(null);

  const [participants, setParticipants] =
    useState([]);

  const [messages, setMessages] =
    useState([]);

  const [replyTo, setReplyTo] =
    useState(null);

  const [uploadProgress, setUploadProgress] =
    useState(null);

  // ==========================================================
  // RESET ROOM STATE
  // ==========================================================

  const resetRoomState = useCallback(() => {
    setRoomKey(null);
    setRoom(null);
    setParticipants([]);
    setMessages([]);
    setReplyTo(null);
    setUploadProgress(null);
  }, []);

  // ==========================================================
  // GO HOME
  // ==========================================================

  const leaveRoomAndGoHome =
    useCallback(() => {
      /*
       * Completely destroy the current client socket.
       *
       * IMPORTANT:
       * This is called only when the room is actually being
       * left/closed/removed/expired.
       */
      disconnectSocket();

      /*
       * Clear all room state.
       */
      resetRoomState();

      /*
       * Navigate away from the room.
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

  // ==========================================================
  // DERIVE ROOM ENCRYPTION KEY
  // ==========================================================

  useEffect(() => {
    let cancelled = false;

    /*
     * No password or room ID means there is no room key.
     */
    if (
      !password ||
      !roomId
    ) {
      setRoomKey(null);

      return undefined;
    }

    /*
     * Clear old room key before deriving the new one.
     */
    setRoomKey(null);

    deriveRoomKey(
      password,
      roomId
    )
      .then((key) => {
        if (!cancelled) {
          setRoomKey(key);
        }
      })
      .catch((error) => {
        console.error(
          '[RoomContext] Failed to derive room key:',
          error
        );

        if (!cancelled) {
          setRoomKey(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    password,
    roomId,
  ]);

  // ==========================================================
  // SOCKET
  // ==========================================================

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

  // ==========================================================
  // RECEIVE MESSAGES
  // ==========================================================

  useEffect(() => {
    if (!roomKey) {
      return undefined;
    }

    const cleanup = onMessage(
      (incoming) => {
        setMessages(
          (previousMessages) => {
            /*
             * SYSTEM MESSAGE DUPLICATE PROTECTION
             */
            if (
              incoming.type === 'system' &&
              incoming.content
            ) {
              const alreadyExists =
                previousMessages.some(
                  (message) =>
                    message.type ===
                      'system' &&
                    message.content ===
                      incoming.content
                );

              if (alreadyExists) {
                return previousMessages;
              }
            }

            // ------------------------------------------------
            // Reply information
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
            // Build incoming message
            // ------------------------------------------------

            const updatedIncomingMessage =
              {
                ...incoming,

                replyTo:
                  originalMessage
                    ? {
                        messageId:
                          originalMessage.id,

                        senderName:
                          originalMessage.senderName,

                        content:
                          originalMessage.content,
                      }
                    : incoming.replyTo ??
                      null,
              };

            // ------------------------------------------------
            // Duplicate normal message protection
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
          }
        );
      }
    );

    return cleanup;
  }, [roomKey]);

  // ==========================================================
  // ROOM EVENTS
  // ==========================================================

  useEffect(() => {
    if (!roomKey) {
      return undefined;
    }

    // ========================================================
    // USER JOINED
    // ========================================================

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

    // ========================================================
    // USER LEFT
    // ========================================================

    const offLeft = on(
      'room:user-left',
      (payload = {}) => {
        const leavingId =
          payload.id ||
          payload.sessionId;

        if (!leavingId) {
          console.warn(
            '[RoomContext] room:user-left without participant id:',
            payload
          );

          return;
        }

        /*
         * Capture the participant before removing them.
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

            return previousParticipants.filter(
              (participant) =>
                participant.id !==
                leavingId
            );
          }
        );

        /*
         * Add a local system message when possible.
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
              const alreadyExists =
                previousMessages.some(
                  (message) =>
                    message.type ===
                      'system' &&
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

    // ========================================================
    // ROOM UPDATED
    // ========================================================

    const offRoomUpdate = on(
      'room:updated',
      (updatedRoom) => {
        if (!updatedRoom) {
          return;
        }

        setRoom(updatedRoom);
      }
    );

    // ========================================================
    // ROOM JOINED
    // ========================================================

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
          Array.isArray(
            initialParticipants
          )
            ? initialParticipants
            : []
        );
      }
    );

    // ========================================================
    // MESSAGE DELETED
    // ========================================================

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
                message.id !==
                messageId
            )
        );
      }
    );

    // ========================================================
    // MESSAGES CLEARED
    // ========================================================

    const offCleared = on(
      'message:cleared',
      () => {
        setMessages([]);
      }
    );

    // ========================================================
    // ROOM EXPIRED / DESTROYED
    // ========================================================

    const offExpired = on(
      'room:expired',
      () => {
        console.log(
          '[RoomContext] Room expired/destroyed'
        );

        /*
         * Server confirmed the room is gone.
         */
        leaveRoomAndGoHome();
      }
    );

    // ========================================================
    // USER REMOVED
    // ========================================================

    const offRemoved = on(
      'room:removed',
      () => {
        console.log(
          '[RoomContext] Current user was removed'
        );

        leaveRoomAndGoHome();
      }
    );

    // ========================================================
    // CLEANUP LISTENERS
    // ========================================================

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

  // ==========================================================
  // SEND MESSAGE
  // ==========================================================

  const sendMessage = useCallback(
    async (content) => {
      const clientId =
        await send(
          content,
          replyTo
        );

      setMessages(
        (previousMessages) => [
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
                  messageId:
                    replyTo.id,

                  senderName:
                    replyTo.senderName,

                  content:
                    replyTo.content,
                }
              : undefined,

            timestamp:
              new Date().toISOString(),
          },
        ]
      );

      setReplyTo(null);
    },
    [
      send,
      replyTo,
      sessionId,
    ]
  );

  // ==========================================================
  // DELETE MESSAGE
  // ==========================================================

  const deleteMessage =
    useCallback(
      (messageId) => {
        emitDeleteMessage(
          messageId
        );

        setMessages(
          (previousMessages) =>
            previousMessages.filter(
              (message) =>
                message.id !==
                messageId
            )
        );
      },
      []
    );

  // ==========================================================
  // SEND FILE
  // ==========================================================

  const sendFile =
    useCallback(
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

            onProgress: (
              percent
            ) => {
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

  // ==========================================================
  // LEAVE ROOM
  // ==========================================================

  const handleLeaveRoom =
    useCallback(() => {
      console.log(
        '[RoomContext] Leaving room'
      );

      /*
       * Tell backend first.
       */
      emitLeaveRoom();

      /*
       * Immediately clean local socket/state and
       * return home.
       */
      leaveRoomAndGoHome();
    }, [
      leaveRoomAndGoHome,
    ]);

  // ==========================================================
  // LOCK ROOM
  // ==========================================================

  const handleLockRoom =
    useCallback(() => {
      emitLockRoom();
    }, []);

  // ==========================================================
  // UNLOCK ROOM
  // ==========================================================

  const handleUnlockRoom =
    useCallback(() => {
      emitUnlockRoom();
    }, []);

  // ==========================================================
  // DESTROY ROOM
  // ==========================================================

  const handleDestroyRoom =
    useCallback(async () => {
      try {
        console.log(
          '[RoomContext] Destroying room...'
        );

        /*
         * Wait until backend confirms destruction.
         */
        await emitDestroyRoom();

        console.log(
          '[RoomContext] Room destruction confirmed'
        );

        /*
         * IMPORTANT:
         *
         * Do NOT call disconnectSocket() here.
         * Do NOT navigate here.
         *
         * The backend sends room:expired to all
         * connected users.
         *
         * offExpired() above handles cleanup.
         */
      } catch (error) {
        console.error(
          '[RoomContext] Failed to destroy room:',
          error
        );
      }
    }, []);

  // ==========================================================
  // ACCEPTING NEW MEMBERS
  // ==========================================================

  const handleSetAcceptingNewMembers =
    useCallback(
      (enabled) => {
        emitSetAcceptingNewMembers(
          enabled
        );
      },
      []
    );

  // ==========================================================
  // FILE SHARING
  // ==========================================================

  const handleSetFileSharingEnabled =
    useCallback(
      (enabled) => {
        emitSetFileSharingEnabled(
          enabled
        );
      },
      []
    );

  // ==========================================================
  // MAX PARTICIPANTS
  // ==========================================================

  const handleSetMaxParticipants =
    useCallback(
      (maxParticipants) => {
        emitSetMaxParticipants(
          maxParticipants
        );
      },
      []
    );

  // ==========================================================
  // EXTEND EXPIRATION
  // ==========================================================

  const handleExtendExpiration =
    useCallback(
      (minutes) => {
        emitExtendExpiration(
          minutes
        );
      },
      []
    );

  // ==========================================================
  // REMOVE PARTICIPANT
  // ==========================================================

  const handleRemoveParticipant =
    useCallback(
      (participantId) => {
        emitRemoveParticipant(
          participantId
        );
      },
      []
    );

  // ==========================================================
  // CLEAR MESSAGES
  // ==========================================================

  const handleClearMessages =
    useCallback(() => {
      emitClearMessages();
    }, []);

  // ==========================================================
  // CONTEXT VALUE
  // ==========================================================

  const value = {
    // --------------------------------------------------------
    // Room identity
    // --------------------------------------------------------

    roomId,
    sessionId,

    // --------------------------------------------------------
    // Encryption
    // --------------------------------------------------------

    roomKey,

    // --------------------------------------------------------
    // Room state
    // --------------------------------------------------------

    room,
    participants,
    messages,

    // --------------------------------------------------------
    // Connection
    // --------------------------------------------------------

    typingUsers,
    connectionState,
    retryConnection,

    // --------------------------------------------------------
    // Replies
    // --------------------------------------------------------

    replyTo,
    setReplyTo,

    // --------------------------------------------------------
    // Messages
    // --------------------------------------------------------

    sendMessage,
    deleteMessage,

    // --------------------------------------------------------
    // Files
    // --------------------------------------------------------

    sendFile,
    uploadProgress,

    // --------------------------------------------------------
    // Typing
    // --------------------------------------------------------

    startTyping,
    stopTyping,

    // --------------------------------------------------------
    // Ownership
    // --------------------------------------------------------

    isOwner,

    // --------------------------------------------------------
    // Room controls
    // --------------------------------------------------------

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

    // --------------------------------------------------------
    // Leave
    // --------------------------------------------------------

    leaveRoom:
      handleLeaveRoom,

    // --------------------------------------------------------
    // Ready
    // --------------------------------------------------------

    ready:
      Boolean(roomKey),
  };

  return (
    <RoomContext.Provider
      value={value}
    >
      {children}
    </RoomContext.Provider>
  );
}

// ============================================================
// USE ROOM
// ============================================================

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