"use client";

import { useState, useTransition } from "react";
import { UserMinus, Users } from "lucide-react";
import {
  addProjectMember,
  addServerMember,
  removeProjectMember,
  removeServerMember,
  setMemberRole,
  updateProjectMemberRole,
} from "@/app/actions/members";
import { Avatar } from "@/components/avatar";
import {
  Dialog,
  FormActions,
  FormError,
  IconButton,
  Select,
  useControllableOpen,
  useDialogAction,
  type Controlled,
} from "@/components/ui/dialog";
import type { OrgMember, ProjectMember, Role, ServerMember } from "@/lib/types";

function useRunner() {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = (action: () => Promise<{ error?: string }>) =>
    startTransition(async () => {
      const result = await action();
      setError(result.error ?? null);
    });
  return { pending, error, run };
}

function AddMemberForm({
  candidates,
  hiddenName,
  hiddenValue,
  action,
  children,
}: {
  candidates: OrgMember[];
  hiddenName: string;
  hiddenValue: string;
  action: Parameters<typeof useDialogAction>[0];
  children?: React.ReactNode;
}) {
  // useDialogAction sert ici juste pour l'état du formulaire ; la fenêtre parente reste ouverte
  const { state, formAction } = useDialogAction(action);
  if (candidates.length === 0) return null;

  return (
    <form key={state.done} action={formAction} className="space-y-2 border-t border-line pt-4">
      <input type="hidden" name={hiddenName} value={hiddenValue} />
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">Ajouter</p>
      <div className="flex gap-2">
        <Select name="user_id" defaultValue="" required className="min-w-0 flex-1">
          <option value="" disabled>
            Choisir une personne…
          </option>
          {candidates.map((member) => (
            <option key={member.user_id} value={member.user_id}>
              {member.display_name}
            </option>
          ))}
        </Select>
        {children}
      </div>
      <FormError state={state} />
      <div className="flex justify-end">
        <button
          type="submit"
          className="rounded-md bg-accent px-3 py-1.5 text-sm font-semibold text-accent-fg hover:brightness-110"
        >
          Ajouter
        </button>
      </div>
    </form>
  );
}

// ─── Projet ─────────────────────────────────────────────────────────────────

export function ProjectMembersDialog({
  projectId,
  members,
  orgMembers,
  ...controlled
}: {
  projectId: string;
  members: ProjectMember[];
  orgMembers: OrgMember[];
} & Controlled) {
  const [open, setOpen] = useControllableOpen(controlled);
  const { pending, error, run } = useRunner();
  const memberIds = new Set(members.map((m) => m.user_id));

  return (
    <>
      {controlled.open === undefined && (
        <IconButton title="Membres du projet" onClick={() => setOpen(true)}>
          <Users className="size-4" />
        </IconButton>
      )}
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Membres du projet"
        description="Seules les personnes affectées voient le projet (les admins voient tout)."
      >
        <div className="space-y-4">
          {error && <p className="text-sm text-danger">{error}</p>}
          <ul className="max-h-72 space-y-1 overflow-y-auto">
            {members.map((member) => (
              <li key={member.user_id} className="flex items-center gap-3 rounded-md px-1 py-1.5">
                <Avatar name={member.display_name} url={member.avatar_url} />
                <span className="min-w-0 flex-1 truncate text-sm">{member.display_name}</span>
                <Select
                  value={member.project_role}
                  disabled={pending}
                  onChange={(event) => run(() => updateProjectMemberRole(projectId, member.user_id, event.target.value))}
                  className="w-28 py-1 text-xs"
                >
                  <option value="lead">Lead</option>
                  <option value="member">Équipe</option>
                  <option value="client">Client</option>
                </Select>
                <IconButton
                  title="Retirer du projet"
                  onClick={() => run(() => removeProjectMember(projectId, member.user_id))}
                  className="size-7 hover:text-danger"
                >
                  <UserMinus className="size-4" />
                </IconButton>
              </li>
            ))}
          </ul>
          <AddMemberForm
            candidates={orgMembers.filter((m) => !memberIds.has(m.user_id))}
            hiddenName="project_id"
            hiddenValue={projectId}
            action={addProjectMember}
          >
            <Select name="project_role" defaultValue="member" className="w-28">
              <option value="member">Équipe</option>
              <option value="lead">Lead</option>
              <option value="client">Client</option>
            </Select>
          </AddMemberForm>
          <FormActions onCancel={() => setOpen(false)} submitLabel="" hideSubmit />
        </div>
      </Dialog>
    </>
  );
}

// ─── Serveur ────────────────────────────────────────────────────────────────

export function ServerMembersDialog({
  serverId,
  members,
  roles,
  orgMembers,
  canManageRoles,
  canAddMembers,
  ...controlled
}: {
  serverId: string;
  members: ServerMember[];
  roles: Role[];
  orgMembers: OrgMember[];
  canManageRoles: boolean;
  canAddMembers: boolean;
} & Controlled) {
  const [open, setOpen] = useControllableOpen(controlled);
  const { pending, error, run } = useRunner();
  const memberIds = new Set(members.map((m) => m.user_id));

  return (
    <>
      {controlled.open === undefined && (
        <IconButton title="Membres et rôles" onClick={() => setOpen(true)}>
          <Users className="size-4" />
        </IconButton>
      )}
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Membres et rôles du serveur"
        description="Admin : tous les droits sur ce serveur. Lead : gère salons, projets et membres des projets."
      >
        <div className="space-y-4">
          {error && <p className="text-sm text-danger">{error}</p>}
          <ul className="max-h-80 space-y-1 overflow-y-auto">
            {members.map((member) => (
              <li key={member.user_id} className="flex items-center gap-3 rounded-md px-1 py-1.5">
                <Avatar name={member.display_name} url={member.avatar_url} />
                <span className="min-w-0 flex-1 truncate text-sm">{member.display_name}</span>
                <div className="flex flex-wrap justify-end gap-1">
                  {roles.map((role) => {
                    const active = member.role_ids.includes(role.id);
                    return (
                      <button
                        key={role.id}
                        type="button"
                        disabled={!canManageRoles || pending}
                        onClick={() => run(() => setMemberRole(serverId, member.user_id, role.id, !active))}
                        className="rounded-full border px-2 py-0.5 text-xs transition disabled:cursor-default"
                        style={{
                          borderColor: active ? (role.color ?? "var(--muted)") : "var(--line)",
                          color: active ? (role.color ?? "var(--fg)") : "var(--faint)",
                        }}
                      >
                        {role.name}
                      </button>
                    );
                  })}
                </div>
                {canAddMembers && (
                  <IconButton
                    title="Retirer du serveur"
                    onClick={() => {
                      if (window.confirm(`Retirer ${member.display_name} du serveur et de ses projets ?`)) {
                        run(() => removeServerMember(serverId, member.user_id));
                      }
                    }}
                    className="size-7 hover:text-danger"
                  >
                    <UserMinus className="size-4" />
                  </IconButton>
                )}
              </li>
            ))}
          </ul>
          {canAddMembers && (
            <AddMemberForm
              candidates={orgMembers.filter((m) => !memberIds.has(m.user_id) && m.org_role !== "guest")}
              hiddenName="server_id"
              hiddenValue={serverId}
              action={addServerMember}
            />
          )}
          <FormActions onCancel={() => setOpen(false)} submitLabel="" hideSubmit />
        </div>
      </Dialog>
    </>
  );
}
