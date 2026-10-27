"use client";

import { useState, useTransition } from "react";
import { UserX } from "lucide-react";
import { removeOrgMember, updateOrgRole } from "@/app/actions/members";
import { Avatar } from "@/components/avatar";
import { Select } from "@/components/ui/dialog";
import type { OrgMember } from "@/lib/types";

export function OrgMemberList({ members, myId }: { members: OrgMember[]; myId: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run(action: () => Promise<{ error?: string }>) {
    startTransition(async () => {
      const result = await action();
      setError(result.error ?? null);
    });
  }

  return (
    <div className="space-y-2">
      {error && <p className="text-sm text-danger">{error}</p>}
      <ul className="divide-y divide-line rounded-xl border border-line bg-sidebar">
        {members.map((member) => {
          const locked = member.org_role === "owner" || member.user_id === myId;
          return (
            <li key={member.user_id} className="flex items-center gap-3 px-4 py-3">
              <Avatar name={member.display_name} url={member.avatar_url} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {member.display_name}
                  {member.user_id === myId && <span className="ml-1.5 text-xs text-faint">(toi)</span>}
                </p>
                {member.email && <p className="truncate text-xs text-faint">{member.email}</p>}
              </div>
              {member.org_role === "owner" ? (
                <span className="w-36 text-right text-xs font-semibold text-accent">Owner</span>
              ) : (
                <Select
                  value={member.org_role}
                  disabled={locked || pending}
                  onChange={(event) => run(() => updateOrgRole(member.user_id, event.target.value))}
                  className="w-36 py-1 text-xs"
                >
                  <option value="admin">Admin</option>
                  <option value="member">Membre</option>
                  <option value="guest">Invité (client)</option>
                </Select>
              )}
              <button
                type="button"
                title="Retirer l'accès"
                disabled={locked || pending}
                onClick={() => {
                  if (window.confirm(`Retirer tout accès à ${member.display_name} ? Ses messages restent visibles.`)) {
                    run(() => removeOrgMember(member.user_id));
                  }
                }}
                className="grid size-8 place-items-center rounded text-faint hover:bg-hover hover:text-danger disabled:invisible"
              >
                <UserX className="size-4" />
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
