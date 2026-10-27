import { LogOut } from "lucide-react";
import { signOut } from "@/app/actions/auth";
import { getMe } from "@/lib/data";
import { Avatar } from "./avatar";
import type { OrgRole } from "@/lib/types";

const ROLE_LABEL: Record<OrgRole, string> = {
  owner: "Owner",
  admin: "Admin",
  member: "Membre",
  guest: "Invité",
};

export async function UserPanel() {
  const { profile, email, orgRole } = await getMe();
  const name = profile?.display_name ?? email;

  return (
    <div className="flex items-center gap-2 border-t border-line bg-rail/60 px-2 py-2">
      <Avatar name={name} url={profile?.avatar_url ?? null} status={profile?.status ?? "online"} />
      <div className="min-w-0 flex-1 leading-tight">
        <p className="truncate text-sm font-semibold">{name}</p>
        <p className="truncate text-xs text-faint">{orgRole ? ROLE_LABEL[orgRole] : "Sans accès"}</p>
      </div>
      <form action={signOut}>
        <button
          type="submit"
          title="Se déconnecter"
          className="grid size-8 place-items-center rounded-md text-muted hover:bg-hover hover:text-fg"
        >
          <LogOut className="size-4" />
        </button>
      </form>
    </div>
  );
}
