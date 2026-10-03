import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';

import {
  Reply,
  Copy,
  Trash2,
  FileText,
  Download,
  Check,
  Mic,
  Play,
  Pause,
  Loader2,
} from 'lucide-react';

import { useRoom } from '../../context/RoomContext';

import {
  downloadAndDecryptFile,
} from '../../services/fileService';

// --------------------------------------------------
// WAVEFORM
// --------------------------------------------------

const WAVEFORM_BARS = [
  12, 18, 10, 24, 16, 28, 20, 14,
  25, 18, 31, 22, 14, 27, 34, 21,
  17, 29, 23, 15, 32, 25, 18, 28,
  20, 34, 26, 16, 30, 22, 13, 27,
  19, 32, 24, 17, 29, 21, 14, 26,
  18, 30, 23, 16, 28, 20, 13, 24,
  17, 29, 22, 15, 27, 19, 12, 23,
  16, 28, 21, 14, 26, 18, 11, 22,
];

// --------------------------------------------------
// FORMAT TIME
// --------------------------------------------------

function formatTime(timestamp) {
  if (!timestamp) {
    return '';
  }

  const date = new Date(timestamp);

  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return date.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
}

// --------------------------------------------------
// FORMAT FILE SIZE
// --------------------------------------------------

function formatFileSize(bytes) {
  if (
    bytes === undefined ||
    bytes === null ||
    Number.isNaN(Number(bytes)) ||
    Number(bytes) < 0
  ) {
    return 'Unknown size';
  }

  const size = Number(bytes);

  if (size === 0) {
    return '0 B';
  }

  if (size < 1024) {
    return `${size} B`;
  }

  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }

  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

// --------------------------------------------------
// FORMAT AUDIO DURATION
// --------------------------------------------------

function formatAudioDuration(seconds) {
  if (
    seconds === undefined ||
    seconds === null ||
    !Number.isFinite(Number(seconds)) ||
    Number(seconds) < 0
  ) {
    return '0:00';
  }

  const totalSeconds = Math.floor(
    Number(seconds)
  );

  const minutes = Math.floor(
    totalSeconds / 60
  );

  const remainingSeconds =
    totalSeconds % 60;

  return `${minutes}:${String(
    remainingSeconds
  ).padStart(2, '0')}`;
}

// --------------------------------------------------
// CALCULATE AUDIO BLOB DURATION
// --------------------------------------------------

async function getAudioBlobDuration(blob) {
  if (
    !(blob instanceof Blob) ||
    blob.size === 0
  ) {
    return null;
  }

  let audioContext = null;

  try {
    const AudioContextClass =
      window.AudioContext ||
      window.webkitAudioContext;

    if (!AudioContextClass) {
      return null;
    }

    audioContext =
      new AudioContextClass();

    const arrayBuffer =
      await blob.arrayBuffer();

    const audioBuffer =
      await audioContext.decodeAudioData(
        arrayBuffer
      );

    const duration =
      Number(audioBuffer.duration);

    if (
      Number.isFinite(duration) &&
      duration > 0
    ) {
      return duration;
    }

    return null;
  } catch (error) {
    console.warn(
      'Could not calculate voice duration:',
      error
    );

    return null;
  } finally {
    if (audioContext) {
      try {
        await audioContext.close();
      } catch {
        // Ignore AudioContext cleanup errors.
      }
    }
  }
}

// --------------------------------------------------
// NORMALIZE AUDIO MIME TYPE
// --------------------------------------------------

function normalizeAudioMimeType(
  mimeType,
  fileName
) {
  const rawMime =
    typeof mimeType === 'string'
      ? mimeType.trim().toLowerCase()
      : '';

  if (
    rawMime.startsWith('audio/webm')
  ) {
    return 'audio/webm';
  }

  if (
    rawMime.startsWith('audio/ogg')
  ) {
    return 'audio/ogg';
  }

  if (
    rawMime.startsWith('audio/mp4') ||
    rawMime.startsWith('audio/m4a')
  ) {
    return 'audio/mp4';
  }

  if (
    rawMime === 'video/webm'
  ) {
    return 'audio/webm';
  }

  const name =
    typeof fileName === 'string'
      ? fileName.toLowerCase()
      : '';

  if (name.endsWith('.webm')) {
    return 'audio/webm';
  }

  if (name.endsWith('.ogg')) {
    return 'audio/ogg';
  }

  if (
    name.endsWith('.m4a') ||
    name.endsWith('.mp4')
  ) {
    return 'audio/mp4';
  }

  return 'audio/webm';
}

// --------------------------------------------------
// CONVERT DATA TO BLOB
// --------------------------------------------------

function convertToBlob(
  data,
  mimeType
) {
  if (!data) {
    return null;
  }

  if (data instanceof Blob) {
    if (
      mimeType &&
      data.type !== mimeType
    ) {
      return new Blob(
        [data],
        {
          type: mimeType,
        }
      );
    }

    return data;
  }

  if (
    data instanceof ArrayBuffer
  ) {
    return new Blob(
      [data],
      {
        type: mimeType,
      }
    );
  }

  if (
    data instanceof Uint8Array ||
    ArrayBuffer.isView(data)
  ) {
    return new Blob(
      [data],
      {
        type: mimeType,
      }
    );
  }

  return null;
}

// --------------------------------------------------
// MESSAGE BUBBLE
// --------------------------------------------------

