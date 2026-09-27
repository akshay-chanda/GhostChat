import { FileText, X, Check, AlertCircle } from 'lucide-react';

/**
 * UploadProgress
 *
 * A single upload's status row. Deliberately stateless — it renders
 * whatever percentage/status the parent gives it rather than tracking
 * its own timer, since the parent is the one actually talking to the
 * upload endpoint and knows the real progress events.
 */
export default function UploadProgress({ fileName, percent = 0, status = 'uploading', onCancel }) {
  const isDone = status === 'done';
  const isError = status === 'error';

  return (
    <div className="flex items-center gap-3 rounded-lg border border-white/10 bg-[#111827] px-3.5 py-2.5">
      <div className="flex items-center justify-center h-9 w-9 rounded-lg bg-white/5 shrink-0">
        {isDone ? (
          <Check className="h-4 w-4 text-[#22C55E]" />
        ) : isError ? (
          <AlertCircle className="h-4 w-4 text-[#EF4444]" />
        ) : (
          <FileText className="h-4 w-4 text-[#94A3B8]" />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <p className="text-sm text-[#F8FAFC] truncate">{fileName}</p>

        {!isDone && !isError && (
          <div className="mt-1.5 h-1 rounded-full bg-white/5 overflow-hidden">
            <div
              className="h-full rounded-full bg-[#00D9FF] transition-all"
              style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
            />
          </div>
        )}

        <p className="mt-1 text-xs text-[#94A3B8]">
          {isError ? 'Upload failed' : isDone ? 'Uploaded' : `${Math.round(percent)}%`}
        </p>
      </div>

      {!isDone && (
        <button
          type="button"
          onClick={onCancel}
          title="Cancel upload"
          className="p-1.5 text-[#94A3B8] hover:text-[#EF4444] transition-colors shrink-0"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
