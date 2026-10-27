import { Avatar } from "./avatar";
import type { MemberGroup } from "@/lib/types";

export function MemberPanel({ groups }: { groups: MemberGroup[] }) {
  return (
    <aside aria-label="Membres" className="hidden w-60 shrink-0 overflow-y-auto bg-sidebar px-2 py-4 lg:block">
      {groups.map((group) => (
        <section key={group.title} className="mb-5">
          <h2 className="mb-1 px-2 text-xs font-semibold uppercase tracking-wide text-faint">
            {group.title} — {group.members.length}
          </h2>
          <ul>
            {group.members.map((member) => (
              <li
                key={member.user_id}
                className={
                  member.status === "offline"
                    ? "flex items-center gap-2.5 rounded-md px-2 py-1.5 opacity-50"
                    : "flex items-center gap-2.5 rounded-md px-2 py-1.5"
                }
              >
                <Avatar name={member.display_name} url={member.avatar_url} status={member.status} />
                <span className="truncate text-sm text-muted">{member.display_name}</span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </aside>
  );
}
