import { useState, useRef, useCallback } from 'react';
import { UploadCloud } from 'lucide-react';

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB
const BLOCKED_EXTENSIONS = [
  '.exe',
  '.bat',
  '.cmd',
  '.ps1',
  '.scr',
  '.js',
  '.vbs',
  '.msi',
  '.jar',
];

/**
 * FileUpload
 *
 * Client-side validation here is purely for fast feedback — it is
 * NOT the security boundary. The server re-validates size, MIME
 * type, and extension independently and must never trust what this
 * component decided.
 */
export default function FileUpload({
  onFileSelected,
  disabled = false,
}) {
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState(null);
  const inputRef = useRef(null);

  const validate = (file) => {
    const ext = `.${file.name.split('.').pop()?.toLowerCase()}`;

    if (BLOCKED_EXTENSIONS.includes(ext)) {
      return 'This file type isn’t allowed.';
    }

    if (file.size > MAX_FILE_SIZE) {
      return 'File is larger than the 20MB limit.';
    }

    return null;
  };

  const handleFile = useCallback(
    (file) => {
      if (!file) return;

      const validationError = validate(file);

      if (validationError) {
        setError(validationError);
        return;
      }

      setError(null);
      onFileSelected(file);
    },
    [onFileSelected]
  );

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (disabled) return;

    handleFile(e.dataTransfer.files?.[0]);
  };

  const handleKeyDown = (e) => {
    if (disabled) return;

    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      inputRef.current?.click();
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();

    if (!disabled) {
      setDragActive(true);
    }
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
  };

  const handleChange = (e) => {
    handleFile(e.target.files?.[0]);

    // Allows selecting the same file again after validation/removal.
    e.target.value = '';
  };

  return (
    <div className="w-full min-w-0">
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => {
          if (!disabled) {
            inputRef.current?.click();
          }
        }}
        onKeyDown={handleKeyDown}
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-disabled={disabled}
        aria-describedby={error ? 'file-upload-error' : undefined}
        className={`
          flex
          min-h-36
          w-full
          min-w-0
          flex-col
          items-center
          justify-center
          gap-2
          rounded-xl
          border-2
          border-dashed
          px-4
          py-8
          text-center
          transition-colors
          select-none
          touch-manipulation
          xs:min-h-40
          xs:px-6
          xs:py-10
          ${
            disabled
              ? 'cursor-not-allowed border-white/5 opacity-50'
              : dragActive
                ? 'cursor-copy border-[#00D9FF] bg-[#00D9FF]/5'
                : 'cursor-pointer border-white/10 hover:border-white/25 hover:bg-white/[0.02]'
          }
          focus:outline-none
          focus-visible:ring-2
          focus-visible:ring-[#00D9FF]
          focus-visible:ring-offset-2
          focus-visible:ring-offset-[#0B0F14]
        `}
      >
        <div
          className="
            flex
            h-10
            w-10
            shrink-0
            items-center
            justify-center
            rounded-full
            bg-white/5
          "
        >
          <UploadCloud
            className="h-5 w-5 text-[#94A3B8] sm:h-6 sm:w-6"
            aria-hidden="true"
          />
        </div>

        <p className="max-w-full break-words text-sm text-[#F8FAFC]">
          Drop a file here, or{' '}
          <span className="text-[#00D9FF]">browse</span>
        </p>

        <p className="text-xs text-[#94A3B8]">
          Up to 20MB
        </p>

        <input
          ref={inputRef}
          type="file"
          className="hidden"
          disabled={disabled}
          onChange={handleChange}
          tabIndex={-1}
        />
      </div>

      {error && (
        <p
          id="file-upload-error"
          role="alert"
          className="
            mt-2
            break-words
            text-xs
            leading-relaxed
            text-[#EF4444]
          "
        >
          {error}
        </p>
      )}
    </div>
  );
}