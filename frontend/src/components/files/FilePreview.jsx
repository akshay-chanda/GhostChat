import { useState } from 'react';
import {
  FileText,
  FileArchive,
  Image as ImageIcon,
  Download,
  X,
} from 'lucide-react';

const PREVIEWABLE_IMAGE_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
];

function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function iconFor(mimeType) {
  if (mimeType === 'application/zip') return FileArchive;
  return FileText;
}

/**
 * FilePreview
 *
 * Only ever previews image types on an explicit allowlist — anything
 * else (PDF, DOCX, ZIP, TXT) gets an icon + metadata card with a
 * download action instead of an inline render, since previewing
 * arbitrary file types in-browser is exactly how "safe" previews stop
 * being safe.
 */
export default function FilePreview({ file, onRemove }) {
  const [expanded, setExpanded] = useState(false);

  const canPreviewImage =
    PREVIEWABLE_IMAGE_TYPES.includes(file.mimeType) &&
    file.previewUrl;

  const Icon = iconFor(file.mimeType);

  if (canPreviewImage) {
    return (
      <>
        <div
          className="
            relative
            inline-block
            max-w-[min(220px,100%)]
            overflow-hidden
            rounded-lg
            border border-white/10
          "
        >
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="
              block
              w-full
              cursor-pointer
              focus:outline-none
              focus-visible:ring-2
              focus-visible:ring-[#00D9FF]
              focus-visible:ring-inset
              touch-manipulation
            "
            aria-label={`Preview ${file.originalName}`}
          >
            <img
              src={file.previewUrl}
              alt={file.originalName}
              className="
                block
                h-auto
                max-h-52
                w-full
                object-cover
              "
            />
          </button>

          <div
            className="
              flex
              min-w-0
              items-center
              justify-between
              gap-2
              bg-[#111827]
              px-2.5
              py-1.5
            "
          >
            <span
              className="
                min-w-0
                truncate
                text-[11px]
                text-[#94A3B8]
              "
            >
              {formatFileSize(file.size)}
            </span>

            {onRemove && (
              <button
                type="button"
                onClick={onRemove}
                aria-label="Remove file"
                title="Remove"
                className="
                  flex
                  min-h-8
                  min-w-8
                  shrink-0
                  items-center
                  justify-center
                  rounded-md
                  text-[#94A3B8]
                  transition-colors
                  hover:bg-white/5
                  hover:text-[#EF4444]
                  focus:outline-none
                  focus-visible:ring-2
                  focus-visible:ring-[#00D9FF]
                  touch-manipulation
                "
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            )}
          </div>
        </div>

        {/* Expanded image viewer */}
        {expanded && (
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`Image preview: ${file.originalName}`}
            className="
              fixed inset-0
              z-[80]
              flex
              items-center
              justify-center
              overflow-auto
              bg-black/80
              p-3
              backdrop-blur-sm
              xs:p-4
            "
            onClick={() => setExpanded(false)}
          >
            <button
              type="button"
              onClick={() => setExpanded(false)}
              aria-label="Close image preview"
              className="
                absolute
                right-3
                top-3
                z-10
                flex
                min-h-10
                min-w-10
                items-center
                justify-center
                rounded-full
                bg-black/50
                text-[#F8FAFC]
                transition-colors
                hover:bg-black/70
                focus:outline-none
                focus-visible:ring-2
                focus-visible:ring-[#00D9FF]
                touch-manipulation
                xs:right-4
                xs:top-4
              "
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>

            <img
              src={file.previewUrl}
              alt={file.originalName}
              onClick={(event) => event.stopPropagation()}
              className="
                max-h-[calc(100dvh-2rem)]
                max-w-[calc(100vw-1.5rem)]
                rounded-lg
                object-contain
                xs:max-h-[90vh]
                xs:max-w-[calc(100vw-2rem)]
              "
            />
          </div>
        )}
      </>
    );
  }

  return (
    <div
      className="
        flex
        w-full
        max-w-[280px]
        min-w-0
        items-center
        gap-2.5
        rounded-lg
        border border-white/10
        bg-[#111827]
        px-3
        py-2.5
        xs:gap-3
        xs:px-3.5
      "
    >
      {/* File icon */}
      <div
        className="
          flex
          h-9
          w-9
          shrink-0
          items-center
          justify-center
          rounded-lg
          bg-white/5
        "
      >
        {file.mimeType?.startsWith('image/') ? (
          <ImageIcon
            className="h-4 w-4 text-[#94A3B8]"
            aria-hidden="true"
          />
        ) : (
          <Icon
            className="h-4 w-4 text-[#94A3B8]"
            aria-hidden="true"
          />
        )}
      </div>

      {/* File information */}
      <div className="min-w-0 flex-1">
        <p
          className="
            truncate
            text-sm
            text-[#F8FAFC]
          "
          title={file.originalName}
        >
          {file.originalName}
        </p>

        <p className="text-xs text-[#94A3B8]">
          {formatFileSize(file.size)}
        </p>
      </div>

      {/* Download */}
      {file.downloadUrl && (
        <a
          href={file.downloadUrl}
          download={file.originalName}
          title="Download"
          aria-label={`Download ${file.originalName}`}
          className="
            flex
            min-h-10
            min-w-10
            shrink-0
            items-center
            justify-center
            rounded-lg
            text-[#94A3B8]
            transition-colors
            hover:bg-white/5
            hover:text-[#F8FAFC]
            focus:outline-none
            focus-visible:ring-2
            focus-visible:ring-[#00D9FF]
            touch-manipulation
          "
        >
          <Download
            className="h-4 w-4"
            aria-hidden="true"
          />
        </a>
      )}

      {/* Remove */}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          title="Remove"
          aria-label="Remove file"
          className="
            flex
            min-h-10
            min-w-10
            shrink-0
            items-center
            justify-center
            rounded-lg
            text-[#94A3B8]
            transition-colors
            hover:bg-white/5
            hover:text-[#EF4444]
            focus:outline-none
            focus-visible:ring-2
            focus-visible:ring-[#00D9FF]
            touch-manipulation
          "
        >
          <X
            className="h-4 w-4"
            aria-hidden="true"
          />
        </button>
      )}
    </div>
  );
}