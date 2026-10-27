"use client";

import { useActionState } from "react";
import { acceptInvitation } from "@/app/actions/members";
import { Field, FormError, TextInput } from "@/components/ui/dialog";
import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";

export function AcceptForm({ token }: { token: string }) {
  const [state, formAction] = useActionState(acceptInvitation, {});

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      <Field label="Ton nom" hint="Affiché aux autres membres.">
        <TextInput name="display_name" required maxLength={80} autoComplete="name" autoFocus />
      </Field>
      <Field label="Mot de passe" hint="12 caractères minimum.">
        <TextInput name="password" type="password" required minLength={12} maxLength={72} autoComplete="new-password" />
      </Field>
      <Field label="Confirme le mot de passe">
        <TextInput name="confirm" type="password" required minLength={12} maxLength={72} autoComplete="new-password" />
      </Field>
      <FormError state={state} />
      <SubmitButton />
    </form>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="flex w-full items-center justify-center gap-2 rounded-md bg-accent px-4 py-2.5 text-sm font-semibold text-accent-fg hover:brightness-110 disabled:opacity-60"
    >
      {pending && <Loader2 className="size-4 animate-spin" />}
      Créer mon compte
    </button>
  );
}
