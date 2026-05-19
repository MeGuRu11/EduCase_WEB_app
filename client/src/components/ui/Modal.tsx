import { useEffect, useLayoutEffect, useRef, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/utils/cn';

export interface ModalProps {
  open: boolean;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
  className?: string;
  initialFocusRef?: RefObject<HTMLElement | null>;
}

const focusableSelector = [
  'button:not([disabled]):not([data-modal-close])',
  '[href]',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export function Modal({ children, className, footer, initialFocusRef, onClose, open, title }: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useLayoutEffect(() => {
    if (!open) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    if (initialFocusRef?.current) {
      initialFocusRef.current.focus();
    } else {
      const first = dialogRef.current?.querySelector<HTMLElement>(focusableSelector);
      first?.focus();
    }

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [initialFocusRef, open]);

  useEffect(() => {
    if (!open) return undefined;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onCloseRef.current();
        return;
      }

      if (event.key !== 'Tab') return;
      const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(focusableSelector) ?? []);
      if (!focusable.length) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-fg/50 p-6 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        data-modal-dialog
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        className={cn('w-full max-w-lg rounded-xl bg-bg p-6 shadow-lg', className)}
      >
        <div className="mb-5 flex items-start justify-between gap-4">
          <h2 id="modal-title" className="text-xl font-semibold text-fg">
            {title}
          </h2>
          <button
            type="button"
            className="focus-ring rounded p-1 text-fg-muted transition-colors hover:bg-lavender/30 hover:text-fg"
            onClick={onClose}
            aria-label="Закрыть"
            data-modal-close
            tabIndex={-1}
          >
            ×
          </button>
        </div>
        <div>{children}</div>
        {footer ? <div className="mt-6 flex justify-end gap-3">{footer}</div> : null}
      </div>
    </div>,
    document.body,
  );
}

export default Modal;
