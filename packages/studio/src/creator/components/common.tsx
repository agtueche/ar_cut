import { useRef, type ReactNode } from "react";
import { WarningCircle, X } from "@phosphor-icons/react";
import { Button, IconButton, cn } from "../../components/ui";
import { useDialogBehavior } from "../../components/ui/useDialogBehavior";
import { CreatorApiError } from "../creatorApi";
import { useI18n, type Translate } from "../i18n";

export function errorMessage(error: unknown, t: Translate): string {
  if (error instanceof CreatorApiError) {
    return error.status === 0 ? t("error.network") : error.message;
  }
  return t("error.generic");
}

export function Modal({
  title,
  onClose,
  children,
  footer,
  width = 560,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  width?: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { t } = useI18n();
  const { requestClose } = useDialogBehavior({ open: true, onClose, containerRef });
  return (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/60 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) requestClose();
      }}
    >
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="flex max-h-[90vh] w-full flex-col overflow-hidden rounded-xl border border-border-strong bg-surface shadow-2xl"
        style={{ maxWidth: width }}
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <h2 className="text-step-14 font-semibold text-text-0">{title}</h2>
          <IconButton
            aria-label={t("common.close")}
            icon={<X size={16} />}
            onClick={requestClose}
          />
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
        {footer && (
          <div className="flex justify-end gap-2 border-t border-border px-5 py-3">{footer}</div>
        )}
      </div>
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon: ReactNode;
  title: string;
  body?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border-strong px-6 py-16 text-center">
      <div className="text-text-muted">{icon}</div>
      <p className="text-step-14 font-semibold text-text-0">{title}</p>
      {body && <p className="max-w-md text-step-12 text-text-muted">{body}</p>}
      {action}
    </div>
  );
}

export function ErrorBanner({
  message,
  onRetry,
  retryLabel,
}: {
  message: string;
  onRetry?: () => void;
  retryLabel?: string;
}) {
  return (
    <div
      role="alert"
      className="flex items-center gap-3 rounded-lg border border-danger/40 bg-danger/10 px-4 py-3 text-step-12 text-danger-ink"
    >
      <WarningCircle size={18} />
      <span className="flex-1">{message}</span>
      {onRetry && (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          {retryLabel}
        </Button>
      )}
    </div>
  );
}

export function CtaButton({
  className,
  children,
  icon,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { icon?: ReactNode }) {
  return (
    <button
      type="button"
      {...props}
      className={cn(
        "inline-flex h-ctl-lg items-center gap-2 rounded-md bg-cta px-4 text-step-13 font-semibold text-on-cta",
        "enabled:hover:bg-cta-hover",
        "transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
        className,
      )}
    >
      {icon}
      {children}
    </button>
  );
}

export function Field({
  label,
  htmlFor,
  children,
  hint,
}: {
  label: string;
  htmlFor: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-step-11 font-medium text-text-muted">
        {label}
      </label>
      {children}
      {hint && <p className="text-step-11 text-text-off">{hint}</p>}
    </div>
  );
}

export const inputClass =
  "h-ctl-lg w-full rounded-md border border-border-strong bg-input px-3 text-step-13 text-text-0 outline-none placeholder:text-text-off focus:border-accent";
