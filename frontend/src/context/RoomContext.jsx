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

  // --------------------------------------------------
  // Reset
  // --------------------------------------------------

  const resetRoomState =
    useCallback(() => {
      setRoomKey(null);
      setRoom(null);
      setParticipants([]);
      setMessages([]);
      setReplyTo(null);
      setUploadProgress(null);
    }, []);

  // --------------------------------------------------
  // Room completely closed
  // --------------------------------------------------

  const leaveRoomAndGoHome =
    useCallback(() => {
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

    if (
      !password ||
      !roomId
    ) {
      setRoomKey(null);

      return undefined;
    }

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
  }, [
    password,
    roomId,
  ]);

  // --------------------------------------------------
  // Socket
  // --------------------------------------------------

  const { send } =
    useSocket({
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
  // Messages
  // --------------------------------------------------

  useEffect(() => {
    if (!roomKey) {
      return undefined;
    }

    const cleanup =
      onMessage(
        (incoming) => {
          setMessages(
            (previousMessages) => {
              const replyToMessageId =
                incoming.replyToMessageId ??
                incoming.replyTo?.messageId ??
                incoming.replyTo?.id ??
                null;

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
            }
          );
        }
      );

    return cleanup;
  }, [roomKey]);

  // --------------------------------------------------
  // Room events
  // --------------------------------------------------

  useEffect(() => {
    if (!roomKey) {
      return undefined;
    }

    // -----------------------------------------------
    // User joined / rejoined
    // -----------------------------------------------

    const offJoined =
      on(
        'room:user-joined',
        (participant) => {
          setParticipants(
            (previousParticipants) => {
              /*
               * Remove any stale copy of this participant
               * first.
               *
               * This handles:
               *
               * old socket -> left
               * new socket -> joined
               */
              const withoutParticipant =
                previousParticipants.filter(
                  (item) =>
                    item.id !==
                      participant.id &&
                    item.sessionId !==
                      participant.sessionId
                );

              return [
                ...withoutParticipant,
                participant,
              ];
            }
          );
        }
      );

    // -----------------------------------------------
    // User left
    // -----------------------------------------------

    const offLeft =
      on(
        'room:user-left',
        ({ id }) => {
          setParticipants(
            (previousParticipants) =>
              previousParticipants.filter(
                (participant) =>
                  participant.id !== id &&
                  participant.sessionId !== id
              )
          );
        }
      );

    // -----------------------------------------------
    // Room updated
    // -----------------------------------------------

    const offRoomUpdate =
      on(
        'room:updated',
        (updatedRoom) => {
          setRoom(
            updatedRoom
          );
        }
      );

    // -----------------------------------------------
    // Initial roster
    // -----------------------------------------------

    const offRoster =
      on(
        'room:joined',
        ({
          room: initialRoom,
          participants:
            initialParticipants,
        }) => {
          setRoom(
            initialRoom
          );

          setParticipants(
            initialParticipants
          );
        }
      );

    // -----------------------------------------------
    // Message deleted
    // -----------------------------------------------

    const offDeleted =
      on(
        'message:delete',
        ({ messageId }) => {
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

    // -----------------------------------------------
    // Messages cleared
    // -----------------------------------------------

    const offCleared =
      on(
        'message:cleared',
        () => {
          setMessages([]);
        }
      );

    // -----------------------------------------------
    // Entire room closed
    // -----------------------------------------------

    const offExpired =
      on(
        'room:expired',
        () => {
          leaveRoomAndGoHome();
        }
      );

    // -----------------------------------------------
    // Current user removed
    // -----------------------------------------------

    const offRemoved =
      on(
        'room:removed',
        () => {
          leaveRoomAndGoHome();
        }
      );

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

  const sendMessage =
    useCallback(
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

              replyTo:
                replyTo
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

  // --------------------------------------------------
  // Delete message
  // --------------------------------------------------

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

  // --------------------------------------------------
  // Send file
  // --------------------------------------------------

  const sendFile =
    useCallback(
      async (file) => {
        if (!roomKey) {
          throw new Error(
            'Room key is not ready'
          );
        }

        setUploadProgress({
          fileName:
            file.name,
          percent: 0,
        });

        try {
          await uploadFile({
            roomId,
            file,
            key: roomKey,
            sessionId,

            onProgress:
              (percent) => {
                setUploadProgress({
                  fileName:
                    file.name,
                  percent,
                });
              },
          });
        } finally {
          setUploadProgress(
            null
          );
        }
      },
      [
        roomId,
        roomKey,
        sessionId,
      ]
    );

  // --------------------------------------------------
  // Manual leave
  // --------------------------------------------------

  const handleLeaveRoom =
    useCallback(() => {
      /*
       * This is an intentional leave.
       *
       * Unlike a reload, the participant session
       * should actually be destroyed.
       */
      emitLeaveRoom();

      leaveRoomAndGoHome();
    }, [
      leaveRoomAndGoHome,
    ]);

  // --------------------------------------------------
  // Room controls
  // --------------------------------------------------

  const handleLockRoom =
    useCallback(() => {
      emitLockRoom();
    }, []);

  const handleUnlockRoom =
    useCallback(() => {
      emitUnlockRoom();
    }, []);

  const handleDestroyRoom =
    useCallback(
      async () => {
        await emitDestroyRoom();
      },
      []
    );

  const handleSetAcceptingNewMembers =
    useCallback(
      (enabled) => {
        emitSetAcceptingNewMembers(
          enabled
        );
      },
      []
    );

  const handleSetFileSharingEnabled =
    useCallback(
      (enabled) => {
        emitSetFileSharingEnabled(
          enabled
        );
      },
      []
    );

  const handleSetMaxParticipants =
    useCallback(
      (maxParticipants) => {
        emitSetMaxParticipants(
          maxParticipants
        );
      },
      []
    );

  const handleExtendExpiration =
    useCallback(
      (minutes) => {
        emitExtendExpiration(
          minutes
        );
      },
      []
    );

  const handleRemoveParticipant =
    useCallback(
      (participantId) => {
        emitRemoveParticipant(
          participantId
        );
      },
      []
    );

  const handleClearMessages =
    useCallback(() => {
      emitClearMessages();
    }, []);

  // --------------------------------------------------
  // Context
  // --------------------------------------------------

  const value = {
    roomId,
    sessionId,

    roomKey,

    room,
    participants,
    messages,

    typingUsers,
    connectionState,
    retryConnection,

    replyTo,
    setReplyTo,

    sendMessage,
    deleteMessage,

    sendFile,
    uploadProgress,

    startTyping,
    stopTyping,

    isOwner,

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

    leaveRoom:
      handleLeaveRoom,

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

// --------------------------------------------------
// useRoom
// --------------------------------------------------

export function useRoom() {
  const context =
    useContext(
      RoomContext
    );

  if (!context) {
    throw new Error(
      'useRoom must be used within a RoomProvider'
    );
  }

  return context;
}