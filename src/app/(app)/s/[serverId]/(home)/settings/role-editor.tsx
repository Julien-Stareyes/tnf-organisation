"use client";

import { useActionState, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import { ChevronDown, Plus, Trash2 } from "lucide-react";
import { createRole, deleteRole, updateRole } from "@/app/actions/permissions";
import { Field, FormError, TextInput } from "@/components/ui/dialog";
import { PERMISSION_GROUPS } from "@/lib/permissions";
import type { RoleDetail } from "@/lib/types";

export function RoleEditor({ serverId, roles }: { serverId: string; roles: RoleDetail[] }) {
  return (
    <div className="space-y-3">
      <ul className="space-y-2">
        {roles.map((role) => (
          <li key={role.id}>
            <RoleRow role={role} />
          </li>
        ))}
      </ul>
      <NewRole serverId={serverId} />
    </div>
  );
}

function RoleRow({ role }: { role: RoleDetail }) {
  const [state, formAction] = useActionState(updateRole, {});
  const [deleting, startDelete] = useTransition();
  const [deleteError, setDeleteError] = useState<string | null>(null);

  return (
    <details className="group rounded-xl border border-line bg-sidebar">
      <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
        <span className="size-3 shrink-0 rounded-full" style={{ backgroundColor: role.color ?? "var(--faint)" }} />
        <span className="min-w-0 flex-1 truncate font-medium">{role.name}</span>
        {!role.is_everyone && <span className="text-xs text-faint">position {role.position}</span>}
        <ChevronDown className="size-4 text-faint transition-transform group-open:rotate-180" />
      </summary>

      <form action={formAction} className="space-y-4 border-t border-line px-4 py-4">
        <input type="hidden" name="id" value={role.id} />
        <input type="hidden" name="is_everyone" value={String(role.is_everyone)} />
        {role.is_everyone ? (
          <p className="text-sm text-muted">Droits de base de tous les membres du serveur.</p>
        ) : (
          <RoleFields role={role} />
        )}
        <PermissionChecklist value={role.permissions} />
        <FormError state={state} />
        {state.done && !state.error && <p className="text-sm text-online">Enregistré.</p>}
        <div className="flex items-center justify-between">
          {!role.is_everyone ? (
            <button
              type="button"
              disabled={deleting}
              onClick={() => {
                if (!window.confirm(`Supprimer le rôle « ${role.name} » ?`)) return;
                startDelete(async () => setDeleteError((await deleteRole(role.id)).error ?? null));
              }}
              className="flex items-center gap-1.5 text-sm text-danger hover:underline"
            >
              <Trash2 className="size-4" />
              Supprimer
            </button>
          ) : (
            <span />
          )}
          <SaveButton label="Enregistrer" />
        </div>
        {deleteError && <p className="text-sm text-danger">{deleteError}</p>}
      </form>
    </details>
  );
}

function NewRole({ serverId }: { serverId: string }) {
  const [state, formAction] = useActionState(createRole, {});

  return (
    <details className="group rounded-xl border border-dashed border-line">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm text-muted hover:text-fg [&::-webkit-details-marker]:hidden">
        <Plus className="size-4" />
        Créer un rôle
      </summary>
      <form key={state.done} action={formAction} className="space-y-4 border-t border-line px-4 py-4">
        <input type="hidden" name="server_id" value={serverId} />
        <RoleFields />
        <PermissionChecklist value={0} />
        <FormError state={state} />
        <div className="flex justify-end">
          <SaveButton label="Créer le rôle" />
        </div>
      </form>
    </details>
  );
}

function RoleFields({ role }: { role?: RoleDetail }) {
  return (
    <div className="grid gap-3 sm:grid-cols-[1fr_90px_110px]">
      <Field label="Nom">
        <TextInput name="name" required maxLength={100} defaultValue={role?.name} placeholder="Ex. Animateur 3D" />
      </Field>
      <Field label="Couleur">
        <TextInput type="color" name="color" defaultValue={role?.color ?? "#9b7bff"} className="h-[38px] cursor-pointer p-1" />
      </Field>
      <Field label="Position" hint="Admin 100, Lead 50">
        <TextInput type="number" name="position" min={1} max={10000} required defaultValue={role?.position ?? 10} />
      </Field>
      <label className="flex items-center gap-2 text-sm text-muted sm:col-span-3">
        <input type="checkbox" name="hoist" defaultChecked={role?.hoist} className="size-4 accent-[var(--accent)]" />
        Afficher séparément dans la liste des membres
      </label>
    </div>
  );
}

function PermissionChecklist({ value }: { value: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      {PERMISSION_GROUPS.map((group) => (
        <fieldset key={group.title} className="space-y-1.5">
          <legend className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">{group.title}</legend>
          {group.items.map((item) => (
            <label key={item.bit} className="flex items-start gap-2 text-sm" title={item.hint}>
              <input
                type="checkbox"
                name="permissions"
                value={item.bit}
                defaultChecked={(value & item.bit) === item.bit}
                className="mt-0.5 size-4 shrink-0 accent-[var(--accent)]"
              />
              <span className="text-fg/90">{item.label}</span>
            </label>
          ))}
        </fieldset>
      ))}
    </div>
  );
}

function SaveButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-accent-fg hover:brightness-110 disabled:opacity-60"
    >
      {pending ? "…" : label}
    </button>
  );
}
