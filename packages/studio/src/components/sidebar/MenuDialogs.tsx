// Centred windows opened from a right-click menu, as in video editors: a menu
// stays a list of choices; anything to read, type or confirm opens here.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Modal, CtaButton, inputClass } from "../../creator/components/common";
import { Button } from "../ui";
import { useStudioLabel } from "../../creator/useStudioLabel";

export function MenuDialog({
  title,
  onClose,
  children,
  footer,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <Modal title={title} onClose={onClose} width={420} footer={footer}>
      {children}
    </Modal>
  );
}

export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  onConfirm,
  onClose,
}: {
  title: string;
  message: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const label = useStudioLabel();
  return (
    <MenuDialog
      title={title}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose}>
            {label("Cancel", "Annuler")}
          </Button>
          <button
            type="button"
            autoFocus
            onClick={() => {
              onConfirm();
              onClose();
            }}
            className="inline-flex h-ctl-lg items-center rounded-md bg-danger px-4 text-step-13 font-semibold text-on-danger hover:brightness-95"
          >
            {confirmLabel}
          </button>
        </>
      }
    >
      <div className="text-step-13 text-text-1">{message}</div>
    </MenuDialog>
  );
}

/** One text field: rename, new folder… `onSubmit` may reject with a message to show. */
export function PromptDialog({
  title,
  fieldLabel,
  initial = "",
  submitLabel,
  validate,
  onSubmit,
  onClose,
}: {
  title: string;
  fieldLabel: string;
  initial?: string;
  submitLabel: string;
  validate?: (value: string) => string | null;
  onSubmit: (value: string) => void | Promise<void>;
  onClose: () => void;
}) {
  const label = useStudioLabel();
  const [value, setValue] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  // The window focuses itself when it opens; take the focus back just after
  // and select the name without its extension, as the Finder does.
  useEffect(() => {
    const id = window.setTimeout(() => {
      const input = inputRef.current;
      if (!input) return;
      input.focus();
      const dot = input.value.lastIndexOf(".");
      input.setSelectionRange(0, dot > 0 ? dot : input.value.length);
    }, 0);
    return () => window.clearTimeout(id);
  }, []);
  const submit = async () => {
    const trimmed = value.trim();
    if (!trimmed || busy) return;
    const invalid = validate?.(trimmed) ?? null;
    if (invalid) {
      setError(invalid);
      return;
    }
    setBusy(true);
    try {
      await onSubmit(trimmed);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };
  return (
    <MenuDialog
      title={title}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose}>
            {label("Cancel", "Annuler")}
          </Button>
          <CtaButton disabled={!value.trim() || busy} onClick={() => void submit()}>
            {submitLabel}
          </CtaButton>
        </>
      }
    >
      <label className="flex flex-col gap-1.5 text-step-12 text-text-muted">
        {fieldLabel}
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") void submit();
          }}
          className={inputClass}
        />
      </label>
      {error && <p className="mt-2 text-step-12 text-danger-ink">{error}</p>}
    </MenuDialog>
  );
}
