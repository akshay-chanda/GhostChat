import { useState } from 'react';
import {
  Reply,
  Copy,
  Trash2,
  FileText,
  Download,
  Check,
} from 'lucide-react';

import { useRoom } from '../../context/RoomContext';
import {
  downloadAndDecryptFile,
} from '../../services/fileService';

// --------------------------------------------------
// FORMAT TIME
// --------------------------------------------------

function formatTime(timestamp) {
  if (!timestamp) return '';

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

  const [copied, setCopied] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const {
    senderName,
    timestamp,
    content,
    file,
    replyTo,
  } = message || {};

  // --------------------------------------------------
  // FILE DATA
  // --------------------------------------------------

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

  const fileMimeType =
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

  // --------------------------------------------------
  // REPLY PREVIEW
  // --------------------------------------------------

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

  // --------------------------------------------------
  // COPY
  // --------------------------------------------------

  const handleCopy = async () => {
    if (!content) return;

    try {
      await navigator.clipboard.writeText(content);

      setCopied(true);

      setTimeout(() => {
        setCopied(false);
      }, 1500);
    } catch (error) {
      console.error(
        'Copy failed:',
        error
      );
    }
  };

  // --------------------------------------------------
  // DOWNLOAD BLOB
  // --------------------------------------------------

  const triggerBlobDownload = (
    blob,
    filename
  ) => {
    if (!(blob instanceof Blob)) {
      throw new Error(
        'Downloaded data is not a valid Blob'
      );
    }

    const downloadObjectUrl =
      URL.createObjectURL(blob);

    const link =
      document.createElement('a');

    link.href = downloadObjectUrl;

    link.download =
      filename || 'download';

    link.style.display = 'none';

    document.body.appendChild(link);

    link.click();

    link.remove();

    setTimeout(() => {
      URL.revokeObjectURL(
        downloadObjectUrl
      );
    }, 1500);
  };

  // --------------------------------------------------
  // DOWNLOAD FILE
  // --------------------------------------------------

  const handleDownloadFile =
    async () => {
      if (downloading) {
        return;
      }

      try {
        setDownloading(true);

        // ------------------------------------------------
        // OPTION 1:
        // FILE ALREADY DECRYPTED LOCALLY
        // ------------------------------------------------

        if (rawFileData) {
          let downloadBlob = null;

          if (
            rawFileData instanceof Blob
          ) {
            downloadBlob = rawFileData;
          } else if (
            rawFileData instanceof
            ArrayBuffer
          ) {
            downloadBlob =
              new Blob(
                [rawFileData],
                {
                  type: fileMimeType,
                }
              );
          } else if (
            rawFileData instanceof
              Uint8Array ||
            ArrayBuffer.isView(
              rawFileData
            )
          ) {
            downloadBlob =
              new Blob(
                [rawFileData],
                {
                  type: fileMimeType,
                }
              );
          }

          if (downloadBlob) {
            if (
              downloadBlob.type !==
              fileMimeType
            ) {
              downloadBlob =
                new Blob(
                  [downloadBlob],
                  {
                    type: fileMimeType,
                  }
                );
            }

            triggerBlobDownload(
              downloadBlob,
              fileName
            );

            return;
          }

          console.warn(
            'Local file data exists but could not be converted:',
            rawFileData
          );
        }

        // ------------------------------------------------
        // OPTION 2:
        // DOWNLOAD + DECRYPT
        // ------------------------------------------------

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

        console.log(
          'Starting file download:',
          {
            fileName,
            downloadUrl,
          }
        );

        const decryptedBlob =
          await downloadAndDecryptFile({
            downloadUrl,
            iv: fileIv,
            mimeType: fileMimeType,
            key: roomKey,

            // Both private authentication
            // credentials are required.
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

        // Create a temporary browser URL
        // and download the decrypted file.
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

  // --------------------------------------------------
  // DELETE
  // --------------------------------------------------

  const handleDelete = () => {
    if (!onDelete) {
      console.error(
        'onDelete function was not provided'
      );

      return;
    }

    onDelete();
  };

  // --------------------------------------------------
  // ACTION BUTTONS
  // --------------------------------------------------

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
      className={`
        flex
        h-8
        w-8
        shrink-0
        items-center
        justify-center
        rounded-md
        transition
        active:scale-95
        touch-manipulation
        sm:h-7
        sm:w-7
        ${
          danger
            ? 'text-[#94A3B8] hover:bg-red-500/10 hover:text-[#EF4444]'
            : 'text-[#94A3B8] hover:bg-white/5 hover:text-[#F8FAFC]'
        }
      `}
    >
      {children}
    </button>
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
      {/* -------------------------------------------- */}
      {/* RECEIVER                                     */}
      {/* -------------------------------------------- */}

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
                className="
                  w-fit
                  max-w-[calc(100vw-7rem)]
                  min-w-0
                  overflow-hidden
                  rounded-2xl
                  bg-[#111827]
                  px-2
                  py-2
                  text-[#F8FAFC]
                  xs:max-w-[calc(100vw-8rem)]
                  xs:px-2.5
                  sm:max-w-[calc(100vw-9rem)]
                  sm:px-3
                  sm:py-2.5
                  md:max-w-[calc(100vw-10rem)]
                "
              >
                {/* REPLY PREVIEW */}

                {replyPreview && (
                  <div
                    className="
                      mb-2
                      max-w-full
                      overflow-hidden
                      rounded-md
                      border-l-4
                      border-[#00D9FF]
                      bg-white/10
                      px-2
                      py-1.5
                      xs:px-2.5
                    "
                  >
                    <p
                      className="
                        max-w-full
                        truncate
                        text-[10px]
                        font-semibold
                        leading-tight
                        text-[#00D9FF]
                        sm:text-[11px]
                      "
                    >
                      Replying to{' '}
                      {
                        replyPreview.senderName
                      }
                    </p>

                    <p
                      className="
                        mt-0.5
                        max-w-full
                        truncate
                        text-[11px]
                        leading-relaxed
                        text-[#CBD5E1]
                        sm:text-xs
                      "
                    >
                      {
                        replyPreview.content
                      }
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

                {/* FILE */}

                {isFileMessage && (
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
                      bg-white/5
                      px-2
                      py-2
                      text-left
                      transition-colors
                      touch-manipulation
                      xs:gap-2.5
                      xs:px-2.5
                      ${
                        content ||
                        replyPreview
                          ? 'mt-2'
                          : ''
                      }
                      ${
                        downloading
                          ? 'cursor-wait opacity-50'
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
                        className="
                          mt-0.5
                          text-[10px]
                          leading-tight
                          text-[#94A3B8]
                          sm:text-[11px]
                        "
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
                )}
              </div>

              {/* RECEIVER ACTIONS */}

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
                  sm:opacity-0
                  sm:group-hover:opacity-100
                  sm:group-focus-within:opacity-100
                  transition-opacity
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
                    className="h-3.5 w-3.5"
                  />
                </ActionButton>

                {content && (
                  <ActionButton
                    onClick={handleCopy}
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

            {/* TIMESTAMP */}

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

      {/* -------------------------------------------- */}
      {/* SENDER                                       */}
      {/* -------------------------------------------- */}

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
          {/* EMPTY ACTION SPACE */}

          <div
            className="
              flex
              w-auto
              shrink-0
              items-center
              gap-0.5
              px-0.5
              mr-1
              sm:mr-1.5
              opacity-100
              sm:opacity-0
              sm:group-hover:opacity-100
              sm:group-focus-within:opacity-100
              transition-opacity
            "
          />

          {/* MESSAGE CONTENT */}

          <div
            className="
              flex
              min-w-0
              max-w-[calc(100vw-7rem)]
              flex-col
              items-end
              xs:max-w-[calc(100vw-8rem)]
              sm:max-w-[78%]
              md:max-w-[68%]
              lg:max-w-[65%]
            "
          >
            <div
              className="
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
              "
            >
              {/* REPLY PREVIEW */}

              {replyPreview && (
                <div
                  className="
                    mb-2
                    max-w-full
                    overflow-hidden
                    rounded-md
                    border-l-4
                    border-[#0B0F14]/60
                    bg-[#0B0F14]/10
                    px-2
                    py-1.5
                    xs:px-2.5
                  "
                >
                  <p
                    className="
                      max-w-full
                      truncate
                      text-[10px]
                      font-semibold
                      leading-tight
                      text-[#0B0F14]/80
                      sm:text-[11px]
                    "
                  >
                    Replying to{' '}
                    {
                      replyPreview.senderName
                    }
                  </p>

                  <p
                    className="
                      mt-0.5
                      max-w-full
                      truncate
                      text-[11px]
                      leading-relaxed
                      text-[#0B0F14]/70
                      sm:text-xs
                    "
                  >
                    {
                      replyPreview.content
                    }
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

              {/* FILE */}

              {isFileMessage && (
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
                    bg-[#0B0F14]/10
                    px-2
                    py-2
                    text-left
                    transition-colors
                    touch-manipulation
                    xs:gap-2.5
                    xs:px-2.5
                    ${
                      content ||
                      replyPreview
                        ? 'mt-2'
                        : ''
                    }
                    ${
                      downloading
                        ? 'cursor-wait opacity-50'
                        : 'cursor-pointer hover:bg-[#0B0F14]/15 active:bg-[#0B0F14]/20'
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
                      className="
                        mt-0.5
                        text-[10px]
                        leading-tight
                        text-[#0B0F14]/70
                        sm:text-[11px]
                      "
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
              )}
            </div>

            {/* TIMESTAMP */}

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

          {/* SENDER ACTIONS */}

          <div
            className="
              flex
              shrink-0
              items-center
              gap-0.5
              px-0.5
              ml-1
              sm:ml-1.5
              opacity-100
              sm:opacity-0
              sm:group-hover:opacity-100
              sm:group-focus-within:opacity-100
              transition-opacity
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
                className="h-3.5 w-3.5"
              />
            </ActionButton>

            {content && (
              <ActionButton
                onClick={handleCopy}
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
                onClick={handleDelete}
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