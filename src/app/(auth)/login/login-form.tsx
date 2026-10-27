"use client";

import { useActionState, useState } from "react";
import { Loader2 } from "lucide-react";
import { sendMagicLink, signInWithPassword, type LoginState } from "./actions";

const inputClass =
  "w-full rounded-md border border-line bg-rail px-3 py-2.5 text-sm text-fg outline-none placeholder:text-faint focus:border-accent";

export function LoginForm({ next, linkError }: { next?: string; linkError?: boolean }) {
  const [mode, setMode] = useState<"password" | "magic">("password");
  const [passwordState, passwordAction, passwordPending] = useActionState<LoginState, FormData>(
    signInWithPassword,
    linkError ? { error: "Ce lien de connexion est invalide ou a expiré." } : {},
  );
  const [magicState, magicAction, magicPending] = useActionState<LoginState, FormData>(sendMagicLink, {});

  const state = mode === "password" ? passwordState : magicState;
  const pending = mode === "password" ? passwordPending : magicPending;

  return (
    <form action={mode === "password" ? passwordAction : magicAction} className="space-y-4">
      <input type="hidden" name="next" value={next ?? ""} />

      <label className="block space-y-1.5">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted">E-mail</span>
        <input name="email" type="email" required autoComplete="email" className={inputClass} />
      </label>

      {mode === "password" && (
        <label className="block space-y-1.5">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted">Mot de passe</span>
          <input name="password" type="password" required autoComplete="current-password" className={inputClass} />
        </label>
      )}

      {state.error && <p className="text-sm text-danger">{state.error}</p>}
      {state.info && <p className="text-sm text-accent">{state.info}</p>}

      <button
        type="submit"
        disabled={pending}
        className="flex w-full items-center justify-center gap-2 rounded-md bg-accent px-4 py-2.5 text-sm font-semibold text-accent-fg transition hover:brightness-110 disabled:opacity-60"
      >
        {pending && <Loader2 className="size-4 animate-spin" />}
        {mode === "password" ? "Se connecter" : "Recevoir un lien de connexion"}
      </button>

      <button
        type="button"
        onClick={() => setMode(mode === "password" ? "magic" : "password")}
        className="w-full text-center text-sm text-muted hover:text-fg"
      >
        {mode === "password" ? "Se connecter avec un lien magique" : "Se connecter avec un mot de passe"}
      </button>
    </form>
  );
}
