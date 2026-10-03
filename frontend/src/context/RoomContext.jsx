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
  const [uploadProgress, setUploadProgress] = useState(null);

  /*
   * Tracks whether the current user intentionally
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
  }, [resetRoomState, navigate]);

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
  }, [resetRoomState, onRoomClosed, navigate]);

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
      if (!incoming) {
        return;
      }

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
                message.content === incoming.content &&
                message.timestamp === incoming.timestamp
            );

          if (alreadyExists) {
            return previousMessages;
          }
        }

        // ----------------------------------------------
        // Resolve reply information
        // ----------------------------------------------

        const replyToMessageId =
          incoming.replyToMessageId ??
          incoming.replyTo?.messageId ??
          incoming.replyTo?.id ??
          null;

        const originalMessage =
          replyToMessageId
            ? previousMessages.find(
                (message) =>
                  message.id === replyToMessageId ||
                  message.clientId === replyToMessageId
              )
            : null;

        const updatedIncomingMessage = {
          ...incoming,

          replyTo: originalMessage
            ? {
                messageId: originalMessage.id,
                senderName: originalMessage.senderName,
                content: originalMessage.content,
              }
            : incoming.replyTo ?? null,
        };

        // ----------------------------------------------
        // Prevent duplicate normal messages
        // ----------------------------------------------

        if (incoming.clientId) {
          const existingMessage =
            previousMessages.find(
              (message) =>
                message.clientId === incoming.clientId
            );

          if (existingMessage) {
            return previousMessages.map(
              (message) =>
                message.clientId === incoming.clientId
                  ? {
                      ...message,
                      ...updatedIncomingMessage,
                    }
                  : message
            );
          }
        }

        // ----------------------------------------------
        // Prevent duplicate file messages
        // ----------------------------------------------

        if (
          incoming.type === 'file' &&
          incoming.id
        ) {
          const existingFile =
            previousMessages.some(
              (message) =>
                message.id === incoming.id
            );

          if (existingFile) {
            return previousMessages;
          }
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
                  item.id === participant.id
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
        /*
         * IMPORTANT:
         *
         * The backend sends the PUBLIC participantId
         * as `id`.
         *
         * Never use sessionId as a public participant ID.
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
         * The backend creates the authoritative
         * system message.
         *
         * Therefore we only update the roster here.
         */
        setParticipants(
          (previousParticipants) =>
            previousParticipants.filter(
              (participant) =>
                participant.id !== leavingId
            )
        );
      }
    );

    // ------------------------------------------------
    // Participant removed by host
    // ------------------------------------------------

    const offRemovedParticipant = on(
      'room:user-removed',
      (payload = {}) => {
        const removedId = payload.id;

        if (!removedId) {
          console.warn(
            '[RoomContext] room:user-removed received without participant id:',
            payload
          );

          return;
        }

        setParticipants(
          (previousParticipants) =>
            previousParticipants.filter(
              (participant) =>
                participant.id !== removedId
            )
        );
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
    // Successfully joined room
    // ------------------------------------------------

    const offRoster = on(
      'room:joined',
      ({
        room: initialRoom,
        participants: initialParticipants,
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
    // Message deleted
    // ------------------------------------------------

    const offDeleted = on(
      'message:delete',
      ({ messageId } = {}) => {
        if (!messageId) {
          return;
        }

        /*
         * The backend is authoritative for deletion.
         *
         * This event is sent after:
         *
         * 1. Ownership was verified.
         * 2. File/voice encrypted bytes were deleted.
         * 3. File metadata was deleted.
         * 4. The message was removed from memoryStore.
         *
         * Therefore BOTH the sender and all receivers
         * remove the message here.
         */
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
         * If THIS USER intentionally destroyed
         * the room, return directly to Home.
         */
        if (destroyingRoomRef.current) {
          destroyingRoomRef.current = false;

          leaveRoomAndGoHome();

          return;
        }

        handleRoomClosed();
      }
    );

    // ------------------------------------------------
    // Current user removed by host
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
  // Send text message
  // --------------------------------------------------

  const sendMessage = useCallback(
    async (content) => {
      if (!roomKey) {
        throw new Error(
          'Room encryption is not ready'
        );
      }

      if (!sessionId || !sessionSecret) {
        throw new Error(
          'Session authentication is not ready'
        );
      }

      const cleanContent =
        typeof content === 'string'
          ? content
          : String(content ?? '');

      if (!cleanContent.trim()) {
        return;
      }

      const clientId = await send(
        cleanContent,
        replyTo
      );

      /*
       * participantId is PUBLIC.
       *
       * sessionId/sessionSecret are PRIVATE and
       * must never be used as senderId.
       */
      const currentParticipantId =
        participantId || null;

      setMessages((previousMessages) => [
        ...previousMessages,
        {
          id: clientId,
          clientId,
          type: 'text',
          senderId: currentParticipantId,
          senderName: 'You',
          content: cleanContent,

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
      roomKey,
      sessionId,
      sessionSecret,
      send,
      replyTo,
      participantId,
    ]
  );

  // --------------------------------------------------
  // Delete message
  // --------------------------------------------------

  const deleteMessage = useCallback(
    (message) => {
      /*
       * ChatWindow passes the COMPLETE message object.
       *
       * Text message:
       *   message.id
       *
       * Voice/file message:
       *   message.id
       *   message.file.id
       *
       * The backend uses message.id as the authoritative
       * message identifier.
       */
      if (!message) {
        return;
      }

      /*
       * Keep compatibility with callers that may still
       * pass a plain message ID.
       */
      const messageId =
        typeof message === 'string'
          ? message
          : message.id;

      if (!messageId) {
        console.warn(
          '[RoomContext] Cannot delete message without an ID:',
          message
        );

        return;
      }

      /*
       * IMPORTANT:
       *
       * Do NOT remove the message locally here.
       *
       * The backend is responsible for:
       *
       * 1. Authenticating the requester.
       * 2. Verifying message ownership.
       * 3. Deleting encrypted file/voice bytes.
       * 4. Deleting file metadata.
       * 5. Removing the message from memoryStore.
       * 6. Broadcasting message:delete to everyone.
       *
       * The `message:delete` listener above then removes
       * the message from this client's UI.
       */
      emitDeleteMessage(messageId);
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

      if (!sessionId || !sessionSecret) {
        throw new Error(
          'Session authentication is not ready'
        );
      }

      if (!file) {
        throw new Error(
          'File is missing'
        );
      }

      setUploadProgress({
        fileName:
          file.name || 'File',
        percent: 0,
      });

      try {
        /*
         * uploadFile() encrypts the file locally before
         * sending anything to the backend.
         */
        const result =
          await uploadFile({
            roomId,
            file,
            key: roomKey,
            sessionId,
            sessionSecret,

            onProgress: (percent) => {
              setUploadProgress({
                fileName:
                  file.name || 'File',
                percent:
                  Number.isFinite(
                    Number(percent)
                  )
                    ? Math.min(
                        100,
                        Math.max(
                          0,
                          Number(percent)
                        )
                      )
                    : 0,
              });
            },
          });

        return result;
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
  // Send voice message
  // --------------------------------------------------

  const sendVoiceMessage = useCallback(
    async (
      audioBlob,
      {
        duration = 0,
        mimeType,
      } = {}
    ) => {
      if (!audioBlob) {
        throw new Error(
          'Voice recording is missing'
        );
      }

      if (!(audioBlob instanceof Blob)) {
        throw new Error(
          'Voice recording is invalid'
        );
      }

      if (audioBlob.size <= 0) {
        throw new Error(
          'Voice recording is empty'
        );
      }

      /*
       * Voice messages use the same encrypted file
       * upload architecture as normal attachments.
       *
       * No plaintext audio is sent to the backend.
       */
      const actualMimeType =
        mimeType ||
        audioBlob.type ||
        'audio/webm';

      let extension = 'webm';

      if (
        actualMimeType
          .toLowerCase()
          .includes('ogg')
      ) {
        extension = 'ogg';
      } else if (
        actualMimeType
          .toLowerCase()
          .includes('mp4')
      ) {
        extension = 'm4a';
      }

      const timestamp = Date.now();

      const audioFile = new File(
        [audioBlob],
        `voice-message-${timestamp}.${extension}`,
        {
          type: actualMimeType,
          lastModified: timestamp,
        }
      );

      const result =
        await sendFile(audioFile);

      /*
       * The backend file message contains the encrypted
       * audio metadata required by remote clients.
       *
       * Duration is retained locally in this return value.
       */
      const numericDuration =
        Number(duration);

      return {
        ...result,
        voice: true,
        duration:
          Number.isFinite(
            numericDuration
          )
            ? Math.max(
                0,
                numericDuration
              )
            : 0,
        mimeType: actualMimeType,
      };
    },
    [sendFile]
  );

  // --------------------------------------------------
  // Leave room manually
  // --------------------------------------------------

  const handleLeaveRoom = useCallback(() => {
    /*
     * Explicitly tell the backend that this user
     * is leaving before navigating away.
     */
    emitLeaveRoom();

    leaveRoomAndGoHome();
  }, [leaveRoomAndGoHome]);

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
        Boolean(enabled)
      );
    }, []);

  // --------------------------------------------------
  // File sharing
  // --------------------------------------------------

  const handleSetFileSharingEnabled =
    useCallback((enabled) => {
      emitSetFileSharingEnabled(
        Boolean(enabled)
      );
    }, []);

  // --------------------------------------------------
  // Maximum participants
  // --------------------------------------------------

  const handleSetMaxParticipants =
    useCallback((maxParticipants) => {
      const numericValue =
        Number(maxParticipants);

      if (
        !Number.isFinite(numericValue) ||
        numericValue <= 0
      ) {
        return;
      }

      emitSetMaxParticipants(
        numericValue
      );
    }, []);

  // --------------------------------------------------
  // Extend expiration
  // --------------------------------------------------

  const handleExtendExpiration =
    useCallback((minutes) => {
      const numericMinutes =
        Number(minutes);

      if (
        !Number.isFinite(
          numericMinutes
        ) ||
        numericMinutes <= 0
      ) {
        return;
      }

      emitExtendExpiration(
        numericMinutes
      );
    }, []);

  // --------------------------------------------------
  // Remove participant
  // --------------------------------------------------

  const handleRemoveParticipant =
    useCallback(
      (targetParticipantId) => {
        /*
         * targetParticipantId is PUBLIC.
         *
         * Never send another participant's
         * sessionId.
         */
        if (!targetParticipantId) {
          return;
        }

        emitRemoveParticipant(
          targetParticipantId
        );
      },
      []
    );

  // --------------------------------------------------
  // Clear messages
  // --------------------------------------------------

  const handleClearMessages =
    useCallback(() => {
      emitClearMessages();
    }, []);

  // --------------------------------------------------
  // Current participant
  // --------------------------------------------------

  /*
   * Find the current user using PUBLIC
   * participantId only.
   */
  const currentParticipant =
    participantId
      ? participants.find(
          (participant) =>
            participant.id ===
            participantId
        ) || null
      : null;

  // --------------------------------------------------
  // Context value
  // --------------------------------------------------

  const value = {
    // ----------------------------------------------
    // Room identity
    // ----------------------------------------------

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

    // ----------------------------------------------
    // Encryption
    // ----------------------------------------------

    roomKey,

    // ----------------------------------------------
    // Room state
    // ----------------------------------------------

    room,
    participants,
    messages,

    // ----------------------------------------------
    // Connection
    // ----------------------------------------------

    typingUsers,
    connectionState,
    retryConnection,

    // ----------------------------------------------
    // Replies
    // ----------------------------------------------

    replyTo,
    setReplyTo,

    // ----------------------------------------------
    // Messages
    // ----------------------------------------------

    sendMessage,
    deleteMessage,

    // ----------------------------------------------
    // Files / Voice
    // ----------------------------------------------

    sendFile,
    sendVoiceMessage,
    uploadProgress,

    // ----------------------------------------------
    // Typing
    // ----------------------------------------------

    startTyping,
    stopTyping,

    // ----------------------------------------------
    // Ownership
    // ----------------------------------------------

    isOwner,

    // ----------------------------------------------
    // Room controls
    // ----------------------------------------------

    lockRoom: handleLockRoom,
    unlockRoom: handleUnlockRoom,

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

    // ----------------------------------------------
    // Leave
    // ----------------------------------------------

    leaveRoom:
      handleLeaveRoom,

    // ----------------------------------------------
    // Ready
    // ----------------------------------------------

    ready: Boolean(
      roomKey &&
      sessionId &&
      sessionSecret
    ),
  };

  return (
    <RoomContext.Provider value={value}>
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