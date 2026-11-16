"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useFormStatus } from "react-dom";
import { Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { FormState } from "@/app/actions/structure";

export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(event) => event.target === ref.current && onClose()}
      className="m-auto w-[min(460px,calc(100vw-32px))] rounded-xl border border-line bg-sidebar p-0 text-fg shadow-2xl backdrop:bg-black/70"
    >
      {open && (
        <div className="p-6">
          <div className="mb-5 flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold">{title}</h2>
              {description && <p className="mt-1 text-sm text-muted">{description}</p>}
            </div>
            <button type="button" onClick={onClose} title="Fermer" className="text-faint hover:text-fg">
              <X className="size-5" />
            </button>
          </div>
          {children}
        </div>
      )}
    </dialog>
  );
}

/** Fenêtre pilotée de l'extérieur (menu « ⋯ ») : open + onOpenChange ; sinon elle gère son propre état */
export type Controlled = { open?: boolean; onOpenChange?: (open: boolean) => void };

export function useControllableOpen({ open, onOpenChange }: Controlled) {
  const [inner, setInner] = useState(false);
  const controlled = open !== undefined;
  return [controlled ? open : inner, controlled ? (onOpenChange ?? (() => {})) : setInner, controlled] as const;
}

/** Ouvre/ferme une fenêtre et la referme (avec navigation éventuelle) quand l'action réussit. */
export function useDialogAction(
  action: (state: FormState, formData: FormData) => Promise<FormState>,
  controlled: Controlled = {},
) {
  const router = useRouter();
  const [open, setOpen] = useControllableOpen(controlled);
  const [state, formAction] = useActionState(action, {});
  const handled = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (!state.done || handled.current === state.done) return;
    handled.current = state.done;
    setOpen(false);
    if (state.href) router.push(state.href);
  }, [state, router, setOpen]);

  return { open, setOpen, state, formAction };
}

const controlClass =
  "w-full rounded-md border border-line bg-rail px-3 py-2 text-sm text-fg outline-none placeholder:text-faint focus:border-accent";

export function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</span>
      {children}
      {hint && <span className="block text-xs text-faint">{hint}</span>}
    </label>
  );
}

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cn(controlClass, props.className)} />;
}

export function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea rows={3} {...props} className={cn(controlClass, "resize-none", props.className)} />;
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cn(controlClass, props.className)} />;
}

export function FormError({ state }: { state: FormState }) {
  return state.error ? <p className="text-sm text-danger">{state.error}</p> : null;
}

export function FormActions({
  onCancel,
  submitLabel,
  hideSubmit,
}: {
  onCancel: () => void;
  submitLabel: string;
  hideSubmit?: boolean;
}) {
  return (
    <div className="flex justify-end gap-2 pt-2">
      <button type="button" onClick={onCancel} className="rounded-md px-4 py-2 text-sm text-muted hover:text-fg">
        {hideSubmit ? "Fermer" : "Annuler"}
      </button>
      {!hideSubmit && <SubmitButton label={submitLabel} />}
    </div>
  );
}

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="flex items-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-semibold text-accent-fg hover:brightness-110 disabled:opacity-60"
    >
      {pending && <Loader2 className="size-4 animate-spin" />}
      {label}
    </button>
  );
}

export function IconButton({
  title,
  onClick,
  children,
  className,
}: {
  title: string;
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      className={cn("grid size-6 place-items-center rounded text-faint hover:bg-hover hover:text-fg", className)}
    >
      {children}
    </button>
  );
}
