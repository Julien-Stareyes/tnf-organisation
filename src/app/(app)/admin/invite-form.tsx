"use client";

import { useActionState, useState, useTransition } from "react";
import { Check, Copy, X } from "lucide-react";
import { createInvitation, revokeInvitation, type InviteState } from "@/app/actions/members";
import { Field, FormError, Select, TextInput } from "@/components/ui/dialog";
import { useFormStatus } from "react-dom";
import type { PendingInvitation, ServerWithProjects } from "@/lib/types";

const ORG_ROLE_LABEL = { owner: "Owner", admin: "Admin", member: "Membre", guest: "Invité (client)" } as const;

export function InviteForm({ servers }: { servers: ServerWithProjects[] }) {
  const [state, formAction] = useActionState<InviteState, FormData>(createInvitation, {});

  return (
    <div className="space-y-4">
      {state.link && <InviteResult state={state} />}

      <form key={state.done} action={formAction} className="space-y-5 rounded-xl border border-line bg-sidebar p-5">
        <div className="grid gap-3 sm:grid-cols-[1fr_200px]">
          <Field label="E-mail">
            <TextInput name="email" type="email" required placeholder="prenom@thenewface.io" />
          </Field>
          <Field label="Statut">
            <Select name="org_role" defaultValue="member">
              <option value="member">{ORG_ROLE_LABEL.member}</option>
              <option value="admin">{ORG_ROLE_LABEL.admin}</option>
              <option value="guest">{ORG_ROLE_LABEL.guest}</option>
            </Select>
          </Field>
        </div>

        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Accès</p>
          {servers.map((server) => (
            <fieldset key={server.id} className="rounded-lg border border-line p-3">
              <label className="flex items-center gap-2 text-sm font-medium">
                <input type="checkbox" name="server_ids" value={server.id} className="size-4 accent-[var(--accent)]" />
                {server.name}
                <span className="text-xs font-normal text-faint">— salons généraux du serveur</span>
              </label>
              {server.projects.length > 0 && (
                <ul className="mt-2 space-y-1.5 pl-6">
                  {server.projects.map((project) => (
                    <li key={project.id} className="flex items-center gap-2 text-sm">
                      <span
                        className="size-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: project.color ?? "var(--faint)" }}
                      />
                      <span className="min-w-0 flex-1 truncate text-muted">{project.name}</span>
                      <Select name={`project:${project.id}`} defaultValue="" className="w-36 py-1 text-xs">
                        <option value="">Non affecté</option>
                        <option value="member">Équipe</option>
                        <option value="lead">Lead</option>
                        <option value="client">Client</option>
                      </Select>
                    </li>
                  ))}
                </ul>
              )}
            </fieldset>
          ))}
        </div>

        <FormError state={state} />
        <div className="flex justify-end">
          <SubmitButton />
        </div>
      </form>
    </div>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-accent-fg hover:brightness-110 disabled:opacity-60"
    >
      {pending ? "Envoi…" : "Envoyer l'invitation"}
    </button>
  );
}

function InviteResult({ state }: { state: InviteState }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(state.link!);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="rounded-xl border border-online/40 bg-online/10 p-4 text-sm">
      <p className="font-medium text-fg">
        {state.emailSent
          ? `Invitation envoyée par e-mail à ${state.email}.`
          : `Invitation créée pour ${state.email}. L'envoi d'e-mail n'est pas configuré : partage ce lien toi-même.`}
      </p>
      <div className="mt-3 flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded-md bg-rail px-3 py-2 text-xs text-muted">{state.link}</code>
        <button
          type="button"
          onClick={copy}
          className="flex items-center gap-1.5 rounded-md bg-elevated px-3 py-2 text-xs font-medium hover:bg-hover"
        >
          {copied ? <Check className="size-3.5 text-online" /> : <Copy className="size-3.5" />}
          {copied ? "Copié" : "Copier"}
        </button>
      </div>
      <p className="mt-2 text-xs text-faint">Ce lien ne sera plus affiché ensuite.</p>
    </div>
  );
}

const dateFormat = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short" });

export function InvitationList({ invitations }: { invitations: PendingInvitation[] }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="space-y-2">
      {error && <p className="text-sm text-danger">{error}</p>}
      <ul className="divide-y divide-line rounded-xl border border-line bg-sidebar">
        {invitations.map((invitation) => (
          <li key={invitation.id} className="flex items-center gap-3 px-4 py-3 text-sm">
            <span className="min-w-0 flex-1 truncate">{invitation.email}</span>
            <span className="text-xs text-faint">{ORG_ROLE_LABEL[invitation.org_role]}</span>
            <span suppressHydrationWarning className="text-xs text-faint">
              expire le {dateFormat.format(new Date(invitation.expires_at))}
            </span>
            <button
              type="button"
              title="Révoquer"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const result = await revokeInvitation(invitation.id);
                  setError(result.error ?? null);
                })
              }
              className="grid size-7 place-items-center rounded text-faint hover:bg-hover hover:text-danger"
            >
              <X className="size-4" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
