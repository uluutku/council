import { useEffect, useId, useRef } from 'react';

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// A controlled modal confirmation dialog. It traps Tab focus, closes on Escape,
// and restores focus to the element that opened it. Pending state disables the
// controls so a slow mutation cannot be confirmed twice.
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel = 'Cancel',
  tone = 'default',
  isPending = false,
  onConfirm,
  onCancel,
}) {
  const panelRef = useRef(null);
  const confirmRef = useRef(null);
  const previousFocusRef = useRef(null);
  const onCancelRef = useRef(onCancel);
  const isPendingRef = useRef(isPending);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    onCancelRef.current = onCancel;
    isPendingRef.current = isPending;
  });

  useEffect(() => {
    if (!open) return undefined;

    previousFocusRef.current = document.activeElement;
    const frame = window.requestAnimationFrame(() => confirmRef.current?.focus());

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        event.preventDefault();
        if (!isPendingRef.current) onCancelRef.current();
        return;
      }

      if (event.key !== 'Tab') return;

      const focusable = panelRef.current?.querySelectorAll(FOCUSABLE);
      if (!focusable || focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', handleKeyDown, true);

    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener('keydown', handleKeyDown, true);
      const previous = previousFocusRef.current;
      if (previous && typeof previous.focus === 'function') {
        previous.focus();
      }
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="dialog-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !isPending) onCancel();
      }}
    >
      <div
        className="dialog-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        ref={panelRef}
      >
        <h2 id={titleId}>{title}</h2>
        <div id={descriptionId} className="dialog-body">
          {description}
        </div>
        <div className="dialog-actions">
          <button
            type="button"
            className="button button--secondary"
            onClick={onCancel}
            disabled={isPending}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            ref={confirmRef}
            className={tone === 'danger' ? 'button button--danger' : 'button'}
            onClick={onConfirm}
            disabled={isPending}
          >
            {isPending ? 'Working…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
