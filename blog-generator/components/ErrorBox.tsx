"use client";

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
      <span>{message}</span>
      {onRetry && (
        <button type="button" className="btn-secondary" onClick={onRetry}>
          다시 시도
        </button>
      )}
    </div>
  );
}
