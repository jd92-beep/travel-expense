import { useEffect, useRef, type ReactNode } from "react";

/**
 * Shared confirm/cancel gate on the .confirm-dialog CSS contract (see
 * components.css). Modal via showModal, Escape and backdrop click cancel,
 * the cancel button takes initial focus, and focus returns to the invoking
 * control on close. Callers own the open state and both callbacks.
 */
export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  cancelLabel,
  danger = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  children?: ReactNode;
  confirmLabel: string;
  cancelLabel: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      restoreFocusRef.current = document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
      dialog.showModal();
      cancelRef.current?.focus();
    }
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      className="confirm-dialog"
      data-augmented-ui="tl-clip br-clip border"
      aria-labelledby="confirm-dialog-title"
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
      onClose={() => {
        onCancel();
        restoreFocusRef.current?.focus();
        restoreFocusRef.current = null;
      }}
      onClick={(event) => {
        // Top-layer clicks on ::backdrop target the dialog element itself.
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <header>
        <h2 id="confirm-dialog-title">{title}</h2>
      </header>
      {children && <div className="confirm-dialog-body">{children}</div>}
      <div className="confirm-dialog-actions">
        <button
          ref={cancelRef}
          className="button secondary"
          type="button"
          onClick={onCancel}
        >
          {cancelLabel}
        </button>
        <button
          className={danger ? "button danger" : "button primary"}
          type="button"
          onClick={onConfirm}
        >
          {confirmLabel}
        </button>
      </div>
    </dialog>
  );
}