export default function MessageBubble({
  message,
  isOwn,
  grouped,
  onDelete,
  onReply,
}) {
  const {
    roomKey,
    sessionId,
    sessionSecret,
  } = useRoom();

  // ------------------------------------------------
  // GENERAL STATE
  // ------------------------------------------------

  const [copied, setCopied] =
    useState(false);

  const [downloading, setDownloading] =
    useState(false);

  // ------------------------------------------------
  // VOICE STATE
  // ------------------------------------------------

  const [voiceLoading, setVoiceLoading] =
    useState(false);

  const [voiceUrl, setVoiceUrl] =
    useState(null);

  const [voiceDuration, setVoiceDuration] =
    useState(null);

  const [voiceCurrentTime, setVoiceCurrentTime] =
    useState(0);

  const [voicePlaying, setVoicePlaying] =
    useState(false);

  const [voiceError, setVoiceError] =
    useState(null);

  const audioRef =
    useRef(null);

  const voiceUrlRef =
    useRef(null);

  const mountedRef =
    useRef(true);

  const preparingVoiceRef =
    useRef(null);

  // ------------------------------------------------
  // MESSAGE DATA
  // ------------------------------------------------

  const {
    senderName,
    timestamp,
    content,
    file,
    replyTo,
  } = message || {};

  // ------------------------------------------------
  // FILE DATA
  // ------------------------------------------------

  const rawFileData =
    message?.decryptedBlob ||
    file?.blob ||
    message?.fileBlob ||
    file?.data ||
    null;

  const fileName =
    message?.filename ||
    message?.fileName ||
    file?.originalName ||
    file?.filename ||
    'download';

  const rawFileMimeType =
    message?.mimeType ||
    file?.mimeType ||
    file?.type ||
    'application/octet-stream';

  const fileSize =
    message?.fileSize ??
    file?.size ??
    (rawFileData instanceof Blob
      ? rawFileData.size
      : 0);

  const downloadUrl =
    message?.downloadUrl ||
    message?.downloadURL ||
    message?.url ||
    file?.downloadUrl ||
    file?.downloadURL ||
    file?.url ||
    null;

  const fileIv =
    message?.iv ||
    message?.fileIv ||
    message?.fileIV ||
    file?.iv ||
    file?.fileIv ||
    null;

  const isFileMessage =
    message?.type === 'file' ||
    Boolean(file) ||
    Boolean(rawFileData) ||
    Boolean(downloadUrl);

  const isAudioMessage =
    isFileMessage &&
    (
      (
        typeof rawFileMimeType === 'string' &&
        rawFileMimeType
          .toLowerCase()
          .startsWith('audio/')
      ) ||
      (
        typeof fileName === 'string' &&
        /\.(webm|ogg|m4a|mp4)$/i.test(
          fileName
        )
      )
    );

  const audioMimeType =
    isAudioMessage
      ? normalizeAudioMimeType(
          rawFileMimeType,
          fileName
        )
      : rawFileMimeType;

  // ------------------------------------------------
  // REPLY PREVIEW
  // ------------------------------------------------

  const replyPreview = replyTo
    ? {
        senderName:
          replyTo.senderName ||
          'Anonymous User',

        content:
          replyTo.content ||
          replyTo.text ||
          'Original message unavailable',
      }
    : null;

  // ------------------------------------------------
  // MOUNT STATE
  // ------------------------------------------------

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
    };
  }, []);

  // ------------------------------------------------
  // AUDIO URL CLEANUP
  // ------------------------------------------------

  useEffect(() => {
    voiceUrlRef.current =
      voiceUrl;

    return () => {
      if (voiceUrl) {
        URL.revokeObjectURL(
          voiceUrl
        );
      }
    };
  }, [voiceUrl]);

  // ------------------------------------------------
  // MESSAGE CHANGE CLEANUP
  // ------------------------------------------------

  useEffect(() => {
    const audio =
      audioRef.current;

    preparingVoiceRef.current =
      null;

    if (audio) {
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
    }

    setVoiceUrl(null);
    setVoiceDuration(null);
    setVoiceCurrentTime(0);
    setVoicePlaying(false);
    setVoiceError(null);
    setVoiceLoading(false);
  }, [message?.id]);

  // ------------------------------------------------
  // GET DECRYPTED FILE
  // ------------------------------------------------

  const getDecryptedFile =
    useCallback(
      async () => {
        if (rawFileData) {
          const localBlob =
            convertToBlob(
              rawFileData,
              isAudioMessage
                ? audioMimeType
                : rawFileMimeType
            );

          if (localBlob) {
            return localBlob;
          }
        }

        if (!downloadUrl) {
          throw new Error(
            'File download URL is missing'
          );
        }

        if (!fileIv) {
          throw new Error(
            'File IV is missing'
          );
        }

        if (!roomKey) {
          throw new Error(
            'Room encryption key is missing'
          );
        }

        if (!sessionId) {
          throw new Error(
            'Session ID is missing'
          );
        }

        if (!sessionSecret) {
          throw new Error(
            'Session secret is missing'
          );
        }

        const decryptedBlob =
          await downloadAndDecryptFile({
            downloadUrl,
            iv: fileIv,
            mimeType:
              isAudioMessage
                ? audioMimeType
                : rawFileMimeType,
            key: roomKey,
            sessionId,
            sessionSecret,
          });

        if (
          !(decryptedBlob instanceof Blob)
        ) {
          throw new Error(
            'Decrypted file is not a valid Blob'
          );
        }

        if (
          decryptedBlob.size === 0
        ) {
          throw new Error(
            'Decrypted file is empty'
          );
        }

        if (isAudioMessage) {
          return new Blob(
            [decryptedBlob],
            {
              type: audioMimeType,
            }
          );
        }

        return decryptedBlob;
      },
      [
        rawFileData,
        isAudioMessage,
        audioMimeType,
        rawFileMimeType,
        downloadUrl,
        fileIv,
        roomKey,
        sessionId,
        sessionSecret,
      ]
    );

  // ------------------------------------------------
  // ATTACH AUDIO URL
  // ------------------------------------------------

  const attachVoiceUrl =
    useCallback(
      async (objectUrl) => {
        const audio =
          audioRef.current;

        if (!audio) {
          return false;
        }

        audio.pause();

        audio.src =
          objectUrl;

        audio.preload =
          'metadata';

        audio.load();

        if (
          audio.readyState >= 1
        ) {
          return true;
        }

        await new Promise(
          (resolve, reject) => {
            let finished = false;

            const cleanup = () => {
              audio.removeEventListener(
                'loadedmetadata',
                handleLoadedMetadata
              );

              audio.removeEventListener(
                'canplay',
                handleCanPlay
              );

              audio.removeEventListener(
                'error',
                handleError
              );
            };

            const finish = () => {
              if (finished) {
                return;
              }

              finished = true;
              cleanup();
              resolve();
            };

            const fail = () => {
              if (finished) {
                return;
              }

              finished = true;
              cleanup();

              const code =
                audio.error?.code;

              const errorMessage =
                audio.error?.message ||
                'Browser could not decode the audio file.';

              reject(
                new Error(
                  `Audio decode failed${code ? ` (code ${code})` : ''}: ${errorMessage}`
                )
              );
            };

            const handleLoadedMetadata =
              () => {
                finish();
              };

            const handleCanPlay =
              () => {
                finish();
              };

            const handleError =
              () => {
                fail();
              };

            audio.addEventListener(
              'loadedmetadata',
              handleLoadedMetadata
            );

            audio.addEventListener(
              'canplay',
              handleCanPlay
            );

            audio.addEventListener(
              'error',
              handleError
            );

            if (
              audio.readyState >= 1
            ) {
              finish();
            }
          }
        );

        return true;
      },
      []
    );

  // ------------------------------------------------
  // PREPARE VOICE MESSAGE
  // ------------------------------------------------

  const prepareVoiceMessage =
    useCallback(
      async () => {
        if (!isAudioMessage) {
          return null;
        }

        if (
          voiceUrlRef.current
        ) {
          return voiceUrlRef.current;
        }

        if (
          preparingVoiceRef.current
        ) {
          return preparingVoiceRef.current;
        }

        const promise =
          (async () => {
            let objectUrl = null;

            try {
              setVoiceLoading(true);
              setVoiceError(null);

              const browserSupport =
                typeof document !==
                  'undefined' &&
                document.createElement(
                  'audio'
                );

              if (
                browserSupport &&
                typeof browserSupport.canPlayType ===
                  'function'
              ) {
                const support =
                  browserSupport.canPlayType(
                    audioMimeType
                  );

                console.log(
                  'Voice browser support:',
                  {
                    mimeType:
                      audioMimeType,
                    canPlayType:
                      support,
                    fileName,
                  }
                );
              }

              const decryptedBlob =
                await getDecryptedFile();

              if (
                !(decryptedBlob instanceof Blob)
              ) {
                throw new Error(
                  'Audio data is not a valid Blob.'
                );
              }

              if (
                decryptedBlob.size === 0
              ) {
                throw new Error(
                  'Audio data is empty.'
                );
              }

              const playbackMimeType =
                normalizeAudioMimeType(
                  decryptedBlob.type ||
                    audioMimeType,
                  fileName
                );

              const audioBlob =
                new Blob(
                  [decryptedBlob],
                  {
                    type:
                      playbackMimeType,
                  }
                );

              if (
                audioBlob.size === 0
              ) {
                throw new Error(
                  'Audio data is empty.'
                );
              }

              objectUrl =
                URL.createObjectURL(
                  audioBlob
                );

              if (
                !mountedRef.current
              ) {
                URL.revokeObjectURL(
                  objectUrl
                );

                objectUrl = null;

                return null;
              }

              voiceUrlRef.current =
                objectUrl;

              const attached =
                await attachVoiceUrl(
                  objectUrl
                );

              if (!attached) {
                throw new Error(
                  'Audio player is not available.'
                );
              }

              if (
                !mountedRef.current
              ) {
                URL.revokeObjectURL(
                  objectUrl
                );

                voiceUrlRef.current =
                  null;

                objectUrl = null;

                return null;
              }

              setVoiceUrl(
                objectUrl
              );

              // ----------------------------------------
              // CALCULATE REAL AUDIO DURATION
              // ----------------------------------------

              let calculatedDuration =
                null;

              try {
                calculatedDuration =
                  await getAudioBlobDuration(
                    audioBlob
                  );

                console.log(
                  'Voice duration calculated:',
                  {
                    duration:
                      calculatedDuration,
                    formatted:
                      calculatedDuration !==
                        null
                        ? formatAudioDuration(
                            calculatedDuration
                          )
                        : null,
                  }
                );
              } catch (
                durationError
              ) {
                console.warn(
                  'Voice duration calculation failed:',
                  durationError
                );
              }

              if (
                calculatedDuration !==
                null
              ) {
                setVoiceDuration(
                  calculatedDuration
                );
              } else {
                setVoiceDuration(
                  null
                );
              }

              setVoiceCurrentTime(
                0
              );

              setVoiceError(null);

              console.log(
                'Voice playback prepared:',
                {
                  mimeType:
                    playbackMimeType,
                  size:
                    audioBlob.size,
                  fileName,
                  readyState:
                    audioRef.current
                      ?.readyState,
                  browserDuration:
                    audioRef.current
                      ?.duration,
                  calculatedDuration,
                }
              );

              return objectUrl;
            } catch (error) {
              console.error(
                'Voice message load failed:',
                error
              );

              if (
                mountedRef.current
              ) {
                setVoiceError(
                  error?.message ||
                    'Unable to load this voice message.'
                );
              }

              if (
                objectUrl &&
                objectUrl !==
                  voiceUrlRef.current
              ) {
                URL.revokeObjectURL(
                  objectUrl
                );
              }

              return null;
            } finally {
              preparingVoiceRef.current =
                null;

              if (
                mountedRef.current
              ) {
                setVoiceLoading(
                  false
                );
              }
            }
          })();

        preparingVoiceRef.current =
          promise;

        return promise;
      },
      [
        isAudioMessage,
        audioMimeType,
        fileName,
        getDecryptedFile,
        attachVoiceUrl,
      ]
    );

  // ------------------------------------------------
  // PRELOAD VOICE
  // ------------------------------------------------

  useEffect(() => {
    if (!isAudioMessage) {
      return;
    }

    let cancelled = false;

    const preload =
      async () => {
        if (cancelled) {
          return;
        }

        await prepareVoiceMessage();
      };

    preload();

    return () => {
      cancelled = true;
    };
  }, [
    isAudioMessage,
    message?.id,
    prepareVoiceMessage,
  ]);

  // ------------------------------------------------
  // COPY
  // ------------------------------------------------

  const handleCopy =
    async () => {
      if (!content) {
        return;
      }

      try {
        await navigator.clipboard.writeText(
          content
        );

        setCopied(true);

        setTimeout(() => {
          if (mountedRef.current) {
            setCopied(false);
          }
        }, 1500);
      } catch (error) {
        console.error(
          'Copy failed:',
          error
        );
      }
    };

  // ------------------------------------------------
  // CREATE DOWNLOAD
  // ------------------------------------------------

  const triggerBlobDownload =
    (
      blob,
      filename
    ) => {
      if (
        !(blob instanceof Blob)
      ) {
        throw new Error(
          'Downloaded data is not a valid Blob'
        );
      }

      const downloadObjectUrl =
        URL.createObjectURL(
          blob
        );

      const link =
        document.createElement(
          'a'
        );

      link.href =
        downloadObjectUrl;

      link.download =
        filename || 'download';

      link.style.display =
        'none';

      document.body.appendChild(
        link
      );

      link.click();

      link.remove();

      setTimeout(() => {
        URL.revokeObjectURL(
          downloadObjectUrl
        );
      }, 1500);
    };

  // ------------------------------------------------
  // PLAY / PAUSE
  // ------------------------------------------------

  const handleVoicePlayPause =
    async () => {
      const audio =
        audioRef.current;

      if (!audio) {
        setVoiceError(
          'Audio player is not available.'
        );

        return;
      }

      try {
        setVoiceError(null);

        if (
          !voiceUrlRef.current
        ) {
          await prepareVoiceMessage();
        }

        const preparedUrl =
          voiceUrlRef.current;

        if (!preparedUrl) {
          return;
        }

        const currentAudio =
          audioRef.current;

        if (!currentAudio) {
          setVoiceError(
            'Audio player is no longer available.'
          );

          return;
        }

        if (
          currentAudio.src !==
          preparedUrl
        ) {
          currentAudio.src =
            preparedUrl;

          currentAudio.load();
        }

        if (
          currentAudio.paused
        ) {
          console.log(
            'Starting voice playback:',
            {
              readyState:
                currentAudio.readyState,
              networkState:
                currentAudio.networkState,
              src:
                currentAudio.src,
              duration:
                currentAudio.duration,
              calculatedDuration:
                voiceDuration,
            }
          );

          await currentAudio.play();
        } else {
          currentAudio.pause();
        }
      } catch (error) {
        if (
          error?.name ===
          'AbortError'
        ) {
          console.warn(
            'Voice playback was interrupted:',
            error?.message
          );

          return;
        }

        console.error(
          'Voice play/pause failed:',
          {
            error,
            message:
              error?.message,
            name:
              error?.name,
            mediaError:
              audioRef.current?.error
                ? {
                    code:
                      audioRef.current
                        .error.code,
                    message:
                      audioRef.current
                        .error.message,
                  }
                : null,
          }
        );

        setVoicePlaying(false);

        setVoiceError(
          error?.message ||
            'Unable to play this voice message.'
        );
      }
    };

  // ------------------------------------------------
  // AUDIO LOADED METADATA
  // ------------------------------------------------

  const handleAudioLoadedMetadata =
    (event) => {
      const audio =
        event.currentTarget;

      const duration =
        Number(audio.duration);

      console.log(
        'Voice metadata loaded:',
        {
          duration,
          readyState:
            audio.readyState,
          networkState:
            audio.networkState,
          mimeType:
            audioMimeType,
        }
      );

      if (
        Number.isFinite(duration) &&
        duration > 0
      ) {
        setVoiceDuration(
          duration
        );
      }
    };

  // ------------------------------------------------
  // AUDIO TIME UPDATE
  // ------------------------------------------------

  const handleAudioTimeUpdate =
    (event) => {
      const audio =
        event.currentTarget;

      const currentTime =
        Number(
          audio.currentTime
        );

      if (
        Number.isFinite(
          currentTime
        ) &&
        currentTime >= 0
      ) {
        setVoiceCurrentTime(
          currentTime
        );
      }
    };

  // ------------------------------------------------
  // AUDIO PLAY
  // ------------------------------------------------

  const handleAudioPlay =
    () => {
      console.log(
        'Voice audio started playing.'
      );

      setVoicePlaying(true);
      setVoiceError(null);
    };

  // ------------------------------------------------
  // AUDIO PAUSE
  // ------------------------------------------------

  const handleAudioPause =
    () => {
      setVoicePlaying(false);
    };

  // ------------------------------------------------
  // AUDIO ENDED
  // ------------------------------------------------

  const handleAudioEnded =
    () => {
      if (
        Number.isFinite(
          Number(voiceDuration)
        ) &&
        Number(voiceDuration) > 0
      ) {
        setVoiceCurrentTime(
          Number(voiceDuration)
        );
      }

      setVoicePlaying(false);

      if (audioRef.current) {
        audioRef.current.currentTime =
          0;
      }

      requestAnimationFrame(() => {
        if (
          mountedRef.current
        ) {
          setVoiceCurrentTime(
            0
          );
        }
      });
    };

  // ------------------------------------------------
  // AUDIO ERROR
  // ------------------------------------------------

  const handleAudioError =
    (event) => {
      const audio =
        event.currentTarget;

      const mediaError =
        audio?.error;

      console.error(
        'Audio playback failed:',
        {
          errorCode:
            mediaError?.code,
          errorMessage:
            mediaError?.message,
          readyState:
            audio?.readyState,
          networkState:
            audio?.networkState,
          src:
            audio?.src,
          mimeType:
            audioMimeType,
          fileName,
        }
      );

      setVoicePlaying(false);

      setVoiceError(
        mediaError?.message ||
          'This audio message could not be decoded by your browser.'
      );
    };

  // ------------------------------------------------
  // WAVEFORM SEEK
  // ------------------------------------------------

  const handleWaveformClick =
    (event) => {
      const audio =
        audioRef.current;

      const duration =
        Number(voiceDuration);

      if (
        !audio ||
        !Number.isFinite(duration) ||
        duration <= 0
      ) {
        return;
      }

      const rect =
        event.currentTarget.getBoundingClientRect();

      if (!rect.width) {
        return;
      }

      const clickPosition =
        event.clientX -
        rect.left;

      const percentage =
        Math.min(
          1,
          Math.max(
            0,
            clickPosition /
              rect.width
          )
        );

      const newTime =
        percentage *
        duration;

      audio.currentTime =
        newTime;

      setVoiceCurrentTime(
        newTime
      );
    };

  // ------------------------------------------------
  // DOWNLOAD FILE
  // ------------------------------------------------

  const handleDownloadFile =
    async () => {
      if (downloading) {
        return;
      }

      try {
        setDownloading(true);

        const decryptedBlob =
          await getDecryptedFile();

        triggerBlobDownload(
          decryptedBlob,
          fileName
        );
      } catch (error) {
        console.error(
          'File download failed:',
          error
        );
      } finally {
        setDownloading(false);
      }
    };

  // ------------------------------------------------
  // DELETE
  // ------------------------------------------------

  const handleDelete =
    () => {
      if (!onDelete) {
        console.error(
          'onDelete function was not provided'
        );

        return;
      }

      /*
       * Pass the complete message object.
       *
       * Text messages can still be deleted exactly
       * as before.
       *
       * Voice/file messages need the complete object
       * because the parent needs access to:
       *
       * message.id
       * message.type
       * message.file.id
       * message.file.downloadUrl
       *
       * depending on the delete implementation.
       */
      onDelete(message);
    };

  // ------------------------------------------------
  // ACTION BUTTON
  // ------------------------------------------------

  const ActionButton = ({
    children,
    onClick,
    title,
    ariaLabel,
    danger = false,
  }) => (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={ariaLabel}
      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md transition active:scale-95 touch-manipulation sm:h-7 sm:w-7 ${
        danger
          ? 'text-[#94A3B8] hover:bg-red-500/10 hover:text-[#EF4444]'
          : 'text-[#94A3B8] hover:bg-white/5 hover:text-[#F8FAFC]'
      }`}
    >
      {children}
    </button>
  );

  // ------------------------------------------------
  // VOICE MESSAGE
  // ------------------------------------------------

  const VoiceMessage = ({
    own,
  }) => {
    const duration =
      Number(voiceDuration) > 0
        ? Number(voiceDuration)
        : 0;

    const currentTime =
      Number(voiceCurrentTime) >= 0
        ? Number(voiceCurrentTime)
        : 0;

    const progress =
      duration > 0
        ? Math.min(
            1,
            Math.max(
              0,
              currentTime /
                duration
            )
          )
        : 0;

    const durationLabel =
      duration > 0
        ? formatAudioDuration(
            duration
          )
        : '0:00';

    const currentTimeLabel =
      formatAudioDuration(
        currentTime
      );

    return (
      <div
        className={`
          w-full
          min-w-0
          flex
          items-center
          gap-2
          rounded-[17px]
          px-2.5
          py-2

          ${
            own
              ? 'bg-[#0B0F14]/10'
              : 'bg-white/5'
          }

          ${
            content ||
            replyPreview
              ? 'mt-2'
              : ''
          }
        `}
      >
        {/* AVATAR */}

        <div
          className="
            relative
            flex
            h-[42px]
            w-[42px]
            shrink-0
            items-center
            justify-center
            overflow-hidden
            rounded-full
            bg-[#0B0F14]/10
          "
        >
          <Mic
            className="
              h-[19px]
              w-[19px]
              opacity-75
            "
          />

          <span
            className="
              absolute
              bottom-0.5
              right-0.5
              flex
              h-3.5
              w-3.5
              items-center
              justify-center
              rounded-full
              bg-[#0B0F14]
            "
          >
            <Mic
              className="
                h-2
                w-2
                text-[#00D9FF]
              "
            />
          </span>
        </div>

        {/* PLAYER */}

        <div
          className="
            min-w-0
            flex-1
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
            {/* PLAY BUTTON */}

            <button
              type="button"
              onClick={
                handleVoicePlayPause
              }
              disabled={
                voiceLoading
              }
              aria-label={
                voicePlaying
                  ? 'Pause voice message'
                  : 'Play voice message'
              }
              className={`
                flex
                h-[34px]
                w-[34px]
                shrink-0
                items-center
                justify-center
                rounded-full
                transition
                active:scale-95

                ${
                  own
                    ? 'bg-[#0B0F14]/15 text-[#0B0F14] hover:bg-[#0B0F14]/20'
                    : 'bg-[#00D9FF]/15 text-[#00D9FF] hover:bg-[#00D9FF]/25'
                }

                ${
                  voiceLoading
                    ? 'cursor-wait opacity-60'
                    : ''
                }
              `}
            >
              {voiceLoading ? (
                <Loader2
                  className="
                    h-4
                    w-4
                    animate-spin
                  "
                />
              ) : voicePlaying ? (
                <Pause
                  className="
                    h-[15px]
                    w-[15px]
                    fill-current
                  "
                />
              ) : (
                <Play
                  className="
                    ml-0.5
                    h-[15px]
                    w-[15px]
                    fill-current
                  "
                />
              )}
            </button>

            {/* SYNCHRONIZED WAVEFORM */}

            <button
              type="button"
              onClick={
                handleWaveformClick
              }
              disabled={
                !voiceUrl ||
                duration <= 0
              }
              aria-label="Seek voice message"
              className="
                relative
                flex
                h-[32px]
                min-w-0
                flex-1
                items-center
                overflow-hidden
                border-0
                bg-transparent
                p-0
                disabled:cursor-default
              "
            >
              {/* BASE WAVEFORM */}

              <div
                className="
                  absolute
                  inset-0
                  flex
                  items-center
                  justify-between
                  gap-[2px]
                  overflow-hidden
                "
              >
                {WAVEFORM_BARS.map(
                  (
                    height,
                    index
                  ) => (
                    <span
                      key={index}
                      className={`
                        w-[2px]
                        shrink-0
                        rounded-full

                        ${
                          own
                            ? 'bg-[#0B0F14]/30'
                            : 'bg-[#F8FAFC]/30'
                        }
                      `}
                      style={{
                        height: `${Math.max(
                          6,
                          height * 0.72
                        )}px`,
                      }}
                    />
                  )
                )}
              </div>

              {/* PLAYED WAVEFORM */}

              <div
                className="
                  pointer-events-none
                  absolute
                  inset-y-0
                  left-0
                  overflow-hidden
                "
                style={{
                  width: `${progress * 100}%`,
                }}
              >
                <div
                  className="
                    flex
                    h-full
                    w-full
                    min-w-[100%]
                    items-center
                    justify-between
                    gap-[2px]
                  "
                >
                  {WAVEFORM_BARS.map(
                    (
                      height,
                      index
                    ) => (
                      <span
                        key={index}
                        className={`
                          w-[2px]
                          shrink-0
                          rounded-full

                          ${
                            own
                              ? 'bg-[#0B0F14]'
                              : 'bg-[#00D9FF]'
                          }
                        `}
                        style={{
                          height: `${Math.max(
                            6,
                            height * 0.72
                          )}px`,
                        }}
                      />
                    )
                  )}
                </div>
              </div>
            </button>
          </div>

          {/* TIME */}

          <div
            className="
              mt-0.5
              flex
              items-center
              justify-between
              px-0.5
            "
          >
            <span
              className={`
                text-[10px]
                leading-none

                ${
                  own
                    ? 'text-[#0B0F14]/65'
                    : 'text-[#CBD5E1]'
                }
              `}
            >
              {voicePlaying ||
              currentTime > 0
                ? `${currentTimeLabel} / ${durationLabel}`
                : durationLabel}
            </span>

            <Mic
              className={`
                h-3
                w-3

                ${
                  own
                    ? 'text-[#0B0F14]/40'
                    : 'text-[#94A3B8]'
                }
              `}
            />
          </div>

          {/* ERROR */}

          {voiceError && (
            <p
              className="
                mt-1
                max-w-full
                truncate
                text-[9px]
                leading-tight
                text-red-400
              "
              title={voiceError}
            >
              {voiceError}
            </p>
          )}
        </div>

        {/* AUDIO ELEMENT */}

        <audio
          ref={audioRef}
          preload="metadata"
          onLoadedMetadata={
            handleAudioLoadedMetadata
          }
          onTimeUpdate={
            handleAudioTimeUpdate
          }
          onPlay={
            handleAudioPlay
          }
          onPause={
            handleAudioPause
          }
          onEnded={
            handleAudioEnded
          }
          onError={
            handleAudioError
          }
          aria-hidden="true"
          className="
            pointer-events-none
            absolute
            h-0
            w-0
            overflow-hidden
            opacity-0
          "
        />
      </div>
    );
  };

  // --------------------------------------------------
  // FILE MESSAGE
  // --------------------------------------------------

  const FileMessage = ({
    own,
  }) => (
    <button
      type="button"
      onClick={
        handleDownloadFile
      }
      disabled={downloading}
      title={`Download ${fileName}`}
      aria-label={`Download ${fileName}`}
      className={`
        flex
        min-h-10
        w-full
        min-w-0
        items-center
        gap-2
        overflow-hidden
        rounded-lg

        ${
          own
            ? 'bg-[#0B0F14]/10'
            : 'bg-white/5'
        }

        px-2
        py-2
        text-left
        transition-colors
        touch-manipulation

        ${
          content ||
          replyPreview
            ? 'mt-2'
            : ''
        }

        ${
          downloading
            ? 'cursor-wait opacity-50'
            : own
              ? 'cursor-pointer hover:bg-[#0B0F14]/15 active:bg-[#0B0F14]/20'
              : 'cursor-pointer hover:bg-white/10 active:bg-white/15'
        }
      `}
    >
      <FileText
        className="
          h-4
          w-4
          shrink-0
        "
      />

      <div
        className="
          min-w-0
          flex-1
          overflow-hidden
        "
      >
        <p
          className="
            max-w-full
            truncate
            text-[11px]
            font-medium
            leading-tight
            sm:text-xs
          "
          title={fileName}
        >
          {fileName}
        </p>

        <p
          className={`
            mt-0.5
            text-[10px]
            leading-tight
            sm:text-[11px]

            ${
              own
                ? 'text-[#0B0F14]/70'
                : 'text-[#94A3B8]'
            }
          `}
        >
          {formatFileSize(
            fileSize
          )}
        </p>
      </div>

      {downloading ? (
        <span
          className="
            max-w-[70px]
            shrink-0
            truncate
            text-[9px]
            opacity-70
            sm:max-w-none
            sm:text-[10px]
          "
        >
          Downloading...
        </span>
      ) : (
        <Download
          className="
            h-4
            w-4
            shrink-0
            opacity-70
          "
        />
      )}
    </button>
  );

  // --------------------------------------------------
  // MESSAGE CONTENT
  // --------------------------------------------------

  const MessageContent = ({
    own = false,
  } = {}) => (
    <>
      {/* REPLY */}

      {replyPreview && (
        <div
          className={`
            mb-2
            max-w-full
            overflow-hidden
            rounded-md
            border-l-4

            ${
              own
                ? 'border-[#0B0F14]/60 bg-[#0B0F14]/10'
                : 'border-[#00D9FF] bg-white/10'
            }

            px-2
            py-1.5
            xs:px-2.5
          `}
        >
          <p
            className={`
              max-w-full
              truncate
              text-[10px]
              font-semibold
              leading-tight
              sm:text-[11px]

              ${
                own
                  ? 'text-[#0B0F14]/80'
                  : 'text-[#00D9FF]'
              }
            `}
          >
            Replying to{' '}
            {replyPreview.senderName}
          </p>

          <p
            className={`
              mt-0.5
              max-w-full
              truncate
              text-[11px]
              leading-relaxed
              sm:text-xs

              ${
                own
                  ? 'text-[#0B0F14]/70'
                  : 'text-[#CBD5E1]'
              }
            `}
          >
            {replyPreview.content}
          </p>
        </div>
      )}

      {/* TEXT */}

      {content && (
        <p
          className="
            max-w-full
            whitespace-pre-wrap
            break-words
            [overflow-wrap:anywhere]
            text-[13px]
            leading-relaxed
            sm:text-sm
          "
        >
          {content}
        </p>
      )}

      {/* VOICE */}

      {isAudioMessage &&
        VoiceMessage({
          own,
        })}

      {/* FILE */}

      {isFileMessage &&
        !isAudioMessage &&
        FileMessage({
          own,
        })}
    </>
  );

  // --------------------------------------------------
  // UI
  // --------------------------------------------------

  return (
    <div
      className={`
        group
        relative
        flex
        w-full
        min-w-0

        ${
          isOwn
            ? 'justify-end'
            : 'justify-start'
        }

        ${
          grouped
            ? 'mt-0.5'
            : 'mt-3'
        }
      `}
    >
      {/* ================================================= */}
      {/* RECEIVER */}
      {/* ================================================= */}

      {!isOwn && (
        <div
          className="
            flex
            w-fit
            max-w-full
            min-w-0
            items-end
          "
        >
          <div
            className="
              flex
              w-fit
              max-w-full
              min-w-0
              flex-col
              items-start
            "
          >
            {!grouped && (
              <span
                className="
                  mb-1
                  max-w-full
                  truncate
                  px-1
                  text-[11px]
                  leading-tight
                  text-[#94A3B8]
                  sm:text-xs
                "
                title={
                  senderName ||
                  'Anonymous User'
                }
              >
                {senderName ||
                  'Anonymous User'}
              </span>
            )}

            <div
              className="
                flex
                w-fit
                max-w-full
                min-w-0
                items-end
              "
            >
              <div
                className={`
                  min-w-0
                  overflow-hidden
                  rounded-2xl
                  bg-[#111827]
                  px-2
                  py-2
                  text-[#F8FAFC]

                  xs:px-2.5

                  sm:px-3
                  sm:py-2.5

                  ${
                    isAudioMessage
                      ? `
                        w-[324px]
                        max-w-[calc(100vw-7rem)]
                      `
                      : `
                        w-fit
                        max-w-[calc(100vw-7rem)]
                      `
                  }

                  xs:${
                    isAudioMessage
                      ? 'w-[324px] max-w-[calc(100vw-8rem)]'
                      : 'max-w-[calc(100vw-8rem)]'
                  }

                  sm:${
                    isAudioMessage
                      ? 'w-[324px] max-w-[calc(100vw-9rem)]'
                      : 'max-w-[calc(100vw-9rem)]'
                  }

                  md:${
                    isAudioMessage
                      ? 'w-[324px] max-w-[calc(100vw-10rem)]'
                      : 'max-w-[calc(100vw-10rem)]'
                  }
                `}
              >
                {MessageContent()}
              </div>

              <div
                className="
                  flex
                  shrink-0
                  items-center
                  gap-0
                  p-0
                  translate-x-2
                  translate-y-4
                  opacity-100
                  transition-opacity
                  sm:opacity-0
                  sm:group-hover:opacity-100
                  sm:group-focus-within:opacity-100
                "
              >
                <ActionButton
                  onClick={() =>
                    onReply?.(message)
                  }
                  title="Reply"
                  ariaLabel="Reply to message"
                >
                  <Reply
                    className="
                      h-3.5
                      w-3.5
                    "
                  />
                </ActionButton>

                {content && (
                  <ActionButton
                    onClick={
                      handleCopy
                    }
                    title={
                      copied
                        ? 'Copied'
                        : 'Copy'
                    }
                    ariaLabel={
                      copied
                        ? 'Copied'
                        : 'Copy message'
                    }
                  >
                    {copied ? (
                      <Check
                        className="
                          h-3.5
                          w-3.5
                          text-[#22C55E]
                        "
                      />
                    ) : (
                      <Copy
                        className="
                          h-3.5
                          w-3.5
                        "
                      />
                    )}
                  </ActionButton>
                )}
              </div>
            </div>

            <span
              className="
                mt-1
                max-w-full
                px-1
                text-[10px]
                leading-none
                text-[#94A3B8]/70
                sm:text-[11px]
              "
            >
              {formatTime(timestamp)}
            </span>
          </div>
        </div>
      )}

      {/* ================================================= */}
      {/* SENDER / OWN MESSAGE */}
      {/* ================================================= */}

      {isOwn && (
        <div
          className="
            flex
            min-w-0
            max-w-full
            items-end
            flex-row-reverse
          "
        >
          <div
            className="
              flex
              w-auto
              shrink-0
              items-center
              gap-0.5
              px-0.5
              mr-1
              opacity-100
              transition-opacity
              sm:mr-1.5
              sm:opacity-0
              sm:group-hover:opacity-100
              sm:group-focus-within:opacity-100
            "
          />

          <div
            className={`
              flex
              min-w-0
              flex-col
              items-end

              ${
                isAudioMessage
                  ? `
                    w-[324px]
                    max-w-[calc(100vw-7rem)]
                  `
                  : `
                    max-w-[calc(100vw-7rem)]
                  `
              }

              xs:${
                isAudioMessage
                  ? 'w-[324px] max-w-[calc(100vw-8rem)]'
                  : 'max-w-[calc(100vw-8rem)]'
              }

              sm:${
                isAudioMessage
                  ? 'w-[324px] max-w-[78%]'
                  : 'max-w-[78%]'
              }

              md:${
                isAudioMessage
                  ? 'w-[324px] max-w-[68%]'
                  : 'max-w-[68%]'
              }

              lg:${
                isAudioMessage
                  ? 'w-[324px] max-w-[65%]'
                  : 'max-w-[65%]'
              }
            `}
          >
            <div
              className={`
                min-w-0
                max-w-full
                overflow-hidden
                rounded-2xl
                bg-[#00D9FF]
                px-2
                py-2
                text-[#0B0F14]

                xs:px-2.5

                sm:px-3
                sm:py-2.5

                ${
                  isAudioMessage
                    ? 'w-full'
                    : 'w-fit'
                }
              `}
            >
              {MessageContent({
                own: true,
              })}
            </div>

            <span
              className="
                mt-1
                max-w-full
                px-1
                text-[10px]
                leading-none
                text-[#94A3B8]/70
                sm:text-[11px]
              "
            >
              {formatTime(timestamp)}
            </span>
          </div>

          <div
            className="
              flex
              shrink-0
              items-center
              gap-0.5
              px-0.5
              ml-1
              transition-opacity
              sm:ml-1.5
              opacity-100
              sm:opacity-0
              sm:group-hover:opacity-100
              sm:group-focus-within:opacity-100
            "
          >
            <ActionButton
              onClick={() =>
                onReply?.(message)
              }
              title="Reply"
              ariaLabel="Reply to message"
            >
              <Reply
                className="
                  h-3.5
                  w-3.5
                "
              />
            </ActionButton>

            {content && (
              <ActionButton
                onClick={
                  handleCopy
                }
                title={
                  copied
                    ? 'Copied'
                    : 'Copy'
                }
                ariaLabel={
                  copied
                    ? 'Copied'
                    : 'Copy message'
                }
              >
                {copied ? (
                  <Check
                    className="
                      h-3.5
                      w-3.5
                      text-[#22C55E]
                    "
                  />
                ) : (
                  <Copy
                    className="
                      h-3.5
                      w-3.5
                    "
                  />
                )}
              </ActionButton>
            )}

            {onDelete && (
              <ActionButton
                onClick={
                  handleDelete
                }
                title="Delete message"
                ariaLabel="Delete message"
                danger
              >
                <Trash2
                  className="
                    h-3.5
                    w-3.5
                  "
                />
              </ActionButton>
            )}
          </div>
        </div>
      )}
    </div>
  );
}