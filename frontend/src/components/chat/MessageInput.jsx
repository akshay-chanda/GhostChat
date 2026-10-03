import { useState, useRef, useCallback, useEffect } from 'react';
import {
  Send,
  Paperclip,
  X,
  Mic,
  Square,
} from 'lucide-react';

const MAX_MESSAGE_LENGTH = 5000;
const TYPING_STOP_DELAY_MS = 2000;
const MAX_VOICE_DURATION_MS = 120000;
const RECORDER_TIMESLICE_MS = 250;

/**
 * MessageInput
 *
 * Handles:
 * - Text messages
 * - Typing indicator
 * - File attachment
 * - Voice recording
 * - Reply preview
 *
 * Voice recording is handed to onSendVoiceMessage as a Blob.
 * Encryption/upload remains outside this component.
 */
export default function MessageInput({
  onSend,
  onTypingStart,
  onTypingStop,
  onAttachFile,
  onSendVoiceMessage,
  replyTo,
  onCancelReply,
  fileSharingEnabled = true,
  voiceMessagesEnabled = true,
  disabled = false,
  disabledReason,
}) {
  const [value, setValue] = useState('');
  const [sendError, setSendError] = useState(null);

  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [voiceError, setVoiceError] = useState(null);

  const typingTimeoutRef = useRef(null);
  const fileInputRef = useRef(null);
  const textareaRef = useRef(null);

  const mediaRecorderRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const recordingChunksRef = useRef([]);
  const recordingTimerRef = useRef(null);
  const recordingStartTimeRef = useRef(null);
  const stoppingRecordingRef = useRef(false);

  // Live microphone diagnostics.
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const analyserDataRef = useRef(null);
  const analyserAnimationRef = useRef(null);
  const microphoneSourceRef = useRef(null);
  const microphonePeakRef = useRef(0);
  const microphoneSamplesDetectedRef = useRef(false);

  // --------------------------------------------------
  // CLEAN UP
  // --------------------------------------------------

  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = null;
      }

      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
        recordingTimerRef.current = null;
      }

      if (analyserAnimationRef.current) {
        cancelAnimationFrame(analyserAnimationRef.current);
        analyserAnimationRef.current = null;
      }

      const recorder = mediaRecorderRef.current;

      if (recorder) {
        try {
          recorder.onstop = null;
          recorder.onerror = null;

          if (recorder.state !== 'inactive') {
            recorder.stop();
          }
        } catch {
          // Ignore recorder cleanup errors.
        }
      }

      mediaStreamRef.current?.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {
          // Ignore track cleanup errors.
        }
      });

      mediaStreamRef.current = null;

      if (microphoneSourceRef.current) {
        try {
          microphoneSourceRef.current.disconnect();
        } catch {
          // Ignore cleanup errors.
        }
      }

      microphoneSourceRef.current = null;
      analyserRef.current = null;
      analyserDataRef.current = null;

      const audioContext = audioContextRef.current;

      if (audioContext) {
        try {
          audioContext.close();
        } catch {
          // Ignore cleanup errors.
        }
      }

      audioContextRef.current = null;
    };
  }, []);

  // --------------------------------------------------
  // HANDLE CHANGE
  // --------------------------------------------------

  const handleChange = (e) => {
    const next = e.target.value;

    if (next.length > MAX_MESSAGE_LENGTH) {
      return;
    }

    setValue(next);

    if (sendError) {
      setSendError(null);
    }

    if (next.trim()) {
      onTypingStart?.();

      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }

      typingTimeoutRef.current = setTimeout(() => {
        onTypingStop?.();
        typingTimeoutRef.current = null;
      }, TYPING_STOP_DELAY_MS);
    } else {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = null;
      }

      onTypingStop?.();
    }
  };

  // --------------------------------------------------
  // SEND TEXT
  // --------------------------------------------------

  const handleSend = useCallback(async () => {
    const trimmed = value.trim();

    if (!trimmed || disabled || isRecording) {
      return;
    }

    try {
      await onSend(trimmed);

      setValue('');
      setSendError(null);

      onCancelReply?.();

      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = null;
      }

      onTypingStop?.();

      requestAnimationFrame(() => {
        textareaRef.current?.focus();
      });
    } catch {
      setSendError(
        'Message wasn’t sent. Check your connection and try again.'
      );
    }
  }, [
    value,
    disabled,
    isRecording,
    onSend,
    onCancelReply,
    onTypingStop,
  ]);

  // --------------------------------------------------
  // KEYBOARD
  // --------------------------------------------------

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // --------------------------------------------------
  // FILE
  // --------------------------------------------------

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];

    if (file) {
      onAttachFile?.(file);
    }

    e.target.value = '';
  };

  // --------------------------------------------------
  // VOICE MIME TYPE
  // --------------------------------------------------

  const getSupportedMimeType = () => {
    if (typeof MediaRecorder === 'undefined') {
      return null;
    }

    const types = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/ogg;codecs=opus',
      'audio/ogg',
    ];

    for (const type of types) {
      try {
        if (MediaRecorder.isTypeSupported(type)) {
          return type;
        }
      } catch {
        // Continue checking.
      }
    }

    return '';
  };

  // --------------------------------------------------
  // STOP MICROPHONE DIAGNOSTICS
  // --------------------------------------------------

  const stopMicrophoneDiagnostics = useCallback(() => {
    if (analyserAnimationRef.current) {
      cancelAnimationFrame(analyserAnimationRef.current);
      analyserAnimationRef.current = null;
    }

    if (microphoneSourceRef.current) {
      try {
        microphoneSourceRef.current.disconnect();
      } catch {
        // Ignore cleanup errors.
      }
    }

    microphoneSourceRef.current = null;
    analyserRef.current = null;
    analyserDataRef.current = null;

    const audioContext = audioContextRef.current;

    if (audioContext) {
      try {
        audioContext.close();
      } catch {
        // Ignore cleanup errors.
      }
    }

    audioContextRef.current = null;
  }, []);

  // --------------------------------------------------
  // START MICROPHONE DIAGNOSTICS
  // --------------------------------------------------

  const startMicrophoneDiagnostics = useCallback((stream) => {
    const AudioContextClass =
      window.AudioContext ||
      window.webkitAudioContext;

    if (!AudioContextClass) {
      console.warn(
        'Voice microphone diagnostics unavailable: AudioContext not supported.'
      );

      return;
    }

    try {
      const audioContext = new AudioContextClass();

      const source =
        audioContext.createMediaStreamSource(stream);

      const analyser =
        audioContext.createAnalyser();

      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.15;

      source.connect(analyser);

      audioContextRef.current = audioContext;
      microphoneSourceRef.current = source;
      analyserRef.current = analyser;

      const data =
        new Uint8Array(
          analyser.fftSize
        );

      analyserDataRef.current = data;

      microphonePeakRef.current = 0;
      microphoneSamplesDetectedRef.current = false;

      const inspectMicrophone = () => {
        const currentAnalyser =
          analyserRef.current;

        const currentData =
          analyserDataRef.current;

        if (!currentAnalyser || !currentData) {
          return;
        }

        currentAnalyser.getByteTimeDomainData(
          currentData
        );

        let peak = 0;

        for (
          let i = 0;
          i < currentData.length;
          i++
        ) {
          const normalized =
            Math.abs(
              (currentData[i] - 128) / 128
            );

          if (normalized > peak) {
            peak = normalized;
          }
        }

        if (
          peak >
          microphonePeakRef.current
        ) {
          microphonePeakRef.current = peak;
        }

        /*
         * A value above ~0.005 means the microphone
         * is receiving a measurable waveform.
         *
         * We intentionally use a very low threshold
         * because quiet microphones can still be valid.
         */
        if (peak > 0.005) {
          microphoneSamplesDetectedRef.current =
            true;
        }

        analyserAnimationRef.current =
          requestAnimationFrame(
            inspectMicrophone
          );
      };

      if (audioContext.state === 'suspended') {
        audioContext.resume().catch(() => {
          // Diagnostics only.
        });
      }

      inspectMicrophone();

      console.log(
        'Voice microphone diagnostics started:',
        {
          audioContextState:
            audioContext.state,
          sampleRate:
            audioContext.sampleRate,
          fftSize:
            analyser.fftSize,
        }
      );
    } catch (error) {
      console.warn(
        'Voice microphone diagnostics could not start:',
        error
      );

      stopMicrophoneDiagnostics();
    }
  }, [stopMicrophoneDiagnostics]);

  // --------------------------------------------------
  // STOP MEDIA STREAM
  // --------------------------------------------------

  const stopMediaStream = useCallback(() => {
    const stream = mediaStreamRef.current;

    if (!stream) {
      return;
    }

    stream.getTracks().forEach((track) => {
      try {
        track.stop();
      } catch {
        // Ignore track cleanup errors.
      }
    });

    mediaStreamRef.current = null;
  }, []);

  // --------------------------------------------------
  // RESET RECORDING STATE
  // --------------------------------------------------

  const resetRecordingState = useCallback(() => {
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }

    stopMicrophoneDiagnostics();
    stopMediaStream();

    mediaRecorderRef.current = null;
    recordingChunksRef.current = [];
    recordingStartTimeRef.current = null;
    stoppingRecordingRef.current = false;

    setIsRecording(false);
    setRecordingTime(0);
  }, [
    stopMicrophoneDiagnostics,
    stopMediaStream,
  ]);

  // --------------------------------------------------
  // VALIDATE RECORDED AUDIO
  // --------------------------------------------------

  const validateRecordedAudio = useCallback(
    async (audioBlob) => {
      if (!(audioBlob instanceof Blob)) {
        throw new Error(
          'Recorded audio is not a valid Blob.'
        );
      }

      if (audioBlob.size === 0) {
        throw new Error(
          'The recorded audio is empty.'
        );
      }

      const testUrl =
        URL.createObjectURL(audioBlob);

      try {
        const testAudio =
          document.createElement('audio');

        testAudio.preload = 'auto';
        testAudio.src = testUrl;

        const metadataDuration =
          await new Promise(
            (resolve, reject) => {
              let finished = false;

              const cleanup = () => {
                testAudio.removeEventListener(
                  'loadedmetadata',
                  handleMetadata
                );

                testAudio.removeEventListener(
                  'error',
                  handleError
                );
              };

              const handleMetadata = () => {
                if (finished) {
                  return;
                }

                finished = true;
                cleanup();

                const duration =
                  Number(
                    testAudio.duration
                  );

                if (
                  !Number.isFinite(
                    duration
                  ) ||
                  duration <= 0
                ) {
                  reject(
                    new Error(
                      'The recorded audio has no valid duration.'
                    )
                  );

                  return;
                }

                resolve(duration);
              };

              const handleError = () => {
                if (finished) {
                  return;
                }

                finished = true;
                cleanup();

                reject(
                  new Error(
                    'The browser could not decode the recorded audio.'
                  )
                );
              };

              testAudio.addEventListener(
                'loadedmetadata',
                handleMetadata
              );

              testAudio.addEventListener(
                'error',
                handleError
              );

              testAudio.load();
            }
          );

        // --------------------------------------------------
        // WEB AUDIO VALIDATION
        // --------------------------------------------------

        const AudioContextClass =
          window.AudioContext ||
          window.webkitAudioContext;

        let decodedDuration =
          metadataDuration;

        if (AudioContextClass) {
          const audioContext =
            new AudioContextClass();

          try {
            const arrayBuffer =
              await audioBlob.arrayBuffer();

            const decoded =
              await audioContext.decodeAudioData(
                arrayBuffer
              );

            if (
              !decoded ||
              !Number.isFinite(
                decoded.duration
              ) ||
              decoded.duration <= 0
            ) {
              throw new Error(
                'The recorded audio contains no valid audio data.'
              );
            }

            decodedDuration =
              decoded.duration;

            let peak = 0;
            let rmsAccumulator = 0;
            let rmsCount = 0;

            const channels =
              decoded.numberOfChannels;

            const sampleCount =
              decoded.length;

            const step = Math.max(
              1,
              Math.floor(
                sampleCount / 50000
              )
            );

            for (
              let channel = 0;
              channel < channels;
              channel++
            ) {
              const data =
                decoded.getChannelData(
                  channel
                );

              for (
                let i = 0;
                i < sampleCount;
                i += step
              ) {
                const sample =
                  Number(data[i]) || 0;

                const absolute =
                  Math.abs(sample);

                if (
                  absolute >
                  peak
                ) {
                  peak = absolute;
                }

                rmsAccumulator +=
                  sample * sample;

                rmsCount += 1;
              }
            }

            const rms =
              rmsCount > 0
                ? Math.sqrt(
                    rmsAccumulator /
                      rmsCount
                  )
                : 0;

            const hasAudibleSamples =
              peak > 0.0005 &&
              rms > 0.00005;

            console.log(
              'Voice decoded audio analysis:',
              {
                metadataDuration,
                decodedDuration,
                channels,
                sampleRate:
                  decoded.sampleRate,
                sampleCount,
                peak,
                rms,
                hasAudibleSamples,
                microphonePeak:
                  microphonePeakRef.current,
                microphoneSamplesDetected:
                  microphoneSamplesDetectedRef.current,
              }
            );

            if (!hasAudibleSamples) {
              throw new Error(
                'The microphone recording contains silence.'
              );
            }
          } finally {
            try {
              await audioContext.close();
            } catch {
              // Ignore cleanup errors.
            }
          }
        }

        return {
          duration:
            Number.isFinite(
              decodedDuration
            ) &&
            decodedDuration > 0
              ? decodedDuration
              : metadataDuration,
        };
      } finally {
        URL.revokeObjectURL(testUrl);
      }
    },
    []
  );

  // --------------------------------------------------
  // FINISH RECORDING
  // --------------------------------------------------

  const finishRecording = useCallback(() => {
    const recorder =
      mediaRecorderRef.current;

    if (!recorder) {
      return;
    }

    if (recorder.state === 'inactive') {
      return;
    }

    if (stoppingRecordingRef.current) {
      return;
    }

    stoppingRecordingRef.current = true;

    try {
      /*
       * stop() automatically produces the final
       * dataavailable event before onstop.
       */
      recorder.stop();
    } catch (error) {
      console.error(
        'Voice recorder stop failed:',
        error
      );

      resetRecordingState();

      setVoiceError(
        'Voice recording could not be stopped. Please try again.'
      );
    }
  }, [resetRecordingState]);

  // --------------------------------------------------
  // START RECORDING
  // --------------------------------------------------

  const startRecording =
    useCallback(async () => {
      if (
        disabled ||
        !voiceMessagesEnabled ||
        isRecording ||
        stoppingRecordingRef.current
      ) {
        return;
      }

      setVoiceError(null);
      setSendError(null);

      if (
        typeof navigator === 'undefined' ||
        !navigator.mediaDevices?.getUserMedia
      ) {
        setVoiceError(
          'Voice recording is not supported by this browser.'
        );

        return;
      }

      if (
        typeof MediaRecorder ===
        'undefined'
      ) {
        setVoiceError(
          'Voice recording is not supported by this browser.'
        );

        return;
      }

      let stream = null;

      try {
        /*
         * Keep the request deliberately simple.
         *
         * Some browsers/devices behave badly when several
         * advanced audio constraints are forced.
         */
        stream =
          await navigator.mediaDevices.getUserMedia(
            {
              audio: true,
            }
          );

        const audioTracks =
          stream.getAudioTracks();

        if (!audioTracks.length) {
          throw new Error(
            'No microphone audio track was created.'
          );
        }

        const audioTrack =
          audioTracks[0];

        console.log(
          'Voice microphone track:',
          {
            label:
              audioTrack.label,
            enabled:
              audioTrack.enabled,
            muted:
              audioTrack.muted,
            readyState:
              audioTrack.readyState,
            settings:
              typeof audioTrack.getSettings ===
              'function'
                ? audioTrack.getSettings()
                : null,
          }
        );

        if (
          audioTrack.readyState !==
          'live'
        ) {
          throw new Error(
            'The microphone audio track is not live.'
          );
        }

        if (!audioTrack.enabled) {
          audioTrack.enabled = true;
        }

        /*
         * Start microphone diagnostics BEFORE
         * MediaRecorder so we can determine whether
         * actual microphone samples are arriving.
         */
        startMicrophoneDiagnostics(
          stream
        );

        const requestedMimeType =
          getSupportedMimeType();

        const recorderOptions = {
          audioBitsPerSecond: 128000,
        };

        if (requestedMimeType) {
          recorderOptions.mimeType =
            requestedMimeType;
        }

        const recorder =
          new MediaRecorder(
            stream,
            recorderOptions
          );

        const actualRecorderMimeType =
          recorder.mimeType ||
          requestedMimeType ||
          'audio/webm';

        console.log(
          'Voice recorder created:',
          {
            requestedMimeType,
            actualRecorderMimeType,
            audioBitsPerSecond:
              recorder.audioBitsPerSecond,
            state:
              recorder.state,
          }
        );

        mediaStreamRef.current =
          stream;

        mediaRecorderRef.current =
          recorder;

        recordingChunksRef.current =
          [];

        recordingStartTimeRef.current =
          Date.now();

        stoppingRecordingRef.current =
          false;

        // --------------------------------------------------
        // AUDIO DATA
        // --------------------------------------------------

        recorder.ondataavailable =
          (event) => {
            if (
              event.data &&
              event.data.size > 0
            ) {
              console.log(
                'Voice audio chunk:',
                {
                  size:
                    event.data.size,
                  type:
                    event.data.type,
                }
              );

              recordingChunksRef.current.push(
                event.data
              );
            }
          };

        // --------------------------------------------------
        // RECORDER ERROR
        // --------------------------------------------------

        recorder.onerror =
          (event) => {
            console.error(
              'Voice recording error:',
              event
            );

            setVoiceError(
              'Voice recording failed. Please try again.'
            );

            resetRecordingState();
          };

        // --------------------------------------------------
        // RECORDING STOPPED
        // --------------------------------------------------

        recorder.onstop =
          async () => {
            const chunks = [
              ...recordingChunksRef.current,
            ];

            const firstChunkMimeType =
              chunks.find(
                (chunk) =>
                  chunk?.type &&
                  typeof chunk.type ===
                    'string'
              )?.type || '';

            const finalMimeType =
              firstChunkMimeType ||
              recorder.mimeType ||
              actualRecorderMimeType ||
              'audio/webm';

            const duration =
              recordingStartTimeRef.current
                ? Date.now() -
                  recordingStartTimeRef.current
                : 0;

            const safeTimerDuration =
              Math.max(
                0,
                Math.min(
                  duration,
                  MAX_VOICE_DURATION_MS
                )
              );

            const totalBytes =
              chunks.reduce(
                (total, chunk) =>
                  total + chunk.size,
                0
              );

            console.log(
              'Voice recording finished:',
              {
                chunks:
                  chunks.length,
                mimeType:
                  finalMimeType,
                recorderMimeType:
                  recorder.mimeType,
                firstChunkMimeType,
                duration:
                  safeTimerDuration,
                totalBytes,
                microphonePeak:
                  microphonePeakRef.current,
                microphoneSamplesDetected:
                  microphoneSamplesDetectedRef.current,
              }
            );

            /*
             * Save the diagnostic values before cleaning
             * up the analyser.
             */
            const microphonePeak =
              microphonePeakRef.current;

            const microphoneSamplesDetected =
              microphoneSamplesDetectedRef.current;

            stopMicrophoneDiagnostics();
            stopMediaStream();

            if (
              recordingTimerRef.current
            ) {
              clearInterval(
                recordingTimerRef.current
              );

              recordingTimerRef.current =
                null;
            }

            mediaRecorderRef.current =
              null;

            recordingStartTimeRef.current =
              null;

            stoppingRecordingRef.current =
              false;

            setIsRecording(false);
            setRecordingTime(0);

            if (
              !chunks.length ||
              totalBytes === 0
            ) {
              recordingChunksRef.current =
                [];

              setVoiceError(
                'No audio was recorded. Please try again.'
              );

              return;
            }

            /*
             * If the microphone analyser saw absolutely
             * no signal, tell the user immediately.
             *
             * We use this only as a diagnostic guard.
             */
            if (
              !microphoneSamplesDetected
            ) {
              console.error(
                'Voice microphone produced no measurable signal:',
                {
                  microphonePeak,
                  microphoneSamplesDetected,
                  microphoneTrack:
                    audioTracks?.[0]
                      ? {
                          label:
                            audioTracks[0]
                              .label,
                          muted:
                            audioTracks[0]
                              .muted,
                          enabled:
                            audioTracks[0]
                              .enabled,
                          readyState:
                            audioTracks[0]
                              .readyState,
                        }
                      : null,
                }
              );

              setVoiceError(
                'No microphone sound was detected. Check the selected microphone and browser permissions.'
              );

              recordingChunksRef.current =
                [];

              return;
            }

            /*
             * Construct one final WebM/Opus Blob.
             */
            const audioBlob =
              new Blob(
                chunks,
                {
                  type:
                    finalMimeType,
                }
              );

            recordingChunksRef.current =
              [];

            console.log(
              'Voice Blob created:',
              {
                size:
                  audioBlob.size,
                type:
                  audioBlob.type,
              }
            );

            if (!audioBlob.size) {
              setVoiceError(
                'The recorded audio is empty. Please try again.'
              );

              return;
            }

            // --------------------------------------------------
            // LOCAL AUDIO VALIDATION
            // --------------------------------------------------

            let decodedDuration =
              safeTimerDuration;

            try {
              const validation =
                await validateRecordedAudio(
                  audioBlob
                );

              decodedDuration =
                validation.duration;

              console.log(
                'Voice recording validation succeeded:',
                {
                  decodedDuration,
                  blobSize:
                    audioBlob.size,
                  microphonePeak,
                  microphoneSamplesDetected,
                }
              );
            } catch (validationError) {
              console.error(
                'Voice recording validation failed:',
                validationError
              );

              setVoiceError(
                validationError?.message ||
                  'The recorded voice could not be decoded.'
              );

              return;
            }

            // --------------------------------------------------
            // SEND VOICE
            // --------------------------------------------------

            if (!onSendVoiceMessage) {
              setVoiceError(
                'Voice messages are not available yet.'
              );

              return;
            }

            try {
              await onSendVoiceMessage(
                audioBlob,
                {
                  duration: Math.min(
                    Math.round(
                      decodedDuration *
                        1000
                    ),
                    MAX_VOICE_DURATION_MS
                  ),
                  mimeType:
                    finalMimeType,
                }
              );

              setVoiceError(null);

              onCancelReply?.();

              requestAnimationFrame(() => {
                textareaRef.current?.focus();
              });
            } catch (error) {
              console.error(
                'Voice message send failed:',
                error
              );

              setVoiceError(
                error?.message ||
                  'Voice message wasn’t sent. Check your connection and try again.'
              );
            }
          };

        // --------------------------------------------------
        // START RECORDER
        // --------------------------------------------------

        recorder.start(
          RECORDER_TIMESLICE_MS
        );

        console.log(
          'Voice recorder started:',
          {
            mimeType:
              recorder.mimeType,
            state:
              recorder.state,
          }
        );

        setIsRecording(true);
        setRecordingTime(0);

        recordingTimerRef.current =
          setInterval(() => {
            if (
              !recordingStartTimeRef.current
            ) {
              return;
            }

            const elapsed =
              Date.now() -
              recordingStartTimeRef.current;

            const seconds =
              Math.floor(
                elapsed / 1000
              );

            setRecordingTime(
              seconds
            );

            if (
              elapsed >=
              MAX_VOICE_DURATION_MS
            ) {
              finishRecording();
            }
          }, 250);
      } catch (error) {
        console.error(
          'Unable to start voice recording:',
          error
        );

        if (stream) {
          stream
            .getTracks()
            .forEach((track) => {
              try {
                track.stop();
              } catch {
                // Ignore cleanup errors.
              }
            });
        }

        stopMicrophoneDiagnostics();

        mediaStreamRef.current =
          null;

        mediaRecorderRef.current =
          null;

        recordingChunksRef.current =
          [];

        recordingStartTimeRef.current =
          null;

        stoppingRecordingRef.current =
          false;

        setIsRecording(false);
        setRecordingTime(0);

        if (
          error?.name ===
          'NotAllowedError'
        ) {
          setVoiceError(
            'Microphone permission was denied.'
          );
        } else if (
          error?.name ===
          'NotFoundError'
        ) {
          setVoiceError(
            'No microphone was found.'
          );
        } else if (
          error?.name ===
          'NotReadableError'
        ) {
          setVoiceError(
            'The microphone is already being used by another application.'
          );
        } else if (
          error?.name ===
          'SecurityError'
        ) {
          setVoiceError(
            'The browser blocked microphone access.'
          );
        } else {
          setVoiceError(
            error?.message ||
              'Unable to access the microphone.'
          );
        }
      }
    },
    [
      disabled,
      voiceMessagesEnabled,
      isRecording,
      onSendVoiceMessage,
      onCancelReply,
      finishRecording,
      resetRecordingState,
      stopMediaStream,
      stopMicrophoneDiagnostics,
      startMicrophoneDiagnostics,
      validateRecordedAudio,
    ]
  );

  // --------------------------------------------------
  // VOICE BUTTON
  // --------------------------------------------------

  const handleVoiceButton = () => {
    if (isRecording) {
      finishRecording();
    } else {
      startRecording();
    }
  };

  // --------------------------------------------------
  // RECORDING DISPLAY
  // --------------------------------------------------

  const formatRecordingTime =
    (seconds) => {
      const safeSeconds =
        Math.max(
          0,
          Number.isFinite(seconds)
            ? seconds
            : 0
        );

      const minutes =
        Math.floor(
          safeSeconds / 60
        );

      const remainingSeconds =
        safeSeconds % 60;

      return `${String(
        minutes
      ).padStart(2, '0')}:${String(
        remainingSeconds
      ).padStart(2, '0')}`;
    };

  // --------------------------------------------------
  // VALUES
  // --------------------------------------------------

  const remaining =
    MAX_MESSAGE_LENGTH -
    value.length;

  const showCounter =
    remaining <= 500;

  // --------------------------------------------------
  // UI
  // --------------------------------------------------

  return (
    <div
      className="
        shrink-0
        border-t
        border-white/5
        bg-[#0B0F14]
        px-2
        pt-2.5
        pb-[max(0.625rem,env(safe-area-inset-bottom))]
        xs:px-3
        sm:px-4
        sm:py-3
        md:px-6
      "
    >
      {/* REPLY PREVIEW */}

      {replyTo && !isRecording && (
        <div
          className="
            mb-2
            flex
            min-w-0
            items-center
            gap-2
            rounded-lg
            border
            border-white/5
            bg-[#111827]
            px-2.5
            py-2
            xs:px-3
          "
        >
          <div className="min-w-0 flex-1 overflow-hidden">
            <p
              className="
                truncate
                text-[11px]
                leading-tight
                text-[#00D9FF]
                xs:text-xs
              "
              title={`Replying to ${
                replyTo.senderName ||
                'Anonymous User'
              }`}
            >
              Replying to{' '}
              {replyTo.senderName ||
                'Anonymous User'}
            </p>

            <p
              className="
                mt-0.5
                truncate
                text-[11px]
                leading-relaxed
                text-[#94A3B8]
                xs:text-xs
              "
              title={
                replyTo.content ||
                replyTo.text ||
                ''
              }
            >
              {replyTo.content ||
                replyTo.text ||
                'Original message unavailable'}
            </p>
          </div>

          <button
            type="button"
            onClick={onCancelReply}
            title="Cancel reply"
            aria-label="Cancel reply"
            className="
              flex
              min-h-8
              min-w-8
              shrink-0
              items-center
              justify-center
              rounded-md
              p-1.5
              text-[#94A3B8]
              transition-colors
              hover:text-[#F8FAFC]
              active:scale-95
              touch-manipulation
            "
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* DISABLED MESSAGE */}

      {disabled && disabledReason && (
        <p
          className="
            mb-2
            px-1
            text-[11px]
            leading-relaxed
            text-[#F59E0B]
            xs:text-xs
          "
        >
          {disabledReason}
        </p>
      )}

      {/* SEND ERROR */}

      {sendError && !disabled && (
        <p
          role="alert"
          className="
            mb-2
            px-1
            text-[11px]
            leading-relaxed
            text-[#EF4444]
            xs:text-xs
          "
        >
          {sendError}
        </p>
      )}

      {/* VOICE ERROR */}

      {voiceError && !disabled && (
        <p
          role="alert"
          className="
            mb-2
            px-1
            text-[11px]
            leading-relaxed
            text-[#EF4444]
            xs:text-xs
          "
        >
          {voiceError}
        </p>
      )}

      {/* RECORDING STATE */}

      {isRecording ? (
        <div
          className="
            flex
            min-w-0
            items-center
            gap-2
            rounded-xl
            border
            border-[#EF4444]/20
            bg-[#111827]
            px-2
            py-2
            xs:gap-3
            xs:px-3
          "
        >
          <span
            className="
              h-2.5
              w-2.5
              shrink-0
              animate-pulse
              rounded-full
              bg-[#EF4444]
            "
            aria-hidden="true"
          />

          <span
            className="
              min-w-0
              flex-1
              truncate
              text-sm
              text-[#F8FAFC]
            "
          >
            Recording voice message…
          </span>

          <span
            className="
              shrink-0
              font-mono
              text-xs
              tabular-nums
              text-[#94A3B8]
              xs:text-sm
            "
            aria-live="polite"
          >
            {formatRecordingTime(
              recordingTime
            )}
          </span>

          <button
            type="button"
            onClick={
              handleVoiceButton
            }
            title="Stop recording"
            aria-label="Stop recording"
            className="
              flex
              min-h-10
              min-w-10
              shrink-0
              items-center
              justify-center
              rounded-full
              bg-[#EF4444]
              p-2.5
              text-white
              transition-colors
              hover:bg-[#F87171]
              active:scale-95
              touch-manipulation
            "
          >
            <Square className="h-4 w-4 fill-current" />
          </button>
        </div>
      ) : (
        <div className="flex min-w-0 items-end gap-1.5 xs:gap-2">

          {/* FILE ATTACHMENT */}

          {fileSharingEnabled && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                onChange={handleFileChange}
                disabled={disabled}
              />

              <button
                type="button"
                onClick={() =>
                  fileInputRef.current?.click()
                }
                disabled={disabled}
                title="Attach file"
                aria-label="Attach file"
                className="
                  flex
                  min-h-10
                  min-w-10
                  shrink-0
                  items-center
                  justify-center
                  rounded-full
                  p-2.5
                  text-[#94A3B8]
                  transition-colors
                  hover:text-[#F8FAFC]
                  active:scale-95
                  disabled:cursor-not-allowed
                  disabled:opacity-40
                  touch-manipulation
                  sm:min-h-9
                  sm:min-w-9
                "
              >
                <Paperclip className="h-5 w-5" />
              </button>
            </>
          )}

          {/* TEXTAREA */}

          <div className="relative min-w-0 flex-1">
            <textarea
              ref={textareaRef}
              value={value}
              onChange={handleChange}
              onKeyDown={handleKeyDown}
              disabled={disabled}
              rows={1}
              maxLength={
                MAX_MESSAGE_LENGTH
              }
              placeholder={
                disabled
                  ? 'Messaging is disabled'
                  : 'Type a message…'
              }
              aria-label="Message"
              className="
                block
                max-h-32
                min-h-10
                w-full
                resize-none
                overflow-y-auto
                rounded-xl
                border
                border-white/10
                bg-[#111827]
                px-3
                py-2.5
                pr-3
                text-base
                leading-relaxed
                text-[#F8FAFC]
                placeholder:text-[#94A3B8]/60
                focus:border-transparent
                focus:outline-none
                focus-visible:ring-2
                focus-visible:ring-[#00D9FF]
                disabled:cursor-not-allowed
                disabled:opacity-50
                sm:text-sm
              "
            />

            {showCounter && (
              <span
                aria-live="polite"
                className={`
                  pointer-events-none
                  absolute
                  bottom-1
                  right-2.5
                  rounded
                  bg-[#111827]/90
                  px-1
                  text-[10px]
                  leading-tight
                  sm:text-[11px]
                  ${
                    remaining < 0
                      ? 'text-[#EF4444]'
                      : remaining < 100
                        ? 'text-[#F59E0B]'
                        : 'text-[#94A3B8]'
                  }
                `}
              >
                {remaining}
              </span>
            )}
          </div>

          {/* VOICE RECORD */}

          {voiceMessagesEnabled && (
            <button
              type="button"
              onClick={
                handleVoiceButton
              }
              disabled={disabled}
              title="Record voice message"
              aria-label="Record voice message"
              className="
                flex
                min-h-10
                min-w-10
                shrink-0
                items-center
                justify-center
                rounded-full
                p-2.5
                text-[#94A3B8]
                transition-colors
                hover:text-[#F8FAFC]
                active:scale-95
                disabled:cursor-not-allowed
                disabled:opacity-40
                touch-manipulation
                sm:min-h-9
                sm:min-w-9
              "
            >
              <Mic className="h-5 w-5" />
            </button>
          )}

          {/* SEND */}

          <button
            type="button"
            onClick={handleSend}
            disabled={
              disabled ||
              !value.trim()
            }
            title="Send"
            aria-label="Send message"
            className="
              flex
              min-h-10
              min-w-10
              shrink-0
              items-center
              justify-center
              rounded-full
              bg-[#00D9FF]
              p-2.5
              text-[#0B0F14]
              transition-colors
              hover:bg-[#5CE7FF]
              active:scale-95
              disabled:cursor-not-allowed
              disabled:opacity-40
              touch-manipulation
              sm:min-h-9
              sm:min-w-9
            "
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}